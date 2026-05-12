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
    const attribution = OUTCOME_EVAL.getOutcomeAttributionReport ? await OUTCOME_EVAL.getOutcomeAttributionReport() : null;
    const truthSummary = await OUTCOME_EVAL.getAnalyticsTruthSummary();
    const stats = await DB.getStats();
    analyticsData = { category: category, setup: setup, regime: regime, score: score, holding: holding, attribution: attribution, truthSummary: truthSummary, stats: stats, population: analyticsPopulation };
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
    '<div class="card-title">Truth Basis — Nền dữ liệu đang đọc</div>' +
    '<div class="text-sm text-muted" style="margin-bottom:12px">Các bảng performance hiện đang dùng nhóm <strong>' + analyticsPopulationLabel() + '</strong>. Những position-bound/carryover từ portfolio được loại khỏi expectancy và feedback views để tránh làm nhiễu edge thật.</div>' +
    '<div class="grid-4 gap-8">' +
      '<div style="padding:12px;border-radius:8px;background:var(--bg-hover)"><div class="text-xs text-muted">Technical Signals</div><div class="fw-700">' + (truth.technicalSignals || 0) + '</div><div class="text-xs text-muted">Outcome đã đánh giá ' + (truth.technicalOutcomes || 0) + '</div></div>' +
      '<div style="padding:12px;border-radius:8px;background:var(--bg-hover)"><div class="text-xs text-muted">Execution Signals</div><div class="fw-700">' + (truth.executionSignals || 0) + '</div><div class="text-xs text-muted">Outcome đã đánh giá ' + (truth.executionOutcomes || 0) + '</div></div>' +
      '<div style="padding:12px;border-radius:8px;background:var(--bg-hover)"><div class="text-xs text-muted">Alert Signals</div><div class="fw-700">' + (truth.alertSignals || 0) + '</div><div class="text-xs text-muted">Outcome đã đánh giá ' + (truth.alertOutcomes || 0) + '</div></div>' +
      '<div style="padding:12px;border-radius:8px;background:var(--bg-hover)"><div class="text-xs text-muted">Rejected Signals</div><div class="fw-700">' + (truth.rejectedSignals || 0) + '</div><div class="text-xs text-muted">Outcome đã đánh giá ' + (truth.rejectedOutcomes || 0) + '</div></div>' +
    '</div>' +
    '<div class="text-xs text-muted" style="margin-top:10px">Score bucket dùng <strong>' + analyticsScoreFieldLabel() + '</strong> (risk-adjusted quality), không dùng raw scanner score.</div>' +
    '<div class="text-xs text-muted" style="margin-top:6px">Portfolio-bound outcomes đã loại khỏi thống kê: ' + (truth.portfolioBoundOutcomes || 0) + '</div>' +
  '</div>';
}

function renderAnalyticsQuickGuide(totalOutcomes) {
  return '<div class="card mb-20" style="border-left:4px solid var(--cyan)">' +
    '<div class="card-title">🧭 Cách dùng nhanh cho người mới</div>' +
    '<div class="text-sm text-muted" style="line-height:1.7">' +
      '<strong>1.</strong> Bắt đầu với population <strong>Execution-approved</strong> để xem nhóm thật sự đã qua authority/capital gate.<br>' +
      '<strong>2.</strong> Xem <strong>Setup</strong> và <strong>Category</strong> để biết kiểu setup/narrative nào đang có edge tốt hơn.<br>' +
      '<strong>3.</strong> Dùng <strong>14d Heatmap</strong> như lớp cảnh báo edge decay: nếu bị veto/downgrade thì hệ thống sẽ bảo thủ hơn với lệnh mới.<br>' +
      '<strong>4.</strong> Xem <strong>Holding Period</strong> để hiểu mốc D1/D3/D7/D14/D30 nào đang hợp với edge hiện tại.<br>' +
      '<strong>5.</strong> Nếu sample còn ít, chỉ xem là tín hiệu tham khảo — đừng kết luận mạnh hoặc tự retune threshold từ vài outcome đầu.' +
    '</div>' +
    '<div class="text-xs text-muted" style="margin-top:10px">Hiện có ' + (totalOutcomes || 0) + ' outcome records trong population đang chọn. Analytics giúp audit edge; authority cuối vẫn nằm ở Alpha Guard.</div>' +
  '</div>';
}

