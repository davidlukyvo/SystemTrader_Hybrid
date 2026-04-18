/* ══════════════════════════════════════════════════════════
   COINGECKO UNIVERSE LAYER — legacy fallback universe
   Dùng cho universe/fallback theo market cap, volume, ATH distance.
   Không phải scanner runtime chính.
   Scanner runtime hiện tại là Binance-first.
   Không dùng trực tiếp làm nguồn vào lệnh.
   CG_LOCAL_SEED chỉ nên được xem là emergency fallback.
   ══════════════════════════════════════════════════════════ */


const CG_LOCAL_SEED = [
  { id: 'dego-finance', symbol: 'DEGO', name: 'Dego Finance', market_cap: 42000000, total_volume: 5200000, current_price: 0.37, price_change_percentage_24h_in_currency: 3.2, price_change_percentage_7d_in_currency: 9.5, price_change_percentage_30d_in_currency: 22.0, ath: 33.8, ath_change_percentage: -98.9, circulating_supply: 114000000, total_supply: 21000000, max_supply: 21000000 },
  { id: 'dusk-network', symbol: 'DUSK', name: 'Dusk', market_cap: 96000000, total_volume: 8800000, current_price: 0.20, price_change_percentage_24h_in_currency: 2.1, price_change_percentage_7d_in_currency: 7.2, price_change_percentage_30d_in_currency: 18.4, ath: 1.1, ath_change_percentage: -81.8, circulating_supply: 500000000, total_supply: 500000000, max_supply: 1000000000 },
  { id: 'alpaca-finance', symbol: 'ALPACA', name: 'Alpaca Finance', market_cap: 34000000, total_volume: 4700000, current_price: 0.12, price_change_percentage_24h_in_currency: 1.8, price_change_percentage_7d_in_currency: 6.4, price_change_percentage_30d_in_currency: 16.3, ath: 8.6, ath_change_percentage: -98.6, circulating_supply: 151000000, total_supply: 188000000, max_supply: 188000000 },
  { id: 'myneighboralice', symbol: 'ALICE', name: 'My Neighbor Alice', market_cap: 79000000, total_volume: 9300000, current_price: 0.78, price_change_percentage_24h_in_currency: 2.6, price_change_percentage_7d_in_currency: 8.1, price_change_percentage_30d_in_currency: 19.7, ath: 42.5, ath_change_percentage: -98.2, circulating_supply: 92000000, total_supply: 100000000, max_supply: 100000000 },
  { id: 'tokocrypto', symbol: 'TKO', name: 'Toko Token', market_cap: 82000000, total_volume: 6100000, current_price: 0.24, price_change_percentage_24h_in_currency: 1.4, price_change_percentage_7d_in_currency: 5.0, price_change_percentage_30d_in_currency: 11.1, ath: 4.9, ath_change_percentage: -95.1, circulating_supply: 345000000, total_supply: 500000000, max_supply: 500000000 },
  { id: 'nkn', symbol: 'NKN', name: 'NKN', market_cap: 60000000, total_volume: 7200000, current_price: 0.08, price_change_percentage_24h_in_currency: 2.9, price_change_percentage_7d_in_currency: 10.2, price_change_percentage_30d_in_currency: 24.8, ath: 1.48, ath_change_percentage: -94.6, circulating_supply: 754000000, total_supply: 1000000000, max_supply: 1000000000 },
  { id: 'vividt', symbol: 'VIDT', name: 'VIDT DAO', market_cap: 28000000, total_volume: 3800000, current_price: 0.03, price_change_percentage_24h_in_currency: 1.1, price_change_percentage_7d_in_currency: 4.8, price_change_percentage_30d_in_currency: 12.2, ath: 1.7, ath_change_percentage: -98.3, circulating_supply: 1000000000, total_supply: 1000000000, max_supply: 1000000000 },
  { id: 'biswap', symbol: 'BSW', name: 'Biswap', market_cap: 56000000, total_volume: 6400000, current_price: 0.05, price_change_percentage_24h_in_currency: 1.7, price_change_percentage_7d_in_currency: 6.0, price_change_percentage_30d_in_currency: 14.6, ath: 2.13, ath_change_percentage: -97.6, circulating_supply: 1110000000, total_supply: 700000000, max_supply: 700000000 },
  { id: 'beta-finance', symbol: 'BETA', name: 'Beta Finance', market_cap: 43000000, total_volume: 5100000, current_price: 0.06, price_change_percentage_24h_in_currency: 2.0, price_change_percentage_7d_in_currency: 8.9, price_change_percentage_30d_in_currency: 21.0, ath: 4.6, ath_change_percentage: -98.7, circulating_supply: 860000000, total_supply: 1000000000, max_supply: 1000000000 },
  { id: 'mbox', symbol: 'MBOX', name: 'MOBOX', market_cap: 51000000, total_volume: 5900000, current_price: 0.09, price_change_percentage_24h_in_currency: 2.4, price_change_percentage_7d_in_currency: 7.1, price_change_percentage_30d_in_currency: 17.3, ath: 15.4, ath_change_percentage: -99.4, circulating_supply: 551000000, total_supply: 1000000000, max_supply: 1000000000 },
  { id: 'rei-network', symbol: 'REI', name: 'REI Network', market_cap: 47000000, total_volume: 4300000, current_price: 0.04, price_change_percentage_24h_in_currency: 1.2, price_change_percentage_7d_in_currency: 5.6, price_change_percentage_30d_in_currency: 15.0, ath: 0.36, ath_change_percentage: -88.9, circulating_supply: 1000000000, total_supply: 1000000000, max_supply: 1000000000 },
  { id: 'syscoin', symbol: 'SYS', name: 'Syscoin', market_cap: 93000000, total_volume: 7000000, current_price: 0.12, price_change_percentage_24h_in_currency: 1.5, price_change_percentage_7d_in_currency: 4.4, price_change_percentage_30d_in_currency: 10.8, ath: 1.3, ath_change_percentage: -90.8, circulating_supply: 780000000, total_supply: 888000000, max_supply: 888000000 },
  { id: 'rarible', symbol: 'RARE', name: 'SuperRare', market_cap: 89000000, total_volume: 6700000, current_price: 0.11, price_change_percentage_24h_in_currency: 1.9, price_change_percentage_7d_in_currency: 6.7, price_change_percentage_30d_in_currency: 15.9, ath: 3.79, ath_change_percentage: -97.1, circulating_supply: 820000000, total_supply: 1000000000, max_supply: 1000000000 },
  { id: 'hard-protocol', symbol: 'HARD', name: 'Kava Lend', market_cap: 16000000, total_volume: 2300000, current_price: 0.14, price_change_percentage_24h_in_currency: 1.0, price_change_percentage_7d_in_currency: 4.1, price_change_percentage_30d_in_currency: 9.9, ath: 2.97, ath_change_percentage: -95.3, circulating_supply: 114000000, total_supply: 200000000, max_supply: 200000000 },
  { id: 'wing-finance', symbol: 'WING', name: 'Wing Finance', market_cap: 41000000, total_volume: 2600000, current_price: 6.4, price_change_percentage_24h_in_currency: 0.8, price_change_percentage_7d_in_currency: 3.2, price_change_percentage_30d_in_currency: 8.6, ath: 249.5, ath_change_percentage: -97.4, circulating_supply: 6400000, total_supply: 10000000, max_supply: 10000000 },
  { id: 'phb', symbol: 'PHB', name: 'Phoenix', market_cap: 98000000, total_volume: 12000000, current_price: 0.91, price_change_percentage_24h_in_currency: 2.8, price_change_percentage_7d_in_currency: 9.8, price_change_percentage_30d_in_currency: 27.4, ath: 4.1, ath_change_percentage: -77.8, circulating_supply: 54000000, total_supply: 64000000, max_supply: 64000000 },
  { id: 'quickswap', symbol: 'QUICK', name: 'QuickSwap', market_cap: 30000000, total_volume: 3500000, current_price: 0.03, price_change_percentage_24h_in_currency: 1.6, price_change_percentage_7d_in_currency: 6.9, price_change_percentage_30d_in_currency: 13.4, ath: 0.22, ath_change_percentage: -86.4, circulating_supply: 1000000000, total_supply: 1000000000, max_supply: 1000000000 },
  { id: 'bluzelle', symbol: 'BLZ', name: 'Bluzelle', market_cap: 68000000, total_volume: 8200000, current_price: 0.14, price_change_percentage_24h_in_currency: 2.3, price_change_percentage_7d_in_currency: 7.7, price_change_percentage_30d_in_currency: 18.6, ath: 0.91, ath_change_percentage: -84.6, circulating_supply: 500000000, total_supply: 500000000, max_supply: 500000000 },
  { id: 'lever', symbol: 'LEVER', name: 'LeverFi', market_cap: 74000000, total_volume: 9100000, current_price: 0.0018, price_change_percentage_24h_in_currency: 2.1, price_change_percentage_7d_in_currency: 8.0, price_change_percentage_30d_in_currency: 20.1, ath: 0.0053, ath_change_percentage: -66.0, circulating_supply: 41000000000, total_supply: 55000000000, max_supply: 55000000000 },
  { id: 'hooked-protocol', symbol: 'HOOK', name: 'Hooked Protocol', market_cap: 95000000, total_volume: 11000000, current_price: 0.45, price_change_percentage_24h_in_currency: 1.9, price_change_percentage_7d_in_currency: 6.1, price_change_percentage_30d_in_currency: 14.2, ath: 4.07, ath_change_percentage: -88.9, circulating_supply: 215000000, total_supply: 500000000, max_supply: 500000000 },
  { id: 'dia-data', symbol: 'DIA', name: 'DIA', market_cap: 66000000, total_volume: 4400000, current_price: 0.52, price_change_percentage_24h_in_currency: 1.1, price_change_percentage_7d_in_currency: 4.0, price_change_percentage_30d_in_currency: 10.4, ath: 5.79, ath_change_percentage: -91.0, circulating_supply: 126000000, total_supply: 200000000, max_supply: 200000000 },
  { id: 'zcash', symbol: 'ZEC', name: 'Zcash', market_cap: 850000000, total_volume: 45000000, current_price: 31.5, price_change_percentage_24h_in_currency: 0.5, price_change_percentage_7d_in_currency: 1.2, ath: 3191, ath_change_percentage: -99.0, circulating_supply: 15000000, total_supply: 21000000, max_supply: 21000000 }
];

