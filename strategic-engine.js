/**
 * STRATEGIC COMMAND HUB v10.6.9
 * Multi-Metric Decision Support Layer
 * (Macro Valuation + Sentiment + Dominance)
 */
window.STRATEGIC_ENGINE = (() => {
  const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours
  let lastResult = null;
  let lastExecution = 0;
  const FNG_CACHE_KEY = 'st_strategic_fng_cache';
  let fngSkipNoticeShown = false;

  const RAINBOW_BANDS = [
    { label: "Fire Sale", color: "#00d084", multiplier: 1.50, advice: "Maximum aggressive accumulation. Peak opportunity." },
    { label: "Buy!", color: "#8ed1fc", multiplier: 1.35, advice: "Strong buying interest. Value zone." },
    { label: "Accumulate", color: "#0693e3", multiplier: 1.20, advice: "Dollar cost average mode. Stay steady." },
    { label: "Still Cheap", color: "#abb8c3", multiplier: 1.10, advice: "Market is neutral/undervalued. Hold position." },
    { label: "HODL!", color: "#ffeb3b", multiplier: 1.00, advice: "Wait and see. No aggressive moves." },
    { label: "Is this a bubble?", color: "#ffa000", multiplier: 0.85, advice: "Caution increasing. Start partial profit taking." },
    { label: "FOMO Intensifies", color: "#ff5722", multiplier: 0.70, advice: "Extreme foam. Tighten stop losses." },
    { label: "Sell. Seriously.", color: "#f44336", multiplier: 0.50, advice: "Heavy distribution zone. Exit laggards." },
    { label: "Maximum Bubble", color: "#9c27b0", multiplier: 0.25, advice: "Extreme risk. Exit liquidity mode. Cash is king." }
  ];

  function readCachedFng() {
    try {
      const cached = JSON.parse(localStorage.getItem(FNG_CACHE_KEY) || 'null');
      if (!cached || typeof cached !== 'object') return null;
      const value = parseInt(cached.value, 10);
      if (!Number.isFinite(value)) return null;
      return {
        value,
        label: String(cached.label || 'Neutral'),
        timestamp: Number(cached.timestamp || 0) || Date.now()
      };
    } catch (_) {
      return null;
    }
  }

  function writeCachedFng(payload) {
    try {
      localStorage.setItem(FNG_CACHE_KEY, JSON.stringify(payload));
    } catch (_) { }
  }

  function resolveFngEndpoint() {
    const configured = String(
      window.ST?.config?.strategic?.fngProxyUrl ||
      localStorage.getItem('st_fng_proxy_url') ||
      ''
    ).trim();
    return configured || '';
  }

  async function fetchFearAndGreed() {
    try {
      const endpoint = resolveFngEndpoint();
      if (!endpoint) {
        const cached = readCachedFng();
        if (!fngSkipNoticeShown) {
          console.info('[STRATEGIC] F&G direct browser fetch disabled (CORS-prone). Using cached/default sentiment.');
          fngSkipNoticeShown = true;
        }
        return cached || { value: 50, label: 'Neutral', timestamp: Date.now() };
      }
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(endpoint, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error('F&G API Down');
      const json = await res.json();
      if (!json || !Array.isArray(json.data) || !json.data[0]) throw new Error('Invalid F&G Data');
      
      const val = parseInt(json.data[0].value);
      const payload = {
        value: val,
        label: json.data[0].value_classification || 'Neutral',
        timestamp: Date.now()
      };
      writeCachedFng(payload);
      return payload;
    } catch (err) {
      console.warn('[STRATEGIC] F&G Fetch Error:', err);
      return readCachedFng() || { value: 50, label: 'Neutral', timestamp: Date.now() };
    }
  }

  async function fetchBtcDominance() {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch('https://api.coingecko.com/api/v3/global', { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error('CG Global API Down');
      const json = await res.json();
      if (!json || !json.data || !json.data.market_cap_percentage || typeof json.data.market_cap_percentage.btc !== 'number') {
        throw new Error('Invalid Dominance Data');
      }
      const btcDom = json.data.market_cap_percentage.btc;
      return {
        value: parseFloat(btcDom),
        change24h: 0,
        timestamp: Date.now()
      };
    } catch (err) {
      console.warn('[STRATEGIC] Dominance Fetch Error:', err);
      // Fallback to a neutral dominance value
      return { value: 52, change24h: 0, timestamp: Date.now() };
    }
  }

  function getRainbowValuation(price) {
    if (!price || price <= 0) return null;
    const logPrice = Math.log10(price);
    const startDate = new Date(2009, 0, 3);
    const now = new Date();
    const daysSinceStart = Math.max(1, (now - startDate) / (1000 * 60 * 60 * 24));
    
    // MODIFIED v10.6.9.8: Refined Bitcoin Growth Regression (Linear-Log approximation)
    const regression = 1.05 + 0.00021 * daysSinceStart; 
    const priceOffset = (logPrice - regression) / 0.125;
    const bandIndex = Math.max(0, Math.min(8, Math.floor(priceOffset + 4.5)));
    
    return {
      zoneIndex: bandIndex,
      ...RAINBOW_BANDS[bandIndex],
      offset: parseFloat(priceOffset.toFixed(2))
    };
  }

  async function syncAll(btcPrice) {
    if (!btcPrice) return lastResult;
    
    const now = Date.now();
    const isStale = !lastExecution || (now - lastExecution > CACHE_TTL);

    if (lastResult && !isStale) {
      console.log('[STRATEGIC] Using cached metrics (valid for 6h)');
      lastResult.rainbow = getRainbowValuation(btcPrice);
      return lastResult;
    }

    console.log('[STRATEGIC] Cache stale or missing. Fetching fresh metrics...');
    
    try {
      const [fng, dom] = await Promise.all([
        fetchFearAndGreed(),
        fetchBtcDominance()
      ]);

      const rainbow = getRainbowValuation(btcPrice);
      let mult = 1.0;
      if (rainbow) mult *= rainbow.multiplier;
      
      let fngFact = 1.0;
      if (fng.value > 75) fngFact = 0.8;
      else if (fng.value < 25) fngFact = 1.25;
      mult *= fngFact;

      let domFact = 1.0;
      if (dom.value > 55) domFact = 0.85;
      mult *= domFact;

      lastResult = {
        timestamp: Date.now(),
        rainbow,
        fng,
        dominance: dom,
        riskMultiplier: parseFloat(mult.toFixed(2)),
        factors: {
          rainbow: rainbow ? rainbow.multiplier : 1.0,
          fng: fngFact,
          dominance: domFact
        },
        verdict: generateVerdict(rainbow, fng, dom)
      };
      lastExecution = now;
      
      console.log('[STRATEGIC] Sync complete. Multiplier:', lastResult.riskMultiplier);
      return lastResult;
    } catch (err) {
      console.error('[STRATEGIC] Critical Sync Failure:', err);
      return lastResult || { 
        riskMultiplier: 1.0, 
        verdict: 'Strategics Unavailable' 
      };
    }
  }

  function generateVerdict(rainbow, fng, dom) {
    if (!rainbow) return "Wait for scan...";
    
    const isGreed = fng.value > 75;
    const isFear = fng.value < 25;
    const isBubble = rainbow.zoneIndex >= 7;
    const isUndervalued = rainbow.zoneIndex <= 2;
    const domSurge = dom.value > 56;

    // SCENARIO 1: Extreme Overheat
    if (isBubble && isGreed) return "🛑 EXTREME OVERHEAT: Multi-index distribution detected. Do not chase. Focus on exiting position liquidity.";
    // SCENARIO 2: Value Opportunity
    if (isUndervalued && isFear) return "💎 VALUE ZONE: Maximum fear in accumulation zone. High conviction for building core positions.";
    // SCENARIO 3: Dominance Suck
    if (domSurge) return "⚠️ BTC DOMINANCE HIGH: Bitcoin sucking market liquidity. Reduce Altcoin size or focus only on Top-Tier setups.";
    // SCENARIO 4: Neutrality
    if (fng.value >= 40 && fng.value <= 60 && rainbow.zoneIndex >= 3 && rainbow.zoneIndex <= 5) return "⚖️ NEUTRAL EQUILIBRIUM: Market in balanced range. Stick to intra-day edge and avoid heavy macro bias.";
    
    return rainbow.advice || "Maintain disciplined risk posture.";
  }

  return {
    syncAll,
    getRainbowValuation,
    RAINBOW_BANDS
  };
})();
