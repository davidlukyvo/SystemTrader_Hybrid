/* ══════════════════════════════════════════════════════════════════════════
   PORTFOLIO ENGINE v9.5 — System Hardening Layer
   ──────────────────────────────────────────────────────────────────────────
   Dedicated layer for Alpha Guard capital veto pipelines:
     - Global Exposure Constraints (Max Concurrent / Max Total Risk)
     - Sector Category Caps (Protecting against systemic drawdowns)
   ══════════════════════════════════════════════════════════════════════════ */

window.PORTFOLIO_ENGINE = (() => {
  'use strict';

  // Strict Alpha Guard Portfolio limits
  const LIMITS = Object.freeze({
    bull:    { maxTotalRiskPct: 0.08, maxConcurrent: 6, coolingMs: 2 * 60 * 60 * 1000, maxPerCategory: 2 },
    sideway: { maxTotalRiskPct: 0.05, maxConcurrent: 4, coolingMs: 4 * 60 * 60 * 1000, maxPerCategory: 1 },
    bear:    { maxTotalRiskPct: 0.03, maxConcurrent: 2, coolingMs: 8 * 60 * 60 * 1000, maxPerCategory: 1 },
  });

  function _num(v, d = 0) { const n = Number(v); return Number.isFinite(n) ? n : d; }
  function _pct(v, decimals = 2) { return Number((v * 100).toFixed(decimals)); }
  function _now() { return Date.now(); }

  /**
   * Run the Absolute Veto Pipeline (Alpha Guard)
   * Fail-closed: Null context or unknown condition guarantees rejection.
   */
  function runPortfolioVeto(signal, attemptedTier, ctx, executionTierFloors = {}, portfolioBeforeRisk = 0) {
    if (!ctx || typeof ctx !== 'object') {
      return { pass: false, rejections: ['context_missing_fail_closed'] };
    }

    const rejections = [];
    const btcCtx = String(ctx.btcContext || 'sideway').toLowerCase();
    const limits = LIMITS[btcCtx] || LIMITS.sideway;
    
    // Evaluate Open/Stale Positions
    const positions = Array.isArray(ctx.openPositions) ? ctx.openPositions : [];
    const openSyms = new Set(positions.map(p => String(p.symbol || '').toUpperCase()));
    
    const symbol = String(signal.symbol || '').toUpperCase();
    const floor = executionTierFloors[attemptedTier];

    if (!floor) {
      rejections.push(`unknown_tier_${attemptedTier}`);
      return { pass: false, rejections };
    }

    // ── Veto 1: Concurrent Open Limit
    if (positions.length >= limits.maxConcurrent) {
      rejections.push(`max_concurrent_${limits.maxConcurrent}_reached`);
    }

    // ── Veto 2: Duplicate Symbol Check
    if (openSyms.has(symbol)) {
      rejections.push(`duplicate_symbol_${symbol}`);
    }

    // ── Veto 3: Cumulative Total Risk Limit (Hardened v10.6.9.9)
    // FIX: Scale max risk by the Strategic Multiplier (Macro Alignment)
    const strategicMultiplier = window.ST?.strategic?.riskMultiplier || 1.0;
    const adjustedMaxRiskPct = limits.maxTotalRiskPct * strategicMultiplier;
    const totalRisk = portfolioBeforeRisk || positions.reduce((s, p) => s + _num(p.riskPctPerTrade), 0);
    
    if (totalRisk + floor.riskPctPerTrade > adjustedMaxRiskPct) {
      rejections.push(`total_risk_${_pct(totalRisk + floor.riskPctPerTrade, 1)}pct_exceeds_strategic_cap_${_pct(adjustedMaxRiskPct, 1)}pct (Mult: ${strategicMultiplier}x)`);
    }

    // ── Veto 4: Cooling Period (Recent Loss Prevention)
    const cooling = (ctx.recentClosedPositions || []).filter(p =>
      String(p.symbol || '').toUpperCase() === symbol &&
      (_now() - _num(p.closedAt)) < limits.coolingMs
    );
    if (cooling.length > 0) {
      rejections.push(`cooling_period_active_${symbol}`);
    }

    // ── Veto 5: Category Cap (Sector Overexposure)
    const categoryEngine = window.CATEGORY_ENGINE || null;
    if (categoryEngine && typeof categoryEngine.getCategory === 'function') {
      const signalCategory = categoryEngine.getCategory(symbol);
      if (signalCategory !== 'OTHER') {
        const matchingCatCount = positions.filter(p => categoryEngine.getCategory(p.symbol) === signalCategory).length;
        if (matchingCatCount >= limits.maxPerCategory) {
          rejections.push(`category_cap_reached_${signalCategory}_limit_${limits.maxPerCategory}`);
        }
      }
    } else {
      console.warn('[PORTFOLIO-ENGINE] CATEGORY_ENGINE not found. Category cap veto bypassed.');
    }

    const signalCategory = (categoryEngine && typeof categoryEngine.getCategory === 'function') 
      ? categoryEngine.getCategory(symbol) 
      : 'OTHER';

    // ── Veto 6: Alpha Guard Feedback Loop (Edge Decay Detection)
    let downgradeTier = null;
    if (window.FEEDBACK_ENGINE && typeof window.FEEDBACK_ENGINE.runFeedbackVeto === 'function') {
      const fbResult = window.FEEDBACK_ENGINE.runFeedbackVeto(signal);
      if (!fbResult.pass) {
        rejections.push(...fbResult.rejections);
      } else if (fbResult.downgradeTo) {
        // If it attempts a tier higher than PROBE, we force it to PROBE.
        // We do not promote WATCH to PROBE.
        if (attemptedTier === 'READY' || attemptedTier === 'PLAYABLE') {
          downgradeTier = fbResult.downgradeTo;
          rejections.push(`auto_downgrade_to_${downgradeTier}_due_to_feedback_decay`); // Treat it as rejection to drop from current tier
        }
      }
    }

    return { 
      pass: rejections.length === 0, 
      rejections,
      category: signalCategory,
      projectedRiskPct: totalRisk + floor.riskPctPerTrade,
      downgradeTo: downgradeTier
    };
  }

  /**
   * Evaluate Regime Alignment
   * Returns a score (0-1) based on how well the setup fits the current BTC context.
   */
  function getRegimeFitScore(signal, btcCtx = 'sideway') {
    if (!signal) return 0.5;
    
    const context = String(btcCtx).toLowerCase();
    const setup = String(signal.setup || '').toLowerCase();
    const trend = String(signal.trend || 'neutral').toLowerCase();
    
    let score = 0.5; // neutral base

    if (context === 'bull') {
      // Bull market favors expansion and trend-following setups
      if (setup.includes('expansion') || setup.includes('breakout')) score += 0.3;
      if (trend === 'bullish') score += 0.2;
    } else if (context === 'sideway') {
      // Sideway favors mean reversion or tight accumulation (Phase C/D)
      if (setup.includes('reversion') || setup.includes('spring') || setup.includes('phase c')) score += 0.4;
      if (trend === 'neutral') score += 0.1;
    } else if (context === 'bear') {
      // Bear market favors mean reversion or oversold bounces
      if (setup.includes('oversold') || setup.includes('rebound')) score += 0.3;
      if (trend === 'bearish') score -= 0.1; // counter-trend risk
    }

    return Math.min(1.0, Math.max(0.1, score));
  }

  return {
    runPortfolioVeto,
    getRegimeFitScore,
    LIMITS
  };
})();
