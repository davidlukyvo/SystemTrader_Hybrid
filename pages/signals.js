/* ── SIGNAL HISTORY PAGE v8.1 HYBRID ───────────────────────────────────── */
async function renderSignals() {
  const el = $('page-signals');
  if (!el) return;
  el.innerHTML = `
    <div class="page-header">
      <div class="page-title">🧠 Signal History</div>
      <div class="page-sub">Best of both: signal browser + checkpoint outcomes + backup tools</div>
    </div>
    <div class="card"><div class="text-sm text-muted">Đang tải signal history...</div></div>`;

  if (!window.DB) {
    el.innerHTML = `<div class="page-header"><div class="page-title">🧠 Signal History</div></div><div class="card"><div class="text-sm text-muted">IndexedDB chưa sẵn sàng.</div></div>`;
    return;
  }

  const [signalsRaw, scans, outcomes, trades, stats] = await Promise.all([
    DB.getSignals({ limit: 1000 }),
    DB.getScans({ limit: 30 }),
    DB.getOutcomes({}),
    DB.getTrades({ limit: 80 }),
    DB.getStats()
  ]);

  const displayStatus = (row) => {
    if (typeof window.getExecutionDisplayStatus === 'function') return window.getExecutionDisplayStatus(row);
    // Fallback for direct record access
    return String(row?.displayStatus || row?.finalAuthorityStatus || row?.status || 'WATCH').toUpperCase();
  };
  const setupLabel = (row) => {
    if (typeof window.getStructuralSetupLabel === 'function') return window.getStructuralSetupLabel(row);
    return String(row?.setup || row?.structureTag || 'unknown');
  };
  const cleanSignals = (Array.isArray(signalsRaw) ? [...signalsRaw] : []).filter(s => !/no setup/i.test(String(setupLabel(s) || '')));
  const sortedSignals = cleanSignals.sort((a, b) => {
    const aExec = ['READY','PLAYABLE','PROBE'].includes(displayStatus(a)) ? 1 : 0;
    const bExec = ['READY','PLAYABLE','PROBE'].includes(displayStatus(b)) ? 1 : 0;
    return bExec - aExec
      || Number(b?.timestamp || 0) - Number(a?.timestamp || 0)
      || Number(b?.riskAdjustedScore || b?.score || 0) - Number(a?.riskAdjustedScore || a?.score || 0);
  });
  const latestBySymbol = new Map();
  for (const row of sortedSignals) {
    const key = String(row?.symbol || '').toUpperCase();
    if (!key || latestBySymbol.has(key)) continue;
    latestBySymbol.set(key, row);
  }
  const signals = Array.from(latestBySymbol.values());

  const outcomeMap = new Map();
  for (const row of (outcomes || [])) {
    const key = `${row.signalId}__${row.checkDay || row.horizon}`;
    outcomeMap.set(key, row);
  }

  const latestScan = (scans || [])[0] || null;
  const scanCounts = new Map();
  for (const s of signals) {
    const key = s.scanId;
    if (!key) continue;
    const bucket = scanCounts.get(key) || { ready: 0, execution: 0, probe: 0, playable: 0, actionable: 0, rejected: 0 };
    const ds = displayStatus(s);
    if (ds === 'READY') { bucket.ready += 1; bucket.execution += 1; bucket.actionable += 1; }
    else if (ds === 'PLAYABLE') { bucket.playable = (bucket.playable || 0) + 1; bucket.actionable += 1; }
    else if (ds === 'PROBE') { bucket.probe += 1; }
    else if (['REJECTED','AVOID'].includes(ds)) bucket.rejected += 1;
    scanCounts.set(key, bucket);
  }
  const latestScanCounts = latestScan ? (scanCounts.get(latestScan.id) || { actionable: Number(latestScan.executionBreakdown?.actionable ?? ((Number(latestScan.executionBreakdown?.ready || 0) + Number(latestScan.executionBreakdown?.playable || 0)))), ready: Number(latestScan.executionBreakdown?.ready ?? latestScan.executionBreakdown?.execution ?? latestScan.executionQualifiedCount ?? latestScan.qualifiedCount ?? 0), execution: Number(latestScan.executionBreakdown?.execution ?? latestScan.executionBreakdown?.ready ?? latestScan.executionQualifiedCount ?? latestScan.qualifiedCount ?? 0), playable: Number(latestScan.executionBreakdown?.playable || 0), probe: Number(latestScan.executionBreakdown?.probe || 0), rejected: Number(latestScan.rejectedCount || 0) }) : null;
  const setupCounts = {};
  for (const s of (signals || [])) {
    const setup = String(setupLabel(s) || 'unknown');
    if (/no setup/i.test(setup)) continue;
    setupCounts[setup] = (setupCounts[setup] || 0) + 1;
  }
  const topSetups = Object.entries(setupCounts).sort((a,b)=>b[1]-a[1]).slice(0,5);

  el.innerHTML = `
  <div class="page-header">
    <div class="page-title">🧠 Signal History</div>
    <div class="page-sub">Persistent Edge Engine · signal history + scan diagnostics + checkpoint outcomes</div>
  </div>

  <div class="card mb-20">
    <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap">
      <div class="card-title">Persistent Summary</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-outline btn-sm" onclick="refreshSignalHistoryPage()">⟳ Refresh</button>
        <button class="btn btn-outline btn-sm" onclick="downloadBackup()">⬇ Export Backup</button>
        <button class="btn btn-outline btn-sm" onclick="triggerImportBackup()">⬆ Import Backup</button>
      </div>
    </div>
    <div class="grid-4 gap-8">
      ${signalStat('Scans', stats.scans || 0)}
      ${signalStat('Signals', stats.signals || 0)}
      ${signalStat('Outcomes', stats.outcomes || 0)}
      ${signalStat('Trades', stats.trades || 0)}
    </div>
    ${latestScan ? `
      <div class="grid-4 gap-8" style="margin-top:10px">
        ${signalStat('Last Scan', formatTimestamp(latestScan.timestamp), true)}
        ${signalStat('BTC Context', latestScan.btcContext || 'unknown', true)}
        ${signalStat('Latest Actionable', latestScanCounts?.actionable ?? 0, true)}
        ${signalStat('Latest Rejected', latestScanCounts?.rejected ?? latestScan.rejectedCount ?? 0, true)}
      </div>
      <div class="text-xs text-muted" style="margin-top:10px">${escapeHtml(latestScan.source || 'Scan gần nhất đã được lưu trong IndexedDB.')}</div>
    ` : '<div class="text-sm text-muted" style="margin-top:10px">Chưa có scan history.</div>'}
  </div>

  <div class="grid-2 mb-20">
    <div class="card">
      <div class="card-title">Top Setup Types</div>
      ${topSetups.length ? topSetups.map(([name,count]) => `
        <div style="display:flex;justify-content:space-between;gap:8px;padding:10px;border-radius:8px;background:var(--bg-hover);margin-bottom:8px">
          <div class="fw-700">${escapeHtml(name)}</div>
          <div class="badge badge-cyan">${count}</div>
        </div>`).join('') : '<div class="text-sm text-muted">Chưa có signal để phân loại setup.</div>'}
    </div>
    <div class="card">
      <div class="card-title">Recent Scan Diagnostics</div>
      ${(scans || []).slice(0,5).map(scan => `
        <div style="padding:10px;border-radius:8px;background:var(--bg-hover);margin-bottom:8px">
          <div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><div class="fw-700 mono">${formatTimestamp(scan.timestamp)}</div><span class="badge ${(Number((scanCounts.get(scan.id)||{}).actionable||0)>0)?'badge-green':'badge-yellow'}">actionable ${(scanCounts.get(scan.id)||{}).actionable||0}</span></div>
          <div class="text-xs text-muted" style="margin-top:6px">candidates ${scan.candidateCount ?? 0} · rejected ${(scanCounts.get(scan.id)||{}).rejected ?? scan.rejectedCount ?? 0} · runtime ${scan.runtimeSeconds || 0}s</div>
        </div>`).join('') || '<div class="text-sm text-muted">Chưa có scan diagnostics.</div>'}
    </div>
  </div>

  <div class="card">
    <div class="card-title">Latest Signals</div>
    ${signals.length ? renderSignalGroups(signals.slice(0,100), outcomeMap) : '<div class="text-sm text-muted">Chưa có signal nào được lưu. Hãy scan thêm.</div>'}
  </div>`;
}

