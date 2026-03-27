/* ── Global State ──────────────────────────────────────────── */
const CACHE_VERSION = 'stv610adl1';
const ST_VERSION = 'v8.2-pro-edge';

function safeParseJSON(raw, fallback) {
  try {
    if (raw == null || raw === '') return fallback;
    const parsed = JSON.parse(raw);
    return parsed == null ? fallback : parsed;
  } catch {
    return fallback;
  }
}

function sanitizeWatchlist(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { best: [], watch: [], avoid: [] };
  return {
    best: Array.isArray(value.best) ? value.best : [],
    watch: Array.isArray(value.watch) ? value.watch : [],
    avoid: Array.isArray(value.avoid) ? value.avoid : []
  };
}

function sanitizeJournal(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    if (Array.isArray(value.items)) return value.items;
    if (Array.isArray(value.rows)) return value.rows;
  }
  return [];
}

function sanitizeScanMeta(value) {
  const base = { lastScan: null, source: '', top3: [], cache: {}, regime: {}, insight: {} };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return base;
  return {
    ...base,
    ...value,
    top3: Array.isArray(value.top3) ? value.top3 : [],
    cache: value.cache && typeof value.cache === 'object' && !Array.isArray(value.cache) ? value.cache : {},
    regime: value.regime && typeof value.regime === 'object' && !Array.isArray(value.regime) ? value.regime : {},
    insight: value.insight && typeof value.insight === 'object' && !Array.isArray(value.insight) ? value.insight : {}
  };
}

const ST = {
  btc: 'sideway', // 'bull' | 'sideway' | 'bear'
  _initialized: false,

  coins: [],
  watchlist: { best: [], watch: [], avoid: [] },
  journal: [],
  scanMeta: { lastScan: null, source: '', top3: [], cache: {}, regime: {}, insight: {} },

  /* ── Async init from IndexedDB ─────────────────────── */
  async init() {
    if (this._initialized) return;
    try {
      await DB.open();
      await DB.migrateFromLocalStorage();

      // Load session state from settings
      const savedState = await DB.getSetting('sessionState');
      if (savedState) {
        this.btc = ['bull','sideway','bear'].includes(savedState.btc) ? savedState.btc : 'sideway';
        this.coins = Array.isArray(savedState.coins) ? savedState.coins : [];
        this.watchlist = sanitizeWatchlist(savedState.watchlist);
        this.scanMeta = sanitizeScanMeta(savedState.scanMeta);
      }

      // Load journal from trades store
      const trades = await DB.getTrades({});
      if (trades.length) {
        this.journal = sanitizeJournal(trades);
      }

      this._initialized = true;
      console.log('[ST] Initialized from IndexedDB — coins:', this.coins.length, 'journal:', this.journal.length);
    } catch (err) {
      console.warn('[ST] IndexedDB init failed, falling back to localStorage:', err);
      this._fallbackLoad();
      this._initialized = true;
    }
  },

  _fallbackLoad() {
    try {
      this.coins = safeParseJSON(localStorage.getItem('st_coins'), []);
      this.watchlist = sanitizeWatchlist(safeParseJSON(localStorage.getItem('st_watchlist'), {best:[],watch:[],avoid:[]}));
      this.journal = sanitizeJournal(safeParseJSON(localStorage.getItem('st_journal'), []));
      this.scanMeta = sanitizeScanMeta(safeParseJSON(localStorage.getItem('st_scan_meta'), {lastScan:null,source:'',top3:[],cache:{},regime:{},insight:{}}));
    } catch { /* empty fallback */ }
  },

  exportData() {
    return {
      version: CACHE_VERSION,
      exportedAt: Date.now(),
      btc: this.btc,
      coins: this.coins,
      watchlist: this.watchlist,
      journal: this.journal,
      scanMeta: this.scanMeta,
    };
  },

  importData(payload) {
    if (!payload || typeof payload !== 'object') throw new Error('Backup không hợp lệ');
    this.btc = ['bull','sideway','bear'].includes(payload.btc) ? payload.btc : 'sideway';
    this.coins = Array.isArray(payload.coins) ? payload.coins : [];
    this.watchlist = sanitizeWatchlist(payload.watchlist);
    this.journal = sanitizeJournal(payload.journal);
    this.scanMeta = sanitizeScanMeta(payload.scanMeta);
    this.save();
    this.setBtc(this.btc);
  },

  /* ── Async non-blocking save ─────────────────────────── */
  save() {
    // Fire-and-forget async write to IndexedDB — does NOT block scanner
    this._saveToIDB();
  },

  async _saveToIDB() {
    try {
      await DB.setSetting('sessionState', {
        btc: this.btc,
        coins: this.coins,
        watchlist: this.watchlist,
        scanMeta: this.scanMeta,
        savedAt: Date.now(),
      });
      // Sync journal entries to trades store
      if (Array.isArray(this.journal) && this.journal.length) {
        const existing = await DB.getTrades({});
        const existingIds = new Set(existing.map(t => t.id));
        const newTrades = this.journal.filter(j => !existingIds.has(j.id));
        for (const t of newTrades) {
          await DB.addTrade(t);
        }
      }
    } catch (err) {
      console.warn('[ST] IndexedDB save failed, falling back to localStorage:', err);
      this._fallbackSave();
    }
  },

  _fallbackSave() {
    try {
      localStorage.setItem('st_coins', JSON.stringify(this.coins));
      localStorage.setItem('st_watchlist', JSON.stringify(this.watchlist));
      localStorage.setItem('st_journal', JSON.stringify(this.journal));
      localStorage.setItem('st_scan_meta', JSON.stringify(this.scanMeta));
    } catch { /* quota exceeded, ignore */ }
  },

  setBtc(state) {
    this.btc = state;
    // update all BTC indicators
    const dot  = document.querySelector('#btcBadgeSidebar .btc-dot');
    const text = document.getElementById('btcBadgeText');
    const warn = document.querySelectorAll('.btc-warning');
    dot.className = 'btc-dot';
    if (state === 'bull') {
      dot.classList.add('bull');
      text.textContent = 'BTC: Bullish ▲';
      warn.forEach(w => w.classList.remove('show'));
    } else if (state === 'bear') {
      dot.classList.add('bear');
      text.textContent = 'BTC: Breakdown ▼';
      warn.forEach(w => w.classList.add('show'));
    } else {
      text.textContent = 'BTC: Sideway ◈';
      warn.forEach(w => w.classList.remove('show'));
    }
  }
};

