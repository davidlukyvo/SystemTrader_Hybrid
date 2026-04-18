/**
 * SYSTEMTRADER ELITE - NATIVE MOMENTUM (Behavior Detector)
 * 
 * VERSION: 1.1.0-Elite-Phase1
 * ROLE: Behavior detector only, NOT a final authority engine.
 * DATA: Pure OHLCV (Price + Volume) behaviors.
 * 
 * "Behavior Detector, not Truth Detector"
 */

window.NATIVE_MOMENTUM = (function() {
  const VERSION = '1.1.0-Elite-Phase1';
  const ROLLOUT_PHASE = 1; // 1: Telemetry, 2: Soft Influence, 3: Full Unlock
  
  // Weights (v1.1 Extended)
  const W = {
    vol_z: 0.25,           // Volume intensity
    vol_accel: 0.15,       // Volume rate of change (Acceleration)
    impulse_atr: 0.15,     // Price velocity
    range_expansion: 0.15, // Candle size vs average
    clv: 0.10,             // Close Location Value (Body strength)
    rel_strength: 0.20     // Strength vs BTC
  };

  // Penalties
  const P = {
    upper_wick: 0.45,      // Exhaustion
    extension: 0.35        // Overbought risk
  };

  function num(v, fallback = 0) {
    const n = Number(v);
    return isNaN(n) || !isFinite(n) ? fallback : n;
  }

  function avg(arr) {
    if (!arr.length) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  function stdDev(arr) {
    if (!arr.length) return 0;
    const mean = avg(arr);
    const variance = arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length;
    return Math.sqrt(variance);
  }

  /**
   * Main Scoring Function (v1.1)
   */
  function evaluate(coin, klines) {
    const { m15 } = klines;
    if (!Array.isArray(m15) || m15.length < 20) return null;

    const last = m15[m15.length - 1];
    const prev = m15[m15.length - 2];
    const volumes = m15.slice(-21, -1).map(x => num(x.volume));
    
    // 1. vol_z: Volume Z-score
    const vMean = avg(volumes);
    const vStd = stdDev(volumes);
    const vol_z = vStd > 0 ? (num(last.volume) - vMean) / vStd : 0;
    const volScore = Math.max(0, Math.min(10, vol_z)) / 10;

    // 2. vol_accel: Current vs Previous bar volume (Acceleration)
    const vol_accel = num(last.volume) / Math.max(num(prev.volume), 1e-9);
    const accelScore = Math.max(0, Math.min(3, vol_accel)) / 3;

    // 3. impulse_atr: Price move vs ATR
    const trs = m15.slice(-15).map((curr, idx, arr) => {
      if (idx === 0) return num(curr.high - curr.low);
      const prev_c = arr[idx-1].close;
      return Math.max(curr.high - curr.low, Math.abs(curr.high - prev_c), Math.abs(curr.low - prev_c));
    });
    const atr = avg(trs);
    const move = Math.abs(num(last.close) - num(last.open));
    const impulse_atr = atr > 0 ? (move / atr) : 0;
    const impulseScore = Math.max(0, Math.min(4, impulse_atr)) / 4;

    // 4. range_expansion: Candle size vs ATR
    const lastRange = num(last.high - last.low);
    const range_expansion = atr > 0 ? (lastRange / atr) : 0;
    const rangeExpScore = Math.max(0, Math.min(2.5, range_expansion)) / 2.5;

    // 5. clv: Close Location Value
    const range = Math.max(1e-9, last.high - last.low);
    const clvRaw = ((last.close - last.low) - (last.high - last.close)) / range;
    const clvScore = (clvRaw + 1) / 2;

    // 6. rel_strength: vs $BTC
    const coinChg = num(last.open) > 0 ? (last.close - last.open) / last.open : 0;
    const btcCtx = num(coin.btcChangePct || coin.btcChange || 0);
    const rel_strength = coinChg - btcCtx;
    const rsScore = Math.max(0, Math.min(0.08, rel_strength)) / 0.08;

    // Penalties
    const upperWick = Math.max(0, last.high - Math.max(last.open, last.close));
    const wickPct = upperWick / range;
    const upperWickPenalty = Math.max(0, Math.min(0.6, wickPct)) / 0.6;

    const closes = m15.map(x => num(x.close));
    const ema20 = avg(closes.slice(-20));
    const extension = ema20 > 0 ? (last.close - ema20) / ema20 : 0;
    const extensionPenalty = Math.max(0, Math.min(0.15, extension)) / 0.15;

    // SCORING
    const rawScore = (
      (volScore * W.vol_z) +
      (accelScore * W.vol_accel) +
      (impulseScore * W.impulse_atr) +
      (rangeExpScore * W.range_expansion) +
      (clvScore * W.clv) +
      (rsScore * W.rel_strength)
    );

    const rawExhaustion = (
      (upperWickPenalty * P.upper_wick) +
      (extensionPenalty * P.extension)
    );

    const momentumScore = Math.round(rawScore * 100);
    const exhaustionScore = Math.round(rawExhaustion * 100);

    const momentumReason = [];
    const momentumWarnings = [];
    const momentumBlockers = [];

    if (vol_z > 3) momentumReason.push('Abnormal volume (z > 3)');
    if (vol_accel > 2) momentumReason.push('Volume acceleration (> 2x)');
    if (range_expansion > 1.5) momentumReason.push('Range expansion (> 1.5 ATR)');
    if (rel_strength > 0.03) momentumReason.push('High relative strength');

    if (wickPct > 0.35) momentumWarnings.push('Exhaustion wick detected');
    if (extension > 0.10) momentumWarnings.push('EMA extension risk');

    // CLASSIFICATION (v1.1)
    let momentumPhase = 'NONE';
    if (momentumScore >= 65) {
      if (exhaustionScore > 45) {
        momentumPhase = 'LATE';
        momentumBlockers.push('exhaustion_trap');
      } else if (range_expansion > 1.8) {
        momentumPhase = 'MID';
      } else {
        momentumPhase = 'EARLY';
      }
    } else if (momentumScore >= 35) {
      momentumPhase = 'EARLY';
    }

    return {
      version: VERSION,
      phase: ROLLOUT_PHASE,
      momentumDetected: momentumPhase !== 'NONE',
      momentumScore,
      exhaustionScore,
      momentumPhase,
      momentumReason,
      momentumWarnings,
      momentumBlockers,
      late_trap_hit: momentumPhase === 'LATE',
      metrics: {
        vol_z: Number(vol_z.toFixed(2)),
        vol_accel: Number(vol_accel.toFixed(2)),
        impulse_atr: Number(impulse_atr.toFixed(2)),
        range_expansion: Number(range_expansion.toFixed(2)),
        clv: Number(clvRaw.toFixed(2)),
        rel_strength: Number(rel_strength.toFixed(4)),
        wickPct: Number(wickPct.toFixed(2)),
        extension: Number(extension.toFixed(4))
      },
      lastUpdated: Date.now()
    };
  }

  return {
    VERSION,
    ROLLOUT_PHASE,
    evaluate
  };
})();
