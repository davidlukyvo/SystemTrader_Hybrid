/* ══════════════════════════════════════════════════════════════════════════
   FEEDBACK ENGINE v1.0 — System Hardening Layer
   ──────────────────────────────────────────────────────────────────────────
   Provides Auto-Veto capability based on Rolling Analytics.
   Detects edge deterioration and automatically penalizes specific categories
   or setups that are actively in drawdown to protect capital.
   ══════════════════════════════════════════════════════════════════════════ */

window.FEEDBACK_ENGINE = (() => {
  'use strict';

  // --- Strict Feedback Thresholds ---
  const THRESHOLDS = Object.freeze({
    // Minimum outcomes required to consider the stats valid
    minSampleSize: 5,
    // Max days of no trades before a VETO is lowered to PROBE
    unfreezeCooldownDays: 3, 
    // Win Rate thresholds
    vetoWinRate: 35.0,        // If WR < 35%, VETO (Block)
    downgradeWinRate: 45.0    // If WR < 45%, DOWNGRADE TO PROBE
  });

  const COOLDOWN_MS = THRESHOLDS.unfreezeCooldownDays * 24 * 60 * 60 * 1000;

  function _num(v, d = 0) { const n = Number(v); return Number.isFinite(n) ? n : d; }

  /**
   * Evaluate a signal against the 14-day rolling analytics to detect edge deterioration.
   */
  function runFeedbackVeto(signal) {
    if (!signal) return { pass: true, rejections: [] };

    // Get latest stats
    const stats = window.ANALYTICS_ENGINE ? window.ANALYTICS_ENGINE.getCachedStats() : null;
    if (!stats || !stats.categories || !stats.setups) {
      return { pass: true, rejections: [], warning: 'feedback_engine_data_unavailable' };
    }

    let category = signal.category || 'OTHER';
    if (category === 'OTHER' && window.CATEGORY_ENGINE?.getCategory) {
      category = window.CATEGORY_ENGINE.getCategory(signal.symbol) || 'OTHER';
    }
    const setup = signal.setup || 'Unknown';

    const catStat = stats.categories[category];
    const setupStat = stats.setups[setup];
    const now = Date.now();

    const result = { pass: true, rejections: [], downgradeTo: null, warnings: [] };

    // 1. Evaluate Category Performance
    if (catStat && catStat.total >= THRESHOLDS.minSampleSize) {
      const lastCatTrade = _num(stats.lastTradeMap?.category?.[category], 0);
      const isCooledDown = (now - lastCatTrade) > COOLDOWN_MS;

      if (catStat.winRate < THRESHOLDS.vetoWinRate) {
        if (isCooledDown) {
          result.downgradeTo = 'PROBE';
          result.warnings.push(`category_drawdown_unfrozen_probing_allowed: ${category}`);
        } else {
          result.pass = false;
          result.rejections.push(`auto_veto_category_drawdown_${category}_wr_${catStat.winRate}pct`);
        }
      } 
      else if (catStat.winRate < THRESHOLDS.downgradeWinRate) {
        result.downgradeTo = 'PROBE';
        result.warnings.push(`category_drawdown_forcing_downgrade_${category}`);
      }
    }

    // 2. Evaluate Setup Performance (Only if not already rejected)
    if (result.pass && setupStat && setupStat.total >= THRESHOLDS.minSampleSize) {
      const lastSetupTrade = _num(stats.lastTradeMap?.setup?.[setup], 0);
      const isCooledDown = (now - lastSetupTrade) > COOLDOWN_MS;

      if (setupStat.winRate < THRESHOLDS.vetoWinRate) {
        if (isCooledDown) {
          if (!result.downgradeTo) result.downgradeTo = 'PROBE';
          result.warnings.push(`setup_drawdown_unfrozen_probing_allowed: ${setup}`);
        } else {
          result.pass = false;
          result.rejections.push(`auto_veto_setup_drawdown_${setup.replace(/\s+/g,'_')}_wr_${setupStat.winRate}pct`);
          result.downgradeTo = null; // Veto overrides downgrade
        }
      }
      else if (setupStat.winRate < THRESHOLDS.downgradeWinRate) {
          if (!result.downgradeTo) result.downgradeTo = 'PROBE';
          result.warnings.push(`setup_drawdown_forcing_downgrade_${setup.replace(/\s+/g,'_')}`);
      }
    }

    return result;
  }

  // --- Exposed to UI for Heatmap rendering ---
  function getVetoStatus(identifier, type = 'category') {
      const stats = window.ANALYTICS_ENGINE ? window.ANALYTICS_ENGINE.getCachedStats() : null;
      if (!stats) return 'NORMAL';
      
      const st = type === 'category' ? stats.categories[identifier] : stats.setups[identifier];
      if (!st || st.total < THRESHOLDS.minSampleSize) return 'NORMAL';

      const lastTradeMap = type === 'category' ? stats.lastTradeMap?.category : stats.lastTradeMap?.setup;
      const lastTrade = _num(lastTradeMap?.[identifier], 0);
      const isCooledDown = (Date.now() - lastTrade) > COOLDOWN_MS;

      if (st.winRate < THRESHOLDS.vetoWinRate) {
          return isCooledDown ? 'PROBING (UNFROZEN)' : 'VETOED';
      }
      if (st.winRate < THRESHOLDS.downgradeWinRate) {
          return 'DOWNGRADED';
      }
      return 'NORMAL';
  }

  return {
    runFeedbackVeto,
    getVetoStatus,
    THRESHOLDS
  };
})();
