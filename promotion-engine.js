/* ══════════════════════════════════════════════════════════════════════════
   PROMOTION ENGINE — State & Tier Promotion Logic
   VERSION: v1.0.0 (SystemTrader v8790 — pre-v9.3)
   ──────────────────────────────────────────────────────────────────────────
   Two promotion types:

   1. PENDING → ACTIVE (positionState transition)
      Condition: current price falls within entry zone (scanner's entryLow/High
      or ±0.5% around entry price). Marks position as "entered" for paper trade
      outcome tracking. No capital is auto-deployed.

   2. PROBE → PLAYABLE (executionTier upgrade)
      Condition: ACTIVE position has moved +1R in its favour AND setup remains
      valid. Updates tier label to PLAYABLE and sets `readyToScale: true`.
      Capital scaling is NOT automatic — this flags that a scale-in is
      permitted on the next scan gate evaluation.

   Design decisions (Q1 answer: Option B):
     - Tier promotion sets `readyToScale: true`, NOT auto-deploys capital.
     - No new positions are created. Existing position record is updated.
     - Caller (execution-engine-v9 run()) persists changes to DB.

   Layer contract:
     - READS positionState and executionTier from position records.
     - WRITES positionState, executionTier, activeAt, promotedAt, readyToScale.
     - NEVER touches executionTier on signals — only on position records.
   ══════════════════════════════════════════════════════════════════════════ */

