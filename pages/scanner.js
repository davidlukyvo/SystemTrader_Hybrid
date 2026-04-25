/* \u2500\u2500 COIN SCANNER PAGE v9.3.1 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
let scanFilters = {
  capMin: 5, capMax: 100, pumpMax: 100,
  structure: 'all', narratives: []
};
let scanFetchStatus = 'idle'; // 'idle' | 'loading' | 'done' | 'error'
let scanLastFetch = null;
let hybridScanLock = false;

const NARRATIVES = ['AI', 'DePIN', 'Gaming', 'RWA', 'Infra', 'Cross-chain', 'Privacy', 'Data Layer'];

function getScannerSetupLabel(coin) {
  if (typeof window.getStructuralSetupLabel === 'function') return window.getStructuralSetupLabel(coin);
  return String(coin?.setup || coin?.structureTag || 'Setup').trim();
}

function scannerCanShowTradeLevels(coin) {
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

function executionMonitorPanel(execSummary) {
  // Alpha Guard v9: positions are tracked via 'positionState' (ARMED|PENDING|ACTIVE)
  const positions = execSummary?.coins?.filter(c => 
    ['ARMED', 'PENDING', 'ACTIVE'].includes(String(c.positionState || c.tradeState || '').toUpperCase())
  ) || [];

  return `
  <div class="card mb-20 execution-monitor">
    <div class="card-title">&#128737;&#65039; Execution Monitor</div>
    <div class="text-xs text-muted mb-12">Live tracking of engine-authorized positions and their lifecycle states.</div>
    
    ${positions.length ? `
      <div class="monitor-grid">
        ${positions.map(p => {
          const state = String(p.positionState || p.tradeState || '').toUpperCase();
          const stateCls = window.EXECUTION_SYNC?.positionStateToDisplayClass ? window.EXECUTION_SYNC.positionStateToDisplayClass(state) : state.toLowerCase();
          const tier = String(p.executionTier || p.status || 'WATCH').toUpperCase();
          
          return `
            <div class="monitor-row">
              <div class="monitor-coin">
                <span class="fw-800" style="color:var(--text-primary)">${p.symbol}</span>
                <span class="pos-badge ${stateCls}">${state}</span>
                <span class="text-xs opacity-50 ml-4">${tier}</span>
              </div>
              <div class="monitor-price font-mono text-xs">
                ${fmtPrice(p.entry || p.price)} &#8594; <span class="text-green">${fmtPrice(p.tp1)}</span>
              </div>
              <div class="monitor-risk text-xs">
                Risk: <span class="fw-700">${(p.riskPctPerTrade || p.riskPct || 0).toFixed(2)}%</span>
              </div>
              <div class="monitor-meta text-xs text-muted">
                Conf: ${Math.round((p.executionConfidence || 0) * 100)}%
              </div>
            </div>
          `;
        }).join('')}
      </div>
    ` : `
      <div class="p-16 text-center text-sm text-muted" style="background:var(--bg-hover);border-radius:8px">
        No active positions being monitored by Execution Engine V9.
      </div>
    `}
  </div>`;
}

function scannerTop3Panel() {
  const top3 = Array.isArray(ST.scanMeta?.deployableTop3) ? ST.scanMeta.deployableTop3.slice(0, 3) : [];
  if (!top3.length) {
    console.log('[DEBUG] Rendering Top1 Momentum: No authority-approved setup');
    return `
  <div class="card mb-20">
    <div class="card-title">&#x1F3C6; Top-Gate Signals</div>
    <div class="text-xs text-muted mb-12">Execution-verified shortlist only. Technical ranking is tracked separately and does not imply trade permission.</div>
    <div class="p-16 text-center text-sm text-muted" style="background:var(--bg-hover);border-radius:8px">
      No authority-approved setup in this scan. All candidates are currently blocked by deployment gates, capital guard, dedup, or pre-gate rules.
    </div>
  </div>`;
  }
  return `
  <div class="card mb-20">
    <div class="card-title">&#x1F3C6; Top-Gate Signals</div>
    <div class="text-xs text-muted mb-12">Authority-approved setups from the last scan. Only READY, PLAYABLE, or PROBE signals that pass final execution gates appear here.</div>
    <div class="grid-3">
      ${top3.map((c, i) => `
        <div class="coin-card-compact" onclick="openCoinDetail('${c.id}')">
          <div class="ccc-top">
            <div>
              <div class="ccc-sym">${i + 1}. ${c.symbol}</div>
              <div class="ccc-sub">${getScannerSetupLabel(c)} &middot; ${c.entryTiming || 'Watch'}</div>
            </div>
            <div style="text-align:right">
              <div class="badge ${gradeInfo(c.score || 0).badge}">${c.score || 0}</div>
              <div class="text-xs font-mono mt-4 ${(c.rr || 0) >= 1.2 ? 'font-green' : 'font-yellow'}">${(c.rr || 0).toFixed(2)}R</div>
            </div>
          </div>
          ${scannerCanShowTradeLevels(c) ? `
          <div class="ccc-prices">
            <div class="ccc-price-cell"><div class="ccc-price-label">Entry</div><div class="ccc-price-val entry">${fmtPrice(c.entry)}</div></div>
            <div class="ccc-price-cell"><div class="ccc-price-label">Stop</div><div class="ccc-price-val stop font-red">${fmtPrice(c.stop)}</div></div>
            <div class="ccc-price-cell"><div class="ccc-price-label">TP1</div><div class="ccc-price-val tp1 font-green">${fmtPrice(c.tp1)}</div></div>
          </div>` : `
          <div class="text-xs text-muted mt-8" style="padding:8px 10px;background:var(--bg-hover);border-radius:8px">Trade levels hidden until action truth is execution-eligible.</div>`}
          <div class="ccc-tags">
            <span class="badge ${(() => {
              const st = getExecutionDisplayStatus(c);
              return st === 'READY' ? 'badge-green' : st === 'PLAYABLE' ? 'badge-cyan' : st === 'PROBE' ? 'badge-yellow' : 'badge-gray';
            })()}">${getExecutionDisplayStatus(c)}</span>
            
            <!-- Phase 3: Authority / Deploy Permission Badge -->
            ${(() => {
              const decision = String(c.authorityDecision || c.decision || 'REJECT').toUpperCase();
              const gatePassed = c.executionGatePassed === true;
              const blocked = decision === 'REJECT' || !gatePassed;
              const reason = c.authorityReason || c.reason || (c.authorityBlockers && c.authorityBlockers.length ? c.authorityBlockers[0] : null);
              
              if (blocked) {
                return `<span class="badge badge-red" style="font-size:9px" title="${reason || 'Blocked by Alpha Guard'}">&#x1F6AB; GATED</span>`;
              } else if (decision === 'WAIT') {
                return `<span class="badge badge-yellow" style="font-size:9px" title="Awaiting entry trigger confirmed by execution gates">&#x23F3; PENDING</span>`;
              } else {
                return `<span class="badge badge-green" style="font-size:9px; border:1px solid var(--green)" title="Execution granted for deployment">&#x2705; DEPLOY</span>`;
              }
            })()}

            <span class="badge badge-purple">${c.category || 'OTHER'}</span>
            <span class="badge badge-cyan">conf ${Math.round((c.executionConfidence || 0) * 100)}%</span>
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
          
          <!-- Momentum Telemetry (v1.1 Phase 1 Audit) -->
          ${(() => {
            const hasPhase = c.momentumPhase && c.momentumPhase !== 'NONE';
            const hasWarn = Array.isArray(c.momentumWarnings) && c.momentumWarnings.length > 0;
            if (hasPhase || hasWarn) {
              if (i === 0) console.log(`[DEBUG] Rendering Top1 Momentum: ${c.symbol} -> ${c.momentumPhase} (${c.momentumScore})`);
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

          ${c.liquidityWarning ? `<div class="text-xs text-yellow mt-4">&#x26A0; ${c.liquidityWarning}</div>` : ''}
        </div>
      `).join('') || '<div class="text-muted text-sm p-16">No candidates met hard-gate criteria.</div>'}
    </div>
  </div>`;
}

function scannerAvoidPanel() {
  const topSymbols = new Set((ST.scanMeta?.top3 || []).map(c => c.symbol));
  const avoid = [...ST.coins]
    .filter(c => {
      if (!c) return false;
      const score = Number(c.score || 0);
      const executionLike = ['READY', 'PLAYABLE', 'PROBE'].includes(getExecutionDisplayStatus(c));
      const protectedTop = topSymbols.has(c.symbol) || score >= 30 || executionLike;
      if (c.fakePumpRisk === 'high') return true;
      if (c.rejected) return !protectedTop;
      return score < 20 && !protectedTop;
    })
    .sort((a, b) => (a.score || 0) - (b.score || 0))
    .slice(0, 6);

  return `
  <div class="card mb-20">
    <div class="card-title">&#x1F6AB; Auto Avoid List</div>
    <div class="text-sm text-muted" style="margin-bottom:12px">Detected high-risk or low-quality coins filtered by the engine.</div>
    ${avoid.length ? `
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        ${avoid.map(c => `
          <div style="padding:10px 12px;border-radius:10px;background:rgba(255,71,87,.07);border:1px solid rgba(255,71,87,.18);min-width:220px;flex:1">
            <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">
              <div>
                <div class="mono fw-800">${c.symbol}</div>
                <div class="text-xs text-muted" style="margin-top:3px">${getScannerSetupLabel(c) || 'Low score'}</div>
                ${c.rejectionAudit ? `<div class="text-xs font-red mt-4">&#x1F6D1; ${c.rejectionAudit.code}</div>` : ''}
              </div>
              <div style="text-align:right">
                <span class="badge badge-red">${c.score || 0}</span>
                <div class="text-xs mt-4">${(c.rr || 0).toFixed(2)}R</div>
              </div>
            </div>
          </div>
        `).join('')}
      </div>` : '<div class="text-sm text-muted">No high-risk coins detected in recent scans.</div>'}
  </div>`;
}

async function copyRuntimeAuditSnapshot() {
  const summary = window.RUNTIME_AUDIT?.summarizeLatest ? window.RUNTIME_AUDIT.summarizeLatest() : null;
  if (!summary) {
    window.showToast?.('No runtime audit snapshot available yet.', 'warning');
    return;
  }
  try {
    await navigator.clipboard.writeText(JSON.stringify(summary, null, 2));
    window.showToast?.('Runtime audit copied to clipboard.', 'success');
  } catch (err) {
    console.error('[RUNTIME AUDIT] Copy failed:', err);
    window.showToast?.('Failed to copy runtime audit.', 'error');
  }
}

async function copyRuntimeAuditShortSummary() {
  const shortSummary = window.RUNTIME_AUDIT?.toShortSummary ? window.RUNTIME_AUDIT.toShortSummary() : '';
  if (!shortSummary) {
    window.showToast?.('No runtime audit short summary available yet.', 'warning');
    return;
  }
  try {
    await navigator.clipboard.writeText(shortSummary);
    window.showToast?.('Runtime audit short summary copied.', 'success');
  } catch (err) {
    console.error('[RUNTIME AUDIT] Short summary copy failed:', err);
    window.showToast?.('Failed to copy runtime audit short summary.', 'error');
  }
}

function exportRuntimeAuditSnapshot() {
  const summary = window.RUNTIME_AUDIT?.summarizeLatest ? window.RUNTIME_AUDIT.summarizeLatest() : null;
  if (!summary) {
    window.showToast?.('No runtime audit snapshot available yet.', 'warning');
    return;
  }
  try {
    const stamp = new Date(summary.updatedAt || Date.now()).toISOString().replace(/[:.]/g, '-');
    const blob = new Blob([JSON.stringify(summary, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `runtime-audit-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 0);
    window.showToast?.('Runtime audit exported.', 'success');
  } catch (err) {
    console.error('[RUNTIME AUDIT] Export failed:', err);
    window.showToast?.('Failed to export runtime audit.', 'error');
  }
}

function runtimeAuditPanel() {
  const summary = window.RUNTIME_AUDIT?.summarizeLatest ? window.RUNTIME_AUDIT.summarizeLatest() : null;
  if (!summary) return '';

  const counts = summary.counts || {};
  const metrics = summary.populationMetrics || {};
  const blockers = Array.isArray(summary.blockerRanking) ? summary.blockerRanking.slice(0, 6) : [];
  const exec = summary.executionTrace || {};
  const updatedAt = summary.updatedAt ? new Date(summary.updatedAt).toLocaleTimeString() : 'n/a';

  return `
  <div class="card mb-20">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
      <div>
        <div class="card-title">&#128202; Runtime Audit Summary</div>
        <div class="text-xs text-muted">Auto-summarized from the latest scan traces so we can spot blocker distribution without reading raw logs.</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <div class="text-xs text-muted">Updated: ${updatedAt}</div>
        <button class="btn btn-xs btn-outline" onclick="copyRuntimeAuditShortSummary()">Copy Short Summary</button>
        <button class="btn btn-xs btn-outline" onclick="copyRuntimeAuditSnapshot()">Copy JSON</button>
        <button class="btn btn-xs btn-outline" onclick="exportRuntimeAuditSnapshot()">Export JSON</button>
      </div>
    </div>

    <div class="grid-2 mt-12" style="gap:14px">
      <div style="background:var(--bg-hover);border:1px solid var(--border);border-radius:10px;padding:12px">
        <div class="fw-800 text-muted mb-8">Blocker Groups</div>
        <div class="text-sm" style="display:grid;grid-template-columns:1fr auto;gap:6px 10px">
          <div>Capital Blocked</div><div class="mono fw-700">${counts.capital_blocked || 0}</div>
          <div>Pre-Gate Blocked</div><div class="mono fw-700">${counts.pre_gate_blocked || 0}</div>
          <div>Gate Quality Blocked</div><div class="mono fw-700">${counts.gate_quality_blocked || 0}</div>
          <div>Other / Missing</div><div class="mono fw-700">${(counts.other_blocked || 0) + (counts.no_blocker_recorded || 0)}</div>
          <div>Total Signals</div><div class="mono fw-700">${counts.total || 0}</div>
        </div>
      </div>

      <div style="background:var(--bg-hover);border:1px solid var(--border);border-radius:10px;padding:12px">
        <div class="fw-800 text-muted mb-8">Population Shape</div>
        <div class="text-sm" style="display:grid;grid-template-columns:1fr auto;gap:6px 10px">
          <div>Conf = 0.50</div><div class="mono fw-700">${metrics.conf_eq_050 || 0}</div>
          <div>RR &lt; 0.65</div><div class="mono fw-700">${metrics.rr_lt_065 || 0}</div>
          <div>RR &lt; 0.95</div><div class="mono fw-700">${metrics.rr_lt_095 || 0}</div>
          <div>RR &lt; 1.20</div><div class="mono fw-700">${metrics.rr_lt_120 || 0}</div>
          <div>Score &lt; 18</div><div class="mono fw-700">${metrics.score_lt_18 || 0}</div>
          <div>Setup = unclear</div><div class="mono fw-700">${metrics.setup_unclear || 0}</div>
          <div>Trigger = wait</div><div class="mono fw-700">${metrics.trigger_wait || 0}</div>
        </div>
      </div>
    </div>

    <div class="grid-2 mt-12" style="gap:14px">
      <div style="background:var(--bg-hover);border:1px solid var(--border);border-radius:10px;padding:12px">
        <div class="fw-800 text-muted mb-8">Top Blockers</div>
        ${blockers.length ? blockers.map(item => `
          <div style="display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-top:1px dashed rgba(255,255,255,0.06)">
            <div class="text-xs" style="min-width:0;word-break:break-word">${item.reason}</div>
            <div class="mono fw-700">${item.count}</div>
          </div>
        `).join('') : '<div class="text-sm text-muted">No blocker ranking available yet.</div>'}
      </div>

      <div style="background:var(--bg-hover);border:1px solid var(--border);border-radius:10px;padding:12px">
        <div class="fw-800 text-muted mb-8">Latest Execution Trace</div>
        ${exec.symbol ? `
          <div class="text-sm" style="display:grid;grid-template-columns:1fr auto;gap:6px 10px">
            <div>Symbol</div><div class="mono fw-700">${exec.symbol}</div>
            <div>Reason</div><div class="mono fw-700">${exec.reason || 'n/a'}</div>
            <div>RR</div><div class="mono fw-700">${Number(exec.signal?.rr || 0).toFixed(2)}</div>
            <div>Score</div><div class="mono fw-700">${Number(exec.signal?.score || 0)}</div>
            <div>Conf</div><div class="mono fw-700">${Number(exec.signal?.conf || 0).toFixed(2)}</div>
          </div>
          ${Array.isArray(exec.primaryRejections) && exec.primaryRejections.length ? `
            <div class="mt-8">
              ${exec.primaryRejections.map(item => `<span class="badge badge-gray" style="margin-right:6px;margin-bottom:6px">${item.type}:${item.count}</span>`).join('')}
            </div>
          ` : ''}
        ` : '<div class="text-sm text-muted">No execution trace captured yet.</div>'}
      </div>
    </div>
  </div>`;
}

function getScannerFilterEmptyMessage() {
  const tier = window.SCANNER_FILTER_TIER;
  if (!tier) return 'No coins matching filters.';

  const authoritative = Array.isArray(ST.scanMeta?.deployableTop3) ? ST.scanMeta.deployableTop3 : [];
  const matchingAuthoritative = authoritative.filter(c => getExecutionDisplayStatus(c) === tier);
  if (!matchingAuthoritative.length) {
    return `No ${tier} setups exist in the current authority-approved shortlist. This view is showing an active dashboard/scanner tier filter, but deployment gates are currently blocking all candidates.`;
  }

  return `No coins matching the active ${tier} filter.`;
}

function renderScanner() {
  const regime = ST.scanMeta.regime || {};
  const insight = ST.scanMeta.insight || {};
  
  const cooldownText = window.NET_GUARD?.getCooldownLeftMs?.() ? ` &middot; cooldown ${window.NET_GUARD.formatLeft()}` : '';
  const unifiedCoins = (typeof ST.getUnifiedCoins === 'function' ? ST.getUnifiedCoins() : (ST.sessionState?.coins || ST.coins || ST.scanMeta?.coins || []));
  const execSummary = window.EXECUTION_SYNC?.syncRuntime
    ? window.EXECUTION_SYNC.syncRuntime(window.ST, unifiedCoins)
    : null;

  const total = scanLastFetch || 0;
  const actionable = execSummary?.actionableCount || 0;
  const topCount = (
    Array.isArray(ST.scanMeta?.deployableTop3) ? ST.scanMeta.deployableTop3
    : (Array.isArray(ST.scanMeta?.authoritativeTop3) ? ST.scanMeta.authoritativeTop3 : [])
  ).length;

  const getStatusUI = () => {
    const color = (scanFetchStatus === 'loading') ? 'var(--yellow)' 
                : (scanFetchStatus === 'done') ? 'var(--green)'
                : (scanFetchStatus === 'error') ? 'var(--red)' 
                : 'var(--text-muted)';
    const lastScanTs = Number(ST.scanMeta?.lastScanTs || ST.scanMeta?.lastScan || 0);
    const scanTimeText = lastScanTs > 0
      ? ` | ${new Date(lastScanTs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
      : '';
    const text = scanFetchStatus === 'loading' ? '&#x23F3; Scanning...'
                : scanFetchStatus === 'done' ? `&#x2705; Found: ${actionable} approved signals | Top: ${topCount}${scanTimeText}${cooldownText}`
                : scanFetchStatus === 'error' ? `&#x26A0; Error${cooldownText}`
                : `&#x2B24; Ready${cooldownText}`;
    return { color, text };
  };

  const status = getStatusUI();

  let proEdge = ST.scanMeta.proEdge || null;

  $('page-scanner').innerHTML = `
  <div class="page-header">
    <div class="page-title">&#x1F50D; Coin Scanner</div>
    <div class="page-sub">Execution-grade signal detection and universe management</div>
  </div>

  <div class="btc-warning" style="display:${(ST.btc === 'bear' || regime.noTrade) ? 'block' : 'none'}">
    ${regime.noTrade ? `&#x1F6D1; NO-TRADE REGIME \u2014 ${regime.reason || 'Insufficient market quality'}` : '&#x26A0;&#xFE0F; BTC BEARISH \u2014 Capital preservation highly recommended.'}
  </div>

  <div class="card mb-20" style="background:rgba(0,0,0,0.2); padding:12px; display:flex; flex-wrap:wrap; gap:16px; font-size:11px">
    <div style="flex:1; min-width:200px">
      <div class="fw-800 text-muted mb-4">Signal Tiers (Quality)</div>
      <div><span class="badge badge-green">READY</span> Top tier, high conviction</div>
      <div class="mt-4"><span class="badge badge-cyan">PLAYABLE</span> Good, watch closely</div>
      <div class="mt-4"><span class="badge badge-yellow">PROBE</span> Low size, exploratory</div>
    </div>
    <div style="flex:1; min-width:200px; border-left:1px dashed var(--border); padding-left:16px">
      <div class="fw-800 text-muted mb-4">Deployment Gates (Execution)</div>
      <div><span class="badge badge-green" style="border:1px solid var(--green)">&#x2705; DEPLOY</span> Approved by execution engine</div>
      <div class="mt-4"><span class="badge badge-yellow">&#x23F3; PENDING</span> Awaiting entry trigger confirmation</div>
      <div class="mt-4"><span class="badge badge-red">&#x1F6AB; GATED</span> Blocked by risk/position limits</div>
    </div>
  </div>

  <!-- Scanner Live Fetch Panel -->
  <div class="card mb-20" style="border-color:var(--accent-glow)">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
      <div>
        <div style="font-size:14px;font-weight:800;color:var(--accent);margin-bottom:3px">&#x1F3DB;&#xFE0F; Smart Execution Engine v9.5</div>
        <div class="text-sm text-muted">Multi-timeframe 15m/1h/4h/1D scan with adaptive quant filters</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <div style="font-size:11px;font-family:'JetBrains Mono',monospace;color:${status.color}">${status.text}</div>
        <button class="btn btn-primary" onclick="runAISmartScanner()" ${(scanFetchStatus === 'loading' || window.NET_GUARD?.getCooldownLeftMs?.()) ? 'disabled' : ''}>
          ${scanFetchStatus === 'loading' ? '&#x23F3; Scanning...' : (window.NET_GUARD?.getCooldownLeftMs?.() ? `&#x23F1; Cooldown ${window.NET_GUARD.formatLeft()}` : '&#x26A1; Start Smart Scan')}
        </button>
        <button class="btn btn-outline btn-sm" onclick="clearCGCoins()">&#x1F5D1; Clear</button>
        <button class="btn btn-outline btn-sm" onclick="resetHybridCache()">&#x267B; Reset Cache</button>
      </div>
    </div>
    <div id="cgProgress" style="display:none;margin-top:12px">
      <div class="score-bar-track" style="height:4px">
        <div class="score-bar-fill" id="cgProgressBar" style="width:0%;transition:width .5s"></div>
      </div>
      <div id="cgProgressText" class="text-xs text-muted" style="margin-top:4px">Syncing universe...</div>
    </div>
  </div>

  <div class="grid-2 mb-20">
    <!-- Filters -->
    <div class="card">
      <div class="card-title">&#x1F39A; High-Level Filters</div>
      <div class="form-group">
        <label class="form-label">Pump Threshold (%):</label>
        <div style="display:flex;gap:8px;align-items:center">
          <input type="range" min="20" max="200" value="${scanFilters.pumpMax}" id="pumpSlider" oninput="updatePumpFilter(this.value)">
          <span class="font-mono fw-700 text-yellow" style="min-width:40px" id="pumpLabel">${scanFilters.pumpMax}%</span>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Narrative Focus:</label>
        <div style="display:flex;flex-wrap:wrap;gap:5px">
          ${NARRATIVES.map(n => `
            <span class="badge ${scanFilters.narratives.includes(n) ? 'badge-cyan' : 'badge-gray'}"
              style="cursor:pointer;padding:5px 10px"
              onclick="toggleNarrative('${n}')">${n}</span>
          `).join('')}
        </div>
      </div>
      <button class="btn btn-sm btn-primary w-100" onclick="renderScanner()">Apply Filters</button>
    </div>

    <!-- Insight Summary -->
    <div class="card">
      <div class="card-title">&#x1F9E0; Insight Snapshot</div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <div class="text-sm text-muted">Market Health</div>
        <div>
          <span class="badge ${insight.marketHealth === 'healthy' ? 'badge-green' : insight.marketHealth === 'thin' ? 'badge-yellow' : 'badge-red'}">${insight.marketHealth || 'weak'}</span>
          <span class="mono fw-700 ml-8">${Number.isFinite(insight.marketHealthScore) ? insight.marketHealthScore : 0}/10</span>
        </div>
      </div>
      <div class="text-xs text-muted">Found ${insight.qualifiedCount || 0} setups in ${insight.analyzedCount || 0} analyzed coins.</div>
      <div class="mt-12">
        ${(insight.noTradeReasons && insight.noTradeReasons.length) ? insight.noTradeReasons.map(r => `<div class="text-sm">&bull; ${r}</div>`).join('') : '<div class="text-sm text-muted">Regulatory conditions satisfied.</div>'}
      </div>
    </div>
  </div>

  ${executionMonitorPanel(execSummary)}
  ${window.SCANNER_FILTER_TIER ? `
    <div class="card mb-20" style="background:rgba(0,229,255,0.05); border:1px dashed var(--accent)">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div class="text-sm">
          <span class="text-muted">Active Tier Filter:</span> 
          <span class="badge ${window.SCANNER_FILTER_TIER === 'READY' ? 'badge-green' : window.SCANNER_FILTER_TIER === 'PLAYABLE' ? 'badge-cyan' : window.SCANNER_FILTER_TIER === 'PROBE' ? 'badge-yellow' : 'badge-gray'}">${window.SCANNER_FILTER_TIER}</span>
        </div>
        <button class="btn btn-xs btn-outline" onclick="window.SCANNER_FILTER_TIER=null; renderScanner()">&#x2715; Clear Filter</button>
      </div>
      ${(() => {
        const authoritative = Array.isArray(ST.scanMeta?.deployableTop3) ? ST.scanMeta.deployableTop3 : [];
        const matchingAuthoritative = authoritative.filter(c => getExecutionDisplayStatus(c) === window.SCANNER_FILTER_TIER);
        if (matchingAuthoritative.length) return '';
        return `<div class="text-xs text-muted mt-8">No ${window.SCANNER_FILTER_TIER} setups exist in the current authority-approved shortlist. The filter came from UI navigation, not from a live deployment approval in this batch.</div>`;
      })()}
    </div>
  ` : ''}
  ${scannerTop3Panel()}
  ${scannerAvoidPanel()}
  ${runtimeAuditPanel()}

  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px">
    <div class="page-title" style="font-size:16px">Universe Intelligence (<span id="coinCount">0</span>)</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      <button class="btn btn-sm btn-outline" onclick="sortCoins('score')">&#x2B07; Score</button>
      <button class="btn btn-sm btn-outline" onclick="sortCoins('cap')">&#x2B07; Vol</button>
      <button class="btn btn-sm btn-outline" onclick="sortCoins('pump')">&#x2B07; Pump</button>
      <button class="btn btn-sm btn-outline" onclick="sortCoins('relvol')">&#x2B07; RelVol</button>
    </div>
  </div>
  <div class="grid-auto" id="coinGrid"></div>
  ${renderDebugPanel()}
  `;

  renderCoinGrid();
}

function filteredCoins() {
  return ST.coins.filter(c => {
    // Tier Filter (from Dashboard)
    if (window.SCANNER_FILTER_TIER) {
      const tier = getExecutionDisplayStatus(c);
      if (tier !== window.SCANNER_FILTER_TIER) return false;
    }

    const pump = c.pump7d !== undefined ? c.pump7d : c.pumpRecent;
    if (pump > scanFilters.pumpMax) return false;
    if (scanFilters.narratives.length > 0 && !(c.narratives || []).some(n => scanFilters.narratives.includes(n))) return false;
    return true;
  });
}

let _sortMode = 'score';
function sortCoins(mode) { _sortMode = mode; renderCoinGrid(); }

function renderAuthorityTrace(c) {
  // v10.6.9.52: Absolute Contract + Position-Bound contradiction guard
  const trace = c.authorityTrace || null;
  const hasTierTrace = !!(
    trace &&
    (
      Array.isArray(trace.rejectionsByTier?.READY) ||
      Array.isArray(trace.rejectionsByTier?.PLAYABLE) ||
      Array.isArray(trace.rejectionsByTier?.PROBE)
    )
  );
  const hasTriggerTrace = !!(trace && ('triggerMatched' in trace || 'entrySignal' in trace));
  if (!trace || (!hasTierTrace && !hasTriggerTrace)) return '';

  const rRej = Array.isArray(trace.rejectionsByTier?.READY) ? trace.rejectionsByTier.READY : [];
  const pRej = Array.isArray(trace.rejectionsByTier?.PLAYABLE) ? trace.rejectionsByTier.PLAYABLE : [];
  const prRej = Array.isArray(trace.rejectionsByTier?.PROBE) ? trace.rejectionsByTier.PROBE : [];
  const macro = trace.macro || {};
  const promo = trace.promotion || null;
  const expectancyMultiplier = trace.expectancy?.multiplier || 1.0;

  // Contradiction guard: coin is actionable (portfolio-bound) but trace shows pre_gate rejection
  const coinStatus = getExecutionDisplayStatus(c);
  const isActionable = ['READY', 'PLAYABLE', 'PROBE'].includes(coinStatus);
  const allPreGateBlocked = rRej.some(r => String(r).startsWith('pre_gate:')) &&
                            pRej.some(r => String(r).startsWith('pre_gate:')) &&
                            prRej.some(r => String(r).startsWith('pre_gate:'));

  if (isActionable && allPreGateBlocked && hasBoundPositionEvidence(c)) {
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
  `;}

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

function renderCoinGrid() {
  let coins = filteredCoins();
  coins = coins.sort((a, b) => {
    if (_sortMode === 'score') return (b.riskAdjustedScore || b.score || 0) - (a.riskAdjustedScore || a.score || 0);
    if (_sortMode === 'cap') return (b.volume24h || 0) - (a.volume24h || 0);
    if (_sortMode === 'pump') return (b.pump7d || 0) - (a.pump7d || 0);
    if (_sortMode === 'relvol') return (b.relVol || 0) - (a.relVol || 0);
    return 0;
  });
  const grid = $('coinGrid');
  if (!grid) return;
  $('coinCount').textContent = coins.length;
  if (!coins.length) {
    grid.innerHTML = `<div class="text-muted p-40 text-center">${getScannerFilterEmptyMessage()}</div>`;
    return;
  }

  grid.innerHTML = coins.map(c => {
    const score = Math.round(c.riskAdjustedScore ?? c.score ?? 0);
    const isSelected = window.SCANNED_SYMBOL === String(c.symbol).toUpperCase();
    return `
    <div class="coin-card ${isSelected ? 'selected' : ''}" data-symbol="${c.symbol}" onclick="openCoinDetail('${c.id}')">
      <div class="coin-header">
        <div>
          <div style="display:flex;align-items:center;gap:6px">
            <div class="coin-symbol">${c.symbol}</div>
            ${renderAuthorityTrace(c)}
          </div>
          <div class="coin-cap">${c.name}</div>
        </div>
        <div style="text-align:right">
          <span class="badge ${(() => {
            const st = getExecutionDisplayStatus(c);
            return st === 'READY' ? 'badge-green' : st === 'PLAYABLE' ? 'badge-cyan' : st === 'PROBE' ? 'badge-yellow' : 'badge-gray';
          })()}">${getExecutionDisplayStatus(c)}</span>

          <!-- Phase 3: Authority / Deploy Permission Badge -->
          ${(() => {
            const decision = String(c.authorityDecision || c.decision || 'REJECT').toUpperCase();
            const gatePassed = c.executionGatePassed === true;
            const blocked = decision === 'REJECT' || !gatePassed;
            if (blocked) return `<span class="badge badge-red" style="font-size:9px">&#x1F6AB; GATED</span>`;
            if (decision === 'WAIT') return `<span class="badge badge-yellow" style="font-size:9px">&#x23F3; PENDING</span>`;
            return `<span class="badge badge-green" style="font-size:9px; border:1px solid var(--green)">&#x2705; DEPLOY</span>`;
          })()}
          <div class="coin-score">${score}</div>
        </div>
      </div>
      <div class="coin-tags">
        <span class="badge badge-purple">${c.category || 'OTHER'}</span>
        <span class="badge badge-gray">${getScannerSetupLabel(c) || 'Price Action'}</span>
        <span class="badge badge-cyan">conf ${Math.round((c.executionConfidence || 0) * 100)}%</span>
        <span class="badge ${c.fakePumpRisk === 'low' ? 'badge-green' : 'badge-yellow'}">FakeRisk ${c.fakePumpRisk || 'low'}</span>
      </div>
      ${(c.warnings || []).length ? `<div class="text-xs text-yellow mb-4 mt-8">&#x26A0; ${c.warnings.join(', ')}</div>` : ''}
      
      <!-- Momentum Telemetry (Phase 1 Passive Audit) -->
      ${(() => {
        const hasPhase = c.momentumPhase && c.momentumPhase !== 'NONE';
        const hasWarn = Array.isArray(c.momentumWarnings) && c.momentumWarnings.length > 0;
        if (hasPhase || hasWarn) {
          return `
            <div class="momentum-telemetry phase-${c.momentumPhase || 'NONE'}">
              <div class="mt-header">
                <div class="mt-label">Momentum Telemetry</div>
                <div class="mt-phase ${c.momentumPhase === 'LATE' ? 'text-red' : c.momentumPhase === 'MID' ? 'text-green' : 'text-cyan'}">
                  ${c.momentumPhase || 'EARLY'} <span class="mt-score">(${c.momentumScore || 0})</span>
                </div>
              </div>
              <div class="mt-row">
                <span class="mt-key">Why:</span>
                <span class="mt-val" title="${(c.momentumReason || []).join(', ')}">${(c.momentumReason || []).slice(0, 3).join(' + ') || 'Normal flow'}</span>
              </div>
              ${hasWarn ? `
                <div class="mt-row mt-warn">
                  <span class="mt-key">Warn:</span>
                  <span class="mt-val">${c.momentumWarnings.slice(0, 2).join(', ')}</span>
                </div>
              ` : ''}
            </div>
          `;
        }
        return '';
      })()}

      ${c.rejectionAudit ? `<div class="text-xs font-red mb-4 mt-8 font-mono" style="line-height:1.4">&#x1F6AB; Gate: ${c.rejectionAudit.code}<br>RR: ${(c.rejectionAudit.rr || 0).toFixed(2)}x (Floor: ${(c.rejectionAudit.rrFloor || 0).toFixed(2)}x)</div>` : ''}
      ${c.rejectReasons && c.rejectReasons.length ? `<div class="text-xs mb-4 mt-4" style="line-height:1.4">
          ${c.rejectReasons.map(r => {
            const isCaution = r.includes('[CAUTION]');
            const color = isCaution ? 'var(--yellow)' : 'var(--red)';
            const icon = isCaution ? '&#x26A0;' : '&#x1F6D1;';
            return `<div style="color:${color};margin-bottom:2px">${icon} ${r}</div>`;
          }).join('')}
        </div>` : ''}
      
      <!-- Phase 3: "Why not deploy?" Reasoning (Authority) -->
      ${(() => {
        const decision = String(c.authorityDecision || c.decision || 'REJECT').toUpperCase();
        const gatePassed = c.executionGatePassed === true;
        const reason = c.authorityReason || (Array.isArray(c.authorityBlockers) ? c.authorityBlockers.join(', ') : null) || c.reason;
        
        let out = '';
        if ((decision === 'REJECT' || !gatePassed) && reason) {
          out += `<div class="text-xs font-red mt-4" style="font-size:9px; opacity:0.8; font-style:italic">&#x1F6AB; Blocked: ${reason}</div>`;
        }
        
        const learningPool = String(c.learningPool || 'excluded');
        const isEligible = learningPool !== 'excluded' && window.LEARNING_ENGINE?.getClassification(c) !== 'reject';
        out += `<div class="text-xs mt-4" style="font-size:9px; opacity:0.7; color:${isEligible ? 'var(--green)' : 'var(--red)'}">Learning Eligible: ${isEligible ? 'Yes' : 'No'}${isEligible ? ` (${learningPool})` : ''}</div>`;
        
        return out ? `<div style="margin-top:8px; margin-bottom:8px; border-top:1px dashed var(--border); padding-top:4px">${out}</div>` : '';
      })()}
      ${c.liquidityWarning ? `<div class="text-xs text-yellow mb-4">&#x26A0; ${c.liquidityWarning}</div>` : ''}
      <div class="coin-stats">
        <div class="coin-stat"><div class="coin-stat-label">Price</div><div class="coin-stat-val">${fmtPrice(c.price)}</div></div>
        <div class="coin-stat"><div class="coin-stat-label">24h Vol</div><div class="coin-stat-val">${formatCap(c.volume24h)}</div></div>
        <div class="coin-stat"><div class="coin-stat-label">7d Pump</div><div class="coin-stat-val">${(c.pump7d || 0).toFixed(1)}%</div></div>
        <div class="coin-stat"><div class="coin-stat-label">RR</div><div class="coin-stat-val">${(c.rr || 0).toFixed(2)}R</div></div>
      </div>
      <div class="flex-between mt-12">
        <button class="btn btn-sm btn-outline" onclick="event.stopPropagation();openCoinDetail('${c.id}')">Analysis</button>
        <button class="btn btn-sm btn-danger" onclick="event.stopPropagation();deleteCoin('${c.id}')">&#x1F5D1;</button>
      </div>
    </div>`;
  }).join('');
}

function updatePumpFilter(val) { scanFilters.pumpMax = parseInt(val); if ($('pumpLabel')) $('pumpLabel').textContent = val + '%'; }
function toggleNarrative(n) {
  const idx = scanFilters.narratives.indexOf(n);
  if (idx >= 0) scanFilters.narratives.splice(idx, 1); else scanFilters.narratives.push(n);
  renderScanner();
}

async function runAISmartScanner(meta = {}) {
  const source = String(meta.source || 'manual');
  const trigger = String(meta.trigger || source);
  if (hybridScanLock || window.__SCANNING__) return { skipped: true, reason: 'scan_lock' };

  hybridScanLock = true;
  window.__SCANNING__ = true;
  scanFetchStatus = 'loading';
  renderScanner();
  const prog = $('cgProgress');
  const bar = $('cgProgressBar');
  const txt = $('cgProgressText');
  if (prog) prog.style.display = 'block';

  try {
    const result = await window.LIVE_SCANNER.run((message, pct) => {
      if (txt) txt.textContent = message;
      if (bar) bar.style.width = pct + '%';
    }, { scanSource: source, scanTrigger: trigger, scanMode: 'EXPANSION' });

    scanLastFetch = `${(result?.top3 || []).length} signals &middot; ${new Date().toLocaleTimeString()}`;
    scanFetchStatus = 'done';

    try {
      if (window.EXECUTION_SYNC?.syncRuntime) {
        window.EXECUTION_SYNC.syncRuntime(window.ST, result?.coins || window.ST?.coins || []);
      }
      if (window.__LAST_EXECUTION_TRACE__) {
        console.groupCollapsed?.('[EXEC TRACE] Alpha Guard Gateway');
        console.log('[EXEC TRACE] Latest Result:', window.__LAST_EXECUTION_TRACE__);
        if (window.__EXECUTION_HISTORY__) {
          console.log('[EXEC TRACE] Session History:', window.__EXECUTION_HISTORY__);
        }
        console.groupEnd?.();
      }
      if (window.PRO_EDGE?.rebuildAfterScan) {
        await window.PRO_EDGE.rebuildAfterScan();
      }
      if (window.AlertEngine?.processSignals) {
        const signalRows = (result?.coins || []).map(c => ({
          id: `alert-${c.symbol}-${Date.now()}`,
          symbol: c.symbol,
          displayStatus: c.displayStatus || c.finalAuthorityStatus || c.status,
          status: c.status,
          finalAuthorityStatus: c.finalAuthorityStatus || c.status,
          authorityDecision: c.authorityDecision || c.decision,
          authorityTrace: c.authorityTrace || null,
          authorityReason: c.authorityReason || c.reason || null,
          authorityBlockers: Array.isArray(c.authorityBlockers) ? c.authorityBlockers : [],
          executionTier: c.executionTier || c.finalAuthorityStatus || c.status,
          executionGatePassed: c.executionGatePassed === true,
          executionActionable: c.executionActionable === true,
          entry: c.entry,
          stop: c.stop,
          tp1: c.tp1,
          rr: c.rr,
          executionConfidence: c.executionConfidence,
          confScore: c.confScore ?? c.executionConfidence,
          score: c.score,
          setup: c.setup,
          reason: c.reason,
          decision: c.decision,
          fakePumpRisk: c.fakePumpRisk,
          chartEntryQuality: c.chartEntryQuality,
          entrySignal: c.entrySignal || 'none',
          entryTiming: c.entryTiming,
          btcContext: c.btcContext || ST.btc,
          regime: c.regime || ST.scanMeta?.regime?.type || 'CHOP',
          bias: c.bias || c.btcContext || ST.btc,
          phase: c.phase || c.momentumPhase || c.setup || 'unknown',
          category: c.category,
          playable: c.playable
        }));
        const alertMeta = {
          btcContext: result?.btcContext || ST.scanMeta?.insight?.btcContext || ST.scanMeta?.btcContext || ST.btc,
          regimeType: ST.scanMeta?.regime?.type || 'CHOP',
          sessionStats: {
            scanned: Number(result?.scanMeta?.insight?.analyzedCount || result?.coins?.length || 0),
            blocked: Number((result?.coins || []).filter(x => ['AVOID', 'FETCH_FAIL', 'WATCH'].includes(getExecutionDisplayStatus(x))).length),
            active: Number((result?.coins || []).filter(x => ['READY', 'PLAYABLE', 'PROBE'].includes(getExecutionDisplayStatus(x))).length)
          }
        };
        try {
          console.groupCollapsed?.('[ALERT TRACE] processSignals runtime');
          console.log('[ALERT TRACE] meta', alertMeta);
          const alertResult = await window.AlertEngine.processSignals(signalRows, alertMeta);
          window.__LAST_ALERT_TRACE__ = { at: Date.now(), meta: alertMeta, signals: signalRows, result: alertResult };
          if (window.RUNTIME_AUDIT?.printLatest) {
            window.RUNTIME_AUDIT.printLatest({
              alertTraceEngine: window.__LAST_ALERT_TRACE_ENGINE__,
              alertTrace: window.__LAST_ALERT_TRACE__,
              executionTrace: window.__LAST_EXECUTION_TRACE__,
            });
          }
          console.log('[ALERT TRACE] result', alertResult);
          console.groupEnd?.();
        } catch (alertErr) {
          window.__LAST_ALERT_TRACE__ = { at: Date.now(), meta: alertMeta, signals: signalRows, error: String(alertErr?.message || alertErr) };
          console.error('[ALERT TRACE] processSignals failed', alertErr);
          console.groupEnd?.();
        }
      }
    } catch (hookErr) {
      console.warn('[SCANNER] Post-scan hook failed (non-fatal):', hookErr);
    }
    window.__DASHBOARD_DB_CACHE__ = null;
    setTimeout(() => { if ($('cgProgress')) $('cgProgress').style.display = 'none'; }, 1500);
    renderScanner();
    return result;
  } catch (err) {
    console.error('[SCANNER] Fatal execution error:', err);
    scanFetchStatus = 'error';
    if (txt) txt.textContent = 'Error: ' + (err.message || 'Unknown execution failure');
    renderScanner();
  } finally {
    hybridScanLock = false;
    window.__SCANNING__ = false;
  }
}

function clearCGCoins() {
  if (!confirm('Clear all scanner signals?')) return;
  ST.coins = ST.coins.filter(c => !c.fromCG && !c.fromHybrid && c.source !== 'LIVE');
  window.SCANNER_FILTER_TIER = null;
  ST.save();
  renderScanner();
}

function resetHybridCache() {
  CACHE.resetEverything();
  if (ST.scanMeta) ST.scanMeta.cache = {};
  window.SCANNER_FILTER_TIER = null;
  ST.save();
  alert('Cache cleared. Universe will be rebuilt on next scan.');
  renderScanner();
}

function deleteCoin(id) { ST.coins = ST.coins.filter(c => String(c.id) !== String(id)); ST.save(); renderCoinGrid(); }
function openCoinDetail(id) {
  if (typeof scorerState !== 'undefined') scorerState.coinId = id;
  navigate('scorer');
}

async function copyDebugSnapshot() {
  const snapshot = {
    version: 'v10.6.9.56-P5-debug',
    ts: Date.now(),
    scanMeta: window.ST?.scanMeta || {},
    deployableTop3: ST.scanMeta?.deployableTop3 || [],
    learning: {
      engineActive: !!window.LEARNING_ENGINE,
      repairRun: window.__LAST_LEARNING_REPAIR__ || null
    },
    metrics: {
      timings: window.__LAST_SCAN_STAGE_TIMINGS__ || {},
      budget: window.__LAST_SCAN_PERF_BUDGET__ || {},
      quality: window.__LAST_SCAN_QUALITY_SUMMARY__ || {},
      integrity: window.__LAST_DB_INTEGRITY_SUMMARY__ || {}
    },
    slowSymbols: window.__LAST_SCAN_SLOW_SYMBOLS__ || [],
    regime: window.ST?.scanMeta?.regime || {},
  };
  
  try {
    await navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2));
    alert('Debug Snapshot copied to clipboard!');
  } catch (err) {
    console.error('[SCANNER] Copy failed:', err);
    alert('Failed to copy snapshot. Check console.');
  }
}

function renderDebugPanel() {
  const last = window.__lastHybridResult || {};
  const repair = window.__LAST_LEARNING_REPAIR__;
  const contract = window.__LAST_SCAN_CONTRACT_SUMMARY__;
  const dbIntegrity = window.__LAST_DB_INTEGRITY_SUMMARY__;
  const perf = window.__LAST_SCAN_PERF_BUDGET__;
  
  let repairLine = '';
  if (repair) {
    repairLine = `<div class="text-xs text-muted mt-8" style="opacity:0.8">Historical Repair v10.6.9: Scanned ${repair.scanned}, Repaired ${repair.repaired} (${repair.durationMs}ms)</div>`;
  }

  let dbLine = '';
  if (dbIntegrity) {
    dbLine = `
    <div class="text-xs mt-12" style="border-top:1px dashed var(--border); padding-top:8px; opacity:0.9">
      <div class="mb-4 fw-800">Persistence Integrity Diagnostics</div>
      <div style="display:flex; gap:12px; flex-wrap:wrap">
        <span>Signals: ${dbIntegrity.counts.signals}</span>
        <span>Scans: ${dbIntegrity.counts.scans}</span>
        <span>Trades: ${dbIntegrity.counts.trades}</span>
        <span class="badge badge-green" style="font-size:8px">Healthy</span>
      </div>
    </div>`;
  }

  let perfLine = '';
  if (perf) {
    const pCls = perf.usagePct > 100 ? 'text-red' : perf.usagePct > 80 ? 'text-yellow' : 'text-green';
    perfLine = `
    <div class="text-xs mt-12" style="border-top:1px dashed var(--border); padding-top:8px">
      <div class="mb-4 fw-800">Performance Analytics</div>
      <div style="display:flex; justify-content:space-between; align-items:center">
        <span>Budget Usage: <span class="mono ${pCls}">${perf.usagePct}%</span> (${(perf.consumedMs/1000).toFixed(1)}s / ${(perf.budgetMs/1000).toFixed(1)}s)</span>
        <button class="btn btn-xs btn-outline" onclick="copyDebugSnapshot()">Copy Debug Snapshot</button>
      </div>
    </div>`;
  }
  
  let contractLine = '';
  if (contract) {
    contractLine = `
    <div class="text-xs mt-12" style="border-top:1px dashed var(--border); padding-top:8px">
      <div class="mb-4 fw-800">Authority Contract Audit</div>
      <div style="display:flex; gap:8px; align-items:center">
        <span class="badge ${contract.violationCount > 0 ? 'badge-red' : 'badge-green'}">${contract.valid} Pass / ${contract.violationCount} Fail</span>
        <span class="text-muted" style="font-size:10px">READY: ${contract.breakdown.READY} | PLAYABLE: ${contract.breakdown.PLAYABLE} | PROBE: ${contract.breakdown.PROBE} | WATCH: ${contract.breakdown.WATCH}</span>
      </div>
    </div>`;
  }

  return `
  <div class="card mt-20">
    <div class="card-title" style="display:flex; justify-content:space-between; align-items:center">
      <span>&#x1F6E0; Engine Diagnosis</span>
      <button class="btn btn-xs btn-outline" onclick="DB.checkDatabaseIntegrity().then(() => renderScanner())">Check Integrity</button>
    </div>
    <div class="text-xs text-muted">
      Universe: ${last.liveUniverseCount || 0} &middot; Candidates: ${last.candidateCount || 0} &middot; Qualified: ${last.qualifiedCount || 0} &middot; BTC: ${ST.btc}
    </div>
    ${contractLine}
    ${perfLine}
    ${dbLine}
    ${repairLine}
  </div>`;
}