/* ── Utility helpers ─────────────────────────────────────── */
const $ = id => document.getElementById(id);
const el = (tag, cls, inner) => {
  const e = document.createElement(tag);
  if (cls)   e.className = cls;
  if (inner !== undefined) e.innerHTML = inner;
  return e;
};


async function downloadBackup() {
  try {
    // Export full v8 IndexedDB data
    const idbData = await DB.exportAll();
    // Also include legacy session state for backward compat
    idbData.legacyState = ST.exportData();
    const blob = new Blob([JSON.stringify(idbData, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `system-trader-v8-backup-${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  } catch (err) {
    // Fallback to legacy export
    const blob = new Blob([JSON.stringify(ST.exportData(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `system-trader-backup-${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }
}

function triggerImportBackup() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (data.version === 'ST_V8_IDB') {
        // v8 IndexedDB format
        const count = await DB.importAll(data);
        // Also restore session state if available
        if (data.legacyState) {
          ST.importData(data.legacyState);
        }
        alert(`✅ Imported ${count} records (v8 format)`);
      } else {
        // Legacy v7 format
        ST.importData(data);
      }
      syncWatchlistFromCoins();
      ST.save();
      alert('✅ Đã import backup thành công');
      if (typeof renderDashboard === 'function') renderDashboard();
      if (typeof renderScanner === 'function') renderScanner();
    } catch (e) {
      alert('❌ Import backup thất bại: ' + e.message);
    }
  };
  input.click();
}

function formatCap(n) {
  if (n >= 1e9) return '$' + (n/1e9).toFixed(1) + 'B';
  if (n >= 1e6) return '$' + (n/1e6).toFixed(1) + 'M';
  return '$' + n.toLocaleString();
}

function narrativeBadge(tag) {
  const colors = {
    AI:'badge-cyan', DePIN:'badge-purple', Gaming:'badge-yellow',
    RWA:'badge-green', Infra:'badge-gray', 'Cross-chain':'badge-gray',
    Privacy:'badge-purple', 'Data Layer':'badge-cyan'
  };
  return `<span class="badge ${colors[tag]||'badge-gray'}">${tag}</span>`;
}

function gradeInfo(score) {
  if (score >= 85) return {grade:'A',  cls:'grade-A',     desc:'Có thể vào lệnh', badge:'badge-green'};
  if (score >= 75) return {grade:'B+', cls:'grade-Bplus', desc:'Setup tiềm năng', badge:'badge-cyan'};
  if (score >= 65) return {grade:'📌 Watch', cls:'grade-watch', desc:'Watchlist only — chưa vào', badge:'badge-yellow'};
  return {grade:'✗ Skip', cls:'grade-skip', desc:'Bỏ qua', badge:'badge-red'};
}

/* ── Sample seed data ────────────────────────────────────── */
function seedData() {
  // Demo data disabled in REAL DATA ONLY build. Use ?demo=1 to enable.
  if (!location.search.includes('demo=1')) return;
  if (ST.coins.length > 0) return;
  ST.coins = [
    {
      id: 1, isSample: true, symbol: 'AGIX', name: 'SingularityNET',
      cap: 45e6, volume24h: 8.2e6, pumpRecent: 35,
      structure: 'clear', narratives: ['AI', 'Data Layer'],
      phase: 'C', setup: 'Spring',
      entry: 0.142, stop: 0.127, tp1: 0.18, tp2: 0.22, tp3: 0.30,
      score: 88, notes: 'Spring + test rõ, volume absorption tốt',
      ema: 'reclaim20', fib: '0.618',
    },
    {
      id: 2, isSample: true, symbol: 'RNDR', name: 'Render Network',
      cap: 72e6, volume24h: 14.1e6, pumpRecent: 60,
      structure: 'clear', narratives: ['AI', 'Infra'],
      phase: 'D', setup: 'LPS',
      entry: 3.82, stop: 3.45, tp1: 4.50, tp2: 5.20, tp3: 7.00,
      score: 79, notes: 'Early D, LPS test đẹp',
      ema: 'cross', fib: '0.5',
    },
    {
      id: 3, isSample: true, symbol: 'OCEAN', name: 'Ocean Protocol',
      cap: 28e6, volume24h: 3.4e6, pumpRecent: 22,
      structure: 'clear', narratives: ['Data Layer', 'Privacy'],
      phase: 'C', setup: 'Spring + Test',
      entry: 0.48, stop: 0.42, tp1: 0.62, tp2: 0.80, tp3: 1.10,
      score: 91, notes: 'Spring rõ, volume thấp khi test, fib 0.618',
      ema: 'reclaim20', fib: '0.618',
    },
    {
      id: 4, isSample: true, symbol: 'FET', name: 'Fetch.ai',
      cap: 55e6, volume24h: 6.8e6, pumpRecent: 80,
      structure: 'unclear', narratives: ['AI'],
      phase: 'dist', setup: '',
      entry: 0, stop: 0, tp1: 0, tp2: 0, tp3: 0,
      score: 42, notes: 'Đã pump mạnh, chưa có nền mới',
      ema: 'bad', fib: '',
    },
    {
      id: 5, isSample: true, symbol: 'MYRIA', name: 'Myria',
      cap: 12e6, volume24h: 1.9e6, pumpRecent: 15,
      structure: 'clear', narratives: ['Gaming', 'Infra'],
      phase: 'C', setup: 'Spring',
      entry: 0.0029, stop: 0.0025, tp1: 0.0038, tp2: 0.0048, tp3: 0.0065,
      score: 76, notes: 'Micro-cap, spring quét đáy rõ, chưa pump',
      ema: 'reclaim50', fib: '0.5',
    },
  ];
  ST.watchlist = {
    best: [{symbol:'OCEAN', note:'A setup – Spring + Test', addedAt: Date.now()}, {symbol:'AGIX', note:'A setup – Phase C', addedAt: Date.now()}],
    watch: [{symbol:'RNDR', note:'B+ – LPS entry sắp confirm', addedAt: Date.now()}, {symbol:'MYRIA', note:'B+ – micro-cap spring', addedAt: Date.now()}],
    avoid: [{symbol:'FET', note:'Đã pump 80%, chưa nền', addedAt: Date.now()}]
  };
  ST.save();
}


function fmtPrice(n) {
  if (n === undefined || n === null || Number.isNaN(Number(n))) return '–';
  n = Number(n);
  if (n < 0.0001) return '$' + n.toFixed(8);
  if (n < 0.01) return '$' + n.toFixed(6);
  if (n < 1) return '$' + n.toFixed(4);
  return '$' + n.toFixed(2);
}



function formatTimestamp(ts) {
  if (!ts) return 'Chưa scan';
  try { return new Date(ts).toLocaleString('vi-VN'); } catch { return String(ts); }
}

function scoreBreakdownRows(bd = {}) {
  const labels = {
    structure:'Structure', volume:'Volume', fib:'Fib', ema:'EMA', resistance:'Resistance', btc:'BTC', cleanliness:'Cleanliness'
  };
  return Object.entries(labels).map(([k,label]) => {
    const v = Number(bd[k] || 0);
    return `<div style="display:flex;justify-content:space-between;gap:8px;font-size:11px"><span class="text-muted">${label}</span><span class="font-mono fw-700">${v}</span></div>`;
  }).join('');
}

function coinTier(coin) {
  if (!coin) return 'avoid';
  const conf = Number(coin.executionConfidence || 0);
  const rr = Number(coin.rr || 0);
  const cleanEntry = coin.chartEntryQuality === 'entry_good';
  const notLate = coin.entryTiming !== 'entry_late' && coin.chartEntryQuality !== 'entry_late';
  const strongPlayable = coin.status === 'PLAYABLE' && conf >= 0.68 && rr >= 1.6 && cleanEntry && notLate;
  const strongScalp = coin.status === 'SCALP_READY' && conf >= 0.72 && rr >= 1.35 && cleanEntry && notLate;
  if (coin.status === 'READY') return 'best';
  if (strongPlayable || strongScalp) return 'best';
  if (coin.status === 'SCALP_READY') return 'watch';
  if (coin.status === 'PLAYABLE') return 'watch';
  if (coin.status === 'PROBE') return 'watch';
  if (coin.status === 'EARLY') return 'watch';
  return 'avoid';
}

function syncWatchlistFromCoins() {
  const next = { best: [], watch: [], avoid: [] };
  [...ST.coins]
    .filter(c => c && c.symbol)
    .sort((a,b) => (b.score || 0) - (a.score || 0))
    .forEach(c => {
      const tier = coinTier(c);
      const note = c.rejected
        ? ((c.rejectReasons && c.rejectReasons[0]) || (c.warnings && c.warnings[0]) || 'Rejected by system')
        : `${c.status || gradeInfo(c.score || 0).grade} · ${(c.setup || c.structureTag || 'No setup')} · Entry ${(c.scoreBreakdown?.entry || 0)}/8`;
      next[tier].push({ symbol: c.symbol, note, addedAt: Date.now() });
    });
  ST.watchlist = next;
}

function getCoinBySymbol(sym) {
  return ST.coins.find(c => String(c.symbol).toUpperCase() === String(sym).toUpperCase());
}




function journalRMultiple(j) {
  if (!j || j.result === 'open') return null;
  const entry = Number(j.entry || 0);
  const stop = Number(j.stop || 0);
  const tp = Number(j.tp || 0);
  const risk = Math.max(1e-9, Math.abs(entry - stop));
  if (j.result === 'loss') return -1;
  if (j.result === 'be') return 0;
  if (j.result === 'win') {
    if (entry > 0 && tp > 0 && risk > 0) return Math.max(0.3, (tp - entry) / risk);
    return 1.8;
  }
  return null;
}


const LEARNING_BASELINES = {
  'spring': { prior: 8, expectancyR: 1.05, winRate: 0.58, profitFactor: 1.34, edgeMultiplier: 1.18 },
  'spring + test': { prior: 8, expectancyR: 1.28, winRate: 0.62, profitFactor: 1.48, edgeMultiplier: 1.34 },
  'lps': { prior: 8, expectancyR: 1.18, winRate: 0.60, profitFactor: 1.40, edgeMultiplier: 1.26 },
  'early phase d': { prior: 7, expectancyR: 0.86, winRate: 0.55, profitFactor: 1.22, edgeMultiplier: 1.12 },
  'phase c candidate': { prior: 7, expectancyR: 0.34, winRate: 0.44, profitFactor: 0.92, edgeMultiplier: 0.84 },
  'early watch': { prior: 6, expectancyR: 0.18, winRate: 0.39, profitFactor: 0.82, edgeMultiplier: 0.72 },
  'breakout retest': { prior: 7, expectancyR: 0.82, winRate: 0.53, profitFactor: 1.14, edgeMultiplier: 1.06 },
  'no setup': { prior: 6, expectancyR: 0.08, winRate: 0.33, profitFactor: 0.72, edgeMultiplier: 0.62 },
  'unknown': { prior: 6, expectancyR: 0.24, winRate: 0.40, profitFactor: 0.86, edgeMultiplier: 0.74 }
};


function quantBand(v) {
  if (v >= 1.50) return { label:'Killer', cls:'badge-green' };
  if (v >= 1.28) return { label:'Strong', cls:'badge-cyan' };
  if (v >= 0.98) return { label:'Neutral', cls:'badge-yellow' };
  if (v >= 0.78) return { label:'Weak', cls:'badge-red' };
  return { label:'Trash', cls:'badge-red' };
}

function normalizeSetupName(name) {
  const s = String(name || '').trim().toLowerCase();
  if (!s) return 'unknown';
  if (s.includes('spring') && s.includes('test')) return 'spring + test';
  if (s.includes('spring')) return 'spring';
  if (s.includes('early phase d')) return 'early phase d';
  if (s.includes('phase c')) return 'phase c candidate';
  if (s.includes('lps')) return 'lps';
  if (s.includes('breakout')) return 'breakout retest';
  if (s.includes('early watch')) return 'early watch';
  if (s.includes('no setup')) return 'no setup';
  return s;
}

function priorForSetup(setupName) {
  const key = normalizeSetupName(setupName);
  return LEARNING_BASELINES[key] || LEARNING_BASELINES.unknown;
}

function blendLearning(prior, observed, n) {
  const total = Math.max(0, prior.prior || 0) + Math.max(0, n || 0);
  if (!total) return prior;
  const wr = (((prior.winRate || 0) * (prior.prior || 0)) + ((observed.winRate || 0) * (n || 0))) / total;
  const expectancyR = (((prior.expectancyR || 0) * (prior.prior || 0)) + ((observed.expectancyR || 0) * (n || 0))) / total;
  const profitFactor = (((prior.profitFactor || 0) * (prior.prior || 0)) + ((observed.profitFactor || 0) * (n || 0))) / total;
  
let edgeMultiplier = 0.54 + expectancyR * 0.30 + wr * 0.56 + Math.max(-0.14, Math.min(0.40, (profitFactor - 1) * 0.34));
edgeMultiplier = Math.max(0.60, Math.min(1.60, edgeMultiplier));
const confidenceRaw = Math.min(1, (n || 0) / ((prior.prior || 0) + 8));
const confidence = Math.max(0.30, confidenceRaw);
const quality = Math.max(0.50, Math.min(1.9, 0.66 + expectancyR * 0.24 + wr * 0.26 + confidence * 0.16 + Math.max(-0.08, Math.min(0.16, (profitFactor - 1) * 0.18))));
const edgeCore = (expectancyR * Math.max(0.72, profitFactor) * (0.60 + confidence * 0.40));
const edgeScore = Math.max(10, Math.min(100, Math.round(edgeCore * 42 + (edgeMultiplier - 1) * 18)));
return {
    expectancyR: Number(expectancyR.toFixed(2)),
    avgR: Number(expectancyR.toFixed(2)),
    winRate: wr,
    wr: Math.round(wr * 100),
    profitFactor: Number(profitFactor.toFixed(2)),
    confidence: Number(confidence.toFixed(2)),
    quality: Number(quality.toFixed(2)),
    edgeMultiplier: Number(edgeMultiplier.toFixed(2)),
    band: quantBand(edgeMultiplier),
    edgeScore
  };
}

function computeQuantStats() {
  const allRows = Array.isArray(ST.journal) ? ST.journal : [];
  const closed = allRows.filter(j => j.result && j.result !== 'open');
  const rVals = closed.map(journalRMultiple).filter(v => Number.isFinite(v));
  const wins = closed.filter(j => j.result === 'win').length;
  const losses = closed.filter(j => j.result === 'loss').length;
  const be = closed.filter(j => j.result === 'be').length;

  const observed = {
    winRate: closed.length ? wins / closed.length : 0,
    expectancyR: rVals.length ? rVals.reduce((a,b)=>a+b,0) / rVals.length : 0,
    profitFactor: (() => {
      const grossWin = rVals.filter(v => v > 0).reduce((a,b)=>a+b,0);
      const grossLoss = Math.abs(rVals.filter(v => v < 0).reduce((a,b)=>a+b,0));
      return grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? grossWin : 0);
    })()
  };
  const globalPrior = { prior: 10, expectancyR: 0.58, winRate: 0.50, profitFactor: 1.08 };
  const globalBlend = blendLearning(globalPrior, observed, closed.length);

  const setupBuckets = new Map();
  for (const row of allRows) {
    const key = normalizeSetupName(row.setup || row.pattern || row.tag || 'unknown');
    if (!setupBuckets.has(key)) setupBuckets.set(key, []);
    setupBuckets.get(key).push(row);
  }

  const setupNames = new Set([...Object.keys(LEARNING_BASELINES), ...setupBuckets.keys()]);
  const setupStats = [...setupNames].map((setup) => {
    const rows = setupBuckets.get(setup) || [];
    const closedRows = rows.filter(j => j.result && j.result !== 'open');
    const vals = closedRows.map(journalRMultiple).filter(v => Number.isFinite(v));
    const w = closedRows.filter(j => j.result === 'win').length;
    const l = closedRows.filter(j => j.result === 'loss').length;
    const observedSetup = {
      winRate: closedRows.length ? w / closedRows.length : 0,
      expectancyR: vals.length ? vals.reduce((a,b)=>a+b,0) / vals.length : 0,
      profitFactor: (() => {
        const grossWin = vals.filter(v => v > 0).reduce((a,b)=>a+b,0);
        const grossLoss = Math.abs(vals.filter(v => v < 0).reduce((a,b)=>a+b,0));
        return grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? grossWin : 0);
      })()
    };
    const prior = priorForSetup(setup);
    const blend = blendLearning(prior, observedSetup, closedRows.length);
    return {
      setup,
      total: rows.length,
      closed: closedRows.length,
      wins: w,
      losses: l,
      be: closedRows.filter(j => j.result === 'be').length,
      wr: blend.wr,
      winRate: Number(blend.winRate.toFixed(2)),
      expectancyR: blend.expectancyR,
      avgR: blend.avgR,
      profitFactor: blend.profitFactor,
      confidence: blend.confidence,
      quality: blend.quality,
      edgeMultiplier: blend.edgeMultiplier,
      band: blend.band,
      bootstrap: closedRows.length < (prior.prior || 0)
    };
  }).sort((a,b) => (b.edgeMultiplier - a.edgeMultiplier) || (b.expectancyR - a.expectancyR));

  return {
    totalClosed: closed.length,
    wins,
    losses,
    be,
    winRate: globalBlend.wr,
    expectancyR: globalBlend.expectancyR,
    avgR: globalBlend.avgR,
    profitFactor: globalBlend.profitFactor,
    confidence: globalBlend.confidence,
    quality: globalBlend.quality,
    edgeScore: globalBlend.edgeScore,
    learningMode: closed.length >= 12 ? 'trained' : closed.length >= 4 ? 'adaptive' : 'bootstrap',
    learningActive: closed.length > 0,
    setupStats
  };
}

