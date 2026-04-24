/* ══════════════════════════════════════════════════════════
   ANALYTICS PAGE — Edge Performance Analysis
   4 views: Setup · Regime · Score Bucket · Holding Period
   ══════════════════════════════════════════════════════════ */

var analyticsView = 'setup';
var analyticsData = null;
var analyticsLoading = false;
var analyticsPopulation = 'execution';

async function loadAnalyticsData() {
  if (!window.OUTCOME_EVAL) return;
  analyticsLoading = true;
  try {
    const category = await OUTCOME_EVAL.getCategoryPerformance(analyticsPopulation);
    const setup = await OUTCOME_EVAL.getSetupPerformance(analyticsPopulation);
    const regime = await OUTCOME_EVAL.getRegimePerformance(analyticsPopulation);
    const score = await OUTCOME_EVAL.getScoreBucketPerformance(analyticsPopulation);
    const holding = await OUTCOME_EVAL.getHoldingPeriodPerformance(analyticsPopulation);
    const truthSummary = await OUTCOME_EVAL.getAnalyticsTruthSummary();
    const stats = await DB.getStats();
    analyticsData = { category: category, setup: setup, regime: regime, score: score, holding: holding, truthSummary: truthSummary, stats: stats, population: analyticsPopulation };
  } catch (err) {
    console.error('[ANALYTICS] Load error:', err);
  }
  analyticsLoading = false;
}

function analyticsPopulationLabel() {
  return window.ANALYTICS_ENGINE?.POPULATION_LABELS?.[analyticsPopulation] || 'Execution-approved candidates';
}

function analyticsScoreFieldLabel() {
  return window.OUTCOME_EVAL?.getAnalyticsScoreFieldLabel ? window.OUTCOME_EVAL.getAnalyticsScoreFieldLabel() : 'riskAdjustedScore';
}

function renderTruthBasisCard() {
  var truth = (analyticsData && analyticsData.truthSummary) || null;
  if (!truth) return '';
  return '<div class="card mb-20">' +
    '<div class="card-title">Truth Basis</div>' +
    '<div class="text-sm text-muted" style="margin-bottom:12px">Performance tables currently use <strong>' + analyticsPopulationLabel() + '</strong>. Portfolio-bound carryovers are excluded from expectancy and feedback views.</div>' +
    '<div class="grid-4 gap-8">' +
      '<div style="padding:12px;border-radius:8px;background:var(--bg-hover)"><div class="text-xs text-muted">Technical Signals</div><div class="fw-700">' + (truth.technicalSignals || 0) + '</div><div class="text-xs text-muted">Outcomes ' + (truth.technicalOutcomes || 0) + '</div></div>' +
      '<div style="padding:12px;border-radius:8px;background:var(--bg-hover)"><div class="text-xs text-muted">Execution Signals</div><div class="fw-700">' + (truth.executionSignals || 0) + '</div><div class="text-xs text-muted">Outcomes ' + (truth.executionOutcomes || 0) + '</div></div>' +
      '<div style="padding:12px;border-radius:8px;background:var(--bg-hover)"><div class="text-xs text-muted">Alert Signals</div><div class="fw-700">' + (truth.alertSignals || 0) + '</div><div class="text-xs text-muted">Outcomes ' + (truth.alertOutcomes || 0) + '</div></div>' +
      '<div style="padding:12px;border-radius:8px;background:var(--bg-hover)"><div class="text-xs text-muted">Rejected Signals</div><div class="fw-700">' + (truth.rejectedSignals || 0) + '</div><div class="text-xs text-muted">Outcomes ' + (truth.rejectedOutcomes || 0) + '</div></div>' +
    '</div>' +
    '<div class="text-xs text-muted" style="margin-top:10px">Score bucket basis: <strong>' + analyticsScoreFieldLabel() + '</strong> (risk-adjusted quality), not raw scanner score.</div>' +
    '<div class="text-xs text-muted" style="margin-top:6px">Portfolio-bound outcomes excluded: ' + (truth.portfolioBoundOutcomes || 0) + '</div>' +
  '</div>';
}

