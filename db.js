/* ══════════════════════════════════════════════════════════
   IndexedDB Persistent Storage Layer — SystemTrader v8
   Repository / Service pattern for local-first edge engine
   ══════════════════════════════════════════════════════════ */

window.DB = (() => {
  const DB_NAME = 'SystemTraderDB';
  const DB_VERSION = 1;

  const STORES = {
    scans: 'scans',
    signals: 'signals',
    trades: 'trades',
    outcomes: 'outcomes',
    settings: 'settings',
  };

  const RETENTION = {
    scans: 180 * 24 * 60 * 60 * 1000,
    signals: 365 * 24 * 60 * 60 * 1000,
    outcomes: 365 * 24 * 60 * 60 * 1000,
    trades: Infinity,
  };

  let _db = null;
  let _ready = null;

  /* ── Open / Upgrade ───────────────────────────────────── */

  function open() {
    if (_ready) return _ready;
    _ready = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        const db = e.target.result;

        if (!db.objectStoreNames.contains(STORES.scans)) {
          const s = db.createObjectStore(STORES.scans, { keyPath: 'id' });
          s.createIndex('timestamp', 'timestamp', { unique: false });
          s.createIndex('btcContext', 'btcContext', { unique: false });
        }

        if (!db.objectStoreNames.contains(STORES.signals)) {
          const s = db.createObjectStore(STORES.signals, { keyPath: 'id' });
          s.createIndex('scanId', 'scanId', { unique: false });
          s.createIndex('symbol', 'symbol', { unique: false });
          s.createIndex('timestamp', 'timestamp', { unique: false });
          s.createIndex('status', 'status', { unique: false });
          s.createIndex('setup', 'setup', { unique: false });
        }

        if (!db.objectStoreNames.contains(STORES.trades)) {
          const s = db.createObjectStore(STORES.trades, { keyPath: 'id' });
          s.createIndex('coin', 'coin', { unique: false });
          s.createIndex('date', 'date', { unique: false });
          s.createIndex('setup', 'setup', { unique: false });
          s.createIndex('result', 'result', { unique: false });
        }

        if (!db.objectStoreNames.contains(STORES.outcomes)) {
          const s = db.createObjectStore(STORES.outcomes, { keyPath: 'id' });
          s.createIndex('signalId', 'signalId', { unique: false });
          s.createIndex('symbol', 'symbol', { unique: false });
          s.createIndex('checkDay', 'checkDay', { unique: false });
          s.createIndex('evaluatedAt', 'evaluatedAt', { unique: false });
        }

        if (!db.objectStoreNames.contains(STORES.settings)) {
          db.createObjectStore(STORES.settings, { keyPath: 'key' });
        }
      };

      req.onsuccess = (e) => {
        _db = e.target.result;
        resolve(_db);
      };

      req.onerror = (e) => {
        console.error('[DB] IndexedDB open failed:', e.target.error);
        reject(e.target.error);
      };
    });
    return _ready;
  }

  function getDB() {
    if (_db) return Promise.resolve(_db);
    return open();
  }

  /* ── Generic helpers ──────────────────────────────────── */

  function tx(storeName, mode = 'readonly') {
    return getDB().then(db => {
      const t = db.transaction(storeName, mode);
      return t.objectStore(storeName);
    });
  }

  function promisify(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function putRecord(storeName, record) {
    const store = await tx(storeName, 'readwrite');
    return promisify(store.put(record));
  }

  async function putRecords(storeName, records) {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction(storeName, 'readwrite');
      const store = t.objectStore(storeName);
      for (const r of records) store.put(r);
      t.oncomplete = () => resolve(records.length);
      t.onerror = () => reject(t.error);
    });
  }

  async function getRecord(storeName, key) {
    const store = await tx(storeName);
    return promisify(store.get(key));
  }

  async function deleteRecord(storeName, key) {
    const store = await tx(storeName, 'readwrite');
    return promisify(store.delete(key));
  }

  async function getAllRecords(storeName) {
    const store = await tx(storeName);
    return promisify(store.getAll());
  }

  async function getByIndex(storeName, indexName, value) {
    const store = await tx(storeName);
    const idx = store.index(indexName);
    return promisify(idx.getAll(value));
  }

  async function getByRange(storeName, indexName, lower, upper) {
    const store = await tx(storeName);
    const idx = store.index(indexName);
    const range = IDBKeyRange.bound(lower, upper);
    return promisify(idx.getAll(range));
  }

  async function countRecords(storeName) {
    const store = await tx(storeName);
    return promisify(store.count());
  }

  /* ── Scans ────────────────────────────────────────────── */

  async function addScan(scanRecord) {
    if (!scanRecord.id) scanRecord.id = `scan-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    if (!scanRecord.timestamp) scanRecord.timestamp = Date.now();
    return putRecord(STORES.scans, scanRecord);
  }

  async function getScans({ from, to, limit } = {}) {
    let records = await getAllRecords(STORES.scans);
    if (from) records = records.filter(r => r.timestamp >= from);
    if (to) records = records.filter(r => r.timestamp <= to);
    records.sort((a, b) => b.timestamp - a.timestamp);
    if (limit) records = records.slice(0, limit);
    return records;
  }

  async function getScanById(id) {
    return getRecord(STORES.scans, id);
  }

  /* ── Signals ──────────────────────────────────────────── */

  async function addSignals(signalRecords) {
    if (!Array.isArray(signalRecords) || !signalRecords.length) return 0;
    for (const s of signalRecords) {
      if (!s.id) s.id = `sig-${s.symbol || 'UNK'}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      if (!s.timestamp) s.timestamp = Date.now();
      if (!s.outcomesEvaluated) s.outcomesEvaluated = [];
    }
    return putRecords(STORES.signals, signalRecords);
  }

  async function addScanWithSignalsAtomic(scanRecord, signalRecords = []) {
    const db = await getDB();
    const safeScan = Object.assign({}, scanRecord || {});
    if (!safeScan.id) safeScan.id = `scan-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    if (!safeScan.timestamp) safeScan.timestamp = Date.now();

    const safeSignals = (Array.isArray(signalRecords) ? signalRecords : []).map(s => {
      const row = Object.assign({}, s || {});
      if (!row.id) row.id = `sig-${row.symbol || 'UNK'}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      if (!row.timestamp) row.timestamp = Date.now();
      if (!row.scanId) row.scanId = safeScan.id;
      if (!Array.isArray(row.outcomesEvaluated)) row.outcomesEvaluated = [];
      return row;
    });

    return new Promise((resolve, reject) => {
      const t = db.transaction([STORES.scans, STORES.signals], 'readwrite');
      const scanStore = t.objectStore(STORES.scans);
      const signalStore = t.objectStore(STORES.signals);
      scanStore.put(safeScan);
      safeSignals.forEach(sig => signalStore.put(sig));
      t.oncomplete = () => resolve({ scanId: safeScan.id, signalCount: safeSignals.length });
      t.onerror = () => reject(t.error || new Error('Atomic scan+signal transaction failed'));
      t.onabort = () => reject(t.error || new Error('Atomic scan+signal transaction aborted'));
    });
  }

  async function getSignals({ scanId, symbol, from, to, status, setup, limit } = {}) {
    let records;
    if (scanId) {
      records = await getByIndex(STORES.signals, 'scanId', scanId);
    } else if (symbol) {
      records = await getByIndex(STORES.signals, 'symbol', symbol);
    } else {
      records = await getAllRecords(STORES.signals);
    }
    if (from) records = records.filter(r => r.timestamp >= from);
    if (to) records = records.filter(r => r.timestamp <= to);
    if (status) records = records.filter(r => r.status === status);
    if (setup) records = records.filter(r => r.setup === setup);
    records.sort((a, b) => b.timestamp - a.timestamp);
    if (limit) records = records.slice(0, limit);
    return records;
  }

  async function getSignalById(id) {
    return getRecord(STORES.signals, id);
  }

  async function updateSignal(id, changes) {
    const existing = await getRecord(STORES.signals, id);
    if (!existing) return null;
    Object.assign(existing, changes);
    return putRecord(STORES.signals, existing);
  }

  async function getUnevaluatedSignals(checkDay) {
    const all = await getAllRecords(STORES.signals);
    const now = Date.now();
    const dayMs = {
      D1: 1 * 24 * 60 * 60 * 1000,
      D3: 3 * 24 * 60 * 60 * 1000,
      D7: 7 * 24 * 60 * 60 * 1000,
      D14: 14 * 24 * 60 * 60 * 1000,
      D30: 30 * 24 * 60 * 60 * 1000,
    };
    const requiredAge = dayMs[checkDay];
    if (!requiredAge) return [];
    return all.filter(s => {
      const age = now - s.timestamp;
      if (age < requiredAge) return false;
      const evaluated = Array.isArray(s.outcomesEvaluated) ? s.outcomesEvaluated : [];
      return !evaluated.includes(checkDay);
    });
  }

  /* ── Trades (Journal) ─────────────────────────────────── */

  async function addTrade(tradeRecord) {
    if (!tradeRecord.id) tradeRecord.id = `trade-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    return putRecord(STORES.trades, tradeRecord);
  }

  async function getTrades({ from, to, setup, result, limit } = {}) {
    let records = await getAllRecords(STORES.trades);
    if (from) records = records.filter(r => new Date(r.date).getTime() >= from);
    if (to) records = records.filter(r => new Date(r.date).getTime() <= to);
    if (setup) records = records.filter(r => r.setup === setup);
    if (result) records = records.filter(r => r.result === result);
    records.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    if (limit) records = records.slice(0, limit);
    return records;
  }

  async function updateTrade(id, changes) {
    const existing = await getRecord(STORES.trades, id);
    if (!existing) return null;
    Object.assign(existing, changes);
    return putRecord(STORES.trades, existing);
  }

  async function deleteTrade(id) {
    return deleteRecord(STORES.trades, id);
  }

  /* ── Outcomes ─────────────────────────────────────────── */

  async function addOutcome(outcomeRecord) {
    if (!outcomeRecord.id) {
      outcomeRecord.id = `out-${outcomeRecord.signalId}-${outcomeRecord.checkDay}`;
    }
    if (!outcomeRecord.evaluatedAt) outcomeRecord.evaluatedAt = Date.now();
    await putRecord(STORES.outcomes, outcomeRecord);
    if (outcomeRecord.signalId) {
      const signal = await getRecord(STORES.signals, outcomeRecord.signalId);
      if (signal) {
        const evaluated = Array.isArray(signal.outcomesEvaluated) ? signal.outcomesEvaluated : [];
        if (!evaluated.includes(outcomeRecord.checkDay)) {
          evaluated.push(outcomeRecord.checkDay);
          signal.outcomesEvaluated = evaluated;
          await putRecord(STORES.signals, signal);
        }
      }
    }
    return outcomeRecord.id;
  }

  async function getOutcomes({ signalId, symbol, checkDay } = {}) {
    let records;
    if (signalId) {
      records = await getByIndex(STORES.outcomes, 'signalId', signalId);
    } else if (symbol) {
      records = await getByIndex(STORES.outcomes, 'symbol', symbol);
    } else {
      records = await getAllRecords(STORES.outcomes);
    }
    if (checkDay) records = records.filter(r => r.checkDay === checkDay);
    records.sort((a, b) => b.evaluatedAt - a.evaluatedAt);
    return records;
  }

  /* ── Settings ─────────────────────────────────────────── */

  async function getSetting(key) {
    const record = await getRecord(STORES.settings, key);
    return record ? record.value : undefined;
  }

  async function setSetting(key, value) {
    return putRecord(STORES.settings, { key, value, updatedAt: Date.now() });
  }

  /* ── Maintenance: Retention Cleanup ───────────────────── */

  async function cleanupOldData() {
    const now = Date.now();
    let cleaned = { scans: 0, signals: 0, outcomes: 0 };

    const allScans = await getAllRecords(STORES.scans);
    const expiredScans = allScans.filter(r => (now - r.timestamp) > RETENTION.scans);
    if (expiredScans.length) {
      const db = await getDB();
      const t = db.transaction(STORES.scans, 'readwrite');
      const store = t.objectStore(STORES.scans);
      for (const r of expiredScans) store.delete(r.id);
      await new Promise((resolve, reject) => { t.oncomplete = resolve; t.onerror = reject; });
      cleaned.scans = expiredScans.length;
    }

    const allSignals = await getAllRecords(STORES.signals);
    const expiredSignals = allSignals.filter(r => (now - r.timestamp) > RETENTION.signals);
    if (expiredSignals.length) {
      const db = await getDB();
      const t = db.transaction(STORES.signals, 'readwrite');
      const store = t.objectStore(STORES.signals);
      for (const r of expiredSignals) store.delete(r.id);
      await new Promise((resolve, reject) => { t.oncomplete = resolve; t.onerror = reject; });
      cleaned.signals = expiredSignals.length;
    }

    const allOutcomes = await getAllRecords(STORES.outcomes);
    const expiredOutcomes = allOutcomes.filter(r => (now - r.evaluatedAt) > RETENTION.outcomes);
    if (expiredOutcomes.length) {
      const db = await getDB();
      const t = db.transaction(STORES.outcomes, 'readwrite');
      const store = t.objectStore(STORES.outcomes);
      for (const r of expiredOutcomes) store.delete(r.id);
      await new Promise((resolve, reject) => { t.oncomplete = resolve; t.onerror = reject; });
      cleaned.outcomes = expiredOutcomes.length;
    }

    await setSetting('lastCleanup', { timestamp: now, cleaned });
    console.log('[DB] Cleanup complete:', cleaned);
    return cleaned;
  }

  /* ── Export / Import ──────────────────────────────────── */

  async function exportAll() {
    const [scans, signals, trades, outcomes, settings] = await Promise.all([
      getAllRecords(STORES.scans),
      getAllRecords(STORES.signals),
      getAllRecords(STORES.trades),
      getAllRecords(STORES.outcomes),
      getAllRecords(STORES.settings),
    ]);
    return {
      version: 'ST_V8_IDB',
      exportedAt: Date.now(),
      scans,
      signals,
      trades,
      outcomes,
      settings,
    };
  }

  async function importAll(json) {
    if (!json || typeof json !== 'object') throw new Error('Invalid backup data');
    const stores = [
      [STORES.scans, json.scans],
      [STORES.signals, json.signals],
      [STORES.trades, json.trades],
      [STORES.outcomes, json.outcomes],
      [STORES.settings, json.settings],
    ];
    let totalImported = 0;
    for (const [storeName, records] of stores) {
      if (!Array.isArray(records) || !records.length) continue;
      await putRecords(storeName, records);
      totalImported += records.length;
    }
    return totalImported;
  }

  /* ── Stats ────────────────────────────────────────────── */

  async function getStats() {
    const [scans, signals, trades, outcomes] = await Promise.all([
      countRecords(STORES.scans),
      countRecords(STORES.signals),
      countRecords(STORES.trades),
      countRecords(STORES.outcomes),
    ]);
    const lastCleanup = await getSetting('lastCleanup');
    return { scans, signals, trades, outcomes, lastCleanup };
  }

  /* ── Migration from localStorage ──────────────────────── */

  async function migrateFromLocalStorage() {
    const migrated = await getSetting('migrationComplete');
    if (migrated) return { skipped: true };

    const result = { journal: 0, scanMeta: false, coins: false };

    try {
      const rawJournal = localStorage.getItem('st_journal');
      if (rawJournal) {
        const journal = JSON.parse(rawJournal);
        if (Array.isArray(journal) && journal.length) {
          const tradeRecords = journal.map(j => ({
            id: j.id || `trade-migrated-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            coin: j.coin,
            date: j.date,
            setup: j.setup,
            result: j.result,
            entry: j.entry,
            stop: j.stop,
            tp: j.tp,
            reason: j.reason,
            lesson: j.lesson,
            onSystem: j.onSystem,
            migratedFrom: 'localStorage',
            migratedAt: Date.now(),
          }));
          await putRecords(STORES.trades, tradeRecords);
          result.journal = tradeRecords.length;
        }
      }

      const rawScanMeta = localStorage.getItem('st_scan_meta');
      if (rawScanMeta) {
        const scanMeta = JSON.parse(rawScanMeta);
        await setSetting('legacyScanMeta', scanMeta);
        result.scanMeta = true;
      }

      const rawCoins = localStorage.getItem('st_coins');
      if (rawCoins) {
        const coins = JSON.parse(rawCoins);
        if (Array.isArray(coins) && coins.length) {
          const scanRecord = {
            id: `scan-migrated-${Date.now()}`,
            timestamp: Date.now(),
            btcContext: 'sideway',
            regime: {},
            insight: {},
            universeCount: 0,
            candidateCount: coins.length,
            qualifiedCount: coins.filter(c => ['READY', 'SCALP_READY', 'PLAYABLE', 'PROBE'].includes(c.status)).length,
            rejectedCount: coins.filter(c => c.rejected || c.status === 'AVOID').length,
            runtimeSeconds: 0,
            source: 'MIGRATED_FROM_LOCALSTORAGE',
          };
          await addScan(scanRecord);

          const signalRecords = coins
            .filter(c => c && c.symbol)
            .slice(0, 30)
            .map(c => ({
              id: `sig-migrated-${c.symbol}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              scanId: scanRecord.id,
              symbol: c.symbol,
              timestamp: Date.now(),
              priceAtSignal: c.price || c.entry || 0,
              entry: c.entry || 0,
              stop: c.stop || 0,
              tp1: c.tp1 || 0,
              tp2: c.tp2 || 0,
              tp3: c.tp3 || 0,
              status: c.status || 'EARLY',
              setup: c.setup || c.structureTag || 'Unknown',
              score: c.score || 0,
              riskAdjustedScore: c.riskAdjustedScore || c.score || 0,
              edgeScore: c.edgeScore || 0,
              rr: c.rr || 0,
              executionConfidence: c.executionConfidence || 0,
              btcContext: 'sideway',
              fakePumpRisk: c.fakePumpRisk || 'unknown',
              chartEntryQuality: c.chartEntryQuality || 'neutral',
              entryTiming: c.entryTiming || 'unknown',
              smartMoneyScore: c.smartMoneyScore || 0,
              outcomesEvaluated: [],
              migratedFrom: 'localStorage',
            }));
          if (signalRecords.length) {
            await addSignals(signalRecords);
          }
          result.coins = true;
        }
      }

      // Mark migration complete BEFORE deleting localStorage
      await setSetting('migrationComplete', {
        timestamp: Date.now(),
        result,
      });

      // Only now remove legacy keys
      ['st_coins', 'st_watchlist', 'st_journal', 'st_scan_meta'].forEach(key => {
        try { localStorage.removeItem(key); } catch {}
      });

      console.log('[DB] Migration from localStorage complete:', result);
      return result;
    } catch (err) {
      console.error('[DB] Migration error:', err);
      return { error: err.message };
    }
  }

  /* ── Public API ───────────────────────────────────────── */

  return {
    open,
    STORES,
    RETENTION,
    addScan,
    getScans,
    getScanById,
    addSignals,
    addScanWithSignalsAtomic,
    getSignals,
    getSignalById,
    updateSignal,
    getUnevaluatedSignals,
    addTrade,
    getTrades,
    updateTrade,
    deleteTrade,
    addOutcome,
    getOutcomes,
    getSetting,
    setSetting,
    cleanupOldData,
    exportAll,
    importAll,
    getStats,
    migrateFromLocalStorage,
  };
})();
