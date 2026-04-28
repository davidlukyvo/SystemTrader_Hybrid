/* ══════════════════════════════════════════════════════════
   SCAN HISTORY PAGE — Browse past scan records & signals
   ══════════════════════════════════════════════════════════ */

var scanHistoryData = null;
var scanHistoryExpanded = null;
var scanHistoryLoading = false;

function scanHistoryFreshnessTag(repeatCount5) {
  var n = Number(repeatCount5 || 0);
  if (n <= 1) return 'new';
  if (n >= 5) return 'persistent';
  return 'repeated';
}

function scanHistoryEscapeAttr(value) {
  return String(value || '').replace(/[&<>"']/g, function(ch) {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[ch];
  });
}

function buildScanHistoryFreshnessMap(scans, signals) {
  // Display-only freshness metadata. Never use this to filter, rank, or authorize signals.
  var recentIds = new Set((scans || []).slice(0, 5).map(function(scan) { return scan && scan.id; }).filter(Boolean));
  var map = {};
  if (!recentIds.size) return map;

  (signals || []).forEach(function(signal) {
    if (!signal || !signal.symbol || !recentIds.has(signal.scanId)) return;
    var sym = String(signal.symbol).toUpperCase();
    var item = map[sym] || { symbol: sym, scanIds: new Set(), lastAuthorityReason: '' };
    item.scanIds.add(signal.scanId);
    if (!item.lastAuthorityReason) item.lastAuthorityReason = signal.authorityReason || signal.reason || '';
    map[sym] = item;
  });

  return Object.keys(map).reduce(function(acc, sym) {
    var repeatCount5 = map[sym].scanIds.size;
    acc[sym] = {
      symbol: sym,
      repeatCount5: repeatCount5,
      freshnessTag: scanHistoryFreshnessTag(repeatCount5),
      lastAuthorityReason: map[sym].lastAuthorityReason || ''
    };
    return acc;
  }, {});
}

function renderScanHistoryFreshnessBadge(symbol) {
  var key = String(symbol || '').toUpperCase();
  var meta = window.__SCAN_HISTORY_FRESHNESS__ && window.__SCAN_HISTORY_FRESHNESS__[key];
  if (!meta) return '';
  var tag = meta.freshnessTag || scanHistoryFreshnessTag(meta.repeatCount5);
  var cls = tag === 'new' ? 'badge-green' : tag === 'persistent' ? 'badge-yellow' : 'badge-gray';
  var reason = meta.lastAuthorityReason ? ' | Recent context: ' + scanHistoryEscapeAttr(meta.lastAuthorityReason) : '';
  return '<span class="badge ' + cls + '" style="font-size:9px" title="Seen in ' + (meta.repeatCount5 || 0) + '/5 recent scans' + reason + '">' + tag + ' ' + (meta.repeatCount5 || 0) + '/5</span>';
}

async function loadScanHistory() {
  scanHistoryLoading = true;
  try {
    scanHistoryData = await DB.getScans({ limit: 50, direction: 'prev' });
  } catch (err) {
    console.error('[SCAN-HISTORY] Load error:', err);
    scanHistoryData = [];
  }
  scanHistoryLoading = false;
}