function getSetupQuantProfile(setupName, btcContext = 'sideway') {
  const quant = computeQuantStats();
  const key = normalizeSetupName(setupName);
  let profile = quant.setupStats.find(s => normalizeSetupName(s.setup) === key);
  if (!profile) {
    const prior = priorForSetup(key);
    const bootstrap = blendLearning(prior, prior, 0);
    profile = { setup: key, total:0, closed:0, wins:0, losses:0, be:0, ...bootstrap, bootstrap:true };
  }
  const regimeBoost =
    btcContext === 'bull' ? (key.includes('phase d') || key.includes('lps') ? 0.06 : 0.02) :
    btcContext === 'sideway' ? (key.includes('phase c') || key.includes('spring') ? 0.04 : -0.01) :
    -0.08;
  
const adjustedEdge = Math.max(0.60, Math.min(1.70, Number((profile.edgeMultiplier + regimeBoost).toFixed(2))));
const confFloor = Math.max(0.30, Number(profile.confidence || 0));
const edgeScore = Math.max(10, Math.min(100, Math.round(((profile.expectancyR || 0) * Math.max(0.72, profile.profitFactor || 0.8) * (0.60 + confFloor * 0.40)) * 42 + (adjustedEdge - 1) * 18)));
return {
    ...profile,
    regimeBoost: Number(regimeBoost.toFixed(2)),
    edgeMultiplier: adjustedEdge,
    edgeScore,
    band: quantBand(adjustedEdge)
  };
}

