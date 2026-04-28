/* ══════════════════════════════════════════════════════════
   SCANNER MODULE: UNIVERSE & DATA ACQUISITION
   Handles market discovery, liquidity gates, and klines fetching.
   ══════════════════════════════════════════════════════════ */

window.SCANNER_UNIVERSE = (() => {
  'use strict';

  function isLeveragedToken(base = '') { return /(UP|DOWN|BULL|BEAR)$/i.test(base); }
  function safeNum(v, d = 0) { const n = Number(v); return Number.isFinite(n) ? n : d; }
  const HARD_STABLE_BASES = new Set([
    'USD1','USDT','USDC','FDUSD','TUSD','USDP','DAI','BUSD','USDS','USDE','USDD','USD0','USDJ',
    'PYUSD','FRAX','LUSD','GUSD','EURC','EURI'
  ]);
  const HARD_SYMBOL_HYGIENE_BASES = new Set(['EUR','U','BANANAS31']);
  function hasNonAsciiSymbol(base = '') { return /[^\x20-\x7E]/.test(String(base || '')); }

  function regimeConfig(btcContext) {
    if (btcContext === 'bull') return { minQuoteVolume: 5_000_000, maxQuoteVolume: 90_000_000, minTrades: 5500, maxAbs24hPump: 32, maxCandidates: 24, readyThreshold: 76, earlyThreshold: 66, minRelVol: 1.25, rrReady: 1.8, rrEarly: 1.5 };
    if (btcContext === 'bear') return { minQuoteVolume: 5_000_000, maxQuoteVolume: 80_000_000, minTrades: 6000, maxAbs24hPump: 28, maxCandidates: 18, readyThreshold: 80, earlyThreshold: 70, minRelVol: 1.35, rrReady: 2.0, rrEarly: 1.7 };
    return { minQuoteVolume: 3_000_000, maxQuoteVolume: 90_000_000, minTrades: 2600, maxAbs24hPump: 35, maxCandidates: 30, readyThreshold: 50, earlyThreshold: 20, minRelVol: 0.75, rrReady: 1.8, rrEarly: 1.0, scalpThreshold: 20, rrScalp: 1.2 };
  }

  function upperLiquidityGateConfig(btcContext) {
    if (btcContext === 'bull') {
      return { hardFloor: 4_500_000, softFloor: 3_500_000, minTradesSoft: 6_000, maxAbs24hPumpSoft: 18, minRangeSoft: 2.0, maxRangeSoft: 24 };
    }
    if (btcContext === 'bear') {
      return { hardFloor: 6_000_000, softFloor: 5_000_000, minTradesSoft: 7_500, maxAbs24hPumpSoft: 14, minRangeSoft: 2.5, maxRangeSoft: 18 };
    }
    return { hardFloor: 5_000_000, softFloor: 4_000_000, minTradesSoft: 6_500, maxAbs24hPumpSoft: 12, minRangeSoft: 2.5, maxRangeSoft: 18 };
  }

  function passesUpperLiquidityGate({ quoteVolume = 0, trades = 0, intradayRangePct = 0, chg24 = 0, btcContext = 'sideway' } = {}) {
    const gate = upperLiquidityGateConfig(btcContext);
    if (quoteVolume >= gate.hardFloor) return true;
    if (quoteVolume < gate.softFloor) return false;
    if (trades < gate.minTradesSoft) return false;
    if (Math.abs(chg24) > gate.maxAbs24hPumpSoft) return false;
    if (intradayRangePct < gate.minRangeSoft || intradayRangePct > gate.maxRangeSoft) return false;
    return true;
  }

  async function fetchExchangeInfo() {
    if (window.SYMBOL_MAPPER?.loadExchangeInfo) return { symbols: await window.SYMBOL_MAPPER.loadExchangeInfo(false) };
    if (window.BINANCE?.requestJson) return BINANCE.requestJson('/api/v3/exchangeInfo', {}, 'bn:exchangeInfo:raw', 86400000, false);
    const res = await fetch('https://api.binance.com/api/v3/exchangeInfo');
    if (!res.ok) throw new Error(`exchangeInfo ${res.status}`);
    return res.json();
  }

  async function fetch24hr() {
    if (window.BINANCE?.requestJson) return BINANCE.requestJson('/api/v3/ticker/24hr', {}, 'bn:ticker24h:raw', 120000, false);
    const res = await fetch('https://api.binance.com/api/v3/ticker/24hr');
    if (!res.ok) throw new Error(`ticker24h ${res.status}`);
    return res.json();
  }

  function parseKlines(rows, symbol, interval) {
    if (!Array.isArray(rows)) return [];
    return rows.map(r => ({
      openTime: r[0],
      open: Number(r[1]),
      high: Number(r[2]),
      low: Number(r[3]),
      close: Number(r[4]),
      volume: Number(r[5]),
      closeTime: r[6],
      volumeQuote: Number(r[7]),
      tradeCount: Number(r[8]),
      symbol,
      interval
    }));
  }

  async function fetchKlinesRobust(symbol, interval, limit = 200) {
    let lastErr;
    for (const force of [false, true]) {
      try {
        const rows = await BINANCE.klines(symbol, interval, limit, force);
        const parsed = parseKlines(rows, symbol, interval);
        if (parsed.length >= Math.min(80, limit * 0.4)) return parsed;
        lastErr = new Error(`thin_${interval}_${symbol}`);
      } catch (err) { lastErr = err; }
      await new Promise(r => setTimeout(r, force ? 160 : 90));
    }
    const cacheKey = `bn:klines:${symbol}:${interval}:${limit}`;
    const staleTtl = interval === '1d' ? 86400000 : 21600000;
    const stale = window.CACHE ? CACHE.get(cacheKey, staleTtl) : null;
    if (Array.isArray(stale) && stale.length >= Math.min(60, limit * 0.3)) return parseKlines(stale, symbol, interval);
    throw lastErr || new Error(`klines_${interval}_failed_${symbol}`);
  }

  async function fetchMulti(coinOrSymbol) {
    const inputSymbol = typeof coinOrSymbol === 'string' ? coinOrSymbol : String(coinOrSymbol?.symbol || '');
    const mappedPair = typeof coinOrSymbol === 'object' ? await window.mapCoinToBinance(coinOrSymbol) : null;
    const pair = String(mappedPair || inputSymbol || '').toUpperCase();
    if (!pair) throw new Error('missing_symbol');

    const settled = await Promise.allSettled([
      fetchKlinesRobust(pair, '15m', 200),
      fetchKlinesRobust(pair, '1h', 200),
      fetchKlinesRobust(pair, '4h', 200),
      fetchKlinesRobust(pair, '1d', 200),
    ]);

    const [m15Res, h1Res, h4Res, d1Res] = settled;
    let m15 = m15Res.status === 'fulfilled' ? m15Res.value : null;
    let h1 = h1Res.status === 'fulfilled' ? h1Res.value : null;
    let h4 = h4Res.status === 'fulfilled' ? h4Res.value : null;
    let d1 = d1Res.status === 'fulfilled' ? d1Res.value : null;

    if (!m15 && h1?.length) m15 = synthesizeFromHigherTf(h1, '15m');
    if (!m15 && h4?.length) m15 = synthesizeFromHigherTf(h4, '15m');
    if (!h1 && h4?.length) h1 = synthesizeFromHigherTf(h4, '1h');
    if (!h4 && d1?.length) h4 = synthesizeFromHigherTf(d1, '4h');
    if (!d1 && h4?.length >= 36) d1 = synthesizeFromHigherTf(h4.slice(-36), '1d').slice(-120);
    if (!d1 && m15?.length >= 96) d1 = synthesizeFromHigherTf(m15.slice(-96), '1d').slice(-60);

    if ((!m15 || m15.length < 40) && h4?.length) m15 = synthesizeFromHigherTf(h4, '15m');
    if ((!h4 || h4.length < 40) && d1?.length) h4 = synthesizeFromHigherTf(d1, '4h');

    if (!m15 || !h1 || !h4 || !d1) {
      const reasons = settled.map((r, idx) => r.status === 'rejected' ? `${['15m','1h','4h','1d'][idx]}:${r.reason?.message || r.reason}` : null).filter(Boolean).join(' | ');
      throw new Error(`fetch_multi_failed:${pair}:${reasons}`);
    }
    const syntheticBy = (arr) => !!(arr && (arr.syntheticGenerated || arr.degraded));
    return { pair, m15, h1, h4, d1, degraded: settled.some(r => r.status === 'rejected') || syntheticBy(m15) || syntheticBy(h4) || syntheticBy(d1), degradedReason: syntheticBy(m15) ? 'synthetic_15m' : syntheticBy(h4) ? 'synthetic_4h' : syntheticBy(d1) ? 'synthetic_1d' : (settled.some(r => r.status === 'rejected') ? 'partial_fetch_recovered' : '') };
  }

  function synthesizeFromHigherTf(rows, targetInterval = '15m') {
    if (!Array.isArray(rows) || !rows.length) return [];
    const factor = targetInterval === '15m' ? 4 : targetInterval === '1h' ? 4 : targetInterval === '4h' ? 6 : 1;
    const intervalMs = targetInterval === '15m' ? 900000 : targetInterval === '1h' ? 3600000 : targetInterval === '4h' ? 14400000 : 86400000;
    const out = [];
    for (const c of rows.slice(-Math.min(rows.length, 80))) {
      const openTime = Number(c.openTime || 0);
      const open = Number(c.open || c.close || 0);
      const close = Number(c.close || open || 0);
      const high = Number(c.high || Math.max(open, close) || 0);
      const low = Number(c.low || Math.min(open, close) || 0);
      const qv = Number(c.volumeQuote || c.volume || 0);
      for (let i = 0; i < factor; i += 1) {
        const drift = factor > 1 ? (i / (factor - 1)) : 0;
        const subOpen = open + ((close - open) * drift);
        const subClose = open + ((close - open) * Math.min(1, drift + (1 / factor)));
        out.push({ source: c.source || 'synthetic', symbol: c.symbol || '', timeframe: targetInterval, openTime: openTime + (i * intervalMs), open: subOpen, high, low, close: subClose, volume: (c.volume || 0) / factor, volumeBase: (c.volume || 0) / factor, closeTime: openTime + ((i + 1) * intervalMs) - 1, volumeQuote: qv / factor, tradeCount: Math.max(1, Math.round(Number(c.tradeCount || factor) / factor)), synthetic: true });
      }
    }
    out.degraded = true; out.syntheticGenerated = true;
    return out;
  }

  async function detectBTCContext() {
    try {
      const rows = await fetchKlinesRobust('BTCUSDT', '4h', 120);
      const last = rows[rows.length - 1].close;
      if (window.ST?.setBtcPrice) window.ST.setBtcPrice(last);
      const prev = rows[rows.length - 12]?.close || last;
      const pct = prev > 0 ? ((last - prev) / prev) * 100 : 0;
      return pct > 4 ? 'bull' : pct < -4 ? 'bear' : 'sideway';
    } catch (err) { console.error('[SCANNER_UNIVERSE] BTC Context Error:', err); return 'sideway'; }
  }

  async function buildLiveUniverse(params = {}) {
    const { btcContext = 'sideway', minQuoteVolume = 3_000_000, maxQuoteVolume = 120_000_000, minTrades = 2500, maxAbs24hPump = 35, minPrice = 0.000001 } = params;
    const [exchangeInfo, tickers] = await Promise.all([fetchExchangeInfo(), fetch24hr()]);
    const tradableMap = new Map();
    for (const s of exchangeInfo.symbols || []) {
      if (s.status !== 'TRADING' || s.quoteAsset !== 'USDT' || !s.isSpotTradingAllowed) continue;
      const base = s.baseAsset || '';
      const symbol = s.symbol || '';
      if (!symbol.endsWith('USDT')) continue;
      if (HARD_STABLE_BASES.has(String(base).toUpperCase())) continue;
      if (HARD_SYMBOL_HYGIENE_BASES.has(String(base).toUpperCase()) || hasNonAsciiSymbol(base)) continue;
      const universeCheck = window.CLEAN_UNIVERSE?.classify ? window.CLEAN_UNIVERSE.classify({ symbol, baseAsset: base, name: s.baseAsset }) : { excluded: false };
      const softReason = String(universeCheck.reason || '').toLowerCase();
      const blockSoftMemeInSideway = btcContext === 'sideway' && (softReason === 'meme_soft_excluded' || softReason === 'soft_excluded');
      if (universeCheck.excluded || isLeveragedToken(base)) continue;
      if (blockSoftMemeInSideway) continue;
      tradableMap.set(symbol, {
        symbol,
        base,
        quote: 'USDT',
        cleanUniverseReason: universeCheck.reason || '',
        cleanUniverseLane: universeCheck.lane || 'allow',
        cleanUniverseSoftExcluded: universeCheck.softExcluded === true,
      });
    }
    const out = [];
    for (const t of tickers || []) {
      const row = tradableMap.get(t.symbol);
      if (!row) continue;
      const quoteVolume = safeNum(t.quoteVolume);
      const trades = safeNum(t.count);
      const lastPrice = safeNum(t.lastPrice);
      const chg24 = safeNum(t.priceChangePercent);
      const highPrice = safeNum(t.highPrice);
      const lowPrice = safeNum(t.lowPrice);
      if (quoteVolume < minQuoteVolume || quoteVolume > maxQuoteVolume || trades < minTrades || lastPrice <= minPrice || Math.abs(chg24) > maxAbs24hPump) continue;
      const intradayRangePct = lowPrice > 0 ? ((highPrice - lowPrice) / lowPrice) * 100 : 0;
      if (!passesUpperLiquidityGate({ quoteVolume, trades, intradayRangePct, chg24, btcContext })) continue;
      out.push({
        ...row,
        quoteVolume,
        volume24h: quoteVolume,
        baseVolume: safeNum(t.volume),
        trades,
        lastPrice,
        priceChangePercent24h: chg24,
        intradayRangePct
      });
    }
    return out.sort((a, b) => b.quoteVolume - a.quoteVolume);
  }

  function scorePreFilter(coin) {
    let score = 0;
    if (coin.quoteVolume >= 15_000_000 && coin.quoteVolume <= 90_000_000) score += 4;
    else if (coin.quoteVolume >= 8_000_000) score += 3;
    else if (coin.quoteVolume >= 4_000_000) score += 2;
    else if (coin.quoteVolume >= 2_000_000) score += 1;
    if (coin.trades >= 15000) score += 3;
    else if (coin.trades >= 7000) score += 2;
    else if (coin.trades >= 2500) score += 1;
    if (coin.intradayRangePct >= 4 && coin.intradayRangePct <= 22) score += 2;
    if (coin.priceChangePercent24h >= -8 && coin.priceChangePercent24h <= 14) score += 2;
    if (coin.lastPrice < 25) score += 1;
    return score;
  }

  function preFilterCandidates(liveUniverse, { minPreScore = 4, maxCandidates = 36 } = {}) {
    return liveUniverse.map(c => ({ ...c, preScore: scorePreFilter(c) })).filter(c => c.preScore >= minPreScore).sort((a, b) => (b.preScore - a.preScore) || (b.quoteVolume - a.quoteVolume)).slice(0, maxCandidates);
  }

  return { regimeConfig, fetchMulti, detectBTCContext, buildLiveUniverse, preFilterCandidates };
})();
