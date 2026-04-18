/* ══════════════════════════════════════════════════════════
   IndexedDB Persistent Storage Layer — SystemTrader v8
   Repository / Service pattern for local-first edge engine
   ══════════════════════════════════════════════════════════ */

window.DB = (() => {
  const DB_NAME = 'SystemTraderDB';
  const DB_VERSION = 3; // v10.6.3 integration fix: align with live schema and avoid VersionError downgrade

  const STORES = {
    scans: 'scans',
    signals: 'signals',
    trades: 'trades',
    outcomes: 'outcomes',
    settings: 'settings',
    positions: 'positions', // v9 paper-trade lifecycle
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

  function attachDbHandlers(db) {
    if (!db) return db;
    db.onversionchange = () => {
      try { db.close(); } catch (_) {}
      _db = null;
      _ready = null;
      console.warn('[DB] Version changed in another tab/session. Connection reset.');
    };
    return db;
  }

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

        // v9: paper-trade position lifecycle store
        if (!db.objectStoreNames.contains(STORES.positions)) {
          const ps = db.createObjectStore(STORES.positions, { keyPath: 'id' });
          ps.createIndex('signalId',      'signalId',      { unique: false });
          ps.createIndex('symbol',        'symbol',        { unique: false });
          ps.createIndex('positionState', 'positionState', { unique: false });
          ps.createIndex('executionTier', 'executionTier', { unique: false });
          ps.createIndex('openedAt',      'openedAt',      { unique: false });
          ps.createIndex('closedAt',      'closedAt',      { unique: false });
        }
      };

      req.onsuccess = (e) => {
        _db = attachDbHandlers(e.target.result);
        resolve(_db);
      };

      req.onerror = () => {
        const err = req.error || null;
        const errName = String(err?.name || '');
        const errMsg = String(err?.message || '');
        const isVersionMismatch = errName === 'VersionError' || /less than the existing version/i.test(errMsg);

        if (isVersionMismatch) {
          console.warn('[DB] Version mismatch detected. Falling back to existing IndexedDB schema.', errMsg || errName);
          try {
            const fallbackReq = indexedDB.open(DB_NAME);
            fallbackReq.onsuccess = (evt) => {
              _db = attachDbHandlers(evt.target.result);
              resolve(_db);
            };
            fallbackReq.onerror = () => {
              const fallbackErr = fallbackReq.error || err || new Error('IndexedDB fallback open failed');
              console.error('[DB] IndexedDB fallback open failed:', fallbackErr);
              _ready = null;
              reject(fallbackErr);
            };
            return;
          } catch (fallbackOpenErr) {
            console.error('[DB] IndexedDB fallback open exception:', fallbackOpenErr);
          }
        }

        console.error('[DB] IndexedDB open failed:', err);
        _ready = null;
        reject(err);
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


  function normalizeScanRecord(scanRecord) {
    const row = Object.assign({}, scanRecord || {});
    const qualifiedDetails = Array.isArray(row.qualifiedDetails) ? row.qualifiedDetails.filter(Boolean) : [];
    const qualifiedCoins = Array.isArray(row.qualifiedCoins) ? row.qualifiedCoins.filter(Boolean) : [];
    const breakdown = row.executionBreakdown && typeof row.executionBreakdown === 'object' ? row.executionBreakdown : {};
    const explicitQualified = Number(row.executionQualifiedCount ?? row.qualifiedCount ?? breakdown.ready ?? breakdown.execution ?? breakdown.actionable ?? 0);
    const inferredQualified = Math.max(0, explicitQualified);
    row.qualifiedCount = inferredQualified;
    row.executionQualifiedCount = inferredQualified;
    row.executionBreakdown = {
      ready: Number(breakdown.ready ?? breakdown.execution ?? inferredQualified ?? 0),
      execution: Number(breakdown.execution ?? breakdown.ready ?? inferredQualified ?? 0),
      playable: Number(breakdown.playable || 0),
      probe: Number(breakdown.probe || 0),
      actionable: Number(breakdown.actionable ?? breakdown.ready ?? breakdown.execution ?? inferredQualified ?? 0),
      rejected: Number(breakdown.rejected ?? row.rejectedCount ?? 0),
    };
    if (!Array.isArray(row.qualifiedCoins) || row.qualifiedCoins.length !== inferredQualified) {
      row.qualifiedCoins = qualifiedCoins.length ? qualifiedCoins.slice(0, inferredQualified) : qualifiedDetails.filter(x => String(x?.status || '').toUpperCase() === 'READY').map(x => x.symbol).filter(Boolean);
    }
    if (!row.insight || typeof row.insight !== 'object') row.insight = {};
    row.insight.qualifiedCount = inferredQualified;
    return row;
  }

  async function addScan(scanRecord) {
    const safeScan = normalizeScanRecord(scanRecord);
    if (!safeScan.id) safeScan.id = `scan-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    if (!safeScan.timestamp) safeScan.timestamp = Date.now();
    return putRecord(STORES.scans, safeScan);
  }

  async function getScans({ from, to, limit } = {}) {
    let records = await getAllRecords(STORES.scans);
    records = records.map(normalizeScanRecord);
    if (from) records = records.filter(r => r.timestamp >= from);
    if (to) records = records.filter(r => r.timestamp <= to);
    records.sort((a, b) => b.timestamp - a.timestamp);
    if (limit) records = records.slice(0, limit);
    return records;
  }

  async function getScanById(id) {
    const row = await getRecord(STORES.scans, id);
    return normalizeScanRecord(row);
  }



  function buildSignalStableId(row, fallbackScanId) {
    const scanId = String(row?.scanId || fallbackScanId || '').trim();
    const symbol = String(row?.symbol || 'UNK').trim().toUpperCase();
    if (scanId && symbol) return `sig-${scanId}-${symbol}`;
    if (scanId) return `sig-${scanId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    return `sig-${symbol}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  }


  function getSemanticSignalBucket(signalRecord) {
    const row = normalizeSignalRecord(signalRecord || {});
    const status = String(row.status || '').toUpperCase();
    if (status === 'READY') return 'READY';
    if (status === 'PLAYABLE') return 'PLAYABLE';
    if (status === 'PROBE') return 'PROBE';
    if (['AVOID','REJECTED','FETCH_FAIL'].includes(status)) return 'AVOID';
    return 'WATCH';
  }

  function getAuthorityReasonValue(signalRecord) {
    return String(signalRecord?.authorityReason || signalRecord?.reason || '').trim();
  }

  function isBlockedLearningReason(reason) {
    return /^dedup:/i.test(reason)
      || /^capital_guard:/i.test(reason)
      || /^pre_gate_blocked:/i.test(reason)
      || /^all_tiers_rejected$/i.test(reason)
      || /^no_execution_result$/i.test(reason);
  }

  function isStrictLearningEligible(signalRecord) {
    const row = normalizeSignalRecord(signalRecord || {});
    const displayStatus = String(row.displayStatus || row.finalAuthorityStatus || row.status || '').toUpperCase();
    const authorityDecision = String(row.authorityDecision || row.decision || '').toUpperCase();
    const executionTier = String(row.executionTier || '').toUpperCase();
    const authorityReason = getAuthorityReasonValue(row);

    const decisionOk = authorityDecision !== 'REJECT';
    const gatePassedOk = row.executionGatePassed === true;
    const actionableOk = row.executionActionable === true;
    const statusOk = ['READY', 'PLAYABLE', 'PROBE'].includes(displayStatus);
    const tierOk = executionTier !== 'OBSERVE';
    const reasonOk = !isBlockedLearningReason(authorityReason);

    const isEligible = decisionOk && gatePassedOk && actionableOk && statusOk && tierOk && reasonOk;
    
    if (statusOk && !isEligible) {
      console.log(`[LEARNING_DEBUG] Signal ${row.symbol} (${displayStatus}) not eligible. Reason checks: decisionOk=${decisionOk}, gatePassedOk=${gatePassedOk}, actionableOk=${actionableOk}, tierOk=${tierOk}, reasonOk=${reasonOk} ("${authorityReason}")`);
    }
    
    return isEligible;
  }

  function getStrictLearningClassification(signalRecord) {
    const row = normalizeSignalRecord(signalRecord || {});
    if (!isStrictLearningEligible(row)) return 'reject';

    const displayStatus = String(row.displayStatus || row.finalAuthorityStatus || row.status || '').toUpperCase();
    if (displayStatus === 'READY') return 'execution';
    if (displayStatus === 'PLAYABLE') return 'playable';
    if (displayStatus === 'PROBE') return 'probe';
    return 'watch';
  }

  function buildStrictLearningRepair(signalRecord) {
    const row = normalizeSignalRecord(signalRecord || {});
    const learningEligible = isStrictLearningEligible(row);
    const classification = getStrictLearningClassification(row);

    return {
      learningEligible,
      classification,
      executionActionable: row.executionActionable === true && learningEligible,
      signalType: learningEligible ? classification : 'reject',
    };
  }

  function summarizeSignalsByScan(signals) {
    const scanSignalMap = new Map();
    for (const sig of (Array.isArray(signals) ? signals : [])) {
      const key = sig.scanId;
      if (!key) continue;
      const bucket = scanSignalMap.get(key) || { ready: 0, execution: 0, playable: 0, probe: 0, actionable: 0, rejected: 0, symbols: [] };
      const semantic = getSemanticSignalBucket(sig);
      if (semantic === 'READY') {
        bucket.ready += 1;
        bucket.execution += 1;
        bucket.actionable += 1;
        if (sig.symbol) bucket.symbols.push(sig.symbol);
      } else if (semantic === 'PLAYABLE') {
        bucket.playable += 1;
      } else if (semantic === 'PROBE') {
        bucket.probe += 1;
      } else if (semantic === 'AVOID') {
        bucket.rejected += 1;
      }
      scanSignalMap.set(key, bucket);
    }
    return scanSignalMap;
  }

  /* ── Signals ──────────────────────────────────────────── */

  async function addSignals(signalRecords) {
    if (!Array.isArray(signalRecords) || !signalRecords.length) return 0;
    const safeSignals = signalRecords.map(s => {
      const row = normalizeSignalRecord(s || {});
      row.id = row.id || buildSignalStableId(row);
      row.signalId = row.signalId || row.id;
      if (!row.timestamp) row.timestamp = Date.now();
      return row;
    });
    return putRecords(STORES.signals, safeSignals);
  }

  async function addScanWithSignalsAtomic(scanRecord, signalRecords = []) {
    const db = await getDB();
    const safeScan = normalizeScanRecord(scanRecord || {});
    if (!safeScan.id) safeScan.id = `scan-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    if (!safeScan.timestamp) safeScan.timestamp = Date.now();

    const safeSignals = (Array.isArray(signalRecords) ? signalRecords : []).map(s => {
      const row = normalizeSignalRecord(s || {});
      if (!row.scanId) row.scanId = safeScan.id;
      row.id = row.id || buildSignalStableId(row, safeScan.id);
      row.signalId = row.signalId || row.id;
      if (!row.timestamp) row.timestamp = Date.now();
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

  function normalizeSignalRecord(signalRecord) {
    const row = Object.assign({}, signalRecord || {});
    const explicitDisplayStatus = String(row.displayStatus || '').toUpperCase();
    const explicitFinalAuthorityStatus = String(row.finalAuthorityStatus || '').toUpperCase();
    const explicitAuthorityDecision = String(row.authorityDecision || row.decision || '').toUpperCase();
    const explicitAuthorityTrace = row.authorityTrace || null;
    const displayRaw = String(row.displayStatus || row.finalAuthorityStatus || row.status || '').toUpperCase();
    const statusRaw = String(row.status || row.displayStatus || row.finalAuthorityStatus || '').toUpperCase();
    const tradeStateRaw = String(row.tradeState || '').toUpperCase();
    const execTierRaw = String(row.executionTier || '').toUpperCase();
    const signalTypeRaw = String(row.signalType || '').toLowerCase();
    const classRaw = String(row.classification || row.executionClass || '').toLowerCase();
    const score = Number(row.riskAdjustedScore || row.score || 0);
    const setup = String(row.setup || row.structureTag || 'Unknown');
    const gatePassed = row.executionGatePassed === true || row.executionActionable === true;
    const alreadyNormalized = !!(explicitDisplayStatus && explicitFinalAuthorityStatus && row.hasOwnProperty('authorityDecision'));

    // v10.6.9.51: Absolute Contract Support
    const probeLike = classRaw === 'probe' || signalTypeRaw === 'probe' || ['PROBE', 'PROBE_PENDING'].includes(statusRaw) || ['PROBE', 'PROBE_PENDING'].includes(tradeStateRaw) || ['PROBE', 'PROBE_PENDING'].includes(execTierRaw) || displayRaw === 'PROBE' || explicitFinalAuthorityStatus === 'PROBE';
    const playableLike = classRaw === 'playable' || signalTypeRaw === 'playable' || statusRaw === 'PLAYABLE' || tradeStateRaw === 'PLAYABLE' || execTierRaw === 'PLAYABLE' || displayRaw === 'PLAYABLE' || explicitFinalAuthorityStatus === 'PLAYABLE';
    const activeLike = ['execution', 'active'].includes(classRaw) || signalTypeRaw === 'execution' || ['ACTIVE','READY','SCALP_READY','EXECUTION'].includes(statusRaw) || ['ACTIVE','READY','SCALP_READY','EXECUTION'].includes(tradeStateRaw) || ['ACTIVE','READY','SCALP_READY','EXECUTION'].includes(execTierRaw) || ['ACTIVE','READY','SCALP_READY','EXECUTION'].includes(displayRaw) || ['ACTIVE','READY','SCALP_READY','EXECUTION'].includes(explicitFinalAuthorityStatus);
    const rejectLike = ['AVOID','REJECT','REJECTED','FETCH_FAIL'].includes(statusRaw) || ['AVOID','REJECT','REJECTED'].includes(tradeStateRaw) || ['AVOID','REJECT','REJECTED'].includes(execTierRaw) || ['AVOID','REJECTED'].includes(displayRaw) || ['REJECT', 'REJECTED'].includes(explicitAuthorityDecision);

    if (!row.setup) row.setup = row.structureTag || 'Unknown';
    if (alreadyNormalized) {
      row.displayStatus = explicitDisplayStatus;
      row.finalAuthorityStatus = explicitFinalAuthorityStatus;
      row.authorityDecision = explicitAuthorityDecision || row.authorityDecision || row.decision || '';
      row.authorityTrace = explicitAuthorityTrace;
      row.status = statusRaw || explicitDisplayStatus || explicitFinalAuthorityStatus || 'WATCH';
      row.executionActionable = row.executionActionable === true || row.executionGatePassed === true || ['READY', 'PLAYABLE', 'PROBE'].includes(explicitDisplayStatus);
      if (row.executionActionable) row.executionGatePassed = true;
      row.isExecution = row.isExecution === true || explicitDisplayStatus === 'READY';
      row.playable = row.playable === true || ['READY', 'PLAYABLE'].includes(explicitDisplayStatus);
    } else if (/NO SETUP/i.test(setup)) {
      row.status = 'AVOID';
      row.executionActionable = false;
      row.executionGatePassed = false;
      row.isExecution = false;
      row.playable = false;
    } else if (rejectLike) {
      row.status = 'AVOID';
      row.executionActionable = false;
      row.executionGatePassed = false;
      row.isExecution = false;
      row.playable = false;
    } else if (probeLike && (gatePassed || score >= 18)) {
      row.status = 'PROBE';
      row.executionActionable = true;
      row.executionGatePassed = true;
      row.isExecution = true;
      row.playable = false;
    } else if (playableLike && (gatePassed || score >= 20)) {
      row.status = 'PLAYABLE';
      row.executionActionable = true;
      row.executionGatePassed = true;
      row.isExecution = true;
      row.playable = true;
    } else if (activeLike && (gatePassed || score >= 20)) {
      row.status = 'READY';
      row.executionActionable = true;
      row.executionGatePassed = true;
      row.isExecution = true;
      row.playable = true;
    } else {
      row.status = 'WATCH';
      row.executionActionable = false;
      row.isExecution = false;
      row.playable = false;
    }
    row.displayStatus = explicitDisplayStatus || String(row.displayStatus || row.status || 'WATCH').toUpperCase();
    row.finalAuthorityStatus = explicitFinalAuthorityStatus || String(row.finalAuthorityStatus || row.displayStatus || row.status || 'WATCH').toUpperCase();
    row.authorityDecision = explicitAuthorityDecision || row.authorityDecision || row.decision || (['READY', 'PLAYABLE'].includes(row.displayStatus) ? 'ALLOW' : (row.displayStatus === 'PROBE' ? 'WAIT' : 'REJECT'));
    row.authorityTrace = explicitAuthorityTrace || row.authorityTrace || null;
    if (!row.executionTier && row.finalAuthorityStatus) row.executionTier = row.finalAuthorityStatus;
    if (row.confScore == null && row.executionConfidence != null) row.confScore = row.executionConfidence;
    if (!row.entrySignal) row.entrySignal = row.entryTiming || 'wait';
    row.classification = row.classification || String(row.status || 'WATCH').toLowerCase();
    row.signalType = row.signalType || row.classification;
    if (!Array.isArray(row.outcomesEvaluated)) row.outcomesEvaluated = [];
    return row;
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
    records = (records || []).map(normalizeSignalRecord);
    if (from) records = records.filter(r => r.timestamp >= from);
    if (to) records = records.filter(r => r.timestamp <= to);
    if (status) records = records.filter(r => String(r.status || '').toUpperCase() === String(status).toUpperCase());
    if (setup) records = records.filter(r => r.setup === setup);
    records.sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));
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

  async function repairHistoricalSignalsLearning() {
    const startTime = Date.now();
    const db = await getDB();
    const allSignals = await getAllRecords(STORES.signals);
    if (!Array.isArray(allSignals) || !allSignals.length) {
      return { scanned: 0, repaired: 0, durationMs: Date.now() - startTime };
    }

    const repairedAt = Date.now();
    const dirtySignals = [];

    for (const signal of allSignals) {
      const repaired = buildStrictLearningRepair(signal);
      const learningEligible = signal.learningEligible === true;
      const classification = String(signal.classification || '').toLowerCase();
      const executionActionable = signal.executionActionable === true;
      const signalType = String(signal.signalType || '').toLowerCase();

      if (
        learningEligible !== repaired.learningEligible
        || classification !== repaired.classification
        || executionActionable !== repaired.executionActionable
        || signalType !== repaired.signalType
      ) {
        dirtySignals.push({
          ...signal,
          ...repaired,
          repairedAt,
          repairedBy: 'strict_learning_backfill_v1069',
        });
      }
    }

    if (!dirtySignals.length) {
      return { scanned: allSignals.length, repaired: 0, durationMs: Date.now() - startTime };
    }

    await new Promise((resolve, reject) => {
      const t = db.transaction(STORES.signals, 'readwrite');
      const store = t.objectStore(STORES.signals);
      dirtySignals.forEach(signal => store.put(signal));
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error || new Error('Historical learning repair failed'));
      t.onabort = () => reject(t.error || new Error('Historical learning repair aborted'));
    });

    return { 
      scanned: allSignals.length, 
      repaired: dirtySignals.length, 
      durationMs: Date.now() - startTime,
      repairedAt 
    };
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

  async function clearStore(storeName) {
    const store = await tx(storeName, 'readwrite');
    return promisify(store.clear());
  }

  async function importAll(json) {
    if (!json || typeof json !== 'object') throw new Error('Invalid backup data');

    // FULL CLEAN IMPORT: replace existing IndexedDB snapshot completely
    for (const storeName of [STORES.scans, STORES.signals, STORES.trades, STORES.outcomes, STORES.settings]) {
      await clearStore(storeName);
    }

    const scans = Array.isArray(json.scans) ? json.scans.map(normalizeScanRecord) : [];
    const signals = Array.isArray(json.signals) ? json.signals.map(normalizeSignalRecord) : [];
    const scanSignalMap = summarizeSignalsByScan(signals);
    const normalizedScans = scans.map(scan => {
      const summary = scanSignalMap.get(scan.id);
      if (!summary) return scan;
      scan.qualifiedCount = Number(summary.ready || summary.execution || 0);
      scan.executionQualifiedCount = Number(summary.ready || summary.execution || 0);
      scan.executionBreakdown = {
        ready: Number(summary.ready || summary.execution || 0),
        execution: Number(summary.execution || summary.ready || 0),
        playable: Number(summary.playable || 0),
        probe: Number(summary.probe || 0),
        actionable: Number(summary.ready || summary.execution || 0),
        rejected: Number(summary.rejected || 0)
      };
      scan.rejectedCount = Math.max(Number(scan.rejectedCount || 0), Number(summary.rejected || 0));
      scan.qualifiedCoins = Array.from(new Set(summary.symbols || []));
      if (!scan.insight || typeof scan.insight !== 'object') scan.insight = {};
      scan.insight.qualifiedCount = Number(summary.ready || summary.execution || 0);
      return scan;
    });

    const stores = [
      [STORES.scans, normalizedScans],
      [STORES.signals, signals],
      [STORES.trades, Array.isArray(json.trades) ? json.trades : []],
      [STORES.outcomes, Array.isArray(json.outcomes) ? json.outcomes : []],
      [STORES.settings, Array.isArray(json.settings) ? json.settings : []],
    ];
    let totalImported = 0;
    for (const [storeName, records] of stores) {
      if (!Array.isArray(records) || !records.length) continue;
      await putRecords(storeName, records);
      totalImported += records.length;
    }
    return totalImported;
  }


  async function rebuildSemanticHistory() {
    const [allScans, allSignals] = await Promise.all([
      getAllRecords(STORES.scans),
      getAllRecords(STORES.signals),
    ]);
    const normalizedSignals = (allSignals || []).map(normalizeSignalRecord);
    if (normalizedSignals.length) {
      await putRecords(STORES.signals, normalizedSignals);
    }
    const scanSignalMap = summarizeSignalsByScan(normalizedSignals);
    const normalizedScans = (allScans || []).map(raw => {
      const scan = normalizeScanRecord(raw);
      const summary = scanSignalMap.get(scan.id) || { ready: 0, execution: 0, playable: 0, probe: 0, actionable: 0, rejected: Number(scan.rejectedCount || 0), symbols: [] };
      scan.qualifiedCount = Number(summary.ready || summary.execution || 0);
      scan.executionQualifiedCount = Number(summary.ready || summary.execution || 0);
      scan.executionBreakdown = {
        ready: Number(summary.ready || summary.execution || 0),
        execution: Number(summary.execution || summary.ready || 0),
        playable: Number(summary.playable || 0),
        probe: Number(summary.probe || 0),
        actionable: Number(summary.ready || summary.execution || 0),
        rejected: Number(summary.rejected || 0),
      };
      scan.rejectedCount = Number(summary.rejected || 0);
      scan.qualifiedCoins = Array.from(new Set(summary.symbols || []));
      scan.qualifiedDetails = Array.isArray(scan.qualifiedDetails)
        ? scan.qualifiedDetails.filter(x => String(x?.status || '').toUpperCase() === 'READY')
        : [];
      if (!scan.insight || typeof scan.insight !== 'object') scan.insight = {};
      scan.insight.qualifiedCount = Number(summary.ready || summary.execution || 0);
      return scan;
    });
    if (normalizedScans.length) {
      await putRecords(STORES.scans, normalizedScans);
    }
    await setSetting('semanticHistoryMigration_v961', {
      timestamp: Date.now(),
      scans: normalizedScans.length,
      signals: normalizedSignals.length,
    });
    return { scans: normalizedScans.length, signals: normalizedSignals.length };
  }

  /* ── Stats ────────────────────────────────────────────── */

  async function getStats() {
    const [scans, signalsRaw, trades, outcomes] = await Promise.all([
      countRecords(STORES.scans),
      getAllRecords(STORES.signals),
      countRecords(STORES.trades),
      countRecords(STORES.outcomes),
    ]);
    const signals = (signalsRaw || []).map(normalizeSignalRecord).length;
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
            qualifiedCount: coins.filter(c => c && !/no setup/i.test(String(c.setup || '')) && ['READY', 'SCALP_READY', 'PLAYABLE', 'PROBE', 'EXECUTION'].includes(String(c.status || '').toUpperCase())).length,
            rejectedCount: coins.filter(c => c.rejected || ['AVOID','REJECTED'].includes(String(c.status || '').toUpperCase()) || /no setup/i.test(String(c.setup || ''))).length,
            runtimeSeconds: 0,
            source: 'MIGRATED_FROM_LOCALSTORAGE',
          };
          await addScan(scanRecord);

          const signalRecords = coins
            .filter(c => c && c.symbol && !/no setup/i.test(String(c.setup || '')))
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

  /* ── Positions (v9 paper-trade lifecycle) ────────────────────────────── */

  async function addPositions(positionRecords) {
    if (!Array.isArray(positionRecords) || !positionRecords.length) return 0;
    const safe = positionRecords.map(p => ({ ...p, _savedAt: Date.now() }));
    return putRecords(STORES.positions, safe);
  }

  async function checkDatabaseIntegrity() {
    const startTime = Date.now();
    try {
      const [scans, signals, trades, outcomes, positions] = await Promise.all([
        countRecords(STORES.scans),
        countRecords(STORES.signals),
        countRecords(STORES.trades),
        countRecords(STORES.outcomes),
        countRecords(STORES.positions),
      ]);

      const recentSignals = await getSignals({ limit: 4 });
      
      const summary = {
        timestamp: Date.now(),
        counts: { scans, signals, trades, outcomes, positions },
        samples: recentSignals.map(s => ({
          symbol: s.symbol,
          displayStatus: s.displayStatus,
          finalAuthorityStatus: s.finalAuthorityStatus,
          authorityDecision: s.authorityDecision,
          executionTier: s.executionTier,
          executionGatePassed: s.executionGatePassed,
          executionActionable: s.executionActionable,
          learningEligible: s.learningEligible,
          classification: s.classification,
          authorityReason: s.authorityReason || s.reason || 'None'
        })),
        durationMs: Date.now() - startTime,
        status: 'healthy'
      };

      window.__LAST_DB_INTEGRITY_SUMMARY__ = summary;
      return summary;
    } catch (err) {
      console.error('[DB] Integrity check failed:', err);
      return { status: 'error', error: err.message };
    }
  }

  async function getPositions({ symbol, positionState, from, to, limit } = {}) {
    let records = await getAllRecords(STORES.positions);
    if (symbol)        records = records.filter(r => String(r.symbol || '').toUpperCase() === String(symbol).toUpperCase());
    if (positionState) records = records.filter(r => r.positionState === positionState);
    if (from)          records = records.filter(r => Number(r.openedAt || 0) >= from);
    if (to)            records = records.filter(r => Number(r.openedAt || 0) <= to);
    records.sort((a, b) => Number(b.openedAt || 0) - Number(a.openedAt || 0));
    if (limit) records = records.slice(0, limit);
    return records;
  }

  async function updatePosition(id, changes) {
    const existing = await getRecord(STORES.positions, id);
    if (!existing) return null;
    Object.assign(existing, changes, { _updatedAt: Date.now() });
    return putRecord(STORES.positions, existing);
  }

  async function getPositionById(id) {
    return getRecord(STORES.positions, id);
  }

  /* ── Public API ───────────────────────────────────────────────────────── */

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
    repairHistoricalSignalsLearning,
    rebuildSemanticHistory,
    exportAll,
    importAll,
    getStats,
    migrateFromLocalStorage,
    checkDatabaseIntegrity,
    // v9 positions
    addPositions,
    getPositions,
    updatePosition,
    getPositionById,
  };
})();

/* ── DB_V9 alias (used by execution-engine-v9.js) ──────────────────────────── */
window.DB_V9 = window.DB;