function getTopSetups(limit = 4) {
  const top3 = Array.isArray(ST.scanMeta?.top3) ? ST.scanMeta.top3 : [];
  if (top3.length) return top3.slice(0, limit);
  const scoreSetup = c => {
    const conf = Number(c.executionConfidence || 0);
    const rr = Number(c.rr || 0);
    const latePenalty = (c.entryTiming === 'entry_late' || c.chartEntryQuality === 'entry_late') ? 18 : 0;
    const entryBonus = c.chartEntryQuality === 'entry_good' ? 8 : c.chartEntryQuality === 'wait_retest' ? 2 : 0;
    const statusBoost = c.status === 'READY' ? 40 : c.status === 'SCALP_READY' ? 24 : c.status === 'PLAYABLE' ? 14 : c.status === 'PROBE' ? 6 : 0;
    return (c.rankScore || c.riskAdjustedScore || c.score || 0) + conf * 25 + rr * 8 + entryBonus - latePenalty + statusBoost;
  };
  const ready = [...ST.coins]
    .filter(c => c.status === 'READY')
    .sort((a,b) => scoreSetup(b) - scoreSetup(a));
  if (ready.length) return ready.slice(0, limit);
  const scalp = [...ST.coins]
    .filter(c => c.status === 'SCALP_READY' || c.status === 'PLAYABLE' || c.status === 'PROBE')
    .sort((a,b) => scoreSetup(b) - scoreSetup(a));
  if (scalp.length) return scalp.slice(0, limit);
  return [...ST.coins]
    .filter(c => ['READY','SCALP_READY','PLAYABLE','PROBE'].includes(c.status))
    .sort((a,b) => scoreSetup(b) - scoreSetup(a))
    .slice(0, limit);
}

