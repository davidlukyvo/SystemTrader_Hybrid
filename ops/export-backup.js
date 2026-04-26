#!/usr/bin/env node
'use strict';

const fs = require('fs/promises');
const path = require('path');
const { evaluateExpression } = require('./cdp-client');

const env = process.env;
const CDP_URL = env.ST_CDP_URL || 'http://127.0.0.1:9222';
const APP_URL = env.ST_APP_URL || '';
const BACKUP_DIR = env.ST_BACKUP_DIR || '/var/backups/systemtrader';
const KEEP_DAYS = Number(env.ST_BACKUP_KEEP_DAYS || 30);

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function containsSecret(serialized) {
  const known = [env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID]
    .map(v => String(v || '').trim())
    .filter(Boolean);
  if (known.some(secret => serialized.includes(secret))) return true;
  if (/botToken"\s*:\s*"[^"]{8,}/i.test(serialized)) return true;
  if (/chatId"\s*:\s*"-?\d{6,}"/i.test(serialized)) return true;
  if (/\d{6,}:[A-Za-z0-9_-]{20,}/.test(serialized)) return true;
  return false;
}

async function pruneOldBackups(dir) {
  if (!Number.isFinite(KEEP_DAYS) || KEEP_DAYS <= 0) return;
  const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000;
  let entries = [];
  try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
  await Promise.all(entries
    .filter(entry => entry.isFile() && /^systemtrader-backup-.*\.json$/.test(entry.name))
    .map(async entry => {
      const file = path.join(dir, entry.name);
      const stat = await fs.stat(file).catch(() => null);
      if (stat && stat.mtimeMs < cutoff) await fs.unlink(file).catch(() => {});
    }));
}

async function main() {
  const expression = `(async () => {
    if (!window.DB?.exportAll) throw new Error('DB.exportAll unavailable');
    const backup = await window.DB.exportAll();
    backup.exportContext = {
      source: 'vps_export_backup',
      href: location.href,
      exportedBy: 'ops/export-backup.js',
      exportedAtIso: new Date().toISOString(),
      sanitizedSecrets: true,
    };
    return backup;
  })()`;

  const backup = await evaluateExpression(expression, { cdpUrl: CDP_URL, appUrl: APP_URL });
  const serialized = JSON.stringify(backup, null, 2);
  if (containsSecret(serialized)) {
    throw new Error('Refusing to write backup: Telegram secret-like value detected after export redaction');
  }

  await fs.mkdir(BACKUP_DIR, { recursive: true, mode: 0o700 });
  const file = path.join(BACKUP_DIR, `systemtrader-backup-${stamp()}.json`);
  await fs.writeFile(file, serialized, { mode: 0o600 });
  await pruneOldBackups(BACKUP_DIR);
  console.log(JSON.stringify({
    ok: true,
    file,
    bytes: Buffer.byteLength(serialized),
    scans: Array.isArray(backup.scans) ? backup.scans.length : 0,
    signals: Array.isArray(backup.signals) ? backup.signals.length : 0,
    trades: Array.isArray(backup.trades) ? backup.trades.length : 0,
    outcomes: Array.isArray(backup.outcomes) ? backup.outcomes.length : 0,
    settings: Array.isArray(backup.settings) ? backup.settings.length : 0,
  }, null, 2));
}

main().catch(err => {
  console.error('[export-backup] failed:', err.message);
  process.exitCode = 1;
});
