/* ══════════════════════════════════════════════════════════
   CATEGORY ENGINE v1.0
   Institutional Sector Correlation Layer
   ══════════════════════════════════════════════════════════ */

window.CATEGORY_ENGINE = (() => {
  const MAP = {
    // AI
    'FET': 'AI', 'AGIX': 'AI', 'OCEAN': 'AI', 'RNDR': 'AI', 'NEAR': 'AI', 'TAO': 'AI', 'AKT': 'AI', 'THETA': 'AI', 'GRT': 'AI', 'WLD': 'AI', 'ARKM': 'AI',
    // L1 / L2
    'SOL': 'L1', 'AVAX': 'L1', 'ADA': 'L1', 'DOT': 'L1', 'MATIC': 'L1', 'POL': 'L1', 'SUI': 'L1', 'APT': 'L1', 'SEI': 'L1', 'FTM': 'L1', 'OP': 'L1', 'ARB': 'L1', 'MINA': 'L1', 'EGLD': 'L1', 'STRK': 'L1', 'ZRO': 'L1',
    // MEME
    'DOGE': 'MEME', 'SHIB': 'MEME', 'PEPE': 'MEME', 'BONK': 'MEME', 'WIF': 'MEME', 'FLOKI': 'MEME', 'BOME': 'MEME', 'MEME': 'MEME', 'TURBO': 'MEME', 'MYRO': 'MEME', 'POPCAT': 'MEME',
    // DEFI / DEX
    'UNI': 'DEFI', 'AAVE': 'DEFI', 'MKR': 'DEFI', 'CRV': 'DEFI', 'COMP': 'DEFI', 'SNX': 'DEFI', 'RUNE': 'DEFI', 'LDO': 'DEFI', 'ENA': 'DEFI', 'JUP': 'DEFI', 'RAY': 'DEFI', 'CAKE': 'DEFI',
    // GAMING / METAVERSE
    'GALA': 'GAMING', 'IMX': 'GAMING', 'BEAM': 'GAMING', 'PIXEL': 'GAMING', 'RON': 'GAMING', 'SAND': 'GAMING', 'MANA': 'GAMING', 'AXS': 'GAMING', 'ALICE': 'GAMING',
    // RWA
    'ONDO': 'RWA', 'PENDLE': 'RWA', 'OM': 'RWA', 'CFG': 'RWA', 'POLYX': 'RWA',
    // DEPINS / INFRA
    'AR': 'STORAGE', 'FIL': 'STORAGE', 'STORJ': 'STORAGE', 'LPT': 'INFRA', 'LINK': 'ORACLE', 'PYTH': 'ORACLE',
  };

  function getCategory(symbol = '') {
    const base = symbol.replace('USDT', '').replace('BTC', '').toUpperCase();
    return MAP[base] || 'OTHER';
  }

  return { getCategory };
})();