function getNearMisses(limit = 5) {
  return [...ST.coins]
    .filter(c => !['READY','SCALP_READY','PLAYABLE','PROBE'].includes(c.status) && ((c.riskAdjustedScore || c.score || 0) >= 30))
    .sort((a,b) => ((b.riskAdjustedScore || b.score || 0) - (a.riskAdjustedScore || a.score || 0)))
    .slice(0, limit);
}



const NET_GUARD = {
  storageKey: `st_net_guard:${CACHE_VERSION}`,
  minGapMs: 6500,
  cooldownUntil: 0,
  lastRequestAt: 0,
  load() {
    try {
      const raw = JSON.parse(localStorage.getItem(this.storageKey) || '{}');
      this.cooldownUntil = Number(raw.cooldownUntil) || 0;
      this.lastRequestAt = Number(raw.lastRequestAt) || 0;
    } catch {
      this.cooldownUntil = 0;
      this.lastRequestAt = 0;
    }
  },
  save() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify({
        cooldownUntil: this.cooldownUntil || 0,
        lastRequestAt: this.lastRequestAt || 0,
      }));
    } catch {}
  },
  syncFromStorage() {
    try {
      const raw = JSON.parse(localStorage.getItem(this.storageKey) || '{}');
      this.cooldownUntil = Math.max(this.cooldownUntil || 0, Number(raw.cooldownUntil) || 0);
      this.lastRequestAt = Math.max(this.lastRequestAt || 0, Number(raw.lastRequestAt) || 0);
    } catch {}
  },
  async waitTurn(key='net') {
    this.syncFromStorage();
    const now = Date.now();
    if (this.cooldownUntil > now) await new Promise(r => setTimeout(r, this.cooldownUntil - now));
    const gap = Math.max(0, this.minGapMs - (Date.now() - this.lastRequestAt));
    if (gap > 0) await new Promise(r => setTimeout(r, gap));
    this.lastRequestAt = Date.now();
    this.save();
    return key;
  },
  setCooldown(ms=60_000) {
    this.syncFromStorage();
    const until = Date.now() + Math.max(8_000, Number(ms) || 60_000);
    this.cooldownUntil = Math.max(this.cooldownUntil || 0, until);
    this.save();
    return this.cooldownUntil;
  },
  bumpPenalty(ms=15_000) {
    this.syncFromStorage();
    this.cooldownUntil = Math.max(this.cooldownUntil || 0, Date.now() + ms);
    this.save();
    return this.cooldownUntil;
  },
  reset() {
    this.cooldownUntil = 0;
    this.lastRequestAt = 0;
    try { localStorage.removeItem(this.storageKey); } catch {}
  },
  getCooldownLeftMs() {
    this.syncFromStorage();
    return Math.max(0, (this.cooldownUntil || 0) - Date.now());
  },
  formatLeft() {
    const left = this.getCooldownLeftMs();
    if (!left) return '0s';
    const sec = Math.ceil(left / 1000);
    return sec >= 60 ? `${Math.ceil(sec / 60)}m` : `${sec}s`;
  }
};
NET_GUARD.load();
window.NET_GUARD = NET_GUARD;
window.addEventListener('storage', (e) => {
  if (e.key === NET_GUARD.storageKey) NET_GUARD.syncFromStorage();
});

