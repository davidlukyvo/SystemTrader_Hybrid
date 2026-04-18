/* ══════════════════════════════════════════════════════════
   BINANCE MARKET DATA — fast scan + chunked backfill
   Kline normalized về cùng schema để signal engine dùng thống nhất.
   v4.6.9: shared endpoint fallback + in-flight request dedupe
   ══════════════════════════════════════════════════════════ */

const BINANCE = {
  BASES: ['https://api.binance.com', 'https://api1.binance.com', 'https://api-gcp.binance.com', 'https://api.binance.vision', 'https://data-api.binance.vision'],
  inflight: new Map(),

  async requestJson(path, params = {}, cacheKey = '', ttl = 0, force = false) {
    if (!force && cacheKey && window.CACHE) {
      const cached = CACHE.get(cacheKey, ttl);
      if (cached) return cached;
    }

    const inflightKey = `${path}?${new URLSearchParams(params).toString()}`;
    if (!force && this.inflight.has(inflightKey)) {
      return this.inflight.get(inflightKey);
    }

    const runner = (async () => {
      let lastErr;
      for (const base of this.BASES) {
        try {
          const url = new URL(`${base}${path}`);
          Object.entries(params).forEach(([k, v]) => {
            if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
          });
          const rows = await retryFetchJson(url.toString(), {}, 2, 450);
          if (cacheKey && window.CACHE) CACHE.set(cacheKey, rows);
          return rows;
        } catch (err) {
          lastErr = err;
          console.warn('[BINANCE DATA FALLBACK FAIL]', `${base}${path}`, err?.message || err);
        }
      }
      throw lastErr || new Error(`Failed request for ${path}`);
    })();

    this.inflight.set(inflightKey, runner);
    try {
      return await runner;
    } finally {
      this.inflight.delete(inflightKey);
    }
  },

  async klines(symbol, interval = '4h', limit = 300, force = false) {
    const cacheKey = `bn:klines:${symbol}:${interval}:${limit}`;
    const ttl = interval === '1d' ? 15 * 60 * 1000 : 3 * 60 * 1000;
    return this.requestJson(
      '/api/v3/klines',
      { symbol, interval, limit: Math.min(limit, 1000) },
      cacheKey,
      ttl,
      force
    );
  },

  async klinesByTime({ symbol, interval = '4h', startTime, endTime, limit = 1000, force = false }) {
    const cacheKey = `bn:chunk:${symbol}:${interval}:${startTime || 0}:${endTime || 0}:${limit}`;
    return this.requestJson(
      '/api/v3/klines',
      { symbol, interval, limit: Math.min(limit, 1000), startTime, endTime },
      cacheKey,
      6 * 60 * 60 * 1000,
      force
    );
  },

  async historicalChunked({ symbol, interval = '4h', days = 120, chunkLimit = 1000, progressCb = null, force = false }) {
    const intervalMs = intervalToMs(interval);
    if (!intervalMs) throw new Error(`Unsupported interval ${interval}`);

    const now = Date.now();
    const start = now - days * 24 * 60 * 60 * 1000;
    let cursor = start;
    let all = [];
    let guard = 0;

    while (cursor < now && guard < 50) {
      guard += 1;
      const windowMs = intervalMs * Math.min(chunkLimit, 1000);
      const endTime = Math.min(cursor + windowMs - 1, now);
      progressCb?.({ cursor, endTime });
      const rows = await this.klinesByTime({ symbol, interval, startTime: cursor, endTime, limit: chunkLimit, force });
      const chunk = parseKlines(rows, symbol, interval);
      if (!chunk.length) break;
      all.push(...chunk);
      const last = chunk[chunk.length - 1];
      const nextCursor = last.closeTime + 1;
      if (nextCursor <= cursor) break;
      cursor = nextCursor;
      await sleep(120);
    }

    return dedupeCandles(all);
  },
};

function parseKlines(rows, symbol = '', interval = '') {
  return (rows || []).map(r => ({
    source: 'binance',
    symbol,
    timeframe: interval,
    openTime: Number(r[0]),
    open: Number(r[1]),
    high: Number(r[2]),
    low: Number(r[3]),
    close: Number(r[4]),
    volume: Number(r[5]),
    volumeBase: Number(r[5]),
    closeTime: Number(r[6]),
    volumeQuote: Number(r[7]),
    tradeCount: Number(r[8]),
    takerBuyBase: Number(r[9]),
    takerBuyQuote: Number(r[10]),
  })).filter(c => Number.isFinite(c.openTime));
}

function dedupeCandles(candles) {
  const map = new Map();
  for (const c of candles) map.set(c.openTime, c);
  return [...map.values()].sort((a, b) => a.openTime - b.openTime);
}

function intervalToMs(interval) {
  const map = {
    '1m': 60_000, '3m': 180_000, '5m': 300_000, '15m': 900_000, '30m': 1_800_000,
    '1h': 3_600_000, '2h': 7_200_000, '4h': 14_400_000, '6h': 21_600_000,
    '8h': 28_800_000, '12h': 43_200_000, '1d': 86_400_000, '3d': 259_200_000,
    '1w': 604_800_000,
  };
  return map[interval] || null;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }


async function retryFetchJson(url, options = {}, retries = 3, delayMs = 500) {
  let lastErr;
  for (let i = 0; i <= retries; i += 1) {
    const timeoutMs = 7000 + (i * 2500);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error(`timeout_${timeoutMs}`)), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal, cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
      if (i < retries) await sleep(delayMs * (i + 1) + Math.floor(Math.random() * 220));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

