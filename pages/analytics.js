/* ══════════════════════════════════════════════════════════
   ANALYTICS PAGE — Edge Performance Analysis
   4 views: Setup · Regime · Score Bucket · Holding Period
   ══════════════════════════════════════════════════════════ */

var analyticsView = 'setup';
var analyticsData = null;
var analyticsLoading = false;

async function loadAnalyticsData() {
  if (!window.OUTCOME_EVAL) return;
  analyticsLoading = true;
  try {
    const setup = await OUTCOME_EVAL.getSetupPerformance();
    const regime = await OUTCOME_EVAL.getRegimePerformance();
    const score = await OUTCOME_EVAL.getScoreBucketPerformance();
    const holding = await OUTCOME_EVAL.getHoldingPeriodPerformance();
    const stats = await DB.getStats();
    analyticsData = { setup: setup, regime: regime, score: score, holding: holding, stats: stats };
  } catch (err) {
    console.error('[ANALYTICS] Load error:', err);
  }
  analyticsLoading = false;
}

function renderAnalyticsTable(headers, rows) {
  if (!rows || !rows.length) {
    return '<div class="text-sm text-muted" style="padding:24px;text-align:center">Chua co du lieu outcome. Sau vai ngay scan, outcome evaluator se tu dong danh gia signal performance tai D1/D3/D7/D14/D30.</div>';
  }
  return '<div style="overflow-x:auto"><table class="j-table"><thead><tr>' + headers.map(function(h) { return '<th>' + h + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div>';
}

function renderSetupView() {
  var data = (analyticsData && analyticsData.setup) || [];
  var headers = ['Setup', 'Total', 'Win', 'Loss', 'Win Rate', 'Avg %', 'Avg R'];
  var rows = data.map(function(r) {
    var wrColor = r.winRate >= 55 ? 'var(--green)' : r.winRate >= 45 ? 'var(--yellow)' : 'var(--red)';
    var pctColor = r.avgPctChange >= 0 ? 'var(--green)' : 'var(--red)';
    return '<tr><td class="fw-700">' + r.setup + '</td><td class="mono">' + r.total + '</td><td class="mono text-green">' + r.winners + '</td><td class="mono text-red">' + r.losers + '</td><td class="mono fw-700" style="color:' + wrColor + '">' + r.winRate + '%</td><td class="mono" style="color:' + pctColor + '">' + (r.avgPctChange > 0 ? '+' : '') + r.avgPctChange + '%</td><td class="mono">' + r.avgR + 'R</td></tr>';
  });
  return '<div class="card mb-20"><div class="card-title">Setup Performance</div><div class="text-sm text-muted" style="margin-bottom:12px">Win rate va avg return theo tung loai setup. Data tu checkpoint snapshot evaluation.</div>' + renderAnalyticsTable(headers, rows) + '</div>';
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
  return '<div class="card mb-20"><div class="card-title">Regime Performance</div><div class="text-sm text-muted" style="margin-bottom:12px">Signal performance phan theo BTC context luc scan. Regime nao cho edge tot nhat?</div>' + renderAnalyticsTable(headers, rows) + '</div>';
}

function renderScoreView() {
  var data = (analyticsData && analyticsData.score) || [];
  var headers = ['Score Bucket', 'Total', 'Win', 'Loss', 'Win Rate', 'Avg %'];
  var rows = data.map(function(r) {
    var wrColor = r.winRate >= 55 ? 'var(--green)' : r.winRate >= 45 ? 'var(--yellow)' : 'var(--red)';
    var pctColor = r.avgPctChange >= 0 ? 'var(--green)' : 'var(--red)';
    return '<tr><td class="fw-700">' + r.bucket + '</td><td class="mono">' + r.total + '</td><td class="mono text-green">' + r.winners + '</td><td class="mono text-red">' + r.losers + '</td><td class="mono fw-700" style="color:' + wrColor + '">' + r.winRate + '%</td><td class="mono" style="color:' + pctColor + '">' + (r.avgPctChange > 0 ? '+' : '') + r.avgPctChange + '%</td></tr>';
  });
  return '<div class="card mb-20"><div class="card-title">Score Bucket Performance</div><div class="text-sm text-muted" style="margin-bottom:12px">Coin score 80+ thuc su perform tot hon score 40-60? Data se cho cau tra loi.</div>' + renderAnalyticsTable(headers, rows) + '</div>';
}

function renderHoldingView() {
  var data = (analyticsData && analyticsData.holding) || [];
  var headers = ['Period', 'Total', 'Win', 'Loss', 'Win Rate', 'Avg %', 'Avg R'];
  var rows = data.map(function(r) {
    var wrColor = r.winRate >= 55 ? 'var(--green)' : r.winRate >= 45 ? 'var(--yellow)' : 'var(--red)';
    var pctColor = r.avgPctChange >= 0 ? 'var(--green)' : 'var(--red)';
    return '<tr><td class="fw-700">' + r.period + '</td><td class="mono">' + r.total + '</td><td class="mono text-green">' + r.winners + '</td><td class="mono text-red">' + r.losers + '</td><td class="mono fw-700" style="color:' + wrColor + '">' + r.winRate + '%</td><td class="mono" style="color:' + pctColor + '">' + (r.avgPctChange > 0 ? '+' : '') + r.avgPctChange + '%</td><td class="mono">' + r.avgR + 'R</td></tr>';
  });
  return '<div class="card mb-20"><div class="card-title">Holding Period Performance</div><div class="text-sm text-muted" style="margin-bottom:12px">D1 vs D3 vs D7 vs D14 vs D30 — khoang thoi gian nao toi uu cho edge cua ban?</div>' + renderAnalyticsTable(headers, rows) + '</div>';
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

  var viewContent = analyticsView === 'setup' ? renderSetupView() :
    analyticsView === 'regime' ? renderRegimeView() :
    analyticsView === 'score' ? renderScoreView() :
    renderHoldingView();

  page.innerHTML = '<div class="page-header"><div class="page-title">📊 Analytics — Edge Performance</div><div class="page-sub">Checkpoint snapshot evaluation · D1/D3/D7/D14/D30 · ' + totalOutcomes + ' outcome records</div></div>' +
    '<div class="grid-4 mb-20">' +
      '<div class="stat-card stat-green"><div class="stat-label">Signals</div><div class="stat-value">' + (stats.signals || 0) + '</div><div class="stat-note">Total recorded</div></div>' +
      '<div class="stat-card stat-cyan"><div class="stat-label">Outcomes</div><div class="stat-value">' + (stats.outcomes || 0) + '</div><div class="stat-note">Checkpoints evaluated</div></div>' +
      '<div class="stat-card stat-yellow"><div class="stat-label">Scans</div><div class="stat-value">' + (stats.scans || 0) + '</div><div class="stat-note">Scan history</div></div>' +
      '<div class="stat-card stat-purple"><div class="stat-label">Trades</div><div class="stat-value">' + (stats.trades || 0) + '</div><div class="stat-note">Journal entries</div></div>' +
    '</div>' +
    '<div style="display:flex;gap:8px;margin-bottom:20px;flex-wrap:wrap;align-items:center">' +
      '<button class="btn btn-sm ' + (analyticsView === 'setup' ? 'btn-primary' : 'btn-outline') + '" onclick="switchAnalyticsView(\'setup\')">📐 Setup</button>' +
      '<button class="btn btn-sm ' + (analyticsView === 'regime' ? 'btn-primary' : 'btn-outline') + '" onclick="switchAnalyticsView(\'regime\')">🌍 Regime</button>' +
      '<button class="btn btn-sm ' + (analyticsView === 'score' ? 'btn-primary' : 'btn-outline') + '" onclick="switchAnalyticsView(\'score\')">🎯 Score Bucket</button>' +
      '<button class="btn btn-sm ' + (analyticsView === 'holding' ? 'btn-primary' : 'btn-outline') + '" onclick="switchAnalyticsView(\'holding\')">⏱ Holding Period</button>' +
      '<div style="flex:1"></div>' +
      '<button class="btn btn-sm btn-outline" onclick="refreshOutcomesManual()" id="btnRefreshOutcomes">🔄 Refresh Outcomes Now</button>' +
      '<button class="btn btn-sm btn-outline" onclick="reloadAnalytics()">♻ Reload Data</button>' +
    '</div>' +
    '<div id="analyticsContent">' + viewContent + '</div>' +
    '<div class="card mt-20" style="border-color:rgba(0,229,255,.2)"><div class="card-title">💡 Cach doc Analytics</div><div class="text-sm text-muted" style="line-height:1.7"><strong>Checkpoint snapshot evaluation:</strong> Evaluator kiem tra gia tai thoi diem D1/D3/D7/D14/D30 sau khi signal duoc tao. Day la snapshot evaluation, khong phai full price-path replay.<br><br><strong>Setup Performance:</strong> So sanh win rate theo setup type.<br><strong>Regime Performance:</strong> BTC bull vs sideway vs bear — regime nao cho signal quality tot nhat?<br><strong>Score Bucket:</strong> Signal score cao co thuc su predict better outcome?<br><strong>Holding Period:</strong> D1 scalp vs D7 swing vs D30 position — optimal exit timing.</div></div>';
}

function switchAnalyticsView(view) {
  analyticsView = view;
  renderAnalytics();
}

async function refreshOutcomesManual() {
  var btn = document.getElementById('btnRefreshOutcomes');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Evaluating...'; }
  try {
    var result = await OUTCOME_EVAL.runEvaluation(function(msg) {
      if (btn) btn.textContent = '⏳ ' + msg;
    });
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
