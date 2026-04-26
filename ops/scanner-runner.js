#!/usr/bin/env node
'use strict';

const fs = require('fs/promises');
const path = require('path');
const { evaluateExpression } = require('./cdp-client');

const env = process.env;
const CDP_URL = env.ST_CDP_URL || 'http://127.0.0.1:9222';
const APP_URL = env.ST_APP_URL || '';
const RUN_DIR = env.ST_RUN_DIR || '/var/lib/systemtrader/run';
const LOCK_FILE = env.ST_RUNNER_LOCK_FILE || path.join(RUN_DIR, 'scanner-runner.lock');
const SEND_TELEGRAM = env.ST_RUNNER_TELEGRAM === '1';
const SCAN_TIMEOUT_MS = Number(env.ST_RUNNER_SCAN_TIMEOUT_MS || 120000);

function nowIso() {
  return new Date().toISOString();
}

function stripLargeCoinFields(scanMeta) {
  if (!scanMeta || typeof scanMeta !== 'object') return {};
  return {
    lastScan: scanMeta.lastScan || null,
    lastScanId: scanMeta.lastScanId || '',
    lastScanTs: scanMeta.lastScanTs || 0,
    source: scanMeta.source || '',
    lastScanSource: scanMeta.lastScanSource || '',
    lastScanTrigger: scanMeta.lastScanTrigger || '',
    scanTruthBasis: scanMeta.scanTruthBasis || '',
    status: scanMeta.status || '',
    durationMs: scanMeta.durationMs || 0,
    executionBreakdown: scanMeta.executionBreakdown || {},
    executionQualifiedCount: scanMeta.executionQualifiedCount || 0,
    deployableSymbols: Array.isArray(scanMeta.deployableTop3) ? scanMeta.deployableTop3.map(c => c?.symbol).filter(Boolean) : [],
    technicalSymbols: Array.isArray(scanMeta.technicalTop3) ? scanMeta.technicalTop3.map(c => c?.symbol).filter(Boolean) : [],
    portfolio: scanMeta.portfolio || {},
    cache: scanMeta.cache || {},
    regime: scanMeta.regime || {},
    metaCounts: {
      coins: Array.isArray(scanMeta.coins) ? scanMeta.coins.length : 0,
      deployableTop3: Array.isArray(scanMeta.deployableTop3) ? scanMeta.deployableTop3.length : 0,
      technicalTop3: Array.isArray(scanMeta.technicalTop3) ? scanMeta.technicalTop3.length : 0,
    },
  };
}

async function writeJson(file, payload) {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  await fs.writeFile(file, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
}

async function acquireLock() {
  await fs.mkdir(path.dirname(LOCK_FILE), { recursive: true, mode: 0o700 });
  try {
    const handle = await fs.open(LOCK_FILE, 'wx', 0o600);
    await handle.writeFile(JSON.stringify({ pid: process.pid, at: nowIso() }));
    return async () => {
      await handle.close().catch(() => {});
      await fs.unlink(LOCK_FILE).catch(() => {});
    };
  } catch (err) {
    if (err.code === 'EEXIST') throw new Error(`scanner_runner_lock_active:${LOCK_FILE}`);
    throw err;
  }
}

async function sendTelegram(message) {
  if (!SEND_TELEGRAM) return { skipped: true };
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return { skipped: true, reason: 'telegram_env_missing' };
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });
  if (!res.ok) throw new Error(`runner_telegram_http_${res.status}`);
  return { ok: true };
}

