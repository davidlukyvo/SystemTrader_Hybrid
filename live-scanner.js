/* ══════════════════════════════════════════════════════════
   LIVE MARKET SCANNER v6.7.4 True Execution
   Binance-only · self-learning quant overlay
   Discovery -> Prefilter -> Deep Scan -> Learn -> Rank
   ══════════════════════════════════════════════════════════ */

window.LIVE_SCANNER = (() => {
  const STABLE_BASES = new Set(['USDC','FDUSD','TUSD','USDP','DAI','BUSD','USDS']);
  const EXCLUDE_BIG = new Set(['BTC','ETH','BNB','SOL','XRP','ADA','AVAX','DOGE','TRX','LINK','LTC','BCH','XLM','DOT','ATOM','NEAR','APT','AAVE','RENDER']);
  const BAD_MEME = new Set(['SHIB','PEPE','BONK','WIF']);
  const SNIPER_SOFT_EXCLUDE = new Set(['TON']);

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  function avg(arr) { return arr.length ? arr.reduce((a,b)=>a+b,0) / arr.length : 0; }
  function safeNum(v, d=0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function isLeveragedToken(base='') { return /(UP|DOWN|BULL|BEAR)$/i.test(base); }

  function regimeConfig(btcContext) {
    if (btcContext === 'bull') return { minQuoteVolume: 4_000_000, maxQuoteVolume: 90_000_000, minTrades: 5000, maxAbs24hPump: 32, maxCandidates: 24, readyThreshold: 76, earlyThreshold: 66, minRelVol: 1.25, rrReady: 1.8, rrEarly: 1.5 };
    if (btcContext === 'bear') return { minQuoteVolume: 5_000_000, maxQuoteVolume: 80_000_000, minTrades: 6000, maxAbs24hPump: 28, maxCandidates: 18, readyThreshold: 80, earlyThreshold: 70, minRelVol: 1.35, rrReady: 2.0, rrEarly: 1.7 };
    return { minQuoteVolume: 2_000_000, maxQuoteVolume: 90_000_000, minTrades: 2200, maxAbs24hPump: 35, maxCandidates: 30, readyThreshold: 50, earlyThreshold: 20, minRelVol: 0.75, rrReady: 1.8, rrEarly: 1.0, scalpThreshold: 20, rrScalp: 1.2 }; // v6.7.5 full unlock scalp
  }

  function emaSeries(values, period) {
    const out = new Array(values.length).fill(null);
    if (!values || values.length < period) return out;
    const k = 2 / (period + 1);
    let prev = avg(values.slice(0, period));
    out[period - 1] = prev;
    for (let i = period; i < values.length; i++) {
      prev = values[i] * k + prev * (1 - k);
      out[i] = prev;
    }
    return out;
  }

  function getCloses(candles) { return candles.map(c => c.close); }
  function getVolumes(candles) { return candles.map(c => c.volumeQuote || c.volume || 0); }

  function calcRelVol(candles, shortLen = 5, baseLen = 20) {
    const vols = getVolumes(candles);
    if (vols.length < baseLen) return 0;
    const shortAvg = avg(vols.slice(-shortLen));
    const baseAvg  = avg(vols.slice(-baseLen));
    return baseAvg > 0 ? shortAvg / baseAvg : 0;
  }

  function calcCompression(candles, shortLen = 12, baseLen = 48) {
    if (candles.length < baseLen) return 0;
    const short = candles.slice(-shortLen);
    const base  = candles.slice(-baseLen);

    const shortLow = Math.min(...short.map(c => c.low));
    const shortHigh = Math.max(...short.map(c => c.high));
    const baseLow = Math.min(...base.map(c => c.low));
    const baseHigh = Math.max(...base.map(c => c.high));

    const shortRange = (shortHigh - shortLow) / Math.max(shortLow, 1e-9);
    const baseRange  = (baseHigh - baseLow) / Math.max(baseLow, 1e-9);

    return baseRange > 0 ? 1 - shortRange / baseRange : 0;
  }

  function calcFibZone(candles, lookback = 60) {
    const arr = candles.slice(-lookback);
    const hi = Math.max(...arr.map(c => c.high));
    const lo = Math.min(...arr.map(c => c.low));
    const last = arr[arr.length - 1]?.close || 0;
    const range = hi - lo;
    if (range <= 0) return { zone: 'unknown', fib05: 0, fib0618: 0, hi, lo, last };

    const fib05 = hi - range * 0.5;
    const fib0618 = hi - range * 0.618;

    let zone = 'outside';
    if (last <= fib05 && last >= fib0618) zone = '0.5-0.618';
    else if (last > fib05) zone = 'above-0.5';
    else if (last < fib0618) zone = 'below-0.618';

    return { zone, fib05, fib0618, hi, lo, last };
  }

  async function fetchExchangeInfo() {
    const res = await fetch('https://api.binance.com/api/v3/exchangeInfo');
    if (!res.ok) throw new Error(`exchangeInfo ${res.status}`);
    return res.json();
  }

  async function fetch24hr() {
    const res = await fetch('https://api.binance.com/api/v3/ticker/24hr');
    if (!res.ok) throw new Error(`ticker24h ${res.status}`);
    return res.json();
  }

  async function fetchKlines(symbol, interval, limit = 200) {
    const rows = await BINANCE.klines(symbol, interval, limit, false);
    return parseKlines(rows, symbol, interval);
  }

  async function fetchMulti(symbol) {
    const [m15, h4, d1] = await Promise.all([
      fetchKlines(symbol, '15m', 200),
      fetchKlines(symbol, '4h', 200),
      fetchKlines(symbol, '1d', 200),
    ]);
    return { m15, h4, d1 };
  }

  async function detectBTCContext() {
    try {
      const rows = await fetchKlines('BTCUSDT', '4h', 120);
      const closes = rows.map(x => x.close);
      const last = closes[closes.length - 1];
      const prev = closes[closes.length - 12] || last;
      const pct = prev > 0 ? ((last - prev) / prev) * 100 : 0;
      if (pct > 4) return 'bull';
      if (pct < -4) return 'bear';
      return 'sideway';
    } catch {
      return 'sideway';
    }
  }

  async function buildLiveUniverse({
    minQuoteVolume = 2_000_000,
    maxQuoteVolume = 120_000_000,
    minTrades = 2500,
    maxAbs24hPump = 35,
    minPrice = 0.000001
  } = {}) {
    const [exchangeInfo, tickers] = await Promise.all([
      fetchExchangeInfo(),
      fetch24hr()
    ]);

    const tradableMap = new Map();

    for (const s of exchangeInfo.symbols || []) {
      if (s.status !== 'TRADING') continue;
      if (s.quoteAsset !== 'USDT') continue;
      if (!s.isSpotTradingAllowed) continue;

      const base = s.baseAsset || '';
      const symbol = s.symbol || '';

      if (!symbol.endsWith('USDT')) continue;
      if (STABLE_BASES.has(base)) continue;
      if (EXCLUDE_BIG.has(base)) continue;
      if (BAD_MEME.has(base)) continue;
      if (SNIPER_SOFT_EXCLUDE.has(base)) continue;
      if (isLeveragedToken(base)) continue;

      tradableMap.set(symbol, {
        symbol,
        base,
        quote: 'USDT'
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
      const volume = safeNum(t.volume);
      const highPrice = safeNum(t.highPrice);
      const lowPrice = safeNum(t.lowPrice);

      if (quoteVolume < minQuoteVolume) continue;
      if (quoteVolume > maxQuoteVolume) continue;
      if (trades < minTrades) continue;
      if (lastPrice <= minPrice) continue;
      if (Math.abs(chg24) > maxAbs24hPump) continue;

      const intradayRangePct = lowPrice > 0 ? ((highPrice - lowPrice) / lowPrice) * 100 : 0;

      out.push({
        ...row,
        quoteVolume,
        baseVolume: volume,
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
    return liveUniverse
      .map(c => ({ ...c, preScore: scorePreFilter(c) }))
      .filter(c => c.preScore >= minPreScore)
      .sort((a, b) => (b.preScore - a.preScore) || (b.quoteVolume - a.quoteVolume))
      .slice(0, maxCandidates);
  }

  function scoreEMA(candles) {
    const closes = getCloses(candles);
    const e20 = emaSeries(closes, 20);
    const e50 = emaSeries(closes, 50);
    const e200 = emaSeries(closes, 200);

    const c = closes[closes.length - 1];
    const a = e20[e20.length - 1];
    const b = e50[e50.length - 1];
    const d = e200[e200.length - 1];

    let score = 0;
    let state = 'weak';

    if (a && c > a) score += 2;
    if (b && c > b) score += 3;
    if (b && d && b > d) score += 3;
    if (a && b && a > b) score += 2;

    if (score >= 8) state = 'bull';
    else if (score >= 4) state = 'improving';

    return { score, state };
  }

  function scoreStructure(m15, h4, d1) {
    let score = 0;
    let label = 'unclear';

    const compression = calcCompression(h4, 12, 48);
    const relVol15 = calcRelVol(m15, 5, 20);
    const h4Last = h4[h4.length - 1];
    const h4Prev = h4[h4.length - 2];
    const d1Close = d1[d1.length - 1].close;
    const d1Prev = d1[d1.length - 5]?.close || d1Close;

    if (compression >= 0.45) score += 3;
    if (relVol15 >= 1.4) score += 3;
    if (h4Last.close > h4Prev.high) score += 2;
    if (d1Close >= d1Prev * 0.95) score += 2;

    if (score >= 8) label = 'early-phase-d';
    else if (score >= 5) label = 'phase-candidate';
    else if (score >= 3) label = 'early-watch';

    if (compression >= 0.55 && relVol15 >= 1.15) score += 1;

    return { score, label, compression, relVol15 };
  }

  function scoreVSA(m15) {
    let score = 0;
    let label = 'neutral';

    const a = m15[m15.length - 1];
    const b = m15[m15.length - 2];
    const avgVol = avg(m15.slice(-20).map(x => x.volume));

    const spreadA = a.high - a.low;
    const spreadB = b.high - b.low;

    if (a.volume > avgVol * 1.5 && a.close > (a.high + a.low) / 2) score += 4;
    if (b.low < a.low && b.close >= (b.high + b.low) / 2) score += 2;
    if (spreadA < spreadB && a.volume >= avgVol) score += 2;

    if (score >= 6) label = 'absorption';
    else if (score <= 1) label = 'weak';

    return { score, label };
  }

  function scoreFakePumpRisk(m15) {
    let risk = 0;
    const relVol = calcRelVol(m15, 3, 20);
    const last15 = m15[m15.length - 1];
    const prev15 = m15[m15.length - 4];
    const pctMove = prev15?.close > 0 ? ((last15.close - prev15.close) / prev15.close) * 100 : 0;

    const wickTop = last15.high > last15.low
      ? (last15.high - last15.close) / (last15.high - last15.low + 1e-9)
      : 0;
    const spread = last15.low > 0 ? ((last15.high - last15.low) / last15.low) * 100 : 0;

    if (pctMove > 12) risk += 4;
    if (relVol > 3.2) risk += 3;
    if (wickTop > 0.45) risk += 2;
    if (relVol > 3 && spread > 9 && wickTop > 0.35) risk += 3;

    // v6.6 balanced: multi-candle pump exhaustion
    const window = m15.slice(-4);
    const moves = [];
    const vols = [];
    for (let i = 1; i < window.length; i++) {
      const prev = window[i-1];
      const cur = window[i];
      const move = prev?.close > 0 ? ((cur.close - prev.close) / prev.close) * 100 : 0;
      moves.push(move);
      vols.push(cur.volume || 0);
      const curRel = avg(m15.slice(Math.max(0, m15.length - 20 - (window.length-i)), m15.length - (window.length-i)).map(x => x.volume || 0));
      if (move > 8 && curRel > 0 && (cur.volume || 0) > curRel * 2.5) risk += 3;
    }
    const cumulativeMove = moves.reduce((a,b)=>a+b,0);
    if (cumulativeMove > 15) risk += 4;
    if (vols.length >= 3 && vols[0] > vols[1] && vols[1] > vols[2] && cumulativeMove > 8) risk += 2;

    let label = 'low';
    if (risk >= 8) label = 'high';
    else if (risk >= 4) label = 'medium';

    return { risk, label, cumulativeMove };
  }

  function scoreFib(h4) {
    const fib = calcFibZone(h4, 60);
    let score = 0;
    if (fib.zone === '0.5-0.618') score = 8;
    else if (fib.zone === 'above-0.5') score = 5;
    else if (fib.zone === 'below-0.618') score = 2;
    return { score, ...fib };
  }

  function scoreEntryQuality(m15) {
    const last = m15[m15.length - 1];
    const prev = m15[m15.length - 2];
    const prev2 = m15[m15.length - 3];
    if (!last || !prev || !prev2) return 0;

    let score = 0;
    const avgVol20 = avg(m15.slice(-20).map(x => x.volume));
    const body = Math.abs(last.close - last.open);
    const range = Math.max(last.high - last.low, 1e-9);
    const pctMove = prev.close > 0 ? ((last.close - prev.close) / prev.close) * 100 : 0;

    const volSpike = avgVol20 > 0 && last.volume > avgVol20 * 1.3;
    const isBreakout = last.close > prev.high;
    const isSpring = last.low < prev.low && last.close > prev.close;
    const hasTest = prev.low <= prev2.low * 1.01 && prev.close >= prev.open;
    const isReclaimEMAStyle = last.close > prev.close && last.close > last.open;
    const higherLow = last.low > prev.low;
    const isLPS = higherLow && last.close > last.open && last.close >= prev.close;

    if (isBreakout) score += 3;
    if (volSpike) score += 3;
    if (body / range > 0.6) score += 2;

    // pullback / LPS style
    if (
      last.close > prev.low &&
      last.close < prev.high &&
      last.close > last.open &&
      avgVol20 > 0 &&
      last.volume >= avgVol20
    ) score += 2;

    // sniper-specific triggers
    if (isSpring && hasTest) score += 2;
    if (isReclaimEMAStyle && volSpike) score += 2;
    if (isLPS && higherLow) score += 2;

    // avoid late breakout / FOMO bar
    if (pctMove > 8) score -= 3;

    return Math.max(0, score);
  }


  function resistanceLevels(h4, d1, entry) {
    const highs4h = h4.slice(-48).map(x => x.high).sort((a,b) => a-b);
    const dailyHigh = Math.max(...d1.slice(-30).map(x => x.high));
    const candidates = highs4h.filter(v => v > entry * 1.02);
    const tp1 = candidates[0] || entry * 1.08;
    const tp2 = candidates[Math.floor(candidates.length * 0.45)] || Math.max(dailyHigh * 0.98, entry * 1.16);
    const tp3 = candidates[candidates.length - 1] || Math.max(dailyHigh * 1.02, entry * 1.28);
    return { tp1, tp2: Math.max(tp2, tp1 * 1.04), tp3: Math.max(tp3, tp2 * 1.06) };
  }


  function calcChartAware(h4, fib, ema4h, entry, levels) {
    const closes = getCloses(h4);
    const e20s = emaSeries(closes, 20);
    const e50s = emaSeries(closes, 50);
    const last = h4[h4.length - 1] || {};
    const prev = h4[h4.length - 2] || {};
    const e20 = e20s[e20s.length - 1] || entry;
    const e50 = e50s[e50s.length - 1] || entry;
    const distE20 = e20 > 0 ? ((entry - e20) / e20) * 100 : 0;
    const distE50 = e50 > 0 ? ((entry - e50) / e50) * 100 : 0;
    const roomToTp1 = entry > 0 ? ((levels.tp1 - entry) / entry) * 100 : 0;
    const candleRange = last.low > 0 ? ((last.high - last.low) / last.low) * 100 : 0;
    const pullbackHeld = !!prev.close && entry >= prev.low * 0.998 && entry <= prev.high * 1.01;
    const reclaimHeld = entry >= e20 && e20 >= e50;
    const momentumHot = candleRange >= 4.5 && distE20 >= 3.0;
    const overextended = distE20 >= 4.2 || roomToTp1 <= 1.8;
    const deepBelowTrend = entry < e20 && entry < e50;

    let bonus = 0;
    let penalty = 0;
    let entryQuality = 'neutral';
    let bias = reclaimHeld ? 'trend_retest' : deepBelowTrend ? 'under_trend' : 'mid_range';

    if (fib.zone === '0.5-0.618') bonus += 3;
    else if (fib.zone === 'above-0.5') bonus += 1;
    else penalty += 2;

    if (distE20 >= -0.8 && distE20 <= 1.8 && reclaimHeld) bonus += 4;
    if (distE50 >= -1.2 && distE50 <= 2.2) bonus += 2;
    if (pullbackHeld) bonus += 2;
    if (overextended) penalty += 3;
    if (deepBelowTrend) penalty += 4;
    if (momentumHot) penalty += 2;

    if (!overextended && reclaimHeld && pullbackHeld && roomToTp1 >= 3) entryQuality = 'entry_good';
    else if (overextended) entryQuality = 'entry_late';
    else if (reclaimHeld && roomToTp1 >= 2.5) entryQuality = 'wait_retest';
    else if (deepBelowTrend) entryQuality = 'structure_risk';

    return {
      bonus,
      penalty,
      entryQuality,
      bias,
      distE20: Number(distE20.toFixed(2)),
      distE50: Number(distE50.toFixed(2)),
      roomToTp1: Number(roomToTp1.toFixed(2)),
      overextended,
      reclaimHeld,
      pullbackHeld,
    };
  }

  function inferInstitutionalEntrySignal(m15) {
    const last = m15[m15.length - 1];
    const prev = m15[m15.length - 2];
    const prev2 = m15[m15.length - 3];
    const prev3 = m15[m15.length - 4];
    if (!last || !prev || !prev2) return { label:'wait', trigger15mValid:false, fullTriggerValid:false };
    const avgVol20 = avg(m15.slice(-20).map(x => x.volume));
    const volOK = avgVol20 > 0 && last.volume >= avgVol20 * 1.1;
    const reclaimBreak = last.close > prev.high && volOK;
    const miniSpring = last.low < prev.low && last.close > prev.close && (volOK || last.close > last.open);
    const breakoutRetest15m = !!(prev2 && prev3 && prev.close > prev2.high && last.low >= prev.low * 0.995 && last.close > last.open);
    const lps15m = last.low >= prev.low && last.close > last.open && last.close >= prev.close && volOK;
    const trigger15mValid = reclaimBreak || miniSpring || breakoutRetest15m || lps15m;
    const fullTriggerValid = trigger15mValid && volOK && (reclaimBreak || breakoutRetest15m || lps15m || (miniSpring && prev.low <= prev2.low * 1.01));
    let label = 'wait';
    if (reclaimBreak) label = 'reclaimBreak';
    else if (breakoutRetest15m) label = 'breakoutRetest15m';
    else if (lps15m) label = 'lps15m';
    else if (miniSpring) label = 'miniSpring';
    return { label, trigger15mValid, fullTriggerValid, reclaimBreak, miniSpring, breakoutRetest15m, lps15m, volOK };
  }

  function calcSmartMoneyScore(structure, vsa, fake, entrySignal) {
    let score = 0;
    if (vsa.label === 'absorption') score += 0.4;
    else if (vsa.label === 'neutral') score += 0.18;
    if (structure.relVol15 >= 1.2) score += 0.15;
    if (structure.label === 'early-phase-d') score += 0.2;
    else if (structure.label === 'phase-candidate') score += 0.1;
    if (['miniSpring','reclaimBreak','breakoutRetest15m','lps15m'].includes(entrySignal)) score += 0.2;
    if (fake.label === 'medium') score -= 0.2;
    if (fake.label === 'high') score -= 0.45;
    return clamp(score, 0, 1);
  }

  function resolveTradeLevels(entry, stop, tp1) {
    const stopDistance = Math.abs(entry - stop);
    const invalidStop = !Number.isFinite(entry) || !Number.isFinite(stop) || stop <= 0 || stop >= entry || stopDistance < entry * 0.003;
    const normalizedStop = invalidStop ? Math.max(entry * 0.985, entry - Math.max(entry * 0.015, 1e-6)) : stop;
    const risk = Math.max(1e-9, entry - normalizedStop);
    const rrRaw = (tp1 - entry) / risk;
    const rr = clamp(rrRaw, 0, 5);
    return { invalidStop, normalizedStop, risk, rr };
  }

  function rrPenalty(entry, stop, tp1) {
    const levels = resolveTradeLevels(entry, stop, tp1);
    let penalty = 0;
    if (levels.invalidStop) penalty -= 20;
    if (levels.rr < 2) penalty -= 4;
    if (levels.rr < 1.6) penalty -= 8;
    if (levels.rr < 1.05) penalty -= 6;
    return { rr: levels.rr, penalty, invalidStop: levels.invalidStop, stop: levels.normalizedStop, risk: levels.risk };
  }

  
function quantRiskLabel(score, edgeScore = 0) {
  if (score >= 76 || edgeScore >= 68) return 'Killer edge';
  if (score >= 60 || edgeScore >= 52) return 'High edge';
  if (score >= 44 || edgeScore >= 32) return 'Tradeable';
  if (score >= 30 || edgeScore >= 18) return 'Watch edge';
  return 'No edge';
}

  function quantOverlay(coin, baseScore, rr, btcContext, setup) {
    const profile = getSetupQuantProfile(setup || coin?.setup || coin?.structureTag || 'Unknown', btcContext);
    const quant = computeQuantStats();
    const regimeFactor = btcContext === 'bull' ? 1.06 : btcContext === 'sideway' ? 0.98 : 0.84;
    const rrFactor = rr >= 2 ? 1.08 : rr >= 1.5 ? 1.0 : rr >= 1.3 ? 0.94 : rr >= 1 ? 0.84 : rr >= 0.8 ? 0.72 : 0.58;
    const qualityFactor = Math.max(0.72, Math.min(1.32, profile.edgeMultiplier || 1));
    const learningFactor = quant.learningMode === 'trained' ? 1.04 : quant.learningMode === 'adaptive' ? 1.0 : 0.96;
    const riskAdjustedScore = clamp(Math.round(baseScore * regimeFactor * rrFactor * qualityFactor * learningFactor), 0, 100);
    const allocationPct = Math.max(0.15, Math.min(1.75, 0.35 + ((riskAdjustedScore - 30) / 85) + ((profile.expectancyR || 0) * 0.10)));
    const riskPct = Math.max(0.15, Math.min(1.0, 0.25 + ((riskAdjustedScore - 35) / 140) + Math.max(-0.08, ((quant.quality || 1) - 1) * 0.18)));

    const confidence = Math.max(0.30, Number(profile.confidence || quant.confidence || 0));
    const confidenceFactor = 0.70 + (confidence * 0.30);
    const baseEdge = Math.max(10, Number(profile.edgeScore || quant.edgeScore || 10));
    const rrEdgeBoost = rr >= 1.8 ? 10 : rr >= 1.4 ? 6 : rr >= 1.2 ? 2 : rr >= 1.0 ? -4 : -10;
    const riskEdgeBlend = Math.max(-10, Math.min(14, (riskAdjustedScore - 44) * 0.40));
    const edgeScore = clamp(
      Math.round((baseEdge * confidenceFactor) + rrEdgeBoost + riskEdgeBlend),
      15,
      100
    );
    const rareSignalReady = edgeScore >= (btcContext === 'sideway' ? 52 : btcContext === 'bear' ? 68 : 64)
      && riskAdjustedScore >= (btcContext === 'sideway' ? 40 : 50)
      && rr >= (btcContext === 'sideway' ? 1.05 : 1.20)
      && (profile.edgeMultiplier || 1) >= (btcContext === 'sideway' ? 0.95 : 1.08);

    return {
      profile,
      quant,
      riskAdjustedScore,
      edgeScore,
      rareSignalReady,
      allocationPct: Number(allocationPct.toFixed(2)),
      riskPct: Number(riskPct.toFixed(2)),
      learningMode: quant.learningMode,
      label: quantRiskLabel(riskAdjustedScore, edgeScore)
    };
  }


function deepScanCandidate(coin, klines, btcContext) {
  const { m15, h4, d1 } = klines;
  if (!m15?.length || !h4?.length || !d1?.length) {
    return { error: 'missing_klines' };
  }

  const cfg = regimeConfig(btcContext);
  const ema15 = scoreEMA(m15);
  const ema4h = scoreEMA(h4);
  const structure = scoreStructure(m15, h4, d1);
  const vsa = scoreVSA(m15);
  const fib = scoreFib(h4);
  const fake = scoreFakePumpRisk(m15);
  const entryScore = scoreEntryQuality(m15);
  const entrySignalMeta = inferInstitutionalEntrySignal(m15);
  const entrySignal = entrySignalMeta.label;

  const entry = h4[h4.length - 1]?.close || coin.lastPrice || 0;
  const rawStop = Math.min(...h4.slice(-12).map(x => x.low));
  const levels = resistanceLevels(h4, d1, entry);
  const chartAware = calcChartAware(h4, fib, ema4h, entry, levels);
  const tp1 = levels.tp1;
  const tp2 = levels.tp2;
  const tp3 = levels.tp3;
  const rrInfo = rrPenalty(entry, rawStop, tp1);
  const stop = rrInfo.stop;

  let rawScore = 0;
  rawScore += Math.min(10, ema15.score);
  rawScore += Math.min(10, ema4h.score);
  rawScore += Math.min(10, structure.score);
  rawScore += Math.min(10, vsa.score);
  rawScore += Math.min(10, fib.score);
  rawScore += chartAware.bonus;

  if (structure.label === 'phase-candidate' && structure.relVol15 >= 1.05) rawScore += 4;
  if (structure.label === 'early-phase-d') rawScore += 5;
  if (structure.relVol15 >= 1.3 && structure.compression >= 0.35) rawScore += 4;
  if (structure.compression >= 0.5 && structure.relVol15 >= 1.0) rawScore += 3;

  if (btcContext === 'bull') rawScore += 4;
  else if (btcContext === 'sideway') rawScore += 1;
  else rawScore -= 5;

  rawScore += entryScore;
  rawScore -= fake.risk;
  if (entrySignal === 'wait') rawScore -= (btcContext === 'sideway' ? 1 : 2);
  if (['reclaimBreak','breakoutRetest15m','lps15m'].includes(entrySignal)) rawScore += 4;
  else if (entrySignal === 'miniSpring') rawScore += 2;
  if (vsa.label === 'neutral') rawScore -= 3;
  if (structure.relVol15 < cfg.minRelVol) rawScore -= 4;
  rawScore += rrInfo.penalty;
  if (fake.label === 'medium') rawScore -= 6;
  if (fake.label === 'high') rawScore -= 12;
  if (rrInfo.invalidStop) rawScore -= 25;
  rawScore -= chartAware.penalty;

  let multiplier = 1.25;
  if (entryScore >= 5 && structure.relVol15 >= 1.4) multiplier = 1.45;
  if (entryScore >= 6 && structure.relVol15 >= 1.8) multiplier = 1.6;
  const rawScoreClamped = clamp(Math.round(rawScore * multiplier), 0, 100);
  let score = rawScoreClamped;

  if (entryScore < 5) score = Math.min(score, 86);
  if (entryScore < 4) score = Math.min(score, 80);
  if (entryScore < 3) score = Math.min(score, 72);
  if (fake.label === 'high') score = Math.min(score, 70);
  if (vsa.label === 'weak') score = Math.min(score, 78);
  if (coin.quoteVolume > cfg.maxQuoteVolume) score = Math.min(score, 84);

  const setup =
    structure.label === 'early-phase-d' ? 'Early Phase D'
    : structure.label === 'phase-candidate' ? 'Phase C Candidate'
    : structure.label === 'early-watch' ? 'Early Watch'
    : 'No setup';

  const quantMeta = quantOverlay(coin, score, rrInfo.rr, btcContext, setup);
  const smartMoneyScore = calcSmartMoneyScore(structure, vsa, fake, entrySignal);
  const strategyMode = btcContext === 'sideway' ? 'mean_reversion_mode' : 'trend_follow_mode';
  const hardRejectReasons = [];
  const softWarnings = [];

  const liquiditySufficient = coin.quoteVolume >= Math.max(2_000_000, cfg.minQuoteVolume * 0.9) && structure.relVol15 >= 0.8;
  const liquiditySoft = coin.quoteVolume >= Math.max(1_600_000, cfg.minQuoteVolume * 0.75) && structure.relVol15 >= 0.72;
  const phaseWindow = structure.label === 'phase-candidate' || structure.label === 'early-phase-d';
  const structureSoft = structure.label === 'early-watch' || structure.label === 'unclear';
  const smartProfile = getSmartExecutionProfile(btcContext, ST.scanMeta?.insight?.marketHealthScore);
  const readyRRValid = rrInfo.rr >= smartProfile.readyRRFloor;
  const scalpRRValid = rrInfo.rr >= smartProfile.scalpRRFloor && rrInfo.rr <= Math.max(1.8, smartProfile.readyRRFloor);
  const scalpRRTooLow = rrInfo.rr < smartProfile.scalpRRFloor;
  const adaptiveRRFloor = smartProfile.unlockRRFloor;
  const adaptiveConfFloor = smartProfile.confFloor;
  const polishRRValid = rrInfo.rr >= adaptiveRRFloor;
  const polishEntryValid = chartAware.entryQuality === 'entry_good' || chartAware.entryQuality === 'stability_probe' || chartAware.entryQuality === 'neutral' || (btcContext !== 'bear' && chartAware.entryQuality === 'entry_late') || (smartProfile.modeBias === 'expansion' && chartAware.entryQuality === 'wait_retest');
  const scalpRRTooHigh = rrInfo.rr > Math.max(1.8, smartProfile.readyRRFloor);
  const readyScoreValid = score >= 50;
  const scalpScoreValid = score >= Math.min(cfg.scalpThreshold, 14);
  const earlyScoreValid = score >= 20;
  const fullTriggerValid = entrySignalMeta.fullTriggerValid;
  const trigger15mValid = entrySignalMeta.trigger15mValid;
  const structureStrongForScalp = phaseWindow || (structure.label === 'early-watch' && structure.score >= 6);
  const preTriggerScalp = !trigger15mValid
    && scalpScoreValid
    && structureStrongForScalp
    && liquiditySoft
    && !scalpRRTooLow
    && fake.label !== 'high'
    && smartMoneyScore >= 0.16;
  const nearMissUnlock = earlyScoreValid
    && phaseWindow
    && liquiditySoft
    && rrInfo.rr >= 0.95
    && fake.label !== 'high'
    && (structure.score >= 4 || entryScore >= 4 || (score >= 24 && rrInfo.rr >= 1.05))
    && smartMoneyScore >= 0.08;
  const playableUnlock = btcContext === 'sideway'
    && score >= 14
    && (phaseWindow || structure.score >= 4)
    && liquiditySoft
    && rrInfo.rr >= 0.95
    && fake.label !== 'high'
    && smartMoneyScore >= 0.08
    && chartAware.entryQuality !== 'structure_risk';
  const scalpExecutionRRValid = !scalpRRTooLow;
  const fakePumpBlocked = fake.label === 'high';

  if (fakePumpBlocked) hardRejectReasons.push('fake_pump_high');
  if (rrInfo.invalidStop) hardRejectReasons.push('invalid_stop');
  if (structure.relVol15 > 10) hardRejectReasons.push('blowoff');
  if (!liquiditySoft) softWarnings.push('volume_weak');
  if (structureSoft) softWarnings.push('structure_soft');
  if (!trigger15mValid) softWarnings.push('wait_trigger_15m');
  if (scalpRRTooLow || (readyScoreValid && !readyRRValid)) softWarnings.push('rr_suboptimal');
  if (scalpRRTooHigh && (trigger15mValid || preTriggerScalp) && !readyScoreValid) softWarnings.push('scalp_only');
  if (vsa.label === 'weak') softWarnings.push('vsa_weak');
  if (chartAware.entryQuality === 'wait_retest') softWarnings.push('wait_retest');
  if (chartAware.entryQuality === 'entry_late') softWarnings.push('entry_late');
  if (playableUnlock && !nearMissUnlock) softWarnings.push('playable_setup');
  if (chartAware.entryQuality === 'structure_risk') softWarnings.push('chart_structure_risk');
  const scalpConfidenceBase = clamp(0.34 + (score / 100) * 0.22 + Math.min(0.18, Math.max(0, rrInfo.rr - 1.0) * 0.12) + Math.min(0.16, Math.max(0, structure.relVol15 - 0.8) * 0.10) + Math.min(0.16, smartMoneyScore * 0.30) + Math.min(0.10, Math.max(0, chartAware.bonus) * 0.02) - (fake.label === 'medium' ? 0.06 : 0) - (vsa.label === 'weak' ? 0.05 : 0) - (chartAware.overextended ? 0.06 : 0), 0.35, 0.92);
  const polishConfFloor = scalpConfidenceBase >= adaptiveConfFloor;
  const confirmTiming = trigger15mValid && entryScore >= 6 && structure.relVol15 >= 1.2 && chartAware.entryQuality === 'entry_good';
  const activeTiming = trigger15mValid && entryScore >= smartProfile.triggerFloor && ['entry_good','neutral','wait_retest'].includes(chartAware.entryQuality);
  const playableTiming = !trigger15mValid && playableUnlock && (entryScore >= 3 || structure.score >= 5);
  const probeTiming = !trigger15mValid && (nearMissUnlock || executionUnlock || preTriggerScalp || proPlayable);
  let entryTiming = confirmTiming ? 'confirm' : activeTiming ? 'active' : playableTiming ? 'playable_probe' : probeTiming ? ((chartAware.entryQuality === 'entry_good' && rrInfo.rr >= Math.max(1.0, smartProfile.unlockRRFloor)) ? 'early_probe' : 'pre_trigger') : 'watch';
  if (chartAware.entryQuality === 'entry_late' && entryTiming === 'confirm') entryTiming = 'active';
  if (chartAware.entryQuality === 'entry_late' && entryTiming === 'active') entryTiming = 'playable_probe';
  let positionStage = entryTiming === 'confirm' ? 'confirm' : entryTiming === 'active' ? 'active' : (entryTiming === 'early_probe' || entryTiming === 'playable_probe') ? 'probe' : 'watch';
  if (chartAware.entryQuality === 'neutral' && positionStage === 'active') positionStage = 'probe';
  if (chartAware.entryQuality === 'entry_late' && positionStage !== 'watch') positionStage = 'probe';
  const proPlayable = btcContext === 'sideway'
    && score >= 16
    && phaseWindow
    && liquiditySoft
    && rrInfo.rr >= 1.05
    && fake.label !== 'high'
    && smartMoneyScore >= 0.10
    && chartAware.entryQuality !== 'structure_risk'
    && (trigger15mValid || entryScore >= 4 || ['entry_good','neutral','wait_retest'].includes(chartAware.entryQuality));
  if (fake.label === 'medium') softWarnings.push('fake_pump_medium');
  if (smartMoneyScore < 0.28) softWarnings.push('smart_money_weak');

  let status = 'AVOID';
  let readyLight = false;
  let scalpReady = false;

  const readyPass = !fakePumpBlocked
    && readyScoreValid
    && fullTriggerValid
    && liquiditySufficient
    && readyRRValid
    && phaseWindow
    && smartMoneyScore >= 0.38;

  const executionUnlock = !fakePumpBlocked
    && liquiditySoft
    && (phaseWindow || structure.score >= 4)
    && score >= 14
    && rrInfo.rr >= 0.95
    && smartMoneyScore >= 0.08
    && ['entry_good','neutral','entry_late','wait_retest'].includes(chartAware.entryQuality)
    && polishRRValid
    && (trigger15mValid || preTriggerScalp || nearMissUnlock || playableUnlock || proPlayable || (entryTiming === 'pre_trigger' && (entryScore >= 3 || structure.score >= 5)));

  const scalpReadyPass = !fakePumpBlocked
    && (scalpScoreValid || nearMissUnlock || playableUnlock || proPlayable || executionUnlock || (score >= 18 && phaseWindow && !scalpRRTooLow && fake.label !== 'high'))
    && (trigger15mValid || preTriggerScalp || nearMissUnlock || playableUnlock || proPlayable || executionUnlock)
    && liquiditySoft
    && (scalpExecutionRRValid || playableUnlock || proPlayable || executionUnlock)
    && polishRRValid
    && polishEntryValid
    && polishConfFloor
    && smartMoneyScore >= (executionUnlock ? 0.08 : (proPlayable ? 0.10 : (playableUnlock ? 0.10 : (nearMissUnlock ? 0.12 : 0.16))))
    && (structureStrongForScalp || nearMissUnlock || playableUnlock || proPlayable || executionUnlock)
    && chartAware.entryQuality !== 'structure_risk';

  const playablePass = !fakePumpBlocked
    && liquiditySoft
    && (phaseWindow || structure.score >= 4)
    && score >= 12
    && rrInfo.rr >= smartProfile.playableRRFloor
    && smartMoneyScore >= 0.08
    && chartAware.entryQuality !== 'structure_risk'
    && ['entry_good','neutral','entry_late','wait_retest'].includes(chartAware.entryQuality)
    && (trigger15mValid || preTriggerScalp || entryScore >= 3 || playableUnlock || proPlayable);

  const probePass = !fakePumpBlocked
    && liquiditySoft
    && (phaseWindow || structure.score >= 4)
    && score >= 10
    && rrInfo.rr >= smartProfile.probeRRFloor
    && smartMoneyScore >= 0.06
    && chartAware.entryQuality !== 'structure_risk'
    && ['entry_good','neutral','entry_late','wait_retest'].includes(chartAware.entryQuality)
    && (preTriggerScalp || entryScore >= 2 || structure.score >= 4 || nearMissUnlock);

  if (readyPass) {
    status = 'READY';
  } else if (scalpReadyPass) {
    status = 'SCALP_READY';
    readyLight = true;
    scalpReady = true;
    if (!trigger15mValid) softWarnings.push('scalp_only');
    if (nearMissUnlock) softWarnings.push('scalp_from_near_miss');
    if (playableUnlock && !nearMissUnlock) softWarnings.push('playable_execution');
    if (executionUnlock && !playableUnlock && !nearMissUnlock) softWarnings.push('execution_unlock');
    if (proPlayable && !executionUnlock && !nearMissUnlock) softWarnings.push('pro_playable');
  } else if (playablePass) {
    status = 'PLAYABLE';
    readyLight = true;
    softWarnings.push('playable_mode');
  } else if (probePass) {
    status = 'PROBE';
    readyLight = true;
    softWarnings.push('probe_mode');
  } else if (earlyScoreValid && !fakePumpBlocked) {
    status = 'EARLY';
    if (trigger15mValid && liquiditySoft) softWarnings.push('scalp_only');
  }

  if (status === 'SCALP_READY' && (!polishRRValid || !polishEntryValid || !polishConfFloor)) {
    status = 'EARLY';
    scalpReady = false;
    readyLight = false;
    if (!polishRRValid) softWarnings.push('low_rr');
    if (!polishEntryValid) softWarnings.push('bad_entry');
    if (!polishConfFloor) softWarnings.push('low_conf');
  }
  if ((status === 'PLAYABLE' || status === 'PROBE') && !polishEntryValid) {
    status = 'EARLY';
    readyLight = false;
    softWarnings.push('bad_entry');
  }
  return {
    id: `${coin.base}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
    symbol: coin.base,
    name: coin.base,
    source: 'LIVE',
    fromHybrid: false,
    fromCG: false,
    cap: 0,
    volume24h: coin.quoteVolume,
    pumpRecent: safeNum(coin.priceChangePercent24h),
    pump7d: 0,
    priceChange24h: safeNum(coin.priceChangePercent24h),
    price: coin.lastPrice,
    entry, stop, tp1, tp2, tp3,
    phase: (status === 'READY' || status === 'SCALP_READY') ? 'D' : (status === 'PLAYABLE' || status === 'PROBE' || status === 'EARLY') ? 'C' : 're',
    status,
    structure: structure.label === 'unclear' ? 'unclear' : 'clear',
    setup,
    structureTag: structure.label,
    relVol: structure.relVol15,
    ltfEntryTag: structure.relVol15 >= 1.4 ? '15m_active' : '15m_weak',
    htfBias: ema4h.state === 'bull' ? 'bullish' : ema4h.state === 'improving' ? 'sideway' : 'bearish',
    fakePumpRisk: fake.label,
    vsaTag: vsa.label,
    fib: fib.zone,
    athChange: 0,
    score,
    rawScore: rawScoreClamped,
    finalScore: score,
    riskAdjustedScore: quantMeta.riskAdjustedScore,
    rejected: status === 'AVOID',
    rejectReasons: hardRejectReasons,
    warnings: softWarnings,
    entrySignal,
    rr: rrInfo.rr,
    quantEdge: quantMeta.profile,
    quantLabel: status === 'PLAYABLE' ? 'Playable setup' : status === 'PROBE' ? 'Probe setup' : (scalpReady ? (trigger15mValid ? 'Scalp ready' : (executionUnlock ? 'Scalp ready (execution unlock)' : (proPlayable ? 'Pro playable' : (nearMissUnlock ? 'Scalp ready (near-miss)' : (playableUnlock ? 'Playable execution' : 'Scalp ready (unlock)'))))) : readyLight ? 'Ready (light)' : quantMeta.label),
    executionTier: status,
    smartMoneyScore,
    strategyMode,
    edgeScore: quantMeta.edgeScore,
    executionConfidence: Number((status === 'READY' ? clamp(0.62 + scalpConfidenceBase * 0.30, 0.62, 0.96) : (status === 'PLAYABLE' ? clamp(Math.max(0.50, scalpConfidenceBase), 0.50, 0.78) : (status === 'PROBE' ? clamp(Math.max(0.45, scalpConfidenceBase), 0.45, 0.72) : scalpConfidenceBase))).toFixed(2)),
    executionMode: (((smartProfile.modeBias === 'expansion' || btcContext === 'bull') && phaseWindow && rrInfo.rr >= 1.35 && structure.relVol15 >= 1.25 && smartMoneyScore >= 0.14 && ['confirm','active'].includes(entryTiming)) || (status === 'READY' && rrInfo.rr >= 1.25)) ? 'EXPANSION' : (['SCALP_READY','PLAYABLE','PROBE'].includes(status) ? 'SCALP' : 'WATCH'),
    capitalBucket: (((smartProfile.modeBias === 'expansion' || btcContext === 'bull') && phaseWindow && rrInfo.rr >= 1.35 && structure.relVol15 >= 1.25 && smartMoneyScore >= 0.14 && ['confirm','active'].includes(entryTiming)) || (status === 'READY' && rrInfo.rr >= 1.25)) ? 'trend' : (['SCALP_READY','PLAYABLE','PROBE'].includes(status) ? 'mean_reversion' : 'observe'),
    entryTiming,
    positionStage,
    chartEntryQuality: chartAware.entryQuality,
    chartBias: chartAware.bias,
    chartStretchPct: chartAware.distE20,
    rareSignalReady: quantMeta.rareSignalReady,
    readyLight,
    scalpReady,
    allocationPct: status === 'PLAYABLE' ? Number(clamp((quantMeta.allocationPct || 0.35) * (0.16 + scalpConfidenceBase * 0.22), 0.06, 0.22).toFixed(2)) : status === 'PROBE' ? Number(clamp((quantMeta.allocationPct || 0.30) * (0.12 + scalpConfidenceBase * 0.18), 0.04, 0.16).toFixed(2)) : (scalpReady ? Number(clamp((quantMeta.allocationPct || 0.4) * ((positionStage === 'probe' ? 0.14 : positionStage === 'active' ? 0.22 : positionStage === 'confirm' ? 0.32 : 0.12) + scalpConfidenceBase * 0.34), 0.08, 0.48).toFixed(2)) : readyLight ? Number(clamp((quantMeta.allocationPct || 0.5) * 0.58, 0.12, 0.80).toFixed(2)) : quantMeta.allocationPct),
    riskPct: status === 'READY' ? 0.25 : status === 'SCALP_READY' ? Number(clamp((positionStage === 'confirm' ? 0.05 : positionStage === 'active' ? 0.035 : 0.02) + (scalpConfidenceBase * 0.02), 0.02, 0.08).toFixed(2)) : status === 'PLAYABLE' ? Number(clamp(0.018 + (scalpConfidenceBase * 0.012), 0.02, 0.05).toFixed(2)) : status === 'PROBE' ? Number(clamp(0.012 + (scalpConfidenceBase * 0.008), 0.01, 0.03).toFixed(2)) : 0,
    scoreBreakdown: {
      structure: Math.min(10, structure.score),
      volume: Math.min(10, Math.round(structure.relVol15 * 4)),
      fib: Math.min(10, fib.score),
      ema: Math.min(10, ema4h.score),
      resistance: Math.min(10, Math.round(Math.max(0, rrInfo.rr) * 2)),
      btc: btcContext === 'bull' ? 4 : btcContext === 'sideway' ? 1 : -4,
      cleanliness: fake.label === 'low' ? 8 : fake.label === 'medium' ? 4 : 0,
      entry: entryScore,
      quant: Math.round((quantMeta.profile.edgeMultiplier || 1) * 10),
      riskAdjusted: Math.round((quantMeta.riskAdjustedScore || 0) / 10),
      edge: Math.round((quantMeta.edgeScore || 0) / 10)
    },
    notes: [
      `Adaptive institutional mode`,
      `Smart ${smartProfile.label}`,
      `Strategy ${scalpReady ? 'execution_scalp_mode' : strategyMode}`,
      `Liquidity ${Math.round(coin.quoteVolume / 1e6)}M USDT/24h`,
      `Compression ${(structure.compression * 100).toFixed(0)}%`,
      `RelVol ${structure.relVol15.toFixed(1)}x`,
      `Entry ${entryScore}/8`,
      `Timing ${entryTiming}`,
      `ExecConf ${(status === 'READY' ? clamp(0.62 + scalpConfidenceBase * 0.30, 0.62, 0.96) : scalpConfidenceBase).toFixed(2)}`,
      `Chart ${chartAware.entryQuality}`,
      `Stretch ${chartAware.distE20}%`,
      `Trigger ${entrySignal}`,
      `SM ${(smartMoneyScore * 100).toFixed(0)}%`,
      `RR ${rrInfo.rr.toFixed(1)}x`,
      `Raw ${rawScoreClamped}`,
      `RiskAdj ${quantMeta.riskAdjustedScore}`,
      `Edge ${quantMeta.edgeScore}`,
      `Quant ${(quantMeta.profile.edgeMultiplier || 1).toFixed(2)}x`,
      `VSA ${vsa.label}`,
      `Fib ${fib.zone}`
    ].join(' · '),
    narratives: [],
    upgradeCondition: entrySignal === 'wait' ? 'Cần reclaim / spring-test xác nhận' : 'Giữ volume > 1.2x và không mất đáy gần nhất'
  };
}



function getStabilitySnapshot() {
  const raw = ST.scanMeta?.stability && typeof ST.scanMeta.stability === 'object' ? ST.scanMeta.stability : {};
  return {
    asOf: Number(raw.asOf) || 0,
    recentBySymbol: raw.recentBySymbol && typeof raw.recentBySymbol === 'object' ? raw.recentBySymbol : {},
    topSymbols: Array.isArray(raw.topSymbols) ? raw.topSymbols : [],
    lastHealthScore: Number(raw.lastHealthScore) || 0,
  };
}

function hasSevereReject(coin) {
  const reasons = Array.isArray(coin.rejectReasons) ? coin.rejectReasons : [];
  return coin.fakePumpRisk === 'high' || coin.chartEntryQuality === 'structure_risk' || reasons.includes('invalid_stop') || reasons.includes('fake_pump_high');
}

function getRiskCutFromHealth(healthScore) {
  const score = Number(healthScore || 0);
  return score > 0 && score < 5 ? 0.75 : 1;
}

function getSmartExecutionProfile(btcContext, healthScore) {
  const health = Number(healthScore || 0);
  const weakTape = health > 0 && health < 5;
  const strongTape = health >= 6.5;
  if (btcContext === 'bull') {
    return {
      modeBias: strongTape ? 'expansion' : 'hybrid',
      readyRRFloor: strongTape ? 1.65 : 1.8,
      scalpRRFloor: 1.1,
      unlockRRFloor: 0.9,
      playableRRFloor: 0.9,
      probeRRFloor: 0.78,
      confFloor: strongTape ? 0.58 : 0.62,
      latePenalty: strongTape ? 0.92 : 0.82,
      triggerFloor: strongTape ? 3 : 4,
      label: strongTape ? 'trend_acceleration' : 'bull_hybrid'
    };
  }
  if (btcContext === 'bear') {
    return {
      modeBias: 'defensive',
      readyRRFloor: 2.0,
      scalpRRFloor: 1.3,
      unlockRRFloor: 1.0,
      playableRRFloor: 1.0,
      probeRRFloor: 0.9,
      confFloor: 0.68,
      latePenalty: 0.72,
      triggerFloor: 5,
      label: 'defensive_breakdown'
    };
  }
  return {
    modeBias: weakTape ? 'scalp' : 'balanced',
    readyRRFloor: weakTape ? 1.9 : 1.8,
    scalpRRFloor: weakTape ? 1.15 : 1.2,
    unlockRRFloor: weakTape ? 0.88 : 0.95,
    playableRRFloor: weakTape ? 0.88 : 0.95,
    probeRRFloor: weakTape ? 0.72 : 0.65,
    confFloor: weakTape ? 0.48 : 0.50,
    latePenalty: weakTape ? 0.80 : 0.88,
    triggerFloor: weakTape ? 3 : 4,
    label: weakTape ? 'sideway_scalp' : 'sideway_balanced'
  };
}

function getSmartRRFloor(status, btcContext, chartEntryQuality) {
  const latePenalty = chartEntryQuality === 'entry_late' ? 0.10 : chartEntryQuality === 'wait_retest' ? 0.05 : 0;
  if (status === 'READY') return 1.50 + latePenalty;
  if (status === 'SCALP_READY') return 1.30 + latePenalty;
  if (status === 'PLAYABLE') return 1.20 + latePenalty;
  if (status === 'PROBE') return 1.00 + latePenalty;
  return btcContext === 'sideway' ? 0.95 : 1.05;
}

function getSmartComboScore(coin) {
  return Number((((coin.executionConfidence || 0) * 100) * Math.max(0, coin.rr || 0)).toFixed(1));
}

function getSmartComboFloor(status) {
  if (status === 'READY') return 82;
  if (status === 'SCALP_READY') return 72;
  if (status === 'PLAYABLE') return 66;
  if (status === 'PROBE') return 58;
  return 0;
}

function demoteForHardGate(coin, reason) {
  const severe = hasSevereReject(coin) || reason === 'invalid_stop';
  coin.warnings = Array.from(new Set([...(coin.warnings || []), reason]));
  coin.executionMode = 'WATCH';
  coin.scaleInReady = false;
  coin.scaleOutPlan = 'skip';
  coin.riskPct = 0;
  coin.allocationPct = 0;
  coin.addOnPct = 0;
  coin.executionGatePassed = false;
  if (severe) {
    coin.status = 'AVOID';
    coin.executionTier = 'AVOID';
    coin.quantLabel = 'No edge';
    coin.rejected = true;
    return;
  }
  coin.status = 'EARLY';
  coin.executionTier = 'EARLY';
  coin.positionStage = 'watch';
  coin.quantLabel = reason === 'smart_filter_combo' ? 'Early watch (combo weak)' : 'Early watch (rr weak)';
}

function applyStabilityMemory(results, stabilityState) {
  const now = Date.now();
  const holdMs = 20 * 60 * 1000;
  return results.map(c => {
    const prev = stabilityState.recentBySymbol?.[c.symbol];
    c.stabilityBoost = 0;
    c.stabilityHold = false;
    if (!prev || !prev.ts || (now - prev.ts) > holdMs) return c;
    if (hasSevereReject(c)) return c;

    let bonus = 0;
    if (prev.status === 'READY' || prev.status === 'SCALP_READY') bonus += 4;
    else if (prev.status === 'EARLY') bonus += 2;
    if ((stabilityState.topSymbols || []).includes(c.symbol)) bonus += 3;

    const scoreDelta = (prev.score || 0) - (c.score || 0);
    if (scoreDelta <= 8) bonus += 2;
    else if (scoreDelta <= 14) bonus += 1;

    if (c.chartEntryQuality === 'wait_retest' || c.chartEntryQuality === 'entry_late') bonus += 1;
    if ((c.executionConfidence || 0) >= 0.45) bonus += 1;

    c.stabilityBoost = bonus;

    if (c.status === 'AVOID' && (prev.status === 'READY' || prev.status === 'SCALP_READY' || prev.status === 'EARLY')) {
      const currentScore = Number(c.score || 0);
      const currentRaw = Number(c.rawScore || 0);
      if (currentScore >= Math.max(12, (prev.score || 0) - 14) && currentRaw >= 10) {
        c.status = 'EARLY';
        c.rejected = false;
        c.stabilityHold = true;
        c.quantLabel = 'Stability hold';
        c.warnings = [...new Set([...(Array.isArray(c.warnings) ? c.warnings : []), 'stability_hold'])];
      }
    }
    return c;
  });
}

function updateStabilityMemory(sorted, top3, insight) {
  const now = Date.now();
  const keepMs = 45 * 60 * 1000;
  const prev = getStabilitySnapshot();
  const recentBySymbol = {};
  const healthScore = Number(insight?.marketHealthScore ?? prev?.lastHealthScore ?? 0);
  const riskCut = healthScore > 0 && healthScore < 5 ? 0.75 : 1;
  Object.entries(prev.recentBySymbol || {}).forEach(([sym, row]) => {
    if (row && row.ts && (now - row.ts) <= keepMs) recentBySymbol[sym] = row;
  });
  sorted.forEach(c => {
    c.executionMode = c.executionMode || (((c.rr || 0) >= 1.35 && (c.relVol || 0) >= 1.35) ? 'EXPANSION' : (c.status === 'SCALP_READY' ? 'SCALP' : 'WATCH'));
    if (c.status === 'READY') {
      c.positionStage = 'confirm';
      c.riskPct = Number((0.18 * (typeof riskCut === 'number' ? riskCut : 1)).toFixed(2));
      c.allocationPct = Number(clamp((c.allocationPct || 0.55) * (0.95 + ((c.executionConfidence || 0.7) - 0.5) * 0.28), 0.20, 1.10).toFixed(2));
      c.addOnPct = Number(Math.min(0.08, c.riskPct * 0.45).toFixed(2));
    } else if (c.status === 'SCALP_READY' || c.status === 'PLAYABLE' || c.status === 'PROBE') {
      const latePenalty = c.chartEntryQuality === 'entry_late' ? 0.78 : c.chartEntryQuality === 'wait_retest' ? 0.88 : c.chartEntryQuality === 'neutral' ? 0.92 : 1;
      const mode = c.executionMode || 'SCALP';
      const stage = c.positionStage === 'confirm' ? 'confirm' : c.positionStage === 'active' ? 'active' : 'probe';
      const statusRiskScale = c.status === 'PLAYABLE' ? 0.65 : c.status === 'PROBE' ? 0.42 : 1;
      const baseRiskMap = mode === 'EXPANSION' ? { probe: 0.05, active: 0.09, confirm: 0.14 } : { probe: 0.03, active: 0.05, confirm: 0.07 };
      const baseAllocMap = mode === 'EXPANSION' ? { probe: 0.18, active: 0.32, confirm: 0.50 } : { probe: 0.10, active: 0.18, confirm: 0.28 };
      const confScale = 0.80 + (c.executionConfidence || 0.45) * 0.40;
      c.riskPct = Number((Math.max(c.status === 'PROBE' ? 0.01 : mode === 'EXPANSION' ? 0.03 : 0.02, Math.min(c.status === 'PROBE' ? 0.03 : mode === 'EXPANSION' ? 0.16 : 0.08, baseRiskMap[stage] * (typeof riskCut === 'number' ? riskCut : 1) * latePenalty * confScale * statusRiskScale))).toFixed(2));
      c.allocationPct = Number(clamp(baseAllocMap[stage] * (typeof riskCut === 'number' ? riskCut : 1) * latePenalty * confScale * statusRiskScale, c.status === 'PROBE' ? 0.04 : mode === 'EXPANSION' ? 0.12 : 0.06, c.status === 'PROBE' ? 0.16 : mode === 'EXPANSION' ? 0.75 : 0.42).toFixed(2));
      c.addOnPct = stage === 'confirm' ? Number(Math.min(mode === 'EXPANSION' ? 0.08 : 0.04, c.riskPct * 0.55).toFixed(2)) : stage === 'active' ? Number(Math.min(mode === 'EXPANSION' ? 0.05 : 0.025, c.riskPct * 0.40).toFixed(2)) : Number(Math.min(mode === 'EXPANSION' ? 0.025 : 0.012, c.riskPct * 0.22).toFixed(2));
      c.scaleInReady = c.status !== 'PROBE' && ((mode === 'EXPANSION' && ['active','confirm'].includes(stage) && (c.rr || 0) >= 1.4) || (mode === 'SCALP' && stage === 'confirm' && (c.rr || 0) >= 1.2));
      c.scaleOutPlan = c.status === 'PROBE' ? 'quick_take' : ((c.rr || 0) >= 1.8 ? 'tp_ladder' : ((c.rr || 0) >= 1.2 ? 'tp1_reduce' : 'quick_take'));
    }
  });
  ST.scanMeta.stability = {
    asOf: now,
    recentBySymbol,
    topSymbols: (top3 || []).map(c => c.symbol),
    lastHealthScore: Number(insight?.marketHealthScore || 0),
  };
}

function applyBalancedRanking(results, btcContext, stabilityState = getStabilitySnapshot()) {
  const readyCap = results.length < 18 ? 4 : 5;
  const stableProbeCandidates = results
    .filter(x => x.status === 'EARLY' && btcContext === 'sideway' && !hasSevereReject(x) && (x.stabilityBoost || 0) >= 3 && (x.executionConfidence || 0) >= 0.45 && (x.score || 0) >= 26 && (((x.relVol || 0) >= 0.9) || ((x.smartMoneyScore || 0) >= 0.12) || ((x.structureScore || 0) >= 6)))
    .sort((a,b) => ((b.executionConfidence || 0) - (a.executionConfidence || 0)) || ((b.score || 0) - (a.score || 0)));
  stableProbeCandidates.slice(0, 2).forEach(c => {
    c.status = 'SCALP_READY';
    c.readyLight = true;
    c.stabilityProbe = true;
    if (!c.positionStage || c.positionStage === 'watch' || c.positionStage === 'active') c.positionStage = 'probe';
    if (!c.entryTiming || c.entryTiming === 'pre_trigger' || c.entryTiming === 'active') c.entryTiming = 'stability_probe';
    c.executionConfidence = Number(Math.min(0.70, Math.max(0.45, (c.executionConfidence || 0) * 0.85 + ((c.stabilityBoost || 0) * 0.02)) ).toFixed(2));
    c.quantLabel = 'Scalp ready (stability probe)';
  });
  const ready = results.filter(x => ['READY','SCALP_READY','PLAYABLE','PROBE'].includes(x.status));
  ready.forEach(c => {
    const volBonus = Math.min(10, (c.relVol || 0) * 4);
    const rrComponent = Math.min(30, (c.rr || 0) * 10);
    const entryComponent = Math.min(16, (c.scoreBreakdown?.entry || 0) * 2);
    const fakePenalty = c.fakePumpRisk === 'medium' ? 6 : c.fakePumpRisk === 'high' ? 12 : 0;
    const bootstrapPenalty = c.learningMode === 'bootstrap' ? 6 : 0;
    const smartMoneyBonus = Math.min(12, (c.smartMoneyScore || 0) * 12);
    const chartBonus = c.chartEntryQuality === 'entry_good' ? 8 : c.chartEntryQuality === 'wait_retest' ? 4 : c.chartEntryQuality === 'entry_late' ? -1 : c.chartEntryQuality === 'structure_risk' ? -8 : 0;
    const confidenceBonus = Math.min(12, (c.executionConfidence || 0) * 12);
    const stabilityBonus = Number(c.stabilityBoost || 0) + (((stabilityState.topSymbols || []).includes(c.symbol) && !hasSevereReject(c)) ? 1.5 : 0);
    const stopPenalty = Math.abs((c.entry || 0) - (c.stop || 0)) < (c.entry || 1) * 0.003 ? 18 : 0;
    c.rankScore = Number((
      (c.edgeScore || 0) * 0.30 +
      (c.riskAdjustedScore || 0) * 0.25 +
      rrComponent * 0.20 +
      entryComponent * 0.15 +
      volBonus * 0.10 +
      smartMoneyBonus +
      confidenceBonus +
      chartBonus +
      (c.stabilityProbe ? 6 : 0) +
      stabilityBonus -
      fakePenalty -
      bootstrapPenalty -
      stopPenalty
    ).toFixed(2));
  });
  ready.sort((a,b) => (b.rankScore || 0) - (a.rankScore || 0));
  ready.slice(readyCap).forEach(c => {
    c.status = 'EARLY';
    c.readyLight = false;
    c.quantLabel = 'Demoted from READY';
  });

  ready.forEach(c => {
    if (c.status === 'SCALP_READY' && (c.rankScore || 0) >= 22 && (c.executionConfidence || 0) >= 0.42) c.quantLabel = c.stabilityProbe ? 'Scalp ready (stability probe)' : (c.entryTiming === 'confirm' ? 'Scalp ready (confirm)' : (c.entryTiming === 'playable_probe' ? 'Pro playable' : (c.entryTiming === 'stability_probe' ? 'Scalp ready (stability probe)' : (c.entryTiming === 'pre_trigger' ? 'Scalp ready (execution unlock)' : (c.entryTiming === 'early_probe' ? 'Scalp ready (probe)' : 'Scalp ready')))));
  ready.forEach(c => { if (c.status === 'PLAYABLE') c.quantLabel = 'Playable setup'; if (c.status === 'PROBE') c.quantLabel = 'Probe setup'; });
  });
  let currentReady = ready.slice(0, readyCap);
  if (!currentReady.length && btcContext === 'sideway') {
    const fallback = results
      .filter(c => c.status === 'EARLY' && !hasSevereReject(c) && (c.executionConfidence || 0) >= 0.42 && (c.score || 0) >= 20)
      .sort((a,b) => ((b.stabilityBoost || 0) - (a.stabilityBoost || 0)) || ((b.executionConfidence || 0) - (a.executionConfidence || 0)) || ((b.score || 0) - (a.score || 0)))
      .slice(0, 1);
    fallback.forEach(c => {
      c.status = (c.score || 0) >= 24 ? 'PLAYABLE' : 'PROBE';
      c.readyLight = true;
      c.stabilityProbe = true;
      c.positionStage = 'probe';
      c.entryTiming = 'stability_probe';
      c.executionConfidence = Number(Math.min(0.62, Math.max(0.45, c.executionConfidence || 0.45)).toFixed(2));
      c.rankScore = Number(Math.max(12, c.rankScore || c.score || 12).toFixed(2));
      c.quantLabel = c.status === 'PLAYABLE' ? 'Playable setup (adaptive unblock)' : 'Probe setup (adaptive unblock)';
      ready.push(c);
    });
    currentReady = ready.slice(0, readyCap);
  }
  const selected = [];
  const setupCounts = new Map();
  for (const c of currentReady) {
    const minRankFloor = c.status === 'SCALP_READY' ? (c.stabilityProbe ? 8 : 10) : c.status === 'PLAYABLE' ? 12 : c.status === 'PROBE' ? 8 : 35;
    if ((c.rankScore || 0) < minRankFloor) {
      if (c.status === 'SCALP_READY' || c.status === 'PLAYABLE' || c.status === 'PROBE') {
        c.quantLabel = c.status === 'SCALP_READY' ? 'Scalp ready (quality floor)' : c.status === 'PLAYABLE' ? 'Playable setup (quality floor)' : 'Probe setup (quality floor)';
      } else {
        c.status = 'EARLY';
        c.quantLabel = 'Below Top3 quality floor';
        continue;
      }
    }
    const key = c.setup || c.structureTag || 'unknown';
    const count = setupCounts.get(key) || 0;
    if (count >= 2) {
      c.status = 'EARLY';
      c.quantLabel = 'Demoted for setup crowding';
      continue;
    }
    selected.push(c);
    setupCounts.set(key, count + 1);
    if (selected.length >= 4) break;
  }
  return {
    sorted: results.sort((a,b) => (((['READY','SCALP_READY','PLAYABLE','PROBE'].includes(b.status)) ? 1 : 0) - ((['READY','SCALP_READY','PLAYABLE','PROBE'].includes(a.status)) ? 1 : 0)) || ((b.rankScore || b.edgeScore || b.riskAdjustedScore || b.score) - (a.rankScore || a.edgeScore || a.riskAdjustedScore || a.score))),
    top3: selected,
    readyCap,
  };
}

function buildInsight(results, stabilityState = getStabilitySnapshot()) {
  const analyzedCount = results.length;
  const qualified = results.filter(x => ['READY','SCALP_READY','PLAYABLE','PROBE'].includes(x.status));
  const early = results.filter(x => x.status === 'EARLY');
  const playable = results.filter(x => x.status === 'PLAYABLE');
  const probe = results.filter(x => x.status === 'PROBE');
  const noTradeReasons = [];

  if (!qualified.length) {
    if (playable.length || probe.length) noTradeReasons.push('Market yếu nhưng vẫn có lớp PLAYABLE / PROBE để vào size nhỏ có kiểm soát.');
    else if (early.length) noTradeReasons.push('Market sideway / trigger institutional chưa đủ đẹp, nhưng vẫn có coin để theo dõi.');
    else noTradeReasons.push('Không có coin nào đạt chuẩn vào lệnh');
  }

  const rejectionSummaryMap = new Map();
  results.forEach(c => {
    (c.rejectReasons || []).forEach(r => rejectionSummaryMap.set(r, (rejectionSummaryMap.get(r) || 0) + 1));
    (c.warnings || []).forEach(r => rejectionSummaryMap.set(r, (rejectionSummaryMap.get(r) || 0) + 1));
  });

  const rawMarketHealthScore = qualified.length >= 3 ? 8 : qualified.length >= 1 ? 5 : early.length >= 3 ? 4 : 2;
  const blendedHealth = stabilityState.lastHealthScore > 0 ? ((rawMarketHealthScore * 0.7) + (stabilityState.lastHealthScore * 0.3)) : rawMarketHealthScore;
  const marketHealthScore = Number(blendedHealth.toFixed(1));
  const marketHealth = marketHealthScore >= 7 ? 'healthy' : marketHealthScore >= 4 ? 'thin' : 'weak';

  return {
    marketHealth,
    marketHealthScore,
    qualifiedCount: qualified.length,
    analyzedCount,
    noTradeReasons,
    nearMisses: results
      .filter(c => !['READY','SCALP_READY','PLAYABLE','PROBE'].includes(c.status) && (c.score || 0) >= 30)
      .sort((a,b) => b.score - a.score)
      .slice(0, 5)
      .map(c => ({ symbol: c.symbol, score: c.score, reason: [c.setup || c.structureTag || 'No setup', c.chartEntryQuality].filter(Boolean).join(' · ') })),
    rejectionSummary: [...rejectionSummaryMap.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a,b) => b.count - a.count),
  };
}


function applyQualityTierLock(c) {
  const rr = Number(c.rr || 0);
  const conf = Number(c.executionConfidence || 0);
  const chartEntryQuality = c.chartEntryQuality || 'neutral';
  const hardBestEligible = c.status === 'READY' || (c.status === 'PLAYABLE' && conf >= 0.68 && rr >= 1.6 && chartEntryQuality === 'entry_good' && c.entryTiming !== 'entry_late');

  if (['SCALP_READY','PLAYABLE','PROBE'].includes(c.status) && rr < 1.2) {
    c.status = 'EARLY';
    c.executionTier = 'EARLY';
    c.executionGatePassed = false;
    c.quantLabel = 'RR floor blocked';
    c.rejectReasons = Array.from(new Set([...(c.rejectReasons || []), 'rr_too_low']));
  }

  if (c.status === 'SCALP_READY' && (chartEntryQuality === 'entry_late' || c.entryTiming === 'entry_late')) {
    c.status = 'PLAYABLE';
    c.executionTier = 'PLAYABLE';
    c.quantLabel = 'Playable setup (late entry penalty)';
    c.warnings = Array.from(new Set([...(c.warnings || []), 'entry_late_penalty']));
  }

  if (c.status === 'PLAYABLE' && chartEntryQuality === 'entry_late' && rr < 1.35) {
    c.status = 'PROBE';
    c.executionTier = 'PROBE';
    c.quantLabel = 'Probe setup (late entry penalty)';
    c.warnings = Array.from(new Set([...(c.warnings || []), 'entry_late_penalty']));
  }

  c.hardBestEligible = !!hardBestEligible;
  return c;
}



function buildPortfolioPlan(sorted, btcContext) {
  const totalRiskCap = btcContext === 'bull' ? 0.85 : btcContext === 'sideway' ? 0.55 : 0.32;
  const maxPositions = btcContext === 'bull' ? 4 : btcContext === 'sideway' ? 4 : 2;
  const eligible = sorted
    .filter(c => ['READY','SCALP_READY','PLAYABLE','PROBE'].includes(c.status))
    .sort((a,b) => ((b.executionConfidence || 0) - (a.executionConfidence || 0)) || ((b.rankScore || 0) - (a.rankScore || 0)))
    .slice(0, maxPositions);
  let remaining = totalRiskCap;
  const positions = eligible.map((c, idx) => {
    const stage = c.positionStage || (c.entryTiming === 'confirm' ? 'confirm' : c.entryTiming === 'active' ? 'active' : 'probe');
    const mode = c.executionMode || (((c.rr || 0) >= 1.35 && (c.relVol || 0) >= 1.35) ? 'EXPANSION' : 'SCALP');
    const riskLadder = mode === 'EXPANSION'
      ? { probe: 0.07, active: 0.12, confirm: 0.18 }
      : { probe: 0.03, active: 0.05, confirm: 0.08 };
    const allocLadder = mode === 'EXPANSION'
      ? { probe: 0.20, active: 0.35, confirm: 0.55 }
      : { probe: 0.10, active: 0.18, confirm: 0.28 };
    const desiredBase = c.status === 'READY'
      ? Math.min(mode === 'EXPANSION' ? 0.22 : 0.12, c.riskPct || (mode === 'EXPANSION' ? 0.15 : 0.08))
      : c.status === 'SCALP_READY'
        ? Math.min(mode === 'EXPANSION' ? 0.15 : 0.09, c.riskPct || (mode === 'EXPANSION' ? 0.12 : 0.06))
        : c.status === 'PLAYABLE'
          ? Math.min(mode === 'EXPANSION' ? 0.10 : 0.06, c.riskPct || 0.05)
          : Math.min(mode === 'EXPANSION' ? 0.06 : 0.04, c.riskPct || 0.03);
    const qualityPenalty = c.chartEntryQuality === 'entry_late' ? 0.72 : c.chartEntryQuality === 'neutral' ? 0.86 : c.chartEntryQuality === 'wait_retest' ? 0.80 : 1.0;
    const healthPenalty = btcContext === 'sideway' ? 0.90 : btcContext === 'breakdown' ? 0.65 : 1.0;
    const confBoost = Math.max(0.75, Math.min(1.18, 0.85 + (c.executionConfidence || 0.5) * 0.45));
    const stageKey = stage === 'confirm' ? 'confirm' : stage === 'active' ? 'active' : 'probe';
    const desired = desiredBase * qualityPenalty * healthPenalty * confBoost;
    const stageCap = riskLadder[stageKey];
    const slotsLeft = Math.max(1, eligible.length - idx);
    const assigned = Number(Math.max(0.02, Math.min(desired, stageCap, remaining / slotsLeft)).toFixed(2));
    remaining = Number(Math.max(0, remaining - assigned).toFixed(2));
    const allocationPct = Number(Math.max(c.status === 'PROBE' ? 0.04 : 0.06, Math.min(mode === 'EXPANSION' ? 0.90 : (c.status === 'PLAYABLE' ? 0.28 : c.status === 'PROBE' ? 0.18 : 0.45), allocLadder[stageKey] * qualityPenalty * confBoost * (c.status === 'PLAYABLE' ? 0.65 : c.status === 'PROBE' ? 0.45 : 1))).toFixed(2));
    const addRiskPct = stageKey === 'confirm'
      ? Number(Math.min(mode === 'EXPANSION' ? 0.09 : 0.04, assigned * 0.55).toFixed(2))
      : stageKey === 'active'
        ? Number(Math.min(mode === 'EXPANSION' ? 0.05 : 0.025, assigned * 0.40).toFixed(2))
        : Number(Math.min(mode === 'EXPANSION' ? 0.025 : 0.012, assigned * 0.22).toFixed(2));
    return {
      symbol: c.symbol,
      tier: c.status,
      stage,
      mode,
      confidence: c.executionConfidence || 0,
      timing: c.entryTiming,
      chartEntryQuality: c.chartEntryQuality,
      riskPct: assigned,
      addRiskPct,
      allocationPct,
      entry: c.entry,
      stop: c.stop,
      tp1: c.tp1,
    };
  });
  return {
    mode: btcContext === 'sideway' ? 'dual_mode_sideway' : btcContext === 'bull' ? 'dual_mode_trend' : 'defensive_dual_mode',
    maxPositions,
    totalRiskCap: Number(totalRiskCap.toFixed(2)),
    activeCount: positions.length,
    usedRisk: Number(positions.reduce((a,c)=>a+(c.riskPct||0),0).toFixed(2)),
    scalpCount: positions.filter(p => p.mode === 'SCALP').length,
    expansionCount: positions.filter(p => p.mode === 'EXPANSION').length,
    positions,
    notes: positions.length ? 'v7.2.5 Hard Gate: RR floor + combo floor enforced trước execution, portfolio chỉ nhận setup vượt gate.' : 'Chưa có portfolio trade hợp lệ.'
  };
}

async function run(progressCb = null, opts = {}) {
  const startedAt = Date.now();
  const btcContext = await detectBTCContext();
  const cfg = regimeConfig(btcContext);
  progressCb?.('Đang build live universe từ Binance...', 10);

  const liveUniverse = await buildLiveUniverse({
    minQuoteVolume: opts.minQuoteVolume || cfg.minQuoteVolume,
    maxQuoteVolume: opts.maxQuoteVolume || cfg.maxQuoteVolume,
    minTrades: opts.minTrades || cfg.minTrades,
    maxAbs24hPump: opts.maxAbs24hPump || cfg.maxAbs24hPump,
  });

  progressCb?.(`Universe: ${liveUniverse.length} coin đủ thanh khoản`, 25);

  const candidates = preFilterCandidates(liveUniverse, {
    minPreScore: opts.minPreScore || 4,
    maxCandidates: opts.maxCandidates || cfg.maxCandidates,
  });

  progressCb?.(`Shortlist: ${candidates.length} coin`, 35);

  const results = [];
  const fetchFailedSymbols = [];
  const stabilityState = getStabilitySnapshot();

  for (let i = 0; i < candidates.length; i++) {
    const coin = candidates[i];
    try {
      const klines = await fetchMulti(coin.symbol);
      const row = deepScanCandidate(coin, klines, btcContext);
      if (row?.error) fetchFailedSymbols.push(coin.symbol);
      else if (row) results.push(row);
    } catch {
      fetchFailedSymbols.push(coin.symbol);
    }
    const pct = 35 + Math.round(((i + 1) / Math.max(candidates.length, 1)) * 55);
    progressCb?.(`Đang scan ${i + 1}/${candidates.length}: ${coin.symbol}`, pct);
    await sleep(100);
  }

  const stabilizedResults = applyStabilityMemory(results, stabilityState);
  const ranked = applyBalancedRanking(stabilizedResults, btcContext, stabilityState);
  const sorted = ranked.sorted;
  const insight = buildInsight(sorted, stabilityState);
  const riskCut = getRiskCutFromHealth(insight.marketHealthScore || 0);
  const adaptiveProfile = getSmartExecutionProfile(btcContext, insight.marketHealthScore || 0);
  const adaptiveRRFloor = adaptiveProfile.unlockRRFloor;
  const adaptiveConfFloor = adaptiveProfile.confFloor;
  sorted.forEach(c => {
    c.executionMode = c.executionMode || (((c.rr || 0) >= 1.35 && (c.relVol || 0) >= 1.35) ? 'EXPANSION' : (c.status === 'SCALP_READY' ? 'SCALP' : 'WATCH'));
    if (c.status === 'READY') {
      c.positionStage = 'confirm';
      c.riskPct = Number((0.18 * (typeof riskCut === 'number' ? riskCut : 1)).toFixed(2));
      c.allocationPct = Number(clamp((c.allocationPct || 0.55) * (0.95 + ((c.executionConfidence || 0.7) - 0.5) * 0.28), 0.20, 1.10).toFixed(2));
      c.addOnPct = Number(Math.min(0.08, c.riskPct * 0.45).toFixed(2));
    } else if (c.status === 'SCALP_READY' || c.status === 'PLAYABLE' || c.status === 'PROBE') {
      const latePenalty = c.chartEntryQuality === 'entry_late' ? 0.78 : c.chartEntryQuality === 'wait_retest' ? 0.88 : c.chartEntryQuality === 'neutral' ? 0.92 : 1;
      const mode = c.executionMode || 'SCALP';
      const stage = c.positionStage === 'confirm' ? 'confirm' : c.positionStage === 'active' ? 'active' : 'probe';
      const statusRiskScale = c.status === 'PLAYABLE' ? 0.65 : c.status === 'PROBE' ? 0.42 : 1;
      const baseRiskMap = mode === 'EXPANSION' ? { probe: 0.05, active: 0.09, confirm: 0.14 } : { probe: 0.03, active: 0.05, confirm: 0.07 };
      const baseAllocMap = mode === 'EXPANSION' ? { probe: 0.18, active: 0.32, confirm: 0.50 } : { probe: 0.10, active: 0.18, confirm: 0.28 };
      const confScale = 0.80 + (c.executionConfidence || 0.45) * 0.40;
      c.riskPct = Number((Math.max(c.status === 'PROBE' ? 0.01 : mode === 'EXPANSION' ? 0.03 : 0.02, Math.min(c.status === 'PROBE' ? 0.03 : mode === 'EXPANSION' ? 0.16 : 0.08, baseRiskMap[stage] * (typeof riskCut === 'number' ? riskCut : 1) * latePenalty * confScale * statusRiskScale))).toFixed(2));
      c.allocationPct = Number(clamp(baseAllocMap[stage] * (typeof riskCut === 'number' ? riskCut : 1) * latePenalty * confScale * statusRiskScale, c.status === 'PROBE' ? 0.04 : mode === 'EXPANSION' ? 0.12 : 0.06, c.status === 'PROBE' ? 0.16 : mode === 'EXPANSION' ? 0.75 : 0.42).toFixed(2));
      c.addOnPct = stage === 'confirm' ? Number(Math.min(mode === 'EXPANSION' ? 0.08 : 0.04, c.riskPct * 0.55).toFixed(2)) : stage === 'active' ? Number(Math.min(mode === 'EXPANSION' ? 0.05 : 0.025, c.riskPct * 0.40).toFixed(2)) : Number(Math.min(mode === 'EXPANSION' ? 0.025 : 0.012, c.riskPct * 0.22).toFixed(2));
      c.scaleInReady = c.status !== 'PROBE' && ((mode === 'EXPANSION' && ['active','confirm'].includes(stage) && (c.rr || 0) >= 1.4) || (mode === 'SCALP' && stage === 'confirm' && (c.rr || 0) >= 1.2));
      c.scaleOutPlan = c.status === 'PROBE' ? 'quick_take' : ((c.rr || 0) >= 1.8 ? 'tp_ladder' : ((c.rr || 0) >= 1.2 ? 'tp1_reduce' : 'quick_take'));
    }
  });

  sorted.forEach(c => {
    if (!['READY','SCALP_READY','PLAYABLE','PROBE'].includes(c.status)) return;
    const rrFloor = getSmartRRFloor(c.status, btcContext, c.chartEntryQuality);
    const comboScore = getSmartComboScore(c);
    c.smartFilter = { rrFloor, comboScore };
    const comboFloor = getSmartComboFloor(c.status);
    const rrWeak = (c.rr || 0) < rrFloor;
    const comboWeak = comboScore < comboFloor;
    const execCheck = window.EXEC_GATE?.isExecutable
      ? window.EXEC_GATE.isExecutable(c, { requirePlayable: false, minRR: rrFloor, minConfidence: c.status === 'PROBE' ? 0.40 : 0.45 })
      : { ok: !rrWeak };
    if (rrWeak || comboWeak || !execCheck.ok) {
      demoteForHardGate(c, rrWeak ? 'rr_suboptimal' : 'smart_filter_combo');
    } else {
      c.executionGatePassed = true;
      const rrBoost = Math.max(0.75, Math.min(1.15, ((c.rr || 0) / Math.max(rrFloor, 0.01)) * 0.9));
      const confBoost = Math.max(0.8, Math.min(1.1, 0.85 + (c.executionConfidence || 0.5) * 0.35));
      const smartScale = rrBoost * confBoost;
      const minRisk = c.status === 'PROBE' ? 0.01 : c.status === 'PLAYABLE' ? 0.02 : 0.02;
      const maxRisk = c.status === 'PROBE' ? 0.04 : c.status === 'PLAYABLE' ? 0.06 : (c.executionMode === 'EXPANSION' ? 0.16 : 0.08);
      const minAlloc = c.status === 'PROBE' ? 0.04 : c.status === 'PLAYABLE' ? 0.06 : 0.06;
      const maxAlloc = c.status === 'PROBE' ? 0.18 : c.status === 'PLAYABLE' ? 0.30 : (c.executionMode === 'EXPANSION' ? 0.75 : 0.42);
      c.riskPct = Number(clamp((c.riskPct || minRisk) * smartScale, minRisk, maxRisk).toFixed(2));
      c.allocationPct = Number(clamp((c.allocationPct || minAlloc) * smartScale, minAlloc, maxAlloc).toFixed(2));
      c.addOnPct = Number(clamp((c.addOnPct || 0) * smartScale, 0, c.status === 'PROBE' ? 0.01 : 0.08).toFixed(2));
    }
  });

  sorted.forEach(c => applyQualityTierLock(c));

  sorted.forEach(c => {
    if (!['READY','SCALP_READY','PLAYABLE','PROBE'].includes(c.status)) {
      c.executionGatePassed = false;
    }
  });

  let ready = sorted.filter(x => ['READY','SCALP_READY','PLAYABLE','PROBE'].includes(x.status) && x.executionGatePassed !== false);
  if (!ready.length && btcContext === 'sideway') {
    const fallbackCandidates = sorted.filter(c => c.status === 'EARLY'
      && (c.score || 0) >= 26
      && (c.executionConfidence || 0) >= adaptiveConfFloor
      && (c.rr || 0) >= Math.max(0.4, adaptiveRRFloor - 0.1)
      && c.chartEntryQuality !== 'structure_risk'
      && !(c.rejectReasons || []).includes('invalid_stop')
      && !(c.rejectReasons || []).includes('fake_pump_high'))
      .sort((a,b) => ((b.executionConfidence||0)-(a.executionConfidence||0)) || ((b.score||0)-(a.score||0)))
      .slice(0, 2);
    fallbackCandidates.forEach(c => {
      c.status = (c.score || 0) >= 24 ? 'PLAYABLE' : 'PROBE';
      c.executionTier = c.status;
      c.quantLabel = c.status === 'PLAYABLE' ? 'Playable setup (adaptive unblock)' : 'Probe setup (adaptive unblock)';
      c.entryTiming = c.entryTiming === 'watch' ? 'stability_probe' : c.entryTiming;
      c.positionStage = c.positionStage === 'watch' ? 'probe' : c.positionStage;
      c.executionConfidence = Number(Math.max(c.executionConfidence || 0, adaptiveConfFloor).toFixed(2));
      c.warnings = Array.from(new Set([...(c.warnings || []), 'adaptive_unblock']));
      c.executionMode = c.executionMode === 'WATCH' ? 'SCALP' : c.executionMode;
    });
    ready = sorted.filter(x => ['READY','SCALP_READY','PLAYABLE','PROBE'].includes(x.status) && x.executionGatePassed !== false);
  }
  const portfolio = buildPortfolioPlan(sorted.filter(c => c.executionGatePassed !== false), btcContext);
  const early = sorted.filter(x => x.status === 'EARLY');
  const avoid = sorted.filter(x => x.status === 'AVOID');
  const top3 = ranked.top3;

  ST.coins = sorted;
  ST.scanMeta.lastScan = Date.now();
  ST.scanMeta.source = 'REAL_TRADER_V730_SMART_EXECUTION';
  ST.scanMeta.top3 = top3;
  updateStabilityMemory(sorted, top3, insight);
  ST.scanMeta.cache = {
    universeCached: false,
    exchangeInfoCached: false,
    liveUniverseCount: liveUniverse.length,
    candidateCount: candidates.length,
    fetchFailedCount: fetchFailedSymbols.length,
    rejectedCount: avoid.length,
    qualifiedCount: ready.length,
    runtimeSeconds: Math.max(1, Math.round((Date.now() - startedAt)/1000)),
    allocationHint: `${Math.max(0.12, Math.min(1.75, ready[0]?.allocationPct || early[0]?.allocationPct || 0.20)).toFixed(2)}%`,
    portfolioRiskUsed: `${(portfolio.usedRisk || 0).toFixed(2)}% / ${(portfolio.totalRiskCap || 0).toFixed(2)}%`,
    portfolioActive: portfolio.activeCount || 0
  };
  ST.scanMeta.regime = {
    noTrade: !ready.length,
    reason: !ready.length ? (early.length ? 'Execution layer v7.2.3 REAL EXECUTION UNLOCK: dynamic RR/conf theo market health; sideway cho phép adaptive probe để tránh over-filter.' : 'Execution layer v7.2.3 REAL EXECUTION UNLOCK: nếu chưa có setup đủ chuẩn, engine sẽ nới ngưỡng có kiểm soát để tránh freeze execution.') : ''
  };
  ST.scanMeta.insight = insight;
  ST.scanMeta.portfolio = portfolio;
  ST.scanMeta.quant = computeQuantStats();
  ST.scanMeta.learning = {
    mode: ST.scanMeta.quant.learningMode,
    confidence: ST.scanMeta.quant.confidence,
    allocationHint: `${Math.max(0.12, Math.min(1.75, ready[0]?.allocationPct || early[0]?.allocationPct || 0.20)).toFixed(2)}%`,
    topSetup: ready[0]?.setup || early[0]?.setup || '',
    portfolioMode: portfolio.mode,
  };
  ST.save();

  window.__lastHybridResult = {
    liveUniverseCount: liveUniverse.length,
    candidateCount: candidates.length,
    fetchFailedSymbols,
    fetchFailRatio: candidates.length ? fetchFailedSymbols.length / candidates.length : 0,
    rejectedCount: avoid.length,
    qualifiedCount: ready.length,
    btcContext
  };

  syncWatchlistFromCoins();
  ST.save();

  // ══ Persist scan + signals to IndexedDB (async, non-blocking) ══
  if (window.DB) {
    const scanRecord = {
      id: `scan-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      btcContext,
      regime: ST.scanMeta.regime || {},
      insight: {
        marketHealth: insight.marketHealth,
        marketHealthScore: insight.marketHealthScore,
        qualifiedCount: insight.qualifiedCount,
        analyzedCount: insight.analyzedCount,
      },
      universeCount: liveUniverse.length,
      candidateCount: candidates.length,
      qualifiedCount: ready.length,
      rejectedCount: avoid.length,
      runtimeSeconds: Math.max(1, Math.round((Date.now() - startedAt) / 1000)),
      source: 'REAL_TRADER_V730_SMART_EXECUTION',
    };

    const persistedCandidates = (sorted || [])
      .filter(c => c && c.symbol)
      .filter(c => Number(c.score || c.riskAdjustedScore || c.edgeScore || 0) > 0 || ['READY','SCALP_READY','PLAYABLE','PROBE','EARLY','AVOID'].includes(c.status));

    const signalRecords = persistedCandidates.map(c => {
      const rejectReason = Array.isArray(c.rejectReasons) && c.rejectReasons.length ? c.rejectReasons[0] : (Array.isArray(c.warnings) && c.warnings.length ? c.warnings[0] : '');
      const signalType = ['READY','SCALP_READY','PLAYABLE'].includes(c.status)
        ? 'playable'
        : c.status === 'PROBE'
          ? 'probe'
          : c.status === 'EARLY'
            ? ((Number(c.score || 0) >= 30 || (Array.isArray(c.warnings) && c.warnings.includes('scalp_from_near_miss'))) ? 'near_miss' : 'watch')
            : c.status === 'AVOID'
              ? 'reject'
              : 'candidate';
      const reasonSeverity = /invalid|fake|stop|rr_|structure_risk|chart_structure_risk/i.test(rejectReason || '')
        ? 'hard'
        : rejectReason
          ? 'soft'
          : 'info';
      return {
        id: `sig-${c.symbol}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        scanId: scanRecord.id,
        symbol: c.symbol,
        timestamp: Date.now(),
        priceAtSignal: c.price || c.entry || 0,
        entry: c.entry || 0,
        stop: c.stop || 0,
        tp1: c.tp1 || 0,
        tp2: c.tp2 || 0,
        tp3: c.tp3 || 0,
        status: c.status || 'UNKNOWN',
        signalType,
        classification: signalType,
        playable: ['READY','SCALP_READY','PLAYABLE'].includes(c.status),
        learningEligible: signalType !== 'candidate',
        setup: c.setup || c.structureTag || 'Unknown',
        score: c.score || 0,
        riskAdjustedScore: c.riskAdjustedScore || c.score || 0,
        edgeScore: c.edgeScore || 0,
        rr: c.rr || 0,
        executionConfidence: c.executionConfidence || 0,
        btcContext,
        fakePumpRisk: c.fakePumpRisk || 'unknown',
        chartEntryQuality: c.chartEntryQuality || 'neutral',
        entryTiming: c.entryTiming || 'unknown',
        smartMoneyScore: c.smartMoneyScore || 0,
        rejectReason,
        rejectSeverity: reasonSeverity,
        outcomesEvaluated: [],
      };
    });

    const fetchFailSignals = fetchFailedSymbols.map(sym => ({
      id: `sig-fetch-fail-${sym}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      scanId: scanRecord.id,
      symbol: String(sym || '').replace(/USDT$/i, ''),
      timestamp: Date.now(),
      status: 'FETCH_FAIL',
      signalType: 'fetch_fail',
      classification: 'fetch_fail',
      playable: false,
      learningEligible: true,
      setup: 'Fetch fail',
      score: 0,
      riskAdjustedScore: 0,
      edgeScore: 0,
      rr: 0,
      executionConfidence: 0,
      btcContext,
      fakePumpRisk: 'unknown',
      chartEntryQuality: 'unknown',
      entryTiming: 'unknown',
      smartMoneyScore: 0,
      rejectReason: 'fetch_fail',
      rejectSeverity: 'info',
      outcomesEvaluated: [],
    }));

    const allSignalRecords = [...signalRecords, ...fetchFailSignals];

    // Fire-and-forget — do not block scanner return
    const atomicWrite = DB.addScanWithSignalsAtomic
      ? DB.addScanWithSignalsAtomic(scanRecord, allSignalRecords)
      : Promise.reject(new Error('addScanWithSignalsAtomic unavailable'));

    atomicWrite
      .catch(err => {
        console.warn('[SCANNER] Atomic persist failed, fallback to non-atomic:', err);
        return DB.addScan(scanRecord).then(() => allSignalRecords.length ? DB.addSignals(allSignalRecords) : 0);
      })
      .then(() => console.log(`[SCANNER] Persisted scan + ${allSignalRecords.length} signals to IndexedDB`))
      .catch(err => console.warn('[SCANNER] IndexedDB persist error:', err));
  }

  progressCb?.('✅ Hard gate scan v7.2.5 hoàn tất', 100);

  return {
    coins: sorted,
    top3,
    liveUniverseCount: liveUniverse.length,
    candidateCount: candidates.length,
    fetchFailedSymbols,
    fetchFailRatio: candidates.length ? fetchFailedSymbols.length / candidates.length : 0,
    btcContext
  };
}
  window.buildTradePlan = function buildTradePlan(coin) {
    const entry = Number(coin?.entry || coin?.price || 0);
    const stop = Number(coin?.stop || 0);
    const tp1 = Number(coin?.tp1 || entry * 1.08);
    const tp2 = Number(coin?.tp2 || Math.max(tp1 * 1.08, entry * 1.16));
    const tp3 = Number(coin?.tp3 || Math.max(tp2 * 1.08, entry * 1.28));
    const rr = clamp((tp1 - entry) / Math.max(1e-9, entry - stop), 0, 5);
    return {
      entry, stop, tp1, tp2, tp3, rr,
      invalid: (!stop || stop >= entry || Math.abs(entry - stop) < entry * 0.003) ? 'Stop chưa hợp lệ - cần widen stop hoặc chờ setup khác' : `Đóng dưới ${stop.toFixed(6)}`,
      riskPct: Number(coin?.riskPct || 0.5),
      allocationPct: Number(coin?.allocationPct || 0.5),
      riskAdjustedScore: Number(coin?.riskAdjustedScore || coin?.score || 0),
      reason: `${coin?.setup || coin?.structureTag || 'Setup'} · Trigger ${coin?.entrySignal || 'wait'} · RR ${rr.toFixed(1)}x · RiskAdj ${Math.round(coin?.riskAdjustedScore || coin?.score || 0)} · Edge ${Math.round(coin?.edgeScore || 0)} · FakePump ${coin?.fakePumpRisk || 'n/a'}`
    };
  };

  return { run };
})();