function trackCGUsage(method, meta = {}) {
  try {
    const audit = window.__CG_AUDIT || {
      loadedAt: Date.now(),
      calls: {},
      lastCall: null,
      firstUseLogged: false,
    };
    audit.calls[method] = Number(audit.calls[method] || 0) + 1;
    audit.lastCall = {
      method,
      at: Date.now(),
      meta,
    };
    window.__CG_AUDIT = audit;
    if (!audit.firstUseLogged) {
      audit.firstUseLogged = true;
      console.info('[CG AUDIT] Runtime path hit', { method, meta });
    }
  } catch (_) { }
}

const CG = {
  BASE: 'https://api.coingecko.com/api/v3',
  UNIVERSE_FRESH_TTL: 30 * 60 * 1000,
  UNIVERSE_STALE_TTL: 24 * 60 * 60 * 1000,
  UNIVERSE_SNAPSHOT_KEY(minM, maxM) { return `cg:universe:snapshot:${minM}:${maxM}`; },
  UNIVERSE_LIVE_KEY(minM, maxM) { return `cg:universe:live:${minM}:${maxM}`; },
  UNIVERSE_SEED_KEY(minM, maxM) { return `cg:universe:seed:${minM}:${maxM}`; },

  async fetchMarketsPage({ vsCurrency = 'usd', page = 1, perPage = 100, order = 'market_cap_asc', force = false } = {}) {
    trackCGUsage('fetchMarketsPage', { page, perPage, order, force });
    const cacheKey = `cg:markets:${vsCurrency}:${page}:${perPage}:${order}`;
    const freshTtl = 2 * 60 * 1000;
    const staleTtl = 60 * 60 * 1000;
    if (!force && window.CACHE) {
      const cached = CACHE.get(cacheKey, freshTtl);
      if (cached) return cached;
    }
    const url = new URL(`${this.BASE}/coins/markets`);
    url.searchParams.set('vs_currency', vsCurrency);
    url.searchParams.set('order', order);
    url.searchParams.set('per_page', String(perPage));
    url.searchParams.set('page', String(page));
    url.searchParams.set('sparkline', 'false');
    url.searchParams.set('price_change_percentage', '24h,7d,30d');

    try {
      const rows = await retryFetchJson(url.toString(), {}, 4, 1400, 'cg');
      if (window.CACHE) CACHE.set(cacheKey, rows);
      return rows;
    } catch (err) {
      const stale = window.CACHE ? CACHE.get(cacheKey, staleTtl) : null;
      if (stale?.length) {
        console.warn('[COINGECKO STALE CACHE FALLBACK]', page, err?.message || err);
        return stale;
      }
      throw err;
    }
  },

  async fetchByMarketCap(minM = 5, maxM = 100, pages = 3, force = false) {
    trackCGUsage('fetchByMarketCap', { minM, maxM, pages, force });
    const freshKey = this.UNIVERSE_LIVE_KEY(minM, maxM);
    const snapshotKey = this.UNIVERSE_SNAPSHOT_KEY(minM, maxM);
    const pageHintKey = `cg:rangehint:${minM}:${maxM}`;
    const minCap = minM * 1e6;
    const maxCap = maxM * 1e6;

    const seededUniverse = this.getSeedUniverse(minM, maxM);
    const freshUniverse = window.CACHE ? CACHE.get(freshKey, this.UNIVERSE_FRESH_TTL) : null;
    if (!force && freshUniverse?.length) return freshUniverse;

    const snapshotUniverse = window.CACHE ? CACHE.get(snapshotKey, this.UNIVERSE_STALE_TTL) : null;
    if (!force && snapshotUniverse?.length) {
      this.refreshUniverseInBackground({ minM, maxM, pages, pageHintKey }).catch(err => {
        console.warn('[CG BACKGROUND REFRESH]', err?.message || err);
      });
      return snapshotUniverse;
    }

    const live = await this.fetchUniverseWindow({ minM, maxM, pages, pageHintKey, force });
    if (live?.length) {
      if (window.CACHE) {
        CACHE.set(freshKey, live);
        CACHE.set(snapshotKey, live);
      }
      return live;
    }

    const staleUniverse = window.CACHE ? CACHE.get(snapshotKey, this.UNIVERSE_STALE_TTL) : null;
    if (staleUniverse?.length) return staleUniverse;

    if (seededUniverse?.length) {
      if (window.CACHE) CACHE.set(snapshotKey, seededUniverse);
      return seededUniverse;
    }

    if (window.NET_GUARD?.getCooldownLeftMs?.()) {
      throw new Error(`CoinGecko đang cooldown ${NET_GUARD.formatLeft()}. Đợi rồi scan lại. App đã chuyển sang seed local nếu có.`);
    }
    throw new Error('CoinGecko chưa trả được universe phù hợp và seed local cũng chưa sẵn. Đợi 1-2 phút rồi scan lại.');
  },

  async refreshUniverseInBackground({ minM = 5, maxM = 100, pages = 2, pageHintKey = '' } = {}) {
    trackCGUsage('refreshUniverseInBackground', { minM, maxM, pages, background: true });
    if (window.__cgUniverseRefreshInFlight) return window.__cgUniverseRefreshInFlight;
    if (window.NET_GUARD?.getCooldownLeftMs?.()) return null;
    const freshKey = this.UNIVERSE_LIVE_KEY(minM, maxM);
    const snapshotKey = this.UNIVERSE_SNAPSHOT_KEY(minM, maxM);
    window.__cgUniverseRefreshInFlight = this.fetchUniverseWindow({ minM, maxM, pages, pageHintKey, force: false, background: true })
      .then((rows) => {
        if (rows?.length && window.CACHE) {
          CACHE.set(freshKey, rows);
          CACHE.set(snapshotKey, rows);
        }
        return rows;
      })
      .finally(() => {
        window.__cgUniverseRefreshInFlight = null;
      });
    return window.__cgUniverseRefreshInFlight;
  },

  async fetchUniverseWindow({ minM = 5, maxM = 100, pages = 3, pageHintKey = '', force = false, background = false } = {}) {
    trackCGUsage('fetchUniverseWindow', { minM, maxM, pages, force, background });
    const minCap = minM * 1e6;
    const maxCap = maxM * 1e6;
    const hintedPages = (window.CACHE && CACHE.get(pageHintKey, 7 * 24 * 60 * 60 * 1000)) || null;
    const pagePlan = hintedPages?.length
      ? [...new Set([...hintedPages, 3, 4, 5])].slice(0, 4)
      : [3, 4, 5, 6];

    const out = [];
    let enteredRange = false;
    const maxPagesToFetch = Math.max(1, Math.min(3, Number(pages || 2)));

    for (const page of pagePlan.slice(0, maxPagesToFetch)) {
      let rows = [];
      try {
        rows = await this.fetchMarketsPage({ page, perPage: 100, order: 'market_cap_asc', force });
      } catch (err) {
        const msg = String(err?.message || err);
        if (msg.includes('429')) break;
        if (background) break;
        throw err;
      }
      if (!rows.length) break;

      const validCaps = rows.map(row => Number(row.market_cap)).filter(cap => Number.isFinite(cap) && cap > 0);
      if (!validCaps.length) continue;

      const pageMinCap = Math.min(...validCaps);
      const pageMaxCap = Math.max(...validCaps);
      if (pageMaxCap >= minCap) enteredRange = true;

      const inRange = rows.filter(row => {
        const cap = Number(row.market_cap);
        return Number.isFinite(cap) && cap >= minCap && cap <= maxCap;
      });
      if (inRange.length) out.push(...inRange);

      if (enteredRange && window.CACHE) {
        const hinted = CACHE.get(pageHintKey, 7 * 24 * 60 * 60 * 1000) || [];
        const nextHints = [...new Set([...hinted, page])].slice(-2);
        CACHE.set(pageHintKey, nextHints);
      }

      if (enteredRange && pageMinCap > maxCap) break;
      if (out.length >= 12) break;
    }

    const deduped = [];
    const seen = new Set();
    for (const row of out) {
      const key = String(row.id || row.symbol || '');
      if (!key || seen.has(key)) continue;
      seen.add(key);
      deduped.push(row);
    }

    const cleaned = deduped.filter(row => !(window.CLEAN_UNIVERSE?.shouldExclude?.({
      symbol: row.symbol,
      name: row.name,
      id: row.id
    })));

    cleaned.sort((a, b) => Number(a.market_cap || 0) - Number(b.market_cap || 0));
    return cleaned;
  },


  getSeedUniverse(minM = 5, maxM = 100) {
    trackCGUsage('getSeedUniverse', { minM, maxM });
    const minCap = Number(minM) * 1e6;
    const maxCap = Number(maxM) * 1e6;
    const seedKey = this.UNIVERSE_SEED_KEY(minM, maxM);
    const cached = window.CACHE ? CACHE.get(seedKey, 30 * 24 * 60 * 60 * 1000) : null;
    if (cached?.length) return cached;
    const rows = CG_LOCAL_SEED
      .filter(row => {
        const cap = Number(row.market_cap || 0);
        return Number.isFinite(cap) && cap >= minCap && cap <= maxCap;
      })
      .filter(row => !(window.CLEAN_UNIVERSE?.shouldExclude?.({ symbol: row.symbol, name: row.name, id: row.id })))
      .map(row => ({ ...row, source_seed: true }));
    if (rows.length && window.CACHE) CACHE.set(seedKey, rows);
    return rows;
  },

  buildUniverseResultMeta(rows = []) {
    const hasSeed = rows.some(x => x?.source_seed);
    return hasSeed ? 'seed' : 'live';
  },

  mapCoin(cgCoin) {
    const cap = toNumber(cgCoin.market_cap);
    const vol = toNumber(cgCoin.total_volume);
    const price = toNumber(cgCoin.current_price);
    const pump24h = toNumber(cgCoin.price_change_percentage_24h_in_currency ?? cgCoin.price_change_percentage_24h);
    const pump7d = toNumber(cgCoin.price_change_percentage_7d_in_currency);
    const pump30d = toNumber(cgCoin.price_change_percentage_30d_in_currency);
    const athChange = toNumber(cgCoin.ath_change_percentage);
    const fetchedAt = Date.now();

    const phase = inferInitialPhase({ pump7d, pump30d, athChange, price });
    const narratives = inferNarratives(cgCoin.name, cgCoin.symbol, cgCoin.id);
    const volRatio = cap > 0 ? vol / cap : 0;

    return {
      id: cgCoin.id,
      coingeckoId: cgCoin.id,
      symbol: String(cgCoin.symbol || '').toUpperCase(),
      name: cgCoin.name || '',
      image: cgCoin.image || '',
      cap,
      marketCap: cap,
      marketCapRank: toNumber(cgCoin.market_cap_rank),
      volume24h: vol,
      currentPrice: price,
      price,
      priceChange24h: pump24h || 0,
      pumpRecent: Math.max(pump7d || 0, 0),
      pump7d: pump7d || 0,
      pump30d: pump30d || 0,
      ath: toNumber(cgCoin.ath),
      athChange,
      circulatingSupply: toNumber(cgCoin.circulating_supply),
      totalSupply: toNumber(cgCoin.total_supply),
      maxSupply: toNumber(cgCoin.max_supply),
      narratives,
      phase,
      structure: volRatio > 0.15 ? 'clear' : 'unclear',
      setup: phase === 'C' ? 'Potential Spring' : phase === 'D' ? 'Potential LPS' : '',
      volRatio,
      score: autoUniverseScore({ pump7d, pump30d, volRatio, phase, athChange }),
      entry: 0, stop: 0, tp1: 0, tp2: 0, tp3: 0,
      source: cgCoin.source_seed ? 'coingecko-seed' : 'coingecko',
      fetchedAt,
      fromCG: true,
      fromSeed: !!cgCoin.source_seed,
      raw: cgCoin,
      notes: `${cgCoin.source_seed ? '[SEED] ' : ''}24h ${fmtPct(pump24h)} · 7d ${fmtPct(pump7d)} · 30d ${fmtPct(pump30d)} · Vol/Cap ${(volRatio * 100).toFixed(0)}%`,
    };
  },
};

