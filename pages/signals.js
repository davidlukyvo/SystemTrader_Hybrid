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

  const [signals, scans, outcomes, trades, stats] = await Promise.all([
    DB.getSignals({ limit: 120 }),
    DB.getScans({ limit: 30 }),
    DB.getOutcomes({}),
    DB.getTrades({ limit: 80 }),
    DB.getStats()
  ]);

  const outcomeMap = new Map();
  for (const row of (outcomes || [])) {
    const key = `${row.signalId}__${row.checkDay || row.horizon}`;
    outcomeMap.set(key, row);
  }

  const latestScan = (scans || [])[0] || null;
  const setupCounts = {};
  for (const s of (signals || [])) {
    const cls = String(s.classification || s.signalType || '').toLowerCase();
    if (cls.startsWith('fetch_fail')) continue; // diagnostics only, do not overstate setup summary
    setupCounts[s.setup || 'unknown'] = (setupCounts[s.setup || 'unknown'] || 0) + 1;
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
        ${signalStat('Latest Qualified', latestScan.qualifiedCount ?? 0, true)}
        ${signalStat('Latest Rejected', latestScan.rejectedCount ?? 0, true)}
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
          <div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><div class="fw-700 mono">${formatTimestamp(scan.timestamp)}</div><span class="badge ${(Number(scan.qualifiedCount||0)>0)?'badge-green':'badge-yellow'}">qualified ${scan.qualifiedCount||0}</span></div>
          <div class="text-xs text-muted" style="margin-top:6px">candidates ${scan.candidateCount ?? 0} · rejected ${scan.rejectedCount ?? 0} · runtime ${scan.runtimeSeconds || 0}s</div>
        </div>`).join('') || '<div class="text-sm text-muted">Chưa có scan diagnostics.</div>'}
    </div>
  </div>

  <div class="card">
    <div class="card-title">Latest Signals</div>
    ${signals.length ? `<div style="display:grid;gap:10px">${signals.slice(0,100).map(sig => renderSignalRow(sig, outcomeMap)).join('')}</div>` : '<div class="text-sm text-muted">Chưa có signal nào được lưu. Hãy scan thêm.</div>'}
  </div>`;
}

function renderSignalRow(sig, outcomeMap) {
  const outcomes = ['D1','D3','D7','D14','D30'].map(h => outcomeMap.get(`${sig.id}__${h}`)).filter(Boolean);
  const statusCls = sig.status === 'AVOID' ? 'badge-red' : ['READY','SCALP_READY'].includes(sig.status) ? 'badge-green' : sig.status === 'EARLY' ? 'badge-yellow' : 'badge-cyan';
  return `
    <div style="padding:12px;border-radius:10px;background:var(--bg-hover);border:1px solid var(--border)">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap">
        <div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span class="font-mono fw-700">${escapeHtml(sig.symbol || 'UNKNOWN')}</span>
            <span class="badge ${statusCls}">${escapeHtml(sig.status || 'UNKNOWN')}</span>
            <span class="badge badge-gray">${escapeHtml(sig.setup || 'unknown')}</span>
            <span class="badge badge-cyan">score ${Math.round(Number(sig.score || 0))}</span>
            <span class="badge badge-gray">${escapeHtml(sig.btcContext || 'unknown')}</span>
          </div>
          <div class="text-xs text-muted" style="margin-top:6px">${formatTimestamp(sig.timestamp)} · entry ${fmtNullablePrice(sig.entry)} · stop ${fmtNullablePrice(sig.stop)} · tp1 ${fmtNullablePrice(sig.tp1)} · tp2 ${fmtNullablePrice(sig.tp2)}</div>
          <div class="text-xs text-muted" style="margin-top:6px">riskAdj ${Math.round(Number(sig.riskAdjustedScore || 0))} · edge ${Math.round(Number(sig.edgeScore || 0))} · RR ${Number(sig.rr || 0).toFixed(2)}x</div>
        </div>
        <div style="min-width:240px;display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">
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
