/* ══════════════════════════════════════════════════════════════════════════
   EXECUTION ENGINE v9.2 — Capital-Protection Hardening Patch
   VERSION: v9.2.1 (v8790_EXECUTION_ENGINE_V9)
   ──────────────────────────────────────────────────────────────────────────
   PATCH NOTES (v9.1.0 → v9.2.0):
     1. EXECUTION tier renamed to READY (logic + constants + DB fields)
     2. ARMED/PENDING lifecycle enforced — all gate-passed new-paper signals start ARMED
     3. Timing fields separated: signalEntryTiming (scanner) ≠ positionState
     4. Portfolio risk display: portfolioBeforeRiskPct / newRiskPct / portfolioAfterRiskPct
     5. Sizing transparency: rawAllocationPct / clampedAllocationPct / effectiveRiskPct
     6. Trigger whitelist: strict set — no implicit trigger detection from entryTiming
     7. Portfolio veto: fail-closed when context is null/missing
     8. mode: AUTO_PAPER + userConfirmed: false enforced on all positions
     9. Outcomes checkpoint engine: evaluateCheckpoints(positions, priceMap)
    10. Global NO_TRADE regime: blocks all new gate-passes when active

   LAWS (non-negotiable):
     1. Scanner has NO capital authority. Ever.
     2. ONE gate. ALL conditions AND logic. No OR fallbacks.
     3. Portfolio veto fails CLOSED if context is absent.
     4. Size = riskBudget / stopDistancePct — real distance only.
     5. Every gate-passed signal that opens a new paper position → AUTO_PAPER position, state = ARMED.
     6. Every position has a hard expiry. STALE → EXPIRED, never promoted.
     7. SignalId dedup — same signal cannot create two positions.
     8. NO_TRADE regime blocks all new gate-passes unconditionally.
   ══════════════════════════════════════════════════════════════════════════ */