function inferInitialPhase({ pump7d = 0, pump30d = 0, athChange = 0, price = 0 }) {
  if (!Number.isFinite(price) || price <= 0) return 'unknown';
  if (pump30d > 100 || pump7d > 60) return 'dist';
  if (pump7d >= 10 && pump7d <= 45 && pump30d <= 80) return 'D';
  if (pump7d <= 12 && athChange <= -50) return 'C';
  return 'unknown';
}

function inferNarratives(name, symbol, id) {
  const text = `${name || ''} ${symbol || ''} ${id || ''}`.toLowerCase();
  const tags = [];
  if (/ai|artificial|neural|gpt|llm|agent|singularity|fetch|ocean|render|rndr/.test(text)) tags.push('AI');
  if (/depin|iot|helium|geodnet|hivemapper|dimo|react/.test(text)) tags.push('DePIN');
  if (/game|gaming|play|nft|metaverse|axie|gala|myria|beam|xai/.test(text)) tags.push('Gaming');
  if (/rwa|real.world|tokeniz|property|estate|asset/.test(text)) tags.push('RWA');
  if (/infra|layer|protocol|network|chain|node/.test(text)) tags.push('Infra');
  if (/bridge|cross.chain|relay|wormhole|stargate|layerzero/.test(text)) tags.push('Cross-chain');
  if (/privacy|zero.know|zk|secret|monero|zcash|oasis|anon/.test(text)) tags.push('Privacy');
  if (/data|oracle|graph|chainlink|band|api3|flux/.test(text)) tags.push('Data Layer');
  return tags.length ? tags : ['Infra'];
}

