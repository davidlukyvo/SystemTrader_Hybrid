/* ══════════════════════════════════════════════════════════════════════════
   RISK ENGINE v9.5 — System Hardening Layer
   ──────────────────────────────────────────────────────────────────────────
   Dedicated layer for Alpha Guard pure risk evaluations:
     - Liquidity Gate (volume & slippage defense)
     - Correlation Risk (sector heatmap / direct exposure overlap)
     - Time-Stop Engine (momentum decay validation)
   ══════════════════════════════════════════════════════════════════════════ */

window.RISK_ENGINE = (() => {
  'use strict';

  // Strict Alpha Guard thresholds
  const LIMITS = Object.freeze({
    // Minimum 24h quote volume to allow ANY execution
    minQuoteVolumeUsdt: 15_000_000, 
    // If quote volume is below 50m, risk is capped
    thinLiquidityCap: 0.5,
    // Max Time-stop allowed for ARMED -> PENDING transitions before invalidation
    maxArmedExpiryMs: {
      bull: 24 * 60 * 60 * 1000,
      sideway: 48 * 60 * 60 * 1000,
      bear: 16 * 60 * 60 * 1000,
    }
  });

  /**
   * Evaluate Liquidity / Slippage Gate (Alpha Guard)
   * Prevents deployment if order book depth / volume is too thin for safe entry.
   */
  function evaluateLiquidityGate(signal, positionValue = 0) {
    if (!signal) return { pass: false, reason: 'invalid_signal', scale: 0 };
    
    const volume = Number(signal.quoteVolume24h || signal.quoteVolume || signal.volumeQuote || 0);
    
    // If no volume data is available natively yet, we pass with a warning scale
    if (volume === 0) {
      return { pass: true, reason: 'volume_unknown', scale: 1.0, warning: true };
    }

    if (volume < LIMITS.minQuoteVolumeUsdt) {
      return { pass: false, reason: `volume_too_low_${(volume/1000000).toFixed(1)}m`, scale: 0 };
    }

    // Advanced slippage estimation based on position size
    let slippageEst = 0;
    let scaling = 1.0;
    let warning = null;
    let liquidityScore = 0.5; // Default neutral score

    if (positionValue > 0) {
      slippageEst = Math.min(0.10, (positionValue / volume) * 5); // 0.01 = 1%
      liquidityScore = Math.max(0, 1 - (slippageEst * 50)); // High slippage = low score

      if (slippageEst > 0.02) {
        return { pass: false, reason: `slippage_exceeds_2pct_${(slippageEst*100).toFixed(2)}pct`, scale: 0, liquidityScore: 0 };
      }
      if (slippageEst > 0.01) {
        scaling = 0.5;
        warning = `slippage_1pct_scaling_50pct`;
      }
      
      // Hard cap: position must be <= 3% of 24h volume
      if (positionValue > volume * 0.03) {
        const cappedAllocValue = volume * 0.03;
        scaling = cappedAllocValue / positionValue;
        warning = 'capped_at_3pct_volume';
        liquidityScore *= 0.7; // Penalty for hitting volume cap
      }
    } else if (volume < 50_000_000) {
      scaling = LIMITS.thinLiquidityCap;
      warning = 'thin_liquidity_default_scaling';
      liquidityScore = 0.3;
    } else {
      liquidityScore = 0.9; // High volume, low position value = great liquidity
    }

    return { pass: true, reason: 'liquidity_ok', scale: scaling, warning, liquidityScore: Number(liquidityScore.toFixed(2)) };
  }

  /**
   * Evaluate Correlation Risk
   * Checks if the new setup introduces fatal correlation risk with existing positions.
   */
  function evaluateCorrelationRisk(signal, openPositions) {
    if (!signal || !openPositions || !openPositions.length) return { pass: true, reason: 'no_correlation' };
    
    const category = window.CATEGORY_ENGINE?.getCategory 
      ? window.CATEGORY_ENGINE.getCategory(signal.symbol) 
      : 'OTHER';
    
    let categoryMatches = 0;
    
    for (const p of openPositions) {
      const pCat = window.CATEGORY_ENGINE?.getCategory ? window.CATEGORY_ENGINE.getCategory(p.symbol) : 'OTHER';
      if (pCat !== 'OTHER' && pCat === category) {
        categoryMatches++;
      }
    }

    // Alpha Guard correlation flag:
    // This is NOT the strict portfolio veto (handled in portfolio-engine),
    // but a risk multiplier or warning flag for the execution engine ranking.
    if (categoryMatches > 0) {
      return { pass: true, warning: true, reason: `correlation_density_${category}`, matches: categoryMatches };
    }

    return { pass: true, reason: 'uncorrelated', matches: 0 };
  }

  /**
   * Evaluate Time-Stop (Momentum Decay)
   * Validates if a position sitting in ARMED or PENDING has bled its momentum.
   * Supports Timeframe Adjustment: e.g., 15m setups expire faster.
   */
  function evaluateTimeStop(position, btcContext, momentum = 0) {
    if (!position || !(position.approvedAt || position.openedAt)) return { expired: false, action: 'pass' };

    const activeAt = Number(position.activeAt || position.approvedAt || position.openedAt);
    const ageMs = Date.now() - activeAt;
    const regime = String(btcContext || 'sideway').toLowerCase();
    const baseLimit = LIMITS.maxArmedExpiryMs[regime] || LIMITS.maxArmedExpiryMs.sideway;

    // Timeframe Multiplier: Default to 1 (e.g., 4h/1h). 
    // If we detected it as a lower timeframe (e.g. 15m), we reduce the patience window.
    const timeframe = String(position.timeframe || '1h').toLowerCase();
    const tfMultiplier = timeframe.includes('15m') ? 0.35 : timeframe.includes('5m') ? 0.15 : 1.0;
    
    const adjustedLimit = baseLimit * tfMultiplier;
    
    // Feature: Momentum Extension (Grant 100% more time if price > entry)
    const effectiveLimit = (momentum > 0 && !position._timeStopExtended) ? adjustedLimit * 2 : adjustedLimit;
    const isExpired = ageMs > effectiveLimit;

    if (isExpired) {
      return { 
        expired: true, 
        action: 'exit',
        reason: `time_stop_${regime}_${timeframe}_age_${Math.round(ageMs/3600000)}h`,
        limit: effectiveLimit
      };
    }

    // Proactive extension if near limit but has momentum
    if (ageMs > (adjustedLimit * 0.8) && momentum > 0 && !position._timeStopExtended) {
      return { 
        expired: false, 
        action: 'extend', 
        reason: 'momentum_present', 
        newLimit: adjustedLimit * 2 
      };
    }

    return { expired: false, action: 'pass', ageMs, limit: effectiveLimit };
  }

  return {
    evaluateLiquidityGate,
    evaluateCorrelationRisk,
    evaluateTimeStop,
    LIMITS
  };
})();
