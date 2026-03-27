/* ── DASHBOARD PAGE v6.1 Adaptive Edge + Learning Feedback ─────────────────── */
function renderDashboard() {
  const quant = computeQuantStats();
  const readyCount = ST.coins.filter(c => c.status === 'READY').length;
  const scalpCount = ST.coins.filter(c => c.status === 'SCALP_READY').length;
  const expansionCount = ST.coins.filter(c => c.executionMode === 'EXPANSION' && ['READY','SCALP_READY','PLAYABLE','PROBE'].includes(c.status)).length;
  const scalpModeCount = ST.coins.filter(c => c.executionMode === 'SCALP' && ['READY','SCALP_READY','PLAYABLE','PROBE'].includes(c.status)).length;
  const playableCount = ST.coins.filter(c => c.status === 'PLAYABLE').length;
  const probeCount = ST.coins.filter(c => c.status === 'PROBE').length;
  const earlyCount = ST.coins.filter(c => c.status === 'EARLY').length;
  const avoidCount = ST.coins.filter(c => c.rejected || c.status === 'AVOID').length;
  const topSetups = getTopSetups(3);
  const lastScanText = formatTimestamp(ST.scanMeta.lastScan);
  const regime = ST.scanMeta.regime || {};
  const cacheMeta = ST.scanMeta.cache || {};
  const insight = ST.scanMeta.insight || {};
  const quantRows = (quant.setupStats || []).slice(0, 5);
  const proEdge = ST.scanMeta.proEdge || null;
  const riskMultiplier = proEdge ? (proEdge.disableTrading ? '0x' : `${proEdge.dynamicRiskMultiplier}x`) : (ST.btc === 'bull' ? '1.0x' : ST.btc === 'sideway' ? '0.8x' : '0.5x');
  const avgExecConfidence = ST.coins.filter(c => ['READY','SCALP_READY','PLAYABLE','PROBE'].includes(c.status)).reduce((a,c)=>a+Number(c.executionConfidence||0),0) / Math.max(1, ST.coins.filter(c => ['READY','SCALP_READY','PLAYABLE','PROBE'].includes(c.status)).length);
  const portfolio = ST.scanMeta.portfolio || {};
  const tradePanel = (scalpModeCount || expansionCount || readyCount || playableCount || probeCount) ? `SCALP ${scalpModeCount} · EXP ${expansionCount} · PLAYABLE ${playableCount} · PROBE ${probeCount} · avg conf ${Math.round(avgExecConfidence*100)}%` : 'Ẩn trong WATCH / NO_TRADE';

  $('page-dashboard').innerHTML = `
  <div class="page-header">
    <div class="page-title">⚡ Dashboard</div>
    <div class="page-sub">REAL TRADER v7.3 dashboard · smart execution</div>
  </div>

  <div class="btc-warning show" style="display:${(ST.btc==='bear' || regime.noTrade)?'block':'none'}">
    ${regime.noTrade ? `🛑 NO-TRADE MODE — ${regime.reason || 'Không có setup đủ chuẩn.'}` : '⚠️ BTC đang breakdown — giảm size hoặc đứng ngoài.'}
  </div>

  <div class="card mb-20">
    <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap">
      <div class="card-title">BTC Market Context</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-outline btn-sm" onclick="downloadBackup()">⬇ Export Backup</button>
        <button class="btn btn-outline btn-sm" onclick="triggerImportBackup()">⬆ Import Backup</button>
      </div>
    </div>
    <div class="flex gap-8 mb-16">
      <button class="btn ${ST.btc==='bull'?'btn-success':'btn-outline'}" onclick="setContext('bull')">📈 Bullish</button>
      <button class="btn ${ST.btc==='sideway'?'btn-outline':''}" style="${ST.btc==='sideway'?'border-color:var(--yellow);color:var(--yellow);background:rgba(245,158,11,.1)':''}" onclick="setContext('sideway')">◈ Sideway</button>
      <button class="btn ${ST.btc==='bear'?'btn-danger':'btn-outline'}" onclick="setContext('bear')">📉 Breakdown</button>
    </div>
    <div class="grid-4 gap-8">
      <div style="padding:12px;border-radius:8px;background:var(--bg-hover)"><div class="text-sm text-muted">Last Scan</div><div class="fw-700" style="margin-top:4px">${lastScanText}</div></div>
      <div style="padding:12px;border-radius:8px;background:var(--bg-hover)"><div class="text-sm text-muted">Source</div><div class="fw-700" style="margin-top:4px">${ST.scanMeta.source || 'Manual / Seed Data'}</div></div>
      <div style="padding:12px;border-radius:8px;background:var(--bg-hover)"><div class="text-sm text-muted">Trade Panel</div><div class="fw-700" style="margin-top:4px">${tradePanel}</div></div>
      <div style="padding:12px;border-radius:8px;background:var(--bg-hover)"><div class="text-sm text-muted">Risk Multiplier</div><div class="fw-700" style="margin-top:4px">${riskMultiplier}</div></div>
      <div style="padding:12px;border-radius:8px;background:var(--bg-hover)"><div class="text-sm text-muted">Scan Runtime</div><div class="fw-700" style="margin-top:4px">${cacheMeta.runtimeSeconds ? cacheMeta.runtimeSeconds + 's' : '–'}</div></div>
      <div style="padding:12px;border-radius:8px;background:var(--bg-hover)"><div class="text-sm text-muted">Allocation Hint</div><div class="fw-700" style="margin-top:4px">${cacheMeta.allocationHint || '0%'}</div></div>
      <div style="padding:12px;border-radius:8px;background:var(--bg-hover)"><div class="text-sm text-muted">Scalp / Expansion / Smart</div><div class="fw-700" style="margin-top:4px">${scalpModeCount} / ${expansionCount} / ${playableCount + probeCount}</div></div>
      <div style="padding:12px;border-radius:8px;background:var(--bg-hover)"><div class="text-sm text-muted">Execution Confidence</div><div class="fw-700" style="margin-top:4px">${Math.round(avgExecConfidence*100)}%</div></div>
      <div style="padding:12px;border-radius:8px;background:var(--bg-hover)"><div class="text-sm text-muted">Portfolio Risk</div><div class="fw-700" style="margin-top:4px">${cacheMeta.portfolioRiskUsed || '0.00% / 0.00%'}</div></div>
      <div style="padding:12px;border-radius:8px;background:var(--bg-hover)"><div class="text-sm text-muted">Portfolio Active</div><div class="fw-700" style="margin-top:4px">${cacheMeta.portfolioActive || 0}</div></div>
    </div>
  </div>

  <div class="grid-4 mb-20">
    <div class="stat-card stat-green"><div class="stat-label">READY</div><div class="stat-value">${readyCount}</div><div class="stat-note">Full-quality trade state</div></div>
    <div class="stat-card stat-purple"><div class="stat-label">SCALP_READY</div><div class="stat-value">${scalpCount}</div><div class="stat-note">15m execution state</div></div>
    <div class="stat-card stat-cyan"><div class="stat-label">PLAYABLE</div><div class="stat-value">${playableCount}</div><div class="stat-note">Reduced-size execution</div></div>
    <div class="stat-card stat-yellow"><div class="stat-label">PROBE</div><div class="stat-value">${probeCount}</div><div class="stat-note">Starter probe</div></div>
  </div>
  <div class="grid-2 mb-20">
    <div class="stat-card stat-cyan"><div class="stat-label">EARLY</div><div class="stat-value">${earlyCount}</div><div class="stat-note">Watch only</div></div>
    <div class="stat-card stat-yellow"><div class="stat-label">AVOID</div><div class="stat-value">${avoidCount}</div><div class="stat-note">Rejected / avoid</div></div>
  </div>

  ${proEdge ? `
  <div class="card mb-20" style="border-color:${proEdge.disableTrading ? 'rgba(239,68,68,.28)' : proEdge.gateMode==='REDUCED' ? 'rgba(245,158,11,.28)' : 'rgba(16,185,129,.28)'}">
    <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap">
      <div class="card-title">🧠 PRO EDGE v8.2</div>
      <span class="badge ${proEdge.disableTrading ? 'badge-red' : proEdge.gateMode==='REDUCED' ? 'badge-yellow' : 'badge-green'}">${proEdge.gateMode}</span>
    </div>
    <div class="grid-4 gap-8">
      <div style="padding:10px;border-radius:8px;background:var(--bg-hover)"><div class="text-xs text-muted">Best Setup</div><div class="fw-700">${proEdge.bestSetup || 'unknown'}</div><div class="text-xs text-muted" style="margin-top:4px">WR ${proEdge.bestSetupWinRate || 0}% · Exp ${proEdge.bestSetupExpectancyR || 0}R</div></div>
      <div style="padding:10px;border-radius:8px;background:var(--bg-hover)"><div class="text-xs text-muted">Dynamic Risk</div><div class="fw-700">${proEdge.disableTrading ? '0x' : `${proEdge.dynamicRiskMultiplier}x`}</div><div class="text-xs text-muted" style="margin-top:4px">Alloc ${Math.round(Number(proEdge.allocationHintPct || 0) * 100)}%</div></div>
      <div style="padding:10px;border-radius:8px;background:var(--bg-hover)"><div class="text-xs text-muted">Suggested</div><div class="fw-700">${proEdge.suggestedSymbol || 'No trade'}</div><div class="text-xs text-muted" style="margin-top:4px">${proEdge.suggestedSetup || proEdge.gateReason || 'Wait'}</div></div>
      <div style="padding:10px;border-radius:8px;background:var(--bg-hover)"><div class="text-xs text-muted">Recent Outcomes</div><div class="fw-700">${proEdge.outcomeWinRate || 0}% / ${proEdge.outcomeAvgR || 0}R</div><div class="text-xs text-muted" style="margin-top:4px">samples ${proEdge.outcomeSamples || 0} · ${proEdge.outcomeVerdict || 'bootstrap'}</div></div>
    </div>
    <div style="margin-top:10px;padding:10px;border-radius:8px;background:var(--bg-hover)">
      <div class="text-xs text-muted">Trade Gate Reason</div>
      <div class="fw-700" style="margin-top:4px">${proEdge.gateReason || 'No note'}</div>
      <div class="text-xs text-muted" style="margin-top:6px">Score floor ${proEdge.scoreFloor || 'n/a'} · matching tradables ${proEdge.matchingTradables || 0}</div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
      <button class="btn btn-sm btn-outline" onclick="navigate('plan')" ${proEdge.suggestedCoinId ? '' : 'disabled'}>📋 Open Trade Plan</button>
      <button class="btn btn-sm btn-outline" onclick="navigate('analytics')">📊 Review Edge</button>
      <button class="btn btn-sm btn-outline" onclick="navigate('signals')">🧠 Signal History</button>
    </div>
  </div>
  ` : ''}

  <div class="grid-3 mb-20">
    <div class="card">
      <div class="card-title">🧭 Market Insight</div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><div class="text-sm text-muted">Market Health</div><span class="badge ${insight.marketHealth === 'healthy' ? 'badge-green' : insight.marketHealth === 'thin' ? 'badge-yellow' : 'badge-red'}">${insight.marketHealth || 'n/a'}</span></div>
      <div class="fw-700" style="font-size:28px;color:var(--accent)">${Number.isFinite(insight.marketHealthScore) ? insight.marketHealthScore : 0}/10</div>
      <div class="text-xs text-muted" style="margin-top:8px">${insight.qualifiedCount || 0} qualified / ${(insight.analyzedCount || 0)} analyzed</div>
      <div class="text-xs text-muted" style="margin-top:8px">Quant ${quant.learningMode || 'bootstrap'} · quality ${quant.quality} · PF ${quant.profitFactor} · Exp ${quant.expectancyR}R</div>
    </div>
    <div class="card">
      <div class="card-title">📈 Adaptive Edge Snapshot</div>
      <div class="grid-2 gap-8">
        <div style="padding:10px;border-radius:8px;background:var(--bg-hover)"><div class="text-xs text-muted">Expectancy</div><div class="fw-700">${quant.expectancyR}R</div></div>
        <div style="padding:10px;border-radius:8px;background:var(--bg-hover)"><div class="text-xs text-muted">Profit Factor</div><div class="fw-700">${quant.profitFactor}</div></div>
        <div style="padding:10px;border-radius:8px;background:var(--bg-hover)"><div class="text-xs text-muted">Avg R</div><div class="fw-700">${quant.avgR}R</div></div>
        <div style="padding:10px;border-radius:8px;background:var(--bg-hover)"><div class="text-xs text-muted">Confidence / Learn</div><div class="fw-700">${Math.round((quant.confidence || 0) * 100)}% · ${quant.learningMode || 'bootstrap'}</div><div class="text-xs text-muted" style="margin-top:4px">Edge ${quant.edgeScore || 0}</div></div>
      </div>
    </div>
    <div class="card">
      <div class="card-title">🎯 Near Miss</div>
      ${(insight.nearMisses && insight.nearMisses.length) ? insight.nearMisses.slice(0,3).map(c => `<div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:8px"><div><div class="mono fw-700">${c.symbol}</div><div class="text-xs text-muted">${c.reason}</div></div><span class="badge badge-yellow">${c.score}</span></div>`).join('') : '<div class="text-sm text-muted">Hiện chưa có near miss nào đáng chú ý.</div>'}
    </div>
  </div>

  <div class="grid-2 mb-20">
    <div class="card">
      <div class="card-title">📅 Daily Workflow</div>
      ${[
        ['🧠 Buổi 1', 'REAL TRADER Scan', 'Live Binance universe → strict score + regime engine'],
        ['🎯 Buổi 2', 'Review only tradeable Top 3', 'Nếu Top 3 rỗng thì đứng ngoài, không ép trade'],
        ['📊 Buổi 3', 'Trade Plan', 'SCALP dùng mean-reversion 15m; EXPANSION dùng breakout/LPS; SMART EXECUTION tự adapt theo market regime; entry timing ưu tiên confirm > active > probe'],
        ['🕒 Buổi 4', 'Entry Timing', 'Probe > Active > Confirm · hỗ trợ scale-in khi active/confirm đủ edge'],
        ['🧭 Buổi 5', 'Chart-aware check', 'Chart-aware + hard gate: RR thấp hoặc combo yếu bị hạ về EARLY; portfolio không nhận setup chưa vượt gate'],
        ['📓 Buổi 6', 'Journal', 'Log kết quả để quant layer học tách READY vs SCALP có edge'],
      ].map(([step, title, desc]) => `<div style="display:flex;gap:12px;padding:12px;border-radius:8px;background:var(--bg-hover);margin-bottom:8px"><div style="font-size:11px;font-weight:800;color:var(--accent);min-width:60px;padding-top:1px">${step}</div><div><div style="font-size:13px;font-weight:600">${title}</div><div class="text-sm text-muted mt-8" style="margin-top:3px">${desc}</div></div></div>`).join('')}
    </div>

    <div class="card">
      <div class="card-title">📐 Adaptive Edge Table</div>
      ${quantRows.length ? quantRows.map(r => `<div style="display:flex;justify-content:space-between;gap:10px;align-items:center;padding:10px;border-radius:8px;background:var(--bg-hover);margin-bottom:8px"><div><div class="fw-700">${r.setup}</div><div class="text-xs text-muted">WR ${r.wr}% · Exp ${r.expectancyR}R · PF ${r.profitFactor}</div></div><div style="text-align:right"><span class="badge ${r.band.cls}">${r.band.label}</span><div class="font-mono fw-700" style="margin-top:4px">x${r.edgeMultiplier}</div></div></div>`).join('') : '<div class="text-sm text-muted">Journal còn ít nên aggressive engine đang blend baseline + journal.</div>'}
    </div>
  </div>

  <div class="card">
    <div class="card-title">🏆 Top Hard-Gate Setups + Portfolio</div>
    ${topSetups.map(c => `
      <div style="padding:12px;border-radius:10px;background:var(--bg-hover);border:1px solid var(--border);margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:start;gap:12px">
          <div>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span class="font-mono fw-700">${c.symbol}</span><span class="badge ${c.quantEdge?.band?.cls || 'badge-gray'}">${c.quantLabel || 'No edge'}</span><span class="badge badge-gray">${c.entryTiming || 'n/a'}</span><span class="badge badge-cyan">conf ${Math.round((c.executionConfidence || 0)*100)}%</span><span class="badge ${c.chartEntryQuality==='entry_good'?'badge-green':c.chartEntryQuality==='entry_late'?'badge-red':'badge-yellow'}">${c.chartEntryQuality || 'neutral'}</span></div>
            <div class="text-sm text-muted" style="margin-top:4px">${c.setup || c.structureTag || 'No setup'} · Raw ${Math.round(c.rawScore || c.score || 0)} · Final ${Math.round(c.finalScore || c.score || 0)} · RiskAdj ${Math.round(c.riskAdjustedScore || c.score || 0)} · Edge ${Math.round(c.edgeScore || 0)}</div>
          </div>
          <div class="font-mono fw-700" style="color:var(--accent)">${Math.round(c.score || 0)}</div>
        </div>
        <div class="grid-4 gap-8" style="margin-top:10px">
          <div style="padding:8px;border-radius:8px;background:rgba(0,229,255,.06)"><div class="text-xs text-muted">Entry</div><div class="font-mono fw-700">${fmtPrice(c.entry || c.price)}</div></div>
          <div style="padding:8px;border-radius:8px;background:rgba(239,68,68,.06)"><div class="text-xs text-muted">Stop</div><div class="font-mono fw-700 text-red">${fmtPrice(c.stop)}</div></div>
          <div style="padding:8px;border-radius:8px;background:rgba(16,185,129,.06)"><div class="text-xs text-muted">TP1 / RR</div><div class="font-mono fw-700 text-green">${fmtPrice(c.tp1)} / ${(c.rr || 0).toFixed(2)}x</div></div>
          <div style="padding:8px;border-radius:8px;background:rgba(124,58,237,.08)"><div class="text-xs text-muted">Risk / Allocation</div><div class="font-mono fw-700">${(c.riskPct || 0.5).toFixed(2)}% / ${(c.allocationPct || 0.5).toFixed(2)}%</div></div>
        </div>
      </div>`).join('') || '<div class="text-muted text-sm">WATCH / NO_TRADE: smart execution chỉ unlock khi regime + RR + confidence đủ cân bằng.</div>'}
  </div>

  <div class="card mt-20" id="dashDataMgmt" style="border-color:rgba(0,229,255,.15)">
    <div class="card-title">🛢 Data Management — Persistent Edge Engine v8</div>
    <div id="dashDataStats" class="text-sm text-muted">Loading IndexedDB stats...</div>
  </div>`;

  // Async: load DB stats
  loadDashboardDBStats();
}

async function loadDashboardDBStats() {
  const el = $('dashDataStats');
  if (!el || !window.DB) return;
  try {
    const stats = await DB.getStats();
    const lastCleanup = stats.lastCleanup?.timestamp ? new Date(stats.lastCleanup.timestamp).toLocaleString('vi-VN') : 'Chưa có';
    el.innerHTML = `
      <div class="grid-4 gap-8" style="margin-bottom:12px">
        <div style="padding:10px;border-radius:8px;background:var(--bg-hover)"><div class="text-xs text-muted">Scans</div><div class="fw-700">${stats.scans || 0}</div><div class="text-xs text-muted">180d retention</div></div>
        <div style="padding:10px;border-radius:8px;background:var(--bg-hover)"><div class="text-xs text-muted">Signals</div><div class="fw-700">${stats.signals || 0}</div><div class="text-xs text-muted">365d retention</div></div>
        <div style="padding:10px;border-radius:8px;background:var(--bg-hover)"><div class="text-xs text-muted">Trades</div><div class="fw-700">${stats.trades || 0}</div><div class="text-xs text-muted">Permanent</div></div>
        <div style="padding:10px;border-radius:8px;background:var(--bg-hover)"><div class="text-xs text-muted">Outcomes</div><div class="fw-700">${stats.outcomes || 0}</div><div class="text-xs text-muted">365d retention</div></div>
      </div>
      <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
        <span class="text-xs text-muted">Storage: IndexedDB · Version: ${ST_VERSION} · Last cleanup: ${lastCleanup}</span>
        <button class="btn btn-sm btn-outline" onclick="downloadBackup()">⬇ Export v8</button>
        <button class="btn btn-sm btn-outline" onclick="triggerImportBackup()">⬆ Import</button>
        <button class="btn btn-sm btn-outline" onclick="navigate('signals')">🧠 Signals</button>
        <button class="btn btn-sm btn-outline" onclick="navigate('analytics')">📊 Analytics</button>
        <button class="btn btn-sm btn-outline" onclick="navigate('scan-history')">🕐 Scans</button>
      </div>`;
  } catch {
    el.textContent = 'IndexedDB stats unavailable';
  }
}

function setContext(state) {
  ST.setBtc(state);
  if (currentPage && PAGES[currentPage]) PAGES[currentPage].render();
}