window.PROMOTION_ENGINE = (() => {
  'use strict';

  const VERSION = 'v1.0.0';

  /* ── Constants ──────────────────────────────────────────────────────── */

  /** Entry zone width on each side of entry price (Q2: fallback if no scanner zone). */
  const ENTRY_ZONE_HALF_PCT = 0.005;  // ±0.5%

  /** Minimum R-multiple move to promote PROBE → PLAYABLE. */
  const PROBE_PROMOTE_R = 1.0;         // +1R initial move confirmed

  /** Min age of ACTIVE position before tier promotion is evaluated. */
  const MIN_ACTIVE_AGE_MS = 15 * 60 * 1000;  // 15 minutes

  const POS_STATE = Object.freeze({
    PENDING:      'PENDING',
    ACTIVE:       'ACTIVE',
    PARTIAL_EXIT: 'PARTIAL_EXIT',
  });

  /* ── Utilities ──────────────────────────────────────────────────────── */

  function num(v, d = 0) { const n = Number(v); return Number.isFinite(n) ? n : d; }
  function now() { return Date.now(); }

  /* ── 1. PENDING → ACTIVE: Price-Zone Entry Detection ────────────────── */

  /**
   * Check if position should transition PENDING → ACTIVE.
   *
   * Uses scanner's entryLow/entryHigh if available (Q2 answer: preferred).
   * Falls back to ±0.5% band around entry price if not present.
   *
   * @param {Object} position      PENDING position record
   * @param {number} currentPrice  Current market price
   * @returns {{ activate: boolean, reason: string }} 
   */
  function checkEntryActivation(position, currentPrice) {
    if (!position || position.positionState !== POS_STATE.PENDING) {
      return { activate: false, reason: 'not_pending' };
    }

    const entry = num(position.entry);
    const price = num(currentPrice);
    if (entry <= 0 || price <= 0) {
      return { activate: false, reason: 'invalid_price_data' };
    }

    // Q2: Use scanner-provided entry zone if present, else ±0.5% band
    const zoneLow  = num(position.entryZoneLow  || position.entryLow,  entry * (1 - ENTRY_ZONE_HALF_PCT));
    const zoneHigh = num(position.entryZoneHigh || position.entryHigh, entry * (1 + ENTRY_ZONE_HALF_PCT));

    if (price >= zoneLow && price <= zoneHigh) {
      return { activate: true, reason: `price_${price.toFixed(4)}_in_zone_[${zoneLow.toFixed(4)},${zoneHigh.toFixed(4)}]` };
    }

    return { activate: false, reason: `price_${price.toFixed(4)}_outside_zone` };
  }

  /**
   * Apply PENDING → ACTIVE transition.
   * Returns updated position object (caller must persist to DB).
   */
  function applyActivation(position, currentPrice, reason) {
    return {
      ...position,
      positionState: POS_STATE.ACTIVE,
      activeAt:      now(),
      activationPrice: num(currentPrice),
      activationReason: reason,
      // Initialize excursion tracking from activation price
      mfe: num(currentPrice),
      mae: num(currentPrice),
    };
  }

  /* ── 2. PROBE → PLAYABLE: Initial Move Confirmation ─────────────────── */

  /**
   * Check if an ACTIVE PROBE position should be tier-promoted to PLAYABLE.
   *
   * Conditions (ALL must pass):
   *   a. positionState === 'ACTIVE' or 'PARTIAL_EXIT'
   *   b. executionTier === 'PROBE'
   *   c. Position has been ACTIVE for ≥ MIN_ACTIVE_AGE_MS (avoid noise)
   *   d. Current price ≥ entry + PROBE_PROMOTE_R × risk (initial move +1R confirmed)
   *   e. NOT already promoted this session (readyToScale !== true)
   *
   * @param {Object} position      ACTIVE PROBE position record
   * @param {number} currentPrice  Current market price
   * @returns {{ promote: boolean, reason: string }}
   */
  function checkTierPromotion(position, currentPrice) {
    if (!position) return { promote: false, reason: 'no_position' };
    if (!['ACTIVE', 'PARTIAL_EXIT'].includes(position.positionState)) {
      return { promote: false, reason: `not_active:${position.positionState}` };
    }
    if (position.executionTier !== 'PROBE') {
      return { promote: false, reason: `tier_not_probe:${position.executionTier}` };
    }
    if (position.readyToScale) {
      return { promote: false, reason: 'already_promoted' };
    }

    const entry   = num(position.entry);
    const stop    = num(position.stop);
    const price   = num(currentPrice);
    const risk    = entry > stop && stop > 0 ? entry - stop : null;

    if (!risk || risk <= 0 || entry <= 0 || price <= 0) {
      return { promote: false, reason: 'invalid_risk_data' };
    }

    // Min age check — avoid promoting on first-candle spikes
    const activeAge = now() - num(position.activeAt || 0);
    if (activeAge < MIN_ACTIVE_AGE_MS) {
      return { promote: false, reason: `too_young_${Math.round(activeAge / 60000)}min` };
    }

    // Core check: price >= entry + PROBE_PROMOTE_R × risk
    const targetPrice = entry + PROBE_PROMOTE_R * risk;
    if (price >= targetPrice) {
      const rMultiple = (price - entry) / risk;
      return { promote: true, reason: `+${rMultiple.toFixed(2)}R_confirmed` };
    }

    const rProgress = ((price - entry) / risk).toFixed(2);
    return { promote: false, reason: `only_+${rProgress}R_of_required_+${PROBE_PROMOTE_R}R` };
  }

  /**
   * Apply PROBE → PLAYABLE tier promotion (Option B: flag, don't auto-deploy).
   * Returns updated position object (caller must persist to DB).
   *
   * Sets:
   *   executionTier:     'PLAYABLE'
   *   readyToScale:      true   ← flag for dashboard & next scan gate
   *   promotedAt:        timestamp
   *   promotionFromTier: 'PROBE'
   *   promotionReason:   reason string
   */
  function applyTierPromotion(position, reason) {
    return {
      ...position,
      executionTier:     'PLAYABLE',
      readyToScale:      true,
      promotedAt:        now(),
      promotionFromTier: 'PROBE',
      promotionReason:   reason,
    };
  }

  /* ── Main runner — process all open positions ────────────────────────── */

  /**
   * Run promotion checks on all open positions.
   * Called by execution-engine-v9.run() each cycle with priceMap.
   *
   * @param {Array}  openPositions  Open position records from DB
   * @param {Object} priceMap       { 'SYMBOL': currentPrice, ... }
   * @returns {{ activations, tierPromotions, dbChanges }}
   *   dbChanges: [{ id, changes }] — apply via DB.updatePosition()
   */
  function run(openPositions, priceMap = {}) {
    if (!Array.isArray(openPositions) || !priceMap) {
      return { activations: [], tierPromotions: [], dbChanges: [] };
    }

    const activations    = [];
    const tierPromotions = [];
    const dbChanges      = [];

    for (const pos of openPositions) {
      const sym   = String(pos.symbol || '').toUpperCase();
      const price = Number(priceMap[sym]);
      if (!price || price <= 0) continue;

      // 1. PENDING → ACTIVE
      if (pos.positionState === POS_STATE.PENDING) {
        const check = checkEntryActivation(pos, price);
        if (check.activate) {
          const updated = applyActivation(pos, price, check.reason);
          activations.push({ id: pos.id, symbol: sym, activationPrice: price, reason: check.reason });
          dbChanges.push({ id: pos.id, changes: { ...updated } });
        }
        continue; // PENDING positions skip tier promotion check
      }

      // 2. PROBE → PLAYABLE (only for ACTIVE/PARTIAL_EXIT PROBE positions)
      const tierCheck = checkTierPromotion(pos, price);
      if (tierCheck.promote) {
        const updated = applyTierPromotion(pos, tierCheck.reason);
        tierPromotions.push({
          id: pos.id, symbol: sym, price,
          fromTier: 'PROBE', toTier: 'PLAYABLE',
          reason: tierCheck.reason,
        });
        dbChanges.push({ id: pos.id, changes: { ...updated } });
      }
    }

    return { activations, tierPromotions, dbChanges };
  }

  /* ── Display helpers ────────────────────────────────────────────────── */

  /** Badge label for a position eligible for scale-in. */
  function getScaleInBadge(position) {
    if (!position?.readyToScale) return null;
    return { label: 'SCALE_IN_READY', tier: position.executionTier, promotedAt: position.promotedAt };
  }

  /* ── Public API ─────────────────────────────────────────────────────── */

  return {
    VERSION,
    PROBE_PROMOTE_R,
    ENTRY_ZONE_HALF_PCT,

    // Core runner
    run,

    // Individual checkers (exposed for testing)
    checkEntryActivation,
    applyActivation,
    checkTierPromotion,
    applyTierPromotion,

    // Display
    getScaleInBadge,
  };
})();
