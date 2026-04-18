/* ══════════════════════════════════════════════════════════════════════════
   OUTCOME ENGINE — MFE / MAE / Expectancy Tracker
   VERSION: v1.0.0 (SystemTrader v8790 — pre-v9.3)
   ──────────────────────────────────────────────────────────────────────────
   Responsibilities:
     1. Track Max Favorable / Adverse Excursion on ACTIVE positions
        (called every scan cycle with current price map)
     2. Compute outcomes on position close (stop / TP)
     3. Expose win rate, average RR, and expectancy per setup type and tier

   DB: reads/writes from existing `positions` store via DB_V9.
       Closed positions are the source of truth for all stat computation.

   Layer contract:
     - READS positionState from positions — never sets it
     - WRITES mfe, mae, mfePct, maePct, mfeR, maeR to position record
     - computeStats() is read-only — no mutations
   ══════════════════════════════════════════════════════════════════════════ */

window.OUTCOME_ENGINE = (() => {
  'use strict';

  const VERSION = 'v1.0.0';

  /* ── Utilities ──────────────────────────────────────────────────────── */

  function num(v, d = 0) { const n = Number(v); return Number.isFinite(n) ? n : d; }
  function pct(v, dp = 2) { return Number((v * 100).toFixed(dp)); }
  function roundR(v) { return Number(num(v).toFixed(3)); }
  function now() { return Date.now(); }

  const ACTIVE_STATES = new Set(['ACTIVE', 'PARTIAL_EXIT']);
  const CLOSED_STATES = new Set(['CLOSED_WIN', 'CLOSED_LOSS', 'EXPIRED', 'INVALIDATED']);

  function getDB() { return window.DB_V9 || window.DB || null; }

  /* ── MFE / MAE Update (call every scan cycle) ───────────────────────── */

  /**
   * Update Max Favorable / Adverse Excursion for all ACTIVE positions.
   *
   * MFE = highest price reached above entry during position life (for longs).
   *       Represents the best opportunity the position ever had.
   * MAE = lowest price reached below entry during position life.
   *       Represents the maximum drawdown the position survived.
   *
   * Both stored as absolute, %, and R-multiple for analysis.
   *
   * @param {Object} priceMap  { 'SYMBOL': currentPrice, ... }
   */
  async function updateExcursions(priceMap) {
    const db = getDB();
    if (!db || typeof priceMap !== 'object') return 0;

    let updated = 0;
    try {
      const all = await db.getPositions();
      const active = (all || []).filter(p => ACTIVE_STATES.has(p.positionState));

      for (const pos of active) {
        const sym   = String(pos.symbol || '').toUpperCase();
        const price = num(priceMap[sym]);
        if (price <= 0) continue;

        const entry = num(pos.entry);
        const stop  = num(pos.stop);
        const risk  = entry > stop && stop > 0 ? entry - stop : entry * 0.05; // fallback 5%

        // Current excursions
        const currentMFE = num(pos.mfe, entry);
        const currentMAE = num(pos.mae, entry);

        const newMFE = Math.max(currentMFE, price);
        const newMAE = Math.min(currentMAE, price);

        // Only update if changed
        if (newMFE === currentMFE && newMAE === currentMAE) continue;

        const changes = {
          mfe:    newMFE,
          mae:    newMAE,
          mfePct: pct((newMFE - entry) / entry),
          maePct: pct((newMAE - entry) / entry),
          mfeR:   roundR((newMFE - entry) / risk),
          maeR:   roundR((newMAE - entry) / risk),   // negative = drawdown below entry
          priceLastChecked: price,
          excursionUpdatedAt: now(),
        };

        await db.updatePosition(pos.id, changes);
        updated++;
      }
    } catch (err) {
      console.error('[OUTCOME-ENGINE] updateExcursions failed:', err);
    }
    return updated;
  }

  /* ── Outcome Finalization (call on position close) ───────────────────── */

  /**
   * Finalize outcome metrics when a position is closed.
   * Adds timeToOutcomeMs, stopHit, tp flags, and realizedR.
   * Returns the enriched changes object (caller must persist via DB).
   *
   * @param {Object} position  Closed position record
   * @returns {Object} changes to merge into position
   */
  function finalizeOutcome(position) {
    if (!position) return {};
    const entry     = num(position.entry);
    const exitPrice = num(position.actualExitPrice);
    const stop      = num(position.stop);
    const risk      = entry > stop && stop > 0 ? entry - stop : entry * 0.05;

    const realizedR = risk > 0 ? roundR((exitPrice - entry) / risk) : 0;
    const activeAt  = num(position.activeAt || position.openedAt);
    const closedAt  = num(position.closedAt || now());
    const timeToOutcomeMs = closedAt - activeAt;

    return {
      realizedR,
      stopHit:         exitPrice <= stop && stop > 0,
      tp1Hit:          position.tp1HitAt != null,
      tp2Hit:          position.tp2HitAt != null,
      tp3Hit:          position.tp3HitAt != null,
      timeToOutcomeMs: timeToOutcomeMs > 0 ? timeToOutcomeMs : null,
      timeToOutcomeH:  timeToOutcomeMs > 0 ? roundR(timeToOutcomeMs / (60 * 60 * 1000)) : null,
      outcomeFinalized: true,
      outcomeR:        realizedR,
    };
  }

  /* ── Stats Computation (read-only) ─────────────────────────────────── */

  /**
   * Compute win rate, average RR, and expectancy from closed positions.
   *
   * Expectancy = (winRate × avgWin_R) + (lossRate × avgLoss_R)
   * Positive expectancy → system has edge. Negative → do not scale live.
   *
   * @param {Array} [closedPositions]  Optional pre-loaded array (avoids re-read)
   * @returns {Object} stats by setup, tier, and overall
   */
  async function computeStats(closedPositions = null) {
    const db = getDB();
    let positions = closedPositions;

    if (!positions) {
      try {
        const all = await db?.getPositions() || [];
        positions  = all.filter(p => ['CLOSED_WIN', 'CLOSED_LOSS'].includes(p.positionState));
      } catch (err) {
        console.error('[OUTCOME-ENGINE] computeStats: DB read failed:', err);
        return emptyStats();
      }
    } else {
      positions = positions.filter(p => ['CLOSED_WIN', 'CLOSED_LOSS'].includes(p.positionState));
    }

    if (!positions.length) return emptyStats();

    function statsFor(group) {
      const n       = group.length;
      if (!n) return { n: 0, winRate: 0, avgRealizedR: 0, expectancy: 0, avgMFE_R: null, avgMAE_R: null };
      const wins    = group.filter(p => p.positionState === 'CLOSED_WIN');
      const losses  = group.filter(p => p.positionState === 'CLOSED_LOSS');
      const winRate = wins.length / n;
      const lossRate = 1 - winRate;
      const avgWinR   = wins.length   ? wins.reduce((s, p) => s + num(p.realizedR || p.outcomeR), 0) / wins.length : 0;
      const avgLossR  = losses.length ? losses.reduce((s, p) => s + num(p.realizedR || p.outcomeR), 0) / losses.length : 0;
      const avgRealizedR = group.reduce((s, p) => s + num(p.realizedR || p.outcomeR), 0) / n;
      const expectancy = (winRate * avgWinR) + (lossRate * avgLossR);
      const hasMFE = group.some(p => p.mfeR != null);
      const hasMAE = group.some(p => p.maeR != null);
      return {
        n,
        winRate:       Number(winRate.toFixed(4)),
        winRatePct:    pct(winRate, 1),
        avgRealizedR:  roundR(avgRealizedR),
        avgWinR:       roundR(avgWinR),
        avgLossR:      roundR(avgLossR),
        expectancy:    roundR(expectancy),
        hasEdge:       expectancy > 0,
        avgMFE_R:      hasMFE ? roundR(group.reduce((s, p) => s + num(p.mfeR), 0) / n) : null,
        avgMAE_R:      hasMAE ? roundR(group.reduce((s, p) => s + num(p.maeR), 0) / n) : null,
        avgTimeToOutcomeH: group.some(p => p.timeToOutcomeH != null)
          ? roundR(group.reduce((s, p) => s + num(p.timeToOutcomeH), 0) / n) : null,
      };
    }

    // Group by setup
    const bySetup = {};
    const setups = [...new Set(positions.map(p => p.setup).filter(Boolean))];
    for (const setup of setups) {
      bySetup[setup] = statsFor(positions.filter(p => p.setup === setup));
    }

    // Group by tier
    const byTier = {};
    const tiers = ['PROBE', 'PLAYABLE', 'READY'];
    for (const tier of tiers) {
      byTier[tier] = statsFor(positions.filter(p => p.executionTier === tier));
    }

    // Group by category
    const byCategory = {};
    const categories = [...new Set(positions.map(p => p.category || 'OTHER').filter(Boolean))];
    for (const category of categories) {
      byCategory[category] = statsFor(positions.filter(p => (p.category || 'OTHER') === category));
    }

    // Overall
    const overall = statsFor(positions);

    return {
      engineVersion: VERSION,
      computedAt:    now(),
      sampleSize:    positions.length,
      bySetup,
      byTier,
      byCategory,
      overall,
      // Edge summary for dashboard
      hasEdge:        overall.expectancy > 0,
      topSetup:       Object.entries(bySetup).sort(([, a], [, b]) => b.expectancy - a.expectancy)[0]?.[0] || null,
      bestTier:       Object.entries(byTier).sort(([, a], [, b]) => b.expectancy - a.expectancy)[0]?.[0] || null,
    };
  }

  function emptyStats() {
    return {
      engineVersion: VERSION, computedAt: now(), sampleSize: 0,
      bySetup: {}, byTier: { PROBE: empty(), PLAYABLE: empty(), READY: empty() }, byCategory: {},
      overall: empty(), hasEdge: false, topSetup: null, bestTier: null,
    };
  }
  function empty() { return { n: 0, winRate: 0, winRatePct: 0, avgRealizedR: 0, expectancy: 0, hasEdge: false }; }

  /* ── Win Rate Snapshot (lightweight — for dashboard badge) ──────────── */

  /**
   * Returns a quick win-rate snapshot without full expectancy computation.
   * Use when you need a fast dashboard summary (not the full stats breakdown).
   */
  async function getQuickSummary() {
    const db = getDB();
    try {
      const all = await db?.getPositions() || [];
      const closed = all.filter(p => ['CLOSED_WIN', 'CLOSED_LOSS'].includes(p.positionState));
      const open   = all.filter(p => ['ARMED', 'PENDING', 'ACTIVE', 'PARTIAL_EXIT'].includes(p.positionState));
      const wins   = closed.filter(p => p.positionState === 'CLOSED_WIN');
      const losses = closed.filter(p => p.positionState === 'CLOSED_LOSS');
      const winRate = closed.length ? wins.length / closed.length : null;
      const avgR    = closed.length ? closed.reduce((s, p) => s + num(p.realizedR || p.outcomeR), 0) / closed.length : null;
      return {
        total: all.length, open: open.length, closed: closed.length,
        wins: wins.length, losses: losses.length,
        winRate: winRate != null ? Number(winRate.toFixed(4)) : null,
        winRatePct: winRate != null ? pct(winRate, 1) : null,
        avgRealizedR: avgR != null ? roundR(avgR) : null,
      };
    } catch { return { total: 0, open: 0, closed: 0, wins: 0, losses: 0, winRate: null }; }
  }

  /* ── Public API ─────────────────────────────────────────────────────── */

  return {
    VERSION,
    // Main hooks
    updateExcursions,   // call every scan cycle with priceMap
    finalizeOutcome,    // call when closing a position
    // Stats
    computeStats,       // full stats: setup / tier / overall expectations
    getQuickSummary,    // lightweight dashboard badge stats
  };
})();