window.EXECUTION_ENGINE_V9 = (() => {
  'use strict';

  /* ── Version & Mode ─────────────────────────────────────────────────── */

  const VERSION = 'v10.6.9.56-ModerateTelegram';
  console.log("%c>>> ALPHA GUARD v10.6.9.56-ModerateTelegram LOADED <<<", "color: #00ff00; font-weight: bold; font-size: 14px;");
  const PAPER_MODE = 'AUTO_PAPER';

  /** 
   * v10.6.9.51: Absolute Parity Debug Fixture 
   * Allows forcing a controlled downgrade to validate system-wide consistency.
   */
  window.DEBUG_PARITY_CONFIG = {
    enabled: false,
    symbol: 'ENJ', 
    technicalTier: 'READY',
    displayStatus: 'WATCH'
  };

  /* ── SignalState ────────────────────────────────────────────────────── */

  /** Output of scanner. Read-only after emission. */
  const SIGNAL_STATE = Object.freeze({
    WATCH: 'WATCH',      // not eligible
    CANDIDATE: 'CANDIDATE',  // qualifies for gate
    STALE: 'STALE',      // expired before gate
  });

  /* ── ExecutionTier ──────────────────────────────────────────────────── */

  /**
   * Capital authority tiers — assigned by this engine ONLY.
   * EXECUTION renamed to READY (patch req #1).
   * OBSERVE = zero capital at all times.
   */
  const EXEC_TIER = Object.freeze({
    OBSERVE: 'OBSERVE',   // no capital
    PROBE: 'PROBE',     // 1% portfolio risk
    PLAYABLE: 'PLAYABLE',  // 2% portfolio risk
    READY: 'READY',     // 3.5% portfolio risk + confirmed trigger (was EXECUTION)
  });

  /* ── PositionState ──────────────────────────────────────────────────── */

  /**
   * ARMED   = gate-passed this cycle and materialized as a new paper position, awaiting next scan to confirm.
   * PENDING = confirmed across ≥2 cycles, entry price still valid.
   * (patch req #2: lifecycle enforced — all new positions start ARMED)
   */
  const POS_STATE = Object.freeze({
    ARMED: 'ARMED',
    PENDING: 'PENDING',
    ACTIVE: 'ACTIVE',
    PARTIAL_EXIT: 'PARTIAL_EXIT',
    CLOSED_WIN: 'CLOSED_WIN',
    CLOSED_LOSS: 'CLOSED_LOSS',
    TIMED_OUT_EXIT: 'TIMED_OUT_EXIT',
    INVALIDATED: 'INVALIDATED',
    REJECTED_STATE: 'REJECTED_STATE', // Alpha Guard: logic/flow error
  });

  /* ── Open state set (used throughout) ──────────────────────────────── */
  const OPEN_STATES = new Set([POS_STATE.ARMED, POS_STATE.PENDING, POS_STATE.ACTIVE, POS_STATE.PARTIAL_EXIT]);
  const CLOSED_STATES = new Set([POS_STATE.CLOSED_WIN, POS_STATE.CLOSED_LOSS, POS_STATE.EXPIRED, POS_STATE.INVALIDATED]);

  /* ── Strict Trigger Whitelist (patch req #6) ─────────────────────── */

  /**
   * Only these exact entrySignal values count as a confirmed trigger.
   * entryTiming strings (e.g. 'active', 'confirm') are scanner hints — NOT triggers.
   * hasTrigger = VALID_TRIGGERS.has(signal.entrySignal) ONLY.
   */
  const normalizeTrigger = (v) => String(v || '').trim().toLowerCase();

  function authorityBlockersFrom(reason, rejections = []) {
    const out = [];
    const push = (v) => { if (v && !out.includes(v)) out.push(v); };
    (Array.isArray(rejections) ? rejections : []).forEach(push);
    const reasonStr = String(reason || '').trim();
    if (reasonStr) push(reasonStr);
    return out;
  }

  function authorityDecisionFrom(tier, pass) {
    if (!pass) return 'REJECT';
    return String(tier || '').toUpperCase() === EXEC_TIER.PROBE ? 'WAIT' : 'ALLOW';
  }

  function buildAuthorityMeta({ tier, pass, reason, rejections = [], authorityTrace = null, displayStatus = null, source = 'EXECUTION_ENGINE_V9' }) {
    const authorityTier = pass
      ? (['READY', 'PLAYABLE', 'PROBE'].includes(String(tier || '').toUpperCase()) ? String(tier || '').toUpperCase() : 'WATCH')
      : 'REJECT';

    // v10.6.9.51: Absolute Contract fulfillment
    const finalAuthorityStatus = authorityTier === 'REJECT' ? 'WATCH' : authorityTier;
    const uiTruth = displayStatus ? String(displayStatus).toUpperCase() : finalAuthorityStatus;

    const finalTrace = authorityTrace || {
      entrySignal: 'none',
      triggerMatched: false,
      rejectionsByTier: { READY: [], PLAYABLE: [], PROBE: [] }
    };
    const blockers = authorityBlockersFrom(reason, rejections);
    return {
      authorityTier,
      authorityDecision: authorityDecisionFrom(authorityTier, pass),
      authorityReason: reason || null,
      authorityBlockers: blockers,
      authorityTrace: finalTrace,
      authoritySource: source,
      executionActionable: pass && ['READY', 'PLAYABLE', 'PROBE'].includes(authorityTier),
      displayStatus: uiTruth,
      finalAuthorityStatus: finalAuthorityStatus,
    };
  }

  function buildCapitalTrace(capitalPlan = null) {
    if (!capitalPlan || typeof capitalPlan !== 'object') return null;
    return {
      source: 'CAPITAL_ENGINE',
      regime: String(capitalPlan.regime || ''),
      totalEquity: num(capitalPlan.totalEquity, 0),
      floorRiskPct: num(capitalPlan.floorRiskPct, 0),
      adjustedRiskPct: num(capitalPlan.adjustedRiskPct, 0),
      portfolioBeforeRiskPct: num(capitalPlan.portfolioBeforeRiskPct, 0),
      projectedRiskPct: num(capitalPlan.projectedRiskPct, 0),
      hardExposureCapPct: num(capitalPlan.hardExposureCapPct, 0),
      strategicRiskMultiplier: num(capitalPlan.strategicRiskMultiplier, 0),
      cooldownRemainingMinutes: num(capitalPlan.cooldownRemainingMinutes, 0),
      openedToday: num(capitalPlan.tradeStats?.openedToday, 0),
      consecutiveLosses: num(capitalPlan.tradeStats?.consecutiveLosses, 0),
      lastOpenedAt: num(capitalPlan.tradeStats?.lastOpenedAt, 0),
      guardReasons: Array.isArray(capitalPlan.guardReasons) ? capitalPlan.guardReasons : [],
      moderateBullChopCooldownRelax: !!capitalPlan.moderateBullChopCooldownRelax,
      moderateSidewayChopGuardRelax: !!capitalPlan.moderateSidewayChopGuardRelax,
      moderateSidewayChopProbeLossStreakRelax: !!capitalPlan.moderateSidewayChopProbeLossStreakRelax,
    };
  }

  const VALID_TRIGGERS = Object.freeze(new Set([
    'reclaimbreak',
    'minispring',
    'breakoutretest15m',
    'lps15m',
    'lps4h',
    'springconfirm',
    'volumesurge',
    'absorbtest',
    'sweepreverse',
  ]));

  /* ── Tier Floors ────────────────────────────────────────────────────── */

  const TIER_FLOORS = Object.freeze({
    [EXEC_TIER.PROBE]: {
      rr: 1.20,
      score: 18,
      conf: window.ST?.config?.execution?.PROBE_CONF || 0.58,
      riskPctPerTrade: 0.005,
      maxStopDistPct: 0.24,
      maxAllocCap: 0.12,
    },
    [EXEC_TIER.PLAYABLE]: {
      rr: 1.60,
      score: 24,
      conf: 0.60,
      riskPctPerTrade: 0.010,
      maxStopDistPct: 0.20,
      maxAllocCap: 0.20,
    },
    [EXEC_TIER.READY]: {
      rr: 2.20,
      score: window.ST?.config?.execution?.READY_SCORE || 50,
      conf: window.ST?.config?.execution?.READY_CONF || 0.70,
      riskPctPerTrade: 0.020,
      maxStopDistPct: 0.14,
      maxAllocCap: 0.32,
      requiresTrigger: true,
    },
  });

  /* ── Portfolio Limits ───────────────────────────────────────────────── */

  // Portfolio limits mirrored for summary/debug exposure.
  // `coolingMs` means same-symbol post-close cooling; capital-engine.js owns
  // global trade cadence via `cooldownMs`.
  const PORTFOLIO_LIMITS = Object.freeze({
    bull: { maxTotalRiskPct: 0.08, maxConcurrent: 6, coolingMs: 2 * 60 * 60 * 1000, maxPerCategory: 2 },
    sideway: { maxTotalRiskPct: 0.05, maxConcurrent: 4, coolingMs: 4 * 60 * 60 * 1000, maxPerCategory: 1 },
    bear: { maxTotalRiskPct: 0.03, maxConcurrent: 2, coolingMs: 8 * 60 * 60 * 1000, maxPerCategory: 1 },
  });

  const VELOCITY_LIMITS = Object.freeze({
    bull: 48 * 60 * 60 * 1000,
    sideway: 24 * 60 * 60 * 1000,
    bear: 12 * 60 * 60 * 1000,
  });

  const PENDING_EXPIRY_MS = Object.freeze({
    bull: 24 * 60 * 60 * 1000,
    sideway: 48 * 60 * 60 * 1000,
    bear: 16 * 60 * 60 * 1000,
  });

  /* ── Sideway Density Limits (Feature 3) ─────────────────────────────── */

  /**
   * Hard caps on concurrent open positions per tier in sideways market.
   * Prevents capital bleed from overtrading in low-quality regimes.
   * These caps are additive to PORTFOLIO_LIMITS.sideway.maxConcurrent (4 total).
   */
  const SIDEWAY_DENSITY_LIMITS = Object.freeze({
    maxPlayable: 2,  // max PLAYABLE positions open at once in sideway
    maxProbe: 3,  // max PROBE positions open at once in sideway
  });

  /** High-quality sideway setup floors (Feature 1) – PLAYABLE allowed only if met */
  const SIDEWAY_HQ_FLOOR = Object.freeze({
    rr: 1.6,
    conf: 0.60,
  });

  const BULL_CHOP_PROBE_FLOOR = Object.freeze({
    rr: 1.05,
    score: 20,
    conf: 0.50,
  });

  const SIDEWAY_CHOP_SOFT_PRE_GATE_FLOOR = Object.freeze({
    rr: 0.65,
    score: 12,
    conf: 0.46,
  });

  const SIDEWAY_CHOP_SOFT_PROBE_FLOOR = Object.freeze({
    rr: 0.95,
    score: 18,
    conf: 0.50,
  });

  const SIDEWAY_CHOP_NARROW_SCORE_CONF_PROBE_BRIDGE = Object.freeze({
    rr: 1.10,
    score: 17,
    conf: 0.50,
  });

  /* ── Valid Setups ───────────────────────────────────────────────────── */

  const VALID_SETUPS = new Set(
    typeof window.getCanonicalStructuralSetups === 'function'
      ? window.getCanonicalStructuralSetups()
      : ['phase-candidate', 'early-phase-d', 'breakout', 'trend-continuation', 'unclear', 'accumulation', 'early-watch']
  );
  const BLOCKING_ENTRY_QUALITY = new Set(['invalid_structure', 'data_corrupt']);

  function isModerateBullChopSignal(signal, context = {}) {
    const btcContext = String(context?.btcContext || signal?.btcContext || window.ST?.btc || 'sideway').toLowerCase();
    const regimeType = String(context?.regimeType || context?.regimeEngine?.type || signal?.regimeType || window.ST?.scanMeta?.regime?.regimeType || window.ST?.scanMeta?.regime?.type || 'CHOP').toUpperCase();
    return btcContext === 'bull' && regimeType === 'CHOP';
  }

  function isModerateSidewayChopSignal(signal, context = {}) {
    const btcContext = String(context?.btcContext || signal?.btcContext || window.ST?.btc || 'sideway').toLowerCase();
    const regimeType = String(context?.regimeType || context?.regimeEngine?.type || signal?.regimeType || window.ST?.scanMeta?.regime?.regimeType || window.ST?.scanMeta?.regime?.type || 'CHOP').toUpperCase();
    return btcContext === 'sideway' && regimeType === 'CHOP';
  }

  function hasAdaptiveSidewaySoftUnlock(context = {}) {
    const gateMode = String(context?.proEdgeSnap?.gateMode || '').toUpperCase();
    return !!(
      context?.regimeEngine?.allowProbe ||
      context?.proEdgeSnap?.probeCapitalEnabled ||
      ['REDUCED', 'PROBE', 'SOFT'].includes(gateMode) ||
      Number(context?.proEdgeSnap?.playableCount || 0) > 0 ||
      Number(context?.proEdgeSnap?.matchingTradables || 0) > 0
    );
  }

  /* ── Global NO_TRADE Regime ─────────────────────────────────────────── */

  /**
   * When active, ALL new capital approvals are blocked unconditionally.
   * Lifecycle (expiry, crash invalidation, promotions) still runs — only gate is blocked.
   *
   * Activation paths:
   *   Manual : setNoTradeRegime(true, 'reason')
   *   Auto   : evaluateAutoNoTrade() in run() — hooks prepared for v9.3:
   *              - btcBreakdown     : activated by crash invalidation event
   *              - lackOfSetups     : stub — v9.3 implements consecutive-scan tracking
   *              - marketHealth     : stub — v9.3 implements running window evaluation
   *
   * FIX #5: Hooks are wired into run() but only btcBreakdown is active in v9.2.1.
   */
  const _noTrade = { active: false, reason: null, setAt: null, autoSource: null };

  function setNoTradeRegime(active, reason = null, autoSource = null) {
    _noTrade.active = Boolean(active);
    _noTrade.reason = active ? String(reason || 'manually_set') : null;
    _noTrade.setAt = active ? now() : null;
    _noTrade.autoSource = active ? autoSource : null;
    console.log(`[EE-V9] NO_TRADE: ${_noTrade.active ? 'ACTIVATED' : 'CLEARED'}${reason ? ` (${reason})` : ''}`);
  }

  function getNoTradeRegime() {
    return { ..._noTrade };
  }

  /**
   * FIX #5: Auto NO_TRADE evaluation hooks.
   * Called during run() BEFORE gate evaluation.
   * Returns { shouldActivate, reason, source } or null.
   *
   * btcBreakdown  — ACTIVE in v9.2.1 (triggered by crash event count)
   * lackOfSetups  — STUB for v9.3 (require consecutive empty scans)
   * marketHealth  — STUB for v9.3 (require running health window)
   */
  function evaluateAutoNoTrade({ btcCrashCount = 0, gatePassedCount = null, marketHealthScore = null } = {}) {
    // Hook 1: BTC breakdown — active now
    // If crash invalidation fired this cycle, auto-activate NO_TRADE
    if (btcCrashCount > 0) {
      return { shouldActivate: true, reason: `auto_btc_breakdown_${btcCrashCount}_positions_invalidated`, source: 'btcBreakdown' };
    }
    // Hook 2: lack of setups — stub (v9.3)
    // if (consecutiveEmptyScans >= threshold) { ... }
    // Hook 3: market health degradation — stub (v9.3)
    // if (marketHealthScore !== null && marketHealthScore < threshold) { ... }
    return null;  // no auto-activation
  }

  /**
   * Expectancy Hardening Logic (v10.6.9.25)
   * Penalizes symbols/setups with negative edge in the last 14 days.
   */
  function getExpectancyPenalty(signal) {
    if (!window.ANALYTICS_ENGINE) return { multiplier: 1, reason: null };
    const stats = window.ANALYTICS_ENGINE.getCachedStats();
    if (!stats || !stats.updatedAt) return { multiplier: 1, reason: null };

    let mult = 1.0;
    const reasons = [];
    const cfg = window.ST?.config?.expectancy || {
      minCautionSamples: 3,
      minHardPenaltySamples: 8,
      penaltyMultiplier: 0.85
    };

    // 1. Symbol Hardening
    const symStats = stats.symbols && stats.symbols[signal.symbol];
    if (symStats && symStats.total >= cfg.minCautionSamples) {
      if (symStats.avgR < 0 || symStats.winRate < 30) {
        if (symStats.total >= cfg.minHardPenaltySamples) {
          mult *= cfg.penaltyMultiplier;
          reasons.push(`[PENALTY] Negative Expectancy (${signal.symbol})`);
        } else {
          reasons.push(`[CAUTION] Low Sample Negative Edge (${signal.symbol})`);
        }
      }
    }

    // 2. Setup Hardening
    const normSetup = normalizeSetup(signal.setup);
    const setStats = stats.setups && stats.setups[normSetup];
    if (setStats && setStats.total >= cfg.minCautionSamples) {
      if (setStats.avgR < 0 || setStats.winRate < 25) {
        if (setStats.total >= cfg.minHardPenaltySamples) {
          mult *= Math.sqrt(cfg.penaltyMultiplier);
          reasons.push(`[PENALTY] Negative Setup Edge (${normSetup})`);
        } else {
          reasons.push(`[CAUTION] Low Sample Setup Edge (${normSetup})`);
        }
      }
    }

    // 3. Hour Audit
    const hour = new Date().getHours();
    const hStats = stats.hours && stats.hours[hour];
    if (hStats && hStats.total >= cfg.minCautionSamples && hStats.avgR < -0.5) {
      if (hStats.total >= cfg.minHardPenaltySamples) {
        mult *= 0.95;
        reasons.push(`[PENALTY] Toxic Hour Window (${hour}:00)`);
      } else {
        reasons.push(`[CAUTION] Toxic Hour Window Snapshot`);
      }
    }

    return { multiplier: Number(mult.toFixed(2)), reasons };
  }

  /* ── Utilities ──────────────────────────────────────────────────────── */

  function num(v, d = 0) { const n = Number(v); return Number.isFinite(n) ? n : d; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function uid() { return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }
  function now() { return Date.now(); }
  function pct(v, decimals = 2) { return Number((v * 100).toFixed(decimals)); }
  function normalizeSetup(v) {
    if (typeof window.normalizeStructuralSetupValue === 'function') {
      return String(window.normalizeStructuralSetupValue(v, '') || '').trim().toLowerCase();
    }
    return String(v || '').trim().toLowerCase();
  }

  /**
   * Diagnostic Tracing (@system-architect)
   * Captures gate decisions for auditability.
   */
  function trace(label, payload) {
    try {
      const entry = {
        id: `exec-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        label,
        payload,
        at: Date.now(),
        iso: new Date().toISOString(),
        version: VERSION
      };
      if (typeof console !== 'undefined') {
        console.log(`[EXEC TRACE] ${label}`, payload);
      }
      window.__LAST_EXECUTION_TRACE__ = entry;
      window.__EXECUTION_HISTORY__ = [
        entry,
        ...(window.__EXECUTION_HISTORY__ || [])
      ].slice(0, 15);
    } catch (_) { }
  }

  /* ── Signal Classification ──────────────────────────────────────────── */

  function classifySignalState(signal, context = {}) {
    if (!signal || typeof signal !== 'object') return SIGNAL_STATE.WATCH;

    const setup = normalizeSetup(signal.setup);
    const moderateBullChop = isModerateBullChopSignal(signal, context);
    const moderateSidewayChop = isModerateSidewayChopSignal(signal, context);
    const moderateChop = moderateBullChop || moderateSidewayChop;
    const rr = num(signal.rr);
    const score = num(signal.score);
    const conf = num(signal.executionConfidence);
    const entry = num(signal.entry || signal.price);
    const stop = num(signal.stop);
    const fake = String(signal.fakePumpRisk || '').toLowerCase();
    const chartQ = String(signal.chartEntryQuality || '');
    const age = now() - num(signal.scannedAt || signal.timestamp || now());

    const setupValid = VALID_SETUPS.has(setup) || (moderateChop && setup === 'early-watch');
    const sidewaySoftUnlock = moderateSidewayChop && hasAdaptiveSidewaySoftUnlock(context);
    const minRr = sidewaySoftUnlock
      ? SIDEWAY_CHOP_SOFT_PRE_GATE_FLOOR.rr
      : (moderateChop ? 0.70 : 0.80);
    const minScore = sidewaySoftUnlock
      ? SIDEWAY_CHOP_SOFT_PRE_GATE_FLOOR.score
      : (moderateChop ? 14 : 18);
    const minConf = sidewaySoftUnlock
      ? SIDEWAY_CHOP_SOFT_PRE_GATE_FLOOR.conf
      : (moderateChop ? 0.48 : 0.50);

    if (age > 6 * 60 * 60 * 1000) return SIGNAL_STATE.STALE;
    if (!setupValid) return SIGNAL_STATE.WATCH;
    if (BLOCKING_ENTRY_QUALITY.has(chartQ)) return SIGNAL_STATE.WATCH;
    if (fake === 'high') return SIGNAL_STATE.WATCH;
    if (entry <= 0 || stop <= 0 || stop >= entry) return SIGNAL_STATE.WATCH;
    if (rr < minRr) return SIGNAL_STATE.WATCH;
    if (score < minScore) return SIGNAL_STATE.WATCH;
    if (conf < minConf) return SIGNAL_STATE.WATCH;

    return SIGNAL_STATE.CANDIDATE;
  }

  function explainSignalState(signal, context = {}) {
    if (!signal || typeof signal !== 'object') return 'invalid_signal';

    const setup = normalizeSetup(signal.setup);
    const moderateBullChop = isModerateBullChopSignal(signal, context);
    const moderateSidewayChop = isModerateSidewayChopSignal(signal, context);
    const moderateChop = moderateBullChop || moderateSidewayChop;
    const rr = num(signal.rr);
    const score = num(signal.score);
    const conf = num(signal.executionConfidence);
    const entry = num(signal.entry || signal.price);
    const stop = num(signal.stop);
    const fake = String(signal.fakePumpRisk || '').toLowerCase();
    const chartQ = String(signal.chartEntryQuality || '');
    const age = now() - num(signal.scannedAt || signal.timestamp || now());

    const setupValid = VALID_SETUPS.has(setup) || (moderateChop && setup === 'early-watch');
    const sidewaySoftUnlock = moderateSidewayChop && hasAdaptiveSidewaySoftUnlock(context);
    const minRr = sidewaySoftUnlock
      ? SIDEWAY_CHOP_SOFT_PRE_GATE_FLOOR.rr
      : (moderateChop ? 0.70 : 0.80);
    const minScore = sidewaySoftUnlock
      ? SIDEWAY_CHOP_SOFT_PRE_GATE_FLOOR.score
      : (moderateChop ? 14 : 18);
    const minConf = sidewaySoftUnlock
      ? SIDEWAY_CHOP_SOFT_PRE_GATE_FLOOR.conf
      : (moderateChop ? 0.48 : 0.50);

    if (age > 6 * 60 * 60 * 1000) return `age_${Math.round(age / 3600000)}h_gt_6h`;
    if (!setupValid) return `invalid_setup:${setup}`;
    if (BLOCKING_ENTRY_QUALITY.has(chartQ)) return `chart_quality_${chartQ}`;
    if (fake === 'high') return 'fake_pump_high';
    if (entry <= 0 || stop <= 0 || stop >= entry) return 'invalid_stop_distance';
    if (rr < minRr) return `rr_${rr.toFixed(2)}_lt_${minRr.toFixed(2)}`;
    if (score < minScore) return `score_${score}_lt_${minScore}`;
    if (conf < minConf) return `conf_${conf.toFixed(2)}_lt_${minConf.toFixed(2)}`;
    return 'candidate';
  }

  function runPortfolioVeto(signal, attemptedTier, ctx, portfolioBeforeRisk = 0) {
    if (window.PORTFOLIO_ENGINE && typeof window.PORTFOLIO_ENGINE.runPortfolioVeto === 'function') {
      // Direct delegation to Alpha Guard Portfolio Engine
      const result = window.PORTFOLIO_ENGINE.runPortfolioVeto(signal, attemptedTier, ctx, TIER_FLOORS, portfolioBeforeRisk);

      // Attach metadata to signal for audit visibility
      if (signal && typeof signal === 'object') {
        signal._vetoCategory = result.category || 'OTHER';
        signal._projectedRisk = result.projectedRiskPct || 0;
      }

      return result;
    }
    return {
      pass: false,
      rejections: ['portfolio_engine_missing_fail_closed'],
      _fatalSystemError: true,
      fatalCode: 'PORTFOLIO_ENGINE_DOWN',
      fatalMessage: 'PORTFOLIO ENGINE DOWN – TRADING HALTED'
    };
  }

  /* ── PLAYABLE OR-Gate (Feature #4) ────────────────────────────────── */

  /**
   * Strengthened PLAYABLE criteria (v9.3.1).
   *
   * Base (always AND): score >= 20, conf >= 0.50 (v10.4 rebalance for swing Option B)
   *
   * Feature 2 — RR/Conf gate:
   *   If rr >= 3.0 BUT conf < 0.70 → downgrade to PROBE (not PLAYABLE).
   *   Only allow PLAYABLE if:
   *     Path A: rr >= 2.0 AND conf >= 0.70
   *     Path B: rr >= 1.5 AND (momentum OR structure confirm) AND conf >= 0.70
   *
   * PROBE and READY use flat AND floor (unchanged).
   */
  function checkPlayablePath(signal) {
    const rr = num(signal.rr);
    const score = num(signal.score);
    const conf = num(signal.executionConfidence);
    const relVol = num(signal.relVol15 || signal.relativeVolume15 || signal.relVol);
    const smScore = num(signal.smartMoneyScore || signal.smartMoney);
    const setup = String(signal.setup || '');

    // Base requirements — always AND
    if (score < 24) return { pass: false, reason: `score_${score}_lt_24`, path: null };
    if (conf < 0.60) return { pass: false, reason: `conf_${conf.toFixed(2)}_lt_0.60`, path: null };

    // High-RR with insufficient confidence must not inflate PLAYABLE
    if (rr >= 3.0 && conf < 0.68) {
      return { pass: false, reason: `rr_${rr.toFixed(2)}_high_but_conf_${conf.toFixed(2)}_lt_0.68_downgrade_to_probe`, path: null };
    }

    // Primary path: strong RR + acceptable confidence
    if (rr >= 2.0 && conf >= 0.68) return { pass: true, path: 'primary_rr_gte_2.0', reason: `rr_${rr.toFixed(2)}_conf_${conf.toFixed(2)}` };

    // Secondary path: RR >= 1.6 + confirmation
    if (rr >= 1.6) {
      const momentumConfirm = relVol >= 1.0 && (VALID_TRIGGERS.has(normalizeTrigger(signal.entrySignal)) || /breakout|retest|probe/.test(String(signal.entryTiming || '').toLowerCase()));
      const structureConfirm = VALID_SETUPS.has(setup) && score >= 26 && smScore >= 0.10;
      if (momentumConfirm) {
        return { pass: true, path: 'secondary_momentum', reason: `rr_${rr.toFixed(2)}_relVol_${relVol.toFixed(2)}_trigger_${signal.entrySignal}` };
      }
      if (structureConfirm) {
        return { pass: true, path: 'secondary_structure', reason: `rr_${rr.toFixed(2)}_score_${score}_sm_${smScore.toFixed(2)}` };
      }
      return { pass: false, path: null, reason: `rr_${rr.toFixed(2)}_no_momentum_or_structure_confirm` };
    }

    return { pass: false, path: null, reason: `rr_${rr.toFixed(2)}_lt_1.6_playable_floor` };
  }

  function getAdaptiveSoftTier(signal, portfolioContext) {
    const btcContext = String(portfolioContext?.btcContext || 'sideway').toLowerCase();
    const gateMode = String(portfolioContext?.proEdgeSnap?.gateMode || '').toUpperCase();
    const adaptiveUnlock = btcContext === 'sideway' && (
      hasAdaptiveSidewaySoftUnlock(portfolioContext) ||
      portfolioContext?.regimeEngine?.allowReady
    );
    if (!adaptiveUnlock) return null;

    const rr = num(signal.rr);
    const score = num(signal.score);
    const conf = num(signal.executionConfidence);
    const setup = normalizeSetup(signal.setup);
    const moderateSidewayChop = isModerateSidewayChopSignal(signal, portfolioContext);
    const fake = String(signal.fakePumpRisk || '').toLowerCase();
    const chartQ = String(signal.chartEntryQuality || '');
    const entry = num(signal.entry || signal.price);
    const stop = num(signal.stop);

    if (BLOCKING_ENTRY_QUALITY.has(chartQ)) return null;
    if (fake === 'high') return null;
    if (!VALID_SETUPS.has(setup)) return null;
    if (entry <= 0 || stop <= 0 || stop >= entry) return null;

    if (rr >= 1.6 && score >= 24 && conf >= 0.60) return EXEC_TIER.PLAYABLE;
    if (
      rr >= SIDEWAY_CHOP_SOFT_PROBE_FLOOR.rr &&
      score >= SIDEWAY_CHOP_SOFT_PROBE_FLOOR.score &&
      conf >= SIDEWAY_CHOP_SOFT_PROBE_FLOOR.conf
    ) return EXEC_TIER.PROBE;
    if (
      moderateSidewayChop &&
      setup !== 'unclear' &&
      rr >= SIDEWAY_CHOP_NARROW_SCORE_CONF_PROBE_BRIDGE.rr &&
      score >= SIDEWAY_CHOP_NARROW_SCORE_CONF_PROBE_BRIDGE.score &&
      conf >= SIDEWAY_CHOP_NARROW_SCORE_CONF_PROBE_BRIDGE.conf
    ) return EXEC_TIER.PROBE;
    return null;
  }

  function summarizeTierRejections(rejectionsByTier = {}) {
    const summarizeReason = (reason) => {
      const text = String(reason || '');
      if (!text) return 'other';
      if (text.startsWith('playable_path_failed:')) return 'playable_path';
      if (text.startsWith('trigger_required_not_found:')) return 'trigger';
      if (text.startsWith('rr_')) return 'rr_floor';
      if (text.startsWith('score_')) return 'score_floor';
      if (text.startsWith('conf_')) return 'conf_floor';
      if (text.startsWith('expectancy_reduced_conf_')) return 'expectancy';
      if (text.startsWith('chart_quality_')) return 'chart_quality';
      if (text.startsWith('fake_pump_')) return 'fake_pump';
      if (text.startsWith('invalid_setup:')) return 'setup';
      if (text === 'invalid_stop_distance') return 'stop_distance';
      if (text.includes('portfolio_')) return 'portfolio_veto';
      if (text.includes('capital_')) return 'capital_veto';
      if (text.includes('liquidity_')) return 'liquidity_veto';
      if (text.includes('exposure_cap_')) return 'exposure_cap';
      if (text.includes('cooldown_active_')) return 'cooldown';
      if (text.includes('daily_trade_limit_')) return 'daily_limit';
      if (text.includes('loss_streak_guard_')) return 'loss_streak';
      return 'other';
    };

    const byTier = {};
    const counts = {};
    for (const [tier, reasons] of Object.entries(rejectionsByTier || {})) {
      const list = Array.isArray(reasons) ? reasons : [];
      byTier[tier] = list.map((reason) => ({
        reason,
        type: summarizeReason(reason),
      }));
      for (const item of byTier[tier]) {
        counts[item.type] = (counts[item.type] || 0) + 1;
      }
    }

    const primary = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([type, count]) => ({ type, count }));

    return { byTier, counts, primary };
  }

  function formatTierRejectionSummary(summary = {}) {
    const primary = Array.isArray(summary?.primary) ? summary.primary : [];
    const byTier = summary?.byTier || {};
    const primaryText = primary.length
      ? primary.map(item => `${item.type}:${item.count}`).join(' | ')
      : 'none';
    const tierText = Object.entries(byTier)
      .map(([tier, items]) => {
        const top = Array.isArray(items) ? items.slice(0, 2).map(item => item.type).join(',') : '';
        return `${tier}:${top || 'none'}`;
      })
      .join(' | ');
    return { primaryText, tierText };
  }

  /* ── The One Gate ──────────────────────────────────────────────────────── */

  /**
   * Single final gate. ALL conditions AND. No OR fallbacks (except PLAYABLE tier).
   * PLAYABLE uses checkPlayablePath() which implements the OR-gate internally.
   * Trigger detection: strict whitelist only.
   * Portfolio veto: fail-closed.
   */
  function runExecutionGate(signal, portfolioContext, portfolioBeforeRisk, scannerSummary, marketInsight) {
    const audit = getExpectancyPenalty(signal);
    const signalState = classifySignalState(signal, portfolioContext);
    const signalStateReason = explainSignalState(signal, portfolioContext);
    if (signalState !== SIGNAL_STATE.CANDIDATE) {
      const blockLabel = `pre_gate:${signalState.toLowerCase()}:${signalStateReason}`;
      const res = {
        tier: EXEC_TIER.OBSERVE, pass: false,
        reason: `signal_not_candidate:${signalState}`,
        rejections: [`signal_state_${signalState.toLowerCase()}`],
        authorityTrace: {
          entrySignal: String(signal.entrySignal || 'none'),
          triggerMatched: VALID_TRIGGERS.has(normalizeTrigger(signal.entrySignal)),
          expectancy: audit || {},
          macro: {},
          rejectionsByTier: {
            READY:    [blockLabel],
            PLAYABLE: [blockLabel],
            PROBE:    [blockLabel],
          }
        }
      };
      trace('signal_not_candidate', { symbol: signal.symbol, signalState, signalStateReason, result: res });
      return res;
    }

    const rr = num(signal.rr);
    const score = num(signal.score);
    const conf = num(signal.executionConfidence);
    const entry = num(signal.entry || signal.price);
    const stop = num(signal.stop);
    const setup = normalizeSetup(signal.setup);
    const fake = String(signal.fakePumpRisk || '').toLowerCase();
    const chartQ = String(signal.chartEntryQuality || '');
    const hasTrigger = VALID_TRIGGERS.has(normalizeTrigger(signal.entrySignal));
    const btcContext = String(portfolioContext?.btcContext || 'sideway').toLowerCase();
    const regimeType = String(
      portfolioContext?.regimeType ||
      portfolioContext?.regimeEngine?.type ||
      scannerSummary?.regimeType ||
      marketInsight?.regimeType ||
      'CHOP'
    ).toUpperCase();
    const bullChopProbeLane = (
      btcContext === 'bull' &&
      regimeType === 'CHOP' &&
      hasTrigger &&
      setup !== 'unclear' &&
      fake !== 'high' &&
      !BLOCKING_ENTRY_QUALITY.has(chartQ)
    );

    const openPositions = Array.isArray(portfolioContext?.openPositions) ? portfolioContext.openPositions : [];
    const portfolioBefore = openPositions.reduce((s, p) => s + num(p.riskPctPerTrade), 0);

    const allRejections = [];
    // v10.6.9.42-Final: Absolute Schema Enforcement
    // v10.6.9.56-P5: Deep-copy shared objects to prevent cross-coin trace mutation
    const tierTrace = {
      entrySignal: String(signal.entrySignal || 'none'),
      triggerMatched: Boolean(hasTrigger),
      expectancy: audit ? { ...audit } : {},
      macro: marketInsight ? { ...marketInsight } : {},
      rejectionsByTier: {
        READY: [],
        PLAYABLE: [],
        PROBE: []
      }
    };

    let bestPass = null;

    for (const tier of [EXEC_TIER.READY, EXEC_TIER.PLAYABLE, EXEC_TIER.PROBE]) {
      const floor = TIER_FLOORS[tier];
      const effectiveFloor = (tier === EXEC_TIER.PROBE && bullChopProbeLane)
        ? {
            ...floor,
            rr: Math.min(floor.rr, BULL_CHOP_PROBE_FLOOR.rr),
            score: Math.max(floor.score, BULL_CHOP_PROBE_FLOOR.score),
            conf: Math.min(floor.conf, BULL_CHOP_PROBE_FLOOR.conf),
          }
        : floor;
      const fails = [];

      // Common pre-conditions (AND for all tiers)
      if (BLOCKING_ENTRY_QUALITY.has(chartQ)) fails.push(`chart_quality_${chartQ}`);
      if (fake === 'high') fails.push('fake_pump_high');
      if (!VALID_SETUPS.has(setup)) fails.push(`invalid_setup:${setup}`);
      if (entry <= 0 || stop <= 0 || stop >= entry) fails.push('invalid_stop_distance');

      // Tier-specific RR/score/conf gate
      if (tier === EXEC_TIER.PLAYABLE) {
        const playPath = checkPlayablePath(signal);
        if (!playPath.pass) fails.push(`playable_path_failed:${playPath.reason}`);
      } else {
        if (rr < effectiveFloor.rr) fails.push(`rr_${rr.toFixed(2)}_lt_${effectiveFloor.rr}`);
        if (score < effectiveFloor.score) fails.push(`score_${score}_lt_${effectiveFloor.score}`);
        if (conf < effectiveFloor.conf) fails.push(`conf_${conf.toFixed(2)}_lt_${effectiveFloor.conf}`);
      }

      if (floor.requiresTrigger && !hasTrigger)
        fails.push(`trigger_required_not_found:${signal.entrySignal || 'none'}`);

      // Expectancy Hardening Audit
      if (audit.multiplier < 1.0) {
        const adjustedConf = conf * audit.multiplier;
        if (adjustedConf < effectiveFloor.conf) {
          fails.push(`expectancy_reduced_conf_${adjustedConf.toFixed(2)}_lt_${effectiveFloor.conf}`);
        }
      }

      const veto = runPortfolioVeto(signal, tier, portfolioContext, portfolioBefore);
      if (veto && veto._fatalSystemError) {
        return {
          tier: EXEC_TIER.OBSERVE,
          pass: false,
          reason: veto.fatalCode || 'fatal_gate_error',
          rejections: veto.rejections || ['fatal_gate_error'],
          authorityTrace: tierTrace,
          _fatalSystemError: true,
          fatalCode: veto.fatalCode || 'FATAL_GATE_ERROR',
          fatalMessage: veto.fatalMessage || 'FATAL GATE ERROR'
        };
      }
      if (!veto.pass) fails.push(...veto.rejections);

      // Enforce immutable push for the trace to prevent data drift
      tierTrace.rejectionsByTier[tier] = Array.isArray(fails) ? [...fails] : [];

      if (fails.length === 0 && !bestPass) {
        bestPass = { tier, pass: true, reason: `gate_passed_${tier.toLowerCase()}`, rejections: [] };
      }

      if (fails.length > 0) {
        allRejections.push(`[${tier}] ${fails.join(', ')}`);
      }
    }

    if (bestPass) {
      bestPass.authorityTrace = tierTrace;
      trace('gate_passed', {
        symbol: signal.symbol,
        tier: bestPass.tier,
        metrics: { rr, score, conf, hasTrigger, setup, chartQ, fake },
        result: bestPass
      });
      return bestPass;
    }

    const result = {
      tier: EXEC_TIER.OBSERVE,
      pass: false,
      reason: 'all_tiers_rejected',
      rejections: allRejections,
      authorityTrace: {
        ...tierTrace,
        rejectionSummary: summarizeTierRejections(tierTrace.rejectionsByTier),
      }
    };
    trace('gate_rejected', {
      symbol: signal.symbol,
      result,
      signal: { rr, score, conf, entry, stop, setup, entrySignal: signal.entrySignal, hasTrigger }
    });
    return result;
  }

  /* ── Position Sizing — transparent (patch req #4 + #5) ─────────────── */

  /**
   * Returns full sizing breakdown:
   *   rawAllocationPct      = riskBudget / stopDist (unclamped)
   *   clampedAllocationPct  = after tier cap applied
   *   effectiveRiskPct      = clampedAlloc × stopDist (actual realized risk)
   *   portfolioBeforeRiskPct / newRiskPct / portfolioAfterRiskPct
   */
  function computePositionSize(signal, tier, portfolioBeforeRisk = 0, capitalPlan = null) {
    const floor = TIER_FLOORS[tier];
    const entry = num(signal.entry || signal.price);
    const stop = num(signal.stop);

    const fail = (reason) => ({
      valid: false, reason,
      rawAllocationPct: 0, clampedAllocationPct: 0, effectiveRiskPct: 0,
      riskPctPerTrade: 0, stopDistancePct: 0,
      portfolioBeforeRiskPct: pct(portfolioBeforeRisk),
      newRiskPct: 0,
      portfolioAfterRiskPct: pct(portfolioBeforeRisk),
    });

    if (!floor || entry <= 0 || stop <= 0 || stop >= entry) return fail('invalid_prices');

    const stopDistPct = Math.abs(entry - stop) / entry;
    if (stopDistPct <= 0) return fail('zero_stop_distance');
    if (stopDistPct > floor.maxStopDistPct) return fail(`stop_too_wide_${pct(stopDistPct, 1)}pct`);

    const targetRiskPct = capitalPlan && Number.isFinite(num(capitalPlan.adjustedRiskPct, NaN))
      ? num(capitalPlan.adjustedRiskPct)
      : floor.riskPctPerTrade;
    const allocCapMultiplier = capitalPlan && Number.isFinite(num(capitalPlan.allocCapMultiplier, NaN))
      ? Math.max(0.25, num(capitalPlan.allocCapMultiplier))
      : 1;
    const effectiveAllocCap = Math.max(0.02, floor.maxAllocCap * allocCapMultiplier);

    // v10.6.9: Strategic Multi-Metric Scaling
    const strategicMultiplier = window.ST?.strategic?.riskMultiplier || 1.0;
    const strategicLabel = window.ST?.strategic?.rainbow?.label || 'Neutral';

    let rawAlloc = (targetRiskPct * strategicMultiplier) / stopDistPct;
    let clampedAlloc = clamp(rawAlloc, 0.02, effectiveAllocCap);

    // Feature v9.5: Strict Liquidity Gate via RISK_ENGINE
    let _liquidityWarning = null;
    let _liquidityScaling = 1.0;
    const assumedCapital = Number(capitalPlan?.totalEquity);
    if (!Number.isFinite(assumedCapital) || assumedCapital <= 0) {
      console.warn('[EE-V9] Missing capitalPlan.totalEquity for liquidity sizing; using debug fallback only.');
    }
    const VIRTUAL_PAPER_EQUITY = 10000;
    const effectiveCapital = (Number.isFinite(assumedCapital) && assumedCapital > 0)
      ? assumedCapital
      : (Number(window.ST?.sessionState?.totalEquity || 0) > 0 ? Number(window.ST?.sessionState?.totalEquity || 0) : VIRTUAL_PAPER_EQUITY);

    const positionValue = clampedAlloc * effectiveCapital;

    if (window.RISK_ENGINE && typeof window.RISK_ENGINE.evaluateLiquidityGate === 'function') {
      const liquidityGate = window.RISK_ENGINE.evaluateLiquidityGate(signal, positionValue);
      if (!liquidityGate.pass) {
        return fail(`liquidity_blocked_${liquidityGate.reason}`);
      }
      _liquidityScaling = liquidityGate.scale || 1.0;
      if (liquidityGate.warning) {
        _liquidityWarning = typeof liquidityGate.warning === 'string' ? `⚠ ${liquidityGate.warning}` : '⚠ Liquidity scaled';
      }
      clampedAlloc *= _liquidityScaling;
    }

    // Pass warning to record
    if (signal && typeof signal === 'object') {
      signal._liquidityWarning = _liquidityWarning;
    }

    const effectiveRisk = clampedAlloc * stopDistPct;  // realized risk at this alloc

    return {
      valid: true,
      rawAllocationPct: Number(rawAlloc.toFixed(4)),
      clampedAllocationPct: Number(clampedAlloc.toFixed(4)),
      allocationPct: Number(clampedAlloc.toFixed(4)),  // compat alias
      effectiveRiskPct: Number(effectiveRisk.toFixed(4)),
      riskPctPerTrade: Number(targetRiskPct.toFixed(4)),
      baseRiskPctPerTrade: floor.riskPctPerTrade,
      stopDistancePct: Number(stopDistPct.toFixed(4)),
      liquidityScaling: Number(_liquidityScaling.toFixed(2)),
      sizeBucket: capitalPlan?.sizeBucket || null,
      capitalPlan,
      // PATCH #4: portfolio risk display
      portfolioBeforeRiskPct: pct(portfolioBeforeRisk),
      newRiskPct: pct(targetRiskPct * _liquidityScaling), // Actual risk consumed
      portfolioAfterRiskPct: pct(portfolioBeforeRisk + (targetRiskPct * _liquidityScaling)),
      liquidityWarning: _liquidityWarning,
    };
  }

  /* ── Position Record Creation (patch req #2, #3, #8) ────────────────── */

  /**
   * Creates AUTO_PAPER position with:
   *   - positionState: ARMED (patch req #2 — never ACTIVE on creation)
   *   - signalEntryTiming: scanner timing stored separately (patch req #3)
   *   - mode: AUTO_PAPER, userConfirmed: false (patch req #8)
   *   - full sizing transparency fields (patch req #5)
   */
  function createPositionRecord(signal, tier, sizing, btcContext) {
    const expiryMs = PENDING_EXPIRY_MS[String(btcContext).toLowerCase()] || PENDING_EXPIRY_MS.sideway;
    const signalId = signal.id || signal.signalId || `sig-${uid()}`;
    const persistedSetup = typeof window.getStructuralSetupLabel === 'function'
      ? window.getStructuralSetupLabel(signal)
      : (String(signal.setup || signal.structureTag || '').trim() || 'Unknown');

    return {
      /* Identity */
      id: `pos-${uid()}`,
      signalId,
      scanId: signal.scanId || null,
      symbol: String(signal.symbol || '').toUpperCase(),
      setup: persistedSetup,
      category: window.CATEGORY_ENGINE?.getCategory(signal.symbol) || 'OTHER',
      liquidityWarning: signal._liquidityWarning || null,
      _timeStopExtended: false,

      /* PATCH #8: paper trade metadata — immutable */
      mode: PAPER_MODE,   // always AUTO_PAPER
      userConfirmed: false,        // human has not confirmed real deployment

      /* Execution tier — set by this engine only */
      executionTier: tier,
      executionMode: 'OPTION_B',

      /* PATCH #2: lifecycle — always start ARMED, never skip to PENDING/ACTIVE */
      positionState: POS_STATE.ARMED,

      /* Price plan (immutable after creation) */
      entry: num(signal.entry || signal.price),
      stop: num(signal.stop),
      tp1: num(signal.tp1),
      tp2: num(signal.tp2),
      tp3: num(signal.tp3),

      /* PATCH #5: transparent sizing */
      rr: num(signal.rr),
      riskPctPerTrade: sizing.riskPctPerTrade,
      baseRiskPctPerTrade: sizing.baseRiskPctPerTrade || sizing.riskPctPerTrade,
      rawAllocationPct: sizing.rawAllocationPct,
      clampedAllocationPct: sizing.clampedAllocationPct,
      allocationPct: sizing.clampedAllocationPct,  // compat
      effectiveRiskPct: sizing.effectiveRiskPct,
      stopDistancePct: sizing.stopDistancePct,
      capitalPlanVersion: sizing.capitalPlan?.version || null,
      sizeBucket: sizing.sizeBucket || sizing.capitalPlan?.sizeBucket || null,
      riskBudgetPct: sizing.capitalPlan?.adjustedRiskPct ?? sizing.riskPctPerTrade,
      allocCapMultiplier: sizing.capitalPlan?.allocCapMultiplier ?? 1,
      guardReasons: Array.isArray(sizing.capitalPlan?.guardReasons) ? sizing.capitalPlan.guardReasons : [],

      /* PATCH #4: portfolio risk snapshot at creation */
      portfolioBeforeRiskPct: sizing.portfolioBeforeRiskPct,
      newRiskPct: sizing.newRiskPct,
      portfolioAfterRiskPct: sizing.portfolioAfterRiskPct,

      /* PATCH #3: scanner metadata — timing is signal hint, NOT position state */
      score: num(signal.score),
      executionConfidence: num(signal.executionConfidence),
      smartMoneyScore: num(signal.smartMoneyScore),
      chartEntryQuality: signal.chartEntryQuality,
      signalEntryTiming: signal.entryTiming || null,  // renamed from entryTiming — scanner hint only
      signalEntrySignal: signal.entrySignal || null,  // what triggered (whitelist value or null)
      fakePumpRisk: signal.fakePumpRisk,
      btcContext,
      vsaTag: signal.vsaTag,
      structureTag: signal.structureTag,

      /* Lifecycle timestamps */
      openedAt: now(),
      armedAt: now(),
      pendingAt: null,
      activeAt: null,
      expiresAt: now() + expiryMs,
      closedAt: null,
      invalidatedAt: null,
      invalidationReason: null,

      /* PATCH #9: outcome checkpoint tracking */
      tp1HitAt: null,
      tp2HitAt: null,
      tp3HitAt: null,
      stopHitAt: null,
      checkpointLog: [],  // array of { at, type, price }

      /* Outcome (filled on close) */
      actualExitPrice: null,
      outcomeR: null,
      outcomeNote: null,

      /* Audit trail */
      engineVersion: VERSION,
      createdAt: now(),
    };
  }

  /* ── Lifecycle Transitions ──────────────────────────────────────────── */

  /**
   * FIX #2: Condition-based ARMED → PENDING promotion.
   * Promotes ONLY if the signal's symbol is still appearing as a CANDIDATE
   * in the CURRENT scan batch — confirming the setup remains valid.
   *
   * NOT time-based: a 10-minute-old ARMED position stays ARMED until the
   * scanner re-confirms it. This prevents stale/ephemeral signals from
   * auto-promoting on a clock tick.
   *
   * @param {Array} positions        Open ARMED positions from DB.
   * @param {Array} currentSignals   Current scan batch (raw scanner output).
   */
  function promoteArmedToPending(positions, currentSignals = [], context = {}) {
    const t = now();
    // Build set of symbols still appearing as CANDIDATE in this scan
    const confirmedSymbols = new Set(
      (Array.isArray(currentSignals) ? currentSignals : [])
        .filter(s => classifySignalState(s, context) === SIGNAL_STATE.CANDIDATE)
        .map(s => String(s.symbol || '').toUpperCase())
    );
    return positions.map(p => {
      if (p.positionState !== POS_STATE.ARMED) return p;
      const sym = String(p.symbol || '').toUpperCase();
      if (confirmedSymbols.has(sym)) {
        return { ...p, positionState: POS_STATE.PENDING, pendingAt: t };
      }
      // Symbol gone from scanner → stays ARMED, awaiting re-confirmation
      return p;
    });
  }

  function expireStalePendingPositions(positions) {
    const t = now();
    return positions.map(p => {
      if ([POS_STATE.PENDING, POS_STATE.ARMED].includes(p.positionState)) {
        if (window.RISK_ENGINE && typeof window.RISK_ENGINE.evaluateTimeStop === 'function') {
          const timeStop = window.RISK_ENGINE.evaluateTimeStop(p, p.btcContext);
          if (timeStop.expired) {
            return { ...p, positionState: POS_STATE.EXPIRED, closedAt: t, invalidationReason: timeStop.reason };
          }
        } else if (p.expiresAt && t > p.expiresAt) {
          return { ...p, positionState: POS_STATE.EXPIRED, closedAt: t, invalidationReason: 'legacy_timeout' };
        }
      }
      return p;
    });
  }

  /**
   * FIX #1: BTC crash invalidation — downside only.
   * BEFORE: Math.abs(btcDropPct) — incorrectly invalidates when BTC is RISING.
   * AFTER : btcDropPct <= -threshold — triggers only on actual crash.
   *
   * btcDropPct must be a signed percentage:
   *   -12.5 = BTC dropped 12.5% → invalidate
   *   +8.0  = BTC rose 8% → do NOT invalidate
   *   0     = flat → do NOT invalidate
   */
  function invalidateOnBTCCrash(positions, btcDropPct, threshold = 8.0) {
    if (btcDropPct > -threshold) return positions;  // not a crash — includes flat & rising
    const t = now();
    return positions.map(p => {
      if ([POS_STATE.ARMED, POS_STATE.PENDING].includes(p.positionState)) {
        return { ...p, positionState: POS_STATE.INVALIDATED, closedAt: t, invalidationReason: `btc_crash_${btcDropPct.toFixed(1)}pct` };
      }
      return p;
    });
  }

  function closePosition(position, exitPrice, note = '') {
    const risk = num(position.entry) - num(position.stop);
    const actualR = risk > 0 ? (exitPrice - num(position.entry)) / risk : 0;
    return {
      ...position,
      positionState: actualR > 0 ? POS_STATE.CLOSED_WIN : POS_STATE.CLOSED_LOSS,
      closedAt: now(),
      actualExitPrice: exitPrice,
      outcomeR: Number(actualR.toFixed(3)),
      outcomeNote: note,
    };
  }

  /* ── Outcomes Checkpoint Engine (patch req #9) ───────────────────────── */

  /**
   * Check ACTIVE and PARTIAL_EXIT positions against current prices.
   * Returns array of checkpoint events to apply.
   *
   * @param {Array}  positions  Open positions with positionState ACTIVE/PARTIAL_EXIT
   * @param {Object} priceMap   { SYMBOL: currentPrice, ... }
   * @returns {Array} events: [{ positionId, type, price, at }]
   *
   * Event types:
   *   'stop_hit'   → price <= stop
   *   'tp1_hit'    → price >= tp1 (only if tp1HitAt is null)
   *   'tp2_hit'    → price >= tp2 (only if tp1 already hit)
   *   'tp3_hit'    → price >= tp3 (only if tp2 already hit, triggers CLOSED_WIN)
   */
  function evaluateCheckpoints(positions, priceMap = {}) {
    if (!Array.isArray(positions) || !priceMap || typeof priceMap !== 'object') return [];

    const events = [];
    const t = now();

    for (const pos of positions) {
      if (!OPEN_STATES.has(pos.positionState)) continue;
      if (![POS_STATE.ACTIVE, POS_STATE.PARTIAL_EXIT].includes(pos.positionState)) continue;

      const sym = String(pos.symbol || '').toUpperCase();
      const price = num(priceMap[sym]);
      if (price <= 0) continue;

      const entry = num(pos.entry);
      const stop = num(pos.stop);
      const tp1 = num(pos.tp1);
      const tp2 = num(pos.tp2);
      const tp3 = num(pos.tp3);

      // Stop hit (priority check — position closed immediately)
      if (stop > 0 && price <= stop) {
        events.push({
          positionId: pos.id, type: 'stop_hit', price, at: t,
          outcomeR: entry > 0 && stop < entry ? (price - entry) / (entry - stop) : null
        });
        continue; // no further checks for this position
      }

      // TP checkpoints (in order, only if previous hit)
      if (tp1 > 0 && price >= tp1 && !pos.tp1HitAt) {
        events.push({ positionId: pos.id, type: 'tp1_hit', price, at: t });
      }
      if (tp2 > 0 && price >= tp2 && pos.tp1HitAt && !pos.tp2HitAt) {
        events.push({ positionId: pos.id, type: 'tp2_hit', price, at: t });
      }
      if (tp3 > 0 && price >= tp3 && pos.tp2HitAt && !pos.tp3HitAt) {
        events.push({
          positionId: pos.id, type: 'tp3_hit', price, at: t,
          outcomeR: entry > stop && entry > 0 ? (price - entry) / (entry - stop) : null
        });
      }

      // Feature v9.5: Alpha Guard Time-Stop Integration (Timeframe-aware)
      if (window.RISK_ENGINE?.evaluateTimeStop) {
        const momentum = (price > entry && entry > 0) ? 1 : 0;
        const tsBtcContext = String(pos?.btcContext || 'sideway').toLowerCase();
        const tsResult = window.RISK_ENGINE.evaluateTimeStop(pos, tsBtcContext, momentum);

        if (tsResult.action === 'exit') {
          events.push({ positionId: pos.id, type: 'velocity_exit', at: t, price, reason: tsResult.reason });
        } else if (tsResult.action === 'extend') {
          events.push({ positionId: pos.id, type: 'velocity_extend', at: t, price });
        }
      }
    }
    return events;
  }

  /**
   * Apply checkpoint events to positions and return updated array + DB changes.
   * @returns { updatedPositions, dbChanges: [{ id, changes }] }
   */
  function applyCheckpoints(positions, events) {
    if (!events || !events.length) return { updatedPositions: positions, dbChanges: [] };
    const t = now();
    const eventMap = {};
    for (const ev of events) {
      if (!eventMap[ev.positionId]) eventMap[ev.positionId] = [];
      eventMap[ev.positionId].push(ev);
    }

    const dbChanges = [];
    const updatedPositions = positions.map(pos => {
      const posEvents = eventMap[pos.id];
      if (!posEvents || !posEvents.length) return pos;

      let updated = { ...pos };
      const log = [...(updated.checkpointLog || [])];

      for (const ev of posEvents) {
        log.push({ at: ev.at, type: ev.type, price: ev.price });
        if (ev.type === 'stop_hit') {
          const risk = num(updated.entry) - num(updated.stop);
          const actualR = risk > 0 ? (ev.price - num(updated.entry)) / risk : -1;
          updated = {
            ...updated, positionState: POS_STATE.CLOSED_LOSS, closedAt: t,
            stopHitAt: ev.at, actualExitPrice: ev.price, outcomeR: Number(actualR.toFixed(3))
          };
        } else if (ev.type === 'tp1_hit') {
          updated = { ...updated, positionState: POS_STATE.PARTIAL_EXIT, tp1HitAt: ev.at };
        } else if (ev.type === 'tp2_hit') {
          updated = { ...updated, tp2HitAt: ev.at };
        } else if (ev.type === 'tp3_hit') {
          updated = {
            ...updated, positionState: POS_STATE.CLOSED_WIN, closedAt: t,
            tp3HitAt: ev.at, actualExitPrice: ev.price,
            outcomeR: ev.outcomeR != null ? ev.outcomeR : updated.outcomeR
          };
        } else if (ev.type === 'velocity_exit') {
          const risk = num(updated.entry) - num(updated.stop);
          const actualR = (risk > 0) ? (ev.price - num(updated.entry)) / risk : 0;
          updated = {
            ...updated, positionState: POS_STATE.TIMED_OUT_EXIT, closedAt: t,
            actualExitPrice: ev.price, outcomeR: Number(actualR.toFixed(3)),
            invalidationReason: ev.reason || 'velocity_exhausted'
          };
        } else if (ev.type === 'velocity_extend') {
          updated = { ...updated, _timeStopExtended: true, _extendedAt: t };
        }
      }
      updated.checkpointLog = log;
      dbChanges.push({ id: pos.id, changes: { ...updated } });
      return updated;
    });
    return { updatedPositions, dbChanges };
  }

  /* ── Main Evaluate (patch req #10: NO_TRADE check at top) ───────────── */

  function evaluate(signals, portfolioContext = {}) {
    if (!Array.isArray(signals)) return { results: [], newPositions: [], summary: nullSummary() };

    const btcContext = String(portfolioContext.btcContext || 'sideway').toLowerCase();

    // v9.5 Alpha Guard: Pre-ranking for READY setups
    // FinalScore = (ScanScore * 0.4) + (Confidence * 30) + (RegimeFit * 20) + (LiquidityScore * 10)
    const rankedBatch = [...signals].map(s => {
      const scanScore = num(s.score);
      const confidence = num(s.executionConfidence);
      const regimeFit = window.PORTFOLIO_ENGINE?.getRegimeFitScore ? window.PORTFOLIO_ENGINE.getRegimeFitScore(s, btcContext) : 0.5;

      // Standardized Alpha Guard Liquidity Score (Risk Engine)
      const liqGate = window.RISK_ENGINE?.evaluateLiquidityGate ? window.RISK_ENGINE.evaluateLiquidityGate(s) : { liquidityScore: 0.5 };
      const liquidityScore = num(liqGate.liquidityScore, 0.5);

      const finalRankScore = (scanScore * 0.4) + (confidence * 30) + (regimeFit * 20) + (liquidityScore * 10);

      return {
        ...s,
        _alphaGuardRank: finalRankScore,
        _liquidityScore: liquidityScore,
        _regimeFit: regimeFit
      };
    }).sort((a, b) => b._alphaGuardRank - a._alphaGuardRank);

    // PATCH v9.8.2: soft unlock path — allow probe/playable evaluation in CHOP / reduced mode
    const softProbeUnlock = !!(
      portfolioContext?.regimeEngine?.allowProbe ||
      portfolioContext?.proEdgeSnap?.probeCapitalEnabled ||
      ['REDUCED', 'PROBE', 'SOFT'].includes(String(portfolioContext?.proEdgeSnap?.gateMode || '').toUpperCase()) || Number(portfolioContext?.proEdgeSnap?.playableCount || 0) > 0 || Number(portfolioContext?.proEdgeSnap?.matchingTradables || 0) > 0
    );

    // PATCH #10: NO_TRADE regime check
    if (_noTrade.active && !softProbeUnlock) {
      const adaptiveUnlock = btcContext === 'sideway' && rankedBatch.some(s => num(s.rr) >= 1.2 && num(s.executionConfidence) >= 0.58 && num(s.score) >= 24);
      if (!adaptiveUnlock) {
        const blockedResults = rankedBatch.map(s => ({
          symbol: String(s?.symbol || '').toUpperCase(),
          signalState: SIGNAL_STATE.WATCH,
          executionTier: EXEC_TIER.OBSERVE,
          pass: false,
          reason: `no_trade_regime:${_noTrade.reason}`,
          position: null,
          signal: s,
        }));
        const summary = nullSummary();
        summary.noTradeRegime = { active: true, reason: _noTrade.reason };
        return { results: blockedResults, newPositions: [], summary, scanSummary: buildScanSummary(signals, blockedResults) };
      }
      console.log('[EE-V9] Adaptive unlock: bypassing no-trade hard block in sideway due to viable playable candidates');
    }

    // const btcContext = String(portfolioContext.btcContext || 'sideway').toLowerCase(); // Removed - already declared above
    const openPositions = Array.isArray(portfolioContext.openPositions) ? portfolioContext.openPositions : [];

    // Feature 1: Sideway NO_TRADE — block PLAYABLE when no high-quality setup exists
    // A "high-quality sideway setup" = rr >= 2.0, conf >= 0.72, valid setup, no fake pump,
    //   NOT in a chop zone (from market insight)
    const marketInsight = portfolioContext.marketInsight || null;
    let sidewayPlayableBlocked = false;
    if (btcContext === 'sideway') {
      const isHighQuality = s => (
        num(s.rr) >= Math.max(1.3, SIDEWAY_HQ_FLOOR.rr - 0.7) &&
        num(s.executionConfidence) >= Math.max(0.50, SIDEWAY_HQ_FLOOR.conf - 0.22) &&
        VALID_SETUPS.has(normalizeSetup(s.setup)) &&
        String(s.fakePumpRisk || '').toLowerCase() !== 'high' &&
        !(marketInsight?.isChop && num(s.executionConfidence) < 0.50)
      );
      const highQualityCount = Array.isArray(signals) ? signals.filter(isHighQuality).length : 0;
      if (highQualityCount === 0 && !softProbeUnlock && !(portfolioContext?.proEdgeSnap && (Number(portfolioContext.proEdgeSnap.playableCount || 0) > 0 || Number(portfolioContext.proEdgeSnap.matchingTradables || 0) > 0))) {
        // No high-quality setup → PLAYABLE is blocked this cycle in sideway
        // PROBE still allowed at reduced density (handled by SIDEWAY_DENSITY_LIMITS)
        sidewayPlayableBlocked = true;
        console.log('[EE-V9] Sideway: no HQ setup → PLAYABLE blocked this cycle');
      }
    }

    // Track signalIds and symbols already in open positions for Re-binding (Elite Hardening)
    const openActivePositions = openPositions.filter(p => OPEN_STATES.has(p.positionState));
    const openSignalIds = new Set(openActivePositions.map(p => String(p.signalId || '')).filter(Boolean));
    const symbolToOpenPosition = new Map(openActivePositions.map(p => [String(p.symbol || '').toUpperCase(), p]));
    const idToOpenPosition = new Map(openActivePositions.map(p => [String(p.signalId || '').toUpperCase(), p]));

    const resolvedTotalEquity = Number(
      portfolioContext?.totalEquity ||
      window.ST?.sessionState?.totalEquity ||
      window.ST?.account?.totalEquity ||
      0
    );

    // Mutable context for sequential veto
    const liveCtx = {
      ...portfolioContext,
      regimeType: portfolioContext.regimeType || portfolioContext.regimeEngine?.type || null,
      totalEquity: resolvedTotalEquity,
      openPositions: [...openPositions],
      recentClosedPositions: portfolioContext.recentClosedPositions || [],
    };

    const results = [];
    const newPositions = [];
    const seenSymbols = new Set(openPositions.map(p => String(p.symbol || '').toUpperCase()));

    for (const rawSignal of rankedBatch) {
      if (!rawSignal || typeof rawSignal !== 'object') continue;

      const symbol = String(rawSignal.symbol || '').toUpperCase();
      const signalId = rawSignal.id || rawSignal.signalId || '';
      const signalState = classifySignalState(rawSignal, liveCtx);
      const signalStateReason = explainSignalState(rawSignal, liveCtx);
      const enriched = { ...rawSignal, signalState, evaluatedAt: now(), engineVersion: VERSION, totalEquity: resolvedTotalEquity };
      let gateResult = null;

      // Phase 1: Passive Momentum Observation (Metadata only, no logic influence)
      if (enriched.momentumDetected) {
        console.log(`[EE-V9] Passive Observation: ${symbol} has ${enriched.momentumPhase} momentum (Score: ${enriched.momentumScore})`);
        if (Array.isArray(enriched.momentumReason) && enriched.momentumReason.length > 0) {
          console.log(`[EE-V9] Behavioral Signs:`, enriched.momentumReason.join(', '));
        }
      }

      const reject = (reason, extra = {}) => {
        const rej = Array.isArray(extra?.rejections) ? extra.rejections : [];
        const trace = extra.authorityTrace || (gateResult ? gateResult.authorityTrace : null);
        const auth = buildAuthorityMeta({ tier: EXEC_TIER.OBSERVE, pass: false, reason, rejections: rej, authorityTrace: trace });

        // Write-back to original signal for UI consistency
        rawSignal.authorityTier = auth.authorityTier;
        rawSignal.authorityDecision = auth.authorityDecision;
        rawSignal.authorityBlockers = auth.authorityBlockers;
        rawSignal.authorityTrace = auth.authorityTrace;
        rawSignal.finalAuthorityStatus = auth.authorityTier;

        console.log(`[DEBUG-TRACE] Rejecting ${symbol}`, {
          reason,
          signalStateReason: extra?.signalStateReason || null,
          rejections: rej,
          authorityTrace: auth.authorityTrace
        });
        if (reason === 'all_tiers_rejected' && auth.authorityTrace?.rejectionSummary) {
          const summary = auth.authorityTrace.rejectionSummary;
          const formatted = formatTierRejectionSummary(summary);
          console.log(`[ALL TIERS TRACE] ${symbol} primary=${formatted.primaryText} tiers=${formatted.tierText}`, summary);
        }

        results.push({
          symbol, signalState, executionTier: EXEC_TIER.OBSERVE, pass: false,
          reason, position: null, signal: enriched,
          ...auth,
          authorityTrace: auth.authorityTrace,
          ...extra
        });
      };

      // Helper: build a pre-gate trace (no full tier evaluation occurred)
      const buildPreGateTrace = (blockReason) => {
        const moderateBullChop = isModerateBullChopSignal(enriched, liveCtx);
        const moderateSidewayChop = isModerateSidewayChopSignal(enriched, liveCtx);
        const sidewaySoftUnlock = moderateSidewayChop && hasAdaptiveSidewaySoftUnlock(liveCtx);
        const preGateFloors = sidewaySoftUnlock
          ? { ...SIDEWAY_CHOP_SOFT_PRE_GATE_FLOOR }
          : {
              rr: (moderateBullChop || moderateSidewayChop) ? 0.70 : 0.80,
              score: (moderateBullChop || moderateSidewayChop) ? 14 : 18,
              conf: (moderateBullChop || moderateSidewayChop) ? 0.48 : 0.50,
            };
        return {
          entrySignal: enriched.entrySignal || 'none',
          triggerMatched: VALID_TRIGGERS.has(normalizeTrigger(enriched.entrySignal)),
          expectancy: {},
          macro: {
            btcContext: String(liveCtx?.btcContext || enriched?.btcContext || 'sideway').toLowerCase(),
            regimeType: String(liveCtx?.regimeType || liveCtx?.regimeEngine?.type || enriched?.regimeType || 'unknown').toUpperCase(),
            moderateBullChop,
            moderateSidewayChop,
            sidewaySoftUnlock,
            preGateFloors,
          },
          rejectionsByTier: {
            READY:    [blockReason],
            PLAYABLE: [blockReason],
            PROBE:    [blockReason],
          }
        };
      };

      if (signalState !== SIGNAL_STATE.CANDIDATE) {
        const blockLabel = `pre_gate:${signalState.toLowerCase()}:${signalStateReason}`;
        reject(`pre_gate_blocked:${signalState}`, { authorityTrace: buildPreGateTrace(blockLabel), signalStateReason });
        continue;
      }
      if (signalId && openSignalIds.has(String(signalId).toUpperCase())) {
        const existing = idToOpenPosition.get(String(signalId).toUpperCase()) || symbolToOpenPosition.get(symbol);
        reject('dedup:signalId_has_open_position', { position: existing || null, authorityTrace: buildPreGateTrace('dedup:signal_already_open') });
        continue;
      }
      if (seenSymbols.has(symbol)) {
        const existing = symbolToOpenPosition.get(symbol);
        reject('dedup:symbol_in_batch_or_portfolio', { position: existing || null, authorityTrace: buildPreGateTrace('dedup:symbol_already_in_portfolio') });
        continue;
      }

      const portfolioBefore = liveCtx.openPositions.reduce((s, p) => s + num(p.riskPctPerTrade), 0);
      const scannerSummary = liveCtx.proEdgeSnap?.scannerSummary || liveCtx.scannerSummary || null;
      const marketInsight = liveCtx.marketInsight || null;

      gateResult = runExecutionGate(enriched, liveCtx, portfolioBefore, scannerSummary, marketInsight);
      const adaptiveSoftTier = getAdaptiveSoftTier(enriched, liveCtx);
      if (!gateResult.pass && adaptiveSoftTier) {
        gateResult = {
          tier: adaptiveSoftTier,
          pass: true,
          reason: `adaptive_unlock:${String(adaptiveSoftTier).toLowerCase()}`,
          rejections: gateResult.rejections || [],
          authorityTrace: gateResult.authorityTrace || null,
        };
      }

      // Feature 1: enforce sideway PLAYABLE block
      if (!gateResult.pass) {
        reject(gateResult.reason, { rejections: gateResult.rejections, authorityTrace: gateResult.authorityTrace });
        continue;
      }
      // v10.6.9.56-P5: Do NOT mutate gateResult.authorityTrace — create a new isolated object per coin
      const finalTrace = {
        ...(gateResult.authorityTrace || {}),
        macro: { btcContext, sidewayPlayableBlocked },
      };

      let effectiveTier = gateResult.tier;
      if (
        effectiveTier === EXEC_TIER.PROBE && (
          (num(enriched.rr) >= 1.8 && num(enriched.executionConfidence) >= 0.60) ||
          (softProbeUnlock && num(enriched.rr) >= 1.3 && num(enriched.executionConfidence) >= 0.50 && num(enriched.score) >= 20)
        ) && /breakout|trend-continuation|phase-candidate|early-phase-d|breakout_retest|trend continuation/.test(normalizeSetup(enriched.setup))) {
        effectiveTier = EXEC_TIER.PLAYABLE;
      }
      if (sidewayPlayableBlocked && gateResult.tier === EXEC_TIER.PLAYABLE) {
        const setupKey = String(enriched.setup || '').toLowerCase();
        const timingKey = String(enriched.entryTiming || enriched.signalEntryTiming || '').toLowerCase();
        const adaptivePlayable = !!(
          softProbeUnlock &&
          num(enriched.rr) >= 1.3 &&
          num(enriched.executionConfidence) >= 0.50 &&
          num(enriched.score) >= 20
        );
        const chopPlayableOverride = !!(
          softProbeUnlock &&
          (
            /breakout|trend-continuation|early-phase-d|phase d|phase-candidate|accumulation/.test(setupKey) ||
            /breakout|retest|reclaim|scalp|trigger|probe/.test(timingKey)
          ) &&
          num(enriched.rr) >= 1.3 &&
          num(enriched.executionConfidence) >= 0.50 &&
          num(enriched.score) >= 20
        );
        const chopProbeOverride = !!(
          softProbeUnlock &&
          (
            /breakout|trend-continuation|early-phase-d|phase d|phase-candidate|accumulation/.test(setupKey) ||
            /breakout|retest|reclaim|probe/.test(timingKey)
          ) &&
          num(enriched.rr) >= 1.0 &&
          num(enriched.executionConfidence) >= 0.48 &&
          num(enriched.score) >= 16
        );
        if (adaptivePlayable || chopPlayableOverride) {
          effectiveTier = EXEC_TIER.PLAYABLE;
          finalTrace.macro.playableOverride = true;
        } else if (chopProbeOverride) {
          effectiveTier = EXEC_TIER.PROBE;
          finalTrace.macro.probeOverride = true;
        } else {
          finalTrace.macro.playableBlocked = true;
          reject('sideway_no_hq_setup:playable_blocked', { rejections: ['sideway_playable_blocked_no_hq_setup'], authorityTrace: finalTrace });
          continue;
        }
      }

      // v10.5.1 REAL READY PROMOTE — patch in FINAL authority layer
      // Promote very strong sideway/neutral swing setups to READY after all gate adjustments.
      const readyPromoteEligible = (
        effectiveTier !== EXEC_TIER.READY &&
        VALID_TRIGGERS.has(normalizeTrigger(enriched.entrySignal)) &&
        num(enriched.rr) >= 2.2 &&
        num(enriched.executionConfidence) >= 0.62 &&
        num(enriched.score) >= 44 &&
        String(enriched.fakePumpRisk || '').toLowerCase() !== 'high' &&
        !BLOCKING_ENTRY_QUALITY.has(String(enriched.chartEntryQuality || '')) &&
        num(enriched.entry || enriched.price) > 0 &&
        num(enriched.stop) > 0 &&
        num(enriched.stop) < num(enriched.entry || enriched.price) &&
        btcContext !== 'bear'
      );
      if (readyPromoteEligible) {
        effectiveTier = EXEC_TIER.READY;
        finalTrace.promotion = { reason: 'ready_promote_eligible', from: gateResult.tier, to: EXEC_TIER.READY };
      }

      const tier = effectiveTier;
      const capitalPlan = window.CAPITAL_ENGINE?.computePlan
        ? window.CAPITAL_ENGINE.computePlan(enriched, tier, liveCtx, TIER_FLOORS[tier]?.riskPctPerTrade || 0, portfolioBefore)
        : null;
      if (!capitalPlan || !(Number(capitalPlan.totalEquity || 0) > 0)) {
        reject('capital_context_missing', { capitalPlan, rejections: ['capital_context_missing'] });
        continue;
      }
      if (capitalPlan && capitalPlan.allowed === false) {
        const capitalTrace = {
          ...(gateResult.authorityTrace || {}),
          capital: buildCapitalTrace(capitalPlan),
        };
        console.log('[CAPITAL TRACE]', symbol, capitalTrace.capital);
        reject(`capital_guard:${(capitalPlan.guardReasons || []).join('|')}`, {
          capitalPlan,
          rejections: Array.isArray(capitalPlan.guardReasons) ? capitalPlan.guardReasons : [],
          authorityTrace: capitalTrace
        });
        continue;
      }
      const sizing = computePositionSize(enriched, tier, portfolioBefore, capitalPlan);
      if (!sizing.valid) { reject(`sizing_failed:${sizing.reason}`); continue; }

      // APPROVED
      const finalPassReason = finalTrace?.promotion?.reason
        ? `${String(gateResult.reason || 'gate_passed').trim()} -> ${String(finalTrace.promotion.reason).trim()}`
        : gateResult.reason;
      const auth = buildAuthorityMeta({ tier, pass: true, reason: finalPassReason, rejections: [], authorityTrace: finalTrace });


      // v10.6.9.51 Absolute Contract Write-back
      rawSignal.finalAuthorityStatus = auth.finalAuthorityStatus;
      rawSignal.displayStatus = auth.displayStatus;
      rawSignal.authorityDecision = auth.authorityDecision;
      rawSignal.authorityTrace = auth.authorityTrace;
      rawSignal.status = auth.displayStatus; // Legacy sync

      const position = createPositionRecord(enriched, tier, sizing, btcContext);
      seenSymbols.add(symbol);
      if (signalId) openSignalIds.add(signalId);
      liveCtx.openPositions.push({ symbol, riskPctPerTrade: sizing.riskPctPerTrade, openedAt: now() });

      newPositions.push(position);
      results.push({
        symbol, signalState, executionTier: tier, pass: true,
        reason: finalPassReason, rejections: [],
        ...auth,
        authorityTrace: auth.authorityTrace,
        position,
        capitalPlan,
        signal: {
          ...enriched,
          executionTier: tier,
          ...auth,
          allocationPct: sizing.clampedAllocationPct,
          rawAllocationPct: sizing.rawAllocationPct,
          effectiveRiskPct: sizing.effectiveRiskPct,
          riskPctPerTrade: sizing.riskPctPerTrade,
          baseRiskPctPerTrade: sizing.baseRiskPctPerTrade || sizing.riskPctPerTrade,
          sizeBucket: sizing.sizeBucket || capitalPlan?.sizeBucket || null,
          riskBudgetPct: capitalPlan?.adjustedRiskPct ?? sizing.riskPctPerTrade,
          allocCapMultiplier: capitalPlan?.allocCapMultiplier ?? 1,
        },
      });
    }

    // Feature #5: scanSummary — align scan counts with dashboard
    const scanSummary = buildScanSummary(signals, results);
    return { results, newPositions, summary: buildSummary(results, newPositions, btcContext), scanSummary };
  }

  /* ── Scan Summary (Feature #5) ────────────────────────────────────────── */

  /**
   * Build scan count summary for dashboard alignment (Feature #5).
   * Traces: total scanner output → candidate → deduped → gate → gate-passed.
   * Feature #3: WATCH signals never appear in execution panel — excluded from results.
   */
  function buildScanSummary(rawSignals, results) {
    const total = Array.isArray(rawSignals) ? rawSignals.length : 0;
    const gatePassed = results.filter(r => r.pass).length;
    const deduped = results.filter(r => !r.pass && String(r.reason || '').startsWith('dedup:')).length;
    const preGate = results.filter(r => !r.pass && String(r.reason || '').startsWith('pre_gate_blocked:')).length;
    const gateRej = results.filter(r => !r.pass && !String(r.reason || '').startsWith('dedup:') && !String(r.reason || '').startsWith('pre_gate_blocked:')).length;
    const byReason = {};
    for (const r of results.filter(r => !r.pass)) {
      const key = String(r.reason || 'unknown').split(':')[0];
      byReason[key] = (byReason[key] || 0) + 1;
    }
    return { total, candidate: total - preGate, gatePassed, deduped, gateRejected: gateRej, preGateBlocked: preGate, byReason };
  }

  /* ── Summary Builder (patch req #4) ─────────────────────────────────── */

  function buildSummary(results, newPositions, btcContext) {
    const gatePassed = results.filter(r => r.pass);
    const rejected = results.filter(r => !r.pass);
    const byTier = {};
    for (const t of Object.values(EXEC_TIER)) byTier[t] = 0;
    for (const r of gatePassed) byTier[r.executionTier] = (byTier[r.executionTier] || 0) + 1;

    const limits = PORTFOLIO_LIMITS[btcContext] || PORTFOLIO_LIMITS.sideway;
    const portfolioBefore = newPositions.length ? num(newPositions[0].portfolioBeforeRiskPct) / 100 : 0;
    const totalNewRisk = newPositions.reduce((s, p) => s + num(p.riskPctPerTrade), 0);
    const totalBaseRisk = newPositions.reduce((s, p) => s + num(p.baseRiskPctPerTrade || p.riskPctPerTrade), 0);
    const portfolioAfter = portfolioBefore + totalNewRisk;
    const totalAlloc = newPositions.reduce((s, p) => s + num(p.clampedAllocationPct), 0);
    const avgRR = gatePassed.length ? gatePassed.reduce((s, r) => s + num(r.signal?.rr), 0) / gatePassed.length : 0;
    const capitalBlocked = rejected.filter(r => String(r.reason || '').startsWith('capital_guard:'));
    const sizeBuckets = { FULL: 0, MEDIUM: 0, SMALL: 0 };
    newPositions.forEach(p => { const b = String(p.sizeBucket || '').toUpperCase(); if (sizeBuckets[b] != null) sizeBuckets[b] += 1; });

    return {
      engineVersion: VERSION,
      mode: PAPER_MODE,
      noTradeRegime: { active: _noTrade.active, reason: _noTrade.reason },
      generatedAt: now(),
      btcContext,
      counts: {
        total: results.length,
        gatePassed: gatePassed.length,
        rejected: rejected.length,
        byTier,
        actionable: (byTier[EXEC_TIER.READY] || 0) + (byTier[EXEC_TIER.PLAYABLE] || 0) + (byTier[EXEC_TIER.PROBE] || 0),
        hardActionable: byTier[EXEC_TIER.READY] || 0,
        softTradables: (byTier[EXEC_TIER.PLAYABLE] || 0) + (byTier[EXEC_TIER.PROBE] || 0),
        optionB: {
          readyRiskPct: TIER_FLOORS[EXEC_TIER.READY].riskPctPerTrade,
          playableRiskPct: TIER_FLOORS[EXEC_TIER.PLAYABLE].riskPctPerTrade,
          probeRiskPct: TIER_FLOORS[EXEC_TIER.PROBE].riskPctPerTrade,
        },
      },
      regimeEngine: null,
      portfolio: {
        executionMode: 'OPTION_B',
        newPaperPositions: newPositions.length,
        portfolioBeforeRiskPct: pct(portfolioBefore),
        totalNewRiskPct: pct(totalNewRisk),
        totalBaseRiskPct: pct(totalBaseRisk),
        portfolioAfterRiskPct: pct(portfolioAfter),
        riskUtilPct: limits.maxTotalRiskPct > 0 ? pct(portfolioAfter / limits.maxTotalRiskPct, 1) : 0,
        maxRiskPct: pct(limits.maxTotalRiskPct, 0),
        maxConcurrent: limits.maxConcurrent,
        totalAllocPct: pct(totalAlloc),
        sizeBuckets,
      },
      capitalAllocator: {
        version: window.CAPITAL_ENGINE?.VERSION || null,
        blocked: capitalBlocked.length,
        blockedReasons: [...new Set(capitalBlocked.map(r => String(r.reason || '').replace('capital_guard:', '')))],
      },
      avgRR: Number(avgRR.toFixed(2)),
      topSignals: newPositions.slice(0, 5).map(p => ({
        symbol: p.symbol,
        tier: p.executionTier,
        state: p.positionState,
        rr: p.rr,
        rawAllocPct: pct(p.rawAllocationPct, 1),
        clampedAllocPct: pct(p.clampedAllocationPct, 1),
        effectiveRiskPct: pct(p.effectiveRiskPct, 2),
        riskPct: pct(p.riskPctPerTrade, 2),
        baseRiskPct: pct(p.baseRiskPctPerTrade || p.riskPctPerTrade, 2),
        sizeBucket: p.sizeBucket || null,
        riskBudgetPct: pct(p.riskBudgetPct || p.riskPctPerTrade, 2),
        stopDist: pct(p.stopDistancePct, 1),
        portfolioBefore: p.portfolioBeforeRiskPct,
        portfolioAfter: p.portfolioAfterRiskPct,
        mode: p.mode,
        userConfirmed: p.userConfirmed,
        signalEntryTiming: p.signalEntryTiming,
      })),
    };
  }
  function nullSummary() { return buildSummary([], [], 'sideway'); }

  /* ── DB Helpers ─────────────────────────────────────────────────────── */

  async function persistPositions(positions) {
    if (!window.DB_V9?.addPositions) {
      console.warn('[EE-V9] DB_V9.addPositions not available'); return 0;
    }
    try {
      const existing = await loadOpenPositions();
      const storedIds = new Set(existing.map(p => String(p.signalId || '')).filter(Boolean));
      const toWrite = positions.filter(p => !p.signalId || !storedIds.has(p.signalId));
      if (toWrite.length < positions.length)
        console.log(`[EE-V9] Dedup: skipped ${positions.length - toWrite.length} duplicate(s)`);
      if (!toWrite.length) return 0;
      return await window.DB_V9.addPositions(toWrite);
    } catch (err) { console.error('[EE-V9] persistPositions failed:', err); return 0; }
  }

  function debugMissingTrace(c, trace) {
    if (!trace) {
      if (c.symbol && (c.executionTier || c.status) && c.status !== 'WATCH') {
        console.log(`[TRACE_DEBUG] Symbol ${c.symbol} missing trace. Status: ${c.status}, TraceValue:`, trace, "Keys:", Object.keys(c));
      }
      return '';
    }
    return trace;
  }

  async function updatePosition(id, changes) {
    if (!window.DB_V9?.updatePosition) return null;
    try { return await window.DB_V9.updatePosition(id, changes); }
    catch (err) { console.error('[EE-V9] updatePosition failed:', err); return null; }
  }

  async function loadOpenPositions() {
    if (!window.DB_V9?.getPositions) return [];
    try {
      return ((await window.DB_V9.getPositions()) || []).filter(p => OPEN_STATES.has(p.positionState));
    } catch { return []; }
  }

  async function loadRecentClosed(withinMs = 48 * 60 * 60 * 1000) {
    if (!window.DB_V9?.getPositions) return [];
    try {
      const cutoff = now() - withinMs;
      return ((await window.DB_V9.getPositions()) || []).filter(p =>
        CLOSED_STATES.has(p.positionState) && num(p.closedAt) >= cutoff
      );
    } catch { return []; }
  }

  /* ── Main Orchestrator ──────────────────────────────────────────────── */

  /**
   * Full pipeline — call after every scan cycle:
   *   await EXECUTION_ENGINE_V9.run(scannerSignals, btcContext, btcDropPct, priceMap)
   *
   * priceMap optional: { SYMBOL: currentPrice } for checkpoint evaluation (patch req #9)
   */
  async function run(scannerSignals, btcContext = 'sideway', btcDropPct = 0, priceMap = null) {
    try {
      // 1. Load
      let open = await loadOpenPositions();
      const recentClosed = await loadRecentClosed();

      // 2. PATCH #9: checkpoint evaluation (before lifecycle updates)
      let checkpointDbChanges = [];
      if (priceMap && typeof priceMap === 'object') {
        const chkEvents = evaluateCheckpoints(open, priceMap);
        if (chkEvents.length) {
          const { updatedPositions, dbChanges } = applyCheckpoints(open, chkEvents);
          open = updatedPositions;
          checkpointDbChanges = dbChanges;
          for (const { id, changes } of dbChanges) await updatePosition(id, changes);
          console.log(`[EE-V9] Checkpoints: ${chkEvents.length} events applied`);
        }
      }

      // 3. FIX #2: ARMED → PENDING promotion — condition-based (current scan confirms signal)
      const afterArm = promoteArmedToPending(open, scannerSignals, { btcContext });
      const promoted = afterArm.filter((p, i) => p.positionState !== open[i].positionState);
      for (const p of promoted) await updatePosition(p.id, { positionState: p.positionState, pendingAt: p.pendingAt });

      // 4. Expiry
      const afterExpiry = expireStalePendingPositions(afterArm);
      const expired = afterExpiry.filter((p, i) => p.positionState !== afterArm[i].positionState);
      for (const p of expired) await updatePosition(p.id, { positionState: p.positionState, closedAt: p.closedAt, invalidationReason: p.invalidationReason });
      open = afterExpiry.filter(p => OPEN_STATES.has(p.positionState));

      // 5. FIX #1: BTC crash — downside only (btcDropPct <= -threshold)
      const afterCrash = invalidateOnBTCCrash(open, btcDropPct);
      const crashed = afterCrash.filter((p, i) => p.positionState !== open[i].positionState);
      for (const p of crashed) await updatePosition(p.id, { positionState: p.positionState, closedAt: p.closedAt, invalidationReason: p.invalidationReason });
      open = afterCrash.filter(p => OPEN_STATES.has(p.positionState));

      // 5b. Auto NO_TRADE hooks (BTC breakdown)
      const autoNoTrade = evaluateAutoNoTrade({ btcCrashCount: crashed.length });
      if (autoNoTrade?.shouldActivate && !_noTrade.active) {
        setNoTradeRegime(true, autoNoTrade.reason, autoNoTrade.source);
      }

      // 5b2. Regime Engine must be initialized BEFORE PRO_EDGE soft-unlock checks.
      // v9.8.5 clean fix: avoid TDZ crash (Cannot access 'regimeEngine' before initialization).

      // 5c. Feature 4: Market Insight — chop/fake-breakout/low-vol detection
      let marketInsight = null;
      if (window.MARKET_INSIGHT?.evaluate) {
        try {
          marketInsight = window.MARKET_INSIGHT.evaluate(scannerSignals, btcContext);
          if (marketInsight?.hasWarnings) {
            console.log(`[EE-V9] Market insight warnings: ${marketInsight.warnings.join(', ')} (quality=${marketInsight.regimeQuality})`);
          }
        } catch (err) {
          console.warn('[EE-V9] Market insight fallback:', err?.message || err);
        }
      }

      // 5d. Regime Engine — richer phase / breakout classification for capital biasing
      let regimeEngine = null;
      try {
        if (window.REGIME_ENGINE?.evaluate) {
          regimeEngine = window.REGIME_ENGINE.evaluate(scannerSignals, btcContext, marketInsight);
        }
      } catch (err) {
        console.warn('[EE-V9] Regime engine fallback:', err?.message || err);
      }
      if (!regimeEngine || typeof regimeEngine !== 'object') {
        regimeEngine = {
          type: 'NEUTRAL',
          confidence: 0.5,
          breakoutProbability: 0,
          allowProbe: true,
          allowReady: false,
          blockTrading: false,
          reason: 'fallback_regime_engine'
        };
      }
      if (regimeEngine?.type) {
        console.log(`[EE-V9] Regime Engine: ${regimeEngine.type} conf=${Math.round((regimeEngine.confidence || 0) * 100)}%`);
      }

      // 5e. Feature 5: PRO_EDGE gate veto — must not allocate if PRO_EDGE says DISABLED
      let proEdgeSnap = null;
      try {
        proEdgeSnap = window.PRO_EDGE?.getSnapshot ? await window.PRO_EDGE.getSnapshot() : null;
      } catch (_) { }
      const currentSoftCandidateCount = (Array.isArray(scannerSignals) ? scannerSignals : []).filter(s => {
        const setup = normalizeSetup(s?.setup || s?.structureTag);
        const rr = num(s?.rr);
        const conf = num(s?.executionConfidence);
        const score = num(s?.score);
        const fake = String(s?.fakePumpRisk || '').toLowerCase();
        const entry = num(s?.entry || s?.price);
        const stop = num(s?.stop);
        if (!VALID_SETUPS.has(setup)) return false;
        if (fake === 'high') return false;
        if (entry <= 0 || stop <= 0 || stop >= entry) return false;
        if (btcContext === 'bear') {
          return rr >= 1.35 && conf >= 0.58 && score >= 22;
        }
        return rr >= 1.15 && conf >= 0.48 && score >= 18;
      }).length;
      const proEdgeReason = String(proEdgeSnap?.gateReason || '').toLowerCase();
      const missingActionOnly = /no actionable setup|không có actionable setup/.test(proEdgeReason);
      const moderateSoftUnlock = currentSoftCandidateCount > 0 && (btcContext !== 'bear' || regimeEngine?.allowProbe);
      if (proEdgeSnap?.disableTrading && missingActionOnly && moderateSoftUnlock) {
        proEdgeSnap = {
          ...proEdgeSnap,
          disableTrading: false,
          gateMode: 'REDUCED',
          gateReason: `moderate_soft_unlock:${currentSoftCandidateCount}_current_candidates`,
          probeCapitalEnabled: true,
          matchingTradables: Math.max(Number(proEdgeSnap?.matchingTradables || 0), currentSoftCandidateCount),
          playableCount: Math.max(Number(proEdgeSnap?.playableCount || 0), btcContext === 'bear' ? 0 : currentSoftCandidateCount),
        };
        console.log(`[EE-V9] PRO_EDGE soft bypass: ${currentSoftCandidateCount} candidates allowed past meta gate (${btcContext})`);
      }
      const proEdgeSoftUnlock = !!(
        proEdgeSnap?.probeCapitalEnabled ||
        ['REDUCED', 'PROBE', 'SOFT'].includes(String(proEdgeSnap?.gateMode || '').toUpperCase()) ||
        regimeEngine?.allowProbe || regimeEngine?.allowReady
      );
      if (proEdgeSnap?.disableTrading && !_noTrade.active && !proEdgeSoftUnlock && Number(proEdgeSnap?.playableCount || 0) === 0 && Number(proEdgeSnap?.matchingTradables || 0) === 0) {
        setNoTradeRegime(true, `pro_edge_gate:${proEdgeSnap.gateReason || 'disabled'}`, 'proEdge');
        console.log(`[EE-V9] PRO_EDGE hard veto: disableTrading=${proEdgeSnap.disableTrading} mode=${proEdgeSnap.gateMode}`);
      } else if (proEdgeSnap?.disableTrading && proEdgeSoftUnlock) {
        console.log(`[EE-V9] PRO_EDGE soft veto bypassed: mode=${proEdgeSnap.gateMode} probeCapital=${!!proEdgeSnap.probeCapitalEnabled}`);
      }
      // REDUCED / PROBE mode: probe allowed, playable may be downgraded in evaluate()

      // 5f. Feature #1: Outcome Engine — update MFE/MAE for ACTIVE positions
      let excursionUpdates = 0;
      if (priceMap && typeof priceMap === 'object' && window.OUTCOME_ENGINE) {
        excursionUpdates = await window.OUTCOME_ENGINE.updateExcursions(priceMap);
      }

      // 5d. Feature #2: Promotion Engine — PENDING→ACTIVE + PROBE→PLAYABLE
      let activations = [], tierPromotions = [];
      if (priceMap && typeof priceMap === 'object' && window.PROMOTION_ENGINE) {
        // v9.5 Alpha Guard: Validate all transitions before running promotion engine
        const validOpen = open.map(p => {
          // If an ARMED position is forced to ACTIVE without PENDING (illegal jump)
          // we mark it as REJECTED_STATE
          if (p.positionState === POS_STATE.ARMED && priceMap[p.symbol]) {
            // Attempted jump detection (if price hits entry while still ARMED)
            // In v9.5, we allow this if we auto-promote to PENDING first in step 3
          }
          return p;
        });

        const promoResult = window.PROMOTION_ENGINE.run(validOpen, priceMap);
        activations = promoResult.activations || [];
        tierPromotions = promoResult.tierPromotions || [];
        for (const { id, changes } of promoResult.dbChanges || []) {
          // Check for illegal jumps in promotion engine output
          const original = open.find(o => o.id === id);
          if (original && original.positionState === POS_STATE.ARMED && changes.positionState === POS_STATE.ACTIVE) {
            console.warn(`[EE-V9] Illegal jump detected for ${original.symbol}: ARMED -> ACTIVE. Forcing REJECTED_STATE.`);
            changes.positionState = POS_STATE.REJECTED_STATE;
            changes.invalidationReason = 'illegal_state_jump_armed_to_active';
          }
          await updatePosition(id, changes);
        }
        if (activations.length) console.log(`[EE-V9] Activated: ${activations.map(a => a.symbol).join(',')}`);
        if (tierPromotions.length) console.log(`[EE-V9] Tier promoted: ${tierPromotions.map(t => `${t.symbol} PROBE→PLAYABLE`).join(',')}`);
      }

      const regimeSoftUnlock = !!(regimeEngine?.allowProbe || regimeEngine?.allowReady);
      if (regimeEngine?.blockTrading && !_noTrade.active && !regimeSoftUnlock) {
        setNoTradeRegime(true, `regime_engine:${String(regimeEngine.type || 'CHOP').toLowerCase()}`, 'regimeEngine');
      } else if (((!regimeEngine?.blockTrading) || regimeSoftUnlock) && _noTrade.autoSource === 'regimeEngine') {
        setNoTradeRegime(false);
      }

      // 6. Evaluate new signals (Feature #3 WATCH filter, Feature 1 sideway block)
      const runtimeTotalEquity = Number(window.ST?.sessionState?.totalEquity || 0) || Number(window.ST?.account?.totalEquity || 0) || 0;
      console.log(`[AUTHORITY] signals=${scannerSignals?.length || 0} btc=${btcContext} equity=${runtimeTotalEquity || 'missing'} priceMap=${priceMap && typeof priceMap === 'object' ? 'yes' : 'no'} positions=${open.length}`);
      const { results, newPositions, summary, scanSummary } = evaluate(scannerSignals, {
        btcContext,
        regimeType: regimeEngine?.type || null,
        regimeEngine,
        openPositions: open,
        recentClosedPositions: recentClosed,
        marketInsight,      // Feature 4 + 1: passed to evaluate for HQ check
        proEdgeSnap,        // Feature 5: passed for summary enrichment
        totalEquity: runtimeTotalEquity,
      });
      if (summary) summary.regimeEngine = regimeEngine || null;
      if (scanSummary) scanSummary.regimeEngine = regimeEngine || null;

      // 7. Persist
      let persisted = 0;
      if (newPositions.length > 0) persisted = await persistPositions(newPositions);

      console.log(
        `[EE-V9 ${VERSION}] ${scannerSignals?.length || 0} signals │ ` +
        `${results.filter(r => r.pass).length} gate-passed │ ` +
        `new-paper:${newPositions.length} persisted:${persisted} │ ` +
        `ARMED→PENDING:${promoted.length} expired:${expired.length} crashed:${crashed.length} │ ` +
        `activated:${activations.length} promoted:${tierPromotions.length} excursions:${excursionUpdates} │ ` +
        `chk:${checkpointDbChanges.length} NO_TRADE:${_noTrade.active ? _noTrade.reason : 'off'}`
      );

      return {
        ...summary, results, newPositions, scanSummary, regimeEngine,
        meta: {
          promoted: promoted.length,
          expired: expired.length,
          crashed: crashed.length,
          persisted,
          checkpoints: checkpointDbChanges.length,
          activations: activations.length,
          tierPromotions: tierPromotions.length,
          excursionUpdates,
          noTrade: _noTrade.active,
        },
      };
    } catch (err) {
      console.error('[EE-V9] Pipeline error:', err);
      const msg = String(err?.message || err || '');
      if (msg.includes('FATAL_GATE_ERROR') || msg.includes('PORTFOLIO_ENGINE_DOWN')) throw err;
      return { ...nullSummary(), error: err.message };
    }
  }

  /* ── Public API ─────────────────────────────────────────────────────── */

  /**
   * Layer contract (enforced by design, not runtime):
   *   executionTier      ← set by runExecutionGate() ONLY
   *   positionState      ← set by lifecycle functions ONLY
   *   signalEntryTiming  ← scanner metadata stored on position.signalEntryTiming ONLY
   *
   * Feature #3: WATCH signals receive ZERO allocation — enforcement is in gate.
   *             evaluate() results only expose gate-passed + gate-rejected signals.
   *             Pure WATCH signals are excluded from enriched results entirely.
   */
  return {
    VERSION, PAPER_MODE,
    SIGNAL_STATE, EXEC_TIER, POS_STATE,
    TIER_FLOORS, PORTFOLIO_LIMITS,
    VALID_TRIGGERS,
    OPEN_STATES, CLOSED_STATES,

    // NO_TRADE regime
    setNoTradeRegime,
    getNoTradeRegime,
    evaluateAutoNoTrade,

    // Core pipeline
    run,

    // Exposed for testing / audit / dashboard
    evaluate,
    classifySignalState,
    runExecutionGate,
    runPortfolioVeto,
    computePositionSize,
    normalizeTrigger,
    buildAuthorityMeta,
    checkPlayablePath,       // Feature #4 + v9.3.1 (raised conf + RR downgrade)
    getAdaptiveSoftTier,
    buildScanSummary,        // Feature #5: alignment
    SIDEWAY_DENSITY_LIMITS,  // Feature 3: exposed for tests
    SIDEWAY_HQ_FLOOR,        // Feature 1: exposed for tests

    // Position lifecycle
    createPositionRecord,
    promoteArmedToPending,
    expireStalePendingPositions,
    invalidateOnBTCCrash,
    closePosition,

    // Outcomes checkpoint engine
    evaluateCheckpoints,
    applyCheckpoints,

    // DB helpers
    loadOpenPositions,
    loadRecentClosed,
    persistPositions,
    updatePosition,
  };
})();
