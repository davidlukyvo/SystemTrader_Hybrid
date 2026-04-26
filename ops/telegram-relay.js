#!/usr/bin/env node
'use strict';

const http = require('http');

const HOST = process.env.ST_TELEGRAM_RELAY_HOST || '127.0.0.1';
const PORT = Number(process.env.ST_TELEGRAM_RELAY_PORT || 8787);
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

function sendJson(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  if (raw.length > 20000) throw new Error('payload_too_large');
  return JSON.parse(raw);
}

async function sendTelegram(message) {
  if (!TOKEN || !CHAT_ID) throw new Error('telegram_env_missing');
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text: message,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.ok === false) {
    throw new Error(`telegram_http_${res.status}`);
  }
  return body;
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') {
      return sendJson(res, TOKEN && CHAT_ID ? 200 : 503, {
        ok: !!(TOKEN && CHAT_ID),
        tokenConfigured: !!TOKEN,
        chatConfigured: !!CHAT_ID,
      });
    }

    if (req.method !== 'POST' || req.url !== '/telegram/send') {
      return sendJson(res, 404, { ok: false, error: 'not_found' });
    }

    const payload = await readJson(req);
    const message = String(payload.message || payload.text || '').trim();
    if (!message) return sendJson(res, 400, { ok: false, error: 'missing_message' });

    await sendTelegram(message);
    return sendJson(res, 200, { ok: true, source: 'env_relay' });
  } catch (err) {
    const code = err.message === 'payload_too_large' ? 413 : 500;
    return sendJson(res, code, { ok: false, error: String(err.message || err).slice(0, 200) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[telegram-relay] listening on http://${HOST}:${PORT}`);
});