function renderSignalGroups(signals, outcomeMap) {
  const groups = [
    { key: 'READY', label: 'Ready' },
    { key: 'PLAYABLE', label: 'Playable' },
    { key: 'PROBE', label: 'Probe' },
    { key: 'WATCH', label: 'Watch' },
    { key: 'AVOID', label: 'Rejected' },
  ];
  return groups.map(group => {
    const rows = signals.filter(sig => displaySignalStatus(sig) === group.key);
    if (!rows.length) return '';
    return `
      <div style="margin-bottom:14px">
        <div class="text-sm fw-700" style="margin-bottom:8px">${group.label} <span class="badge badge-gray">${rows.length}</span></div>
        <div style="display:grid;gap:10px">${rows.map(sig => renderSignalRow(sig, outcomeMap)).join('')}</div>
      </div>`;
  }).join('');
}

function displaySignalStatus(sig) {
  if (typeof window.getExecutionDisplayStatus === 'function') return window.getExecutionDisplayStatus(sig);
  return String(sig?.displayStatus || sig?.finalAuthorityStatus || sig?.status || 'WATCH').toUpperCase();
}

function renderSignalRow(sig, outcomeMap) {
  const outcomes = ['D1','D3','D7','D14','D30'].map(h => outcomeMap.get(`${sig.id}__${h}`)).filter(Boolean);
  const displayStatus = displaySignalStatus(sig);
  const statusCls = ['REJECTED','AVOID'].includes(displayStatus) ? 'badge-red' : displayStatus === 'READY' ? 'badge-green' : displayStatus === 'PLAYABLE' ? 'badge-cyan' : displayStatus === 'PROBE' ? 'badge-yellow' : 'badge-gray';
  const setupLabel = typeof window.getStructuralSetupLabel === 'function'
    ? window.getStructuralSetupLabel(sig)
    : String(sig.setup || sig.structureTag || 'unknown');
  const triggerLabel = typeof window.getEntryTriggerLabel === 'function'
    ? window.getEntryTriggerLabel(sig)
    : String(sig.entrySignal || sig.entryTiming || 'wait');
  return `
    <div style="padding:12px;border-radius:10px;background:var(--bg-hover);border:1px solid var(--border)">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap">
        <div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span class="font-mono fw-700">${escapeHtml(sig.symbol || 'UNKNOWN')}</span>
            <span class="badge ${statusCls}">${escapeHtml(displayStatus)}</span>
            <span class="badge badge-gray">${escapeHtml(setupLabel || 'unknown')}</span>
            <span class="badge badge-cyan">score ${Math.round(Number(sig.score || 0))}</span>
            <span class="badge badge-gray">${escapeHtml(sig.btcContext || 'unknown')}</span>
          </div>
          <div class="text-xs text-muted" style="margin-top:6px">${formatTimestamp(sig.timestamp)} · trigger ${escapeHtml(triggerLabel)} · entry ${fmtNullablePrice(sig.entry)} · stop ${fmtNullablePrice(sig.stop)} · tp1 ${fmtNullablePrice(sig.tp1)} · tp2 ${fmtNullablePrice(sig.tp2)}</div>
          <div class="text-xs text-muted" style="margin-top:6px">riskAdj ${Math.round(Number(sig.riskAdjustedScore || 0))} · edge ${Math.round(Number(sig.edgeScore || 0))} · RR ${Number(sig.rr || 0).toFixed(2)}x</div>
        </div>
        <div style="min-width:240px;display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;align-items:center">
          <button class="btn btn-outline btn-sm" style="padding:4px 8px; font-size:12px; border-radius:6px" 
                  title="Manual Refetch Outcome" 
                  onclick="manualPerformSingleEval('${sig.id}')">⟳</button>
          ${['D1','D3','D7','D14','D30'].map(h => renderOutcomeBadge(outcomeMap.get(`${sig.id}__${h}`), h)).join('')}
        </div>
      </div>
      ${outcomes.length ? `<div class="grid-4 gap-8" style="margin-top:10px">
        ${signalStat('Best %', `${bestOutcome(outcomes,'pctChange')}%`, true)}
        ${signalStat('Best R', `${bestOutcome(outcomes,'actualR')}R`, true)}
        ${signalStat('TP1 Hits', String(outcomes.filter(x=>x.hitTp1).length), true)}
        ${signalStat('TP2 Hits', String(outcomes.filter(x=>x.hitTp2).length), true)}
      </div>` : '<div class="text-xs text-muted" style="margin-top:10px">Outcome chưa tới checkpoint hoặc chưa fetch được giá checkpoint.</div>'}
    </div>`;
}

