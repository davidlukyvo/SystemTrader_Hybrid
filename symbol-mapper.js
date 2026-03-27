/* ══════════════════════════════════════════════════════════
   BINANCE SYMBOL MAPPER — map universe coin → best Binance pair
   Ưu tiên USDT / FDUSD / USDC / BUSD / BTC
   v4.6.9: exchangeInfo single-flight + multi-endpoint fallback
   ══════════════════════════════════════════════════════════ */

const SYMBOL_MAPPER = {
  QUOTE_PRIORITY: ['USDT', 'FDUSD', 'USDC', 'BUSD', 'BTC'],
  MANUAL_MAP: {
    '1000SATS': '1000SATSUSDT',
  },
  EXCHANGE_ENDPOINTS: [
    'https://api.binance.com/api/v3/exchangeInfo',
    'https://api1.binance.com/api/v3/exchangeInfo',
    'https://api.binance.vision/api/v3/exchangeInfo',
  ],

  async loadExchangeInfo(force = false) {
    if (!force && Array.isArray(window.__binanceExchangeInfo) && window.__binanceExchangeInfo.length) {
      return window.__binanceExchangeInfo;
    }

    if (!force && window.CACHE) {
      const cached = CACHE.get('bn:exchangeInfo', 24 * 60 * 60 * 1000);
      if (Array.isArray(cached) && cached.length) {
        window.__binanceExchangeInfo = cached;
        return cached;
      }
    }

    if (!force && window.__binanceExchangeInfoPromise) {
      return window.__binanceExchangeInfoPromise;
    }

    const runner = (async () => {
      const data = await fetchJsonWithFallback(this.EXCHANGE_ENDPOINTS, {}, 1, 450);
      const symbols = Array.isArray(data?.symbols) ? data.symbols : [];
      if (!symbols.length) throw new Error('Empty exchangeInfo payload');
      window.__binanceExchangeInfo = symbols;
      window.__binanceSymbolIndex = null;
      if (window.CACHE) CACHE.set('bn:exchangeInfo', symbols);
      return symbols;
    })();

    window.__binanceExchangeInfoPromise = runner;
    try {
      return await runner;
    } finally {
      window.__binanceExchangeInfoPromise = null;
    }
  },

  async buildIndex(force = false) {
    if (!force && window.__binanceSymbolIndex instanceof Map && window.__binanceSymbolIndex.size) {
      return window.__binanceSymbolIndex;
    }

    if (!force && window.__binanceSymbolIndexPromise) {
      return window.__binanceSymbolIndexPromise;
    }

    const runner = (async () => {
      const symbols = await this.loadExchangeInfo(force);
      const byBase = new Map();
      const bySymbol = new Map();

      for (const item of symbols) {
        if (!item || item.status !== 'TRADING') continue;
        const base = String(item.baseAsset || '').toUpperCase();
        const quote = String(item.quoteAsset || '').toUpperCase();
        const symbol = String(item.symbol || '').toUpperCase();
        if (!base || !quote || !symbol) continue;
        if (!byBase.has(base)) byBase.set(base, []);
        const normalized = { symbol, baseAsset: base, quoteAsset: quote, raw: item };
        byBase.get(base).push(normalized);
        bySymbol.set(symbol, normalized);
      }

      for (const [, list] of byBase) {
        list.sort((a, b) => quoteRank(a.quoteAsset) - quoteRank(b.quoteAsset));
      }

      window.__binanceSymbolIndex = byBase;
      window.__binanceSymbolBySymbol = bySymbol;
      return byBase;
    })();

    window.__binanceSymbolIndexPromise = runner;
    try {
      return await runner;
    } finally {
      window.__binanceSymbolIndexPromise = null;
    }
  },

  async mapCoinToPair(coin, force = false) {
    const symbol = String(coin?.symbol || '').toUpperCase();
    if (!symbol) return null;

    if (this.MANUAL_MAP[symbol]) {
      return { pair: this.MANUAL_MAP[symbol], mappedBy: 'manual' };
    }

    const index = await this.buildIndex(force);
    const candidates = index.get(symbol) || [];
    if (!candidates.length) return null;

    const best = candidates[0];
    return {
      pair: best.symbol,
      baseAsset: best.baseAsset,
      quoteAsset: best.quoteAsset,
      mappedBy: 'auto',
      raw: best.raw,
    };
  },
};

async function mapCoinToBinance(coin) {
  const mapped = await SYMBOL_MAPPER.mapCoinToPair(coin);
  return mapped?.pair || null;
}

function quoteRank(quote) {
  const idx = SYMBOL_MAPPER.QUOTE_PRIORITY.indexOf(quote);
  return idx === -1 ? 999 : idx;
}

async function fetchJsonWithFallback(urls, options = {}, retries = 1, delayMs = 400) {
  let lastErr;
  for (const url of urls) {
    try {
      return await retryFetchJson(url, options, retries, delayMs);
    } catch (err) {
      lastErr = err;
      console.warn('[BINANCE FALLBACK FAIL]', url, err?.message || err);
    }
  }
  throw lastErr || new Error('All fallback endpoints failed');
}

async function retryFetchJson(url, options = {}, retries = 2, delayMs = 500) {
  let lastErr;
  for (let i = 0; i <= retries; i += 1) {
    try {
      const res = await fetch(url, options);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
      if (i < retries) await new Promise(r => setTimeout(r, delayMs * (i + 1)));
    }
  }
  throw lastErr;
}