function renderAnalyticsTable(headers, rows) {
  if (!rows || !rows.length) {
    return '<div class="text-sm text-muted" style="padding:24px;text-align:center">Chưa có dữ liệu outcome. Sau vài ngày scan, Outcome Evaluator sẽ tự động đánh giá hiệu suất signal tại các mốc D1/D3/D7/D14/D30.</div>';
  }
  return '<div style="overflow-x:auto"><table class="j-table"><thead><tr>' + headers.map(function(h) { return '<th>' + h + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div>';
}

function renderCategoryView() {
  var data = (analyticsData && analyticsData.category) || [];
  var headers = ['Category', 'Total', 'Win', 'Loss', 'Win Rate', 'Avg %', 'Planned R', 'Raw Checkpoint R'];
  var rows = data.map(function(r) {
    var wrColor = r.winRate >= 55 ? 'var(--green)' : r.winRate >= 45 ? 'var(--yellow)' : 'var(--red)';
    var pctColor = r.avgPctChange >= 0 ? 'var(--green)' : 'var(--red)';
    return '<tr><td><span class="badge badge-purple">' + (r.category || 'OTHER') + '</span></td><td class="mono">' + r.total + '</td><td class="mono text-green">' + r.winners + '</td><td class="mono text-red">' + r.losers + '</td><td class="mono fw-700" style="color:' + wrColor + '">' + r.winRate + '%</td><td class="mono" style="color:' + pctColor + '">' + (r.avgPctChange > 0 ? '+' : '') + r.avgPctChange + '%</td><td class="mono">' + (r.avgPlannedTradeR ?? r.avgR) + 'R</td><td class="mono text-muted">' + (r.avgRawCheckpointR ?? r.avgR) + 'R</td></tr>';
  });
  
  var bestCategory = data.length ? data[0] : null;
  var summaryHtml = bestCategory ? (
    '<div class="narrative-edge-summary mb-16" style="padding:16px;background:rgba(187,134,252,0.1);border:1px solid rgba(187,134,252,0.3);border-radius:12px">' +
      '<div style="display:flex;align-items:center;gap:12px">' +
        '<div style="font-size:24px">💎</div>' +
        '<div>' +
          '<div class="fw-700 text-purple">Narrative Edge Detected: ' + bestCategory.category + '</div>' +
          '<div class="text-xs text-muted">Win Rate: ' + bestCategory.winRate + '% · Planned R: ' + (bestCategory.avgPlannedTradeR ?? bestCategory.avgR) + 'R · Raw R: ' + (bestCategory.avgRawCheckpointR ?? bestCategory.avgR) + 'R · Samples: ' + bestCategory.total + '</div>' +
        '</div>' +
      '</div>' +
    '</div>'
  ) : '';

  return '<div class="card mb-20"><div class="card-title">Category Performance</div><div class="text-sm text-muted" style="margin-bottom:12px">Theo dõi win/loss ratio theo nhóm narrative như AI, MEME, RWA, L1... Chỉ tính trên nhóm ' + analyticsPopulationLabel() + '.</div>' + summaryHtml + renderAnalyticsTable(headers, rows) + '</div>';
}

function renderSetupView() {
  var data = (analyticsData && analyticsData.setup) || [];
  var headers = ['Setup', 'Total', 'Win', 'Loss', 'Win Rate', 'Avg %', 'Planned R', 'Raw Checkpoint R'];
  var rows = data.map(function(r) {
    var wrColor = r.winRate >= 55 ? 'var(--green)' : r.winRate >= 45 ? 'var(--yellow)' : 'var(--red)';
    var pctColor = r.avgPctChange >= 0 ? 'var(--green)' : 'var(--red)';
    return '<tr><td class="fw-700">' + r.setup + '</td><td class="mono">' + r.total + '</td><td class="mono text-green">' + r.winners + '</td><td class="mono text-red">' + r.losers + '</td><td class="mono fw-700" style="color:' + wrColor + '">' + r.winRate + '%</td><td class="mono" style="color:' + pctColor + '">' + (r.avgPctChange > 0 ? '+' : '') + r.avgPctChange + '%</td><td class="mono">' + (r.avgPlannedTradeR ?? r.avgR) + 'R</td><td class="mono text-muted">' + (r.avgRawCheckpointR ?? r.avgR) + 'R</td></tr>';
  });
  return '<div class="card mb-20"><div class="card-title">Setup Performance</div><div class="text-sm text-muted" style="margin-bottom:12px">Win rate và planned trade R theo từng loại setup, dựa trên nhóm ' + analyticsPopulationLabel() + '. Dữ liệu đến từ checkpoint snapshot evaluation.</div>' + renderAnalyticsTable(headers, rows) + '</div>';
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
  return '<div class="card mb-20"><div class="card-title">Regime Performance</div><div class="text-sm text-muted" style="margin-bottom:12px">Hiệu suất signal theo BTC context tại thời điểm scan. Chỉ tính trên nhóm ' + analyticsPopulationLabel() + '.</div>' + renderAnalyticsTable(headers, rows) + '</div>';
}

function renderScoreView() {
  var data = (analyticsData && analyticsData.score) || [];
  var headers = ['Score Bucket', 'Total', 'Win', 'Loss', 'Win Rate', 'Avg %'];
  var rows = data.map(function(r) {
    var wrColor = r.winRate >= 55 ? 'var(--green)' : r.winRate >= 45 ? 'var(--yellow)' : 'var(--red)';
    var pctColor = r.avgPctChange >= 0 ? 'var(--green)' : 'var(--red)';
    return '<tr><td class="fw-700">' + r.bucket + '</td><td class="mono">' + r.total + '</td><td class="mono text-green">' + r.winners + '</td><td class="mono text-red">' + r.losers + '</td><td class="mono fw-700" style="color:' + wrColor + '">' + r.winRate + '%</td><td class="mono" style="color:' + pctColor + '">' + (r.avgPctChange > 0 ? '+' : '') + r.avgPctChange + '%</td></tr>';
  });
  return '<div class="card mb-20"><div class="card-title">Score Bucket Performance</div><div class="text-sm text-muted" style="margin-bottom:12px">Các bucket được đánh giá bằng <strong>' + analyticsScoreFieldLabel() + '</strong> và chỉ tính trên nhóm ' + analyticsPopulationLabel() + '. Raw scanner score vẫn là input cho gate/ranking, không phải nền bucket analytics.</div>' + renderAnalyticsTable(headers, rows) + '</div>';
}

function renderHoldingView() {
  var data = (analyticsData && analyticsData.holding) || [];
  var headers = ['Period', 'Total', 'Win', 'Loss', 'Win Rate', 'Avg %', 'Planned R', 'Raw Checkpoint R'];
  var rows = data.map(function(r) {
    var wrColor = r.winRate >= 55 ? 'var(--green)' : r.winRate >= 45 ? 'var(--yellow)' : 'var(--red)';
    var pctColor = r.avgPctChange >= 0 ? 'var(--green)' : 'var(--red)';
    return '<tr><td class="fw-700">' + r.period + '</td><td class="mono">' + r.total + '</td><td class="mono text-green">' + r.winners + '</td><td class="mono text-red">' + r.losers + '</td><td class="mono fw-700" style="color:' + wrColor + '">' + r.winRate + '%</td><td class="mono" style="color:' + pctColor + '">' + (r.avgPctChange > 0 ? '+' : '') + r.avgPctChange + '%</td><td class="mono">' + (r.avgPlannedTradeR ?? r.avgR) + 'R</td><td class="mono text-muted">' + (r.avgRawCheckpointR ?? r.avgR) + 'R</td></tr>';
  });
  return '<div class="card mb-20"><div class="card-title">Holding Period Performance</div><div class="text-sm text-muted" style="margin-bottom:12px">So sánh D1 vs D3 vs D7 vs D14 vs D30 để xem khoảng thời gian nào tối ưu cho edge của Bạn. Chỉ tính trên nhóm ' + analyticsPopulationLabel() + '.</div>' + renderAnalyticsTable(headers, rows) + '</div>';
}

function attributionConfidenceLabel(conf) {
  return (conf && conf.label) || 'Unknown confidence';
}

function attributionConfidenceClass(conf) {
  var level = (conf && conf.level) || '';
  if (level === 'very_low_confidence') return 'badge-red';
  if (level === 'low_confidence') return 'badge-yellow';
  if (level === 'moderate_observation') return 'badge-purple';
  return 'badge-green';
}

function renderAttributionGuardrail(total, conf) {
  var warning = conf && conf.shouldWarn ? '<div class="text-xs text-yellow" style="margin-top:6px">Do not tune from low sample size.</div>' : '';
  return '<div class="card mb-20" style="border-left:4px solid var(--yellow)">' +
    '<div class="card-title">Sample-size Guardrail</div>' +
    '<div class="grid-4 gap-8">' +
      '<div style="padding:12px;border-radius:8px;background:var(--bg-hover)"><div class="text-xs text-muted">Matched outcomes</div><div class="fw-700">' + (total || 0) + '</div></div>' +
      '<div style="padding:12px;border-radius:8px;background:var(--bg-hover)"><div class="text-xs text-muted">&lt;10</div><div class="fw-700">Very low confidence</div></div>' +
      '<div style="padding:12px;border-radius:8px;background:var(--bg-hover)"><div class="text-xs text-muted">10-30</div><div class="fw-700">Low confidence</div></div>' +
      '<div style="padding:12px;border-radius:8px;background:var(--bg-hover)"><div class="text-xs text-muted">30-100 / &gt;100</div><div class="fw-700">Moderate / Stronger</div></div>' +
    '</div>' +
    '<div class="text-sm text-muted" style="margin-top:10px">Current confidence: <span class="badge ' + attributionConfidenceClass(conf) + '">' + attributionConfidenceLabel(conf) + '</span></div>' +
    warning +
  '</div>';
}

function renderTopInsightsPanel(report) {
  var insights = report.topInsights || {};
  var tier = (insights.tierPlannedTradeR || []).map(function(r) {
    return '<div><span class="badge badge-gray">' + r.key + '</span> <span class="mono">' + r.avgPlannedTradeR + 'R</span> <span class="text-xs text-muted">(' + r.total + ' samples)</span></div>';
  }).join('') || '<div class="text-muted">No tier samples yet.</div>';
  var pools = (insights.learningPoolPlannedTradeR || []).map(function(r) {
    return '<div><span class="badge badge-gray">' + r.key + '</span> <span class="mono">' + r.avgPlannedTradeR + 'R</span> <span class="text-xs text-muted">(' + r.total + ' samples)</span></div>';
  }).join('') || '<div class="text-muted">No pool samples yet.</div>';
  var strongest = insights.strongestMbeBucket ? insights.strongestMbeBucket.group + ' / ' + insights.strongestMbeBucket.key + ' (' + insights.strongestMbeBucket.avgPlannedTradeR + 'R)' : 'Not enough MBE buckets';
  var weakest = insights.weakestMbeBucket ? insights.weakestMbeBucket.group + ' / ' + insights.weakestMbeBucket.key + ' (' + insights.weakestMbeBucket.avgPlannedTradeR + 'R)' : 'Not enough MBE buckets';
  var failure = insights.mostCommonFailureMode ? insights.mostCommonFailureMode.key + ' (' + insights.mostCommonFailureMode.total + ' samples)' : 'No failure modes yet';
  var gaps = insights.gapCases || {};
  return '<div class="card mb-20" style="border-left:4px solid var(--cyan)">' +
    '<div class="card-title">Top Insights - Analytics Only</div>' +
    '<div class="text-sm text-muted" style="margin-bottom:12px">Analytics only, no automatic tuning.</div>' +
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px">' +
      '<div><div class="text-xs text-muted mb-6">Planned Trade R by Tier</div>' + tier + '</div>' +
      '<div><div class="text-xs text-muted mb-6">Execution vs Near-approved</div>' + pools + '</div>' +
      '<div><div class="text-xs text-muted mb-6">MBE Buckets</div><div><strong>Strongest:</strong> ' + strongest + '</div><div><strong>Weakest:</strong> ' + weakest + '</div></div>' +
      '<div><div class="text-xs text-muted mb-6">Failure / Gap Cases</div><div><strong>Most common:</strong> ' + failure + '</div><div class="text-xs text-muted">Weak raw: ' + (gaps.plannedWinRawWeak || 0) + ' | Ran further: ' + (gaps.plannedCappedRawRanFurther || 0) + ' | Recovered: ' + (gaps.stopHitRawRecovered || 0) + '</div></div>' +
    '</div>' +
  '</div>';
}

function renderDataQualityPanel(report) {
  var q = report.dataQuality || {};
  function qcell(label, item) {
    if (typeof item === 'number') return '<div style="padding:12px;border-radius:8px;background:var(--bg-hover)"><div class="text-xs text-muted">' + label + '</div><div class="fw-700">' + item + '</div></div>';
    return '<div style="padding:12px;border-radius:8px;background:var(--bg-hover)"><div class="text-xs text-muted">' + label + '</div><div class="fw-700">' + ((item && item.pct) || 0) + '%</div><div class="text-xs text-muted">' + ((item && item.count) || 0) + ' / ' + (report.matchedSamples || 0) + '</div></div>';
  }
  return '<div class="card mb-20">' +
    '<div class="card-title">Data Quality</div>' +
    '<div class="text-sm text-muted" style="margin-bottom:12px">Coverage check for planned/raw outcome fields, Agentic Review, MBE full_ohlcv input, and legacy outcomes.</div>' +
    '<div class="grid-4 gap-8">' +
      qcell('plannedTradeR coverage', q.plannedTradeRCoverage) +
      qcell('rawCheckpointR coverage', q.rawCheckpointRCoverage) +
      qcell('agentReview coverage', q.agentReviewCoverage) +
      qcell('MBE full_ohlcv coverage', q.mbeFullOhlcvCoverage) +
      qcell('legacy outcome count', q.legacyOutcomeCount || 0) +
    '</div>' +
  '</div>';
}

function renderAttributionTable(title, rows, note) {
  var headers = ['Factor / Bucket', 'Samples', 'Confidence', 'Win Rate', 'Planned Trade R', 'Raw Checkpoint R', 'Gap R', 'Caps'];
  var body = (rows || []).map(function(r) {
    var planned = Number(r.avgPlannedTradeR || 0);
    var gap = Number(r.avgGapR || 0);
    var plannedColor = planned > 0 ? 'var(--green)' : planned < 0 ? 'var(--red)' : 'var(--text)';
    var gapColor = gap > 0 ? 'var(--cyan)' : gap < 0 ? 'var(--yellow)' : 'var(--text)';
    var warning = r.sampleWarning ? '<div class="text-xs text-yellow">' + r.sampleWarning + '</div>' : '';
    return '<tr><td class="fw-700">' + (r.key || 'unknown') + '</td><td class="mono">' + (r.total || 0) + '</td><td><span class="badge ' + attributionConfidenceClass(r.sampleConfidence) + '">' + attributionConfidenceLabel(r.sampleConfidence) + '</span>' + warning + '</td><td class="mono">' + (r.winRate || 0) + '%</td><td class="mono fw-700" style="color:' + plannedColor + '">' + planned + 'R</td><td class="mono text-muted">' + Number(r.avgRawCheckpointR || 0) + 'R</td><td class="mono" style="color:' + gapColor + '">' + (gap > 0 ? '+' : '') + gap + 'R</td><td class="mono">' + (r.capApplied || 0) + '</td></tr>';
  });
  return '<div class="card mb-20"><div class="card-title">' + title + '</div>' +
    '<div class="text-sm text-muted" style="margin-bottom:12px">' + (note || 'Read-only attribution. Planned trade performance is primary; raw checkpoint follow-through is secondary.') + '</div>' +
    renderAnalyticsTable(headers, body) +
  '</div>';
}

function renderGapTable(title, rows, note) {
  var headers = ['Symbol', 'Checkpoint', 'Tier', 'Pool', 'Planned Trade R', 'Raw Checkpoint R', 'Gap R'];
  var body = (rows || []).map(function(r) {
    var gap = Number(r.gapR || 0);
    var gapColor = gap > 0 ? 'var(--cyan)' : gap < 0 ? 'var(--yellow)' : 'var(--text)';
    return '<tr><td class="fw-700">' + (r.symbol || 'UNKNOWN') + '</td><td class="mono">' + (r.checkDay || '-') + '</td><td><span class="badge badge-gray">' + (r.tier || '-') + '</span></td><td class="mono">' + (r.learningPool || '-') + '</td><td class="mono">' + Number(r.plannedTradeR || 0) + 'R</td><td class="mono text-muted">' + Number(r.rawCheckpointR || 0) + 'R</td><td class="mono fw-700" style="color:' + gapColor + '">' + (gap > 0 ? '+' : '') + gap + 'R</td></tr>';
  });
  return '<div class="card mb-20"><div class="card-title">' + title + '</div>' +
    '<div class="text-sm text-muted" style="margin-bottom:12px">' + (note || 'Gap cases compare planned trade outcome against raw checkpoint mark-to-market follow-through.') + '</div>' +
    renderAnalyticsTable(headers, body) +
  '</div>';
}

function renderAttributionView() {
  var report = analyticsData && analyticsData.attribution;
  if (!report || report.ok === false) {
    return '<div class="card mb-20"><div class="card-title">Outcome Attribution</div><div class="text-sm text-muted">Attribution report is not ready yet.</div></div>';
  }

  var sem = report.metricSemantics || {};
  var mbe = report.mbe || {};
  var agent = report.agentReview || {};
  var context = report.context || {};
  var gaps = report.rawVsPlannedGaps || {};
  var intro = '<div class="card mb-20" style="border-left:4px solid var(--cyan)">' +
    '<div class="card-title">Outcome Attribution - Read Only</div>' +
    '<div class="text-sm text-muted" style="line-height:1.7">' +
      '<strong>Primary:</strong> ' + (sem.primary || 'plannedTradeR = planned trade performance') + '<br>' +
      '<strong>Secondary:</strong> ' + (sem.secondary || 'rawCheckpointR = raw checkpoint follow-through') + '<br>' +
      '<strong>Legacy:</strong> ' + (sem.legacy || 'actualR remains raw checkpoint mark-to-market') + '<br>' +
      '<strong>Scope:</strong> report panel only; no threshold, authority, scoring, Telegram, deployableTop3, MBE, or Agentic Review decision impact.' +
    '</div>' +
    '<div class="grid-4 gap-8" style="margin-top:12px">' +
      '<div style="padding:12px;border-radius:8px;background:var(--bg-hover)"><div class="text-xs text-muted">Outcomes</div><div class="fw-700">' + (report.totalOutcomes || 0) + '</div></div>' +
      '<div style="padding:12px;border-radius:8px;background:var(--bg-hover)"><div class="text-xs text-muted">Matched Samples</div><div class="fw-700">' + (report.matchedSamples || 0) + '</div></div>' +
      '<div style="padding:12px;border-radius:8px;background:var(--bg-hover)"><div class="text-xs text-muted">Planned Metric</div><div class="fw-700">plannedTradeR</div></div>' +
      '<div style="padding:12px;border-radius:8px;background:var(--bg-hover)"><div class="text-xs text-muted">Follow-through</div><div class="fw-700">rawCheckpointR</div></div>' +
    '</div>' +
  '</div>';

  return intro +
    renderAttributionGuardrail(report.matchedSamples, report.sampleConfidence) +
    renderTopInsightsPanel(report) +
    renderDataQualityPanel(report) +
    renderAttributionTable('READY / PLAYABLE / PROBE planned trade performance', report.byTier, 'Performance by authority display tier using plannedTradeR as the primary trade metric.') +
    renderAttributionTable('Execution vs Near-approved planned trade performance', report.byLearningPool, 'Compares execution-approved outcomes with near-approved learning-pool outcomes. Read-only only.') +
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(380px,1fr));gap:20px">' +
      renderAttributionTable('MBE: priceZoneQuality', mbe.priceZoneQuality, 'Market Behavior Evidence bucketed by price zone quality.') +
      renderAttributionTable('MBE: volumeSupportScore', mbe.volumeSupportScore, 'Market Behavior Evidence bucketed by volume support score.') +
      renderAttributionTable('MBE: volumeResistanceRisk', mbe.volumeResistanceRisk, 'Market Behavior Evidence bucketed by resistance risk.') +
      renderAttributionTable('MBE: pathToTPQuality', mbe.pathToTPQuality, 'Market Behavior Evidence bucketed by path-to-TP quality.') +
      renderAttributionTable('MBE: failureModeCandidate', mbe.failureModeCandidate, 'Failure mode candidate labels versus planned and raw outcomes.') +
    '</div>' +
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(380px,1fr));gap:20px">' +
      renderAttributionTable('Agentic Review: bullCase count', agent.bullCaseCount, 'Read-only bull case count buckets.') +
      renderAttributionTable('Agentic Review: bearCase count', agent.bearCaseCount, 'Read-only bear case count buckets.') +
      renderAttributionTable('Agentic Review: riskFlags', agent.riskFlags, 'Risk flags observed in Agentic Review behavior evidence.') +
      renderAttributionTable('Agentic Review: finalOperatorNote category', agent.finalOperatorNoteCategory, 'Final operator note categories when available.') +
    '</div>' +
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(380px,1fr));gap:20px">' +
      renderAttributionTable('Context: btcContext', context.btcContext, 'BTC context versus planned trade performance.') +
      renderAttributionTable('Context: CHOP / sideway / regime', context.regimeType, 'Regime context versus planned trade performance.') +
      renderAttributionTable('Context: scan hour', context.scanHour, 'Scan hour bucket versus planned trade performance.') +
      renderAttributionTable('Context: session', context.session, 'Session bucket versus planned trade performance.') +
    '</div>' +
    renderGapTable('Gap: planned win but raw checkpoint weak', gaps.plannedWinRawWeak, 'Cases where the planned trade looks positive, but checkpoint follow-through was weak or negative.') +
    renderGapTable('Gap: planned capped but raw ran further', gaps.plannedCappedRawRanFurther, 'Cases where planned trade R is capped, but raw checkpoint follow-through kept running.') +
    renderGapTable('Gap: stop hit but raw checkpoint later recovered', gaps.stopHitRawRecovered, 'Cases where the planned stop outcome was negative, but later checkpoint MTM recovered above zero.');
}