const CACHE = {
  storageKey: `st_runtime_cache:${CACHE_VERSION}`,
  load() {
    try { return JSON.parse(localStorage.getItem(this.storageKey) || '{}'); }
    catch { return {}; }
  },
  save(data) {
    localStorage.setItem(this.storageKey, JSON.stringify(data || {}));
  },
  get(key, ttlMs) {
    const store = this.load();
    const item = store[key];
    if (!item) return null;
    if (Number.isFinite(ttlMs) && Date.now() - item.ts > ttlMs) {
      delete store[key];
      this.save(store);
      return null;
    }
    return item.value;
  },
  set(key, value) {
    const store = this.load();
    store[key] = { ts: Date.now(), value };
    this._trim(store);
    this.save(store);
    return value;
  },
  delPrefix(prefix) {
    const store = this.load();
    Object.keys(store).forEach(k => { if (k.startsWith(prefix)) delete store[k]; });
    this.save(store);
  },
  clearAll() {
    localStorage.removeItem(this.storageKey);
    Object.keys(localStorage).forEach((k) => {
      if (k.startsWith('st_runtime_cache:') && k !== this.storageKey) localStorage.removeItem(k);
    });
  },
  clearMemory() {
    window.__binanceExchangeInfo = null;
    window.__binanceSymbolIndex = null;
    window.__lastHybridResult = null;
    window.__forceFreshNextScan = true;
  },
  resetEverything() {
    this.clearAll();
    this.clearMemory();
    window.NET_GUARD?.reset?.();
  },
  _trim(store) {
    const keys = Object.keys(store);
    if (keys.length <= 80) return;
    keys.sort((a,b) => (store[a].ts||0) - (store[b].ts||0));
    for (const k of keys.slice(0, keys.length - 80)) delete store[k];
  }
};
