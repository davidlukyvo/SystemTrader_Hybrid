window.RUNTIME_AUDIT = (() => {
  'use strict';

  function upper(v) {
    return String(v || '').toUpperCase().trim();
  }

  function toNum(v, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function getAlertTraceEngine() {
    return window.__LAST_ALERT_TRACE_ENGINE__ || null;
  }

  function getAlertTrace() {
    return window.__LAST_ALERT_TRACE__ || null;
  }

  function getExecutionTrace() {
    return window.__LAST_EXECUTION_TRACE__ || null;
  }

  function getSignalsFromTrace(trace) {
    const processStart = trace?.process_start;
    if (Array.isArray(processStart?.signals)) return processStart.signals;
    const noMeaningful = trace?.no_meaningful_alert;
    if (Array.isArray(noMeaningful?.debug)) {
      return noMeaningful.debug.map((row) => ({
        symbol: row?.symbol,
        rr: row?.rr,
        conf: row?.conf,
        blockers: row?.reason ? [String(row.reason)] : [],
        finalAuthorityStatus: row?.status,
        authorityDecision: row?.authorityDecision,
        executionTier: row?.executionTier,
        executionGatePassed: row?.executionGatePassed,
        executionActionable: row?.executionActionable,
      }));
    }
    return [];
  }

  function getSignalRowsFromUiTrace(trace) {
    if (Array.isArray(trace?.signals)) return trace.signals;
    return [];
  }

  function bucketSignal(signal = {}) {
    const blockers = Array.isArray(signal.blockers) ? signal.blockers.map(x => String(x || '')) : [];
    const joined = blockers.join(' | ').toLowerCase();
    if (joined.includes('capital_guard:') || joined.includes('loss_streak_guard_') || joined.includes('cooldown_active_') || joined.includes('exposure_cap_')) {
      return 'capital_blocked';
    }
    if (joined.includes('pre_gate_blocked:')) return 'pre_gate_blocked';
    if (joined.includes('all_tiers_rejected') || joined.includes('[probe]') || joined.includes('playable_path_failed')) {
      return 'gate_quality_blocked';
    }
    if (!blockers.length) return 'no_blocker_recorded';
    return 'other_blocked';
  }

  function summarizeSignals(signals = [], uiSignals = []) {
    const counts = {
      total: signals.length,
      capital_blocked: 0,
      pre_gate_blocked: 0,
      gate_quality_blocked: 0,
      other_blocked: 0,
      no_blocker_recorded: 0,
    };
    const blockerCounts = {};
    const metrics = {
      conf_eq_050: 0,
      rr_lt_065: 0,
      rr_lt_095: 0,
      rr_lt_120: 0,
      score_lt_12: 0,
      score_lt_18: 0,
      setup_unclear: 0,
      trigger_wait: 0,
    };

    const uiBySymbol = new Map(
      uiSignals
        .filter(Boolean)
        .map(s => [upper(s.symbol), s])
    );

    signals.forEach((signal) => {
      const bucket = bucketSignal(signal);
      counts[bucket] = (counts[bucket] || 0) + 1;

      const blockers = Array.isArray(signal.blockers) ? signal.blockers : [];
      blockers.forEach((reason) => {
        const key = String(reason || '').trim() || 'unknown';
        blockerCounts[key] = (blockerCounts[key] || 0) + 1;
      });

      const rr = toNum(signal.rr, NaN);
      const conf = toNum(signal.conf, NaN);
      if (conf === 0.5) metrics.conf_eq_050 += 1;
      if (!Number.isNaN(rr) && rr < 0.65) metrics.rr_lt_065 += 1;
      if (!Number.isNaN(rr) && rr < 0.95) metrics.rr_lt_095 += 1;
      if (!Number.isNaN(rr) && rr < 1.2) metrics.rr_lt_120 += 1;

      const uiSignal = uiBySymbol.get(upper(signal.symbol)) || {};
      const score = toNum(uiSignal.score, NaN);
      const setup = String(uiSignal.setup || '').toLowerCase();
      const entrySignal = String(uiSignal.entrySignal || '').toLowerCase();

      if (!Number.isNaN(score) && score < 12) metrics.score_lt_12 += 1;
      if (!Number.isNaN(score) && score < 18) metrics.score_lt_18 += 1;
      if (setup === 'unclear') metrics.setup_unclear += 1;
      if (entrySignal === 'wait') metrics.trigger_wait += 1;
    });

    const blockerRanking = Object.entries(blockerCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([reason, count]) => ({ reason, count }));

    return { counts, blockerRanking, metrics };
  }

  function summarizeExecutionTrace(execTrace = getExecutionTrace()) {
    const payload = execTrace?.payload || {};
    const result = payload.result || {};
    const rejectionSummary = result.authorityTrace?.rejectionSummary || null;
    return {
      id: execTrace?.id || null,
      label: execTrace?.label || null,
      symbol: payload.symbol || payload.signal?.symbol || null,
      reason: result.reason || null,
      primaryRejections: Array.isArray(rejectionSummary?.primary) ? rejectionSummary.primary : [],
      byTier: rejectionSummary?.byTier || {},
      signal: payload.signal || {},
    };
  }

  function toShortSummary(summary = summarizeLatest()) {
    if (!summary) return '';

    const counts = summary.counts || {};
    const metrics = summary.populationMetrics || {};
    const exec = summary.executionTrace || {};
    const topBlockers = Array.isArray(summary.blockerRanking) ? summary.blockerRanking.slice(0, 3) : [];
    const meta = summary.meta || {};
    const parts = [];

    parts.push(`Runtime Audit (${String(meta.btcContext || 'unknown')}/${String(meta.regimeType || 'unknown')})`);
    parts.push(`- Total: ${counts.total || 0} | Capital: ${counts.capital_blocked || 0} | Pre-gate: ${counts.pre_gate_blocked || 0} | Gate-quality: ${counts.gate_quality_blocked || 0}`);
    parts.push(`- Population: conf=0.50 ${metrics.conf_eq_050 || 0}, rr<1.20 ${metrics.rr_lt_120 || 0}, score<18 ${metrics.score_lt_18 || 0}, setup unclear ${metrics.setup_unclear || 0}, trigger wait ${metrics.trigger_wait || 0}`);

    if (topBlockers.length) {
      parts.push(`- Top blockers: ${topBlockers.map(item => `${item.reason} (${item.count})`).join(' | ')}`);
    }

    if (exec.symbol) {
      parts.push(`- Latest trace: ${exec.symbol} -> ${exec.reason || 'n/a'} | rr ${toNum(exec.signal?.rr).toFixed(2)} | score ${toNum(exec.signal?.score)} | conf ${toNum(exec.signal?.conf).toFixed(2)} | setup ${String(exec.signal?.setup || 'n/a')}`);
    }

    if (!counts.total) {
      parts.push('- Read: aggregate blocker counts are unavailable for this snapshot; rely on executionTrace and raw console traces for diagnosis.');
      parts.push('- Decision: do not infer dominant blocker from this summary alone.');
      return parts.join('\n');
    }

    const capital = counts.capital_blocked || 0;
    const preGate = counts.pre_gate_blocked || 0;
    const gateQuality = counts.gate_quality_blocked || 0;
    if (capital >= preGate && capital >= gateQuality) {
      parts.push('- Read: batch is still dominated by capital blocking, not by a narrow PROBE threshold issue.');
      parts.push('- Decision: keep engine unchanged and observe more scans before any tuning.');
    } else if (preGate >= capital && preGate >= gateQuality) {
      parts.push('- Read: batch is still dominated by pre-gate weakness before candidates reach a clean PROBE lane.');
      parts.push('- Decision: keep engine unchanged and wait for a cleaner population before tuning.');
    } else {
      parts.push('- Read: batch is mostly reaching the gate layer, so blocker details are worth watching closely.');
      parts.push('- Decision: inspect repeated gate-quality patterns before considering any narrow adjustment.');
    }

    return parts.join('\n');
  }

  function summarizeLatest({
    alertTraceEngine = getAlertTraceEngine(),
    alertTrace = getAlertTrace(),
    executionTrace = getExecutionTrace(),
  } = {}) {
    const processStart = alertTraceEngine?.process_start || {};
    const signals = getSignalsFromTrace(alertTraceEngine);
    const uiSignals = getSignalRowsFromUiTrace(alertTrace);
    const signalSummary = summarizeSignals(signals, uiSignals);
    const filteredCandidates = Array.isArray(alertTraceEngine?.filtered_candidates) ? alertTraceEngine.filtered_candidates : [];
    const noMeaningful = alertTraceEngine?.no_meaningful_alert || null;

    return {
      updatedAt: alertTraceEngine?.updatedAt || alertTrace?.at || Date.now(),
      meta: processStart.meta || alertTrace?.meta || {},
      antiSpam: processStart.antiSpam || noMeaningful?.antiSpam || {},
      signalCountSource: signals.length ? (Array.isArray(processStart?.signals) ? 'process_start.signals' : 'no_meaningful_alert.debug') : 'none',
      counts: signalSummary.counts,
      blockerRanking: signalSummary.blockerRanking,
      populationMetrics: signalSummary.metrics,
      filteredCandidates,
      executionTrace: summarizeExecutionTrace(executionTrace),
    };
  }

  function printLatest(options = {}) {
    const summary = summarizeLatest(options);
    try {
      console.groupCollapsed?.('[RUNTIME AUDIT] Summary');
      console.log(summary);
      if (Array.isArray(summary.blockerRanking) && summary.blockerRanking.length) {
        console.table?.(summary.blockerRanking);
      }
      console.groupEnd?.();
    } catch (_) {}
    window.__LAST_RUNTIME_AUDIT__ = summary;
    return summary;
  }

  return {
    summarizeLatest,
    summarizeExecutionTrace,
    toShortSummary,
    printLatest,
  };
})();