async function runScan() {
  const expression = `(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const waitFor = async (pred, ms = 30000) => {
      const start = Date.now();
      while (Date.now() - start < ms) {
        try { if (pred()) return true; } catch {}
        await sleep(250);
      }
      return false;
    };
    const ready = await waitFor(() => window.ST && window.DB && window.SMART_SCAN && typeof window.runAISmartScanner === 'function');
    if (!ready) throw new Error('app_runtime_not_ready');
    if (window.SMART_SCAN.isRunning?.() || window.__SCANNING__) return { skipped: true, reason: 'scan_lock' };
    const startedAt = Date.now();
    const result = await Promise.race([
      window.SMART_SCAN.trigger('auto', 'systemd_timer'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('scan_timeout_${SCAN_TIMEOUT_MS}ms')), ${SCAN_TIMEOUT_MS}))
    ]);
    await sleep(500);
    const scanMeta = window.ST?.scanMeta || {};
    const audit = (() => {
      try { return window.RUNTIME_AUDIT?.summarizeLatest?.() || window.__LAST_RUNTIME_AUDIT__ || null; }
      catch { return null; }
    })();
    return {
      ok: !result?.skipped,
      skipped: !!result?.skipped,
      reason: result?.reason || '',
      startedAt,
      finishedAt: Date.now(),
      durationMs: Date.now() - startedAt,
      result: result ? {
        coins: Array.isArray(result.coins) ? result.coins.length : 0,
        top3: Array.isArray(result.top3) ? result.top3.map(c => c?.symbol).filter(Boolean) : [],
        durationMs: result.durationMs || 0,
        timings: result.timings || {},
      } : null,
      scanMeta,
      runtimeAudit: audit,
      perfBudget: window.__LAST_SCAN_PERF_BUDGET__ || null,
      quality: window.__LAST_SCAN_QUALITY_SUMMARY__ || null,
      contract: window.__LAST_SCAN_CONTRACT_SUMMARY__ || null,
    };
  })()`;

  return evaluateExpression(expression, { cdpUrl: CDP_URL, appUrl: APP_URL });
}

function summaryLine(payload) {
  const meta = payload.scanMeta || {};
  const deployable = Array.isArray(meta.deployableTop3) ? meta.deployableTop3 : [];
  const symbols = deployable.map(c => c?.symbol).filter(Boolean).join(', ') || 'none';
  const basis = meta.scanTruthBasis || 'unknown';
  return `deployable=${deployable.length} symbols=${symbols} basis=${basis}`;
}

async function main() {
  const release = await acquireLock();
  try {
    const raw = await runScan();
    const payload = {
      ok: !!raw?.ok,
      skipped: !!raw?.skipped,
      reason: raw?.reason || '',
      checkedAt: nowIso(),
      runner: {
        source: 'ops/scanner-runner.js',
        cdpUrl: CDP_URL,
        appUrl: APP_URL,
        scanTimeoutMs: SCAN_TIMEOUT_MS,
      },
      result: raw?.result || null,
      scanMeta: stripLargeCoinFields(raw?.scanMeta),
      perfBudget: raw?.perfBudget || null,
      quality: raw?.quality || null,
      contract: raw?.contract || null,
    };
    await writeJson(path.join(RUN_DIR, 'last_scan.json'), payload);
    await writeJson(path.join(RUN_DIR, 'runtime_audit.json'), raw?.runtimeAudit || {});
    await fs.unlink(path.join(RUN_DIR, 'last_error.json')).catch(() => {});

    const line = summaryLine(raw || {});
    console.log(JSON.stringify({ ok: true, skipped: payload.skipped, line, file: path.join(RUN_DIR, 'last_scan.json') }, null, 2));

    if (!payload.skipped && SEND_TELEGRAM) {
      const deployableCount = payload.scanMeta?.metaCounts?.deployableTop3 || 0;
      if (deployableCount > 0) {
        await sendTelegram(`✅ <b>SystemTrader Runner Scan Complete</b>\n<code>${line}</code>`).catch(err => console.error('[scanner-runner] telegram:', err.message));
      } else if (env.ST_RUNNER_NOTIFY_ZERO_ACTIONABLE === '1') {
        await sendTelegram(`ℹ️ <b>SystemTrader Runner Scan Complete</b>\nNo deployable candidates.\n<code>${line}</code>`).catch(err => console.error('[scanner-runner] telegram:', err.message));
      }
    }
  } catch (err) {
    const payload = {
      ok: false,
      checkedAt: nowIso(),
      error: String(err?.message || err),
      stack: String(err?.stack || '').slice(0, 4000),
      runner: {
        source: 'ops/scanner-runner.js',
        cdpUrl: CDP_URL,
        appUrl: APP_URL,
        scanTimeoutMs: SCAN_TIMEOUT_MS,
      },
    };
    await writeJson(path.join(RUN_DIR, 'last_error.json'), payload);
    await sendTelegram([
      '🚨 <b>SystemTrader Runner Failed</b>',
      `<code>${payload.error.slice(0, 500)}</code>`,
    ].join('\n')).catch(() => {});
    console.error(JSON.stringify(payload, null, 2));
    process.exitCode = 1;
  } finally {
    await release();
  }
}

main();
