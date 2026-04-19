/* ── Telegram Alert Engine v10.6.9.56 Moderate Telegram ───── */
window.AlertEngine = (() => {
  function getSignalDisplayStatus(signal) {
    return window.getExecutionDisplayStatus
      ? window.getExecutionDisplayStatus(signal)
      : String(signal?.displayStatus || signal?.finalAuthorityStatus || signal?.status || '').toUpperCase();
  }

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function pct(v) {
    return `${Math.round(Number(v || 0) * 100)}%`;
  }

  function fmt(v) {
    const n = Number(v || 0);
    if (!Number.isFinite(n)) return '0';
    if (Math.abs(n) >= 1000) return n.toFixed(2);
    if (Math.abs(n) >= 1) return n.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
    return n.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
  }

  function deriveRejectDisplayStatus(s) {
    if (typeof window.deriveBlockedActionStatus === 'function') return window.deriveBlockedActionStatus(s);
    const blockers = Array.isArray(s.authorityBlockers) ? s.authorityBlockers.join(' ') : String(s.authorityBlockers || '');
    const reason = String(s.authorityReason || s.reason || '').toLowerCase();
    const search = (blockers + ' ' + reason).toLowerCase();

    // Soft Rejects -> WATCH
    if (search.includes('watch') || search.includes('probe') || search.includes('stale') || search.includes('metadata') || search.includes('regime')) return 'WATCH';

    // Structural / Risk Rejects -> AVOID
    if (search.includes('gate') || search.includes('risk') || search.includes('pump') || search.includes('bubble') || search.includes('capital') || search.includes('sizing') || search.includes('hq_setup')) return 'AVOID';

    return 'WATCH'; // Default for technical rejection
  }

  function getPrimaryActionTruth(signal) {
    const displayStatus = getSignalDisplayStatus(signal);
    const authorityDecision = getAuthorityDecision(signal);
    if (authorityDecision === 'REJECT') return deriveRejectDisplayStatus(signal);
    return displayStatus || 'WATCH';
  }

  function isMaintainedSignal(signal) {
    if (typeof window.isMaintainedSignalState === 'function') return window.isMaintainedSignalState(signal);
    const source = String(signal?.authoritySource || '').toLowerCase();
    const reason = String(signal?.authorityReason || signal?.reason || '').toLowerCase();
    return source === 'portfolio_binding' || /^position_bound:|^dedup:/i.test(reason);
  }

  function summarizeReason(signal) {
    if (typeof window.summarizeActionReason === 'function') return window.summarizeActionReason(signal);
    return String(signal?.authorityReason || signal?.reason || 'No clear authority reason').trim();
  }

  function shouldShowTradeBlock(signal, statusOverride = '') {
    const merged = statusOverride ? { ...signal, displayStatus: statusOverride } : signal;
    if (typeof window.shouldExposeTradeLevels === 'function') return window.shouldExposeTradeLevels(merged);
    return false;
  }

  function getAuthorityDecision(signal) {
    return String(signal?.authorityDecision || signal?.decision || '').toUpperCase();
  }

  function getAuthorityReason(signal) {
    return String(signal?.authorityReason || signal?.reason || '').trim();
  }

  function getStructuralSetup(signal) {
    if (typeof window.getStructuralSetupLabel === 'function') return window.getStructuralSetupLabel(signal);
    return String(signal?.setup || signal?.structureTag || 'Unknown').trim() || 'Unknown';
  }

  function getEntryTrigger(signal) {
    if (typeof window.getEntryTriggerLabel === 'function') return window.getEntryTriggerLabel(signal);
    return String(signal?.entrySignal || signal?.entryTiming || 'wait').trim() || 'wait';
  }

  function isExecutionGatePassed(signal) {
    if (signal?.executionGatePassed === true) return true;
    const decision = getAuthorityDecision(signal);
    const displayStatus = getSignalDisplayStatus(signal);
    return ['ALLOW', 'WAIT'].includes(decision)
      && ['READY', 'PLAYABLE', 'PROBE'].includes(displayStatus);
  }

  function isExecutionActionable(signal) {
    if (signal?.executionActionable === true) return true;
    const decision = getAuthorityDecision(signal);
    const displayStatus = getSignalDisplayStatus(signal);
    return ['ALLOW', 'WAIT'].includes(decision)
      && ['READY', 'PLAYABLE', 'PROBE'].includes(displayStatus);
  }

  function isBlockedAuthorityReason(reason) {
    return /^dedup:/i.test(reason)
      || /^capital_guard:/i.test(reason)
      || /^pre_gate_blocked:/i.test(reason)
      || /^all_tiers_rejected$/i.test(reason)
      || /^no_execution_result$/i.test(reason);
  }

  function isAuthoritativeAlertCandidate(signal) {
    const displayStatus = getSignalDisplayStatus(signal);
    const authorityDecision = getAuthorityDecision(signal);
    const authorityReason = getAuthorityReason(signal);
    const executionTier = String(signal?.executionTier || '').toUpperCase();

    return ['READY', 'PLAYABLE', 'PROBE'].includes(displayStatus)
      && ['ALLOW', 'WAIT'].includes(authorityDecision)
      && isExecutionGatePassed(signal)
      && isExecutionActionable(signal)
      && executionTier !== 'OBSERVE'
      && !isBlockedAuthorityReason(authorityReason);
  }

  function levelFor(signal, cfg) {
    // v10.6.9.50-AbsoluteSync: Mirror dashboard's display status
    // v10.6.9.51: Absolute Mirror
    const status = getSignalDisplayStatus(signal);
    const rr = Number(signal?.rr || 0);
    const conf = Number(signal?.executionConfidence || 0);

    if (status === 'READY' && conf >= 0.82 && rr >= 3.0) return 'READY_STRONG';
    if (status === 'READY') return 'READY';
    if (status === 'PLAYABLE') return 'PLAYABLE';
    if (status === 'PROBE') return 'PROBE';
    return '';
  }

  function shouldAlert(signal, cfg) {
    if (!signal) return false;
    const st = getPrimaryActionTruth(signal);
    if (['AVOID', 'REJECTED', 'FETCH_FAIL', 'WATCH'].includes(st)) return false;
    if (!isAuthoritativeAlertCandidate(signal)) return false;
    if (String(signal.fakePumpRisk || '').toLowerCase() === 'high') return false;
    if (isMaintainedSignal(signal)) return false;
    return !!levelFor(signal, cfg);
  }

  function messageFor(signal, cfg, meta = {}) {
    const level = levelFor(signal, cfg);
    const st = getPrimaryActionTruth(signal);
    const isRisk = ['NO_TRADE', 'FAKE_PUMP_BLOCKED', 'RISK_BLOCKED', 'RISK_BLOCKED_LOW', 'RISK_BLOCKED_MEDIUM', 'RISK_BLOCKED_HIGH'].includes(st);
    const isExec = (signal.authorityDecision || signal.decision || '').toUpperCase().includes('ALLOW') || (signal.authorityDecision || signal.decision || '').toUpperCase().includes('TRADE');
    const isStrong = level === 'READY_STRONG';
    const isRejected = (signal.authorityDecision || signal.decision || '').toUpperCase() === 'REJECT';

    let emoji = '👀';
    if (isRisk) {
      if (st.includes('HIGH')) emoji = '🛑';
      else if (st.includes('MEDIUM')) emoji = '⚠️';
      else emoji = '🛡️';
    }
    else if (isExec) emoji = '✅';
    else if ((signal.authorityDecision || signal.decision || '').toUpperCase() === 'REJECT') emoji = '❌';
    else if (isStrong) emoji = '🏆';
    else if (level === 'READY') emoji = '🚨';
    else if (level === 'PLAYABLE') emoji = '🔷';
    else if (level === 'SCALP') emoji = '⚡';

    const strategic = window.ST?.strategic;
    const rainbow = strategic?.rainbow;
    const valuationText = rainbow ? `${rainbow.label} (${strategic.riskMultiplier.toFixed(2)}x)` : 'n/a';
    const rainbowEmoji = strategic?.riskMultiplier > 1 ? '🌈🚀' : strategic?.riskMultiplier < 1 ? '🌈⚠️' : '🌈⚖️';

    const technicalTier = String(signal.finalAuthorityStatus || signal.executionTier || '').toUpperCase();
    const decision = String(signal.authorityDecision || signal.decision || level || 'MONITOR').toUpperCase();
    const reasoning = summarizeReason(signal);
    const showTradeBlock = shouldShowTradeBlock(signal, st);

    const lines = [
      `${emoji} <b>${esc(signal.symbol)}</b> — ${esc(st)}`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `📊 Setup: <b>${esc(getStructuralSetup(signal))}</b>`,
      `🧭 BTC: <b>${meta.btcContext || 'n/a'}</b> | ${rainbowEmoji} <b>${esc(valuationText)}</b>`,
      `📈 RR: <b>${fmt(signal.rr)}x</b> | Conf: <b>${pct(signal.executionConfidence)}</b>`
    ];

    lines.push(`🎯 Trigger: <b>${esc(getEntryTrigger(signal))}</b>`);
    if (technicalTier && technicalTier !== st && technicalTier !== 'WATCH') {
      lines.push(`🧱 Technical Tier: <b>${esc(technicalTier)}</b>`);
    }
    if (isMaintainedSignal(signal)) {
      lines.push(`🔒 State: <b>Maintained / already tracked</b>`);
    }

    if (st === 'PROBE') {
      lines.push(`👁 Watch: <b>${esc(signal.entryTiming || signal.signalEntryTiming || 'confirm trigger')}</b> | Price <code>${fmt(signal.price || signal.entry || signal.priceAtSignal || 0)}</code>`);
    }

    if (showTradeBlock) {
      lines.push(`🎯 Entry: <code>${fmt(signal.entry || signal.priceAtSignal)}</code>`);
      lines.push(`🛑 Stop: <code>${fmt(signal.stop)}</code>`);
      lines.push(`💰 TP1: <code>${fmt(signal.tp1)}</code>`);
    }

    lines.push(`━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`🧠 Reason: <i>${esc(reasoning)}</i>`);
    lines.push(`🏁 <b>Decision: ${esc(decision)}</b>`);
    lines.push(``);
    lines.push(`#SystemTrader #PriorityAlert`);
    return lines.join('\n');
  }

  function rankSignals(signals, meta = {}) {
    const isBull = (meta.btcContext || '').toLowerCase().includes('bull');
    return [...signals].sort((a, b) => {
      const score = (s) => {
      const rr = Number(s.rr || 0);
      const conf = Number(s.executionConfidence || 0);
      const st = getPrimaryActionTruth(s);
      const decision = String(s.authorityDecision || s.decision || '').toUpperCase();
      let val = (rr * 0.55) + (conf * 5.5);
      if (st === 'READY') val += 9;
      else if (st === 'PLAYABLE') val += 6;
      else if (st === 'PROBE') val += 3;

        if (decision === 'TRADE') val += 3;
        else if (decision === 'ALLOW') val += 1;
        else if (decision === 'REJECT') val -= 100; // Absolute disqualification from Top mascots

        if (isBull && s.trend === 'up') val += 1;
        return val;
      };
      return score(b) - score(a);
    });
  }

  function summaryMessageFor(signals, cfg, meta = {}) {
    const btc = esc(meta.btcContext || 'n/a');
    const btcEmoji = btc.toLowerCase().includes('bull') ? '🟢' : btc.toLowerCase().includes('bear') ? '🔴' : '🟡';

    const strategic = window.ST?.strategic;
    const rainbow = strategic?.rainbow;
    const fng = strategic?.fng;
    const dom = strategic?.dominance;

    const valuationText = rainbow ? `${rainbow.label} (${strategic.riskMultiplier.toFixed(2)}x)` : 'n/a';
    const rainbowEmoji = strategic?.riskMultiplier > 1 ? '🚀' : strategic?.riskMultiplier < 1 ? '⚠️' : '⚖️';
    const fngText = fng ? `Sentiment: ${fng.label} (${fng.value})` : '';
    const domText = dom ? `Dominance: ${dom.value.toFixed(1)}%` : '';

    const ranked = rankSignals(signals, meta);
    const stats = meta.sessionStats || { scanned: 0, blocked: 0, active: 0 };

    // Mascot logic: Only mascot authorized non-reject signals if possible (v10.6.9.52 Hardening)
    const mascot = ranked.find(s => {
      const decision = (s.authorityDecision || s.decision || '').toUpperCase();
      const displayStatus = getPrimaryActionTruth(s);
      return !decision.includes('REJECT') && !['WATCH', 'AVOID', 'OBSERVE'].includes(displayStatus);
    }) || ranked[0] || {};
    const mascotSymbol = mascot.symbol || 'N/A';
    const isMascotRejected = (mascot.authorityDecision || mascot.decision || '').toUpperCase().includes('REJECT');
    const mascotWarning = isMascotRejected ? ' (HOLD)' : '';

    const lines = [
      `📡 <b>SystemTrader v10.6.9 — Market Scan Report</b>`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `🧭 BTC Context: ${btcEmoji} <b>${btc}</b>`,
      `🌈 Strategic: ${rainbowEmoji} <b>${esc(valuationText)}</b>`,
      `📊 ${esc(fngText)} | ${esc(domText)}`,
      `🏆 Top Opportunity: <b>${esc(mascotSymbol)}${mascotWarning}</b>`,
      ``
    ];

    ranked.forEach((s, idx) => {
      const level = levelFor(s, cfg);
      let displayStatus = getPrimaryActionTruth(s);

      const isRejected = (s.authorityDecision || s.decision || '').toUpperCase().includes('REJECT');
      const emoji = isRejected ? '👀' : (idx === 0 ? '🏆' : (level === 'READY_STRONG' ? '🏆' : (level === 'READY' ? '🚨' : (level === 'SCALP' ? '⚡' : '👀'))));
      const visualEmoji = isRejected ? '👀' : (idx === 0 ? '🏆' : (level === 'READY_STRONG' ? '🏆' : (level === 'READY' ? '🚨' : (level === 'PLAYABLE' ? '🔷' : (level === 'SCALP' ? '⚡' : '🟡')))));

      const technicalTier = (s.finalAuthorityStatus || level || 'WATCH').toUpperCase();
      let decisionBase = (s.authorityDecision || s.decision || (level || 'MONITOR')).toUpperCase();
      const showTradeBlock = shouldShowTradeBlock(s, displayStatus);

      lines.push(`${idx + 1}. ${visualEmoji} <b>${esc(s.symbol)}</b> — ${esc(displayStatus)}`);
      if (technicalTier !== displayStatus && technicalTier !== 'WATCH') {
        lines.push(`   • Technical Tier: <b>${esc(technicalTier)}</b>`);
      }
      if (isMaintainedSignal(s)) {
        lines.push(`   • State: <b>Maintained / already tracked</b>`);
      }
      lines.push(`   • RR: <b>${fmt(s.rr)}x</b> | Conf: <b>${pct(s.executionConfidence)}</b>`);

      if (displayStatus === 'PROBE') {
        lines.push(`   • Watch For: <b>${esc(s.entryTiming || s.signalEntryTiming || 'confirm trigger')}</b> | Price: <code>${fmt(s.price || s.entry || s.priceAtSignal || 0)}</code>`);
      }

      if (showTradeBlock) {
        lines.push(`   • Entry: <code>${fmt(s.entry || s.priceAtSignal)}</code>`);
        lines.push(`   • Stop: <code>${fmt(s.stop)}</code>`);
        lines.push(`   • TP1: <code>${fmt(s.tp1)}</code>`);
      }

      lines.push(`   • Decision: <b>${esc(decisionBase.includes('REJECT') ? 'REJECT' : decisionBase)}</b>`);
      lines.push(`   • Reason: <i>${esc(summarizeReason(s))}</i>`);
      if (idx < ranked.length - 1) lines.push(``);
    });

    lines.push(`━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`⏱ <b>Session Snapshot</b>`);
    lines.push(`• Assets Scanned: <b>${stats.scanned}</b>`);
    lines.push(`• Risk Blocks: <b>${stats.blocked}</b>`);
    lines.push(`• Active Setups: <b>${stats.active}</b>`);
    lines.push(``);
    lines.push(`#SystemTrader #ScannerReport`);
    return lines.join('\n');
  }

  function trace(label, payload) {
    try {
      console.log(`[ALERT TRACE] ${label}`, payload);
      window.__LAST_ALERT_TRACE_ENGINE__ = {
        ...(window.__LAST_ALERT_TRACE_ENGINE__ || {}),
        [label]: payload,
        updatedAt: Date.now()
      };
    } catch (_) { }
  }

  async function processSignals(signals, meta = {}) {
    if (!window.Telegram) { trace('telegram_unavailable', { meta }); return { sent: 0, skipped: 0, reason: 'telegram_unavailable' }; }
    const cfg = window.Telegram.getConfig();
    const all = Array.isArray(signals) ? signals : [signals];
    if (!cfg.enabled) { trace('disabled', { cfg, count: all.length }); return { sent: 0, skipped: all.length, reason: 'disabled' }; }
    if (!window.Telegram.isConfigured()) { trace('not_configured', { cfg, count: all.length }); return { sent: 0, skipped: all.length, reason: 'not_configured' }; }

    const regime = String(meta.btcContext || 'n/a').toLowerCase();
    const antiSpam = window.Telegram.getAntiSpamState();
    const now = Date.now();
    trace('process_start', {
      meta,
      antiSpam,
      signals: all.map(s => ({
        symbol: s?.symbol,
        finalAuthorityStatus: String(s?.finalAuthorityStatus || s?.status || '').toUpperCase(),
        authorityDecision: String(s?.authorityDecision || s?.decision || '').toUpperCase(),
        rr: Number(s?.rr || 0),
        conf: Number(s?.executionConfidence || 0),
        blockers: Array.isArray(s?.authorityBlockers) ? s.authorityBlockers : [],
        executionGatePassed: isExecutionGatePassed(s),
        executionActionable: isExecutionActionable(s),
        executionTier: String(s?.executionTier || '').toUpperCase()
      }))
    });

    const filtered = all.filter(s => shouldAlert(s, cfg)).filter(s => {
      const st = getPrimaryActionTruth(s);
      const rr = Number(s?.rr || 0);
      const conf = Number(s?.executionConfidence || 0);
      const setup = String(s?.setup || s?.structureTag || '').toLowerCase();
      const hasTrigger = !!(s?.authorityTrace?.triggerMatched);
      const bullChopProbe = st === 'PROBE'
        && String(meta?.btcContext || '').toLowerCase() === 'bull'
        && String(meta?.regimeType || '').toUpperCase() === 'CHOP'
        && hasTrigger
        && setup
        && setup !== 'unclear';
      if (st === 'READY') return true;
      if (st === 'PLAYABLE') return rr >= 1.4 && conf >= 0.58;
      if (bullChopProbe) return rr >= 1.05 && conf >= 0.50;
      if (st === 'PROBE') return rr >= 1.2 && conf >= 0.50;
      return rr >= 1.4 && conf >= 0.58;
    });

    trace('filtered_candidates', filtered.map(s => ({
        symbol: s?.symbol,
        finalAuthorityStatus: getPrimaryActionTruth(s),
        authorityDecision: String(s?.authorityDecision || s?.decision || '').toUpperCase(),
        rr: Number(s?.rr || 0),
        conf: Number(s?.executionConfidence || 0)
    })));

    if (!filtered.length) {
      const debug = all.map(s => ({
        symbol: s?.symbol,
        status: getPrimaryActionTruth(s),
        authorityDecision: getAuthorityDecision(s),
        executionGatePassed: isExecutionGatePassed(s),
        executionActionable: isExecutionActionable(s),
        executionTier: String(s?.executionTier || '').toUpperCase(),
        rr: Number(s?.rr || 0),
        conf: Number(s?.executionConfidence || 0),
        reason: (() => {
          const st = getPrimaryActionTruth(s);
          if (!['ALLOW', 'WAIT'].includes(getAuthorityDecision(s))) return 'authority_not_actionable';
          if (!isExecutionGatePassed(s)) return 'execution_gate_false';
          if (!isExecutionActionable(s)) return 'execution_not_actionable';
          if (isMaintainedSignal(s)) return 'maintained_state';
          if (String(s?.executionTier || '').toUpperCase() === 'OBSERVE') return 'observe_tier';
          if (String(s?.fakePumpRisk || '').toLowerCase() === 'high') return 'fake_pump_high';
          if (st === 'PLAYABLE' && !(Number(s?.rr || 0) >= 1.6 && Number(s?.executionConfidence || 0) >= 0.60)) return 'below_playable_rr_conf';
          if (st === 'PROBE' && String(meta?.btcContext || '').toLowerCase() === 'bull' && String(meta?.regimeType || '').toUpperCase() === 'CHOP' && !!(s?.authorityTrace?.triggerMatched)) {
            return 'below_bull_chop_probe_rr_conf';
          }
          if (st === 'PROBE' && regime.includes('sideway')) return 'suppressed_probe_sideway';
          return 'below_threshold';
        })()
      }));
      trace('no_meaningful_alert', { debug, meta, antiSpam });
      return { sent: 0, skipped: all.length, reason: 'no_meaningful_alert', debug };
    }

    const authoritative = filtered.filter(isAuthoritativeAlertCandidate);
    if (!authoritative.length) {
      trace('no_authoritative_alert', {
        filtered: filtered.map(s => ({
          symbol: s?.symbol,
          finalAuthorityStatus: getPrimaryActionTruth(s),
          authorityDecision: getAuthorityDecision(s),
          authorityReason: getAuthorityReason(s),
          executionGatePassed: s?.executionGatePassed === true,
          executionActionable: s?.executionActionable === true,
          executionTier: String(s?.executionTier || '').toUpperCase()
        })),
        meta,
        antiSpam
      });
      return { sent: 0, skipped: all.length, reason: 'no_authoritative_alert' };
    }

    const ranked = rankSignals(authoritative, meta).slice(0, 2);
    const signature = ranked.map(s => `${s.symbol}:${getPrimaryActionTruth(s)}:${Math.round(Number(s.rr || 0) * 10) / 10}`).join('|');
    const top1 = ranked[0];
    const prevTop1 = String((antiSpam.lastSignature || '').split('|')[0] || '');
    const topChanged = !!top1 && prevTop1 !== `${top1.symbol}:${getPrimaryActionTruth(top1)}:${Math.round(Number(top1.rr || 0) * 10) / 10}`;
    const isRegimeChange = regime !== String(antiSpam.lastRegime || '').toLowerCase();

    let upgradeDetected = false;
    let perSymbolBlocked = 0;
    for (const s of ranked) {
      const actionTruth = getPrimaryActionTruth(s);
      const key = `signal:${s.symbol}`;
      if (window.Telegram.hasSent?.(key, s)) {
        perSymbolBlocked++;
        continue;
      }
      if (['READY', 'PLAYABLE', 'PROBE'].includes(actionTruth)) upgradeDetected = true;
    }

    const regimeType = String(meta.regimeType || 'CHOP').toUpperCase();
    let globalCooldownMs = 45 * 60 * 1000;
    if (['BREAKOUT', 'TRENDING'].includes(regimeType)) globalCooldownMs = 15 * 60 * 1000;
    else if (['CHOP', 'FAKE_PUMP', 'DISTRIBUTION'].includes(regimeType)) globalCooldownMs = 60 * 60 * 1000;
    else if (regimeType === 'ACCUMULATION') globalCooldownMs = 30 * 60 * 1000;

    const cooldownActive = (now - Number(antiSpam.lastSentTime || 0)) < globalCooldownMs;
    const isDuplicate = signature === antiSpam.lastSignature;

    let shouldSend = false;
    let reason = 'suppressed';
    if (isRegimeChange) {
      shouldSend = true;
      reason = 'regime_change';
    } else if (topChanged) {
      shouldSend = true;
      reason = 'top1_changed';
    } else if (upgradeDetected && !cooldownActive) {
      shouldSend = true;
      reason = 'authority_upgrade';
    } else if (!isDuplicate && !cooldownActive && ranked.some(s => {
      const st = getPrimaryActionTruth(s);
      const rr = Number(s.rr || 0);
      const conf = Number(s.executionConfidence || 0);
      if (st === 'READY') return true;
      if (st === 'PLAYABLE') return rr >= 1.4 && conf >= 0.58;
      return rr >= 1.2 && conf >= 0.50;
    })) {
      shouldSend = true;
      reason = 'new_high_quality_signal';
    }

    if (!shouldSend) {
      const suppressReason = cooldownActive ? 'global_cooldown' : (isDuplicate ? 'duplicate_signature' : 'no_material_change');
      trace('suppressed', { suppressReason, perSymbolBlocked, antiSpam, signature, ranked: ranked.map(s => ({ symbol: s.symbol, st: getPrimaryActionTruth(s), rr: Number(s.rr || 0), conf: Number(s.executionConfidence || 0) })) });
      return { sent: 0, skipped: all.length, reason: suppressReason, perSymbolBlocked };
    }

    try {
      const summary = summaryMessageFor(ranked, cfg, meta);
      trace('send_attempt', { reason, signature, ranked: ranked.map(s => ({ symbol: s.symbol, st: getPrimaryActionTruth(s), rr: Number(s.rr || 0), conf: Number(s.executionConfidence || 0) })), summaryPreview: summary.slice(0, 500) });
      await window.Telegram.send(summary);
      for (const s of ranked) {
        await window.Telegram.markSent?.(`signal:${s.symbol}`, s);
      }
      antiSpam.lastSentTime = now;
      antiSpam.lastSignature = signature;
      antiSpam.lastRegime = regime;
      await window.Telegram.updateAntiSpamState?.(antiSpam);
      const displayStatus = ranked[0] ? getPrimaryActionTruth(ranked[0]) : 'WATCH';
      trace('send_success', { reason, perSymbolBlocked, signature, displayStatus });
      return { sent: 1, skipped: Math.max(0, all.length - ranked.length), reason, perSymbolBlocked, displayStatus };
    } catch (err) {
      console.warn('[Telegram] Send failed:', err);
      trace('send_failed', { error: String(err?.message || err), reason, signature });
      return { sent: 0, skipped: all.length, error: err, reason: 'send_failed' };
    }
  }

  return {
    shouldAlert,
    processSignals,
    messageFor,
    summaryMessageFor,
    rankSignals,
    getPrimaryActionTruth,
    isMaintainedSignal,
    summarizeReason,
    shouldShowTradeBlock
  };
})();