function renderAnalyticsTable(headers, rows) {
  if (!rows || !rows.length) {
    return '<div class="text-sm text-muted" style="padding:24px;text-align:center">Chua co du lieu outcome. Sau vai ngay scan, outcome evaluator se tu dong danh gia signal performance tai D1/D3/D7/D14/D30.</div>';
  }
  return '<div style="overflow-x:auto"><table class="j-table"><thead><tr>' + headers.map(function(h) { return '<th>' + h + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div>';
}

function renderCategoryView() {
  var data = (analyticsData && analyticsData.category) || [];
  var headers = ['Category', 'Total', 'Win', 'Loss', 'Win Rate', 'Avg %', 'Avg R'];
  var rows = data.map(function(r) {
    var wrColor = r.winRate >= 55 ? 'var(--green)' : r.winRate >= 45 ? 'var(--yellow)' : 'var(--red)';
    var pctColor = r.avgPctChange >= 0 ? 'var(--green)' : 'var(--red)';
    return '<tr><td><span class="badge badge-purple">' + (r.category || 'OTHER') + '</span></td><td class="mono">' + r.total + '</td><td class="mono text-green">' + r.winners + '</td><td class="mono text-red">' + r.losers + '</td><td class="mono fw-700" style="color:' + wrColor + '">' + r.winRate + '%</td><td class="mono" style="color:' + pctColor + '">' + (r.avgPctChange > 0 ? '+' : '') + r.avgPctChange + '%</td><td class="mono">' + r.avgR + 'R</td></tr>';
  });
  
  var bestCategory = data.length ? data[0] : null;
  var summaryHtml = bestCategory ? (
    '<div class="narrative-edge-summary mb-16" style="padding:16px;background:rgba(187,134,252,0.1);border:1px solid rgba(187,134,252,0.3);border-radius:12px">' +
      '<div style="display:flex;align-items:center;gap:12px">' +
        '<div style="font-size:24px">💎</div>' +
        '<div>' +
          '<div class="fw-700 text-purple">Narrative Edge Detected: ' + bestCategory.category + '</div>' +
          '<div class="text-xs text-muted">Win Rate: ' + bestCategory.winRate + '% · Avg R: ' + bestCategory.avgR + 'R · Samples: ' + bestCategory.total + '</div>' +
        '</div>' +
      '</div>' +
    '</div>'
  ) : '';

  return '<div class="card mb-20"><div class="card-title">Category Performance</div><div class="text-sm text-muted" style="margin-bottom:12px">Tracking win/loss ratio theo nhom Narrative (AI, MEME, RWA, L1...) using ' + analyticsPopulationLabel() + ' only.</div>' + summaryHtml + renderAnalyticsTable(headers, rows) + '</div>';
}

function renderSetupView() {
  var data = (analyticsData && analyticsData.setup) || [];
  var headers = ['Setup', 'Total', 'Win', 'Loss', 'Win Rate', 'Avg %', 'Avg R'];
  var rows = data.map(function(r) {
    var wrColor = r.winRate >= 55 ? 'var(--green)' : r.winRate >= 45 ? 'var(--yellow)' : 'var(--red)';
    var pctColor = r.avgPctChange >= 0 ? 'var(--green)' : 'var(--red)';
    return '<tr><td class="fw-700">' + r.setup + '</td><td class="mono">' + r.total + '</td><td class="mono text-green">' + r.winners + '</td><td class="mono text-red">' + r.losers + '</td><td class="mono fw-700" style="color:' + wrColor + '">' + r.winRate + '%</td><td class="mono" style="color:' + pctColor + '">' + (r.avgPctChange > 0 ? '+' : '') + r.avgPctChange + '%</td><td class="mono">' + r.avgR + 'R</td></tr>';
  });
  return '<div class="card mb-20"><div class="card-title">Setup Performance</div><div class="text-sm text-muted" style="margin-bottom:12px">Win rate va avg return theo tung loai setup using ' + analyticsPopulationLabel() + '. Data tu checkpoint snapshot evaluation.</div>' + renderAnalyticsTable(headers, rows) + '</div>';
}

function renderRegimeView() {
  var data = (analyticsData && analyticsData.regime) || [];
  var headers = ['BTC Regime', 'Total', 'Win', 'Loss', 'Win Rate', 'Avg %'];
  var regimeEmoji = { bull: '📈', sideway: '◈', bear: '📉' };
  var rows = data.map(function(r) {
    var wrColor = r.winRate >= 55 ? 'var(--green)' : r.winRate >= 45 ? 'var(--yellow)' : 'var(--red)';
    var pctColor = r.avgPctChange >= 0 ? 'var(--green)' : 'var(--red)';
    return '<tr><td class="fw-700">' + (regimeEmoji[r.regime] || '?') + ' ' + r.regime + '</td><td class="mono">' + r.total + '</td><td class="mono text-green">' + r.winners + '</td><td class="mono text-red">' + r.losers + '</td><td class="mono fw-700" style="color:' + wrColor + '">' + r.winRate + '%</td><td class="mono" style="color:' + pctColor + '">' + (r.avgPctChange > 0 ? '+' : '') + r.avgPctChange + '%</td></tr>';
  });
  return '<div class="card mb-20"><div class="card-title">Regime Performance</div><div class="text-sm text-muted" style="margin-bottom:12px">Signal performance phan theo BTC context luc scan using ' + analyticsPopulationLabel() + '.</div>' + renderAnalyticsTable(headers, rows) + '</div>';
}

function renderScoreView() {
  var data = (analyticsData && analyticsData.score) || [];
  var headers = ['Score Bucket', 'Total', 'Win', 'Loss', 'Win Rate', 'Avg %'];
  var rows = data.map(function(r) {
    var wrColor = r.winRate >= 55 ? 'var(--green)' : r.winRate >= 45 ? 'var(--yellow)' : 'var(--red)';
    var pctColor = r.avgPctChange >= 0 ? 'var(--green)' : 'var(--red)';
    return '<tr><td class="fw-700">' + r.bucket + '</td><td class="mono">' + r.total + '</td><td class="mono text-green">' + r.winners + '</td><td class="mono text-red">' + r.losers + '</td><td class="mono fw-700" style="color:' + wrColor + '">' + r.winRate + '%</td><td class="mono" style="color:' + pctColor + '">' + (r.avgPctChange > 0 ? '+' : '') + r.avgPctChange + '%</td></tr>';
  });
  return '<div class="card mb-20"><div class="card-title">Score Bucket Performance</div><div class="text-sm text-muted" style="margin-bottom:12px">Buckets are evaluated on <strong>' + analyticsScoreFieldLabel() + '</strong> using ' + analyticsPopulationLabel() + ' only. Raw scanner score remains a gate/ranking input, not the analytics bucket basis.</div>' + renderAnalyticsTable(headers, rows) + '</div>';
}

function renderHoldingView() {
  var data = (analyticsData && analyticsData.holding) || [];
  var headers = ['Period', 'Total', 'Win', 'Loss', 'Win Rate', 'Avg %', 'Avg R'];
  var rows = data.map(function(r) {
    var wrColor = r.winRate >= 55 ? 'var(--green)' : r.winRate >= 45 ? 'var(--yellow)' : 'var(--red)';
    var pctColor = r.avgPctChange >= 0 ? 'var(--green)' : 'var(--red)';
    return '<tr><td class="fw-700">' + r.period + '</td><td class="mono">' + r.total + '</td><td class="mono text-green">' + r.winners + '</td><td class="mono text-red">' + r.losers + '</td><td class="mono fw-700" style="color:' + wrColor + '">' + r.winRate + '%</td><td class="mono" style="color:' + pctColor + '">' + (r.avgPctChange > 0 ? '+' : '') + r.avgPctChange + '%</td><td class="mono">' + r.avgR + 'R</td></tr>';
  });
  return '<div class="card mb-20"><div class="card-title">Holding Period Performance</div><div class="text-sm text-muted" style="margin-bottom:12px">D1 vs D3 vs D7 vs D14 vs D30 — khoang thoi gian nao toi uu cho edge cua ban? Based on ' + analyticsPopulationLabel() + ' only.</div>' + renderAnalyticsTable(headers, rows) + '</div>';
}

function renderHeatmapView() {
  if (!window.ANALYTICS_ENGINE) return '<div class="text-sm text-muted">Feedback Engine not available.</div>';
  
  // Calculate live stats (don't force, rely on cache if recent)
  const stats = window.ANALYTICS_ENGINE.getCachedStats('execution');
  if (!stats || !stats.categories || !stats.setups) {
    window.ANALYTICS_ENGINE.computeRollingStats(false, 'execution').then(() => {
        if (analyticsView === 'heatmap') renderAnalytics();
    });
    return '<div class="text-center text-muted p-20">⏳ Computing 14d Rolling Analytics...</div>';
  }

  const catHeaders = ['Category', '14d Trades', 'Win Rate', 'Avg R', 'Status'];
  const setupHeaders = ['Setup', '14d Trades', 'Win Rate', 'Avg R', 'Status'];

  const th = window.FEEDBACK_ENGINE?.THRESHOLDS || { vetoWinRate: 35, downgradeWinRate: 45, minSampleSize: 5 };

  const buildRows = (dataObj, type) => {
    return Object.entries(dataObj)
      .sort((a,b) => b[1].total - a[1].total) // sort by most active
      .map(([name, r]) => {
        const wr = r.winRate;
        const total = r.total;
        let wrColor = wr >= 50 ? 'var(--green)' : wr >= th.downgradeWinRate ? 'var(--yellow)' : 'var(--red)';
        
        let status = window.FEEDBACK_ENGINE?.getVetoStatus(name, type) || 'NORMAL';
        let statusCls = status === 'NORMAL' ? 'badge-gray' : status.includes('UNFROZEN') ? 'badge-yellow' : status === 'DOWNGRADED' ? 'badge-purple' : 'badge-red';

        if (total < th.minSampleSize) {
           status = 'GATHERING';
           statusCls = 'badge-gray';
           wrColor = 'var(--text)'; // insufficient sample size
        }

        return `<tr><td class="fw-700">${name}</td><td class="mono">${total}</td><td class="mono fw-700" style="color:${wrColor}">${wr}%</td><td class="mono">${r.avgR}R</td><td><span class="badge ${statusCls}">${status}</span></td></tr>`;
    });
  };

  const catRows = buildRows(stats.categories, 'category');
  const setupRows = buildRows(stats.setups, 'setup');

  const html = 
    `<div class="card mb-20"><div class="card-title">Category Feedback Loop (14d Rolling)</div>
     <div class="text-sm text-muted mb-12">Win rate tracking from execution-approved outcomes only. $<span class="text-red">${th.vetoWinRate}%</span> triggers Auto-Veto, $<span class="text-yellow">${th.downgradeWinRate}%</span> triggers PROBE downgrade. (Min ${th.minSampleSize} trades).</div>` +
     renderAnalyticsTable(catHeaders, catRows) +
    `</div>
    <div class="card mb-20"><div class="card-title">Setup Feedback Loop (14d Rolling)</div>`+
     renderAnalyticsTable(setupHeaders, setupRows) +
    `</div>`;

  return html;
}

function renderAuditView() {
  if (!window.ANALYTICS_ENGINE) return '<div class="text-sm text-muted">Analytics Engine not available.</div>';
  const stats = window.ANALYTICS_ENGINE.getCachedStats('execution');
  if (!stats || !stats.updatedAt) {
    window.ANALYTICS_ENGINE.computeRollingStats(false, 'execution').then(() => {
      if (analyticsView === 'audit') renderAnalytics();
    });
    return '<div class="text-center text-muted p-20">⏳ Computing Audit Data...</div>';
  }

  const cfg = window.ST?.config || { expectancy: {}, execution: {} };

  const renderConfigTag = (val, label) => `<div class="text-xs" style="background:rgba(255,255,255,0.05);padding:4px 8px;border-radius:4px;border:1px solid rgba(255,255,255,0.1)"><span class="text-muted">${label}:</span> <span class="fw-700 text-cyan">${val}</span></div>`;

  const configHtml = `
    <div class="card mb-20" style="border-left: 4px solid var(--cyan)">
      <div class="card-title">⚙️ Active Hardening Config</div>
      <div class="text-sm text-muted mb-12">Expectancy audit below is computed from execution-approved, non-portfolio-bound outcomes only.</div>
      <div style="display:flex; gap:12px; flex-wrap:wrap">
        ${renderConfigTag(cfg.execution?.READY_SCORE, 'READY Score')}
        ${renderConfigTag(cfg.execution?.READY_CONF, 'READY Conf')}
        ${renderConfigTag(cfg.execution?.PROBE_CONF, 'PROBE Conf')}
        ${renderConfigTag(cfg.expectancy?.minCautionSamples, 'Min Sym Samples')}
        ${renderConfigTag(cfg.expectancy?.minHardPenaltySamples, 'Min Setup Samples')}
        ${renderConfigTag(cfg.expectancy?.penaltyMultiplier, 'Penalty Mult')}
      </div>
    </div>`;

  const buildTable = (title, headers, dataObj, filterMin = 0) => {
    const rows = Object.entries(dataObj)
      .filter(([_, r]) => r.total >= filterMin)
      .sort((a, b) => b[1].avgR - a[1].avgR)
      .map(([key, r]) => {
        const wrColor = r.winRate >= 50 ? 'var(--green)' : r.winRate >= 35 ? 'var(--yellow)' : 'var(--red)';
        const rColor = r.avgR > 0 ? 'var(--green)' : r.avgR < 0 ? 'var(--red)' : 'var(--text)';
        const label = isNaN(key) ? key : `${key}:00`;
        return `<tr><td class="fw-700">${label}</td><td class="mono">${r.total}</td><td class="mono" style="color:${wrColor}">${r.winRate}%</td><td class="mono fw-700" style="color:${rColor}">${r.avgR}R</td></tr>`;
      });
    return `
      <div class="card mb-20">
        <div class="card-title">${title}</div>
        ${renderAnalyticsTable(headers, rows)}
      </div>`;
  };

  const commonHeaders = ['Segment', 'Samples', 'Win Rate', 'Avg R'];
  
  return configHtml + `
    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 20px;">
      ${buildTable('Symbol Expectancy (Live Audit)', commonHeaders, stats.symbols || {}, cfg.expectancy?.minSymbolSamples || 3)}
      ${buildTable('Setup Expectancy (Audit)', commonHeaders, stats.setups || {}, cfg.expectancy?.minSetupSamples || 5)}
      ${buildTable('Scan Source Audit', commonHeaders, stats.sources || {}, 0)}
      ${buildTable('Hourly Time-Window Audit', commonHeaders, stats.hours || {}, 0)}
    </div>
  `;
}

async function renderAnalytics() {
  var page = document.getElementById('page-analytics');
  if (!page) return;

  if (!analyticsData && !analyticsLoading) {
    page.innerHTML = '<div class="page-header"><div class="page-title">📊 Analytics</div><div class="page-sub">Dang tai du lieu...</div></div><div class="card" style="text-align:center;padding:60px"><div class="text-muted">⏳ Loading analytics data...</div></div>';
    await loadAnalyticsData();
  }

  var stats = (analyticsData && analyticsData.stats) || {};
  var totalOutcomes = ((analyticsData && analyticsData.setup) || []).reduce(function(s, r) { return s + r.total; }, 0);

  var viewContent = analyticsView === 'category' ? renderCategoryView() :
    analyticsView === 'setup' ? renderSetupView() :
    analyticsView === 'regime' ? renderRegimeView() :
    analyticsView === 'heatmap' ? renderHeatmapView() :
    analyticsView === 'audit' ? renderAuditView() :
    analyticsView === 'score' ? renderScoreView() :
    renderHoldingView();

  page.innerHTML = '<div class="page-header"><div class="page-title">📊 Analytics — Edge Performance</div><div class="page-sub">Checkpoint snapshot evaluation · D1/D3/D7/D14/D30 · ' + totalOutcomes + ' outcome records · basis: ' + analyticsPopulationLabel() + '</div></div>' +
    '<div class="grid-4 mb-20">' +
      '<div class="stat-card stat-green"><div class="stat-label">Signals</div><div class="stat-value">' + (stats.signals || 0) + '</div><div class="stat-note">Total recorded</div></div>' +
      '<div class="stat-card stat-cyan"><div class="stat-label">Outcomes</div><div class="stat-value">' + (stats.outcomes || 0) + '</div><div class="stat-note">Checkpoints evaluated</div></div>' +
      '<div class="stat-card stat-yellow"><div class="stat-label">Scans</div><div class="stat-value">' + (stats.scans || 0) + '</div><div class="stat-note">Scan history</div></div>' +
      '<div class="stat-card stat-purple"><div class="stat-label">Trades</div><div class="stat-value">' + (stats.trades || 0) + '</div><div class="stat-note">Journal entries</div></div>' +
    '</div>' +
    '<!-- P1-B: Population selector row -->' +
    '<div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap;align-items:center;padding:10px 14px;background:rgba(255,255,255,0.03);border-radius:8px;border:1px solid rgba(255,255,255,0.07)">' +
      '<span class="text-xs text-muted" style="margin-right:2px">Population:</span>' +
      '<button class="btn btn-xs ' + (analyticsPopulation === 'execution' ? 'btn-primary' : 'btn-outline') + '" onclick="switchAnalyticsPopulation(\'execution\')">Execution-approved</button>' +
      '<button class="btn btn-xs ' + (analyticsPopulation === 'technical' ? 'btn-primary' : 'btn-outline') + '" onclick="switchAnalyticsPopulation(\'technical\')">Technical</button>' +
      '<button class="btn btn-xs ' + (analyticsPopulation === 'v10_only' ? 'btn-primary' : 'btn-outline') + '" onclick="switchAnalyticsPopulation(\'v10_only\')" title="v10 era filter (heuristic) + execution-approved logic. Excludes legacy-era signals identified by missing sig-* ID prefix or absent authority contract fields. schemaVersion tagging is v1 heuristic — treat results as indicative, not certified.">🔬 v10 Era + Exec</button>' +
    '</div>' +
    '<div style="display:flex;gap:8px;margin-bottom:20px;flex-wrap:wrap;align-items:center">' +
      '<button class="btn btn-sm ' + (analyticsView === 'setup' ? 'btn-primary' : 'btn-outline') + '" onclick="switchAnalyticsView(\'setup\')">📐 Setup</button>' +
      '<button class="btn btn-sm ' + (analyticsView === 'category' ? 'btn-primary' : 'btn-outline') + '" onclick="switchAnalyticsView(\'category\')">🔖 Category</button>' +
      '<button class="btn btn-sm ' + (analyticsView === 'audit' ? 'btn-primary' : 'btn-outline') + '" onclick="switchAnalyticsView(\'audit\')">⚖️ Expectancy Audit</button>' +
      '<button class="btn btn-sm ' + (analyticsView === 'heatmap' ? 'btn-primary' : 'btn-outline') + '" onclick="switchAnalyticsView(\'heatmap\')">🔥 14d Heatmap</button>' +
      '<button class="btn btn-sm ' + (analyticsView === 'regime' ? 'btn-primary' : 'btn-outline') + '" onclick="switchAnalyticsView(\'regime\')">🌍 Regime</button>' +
      '<button class="btn btn-sm ' + (analyticsView === 'score' ? 'btn-primary' : 'btn-outline') + '" onclick="switchAnalyticsView(\'score\')">🎯 Score Bucket</button>' +
      '<button class="btn btn-sm ' + (analyticsView === 'holding' ? 'btn-primary' : 'btn-outline') + '" onclick="switchAnalyticsView(\'holding\')">⏱ Holding Period</button>' +
      '<div style="flex:1"></div>' +
      '<button class="btn btn-sm btn-outline" onclick="refreshOutcomesManual()" id="btnRefreshOutcomes">🔄 Refresh Outcomes</button>' +
      '<button class="btn btn-sm btn-outline" onclick="reloadAnalytics()">♻ Reload</button>' +
    '</div>' +
    renderTruthBasisCard() +
    '<div id="analyticsContent">' + viewContent + '</div>' +
    '<div class="card mt-20" style="border-color:rgba(0,229,255,.2)"><div class="card-title">💡 Cach doc Analytics</div><div class="text-sm text-muted" style="line-height:1.7"><strong>14d Heatmap (Feedback Engine):</strong> Du lieu real-time dung de auto-veto. Nhung gi bi Veto o day se khong duoc vao lenh.<br><strong>Checkpoint snapshot evaluation:</strong> Evaluator kiem tra gia tai thoi diem D1/D3/D7/D14/D30 sau khi signal duoc tao. Day la snapshot evaluation, khong phai full price-path replay.<br><strong>🔬 v10 Era + Exec:</strong> Loc era (heuristic v1, dua vao sig-* ID prefix va contract fields) ROI do execution-approved. Era filter la v1 nen treat ket qua la indicative, khong phai certified. scanTruthBasis (no_actionable / execution_qualified / technical_qualified_capital_suppressed) la debug field — khong phai nguon authority moi, chi giai thich trang thai cua scan.</div></div>';

}

function switchAnalyticsView(view) {
  analyticsView = view;
  renderAnalytics();
}

async function refreshOutcomesManual() {
  var btn = document.getElementById('btnRefreshOutcomes');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Evaluating...'; }
  try {
    var priceMap = {};
    if (window.ST && window.ST.coins) {
      window.ST.coins.forEach(function(c) {
        if (c.symbol && c.price) priceMap[c.symbol] = c.price;
      });
    }
    var result = await OUTCOME_EVAL.runEvaluation(function(msg) {
      if (btn) btn.textContent = '⏳ ' + msg;
    }, priceMap);
    analyticsData = null;
    await loadAnalyticsData();
    renderAnalytics();
    alert('Da evaluate ' + result.evaluated + ' outcomes');
  } catch (err) {
    alert('Outcome evaluation failed: ' + err.message);
  }
  if (btn) { btn.disabled = false; btn.textContent = '🔄 Refresh Outcomes Now'; }
}

async function reloadAnalytics() {
  analyticsData = null;
  await loadAnalyticsData();
  renderAnalytics();
}

// P1-B: Population switcher — reload analytics with new era/population context
async function switchAnalyticsPopulation(pop) {
  if (analyticsPopulation === pop) return;
  analyticsPopulation = pop;
  analyticsData = null;
  await loadAnalyticsData();
  renderAnalytics();
}
