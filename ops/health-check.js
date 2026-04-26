#!/usr/bin/env node
'use strict';

const { evaluateExpression } = require('./cdp-client');

const env = process.env;
const CDP_URL = env.ST_CDP_URL || 'http://127.0.0.1:9222';
const APP_URL = env.ST_APP_URL || '';
const STALE_MINUTES = Number(env.ST_HEALTH_STALE_MINUTES || 180);
const SEND_TELEGRAM = env.ST_HEALTH_TELEGRAM === '1';

function redactedChat(chatId) {
  const raw = String(chatId || '');
  if (!raw) return '';
  return `${raw.slice(0, 4)}…${raw.slice(-3)}`;
}

async function sendTelegram(message) {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  if (!SEND_TELEGRAM || !token || !chatId) return { skipped: true };
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
  if (!res.ok) throw new Error(`Telegram health alert failed: HTTP ${res.status}`);
  return { ok: true, chatId: redactedChat(chatId) };
}

async function main() {
  const staleMsLimit = Math.max(1, STALE_MINUTES) * 60 * 1000;
  const expression = `(() => {
    const now = Date.now();
    const scanMeta = window.ST?.scanMeta || {};
    const scheduler = scanMeta.scheduler || {};
    const lastScanTs = Number(scanMeta.lastScanTs || scanMeta.lastScan || scheduler.lastAutoRunAt || 0);
    const staleMs = lastScanTs > 0 ? now - lastScanTs : null;
    const audit = (() => {
      try { return window.RUNTIME_AUDIT?.summarizeLatest?.() || window.__LAST_RUNTIME_AUDIT__ || null; }
      catch { return null; }
    })();
    return {
      ok: !!window.ST && !!window.DB,
      href: location.href,
      now,
      appReady: !!window.ST && !!window.DB && !!window.SMART_SCAN,
      scannerRunning: !!window.__SCANNING__ || !!window.SMART_SCAN?.isRunning?.(),
      schedulerEnabled: !!scheduler.enabled,
      schedulerHours: Array.isArray(scheduler.hours) ? scheduler.hours : [],
      lastAutoRunAt: Number(scheduler.lastAutoRunAt || 0),
      lastScanTs,
      staleMs,
      scanStatus: scanMeta.status || 'unknown',
      scanTruthBasis: scanMeta.scanTruthBasis || '',
      coins: Array.isArray(scanMeta.coins) ? scanMeta.coins.length : 0,
      deployable: Array.isArray(scanMeta.deployableTop3) ? scanMeta.deployableTop3.length : 0,
      runtimeAudit: audit,
    };
  })()`;

  const health = await evaluateExpression(expression, { cdpUrl: CDP_URL, appUrl: APP_URL });
  const stale = !health?.lastScanTs || Number(health.staleMs || 0) > staleMsLimit;
  const ok = !!health?.appReady && !stale;
  const output = {
    ok,
    stale,
    staleLimitMinutes: STALE_MINUTES,
    checkedAt: new Date().toISOString(),
    health,
  };

  console.log(JSON.stringify(output, null, 2));

  if (!ok) {
    await sendTelegram([
      '🚨 <b>SystemTrader VPS Health Warning</b>',
      `Status: <b>${health?.appReady ? 'STALE' : 'APP_NOT_READY'}</b>`,
      `Last scan: <code>${health?.lastScanTs ? new Date(health.lastScanTs).toISOString() : 'none'}</code>`,
      `Stale limit: <code>${STALE_MINUTES}m</code>`,
      `URL: <code>${health?.href || APP_URL || 'unknown'}</code>`,
    ].join('\n')).catch(err => {
      console.error('[health-check] Telegram health alert failed:', err.message);
    });
    process.exitCode = 2;
  }
}

main().catch(err => {
  console.error('[health-check] failed:', err.message);
  sendTelegram([
    '🚨 <b>SystemTrader VPS Health Check Failed</b>',
    `<code>${String(err.message || err).slice(0, 500)}</code>`,
  ].join('\n')).catch(() => {});
  process.exitCode = 1;
});