function renderOutcomeBadge(row, horizon) {
  if (!row) return `<span class="badge badge-gray">${horizon} pending</span>`;
  const cls = row.verdict === 'winner' ? 'badge-green' : row.verdict === 'flat' ? 'badge-yellow' : 'badge-red';
  const pct = Number(row.pctChange || 0);
  const show = (pct > 0 ? '+' : '') + pct.toFixed(2) + '%';
  return `<span class="badge ${cls}">${horizon} ${show}</span>`;
}

function signalStat(label, value, compact=false) {
  return `<div style="padding:${compact?'10px':'12px'};border-radius:8px;background:var(--bg-hover)"><div class="text-${compact?'xs':'sm'} text-muted">${label}</div><div class="fw-700" style="margin-top:4px">${value}</div></div>`;
}

function bestOutcome(rows, field) {
  if (!rows.length) return 0;
  const vals = rows.map(x => Number(x[field] || 0));
  return Math.max(...vals).toFixed(2);
}

function fmtNullablePrice(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? fmtPrice(n) : '–';
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

async function refreshSignalHistoryPage() {
  return renderSignals();
}

async function manualPerformSingleEval(signalId) {
  if (!window.OUTCOME_EVAL?.triggerSingleEvaluation) {
    alert('Outcome engine not ready');
    return;
  }
  const btn = event.currentTarget;
  const original = btn.innerText;
  btn.innerText = '...';
  btn.disabled = true;

  try {
    const res = await window.OUTCOME_EVAL.triggerSingleEvaluation(signalId);
    if (res.success) {
      console.log(`[UI] Eval success, refreshed ${res.evaluated} checkpoints`);
      renderSignals(); // Refresh UI
    } else {
      alert(`Eval failed: ${res.error}`);
    }
  } catch (err) {
    console.error('[UI] Manual eval error:', err);
  } finally {
    btn.innerText = original;
    btn.disabled = false;
  }
}
