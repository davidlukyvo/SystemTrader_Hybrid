
/* \u2500\u2500 DASHBOARD MODULE v9.5 Alpha Guard \u2014 Hardening Refactor \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

async function __dashHydrateFromDB(force = false) {
  if (!window.DB) return false;
  if (window.__DASHBOARD_DB_LOADING__) return false;
  const safeST = window.ST || {};

  const cache = window.__DASHBOARD_DB_CACHE__;
  const cacheAgeMs = cache ? Date.now() - (cache.loadedAt || 0) : Infinity;
  const isCacheStale = cacheAgeMs > 5 * 60 * 1000;
  const stale = !safeST?.scanMeta?.lastScan || !Array.isArray(safeST?.coins) || !safeST.coins.length;
  if (!force && !stale && cache && !isCacheStale) return false;

  window.__DASHBOARD_DB_LOADING__ = true;
  try {
    const [sessionState, scans, signals] = await Promise.all([
      DB.getSetting('sessionState').catch(() => null),
      DB.getScans({ limit: 5 }).catch(() => []),
      DB.getSignals({ limit: 500 }).catch(() => []),
    ]);
    const latestScan = Array.isArray(scans) && scans.length ? scans[0] : null;
    const latestSignalTs = Array.isArray(signals) && signals.length ? Math.max(...signals.map(s => Number(s?.timestamp || 0)).filter(i => !isNaN(i)), 0) : 0;
    const cacheData = {
      sessionState: sessionState && typeof sessionState === 'object' ? sessionState : null,
      latestScan,
      latestSignalTs,
      loadedAt: Date.now()
    };
    window.__DASHBOARD_DB_CACHE__ = cacheData;

    if (sessionState && typeof sessionState === 'object') {
      if (Array.isArray(sessionState.coins) && sessionState.coins.length) {
        safeST.coins = sessionState.coins;
      }
      if (sessionState.scanMeta && typeof sessionState.scanMeta === 'object') {
        safeST.scanMeta = { ...(safeST.scanMeta || {}), ...sessionState.scanMeta };
        if ((!Array.isArray(safeST.scanMeta.coins) || !safeST.scanMeta.coins.length) && Array.isArray(sessionState.coins) && sessionState.coins.length) {
          safeST.scanMeta.coins = sessionState.coins;
        }
      }
    }

    const MAX_SIGNAL_AGE_MS = 24 * 60 * 60 * 1000;
    const now = Date.now();
    let coinsToDisplay = [];

    const recentSignals = (Array.isArray(signals) ? signals : [])
      .filter(s => {
        const ts = Number(s?.timestamp || 0);
        return s && s.symbol && !isNaN(ts) && ts > 0 && (now - ts) < MAX_SIGNAL_AGE_MS;
      })
      .sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));

    const latestMap = new Map();
    for (const sig of recentSignals) {
      const sym = String(sig.symbol).toUpperCase();
      if (!latestMap.has(sym)) latestMap.set(sym, sig);
    }

    if (safeST.coins && safeST.coins.length > 0) {
      safeST.coins.forEach(c => {
        if (!c || !c.symbol) return;
        const sym = String(c.symbol).toUpperCase();
        latestMap.set(sym, c);
      });
    }
    coinsToDisplay = Array.from(latestMap.values());

    const hasFreshMemory = safeST.coins && safeST.coins.length > 0;
    if (!hasFreshMemory && latestScan && Array.isArray(latestScan.qualifiedDetails)) {
      latestScan.qualifiedDetails.forEach(qd => {
        if (!qd || !qd.symbol) return;
        const sym = String(qd.symbol).toUpperCase();
        const virtualCoin = { ...qd, timestamp: latestScan.timestamp, scanId: latestScan.id, isVirtual: true };
        latestMap.set(sym, virtualCoin);
      });
    }

    coinsToDisplay = Array.from(latestMap.values())
      .sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));

    if (coinsToDisplay.length > 0) {
      safeST.coins = coinsToDisplay;
      safeST.scanMeta = safeST.scanMeta || {};
      safeST.scanMeta.coins = coinsToDisplay;
      if (window.ST) window.ST.coins = coinsToDisplay;
    }

    if (latestScan) {
      safeST.scanMeta = safeST.scanMeta || {};
      if (!safeST.scanMeta.lastScan || Number(safeST.scanMeta.lastScan) <= Number(latestScan.timestamp || 0)) {
        safeST.scanMeta.lastScan = Number(latestScan.timestamp || 0) || safeST.scanMeta.lastScan;
        safeST.scanMeta.source = latestScan.source || safeST.scanMeta.source || 'SYSTEM_TRADER_V9_3_1';
      }
    }

    return true;
  } catch (err) {
    console.error('[DASHBOARD] Hydration failed:', err);
    return false;
  } finally {
    window.__DASHBOARD_DB_LOADING__ = false;
  }
}

function __dashAuthorityCoins(coins, scanMeta = {}) {
  const base = Array.isArray(coins) ? coins : [];
  const merged = new Map();
  const upsert = (coin, source = '') => {
    if (!coin || typeof coin !== 'object') return;
    const symbol = String(coin.symbol || '').toUpperCase().trim();
    if (!symbol) return;
    const existing = merged.get(symbol) || {};
    const incoming = { ...coin };
    if (source && !incoming.authoritySource) incoming.authoritySource = source;
    merged.set(symbol, { ...existing, ...incoming, symbol });
  };
  base.forEach(c => upsert(c, 'coins'));
  (Array.isArray(scanMeta?.coins) ? scanMeta.coins : []).forEach(c => upsert(c, 'scanMeta.coins'));
  (Array.isArray(scanMeta?.top3) ? scanMeta.top3 : []).forEach(c => upsert(c, 'scanMeta.top3'));
  const positions = Array.isArray(scanMeta?.portfolio?.positions) ? scanMeta.portfolio.positions : [];
  positions.forEach(p => {
    const tier = String(p?.tier || '').toUpperCase();
    upsert({
      ...p,
      status: ['READY', 'PLAYABLE', 'PROBE'].includes(tier) ? tier : (p?.status || 'WATCH'),
      finalAuthorityStatus: ['READY', 'PLAYABLE', 'PROBE'].includes(tier) ? tier : (p?.finalAuthorityStatus || p?.status || 'WATCH'),
      displayStatus: ['READY', 'PLAYABLE', 'PROBE'].includes(tier) ? tier : (p?.displayStatus || p?.status || 'WATCH'),
      executionTier: ['READY', 'PLAYABLE', 'PROBE'].includes(tier) ? tier : p?.executionTier,
      executionActionable: ['READY', 'PLAYABLE', 'PROBE'].includes(tier) ? true : !!p?.executionActionable,
    }, 'portfolio.positions');
  });
  return Array.from(merged.values());
}

function getDashboardSetupLabel(coin) {
  if (typeof window.getStructuralSetupLabel === 'function') return window.getStructuralSetupLabel(coin);
  return String(coin?.setup || coin?.structureTag || 'Setup').trim();
}

function dashboardCanShowTradeLevels(coin) {
  return typeof window.shouldExposeTradeLevels === 'function'
    ? window.shouldExposeTradeLevels(coin)
    : false;
}

function hasBoundPositionEvidence(coin) {
  const posState = String(coin?.positionState || '').toUpperCase();
  if (['ARMED', 'PENDING', 'ACTIVE', 'PARTIAL_EXIT'].includes(posState)) return true;
  if (String(coin?.authoritySource || '') === 'portfolio_binding') return true;
  if (String(coin?.authorityReason || '').startsWith('dedup:')) return true;
  return false;
}

function isStrictDashboardActionable(coin) {
  if (!coin) return false;
  if (window.EXEC_GATE?.hasHardReject?.(coin)) return false;

  const status = getExecutionDisplayStatus(coin);
  if (!['READY', 'PLAYABLE', 'PROBE'].includes(status)) return false;

  const executionTier = String(coin.executionTier || coin.finalAuthorityStatus || coin.status || '').toUpperCase();
  if (executionTier === 'OBSERVE') return false;

  const gatePassed = coin.executionGatePassed === true;
  const actionable = coin.executionActionable === true;
  const authorityDecision = String(coin.authorityDecision || coin.decision || '').toUpperCase();
  const authorityOk = authorityDecision === 'ALLOW' || authorityDecision === 'WAIT';

  return (gatePassed && actionable) || authorityOk;
}

function __dashCounts(coins, execSummary, scanMeta = {}) {
  const c = __dashAuthorityCoins(coins, scanMeta);
  const deployableTop3 = Array.isArray(scanMeta?.deployableTop3) ? scanMeta.deployableTop3 : [];
  const locked = scanMeta?.executionBreakdown && typeof scanMeta.executionBreakdown === 'object'
    ? {
      ready: Number(scanMeta.executionBreakdown.ready || 0),
      playable: Number(scanMeta.executionBreakdown.playable || 0),
      probe: Number(scanMeta.executionBreakdown.probe || 0),
    }
    : null;
  const counts = { total: c.length, ready: 0, playable: 0, probe: 0, watch: 0, active: execSummary?.counts?.active || 0 };
  c.forEach(coin => {
    const status = getExecutionDisplayStatus(coin);
    if (!locked || !deployableTop3.length) {
      if (isStrictDashboardActionable(coin)) {
        if (status === 'READY') counts.ready++;
        else if (status === 'PLAYABLE') counts.playable++;
        else if (status === 'PROBE') counts.probe++;
      }
    } else {
      if (status === 'READY') counts.ready++;
      else if (status === 'PLAYABLE') counts.playable++;
      else if (status === 'PROBE') counts.probe++;
    }
    if (status === 'WATCH' || status === 'EARLY') counts.watch++;
  });
  if (deployableTop3.length) {
    // deployableTop3 is the current authority-approved shortlist. Prefer it over
    // older executionBreakdown snapshots so dashboard counters cannot say 0
    // while rendering approved Top setups.
    counts.ready = deployableTop3.filter(coin => getExecutionDisplayStatus(coin) === 'READY').length;
    counts.playable = deployableTop3.filter(coin => getExecutionDisplayStatus(coin) === 'PLAYABLE').length;
    counts.probe = deployableTop3.filter(coin => getExecutionDisplayStatus(coin) === 'PROBE').length;
  } else if (locked) {
    counts.ready = locked.ready;
    counts.playable = locked.playable;
    counts.probe = locked.probe;
  }
  return counts;
}

function __dashTopSetups(coins, limit = 5, scanMeta = {}) {
  // Hardened Re-hydration: Ensure top3 signals inherit latest hardened telemetry from execution engine + scanner grid
  const fullCoins = Array.isArray(coins) ? coins : [];
  const symbolMap = new Map(fullCoins.filter(c => c && c.symbol).map(c => [String(c.symbol).toUpperCase(), c]));
  const authoritativeTop3 = Array.isArray(scanMeta?.deployableTop3) && scanMeta.deployableTop3.length
    ? scanMeta.deployableTop3
    : (Array.isArray(scanMeta?.authoritativeTop3) ? scanMeta.authoritativeTop3 : []);

  let rawTop3 = [];
  if (authoritativeTop3.length > 0) rawTop3 = authoritativeTop3.slice(0, limit);

  // 🏛️ Final Consistency Check: Re-merge with full scanner objects to ensure momentum survival
  return rawTop3.map(c => {
    const symbol = String(c?.symbol || '').toUpperCase();
    const hardened = symbolMap.get(symbol);
    if (hardened) {
      // Preserve any UI-specific state from the top3 object but take metadata from hardened source
      return { ...hardened, ...c, momentumPhase: hardened.momentumPhase || c.momentumPhase };
    }
    return c;
  });
}

/* \u2500\u2500 RENDER COMPONENTS \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

function renderDashboardHeader(lastScan, source, gateLabel) {
  return `
    <div class="page-header">
      <div class="page-title">&#x26A1; Command Center</div>
      <div class="page-sub">${gateLabel} &middot; Base: ${source} &middot; Last: ${formatTimestamp(lastScan)}</div>
    </div>`;
}

function renderStrategicCommandHub(strategic) {
  if (!window.STRATEGIC_ENGINE) return '';
  if (!strategic) {
    return `
      <div class="strategic-hub-card loading">
        <div class="shc-header">
          <div class="shc-title">&#x1F6E1;&#xFE0F; Strategic Command Hub</div>
          <div class="shc-multiplier pulse">Synchronizing Metrics...</div>
        </div>
        <div class="shv-desc" style="opacity:0.5; font-size:12px; margin-top:10px">
          Connecting to Fear & Greed Index and BTC Dominance nodes...
        </div>
      </div>`;
  }
  const { rainbow, fng, dominance, riskMultiplier, verdict } = strategic;
  const multColor = riskMultiplier >= 1.2 ? 'var(--green)' : riskMultiplier <= 0.75 ? 'var(--red)' : 'var(--accent)';
  const fngColor = fng.value > 75 ? 'var(--red)' : fng.value < 25 ? 'var(--green)' : 'var(--accent)';
  const domColor = dominance.value > 56 ? 'var(--orange)' : 'var(--accent)';
  const rainbowBands = window.STRATEGIC_ENGINE?.RAINBOW_BANDS || [];
  const activeZone = rainbow?.zoneIndex ?? -1;
  return `
    <div class="strategic-hub-card premium-mode">
      <div class="shc-header">
        <div class="shc-title-group">
          <div class="shc-title">&#x1F6E1;&#xFE0F; STRATEGIC COMMAND HUB</div>
          <div class="shc-subtitle">Multi-Index Macro Dashboard</div>
        </div>
        <div class="shc-multiplier-gauge" style="border-color: ${multColor}">
          <div class="smg-label" style="color: ${multColor}">RISK CAP</div>
          <div class="smg-value">${(riskMultiplier || 1.0).toFixed(2)}x</div>
          ${strategic.factors ? `
            <div class="smg-breakdown" style="font-size: 8px; color: var(--text-muted); text-align: center; margin-top: 2px;">
              ${strategic.factors.rainbow} &times; ${strategic.factors.fng} &times; ${strategic.factors.dominance}
            </div>
          ` : ''}
        </div>
      </div>
      <div class="shc-grid">
        <div class="shc-metric-card">
          <div class="shm-label">Bitcoin Rainbow</div>
          <div class="shm-main">
            <div class="shm-value" style="color: ${rainbow?.color || 'var(--text)'}">${rainbow?.label || 'Unknown'}</div>
            <div class="shm-offset">${(rainbow?.offset || 0) > 0 ? '+' : ''}${rainbow?.offset || 0} dev</div>
          </div>
          <div class="shm-visual">
            <div class="shm-rainbow-bar">
              ${[0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => {
    const band = rainbowBands[i] || { color: 'transparent' };
    return `
                  <div class="shm-rb-segment ${i === activeZone ? 'active' : ''}" 
                       style="background: ${band.color}">
                  </div>`;
  }).join('')}
            </div>
          </div>
        </div>
        <div class="shc-metric-card">
          <div class="shm-label">Market Sentiment</div>
          <div class="shm-main">
            <div class="shm-value" style="color: ${fngColor}">${fng.label}</div>
            <div class="shm-offset">${fng.value}/100</div>
          </div>
          <div class="shm-visual">
            <div class="shm-progress-bg">
              <div class="shm-progress-fill" style="width: ${fng.value}%; background: ${fngColor}"></div>
            </div>
          </div>
        </div>
        <div class="shc-metric-card">
          <div class="shm-label">BTC Dominance</div>
          <div class="shm-main">
            <div class="shm-value" style="color: ${domColor}">${dominance.value.toFixed(1)}%</div>
            <div class="shm-offset ${dominance.change24h > 0 ? 'text-red' : 'text-green'}">
              ${dominance.change24h > 0 ? '&#x25B2;' : '&#x25BC;'}${Math.abs(dominance.change24h).toFixed(1)}%
            </div>
          </div>
          <div class="shm-visual">
            <div class="shm-progress-bg">
              <div class="shm-progress-fill" style="width: ${Math.max(10, dominance.value)}%; background: ${domColor}"></div>
            </div>
          </div>
        </div>
      </div>
      <div class="shc-verdict-box premium">
        <div class="shv-glow" style="background: ${multColor}"></div>
        <div class="shv-icon">&#x1F4A1;</div>
        <div class="shv-content">
          <div class="shv-title">STRATEGIC COMMAND VERDICT</div>
          <div class="shv-desc">${verdict}</div>
        </div>
      </div>
    </div>`;
}

function renderDashboardHero(gateClass, gateMode, gateLabel, safeST, marketInsight, bestCoin, regimeChip) {
  return `
    <div class="regime-gate-card ${gateClass}">
      <div class="rgc-header">
        <div class="rgc-label">System State Authority</div>
        <div class="rgc-mode ${gateMode.toLowerCase()}">${gateLabel}</div>
      </div>
      <div class="rgc-body">
        <div class="rgc-col">
          <div class="rgc-col-label">Market Regime</div>
          <div class="rgc-col-value ${gateMode.toLowerCase()}">${(safeST.btc || 'neutral').toUpperCase()}</div>
          <div class="rgc-col-sub">${marketInsight?.regimeDesc || (gateMode === 'DISABLED' ? 'Sideway/Chop block active' : 'Volatility within limits')}${(typeof regimeChip === 'string' && regimeChip) ? ` &middot; ${regimeChip}` : ''}</div>
        </div>
        <div class="rgc-col">
          <div class="rgc-col-label">Best Active Signal</div>
          ${bestCoin ? `
            <div class="rgc-col-value text-cyan">${bestCoin.symbol}</div>
            <div class="rgc-col-sub">${getDashboardSetupLabel(bestCoin) || 'High Quality Setup'} &middot; Conf ${Math.round((bestCoin.executionConfidence || 0) * 100)}% &middot; RR ${Number(bestCoin.rr || 0).toFixed(1)}x</div>
          ` : `
            <div class="rgc-col-value text-muted">&mdash;</div>
            <div class="rgc-col-sub">No high-conviction signals found in last scan</div>
          `}
        </div>
        <div class="rgc-action-col">
          <button class="btn btn-primary" onclick="navigate('scanner')">Scan Now</button>
          <div class="text-xs text-muted">Alpha Guard v10.6.9</div>
        </div>
      </div>
    </div>`;
}

function renderNoTradeOverlay(noTrade, gateMode, safeST, marketInsight, regime, proEdge) {
  if (!noTrade) return '';
  return `
    <div class="no-trade-overlay">
      <div class="no-trade-icon">&#x1F6D1;</div>
      <div class="no-trade-title">SYSTEM IN PROTECTIVE STANDBY</div>
      <div class="no-trade-reason">
        ${regime?.reason || proEdge?.gateReason || 'Market conditions do not meet hard-gate criteria for capital deployment.'}
      </div>
      <div class="flex-center gap-8 mb-16">
        <span class="reason-inline">GATE: ${gateMode}</span>
        <span class="reason-inline">CONTEXT: ${(safeST.btc || 'unknown').toUpperCase()}</span>
      </div>
      <button class="btn btn-outline btn-sm" onclick="this.nextElementSibling.classList.toggle('open')">View Analysis Details</button>
      <div class="no-trade-details">
        <div class="text-xs font-mono">
          CHOP_ZONE: ${marketInsight?.isChopZone ? 'YES' : 'NO'}<br>
          FAKE_BREAK: ${marketInsight?.fakeBreakRisk > 0.5 ? 'HIGH' : 'LOW'}<br>
          AUTHORITY: ALPHA GUARD ENGINE
        </div>
      </div>
    </div>`;
}

function renderAuthorityTrace(c) {
  // v10.6.9.52: Absolute Contract fulfillment + Position-Bound contradiction guard
  const trace = c.authorityTrace || {};
  if (!trace) return '';

  const rRej = Array.isArray(trace.rejectionsByTier?.READY) ? trace.rejectionsByTier.READY : [];
  const pRej = Array.isArray(trace.rejectionsByTier?.PLAYABLE) ? trace.rejectionsByTier.PLAYABLE : [];
  const prRej = Array.isArray(trace.rejectionsByTier?.PROBE) ? trace.rejectionsByTier.PROBE : [];
  const macro = trace.macro || {};
  const promo = trace.promotion || null;
  const expectancyMultiplier = trace.expectancy?.multiplier || 1.0;

  // v10.6.9.52 — Contradiction guard:
  // A coin can be PROBE/PLAYABLE/READY via portfolio binding from a previous scan,
  // while the current scan marks it pre_gate:watch (e.g. setup changed).
  // In this case, show the position-bound approval trace, not the misleading pre_gate trace.
  const coinStatus = (typeof getExecutionDisplayStatus === 'function') ? getExecutionDisplayStatus(c) : String(c.status || '').toUpperCase();
  const isActionable = ['READY', 'PLAYABLE', 'PROBE'].includes(coinStatus);
  const allPreGateBlocked = rRej.some(r => String(r).startsWith('pre_gate:')) &&
    pRej.some(r => String(r).startsWith('pre_gate:')) &&
    prRej.some(r => String(r).startsWith('pre_gate:'));

  if (isActionable && allPreGateBlocked && hasBoundPositionEvidence(c)) {
    // Position-Bound display: coin passed gate in prior scan, position still active
    const bt = coinStatus;
    const readyPass = bt === 'READY';
    const playPass = ['READY', 'PLAYABLE'].includes(bt);
    const probePass = ['READY', 'PLAYABLE', 'PROBE'].includes(bt);
    return `
    <div class="trace-trigger" onclick="event.stopPropagation()">&#x1F50D;</div>
    <div class="trace-popover" onclick="event.stopPropagation()">
      <div class="trace-header">Alpha Guard Trace</div>
      <div class="trace-section">
        <div class="trace-label">Gate Status</div>
        <div class="trace-value"><span class="trace-pass">&#x2705; Position Bound (${bt})</span></div>
      </div>
      <div class="trace-section"><div class="trace-label">READY</div>${readyPass ? '<div class="trace-pass">&#x2705; Passed</div>' : '<div class="trace-fail" style="opacity:0.7">&#x2193; Below Tier</div>'}</div>
      <div class="trace-section"><div class="trace-label">PLAYABLE</div>${playPass ? '<div class="trace-pass">&#x2705; Passed</div>' : '<div class="trace-fail" style="opacity:0.7">&#x2193; Below Tier</div>'}</div>
      <div class="trace-section"><div class="trace-label">PROBE</div>${probePass ? '<div class="trace-pass">&#x2705; Passed</div>' : '<div class="trace-fail">&#x274C; Rejected</div>'}</div>
      <div class="trace-section" style="border-top:1px dashed var(--border);padding-top:4px">
        <div class="trace-label" style="opacity:0.6">Note</div>
        <div class="trace-value" style="opacity:0.6;font-size:9px">Approved in prior scan &mdash; position maintained. Current scan signal diverged.</div>
      </div>
    </div>
  `;
  }

  return `
    <div class="trace-trigger" onclick="event.stopPropagation()">&#x1F50D;</div>
    <div class="trace-popover" onclick="event.stopPropagation()">
      <div class="trace-header">Alpha Guard Trace</div>
      
      <div class="trace-section">
        <div class="trace-label">Trigger Status</div>
        <div class="trace-value">
          ${trace.triggerMatched ? '<span class="trace-pass">&#x2705; Matched</span>' : '<span class="trace-fail">&#x274C; Missing</span>'}
          <span style="opacity:0.6;font-size:9px">(${trace.entrySignal || 'none'})</span>
        </div>
      </div>

      ${rRej.length ? `
      <div class="trace-section">
        <div class="trace-label">READY Blocked By</div>
        ${rRej.map(r => `<span class="trace-fail">${r}</span>`).join('')}
      </div>` : '<div class="trace-section"><div class="trace-label">READY</div><div class="trace-pass">&#x2705; Passed</div></div>'}

      ${pRej.length ? `
      <div class="trace-section">
        <div class="trace-label">PLAYABLE Blocked By</div>
        ${pRej.map(r => `<span class="trace-fail">${r}</span>`).join('')}
      </div>` : '<div class="trace-section"><div class="trace-label">PLAYABLE</div><div class="trace-pass">&#x2705; Passed</div></div>'}

      ${prRej.length ? `
      <div class="trace-section">
        <div class="trace-label">PROBE Blocked By</div>
        ${prRej.map(r => `<span class="trace-fail">${r}</span>`).join('')}
      </div>` : '<div class="trace-section"><div class="trace-label">PROBE</div><div class="trace-pass">&#x2705; Passed</div></div>'}

      <div class="trace-section">
        <div class="trace-label">Expectancy Multiplier</div>
        <div class="trace-value trace-multiplier">${expectancyMultiplier.toFixed(2)}x</div>
      </div>

      ${macro.sidewayPlayableBlocked ? `
      <div class="trace-section">
        <div class="trace-label">Macro Constraint</div>
        <div class="trace-value">
          BTC: ${macro.btcContext}<br>
          ${macro.playableBlocked ? '<span class="trace-fail">Sideway Block Active</span>' : '<span class="trace-pass">Sideway HQ Bypass</span>'}
        </div>
      </div>` : ''}

      ${promo ? `
      <div class="trace-section" style="border-top:1px dashed var(--border);padding-top:4px">
        <div class="trace-label">Promotion Trace</div>
        <div class="trace-value" style="color:var(--accent)">${promo.reason} (${promo.from} &rarr; ${promo.to})</div>
      </div>` : ''}
    </div>
  `;
}

function renderSignalSummaryBar(counts, capitalRegime) {
  return `
    <div class="signal-summary-bar">
      <div class="ssb-item ssb-ready" onclick="filterScannerByTier('READY')" title="Filter Scanner for READY signals">
        <span class="ssb-count">${counts.ready}</span> READY
      </div>
      <div class="ssb-item ssb-playable" onclick="filterScannerByTier('PLAYABLE')" title="Filter Scanner for PLAYABLE signals">
        <span class="ssb-count">${counts.playable}</span> PLAYABLE
      </div>
      <div class="ssb-item ssb-probe" onclick="filterScannerByTier('PROBE')" title="Filter Scanner for PROBE signals">
        <span class="ssb-count">${counts.probe}</span> PROBE
      </div>
      <div class="ssb-divider"></div>
      <div class="ssb-item ssb-watch" onclick="filterScannerByTier('WATCH')" title="Filter Scanner for WATCH signals">
        <span class="ssb-count">${counts.watch}</span> WATCH
      </div>
      <div class="ssb-regime" style="color:var(--text-muted); font-size:11px; margin-left:auto">
        Scanned: ${counts.total || 0} | Approved: ${(counts.ready || 0) + (counts.playable || 0) + (counts.probe || 0)} | Top: ${(
          Array.isArray(ST.scanMeta?.deployableTop3) ? ST.scanMeta.deployableTop3
          : (Array.isArray(ST.scanMeta?.authoritativeTop3) ? ST.scanMeta.authoritativeTop3 : [])
        ).length}
      </div>
    </div>`;
}

function renderTopSetups(topSetups, btcContext) {
  return `
    <div class="card mb-20" style="border-color: rgba(0,229,255,0.2)">
      <div class="card-title">&#x1F3C6; Top Authority-Approved Setups</div>
      <div class="text-xs text-muted mb-12">Execution-valid entries verified by the final authority gate.</div>
      <div class="grid-auto">
        ${topSetups.map((c, idx) => {
    const st = (typeof getExecutionDisplayStatus === 'function') ? getExecutionDisplayStatus(c) : String(c.status || 'WATCH').toUpperCase();
    const isExec = ['READY', 'PLAYABLE', 'PROBE'].includes(st);
    const cardClass = isExec ? 'ready-setup' : 'noise-setup';
    const hasActionable = topSetups.some(c => ['READY', 'PLAYABLE', 'PROBE'].includes(getExecutionDisplayStatus(c)));

    let decisionCode = 'SKIP';
    let decisionClass = 'skip';
    const multiplier = ST?.strategic?.riskMultiplier ?? 1.0;
    const authorityDecision = String(c.authorityDecision || c.decision || '').toUpperCase();
    const gatePassed = c.executionGatePassed === true;
    if (authorityDecision === 'ALLOW' && gatePassed) {
      decisionCode = 'ALLOW';
      decisionClass = 'trade';
    } else if (authorityDecision === 'WAIT') {
      decisionCode = 'WAIT';
      decisionClass = 'wait';
    } else if (authorityDecision === 'REJECT') {
      decisionCode = 'REJECT';
      decisionClass = 'skip';
    } else if (!c.rejectReason) {
      if (st === 'READY') {
        if (multiplier < 0.5) { decisionCode = 'RESTRICT'; decisionClass = 'wait'; }
        else { decisionCode = 'TRADE'; decisionClass = 'trade'; }
      }
      else if (st === 'PLAYABLE') {
        if (multiplier < 0.6) { decisionCode = 'CAP-LIMIT'; decisionClass = 'wait'; }
        else { decisionCode = 'ALLOW'; decisionClass = 'trade'; }
      }
      else if (st === 'PROBE') { decisionCode = 'MONITOR'; decisionClass = 'wait'; }
      else if (['WATCH', 'EARLY'].includes(st)) { decisionCode = 'WAIT'; decisionClass = 'wait'; }
    }
    const categoryName = c.category || (window.CATEGORY_ENGINE?.getCategory ? window.CATEGORY_ENGINE.getCategory(c.symbol) : 'OTHER');
    const liqScalingVal = c.liquidityScaling || 1.0;
    let velocityWarningMsg = '';
    if (st === 'ACTIVE' && c.openedAt && window.RISK_ENGINE?.evaluateTimeStop) {
      const momentumMoment = (num(c.price || c.lastPrice) > num(c.entry)) ? 1 : 0;
      const tsResult = window.RISK_ENGINE.evaluateTimeStop(c, btcContext, momentumMoment);
      const remainingH = (tsResult.remainingMs || (tsResult.limit - tsResult.ageMs) || 0) / 3600000;
      const hDisplay = Math.max(0, remainingH).toFixed(1);
      velocityWarningMsg = `<span class="badge ${remainingH < 6 ? 'badge-red' : 'badge-gray'}" style="font-size:9px">&#x23F1; ${hDisplay}h</span>`;
    }
    return `
          <div class="coin-card-compact ${cardClass}" onclick="navigate('scanner'); selectCoin('${c.symbol}')">
            <div class="ccc-top">
              <div style="display:flex;align-items:center;gap:10px">
                <div class="rank-badge ${st === 'READY_STRONG' ? 'ready-strong' : ''}">#${idx + 1}</div>
                <div style="display:flex;flex-direction:column">
                  <div style="display:flex;align-items:center;gap:6px">
                    <div class="ccc-sym">${c.symbol}</div>
                    <span class="category-badge">${categoryName}</span>
                    ${liqScalingVal < 1 ? `<span class="badge badge-yellow" title="Liquidity Scaling: ${Math.round(liqScalingVal * 100)}%" style="font-size:9px;padding:1px 4px">&#x1F4A7;</span>` : ''}
                    ${renderAuthorityTrace(c)}
                  </div>
                  <div class="ccc-sub">${getDashboardSetupLabel(c)} &middot; ${c.entryTiming || 'Watch'}</div>
                </div>
              </div>
              <div style="text-align:right">
                <div class="badge ${gradeInfo(c.score || 0).badge}">${c.score || 0}</div>
                <div class="text-xs font-mono mt-4 ${(c.rr || 0) >= 1.2 ? 'font-green' : 'font-yellow'}">${Number(c.rr || 0).toFixed(2)}R</div>
              </div>
            </div>
            ${dashboardCanShowTradeLevels(c) ? `
            <div class="ccc-prices">
              <div class="ccc-price-cell">
                <div class="ccc-price-label">Entry</div>
                <div class="ccc-price-val entry">${fmtPrice(c.entry)}</div>
              </div>
              <div class="ccc-price-cell">
                <div class="ccc-price-label">Stop</div>
                <div class="ccc-price-val stop font-red">${fmtPrice(c.stop)}</div>
              </div>
              <div class="ccc-price-cell">
                <div class="ccc-price-label">Action</div>
                <div class="ccc-price-val decision ${decisionClass}">${decisionCode}</div>
              </div>
            </div>` : `
            <div class="text-xs text-muted mt-8" style="padding:8px 10px;background:var(--bg-hover);border-radius:8px">Trade levels hidden until action truth is execution-eligible.</div>`}
            <div class="ccc-tags" style="display:flex;align-items:center;gap:4px;flex-wrap:wrap">
               <span class="badge ${st === 'READY' ? 'badge-green' : st === 'PLAYABLE' ? 'badge-cyan' : st === 'PROBE' ? 'badge-yellow' : 'badge-gray'}" title="Technical Signal Tier">${st}</span>
               
               <!-- Phase 3: Authority / Deploy Permission Badge -->
               ${(() => {
                 const decision = String(c.authorityDecision || c.decision || 'REJECT').toUpperCase();
                 const gatePassed = c.executionGatePassed === true;
                 const blocked = decision === 'REJECT' || !gatePassed;
                 const reason = c.authorityReason || c.reason || (c.authorityBlockers && c.authorityBlockers.length ? c.authorityBlockers[0] : null);
                 
                 if (blocked) {
                   return `<span class="badge badge-red" style="opacity:0.9" title="${reason || 'Blocked by Alpha Guard'}">&#x1F6AB; GATED</span>`;
                 } else if (decision === 'WAIT') {
                   return `<span class="badge badge-yellow" title="Awaiting entry trigger confirmed by authority">&#x23F3; PENDING</span>`;
                 } else {
                   return `<span class="badge badge-green" style="border:1px solid var(--green)" title="Authority granted for deployment">&#x2705; DEPLOY</span>`;
                 }
               })()}

               <span class="badge badge-purple">${Math.round((c.executionConfidence || 0) * 100)}% conf</span>
               ${velocityWarningMsg}
            </div>

            <!-- Phase 3: "Why not deploy?" Reasoning -->
            ${(() => {
              const decision = String(c.authorityDecision || c.decision || 'REJECT').toUpperCase();
              const gatePassed = c.executionGatePassed === true;
              const reason = c.authorityReason || (Array.isArray(c.authorityBlockers) ? c.authorityBlockers.join(', ') : null) || c.reason;
              if ((decision === 'REJECT' || !gatePassed) && reason) {
                return `<div class="text-xs font-red mt-4" style="font-size:9px; opacity:0.8; font-style:italic">Reason: ${reason}</div>`;
              }
              return '';
            })()}

            <!-- Momentum Telemetry (Elite Consistency Sync) -->
            ${(() => {
        const hasPhase = c.momentumPhase && c.momentumPhase !== 'NONE';
        const hasWarn = Array.isArray(c.momentumWarnings) && c.momentumWarnings.length > 0;
        if (hasPhase || hasWarn) {
          return `
                  <div class="momentum-telemetry phase-${c.momentumPhase || 'NONE'}" style="margin: 8px 0 0 0; padding: 6px 8px;">
                    <div class="mt-header">
                      <div class="mt-phase ${c.momentumPhase === 'LATE' ? 'text-red' : c.momentumPhase === 'MID' ? 'text-green' : 'text-cyan'}" style="font-size: 9px;">
                        Momentum: ${c.momentumPhase || 'EARLY'} <span class="mt-score">(${c.momentumScore || 0})</span>
                      </div>
                    </div>
                    <div class="mt-row" style="font-size: 8px;">
                      <span class="mt-key">Why:</span>
                      <span class="mt-val">${(c.momentumReason || []).slice(0, 2).join(' + ') || 'Normal'}</span>
                    </div>
                    ${hasWarn ? `
                      <div class="mt-row mt-warn" style="font-size: 8px;">
                        <span class="mt-key">Warn:</span>
                        <span class="mt-val">${c.momentumWarnings.slice(0, 2).join(', ')}</span>
                      </div>
                    ` : ''}
                  </div>
                `;
        }
        return '';
      })()}
          </div>`;
  }).join('') || '<div class="card p-40 text-center text-muted">No authority-aligned setups detected in universe.</div>'}
        
        ${(topSetups.length === 0 || !topSetups.some(c => ['READY', 'PLAYABLE', 'READY_STRONG'].includes(getExecutionDisplayStatus(c)))) ?
      `<div class="no-signals-placeholder">
             <span class="nsp-icon">&#x26A0;</span>
             <div class="nsp-title">No Authority-Approved Setups</div>
             <div class="nsp-desc">Current candidates are still in WATCH/WAIT status or have been blocked by final execution gates.</div>
           </div>` : ''}
      </div>
    </div>`;
}

function renderNearMissesPanel(nearMisses) {
  return `
    <div class="card">
      <div class="card-title">Lower Conviction / Missing Evidence</div>
      <div class="text-xs text-muted mb-12">Coins with high scores but failed Alpha Guard hard-gates.</div>
      <div style="display:flex; flex-direction:column; gap:8px">
        ${nearMisses.map(c => `
          <div class="near-miss-row" onclick="navigate('scanner'); selectCoin('${c.symbol}')">
            <span class="fw-700">${c.symbol}</span>
            <span class="text-muted text-xs">${getDashboardSetupLabel(c) || 'Accumulation'}</span>
            <span class="font-red text-xs mono" style="margin-left:auto">${c.rejectReason || 'Failed Hard-Gate'}</span>
          </div>
        `).join('') || '<div class="text-xs text-muted">No significant near-misses.</div>'}
      </div>
    </div>`;
}

function renderLearningSnapshot(learning) {
  if (!learning || !learning.learningActive) return '';
  return `
    <div class="card">
      <div class="card-title">Performance Intelligence</div>
      <div class="text-xs text-muted mb-8">Adaptive learning from ${learning.totalClosed + (learning.outcomeLearningSamples || 0)} samples</div>
      <div class="learning-grid">
         <div class="learning-stat">
            <div class="ls-label">Win Rate</div>
            <div class="ls-val">${learning.winRate}%</div>
         </div>
         <div class="learning-stat">
            <div class="ls-label">Avg R</div>
            <div class="ls-val">${learning.expectancyR}x</div>
         </div>
         <div class="learning-stat">
            <div class="ls-label">Edge</div>
            <div class="ls-val">${learning.edgeScore}</div>
         </div>
      </div>
    </div>`;
}

async function renderDashboard() {
  const container = $('page-dashboard');
  if (!container) return;

  const hydrated = await __dashHydrateFromDB();
  const safeST = window.ST || {};
  const coins = safeST.coins || [];
  const scanMeta = safeST.scanMeta || {};

  let execSummary = null;
  try {
    const unified = (typeof safeST.getUnifiedCoins === 'function') ? safeST.getUnifiedCoins() : coins;
    if (window.EXECUTION_SYNC?.summarize) {
      execSummary = window.EXECUTION_SYNC.summarize(unified);
    }
  } catch (err) { console.warn('[DASHBOARD] Exec summary failed:', err); }

  const counts = __dashCounts(coins, execSummary, scanMeta);
  const topSetups = __dashTopSetups(coins, 5, scanMeta);
  const bestCoin = topSetups.length > 0 ? topSetups[0] : null;

  const marketInsight = (typeof window.MARKET_INSIGHT?.getInsight === 'function') ? window.MARKET_INSIGHT.getInsight() : (scanMeta?.insight || {});
  const regime = scanMeta?.regime || {};
  const proEdge = scanMeta?.proEdge || {};
  const noTrade = !!(regime.noTrade);
  const gateMode = regime.gateMode || (noTrade ? 'DISABLED' : 'OPEN');
  const gateLabel = regime.gateLabel || (noTrade ? 'NO-TRADE GATE' : 'ALPHA GATE OPEN');
  const gateClass = noTrade ? 'locked' : (gateMode === 'STRICT' ? 'strict' : 'open');
  const regimeChip = regime.regimeChip || '';

  const nearMisses = (typeof getNearMisses === 'function') ? getNearMisses(5) : [];
  const learning = (typeof computeQuantStats === 'function') ? computeQuantStats() : null;
  const strategic = safeST.strategic || (window.STRATEGIC_ENGINE?.getLastSync ? window.STRATEGIC_ENGINE.getLastSync() : null);

  const header = renderDashboardHeader(scanMeta.lastScan, scanMeta.source || 'ST_V10.6.9_RAINBOW_HARDENING', gateLabel);
  const strategicHub = renderStrategicCommandHub(strategic);
  const hero = renderDashboardHero(gateClass, gateMode, gateLabel, safeST, marketInsight, bestCoin, regimeChip);
  const noTradeOverlay = renderNoTradeOverlay(noTrade, gateMode, safeST, marketInsight, regime, proEdge);
  const summaryBar = renderSignalSummaryBar(counts, scanMeta.capitalRegime);
  const topSignals = renderTopSetups(topSetups, safeST.btc);
  const nearMissesPanel = renderNearMissesPanel(nearMisses);
  const learningSnapshot = renderLearningSnapshot(learning);

  container.innerHTML = `
    <div class="dashboard-scroll-container">
      ${header}
      ${strategicHub}
      <div style="position:relative">
         ${hero}
         ${noTradeOverlay}
      </div>
      ${summaryBar}
      ${topSignals}
      <div class="grid-2">
         ${nearMissesPanel}
         ${learningSnapshot}
      </div>
      <div class="dashboard-footer-gap"></div>
    </div>
  `;
}