async function renderScanHistory() {
  var page = document.getElementById('page-scan-history');
  if (!page) return;

  if (!scanHistoryData && !scanHistoryLoading) {
    page.innerHTML = '<div class="page-header"><div class="page-title">🕐 Scan History</div><div class="page-sub">Dang tai...</div></div><div class="card" style="text-align:center;padding:60px"><div class="text-muted">⏳ Loading scan history...</div></div>';
    await loadScanHistory();
  }

  var scans = scanHistoryData || [];
  var [stats, allSignals] = await Promise.all([DB.getStats(), DB.getSignals({ limit: 2000 })]);
  window.__SCAN_HISTORY_FRESHNESS__ = buildScanHistoryFreshnessMap(scans, allSignals);
  var scanCounts = new Map();
  var toDisplayStatus = function(row) { return (typeof getExecutionDisplayStatus === 'function' ? getExecutionDisplayStatus(row) : String(row.displayStatus || row.finalAuthorityStatus || row.tradeState || row.executionTier || row.status || 'UNKNOWN')).toUpperCase(); };
  (allSignals || []).forEach(function(s){
    var key = s.scanId;
    if(!key) return;
    var ds = toDisplayStatus(s);
    var bucket = scanCounts.get(key) || { actionable:0, ready:0, execution:0, playable:0, probe:0, rejected:0, total:0 };
    bucket.total += 1;
    if(ds === 'READY'){ bucket.ready += 1; bucket.execution += 1; bucket.actionable += 1; }
    else if(ds === 'PLAYABLE'){ bucket.playable += 1; bucket.actionable += 1; }
    else if(ds === 'PROBE'){ bucket.probe += 1; bucket.actionable += 1; }
    else if(['REJECTED','AVOID'].includes(ds)) bucket.rejected += 1;
    scanCounts.set(key, bucket);
  });

  page.innerHTML =
    '<div class="page-header"><div class="page-title">🕐 Scan History</div><div class="page-sub">' + scans.length + ' scans · ' + (stats.signals || 0) + ' total signals recorded</div></div>' +
    '<div class="grid-3 mb-20">' +
      '<div class="stat-card stat-cyan"><div class="stat-label">Total Scans</div><div class="stat-value">' + (stats.scans || 0) + '</div><div class="stat-note">Retention: 180 days</div></div>' +
      '<div class="stat-card stat-green"><div class="stat-label">Total Signals</div><div class="stat-value">' + (stats.signals || 0) + '</div><div class="stat-note">Retention: 365 days</div></div>' +
      '<div class="stat-card stat-purple"><div class="stat-label">Outcomes</div><div class="stat-value">' + (stats.outcomes || 0) + '</div><div class="stat-note">Checkpoint evaluations</div></div>' +
    '</div>' +
    '<div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">' +
      '<button class="btn btn-sm btn-outline" onclick="reloadScanHistory()">♻ Reload</button>' +
      '<button class="btn btn-sm btn-outline" onclick="exportDBBackup()">⬇ Export All Data</button>' +
      '<button class="btn btn-sm btn-outline" onclick="importDBBackup()">⬆ Import Data</button>' +
      '<button class="btn btn-sm btn-outline" onclick="runDBCleanup()">🗑 Run Cleanup</button>' +
      '<button class="btn btn-sm btn-outline" onclick="runSemanticHistoryClean()">🧹 Clean Semantic History</button>' +
    '</div>' +
    '<div class="card"><div class="card-title">Scan Timeline</div>' +
      (scans.length === 0
        ? '<div class="text-sm text-muted" style="padding:24px;text-align:center">Chua co scan nao duoc ghi. Chay scanner de bat dau.</div>'
        : scans.map(function(scan) { return renderScanRow(scan, scanCounts); }).join('')
      ) +
    '</div>' +
    '<div id="scanSignalDetail" style="margin-top:20px"></div>' +
    '<div id="persistedRecordInspector" style="margin-top:20px"></div>';
  
  renderPersistedRecordInspector();
}