function autoUniverseScore({ pump7d = 0, pump30d = 0, volRatio = 0, phase = 'unknown', athChange = 0 }) {
  let score = 30;
  if (phase === 'C') score += 18;
  if (phase === 'D') score += 12;
  if (volRatio > 0.2) score += 10;
  else if (volRatio > 0.08) score += 5;
  if (pump7d > 3 && pump7d < 35) score += 8;
  if (athChange < -80) score += 10;
  else if (athChange < -55) score += 5;
  if (pump30d > 100) score -= 20;
  else if (pump30d > 70) score -= 10;
  return clamp(score, 10, 80);
}

function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function fmtPct(v) {
  return `${Number(v || 0).toFixed(1)}%`;
}
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function retryFetchJson(url, options = {}, retries = 2, delayMs = 2200, channel = 'cg') {
  let lastErr;
  for (let i = 0; i <= retries; i += 1) {
    try {
      if (window.NET_GUARD?.getCooldownLeftMs?.()) {
        throw new Error(`HTTP 429 - cooldown ${window.NET_GUARD?.formatLeft?.() || ''}`.trim());
      }
      await window.NET_GUARD?.waitTurn?.(channel);
      const res = await fetch(url, options);
      if (res.status === 429) {
        const retryAfterHeader = Number(res.headers.get('retry-after'));
        const retryMs = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
          ? retryAfterHeader * 1000
          : delayMs * 6 + Math.floor(Math.random() * 1200);
        window.NET_GUARD?.setCooldown?.(retryMs + 5000);
        window.NET_GUARD?.bumpPenalty?.(20_000);
        throw new Error(`HTTP 429 - cooldown ${window.NET_GUARD?.formatLeft?.() || ''}`.trim());
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
      const msg = String(err?.message || err);
      if (msg.includes('429')) break;
      if (i < retries) await sleep(delayMs * (i + 1) + 1200 + Math.floor(Math.random() * 900));
    }
  }
  throw lastErr;
}
