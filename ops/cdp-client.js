#!/usr/bin/env node
'use strict';

const DEFAULT_CDP_URL = 'http://127.0.0.1:9222';

function onSocket(socket, event, handler) {
  if (typeof socket.addEventListener === 'function') {
    socket.addEventListener(event, evt => handler(evt.data ?? evt));
  } else if (typeof socket.on === 'function') {
    socket.on(event, handler);
  }
}

async function createWebSocket(url) {
  if (typeof WebSocket !== 'undefined') return new WebSocket(url);
  try {
    const wsModule = await import('ws');
    return new wsModule.WebSocket(url);
  } catch (err) {
    throw new Error(
      'WebSocket runtime unavailable. Use Node.js 22+ or install the optional "ws" package for ops scripts.'
    );
  }
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} while fetching ${url}`);
  return res.json();
}

async function findPage({ cdpUrl = DEFAULT_CDP_URL, appUrl = '' } = {}) {
  const pages = await fetchJson(`${cdpUrl.replace(/\/$/, '')}/json/list`);
  const candidates = pages.filter(page => page.type === 'page' && page.webSocketDebuggerUrl);
  if (!candidates.length) throw new Error('No debuggable Chrome page found');
  if (appUrl) {
    const matched = candidates.find(page => String(page.url || '').startsWith(appUrl));
    if (matched) return matched;
  }
  const systemTrader = candidates.find(page => /SystemTrader|scanner|dashboard|localhost|127\.0\.0\.1/i.test(`${page.title} ${page.url}`));
  return systemTrader || candidates[0];
}

async function connectCdp(webSocketDebuggerUrl) {
  const socket = await createWebSocket(webSocketDebuggerUrl);
  let nextId = 1;
  const pending = new Map();

  const ready = new Promise((resolve, reject) => {
    onSocket(socket, 'open', resolve);
    onSocket(socket, 'error', reject);
  });

  onSocket(socket, 'message', raw => {
    const payload = typeof raw === 'string' ? raw : raw?.toString?.();
    if (!payload) return;
    let msg;
    try { msg = JSON.parse(payload); } catch { return; }
    if (!msg.id || !pending.has(msg.id)) return;
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
    else resolve(msg.result);
  });

  await ready;

  function send(method, params = {}) {
    const id = nextId++;
    const message = JSON.stringify({ id, method, params });
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      socket.send(message);
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }
      }, 30000);
    });
  }

  function close() {
    try { socket.close(); } catch {}
  }

  return { send, close };
}

async function evaluateExpression(expression, options = {}) {
  const page = await findPage(options);
  const client = await connectCdp(page.webSocketDebuggerUrl);
  try {
    const result = await client.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: false,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text || 'Runtime.evaluate exception');
    }
    return result.result?.value;
  } finally {
    client.close();
  }
}

module.exports = {
  DEFAULT_CDP_URL,
  evaluateExpression,
  findPage,
};