async function renderPersistedRecordInspector() {
  const container = document.getElementById('persistedRecordInspector');
  if (!container) return;

  const integrity = window.__LAST_DB_INTEGRITY_SUMMARY__ || await DB.checkDatabaseIntegrity();
  const samples = integrity.samples || [];

  if (!samples.length) {
    container.innerHTML = '<div class="card"><div class="card-title">&#x1F50D; Persisted Record Inspector</div><div class="text-sm text-muted p-16">No recent signals available for inspection.</div></div>';
    return;
  }

  const rows = samples.map(s => `
    <tr>
      <td class="mono fw-700">${s.symbol}</td>
      <td><span class="badge ${s.displayStatus === 'READY' ? 'badge-green' : s.displayStatus === 'PLAYABLE' ? 'badge-cyan' : s.displayStatus === 'PROBE' ? 'badge-yellow' : 'badge-gray'}">${s.displayStatus}</span></td>
      <td><span class="badge ${s.authorityDecision === 'ALLOW' ? 'badge-green' : s.authorityDecision === 'WAIT' ? 'badge-yellow' : 'badge-red'}">${s.authorityDecision}</span></td>
      <td class="text-xs">${s.executionTier}</td>
      <td class="mono" style="font-size:10px">${s.executionGatePassed ? '<span class="text-green">PASS</span>' : '<span class="text-red">FAIL</span>'}</td>
      <td class="mono" style="font-size:10px">${s.executionActionable ? 'YES' : 'NO'}</td>
      <td class="mono" style="font-size:10px">${s.isTechnicalCandidate ? 'YES' : 'NO'}</td>
      <td class="mono" style="font-size:10px">${s.isExecutionApproved ? 'YES' : 'NO'}</td>
      <td class="mono" style="font-size:10px">${s.isExecutionRejected ? 'YES' : 'NO'}</td>
      <td class="mono" style="font-size:10px">${s.isAlertEligible ? 'YES' : 'NO'}</td>
      <td class="mono" style="font-size:10px">${s.isPortfolioBound ? 'YES' : 'NO'}</td>
      <td class="mono" style="font-size:10px">${Number(s.rawScannerScore || 0)}</td>
      <td class="mono" style="font-size:10px">${Number(s.riskAdjustedScore || 0)}</td>
      <td class="mono" style="font-size:10px">${Number(s.executionQualityScore || 0)}</td>
      <td class="mono" style="font-size:10px">${s.learningEligible ? 'YES' : 'NO'}</td>
      <td class="mono" style="font-size:10px">${s.learningPool || 'excluded'}</td>
      <td class="mono" style="font-size:10px">${s.hasAuthorityTrace ? 'YES' : 'NO'}</td>
      <td class="text-xs text-muted" title="${s.authorityReason}">${s.authorityReason.length > 20 ? s.authorityReason.slice(0, 20) + '...' : s.authorityReason}</td>
    </tr>
  `).join('');

  container.innerHTML = `
    <div class="card">
      <div class="card-title" style="display:flex; justify-content:space-between; align-items:center">
        <span>&#x1F50D; Persisted Record Inspector (Sampled)</span>
        <span class="text-xs text-muted">v10.6.9 Audit Layer</span>
      </div>
      <div class="text-xs text-muted mb-12">Checking raw persistence integrity for 4 most recent signals. Ensures Alpha Guard decision maps correctly to DB storage.</div>
      <div style="overflow-x:auto">
        <table class="j-table" style="font-size:11px">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Display</th>
              <th>Decision</th>
              <th>Tier</th>
              <th>Gate</th>
              <th>Actn</th>
              <th>Tech</th>
              <th>Exec</th>
              <th>Reject</th>
              <th>Alert</th>
              <th>Bound</th>
              <th>Raw</th>
              <th>Risk</th>
              <th>ExecQ</th>
              <th>Learn</th>
              <th>Pool</th>
              <th>Trace</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderScanRow(scan, scanCounts) {
  var ts = new Date(scan.timestamp).toLocaleString('vi-VN');
  var regimeEmoji = { bull: '📈', sideway: '◈', bear: '📉' };
  var healthScore = (scan.insight && scan.insight.marketHealthScore) || 0;
  var healthColor = healthScore >= 7 ? 'var(--green)' : healthScore >= 4 ? 'var(--yellow)' : 'var(--red)';
  var healthLabel = (scan.insight && scan.insight.marketHealth) || 'weak';
  var healthCls = healthLabel === 'healthy' ? 'badge-green' : healthLabel === 'thin' ? 'badge-yellow' : 'badge-red';
  var isExpanded = scanHistoryExpanded === scan.id;
  var derived = (scanCounts && scanCounts.get(scan.id)) || { actionable: Number(scan.executionBreakdown?.actionable ?? ((Number(scan.executionBreakdown?.ready || 0) + Number(scan.executionBreakdown?.playable || 0) + Number(scan.executionBreakdown?.probe || 0)))), ready: Number(scan.executionBreakdown?.ready ?? scan.executionBreakdown?.execution ?? scan.executionQualifiedCount ?? scan.qualifiedCount ?? 0), execution: Number(scan.executionBreakdown?.execution ?? scan.executionBreakdown?.ready ?? scan.executionQualifiedCount ?? scan.qualifiedCount ?? 0), playable: Number(scan.executionBreakdown?.playable || 0), probe: Number(scan.executionBreakdown?.probe || 0), rejected: Number(scan.rejectedCount || 0), total: 0 };

  // Patch A: Semantic clarity — explicit field naming:
  //   eb.actionable         = gate-passed actionable count across READY + PLAYABLE + PROBE lanes
  //                           (same scope as deployableTop3 shortlist)
  //   executionQualifiedCount = READY-tier qualified count only (strictest lane)
  //   deployableTop3          = deployable shortlist across READY/PLAYABLE/PROBE (up to 3 coins)
  // A scan can have eb.actionable=2 and executionQualifiedCount=0 — this is correct:
  //   it means 2 coins passed all gates but none reached READY tier.
  var actionable = derived.actionable || 0;
  var readyCount = derived.ready || derived.execution || 0;  // = executionQualifiedCount (READY-tier only)
  var playableCount = derived.playable || 0;
  var probeCount = derived.probe || 0;
  var rejectedCount = derived.rejected || scan.rejectedCount || 0;

  // R = executionQualifiedCount (READY-tier qualified count)
  // P = PLAYABLE gate-passed count  |  Pr = PROBE gate-passed count
  var tierBreakdown = (readyCount || playableCount || probeCount)
    ? '<span class="badge badge-gray" style="font-size:10px" title="R = executionQualifiedCount (READY-tier qualified count) · P = PLAYABLE gate-passed · Pr = PROBE gate-passed">R' + readyCount + '·P' + playableCount + '·Pr' + probeCount + '</span>'
    : '';

  // scanTruthBasis debug badge — explains why eqc=0 when deployableTop3 has coins
  var basisBadgeHtml = '';
  if (scan.scanTruthBasis && scan.scanTruthBasis !== 'no_actionable') {
    var basisLabel = scan.scanTruthBasis === 'technical_qualified_capital_suppressed'
      ? '<span class="badge badge-yellow" style="font-size:9px" title="Alpha Guard found READY signals but capital/regime suppression blocked deployment">⚡ capital-suppressed</span>'
      : scan.scanTruthBasis === 'execution_qualified'
        ? '<span class="badge badge-green" style="font-size:9px">exec-qualified</span>'
        : '<span class="badge badge-gray" style="font-size:9px">' + scan.scanTruthBasis + '</span>';
    basisBadgeHtml = basisLabel;
  }

  var healthBlock = '';
  if (scan.insight && scan.insight.marketHealthScore !== undefined) {
    var note = (scan.insight && scan.insight.healthConfidenceNote) ? '<span class="text-xs text-muted">' + scan.insight.healthConfidenceNote + '</span>' : '';
    healthBlock = '<div style="margin-top:8px;display:flex;gap:16px;align-items:center;flex-wrap:wrap"><span class="text-xs text-muted">Market Health</span><span class="mono fw-700" style="color:' + healthColor + '">' + healthScore + '/10</span><span class="badge ' + healthCls + '">' + healthLabel + '</span>' + note + '</div>';
  }

  return '<div style="padding:14px;border-radius:10px;background:var(--bg-hover);border:1px solid var(--border);margin-bottom:8px;cursor:pointer;transition:border-color .2s" onclick="toggleScanDetail(\'' + scan.id + '\')">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">' +
      '<div><div class="fw-700" style="font-size:14px">' + ts + '</div><div class="text-xs text-muted" style="margin-top:4px">' + (regimeEmoji[scan.btcContext] || '?') + ' ' + (scan.btcContext || 'unknown') + ' · Universe ' + (scan.universeCount || 0) + ' · Candidates ' + (scan.candidateCount || 0) + ' · ' + (scan.runtimeSeconds || 0) + 's</div></div>' +
      '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
        '<span class="badge badge-green" title="eb.actionable = gate-passed actionable count across READY + PLAYABLE + PROBE lanes (same scope as deployableTop3 deployable shortlist). Does NOT equal executionQualifiedCount which is READY-tier only.">' + actionable + ' actionable</span>' +
        '<span class="badge badge-red">' + rejectedCount + ' rejected</span>' +
        tierBreakdown +
        basisBadgeHtml +
        '<span class="badge badge-gray" style="font-size:10px">' + (scan.source || 'unknown') + '</span>' +
        '<span style="font-size:14px">' + (isExpanded ? '▲' : '▼') + '</span>' +
      '</div>' +
    '</div>' + healthBlock +
  '</div>';

}

async function toggleScanDetail(scanId) {
  if (scanHistoryExpanded === scanId) {
    scanHistoryExpanded = null;
    var detail = document.getElementById('scanSignalDetail');
    if (detail) detail.innerHTML = '';
    return;
  }
  scanHistoryExpanded = scanId;
  var detail = document.getElementById('scanSignalDetail');
  if (!detail) return;

  detail.innerHTML = '<div class="card" style="text-align:center;padding:24px"><div class="text-muted">⏳ Loading signals...</div></div>';

  window.__CURRENT_SCAN_SIGNALS__ = [];
  window.__CURRENT_SCAN_CATEGORY_FILTER__ = 'ALL';

  try {
    var signals = await DB.getSignals({ scanId: scanId });
    window.__CURRENT_SCAN_SIGNALS__ = signals;
    renderScanSignalDetailContent(signals);
  } catch (err) {
    detail.innerHTML = '<div class="card"><div class="text-sm text-red" style="padding:16px">Error: ' + err.message + '</div></div>';
  }
}

function renderScanSignalDetailContent(signals) {
  var detail = document.getElementById('scanSignalDetail');
  if (!detail) return;

  var filter = window.__CURRENT_SCAN_CATEGORY_FILTER__ || 'ALL';
  var filtered = filter === 'ALL' ? signals : signals.filter(s => (s.category || 'OTHER') === filter);

  var categories = ['ALL', ...new Set(signals.map(s => s.category || 'OTHER'))];
  var filterHtml = '<div style="margin-bottom:12px;display:flex;align-items:center;gap:8px"><span class="text-xs text-muted">Filter Category:</span>' + 
    categories.map(c => '<button class="btn btn-xs ' + (filter === c ? 'btn-primary' : 'btn-outline') + '" onclick="filterScanSignalsByCategory(\'' + c + '\')">' + c + '</button>').join('') + 
    '</div>';

  if (!filtered.length) {
    detail.innerHTML = '<div class="card"><div class="card-title">Signals from scan (' + signals.length + ')</div>' + filterHtml + '<div class="text-sm text-muted" style="padding:16px;text-align:center">No signals match this filter.</div></div>';
    return;
  }

  var statusOrder = { READY: 0, PLAYABLE: 1, PROBE: 2, WATCH: 3, EARLY: 4, AVOID: 5 };
  var displayStatus = function(row) { return (typeof getExecutionDisplayStatus === 'function' ? getExecutionDisplayStatus(row) : String(row.displayStatus || row.finalAuthorityStatus || row.tradeState || row.executionTier || row.status || 'UNKNOWN')).toUpperCase(); };
  var setupLabel = function(row) { return (typeof getStructuralSetupLabel === 'function' ? getStructuralSetupLabel(row) : String(row.setup || row.structureTag || '—')); };
  
  filtered.sort(function(a, b) {
    var aStatus = displayStatus(a);
    var bStatus = displayStatus(b);
    var aExec = ['READY','PLAYABLE','PROBE'].includes(aStatus) ? 1 : 0;
    var bExec = ['READY','PLAYABLE','PROBE'].includes(bStatus) ? 1 : 0;
    return (bExec - aExec) || ((statusOrder[aStatus] || 9) - (statusOrder[bStatus] || 9)) || ((b.riskAdjustedScore || 0) - (a.riskAdjustedScore || 0));
  });

  var tableRows = filtered.map(function(s) {
    var display = displayStatus(s);
    var statusCls = display === 'READY' ? 'badge-green' : display === 'PLAYABLE' ? 'badge-cyan' : display === 'PROBE' ? 'badge-yellow' : ['EARLY','WATCH'].includes(display) ? 'badge-gray' : 'badge-red';
    var cat = s.category || 'OTHER';
    var evaluated = Array.isArray(s.outcomesEvaluated) ? s.outcomesEvaluated : [];
    var hasBev = s.behaviorEvidence && typeof s.behaviorEvidence === 'object';
    var bevId = 'bev-' + (s.id || s.symbol || Math.random().toString(36).slice(2, 8));

    var signalRow = '<tr>' +
      '<td><span class="mono fw-700">' + s.symbol + '</span> ' + renderScanHistoryFreshnessBadge(s.symbol) + '</td>' +
      '<td><span class="badge badge-purple">' + cat + '</span></td>' +
      '<td><span class="badge ' + statusCls + '">' + display + '</span></td>' +
      '<td class="text-sm">' + setupLabel(s) + '</td>' +
      '<td class="mono fw-700">' + (s.riskAdjustedScore || s.score || 0) + '</td>' +
      '<td class="mono">' + (s.rr || 0).toFixed(1) + 'x</td>' +
      '<td class="mono">' + Math.round((s.executionConfidence || 0) * 100) + '%</td>' +
      '<td class="mono">' + fmtPrice(s.entry) + '</td>' +
      '<td class="text-xs">' + (s.entryTiming || '—') + '</td>' +
      '<td class="text-xs">' + (evaluated.length ? evaluated.join(', ') : '<span class="text-muted">pending</span>') + '</td>' +
      '<td style="text-align:center">' + (hasBev
        ? '<button onclick="toggleBehaviorEvidence(\'' + bevId + '\')" title="Behavior Evidence (observe only)" style="background:none;border:1px solid rgba(0,229,255,0.3);border-radius:4px;cursor:pointer;color:var(--cyan);font-size:10px;padding:2px 5px">🔬</button>'
        : '<span class="text-muted" style="font-size:10px">—</span>') + '</td>' +
      '</tr>';

    var bevRow = '';
    if (hasBev) {
      var bev = s.behaviorEvidence;
      var failModes = Array.isArray(s.failureModeCandidate) ? s.failureModeCandidate.join(', ') : '—';
      var approxNotes = Array.isArray(s.behaviorApproximationNotes) && s.behaviorApproximationNotes.length ? s.behaviorApproximationNotes.join(' · ') : '';
      var iqColor = s.behaviorInputQuality === 'full_ohlcv' ? 'var(--green)' : s.behaviorInputQuality === 'partial' ? 'var(--yellow)' : 'var(--text)';
      var flags = [
        bev.absorptionEvidence      ? '✅ absorption'      : null,
        bev.reclaimEvidence         ? '✅ reclaim'         : null,
        bev.breakoutAcceptance      ? '✅ breakoutOK'      : null,
        bev.failedBreakdownEvidence ? '✅ failedBreakdown' : null,
        bev.sellingExhaustion       ? '✅ sellExhaustion'  : null,
        bev.volumeExpansion         ? '✅ volExpansion'    : null,
        bev.lateEntryRisk           ? '⚠️ lateEntry' : null,
        bev.stopTooTightRisk        ? '⚠️ stopTight' : null,
        bev.noFollowThroughRisk     ? '⚠️ noFollowThru' : null,
      ].filter(Boolean);
      bevRow = '<tr id="' + bevId + '" style="display:none"><td colspan="11" style="padding:0 4px 8px">' +
        '<div style="background:rgba(0,229,255,0.04);border:1px solid rgba(0,229,255,0.18);border-radius:6px;padding:10px 14px;font-size:11px;line-height:1.7">' +
          '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:6px">' +
            '<span class="badge badge-gray">🔬 Behavior Evidence</span>' +
            '<span style="color:' + iqColor + ';font-size:10px">' + (s.behaviorInputQuality || 'n/a') + '</span>' +
            '<span class="text-muted" style="font-size:10px">· observe-only · not used in trade decisions</span>' +
          '</div>' +
          '<div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:4px">' +
            '<span>Zone Quality: <strong>' + (s.priceZoneQuality != null ? s.priceZoneQuality + '/100' : '—') + '</strong></span>' +
            '<span>Vol Support: <strong>' + (s.volumeSupportScore != null ? s.volumeSupportScore + '/100' : '—') + '</strong></span>' +
            '<span>TP Risk: <strong>' + (s.volumeResistanceRisk != null ? s.volumeResistanceRisk + '/100' : '—') + '</strong></span>' +
            '<span>Path Quality: <strong>' + (s.pathToTPQuality != null ? s.pathToTPQuality + '/100' : '—') + '</strong></span>' +
          '</div>' +
          '<div style="margin-bottom:4px">Flags: <span style="color:var(--cyan)">' + (flags.join(' · ') || 'none') + '</span></div>' +
          '<div style="margin-bottom:4px">Failure Modes: <strong>' + failModes + '</strong></div>' +
          (approxNotes ? '<div class="text-muted" style="font-size:10px">Approx: ' + approxNotes + '</div>' : '') +
          '<div class="text-muted" style="font-size:10px">Version: ' + (s.behaviorEngineVersion || 'n/a') + '</div>' +
        '</div></td></tr>';
    }
    return signalRow + bevRow;
  }).join('');

  detail.innerHTML = '<div class="card"><div class="card-title">Signals from scan (' + signals.length + ')</div>' + filterHtml +
    '<div style="overflow-x:auto"><table class="j-table"><thead><tr>' +
    '<th>Symbol</th><th>Category</th><th>Status</th><th>Setup</th><th>Score</th><th>RR</th><th>Conf</th><th>Entry</th><th>Timing</th><th>Outcomes</th>' +
    '<th title="Market Behavior Evidence (observe only)">🔬</th>' +
    '</tr></thead><tbody>' + tableRows + '</tbody></table></div></div>';
}

function filterScanSignalsByCategory(category) {
  window.__CURRENT_SCAN_CATEGORY_FILTER__ = category;
  renderScanSignalDetailContent(window.__CURRENT_SCAN_SIGNALS__);
}

// Toggle behavior evidence panel (observe-only display)
function toggleBehaviorEvidence(bevId) {
  var el = document.getElementById(bevId);
  if (el) el.style.display = el.style.display === 'none' ? 'table-row' : 'none';
}

async function reloadScanHistory() {
  scanHistoryData = null;
  scanHistoryExpanded = null;
  await loadScanHistory();
  renderScanHistory();
}

async function exportDBBackup() {
  try {
    var data = await DB.exportAll();
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'system-trader-v8-backup-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function() { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  } catch (err) {
    alert('Export failed: ' + err.message);
  }
}

async function importDBBackup() {
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.onchange = async function() {
    var file = input.files && input.files[0];
    if (!file) return;
    try {
      var text = await file.text();
      var data = JSON.parse(text);
      if (data.version === 'ST_V8_IDB') {
        var count = await DB.importAll(data);
        alert('Imported ' + count + ' records (v8 format)');
      } else if (data.version && data.coins) {
        ST.importData(data);
        alert('Imported legacy v7 backup.');
      } else {
        throw new Error('Unrecognized backup format');
      }
      scanHistoryData = null;
      await loadScanHistory();
      renderScanHistory();
    } catch (err) {
      alert('Import failed: ' + err.message);
    }
  };
  input.click();
}

async function runDBCleanup() {
  if (!confirm('Xoa du lieu cu theo retention policy?\n\nScans > 180 ngay\nSignals/Outcomes > 365 ngay\nTrades: giu vinh vien')) return;
  try {
    var cleaned = await DB.cleanupOldData();
    alert('Cleanup complete:\nScans: ' + cleaned.scans + ' removed\nSignals: ' + cleaned.signals + ' removed\nOutcomes: ' + cleaned.outcomes + ' removed');
    scanHistoryData = null;
    await loadScanHistory();
    renderScanHistory();
  } catch (err) {
    alert('Cleanup failed: ' + err.message);
  }
}


async function runSemanticHistoryClean() {
  try {
    if (!window.DB?.rebuildSemanticHistory) throw new Error('Semantic migration not available');
    var result = await window.DB.rebuildSemanticHistory();
    await loadScanHistory();
    await renderScanHistory();
    if (typeof showToast === 'function') showToast('Semantic history cleaned: ' + (result.scans || 0) + ' scans · ' + (result.signals || 0) + ' signals');
  } catch (err) {
    console.error('[SCAN-HISTORY] Semantic clean failed:', err);
    if (typeof showToast === 'function') showToast('Semantic clean failed: ' + err.message, 'error');
  }
}
