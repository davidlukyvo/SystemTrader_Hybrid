/* ══════════════════════════════════════════════════════════
   SCAN HISTORY PAGE — Browse past scan records & signals
   ══════════════════════════════════════════════════════════ */

var scanHistoryData = null;
var scanHistoryExpanded = null;
var scanHistoryLoading = false;

async function loadScanHistory() {
  scanHistoryLoading = true;
  try {
    scanHistoryData = await DB.getScans({ limit: 50 });
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
  var stats = await DB.getStats();

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
    '</div>' +
    '<div class="card"><div class="card-title">Scan Timeline</div>' +
      (scans.length === 0
        ? '<div class="text-sm text-muted" style="padding:24px;text-align:center">Chua co scan nao duoc ghi. Chay scanner de bat dau.</div>'
        : scans.map(function(scan) { return renderScanRow(scan); }).join('')
      ) +
    '</div>' +
    '<div id="scanSignalDetail" style="margin-top:20px"></div>';
}

function renderScanRow(scan) {
  var ts = new Date(scan.timestamp).toLocaleString('vi-VN');
  var regimeEmoji = { bull: '📈', sideway: '◈', bear: '📉' };
  var healthScore = (scan.insight && scan.insight.marketHealthScore) || 0;
  var healthColor = healthScore >= 7 ? 'var(--green)' : healthScore >= 4 ? 'var(--yellow)' : 'var(--red)';
  var healthLabel = (scan.insight && scan.insight.marketHealth) || 'weak';
  var healthCls = healthLabel === 'healthy' ? 'badge-green' : healthLabel === 'thin' ? 'badge-yellow' : 'badge-red';
  var isExpanded = scanHistoryExpanded === scan.id;

  var healthBlock = '';
  if (scan.insight && scan.insight.marketHealthScore !== undefined) {
    healthBlock = '<div style="margin-top:8px;display:flex;gap:16px;align-items:center"><span class="text-xs text-muted">Market Health</span><span class="mono fw-700" style="color:' + healthColor + '">' + healthScore + '/10</span><span class="badge ' + healthCls + '">' + healthLabel + '</span></div>';
  }

  return '<div style="padding:14px;border-radius:10px;background:var(--bg-hover);border:1px solid var(--border);margin-bottom:8px;cursor:pointer;transition:border-color .2s" onclick="toggleScanDetail(\'' + scan.id + '\')">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">' +
      '<div><div class="fw-700" style="font-size:14px">' + ts + '</div><div class="text-xs text-muted" style="margin-top:4px">' + (regimeEmoji[scan.btcContext] || '?') + ' ' + (scan.btcContext || 'unknown') + ' · Universe ' + (scan.universeCount || 0) + ' · Candidates ' + (scan.candidateCount || 0) + ' · ' + (scan.runtimeSeconds || 0) + 's</div></div>' +
      '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="badge badge-green">' + (scan.qualifiedCount || 0) + ' qualified</span><span class="badge badge-red">' + (scan.rejectedCount || 0) + ' rejected</span><span class="badge badge-gray" style="font-size:10px">' + (scan.source || 'unknown') + '</span><span style="font-size:14px">' + (isExpanded ? '▲' : '▼') + '</span></div>' +
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

  try {
    var signals = await DB.getSignals({ scanId: scanId });
    if (!signals.length) {
      detail.innerHTML = '<div class="card"><div class="text-sm text-muted" style="padding:16px;text-align:center">Khong co signal nao cho scan nay.</div></div>';
      return;
    }

    var statusOrder = { READY: 0, SCALP_READY: 1, PLAYABLE: 2, PROBE: 3, EARLY: 4, AVOID: 5 };
    signals.sort(function(a, b) {
      return (statusOrder[a.status] || 9) - (statusOrder[b.status] || 9) || (b.riskAdjustedScore || 0) - (a.riskAdjustedScore || 0);
    });

    var tableRows = signals.map(function(s) {
      var statusCls = s.status === 'READY' ? 'badge-green' : s.status === 'SCALP_READY' ? 'badge-purple' : s.status === 'PLAYABLE' ? 'badge-cyan' : s.status === 'PROBE' ? 'badge-yellow' : 'badge-gray';
      var evaluated = Array.isArray(s.outcomesEvaluated) ? s.outcomesEvaluated : [];
      return '<tr><td class="mono fw-700">' + s.symbol + '</td><td><span class="badge ' + statusCls + '">' + s.status + '</span></td><td class="text-sm">' + (s.setup || '—') + '</td><td class="mono fw-700">' + (s.riskAdjustedScore || s.score || 0) + '</td><td class="mono">' + (s.rr || 0).toFixed(1) + 'x</td><td class="mono">' + Math.round((s.executionConfidence || 0) * 100) + '%</td><td class="mono">' + fmtPrice(s.entry) + '</td><td class="text-xs">' + (s.entryTiming || '—') + '</td><td class="text-xs">' + (evaluated.length ? evaluated.join(', ') : '<span class="text-muted">pending</span>') + '</td></tr>';
    }).join('');

    detail.innerHTML = '<div class="card"><div class="card-title">Signals from scan (' + signals.length + ')</div><div style="overflow-x:auto"><table class="j-table"><thead><tr><th>Symbol</th><th>Status</th><th>Setup</th><th>Score</th><th>RR</th><th>Conf</th><th>Entry</th><th>Timing</th><th>Outcomes</th></tr></thead><tbody>' + tableRows + '</tbody></table></div></div>';
  } catch (err) {
    detail.innerHTML = '<div class="card"><div class="text-sm text-red" style="padding:16px">Error: ' + err.message + '</div></div>';
  }
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