function renderHeatmapView() {
  if (!window.ANALYTICS_ENGINE) return '<div class="text-sm text-muted">Feedback Engine chưa sẵn sàng.</div>';
  
  // Calculate live stats (don't force, rely on cache if recent)
  const stats = window.ANALYTICS_ENGINE.getCachedStats(analyticsPopulation);
  if (!stats || !stats.categories || !stats.setups) {
    window.ANALYTICS_ENGINE.computeRollingStats(false, analyticsPopulation).then(() => {
        if (analyticsView === 'heatmap') renderAnalytics();
    });
    return '<div class="text-center text-muted p-20">⏳ Đang tính 14d Rolling Analytics...</div>';
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
     <div class="text-sm text-muted mb-12">Theo dõi win rate từ ${analyticsPopulationLabel()} outcomes trong 14 ngày gần nhất. Dưới <span class="text-red">${th.vetoWinRate}%</span> sẽ kích hoạt Auto-Veto, dưới <span class="text-yellow">${th.downgradeWinRate}%</span> sẽ hạ xuống PROBE. Cần tối thiểu ${th.minSampleSize} trades để kết luận.</div>` +
     renderAnalyticsTable(catHeaders, catRows) +
    `</div>
    <div class="card mb-20"><div class="card-title">Setup Feedback Loop (14d Rolling)</div>`+
     renderAnalyticsTable(setupHeaders, setupRows) +
    `</div>`;

  return html;
}

function renderAuditView() {
  if (!window.ANALYTICS_ENGINE) return '<div class="text-sm text-muted">Analytics Engine chưa sẵn sàng.</div>';
  const stats = window.ANALYTICS_ENGINE.getCachedStats(analyticsPopulation);
  if (!stats || !stats.updatedAt) {
    window.ANALYTICS_ENGINE.computeRollingStats(false, analyticsPopulation).then(() => {
      if (analyticsView === 'audit') renderAnalytics();
    });
    return '<div class="text-center text-muted p-20">⏳ Đang tính dữ liệu audit...</div>';
  }

  const cfg = window.ST?.config || { expectancy: {}, execution: {} };

  const renderConfigTag = (val, label) => `<div class="text-xs" style="background:rgba(255,255,255,0.05);padding:4px 8px;border-radius:4px;border:1px solid rgba(255,255,255,0.1)"><span class="text-muted">${label}:</span> <span class="fw-700 text-cyan">${val}</span></div>`;

  const configHtml = `
    <div class="card mb-20" style="border-left: 4px solid var(--cyan)">
      <div class="card-title">⚙️ Active Hardening Config</div>
      <div class="text-sm text-muted mb-12">Expectancy audit bên dưới chỉ tính ${analyticsPopulationLabel()} outcomes và loại trừ portfolio-bound/carryover để giữ edge sạch.</div>
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
        return `<tr><td class="fw-700">${label}</td><td class="mono">${r.total}</td><td class="mono" style="color:${wrColor}">${r.winRate}%</td><td class="mono fw-700" style="color:${rColor}">${r.avgPlannedTradeR ?? r.avgR}R</td><td class="mono text-muted">${r.avgRawCheckpointR ?? r.avgR}R</td></tr>`;
      });
    return `
      <div class="card mb-20">
        <div class="card-title">${title}</div>
        ${renderAnalyticsTable(headers, rows)}
      </div>`;
  };

  const commonHeaders = ['Segment', 'Samples', 'Win Rate', 'Planned R', 'Raw R'];
  
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
    page.innerHTML = '<div class="page-header"><div class="page-title">📊 Analytics</div><div class="page-sub">Đang tải dữ liệu...</div></div><div class="card" style="text-align:center;padding:60px"><div class="text-muted">⏳ Đang tải dữ liệu analytics...</div></div>';
    await loadAnalyticsData();
  }

  var stats = (analyticsData && analyticsData.stats) || {};
  var totalOutcomes = ((analyticsData && analyticsData.setup) || []).reduce(function(s, r) { return s + r.total; }, 0);

  var viewContent = analyticsView === 'category' ? renderCategoryView() :
    analyticsView === 'setup' ? renderSetupView() :
    analyticsView === 'regime' ? renderRegimeView() :
    analyticsView === 'heatmap' ? renderHeatmapView() :
    analyticsView === 'audit' ? renderAuditView() :
    analyticsView === 'attribution' ? renderAttributionView() :
    analyticsView === 'score' ? renderScoreView() :
    renderHoldingView();

  page.innerHTML = '<div class="page-header"><div class="page-title">📊 Analytics — Edge Performance</div><div class="page-sub">Checkpoint snapshot evaluation · D1/D3/D7/D14/D30 · ' + totalOutcomes + ' outcome records · nền dữ liệu: ' + analyticsPopulationLabel() + '</div></div>' +
    '<div class="grid-4 mb-20">' +
      '<div class="stat-card stat-green"><div class="stat-label">Signals</div><div class="stat-value">' + (stats.signals || 0) + '</div><div class="stat-note">Tổng signal đã lưu</div></div>' +
      '<div class="stat-card stat-cyan"><div class="stat-label">Outcomes</div><div class="stat-value">' + (stats.outcomes || 0) + '</div><div class="stat-note">Checkpoint đã đánh giá</div></div>' +
      '<div class="stat-card stat-yellow"><div class="stat-label">Scans</div><div class="stat-value">' + (stats.scans || 0) + '</div><div class="stat-note">Lịch sử scan</div></div>' +
      '<div class="stat-card stat-purple"><div class="stat-label">Trades</div><div class="stat-value">' + (stats.trades || 0) + '</div><div class="stat-note">Nhật ký trade thủ công</div></div>' +
    '</div>' +
    '<!-- P1-B: Population selector row -->' +
    '<div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap;align-items:center;padding:10px 14px;background:rgba(255,255,255,0.03);border-radius:8px;border:1px solid rgba(255,255,255,0.07)">' +
      '<span class="text-xs text-muted" style="margin-right:2px">Population / nhóm dữ liệu:</span>' +
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
      '<button class="btn btn-sm ' + (analyticsView === 'attribution' ? 'btn-primary' : 'btn-outline') + '" onclick="switchAnalyticsView(\'attribution\')">Attribution</button>' +
      '<div style="flex:1"></div>' +
      '<button class="btn btn-sm btn-outline" onclick="refreshOutcomesManual()" id="btnRefreshOutcomes">🔄 Refresh Outcomes</button>' +
      '<button class="btn btn-sm btn-outline" onclick="reloadAnalytics()">♻ Reload</button>' +
    '</div>' +
    renderTruthBasisCard() +
    '<div id="analyticsContent">' + viewContent + '</div>' +
    renderAnalyticsQuickGuide(totalOutcomes) +
    '<div class="card mt-20" style="border-color:rgba(0,229,255,.2)"><div class="card-title">📘 Ghi chú về dữ liệu Analytics</div><div class="text-sm text-muted" style="line-height:1.7"><strong>14d Heatmap (Feedback Engine):</strong> Dữ liệu rolling 14 ngày dùng để phát hiện edge suy yếu và hỗ trợ auto-veto. Những gì bị veto ở đây sẽ không được đưa vào lệnh mới.<br><strong>Checkpoint snapshot evaluation:</strong> Evaluator kiểm tra giá tại các mốc D1/D3/D7/D14/D30 sau khi signal được tạo. Đây là snapshot tại từng checkpoint, không phải full price-path replay; vì vậy nó không chứng minh toàn bộ đường giá đã đi như thế nào giữa các mốc.<br><strong>🔬 v10 Era + Exec:</strong> Lọc riêng nhóm v10-era theo heuristic v1 (dựa vào prefix ID <code>sig-*</code> và các authority contract fields), rồi chỉ đo ROI trên nhóm execution-approved. Era filter vẫn là heuristic nên hãy xem kết quả là indicative, không phải certified.<br><strong>scanTruthBasis:</strong> Field debug để giải thích trạng thái scan như <code>no_actionable</code>, <code>execution_qualified</code>, hoặc <code>technical_qualified_capital_suppressed</code>. Đây không phải nguồn authority mới và không được dùng để tự nâng quyền trade.</div></div>';

}

function switchAnalyticsView(view) {
  analyticsView = view;
  renderAnalytics();
}

async function refreshOutcomesManual() {
  var btn = document.getElementById('btnRefreshOutcomes');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Đang đánh giá...'; }
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
    alert('Đã evaluate ' + result.evaluated + ' outcomes');
  } catch (err) {
    alert('Outcome evaluation lỗi: ' + err.message);
  }
  if (btn) { btn.disabled = false; btn.textContent = '🔄 Refresh Outcomes'; }
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
