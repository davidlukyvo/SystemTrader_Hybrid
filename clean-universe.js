/* ══════════════════════════════════════════════════════════
   CLEAN UNIVERSE ENGINE v8.1
   Institutional universe hygiene layer
   ══════════════════════════════════════════════════════════ */

window.CLEAN_UNIVERSE = (() => {
  const STABLE_BASES = new Set([
    'USD1','USDT','USDC','FDUSD','TUSD','USDP','DAI','BUSD','USDS','USDE','USDD','USD0','USDJ',
    'PYUSD','FRAX','LUSD','GUSD','EURC','EURI'
  ]);

  /* 🏛️ VSA NOISE REDUCTION LAYER
     Majors (BTC/ETH/SOL) are excluded because their volume is driven by macro flows 
     and arbitrage, which drowns out subtle VSA signatures. We focus on mid-caps 
     where Smart Money footprints are most distinct and tradeable. */
  const MAJOR_SOFT_EXCLUDED = new Set([
    'BTC','ETH','BNB','SOL','XRP','ADA','DOGE','TRX','LINK','LTC','BCH','XLM','DOT','AVAX','ATOM','NEAR',
    'APT','SUI','HBAR','ETC','FIL','ICP','UNI','OP','ARB','AAVE','TAO','VET','ALGO','CRO','EGLD','KAS',
    'MATIC','POL','XMR','MKR','INJ','FTM','SEI','TON','EUR','U'
  ]);

  const WRAPPED_OR_STAKED = new Set([
    'WBTC','WETH','STETH','WSTETH','WEETH','CBETH','RETH','TBTC','ETHW','WBNB','WMATIC','WAVAX'
  ]);

  const COMMODITY_BACKED = new Set(['XAUT','PAXG']);
  const SYMBOL_HYGIENE_HARD = new Set(['EUR','U','BANANAS31']);
  const BAD_MEME_SOFT = new Set(['SHIB','PEPE','BONK','WIF','FLOKI','PENGU']);
  const SOFT_EXCLUDED = new Set(['1000SATS']);

  const EXCLUDED_NAMES = [
    /stablecoin/i,
    /usd.?pegged/i,
    /euro.?pegged/i,
    /\busd\b.*stable/i,
    /\beur\b.*stable/i,
    /tether gold/i,
    /pax gold/i,
    /wrapped bitcoin/i,
    /wrapped ether/i,
    /liquid stak/i,
    /staked ether/i,
    /bridged .*bitcoin/i,
    /bridged .*ether/i
  ];

  function normalizeBase(input = '') {
    const raw = String(input || '').trim().toUpperCase();
    if (!raw) return '';
    if (raw.length > 4 && raw.endsWith('USDT')) return raw.slice(0, -4);
    if (raw.length > 5 && raw.endsWith('FDUSD')) return raw.slice(0, -5);
    if (raw.length > 4 && raw.endsWith('USDC')) return raw.slice(0, -4);
    if (raw.length > 4 && raw.endsWith('BUSD')) return raw.slice(0, -4);
    if (raw.length > 3 && raw.endsWith('BTC')) return raw.slice(0, -3);
    return raw;
  }

  function isLeveragedToken(base = '') {
    return /(UP|DOWN|BULL|BEAR)$/i.test(String(base || ''));
  }

  function hasNonAsciiSymbol(base = '') {
    return /[^\x20-\x7E]/.test(String(base || ''));
  }

  function normalizeRegimeContext(context = {}) {
    const btcContext = String(context?.btcContext || context?.regime || '').toLowerCase();
    const regimeType = String(context?.regimeType || '').toUpperCase();
    return { btcContext, regimeType };
  }

  function isSoftAllowed(context = {}) {
    const { btcContext, regimeType } = normalizeRegimeContext(context);
    if (btcContext === 'bull') return true;
    if (btcContext === 'sideway' && ['BREAKOUT', 'TRENDING', 'ACCUMULATION'].includes(regimeType)) return true;
    if (btcContext === 'sideway' && regimeType === 'CHOP') return true;
    return false;
  }

  function isMajorSoftAllowed(context = {}) {
    return isSoftAllowed(context);
  }

  function isMemeSoftAllowed(context = {}) {
    const { btcContext, regimeType } = normalizeRegimeContext(context);
    if (btcContext === 'bull') return true;
    if (btcContext === 'sideway' && ['BREAKOUT', 'TRENDING'].includes(regimeType)) return true;
    return false;
  }

  function classify(coinLike = {}, context = {}) {
    const symbol = String(coinLike.symbol || '').toUpperCase();
    const base = normalizeBase(coinLike.base || coinLike.baseAsset || symbol);
    const name = String(coinLike.name || coinLike.fullName || '').trim();
    const id = String(coinLike.id || coinLike.coingeckoId || '').toLowerCase();
    const majorSoftAllowed = isMajorSoftAllowed(context);
    const memeSoftAllowed = isMemeSoftAllowed(context);

    if (!base) return { excluded: false, softExcluded: false, reason: '', tag: '', lane: 'allow' };
    if (isLeveragedToken(base)) return { excluded: true, softExcluded: false, reason: 'leveraged_token', tag: 'Leveraged token', lane: 'hard_exclude' };
    if (SYMBOL_HYGIENE_HARD.has(base) || hasNonAsciiSymbol(base)) return { excluded: true, softExcluded: false, reason: 'symbol_hygiene', tag: 'Symbol hygiene', lane: 'hard_exclude' };
    if (STABLE_BASES.has(base)) return { excluded: true, softExcluded: false, reason: 'stable_base', tag: 'Stable / USD base', lane: 'hard_exclude' };
    if (COMMODITY_BACKED.has(base) || /(^|\b)(xaut|paxg)(\b|$)/i.test(symbol) || EXCLUDED_NAMES.some(rx => rx.test(name))) {
      return { excluded: true, softExcluded: false, reason: 'commodity_backed', tag: 'Commodity-backed / gold', lane: 'hard_exclude' };
    }
    if (WRAPPED_OR_STAKED.has(base) || /wrapped|staked|liquid stak/i.test(name) || /^(wrapped-bitcoin|wrapped-ether|staked-ether)$/.test(id)) {
      return { excluded: true, softExcluded: false, reason: 'wrapped_or_staked', tag: 'Wrapped / staked asset', lane: 'hard_exclude' };
    }
    if (MAJOR_SOFT_EXCLUDED.has(base)) {
      return {
        excluded: false,
        softExcluded: !majorSoftAllowed,
        reason: 'major_soft_excluded',
        tag: 'Major / benchmark asset',
        lane: majorSoftAllowed ? 'soft_allowed' : 'soft_exclude'
      };
    }
    if (BAD_MEME_SOFT.has(base)) {
      return {
        excluded: false,
        softExcluded: !memeSoftAllowed,
        reason: 'meme_soft_excluded',
        tag: 'Meme coin',
        lane: memeSoftAllowed ? 'soft_allowed' : 'soft_exclude'
      };
    }
    if (SOFT_EXCLUDED.has(base)) {
      return {
        excluded: false,
        softExcluded: !memeSoftAllowed,
        reason: 'soft_excluded',
        tag: 'Soft excluded',
        lane: memeSoftAllowed ? 'soft_allowed' : 'soft_exclude'
      };
    }
    return { excluded: false, softExcluded: false, reason: '', tag: '', lane: 'allow' };
  }

  function shouldExclude(coinLike = {}, context = {}) {
    return classify(coinLike, context).excluded;
  }

  function shouldSoftExclude(coinLike = {}, context = {}) {
    return classify(coinLike, context).softExcluded === true;
  }

  function shouldIncludeForBatch(coinLike = {}, context = {}) {
    const verdict = classify(coinLike, context);
    return !verdict.excluded && (!verdict.softExcluded || isSoftAllowed(context));
  }

  return {
    normalizeRegimeContext,
    normalizeBase,
    classify,
    shouldExclude,
    shouldSoftExclude,
    shouldIncludeForBatch,
    isSoftAllowed,
    isMajorSoftAllowed,
    isMemeSoftAllowed,
    STABLE_BASES,
    MAJOR_SOFT_EXCLUDED,
    WRAPPED_OR_STAKED,
    COMMODITY_BACKED,
    SYMBOL_HYGIENE_HARD,
  };
})();
