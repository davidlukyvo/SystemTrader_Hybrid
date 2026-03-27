/* ── COIN SCANNER PAGE ───────────────────────────────────── */
let scanFilters = {
  capMin: 5, capMax: 100, pumpMax: 100,
  structure: 'all', narratives: []
};
let scanFetchStatus = 'idle'; // 'idle' | 'loading' | 'done' | 'error'
let scanLastFetch   = null;
let hybridScanLock = false;

const NARRATIVES = ['AI','DePIN','Gaming','RWA','Infra','Cross-chain','Privacy','Data Layer'];


function scannerTop3Panel() {
  const top3 = getTopSetups(3);
  return `
  <div class="card mb-20">
    <div class="card-title">🏆 Top 3 Scanner Panel</div>
    <div class="text-sm text-muted" style="margin-bottom:12px">Ưu tiên READY trước. Nếu chưa có READY, panel này sẽ show top 3-4 SCALP_READY / PLAYABLE / PROBE setups đã qua smart-execution filter; entry timing được adapt theo regime.</div>
    <div class="grid-3">
      ${top3.map((c, i) => `
        <div style="padding:14px;border-radius:12px;background:var(--bg-hover);border:1px solid var(--border)">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
            <div>
              <div class="mono fw-800" style="font-size:18px">${i+1}. ${c.symbol}</div>
              <div class="text-xs text-muted" style="margin-top:4px">${c.setup || c.structureTag || 'No setup'} · ${c.phase || 'n/a'}</div>
            </div>
            <span class="badge ${gradeInfo(c.score || 0).badge}">${c.score || 0}</span>
          </div>
          <div class="grid-2 gap-8" style="margin-top:12px">
            <div><div class="text-xs text-muted">Entry</div><div class="mono fw-700">${fmtPrice(c.entry)}</div></div>
            <div><div class="text-xs text-muted">Stop</div><div class="mono fw-700 text-red">${fmtPrice(c.stop)}</div></div>
            <div><div class="text-xs text-muted">TP1</div><div class="mono fw-700 text-green">${fmtPrice(c.tp1)}</div></div>
            <div><div class="text-xs text-muted">RelVol</div><div class="mono fw-700">${c.relVol ? c.relVol.toFixed(1)+'x' : '–'}</div></div>
          </div>
          <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap">
            <span class="badge badge-gray">FakePump ${c.fakePumpRisk || 'n/a'}</span>
            <span class="badge badge-gray">${c.vsaTag || 'neutral'}</span>
            <span class="badge badge-cyan">conf ${Math.round((c.executionConfidence || 0)*100)}%</span>
            <span class="badge badge-gray">${c.entryTiming || 'n/a'}</span>
            <span class="badge ${c.chartEntryQuality==='entry_good'?'badge-green':c.chartEntryQuality==='entry_late'?'badge-red':'badge-yellow'}">${c.chartEntryQuality || 'neutral'}</span>
          </div>
          <div class="text-xs text-muted" style="margin-top:10px">${(c.structureReasons && c.structureReasons[0]) || c.notes || 'No explanation yet'}</div>
        </div>
      `).join('') || '<div class="text-sm text-muted">Chưa có setup READY/SCALP_READY đủ điều kiện. Review near-miss; smart execution chỉ nâng tier khi RR + confidence + entry timing đồng thuận.</div>'}
    </div>
  </div>`;
}

function scannerAvoidPanel() {
  const avoid = [...ST.coins]
    .filter(c => c.rejected || c.fakePumpRisk === 'high' || (c.score || 0) < 65)
    .sort((a,b) => (a.score || 0) - (b.score || 0))
    .slice(0, 6);

  return `
  <div class="card mb-20">
    <div class="card-title">🚫 Auto Avoid List</div>
    <div class="text-sm text-muted" style="margin-bottom:12px">Tự sinh từ hệ thống: rejected / fake pump high / score thấp.</div>
    ${avoid.length ? `
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        ${avoid.map(c => `
          <div style="padding:10px 12px;border-radius:10px;background:rgba(255,71,87,.07);border:1px solid rgba(255,71,87,.18);min-width:220px;flex:1">
            <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">
              <div>
                <div class="mono fw-800">${c.symbol}</div>
                <div class="text-xs text-muted" style="margin-top:3px">${c.setup || c.structureTag || 'No setup'}</div>
              </div>
              <span class="badge badge-red">${c.score || 0}</span>
            </div>
            <div class="text-xs text-muted" style="margin-top:8px">${(c.rejectReasons && c.rejectReasons[0]) || (c.fakePumpRisk === 'high' ? 'Fake pump risk high' : 'Score dưới chuẩn')}</div>
          </div>
        `).join('')}
      </div>` : '<div class="text-sm text-muted">Hiện chưa có coin nào bị loại rõ ràng.</div>'}
  </div>`;
}


function renderScanner() {
  const statusColor = {
    loading:'var(--yellow)', done:'var(--green)',
    error:'var(--red)', idle:'var(--text-muted)'
  }[scanFetchStatus];
  const cooldownText = window.NET_GUARD?.getCooldownLeftMs?.() ? ` · cooldown ${window.NET_GUARD.formatLeft()}` : '';
  const statusText = scanFetchStatus==='loading' ? '⏳ Đang scan...'
    : scanFetchStatus==='done' ? `✅ Đã scan ${scanLastFetch}${cooldownText}`
    : scanFetchStatus==='error' ? `⚠ Scan có phần lỗi${cooldownText}`
    : `⬤ Chưa fetch${cooldownText}`;

  const regime = ST.scanMeta.regime || {};
  const cacheMeta = ST.scanMeta.cache || {};
  const insight = ST.scanMeta.insight || {};
  const proEdge = ST.scanMeta.proEdge || null;
  $('page-scanner').innerHTML = `
  <div class="page-header">
    <div class="page-title">🔍 Coin Scanner</div>
    <div class="page-sub">Lọc và quản lý danh sách coin tiềm năng</div>
  </div>
  <div class="btc-warning" style="display:${(ST.btc==='bear' || regime.noTrade)?'block':'none'}">
    ${regime.noTrade ? `🛑 NO-TRADE REGIME — ${regime.reason || 'Không có setup đủ chuẩn'}` : '⚠️ BTC BREAKDOWN – Micro-cap rơi rất mạnh. Hết sức cẩn thận.'}
  </div>

  <!-- Scanner Live Fetch Panel -->
  <div class="card mb-20" style="border-color:rgba(0,229,255,.3);box-shadow:0 0 24px rgba(0,229,255,.08)">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
      <div>
        <div style="font-size:14px;font-weight:800;color:var(--accent);margin-bottom:3px">🏛️ Self-Learning Live Market Scan</div>
        <div class="text-sm text-muted">Quét Binance USDT spot với execution layer: strict filter + learning + edge score + scalp-ready mode</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <div style="font-size:11px;font-family:'JetBrains Mono',monospace;color:${statusColor}">${statusText}</div>
        <button class="btn btn-primary" onclick="runAISmartScanner()" ${(scanFetchStatus==='loading' || window.NET_GUARD?.getCooldownLeftMs?.())?'disabled':''}>
          ${scanFetchStatus==='loading'?'⏳ Đang scan...':(window.NET_GUARD?.getCooldownLeftMs?.() ? `⏱ Chờ ${window.NET_GUARD.formatLeft()}` : '🧠 AI Learning Engine v6.0')}
        </button>
        <button class="btn btn-outline btn-sm" onclick="clearCGCoins()">🗑 Clear Scan</button>
        <button class="btn btn-outline btn-sm" onclick="resetHybridCache()">♻ Reset Cache</button>
      </div>
    </div>
    <div id="cgProgress" style="display:none;margin-top:12px">
      <div class="score-bar-track" style="height:4px">
        <div class="score-bar-fill" id="cgProgressBar" style="width:0%;transition:width .5s"></div>
      </div>
      <div id="cgProgressText" class="text-xs text-muted" style="margin-top:4px">Đang tải...</div>
    </div>
    <div style="margin-top:12px;padding:10px 14px;border-radius:8px;background:var(--bg-hover);font-size:11px;color:var(--text-muted)">
      <strong style="color:var(--text-secondary)">Cách hoạt động:</strong>
      Learning engine: discovery live universe + prefilter + multi-timeframe 15m/4h/1D + adaptive quant profile từ journal. Auto adapt market regime + entry timing nâng cấp; sideway ưu tiên scalp, bull ưu tiên expansion, bear siết hard gate.
      <br><span style='color:var(--accent)'>v7.3 Smart Execution:</span> ${ST.scanMeta.learning?.mode || 'bootstrap'} mode · allocation hint ${cacheMeta.allocationHint || '0.25%'} · scalp execution enabled · ${cacheMeta.universeCached ? 'Universe cache ✓' : 'Universe cache –'} · ${cacheMeta.exchangeInfoCached ? 'ExchangeInfo cache ✓' : 'ExchangeInfo cache –'}
    </div>
  </div>

  ${proEdge ? `
  <div class="card mb-20" style="border-color:${proEdge.disableTrading ? 'rgba(239,68,68,.28)' : proEdge.gateMode==='REDUCED' ? 'rgba(245,158,11,.24)' : 'rgba(16,185,129,.24)'}">
    <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap">
      <div class="card-title">🧠 PRO EDGE Gate</div>
      <span class="badge ${proEdge.disableTrading ? 'badge-red' : proEdge.gateMode==='REDUCED' ? 'badge-yellow' : 'badge-green'}">${proEdge.gateMode}</span>
    </div>
    <div class="grid-4 gap-8">
      <div style="padding:10px;border-radius:8px;background:var(--bg-hover)"><div class="text-xs text-muted">Best setup</div><div class="fw-700">${proEdge.bestSetup || 'unknown'}</div></div>
      <div style="padding:10px;border-radius:8px;background:var(--bg-hover)"><div class="text-xs text-muted">Risk multiplier</div><div class="fw-700">${proEdge.disableTrading ? '0x' : `${proEdge.dynamicRiskMultiplier}x`}</div></div>
      <div style="padding:10px;border-radius:8px;background:var(--bg-hover)"><div class="text-xs text-muted">Suggested coin</div><div class="fw-700">${proEdge.suggestedSymbol || 'No trade'}</div></div>
      <div style="padding:10px;border-radius:8px;background:var(--bg-hover)"><div class="text-xs text-muted">Recent outcome</div><div class="fw-700">${proEdge.outcomeWinRate || 0}% / ${proEdge.outcomeAvgR || 0}R</div></div>
    </div>
    <div class="text-sm text-muted" style="margin-top:10px">${proEdge.gateReason || 'No note'} · Score floor ${proEdge.scoreFloor || 'n/a'} · alloc ${Math.round(Number(proEdge.allocationHintPct || 0) * 100)}%</div>
  </div>` : ''}

  <div class="grid-2 mb-20">
    <div class="card">
      <div class="card-title">🧠 Insight Layer</div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <div class="text-sm text-muted">Market Health</div>
        <div><span class="badge ${insight.marketHealth === 'healthy' ? 'badge-green' : insight.marketHealth === 'thin' ? 'badge-yellow' : 'badge-red'}">${insight.marketHealth || 'weak'}</span> <span class="mono fw-700" style="margin-left:6px">${Number.isFinite(insight.marketHealthScore) ? insight.marketHealthScore : 0}/10</span></div>
      </div>
      <div class="text-xs text-muted">Qualified: ${insight.qualifiedCount || 0} / Analyzed: ${insight.analyzedCount || 0}</div>
      <div style="margin-top:10px">
        ${(insight.noTradeReasons && insight.noTradeReasons.length) ? insight.noTradeReasons.map(r => `<div class="text-sm" style="margin-bottom:6px">• ${r}</div>`).join('') : '<div class="text-sm text-muted">Không có no-trade reason nổi bật.</div>'}
      </div>
    </div>
    <div class="card">
      <div class="card-title">🎯 Near Miss & Reject Summary</div>
      <div class="text-xs text-muted" style="margin-bottom:8px">Nhóm coin gần đạt chuẩn và lý do bị loại nhiều nhất.</div>
      ${(insight.nearMisses && insight.nearMisses.length) ? insight.nearMisses.slice(0,3).map(c => `<div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:8px"><div><div class="mono fw-700">${c.symbol}</div><div class="text-xs text-muted">${c.reason}</div></div><span class="badge badge-yellow">${c.score}</span></div>`).join('') : '<div class="text-sm text-muted" style="margin-bottom:8px">Chưa có near miss đáng chú ý.</div>'}
      <div style="margin-top:10px">
        ${(insight.rejectionSummary && insight.rejectionSummary.length) ? insight.rejectionSummary.slice(0,3).map(x => `<div class="text-xs text-muted" style="margin-bottom:4px">• ${x.reason} <span class="mono">(${x.count})</span></div>`).join('') : '<div class="text-xs text-muted">Chưa có dữ liệu rejection summary.</div>'}
      </div>
    </div>
  </div>

  <div class="grid-2 mb-20" style="align-items:start">
    <!-- Filters -->
    <div class="card">
      <div class="card-title">Bộ Lọc</div>

      <div class="form-group">
        <label class="form-label">Liquidity 24h: <span id="capLabel">Live market mode</span></label>
        <div class="text-xs text-muted">Scanner v5.5.2 không dùng market cap live. Bộ lọc chính là thanh khoản, activity và adaptive institutional trigger quality từ Binance.</div>
      </div>

      <div class="form-group">
        <label class="form-label">Loại coin đã pump hơn (%):</label>
        <div style="display:flex;gap:8px;align-items:center">
          <input type="range" min="20" max="200" value="${scanFilters.pumpMax}" id="pumpSlider" oninput="updatePumpFilter(this.value)">
          <span class="font-mono fw-700 text-yellow" style="min-width:40px" id="pumpLabel">${scanFilters.pumpMax}%</span>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Structure:</label>
        <div style="display:flex;gap:6px">
          ${['all','clear','unclear'].map(v=>`
            <button class="btn btn-sm ${scanFilters.structure===v?'btn-primary':'btn-outline'}" onclick="updateStructureFilter('${v}')">${v==='all'?'Tất cả':v==='clear'?'✅ Rõ':'❌ Không rõ'}</button>
          `).join('')}
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Narrative:</label>
        <div style="display:flex;flex-wrap:wrap;gap:5px">
          ${NARRATIVES.map(n=>`
            <span class="badge ${scanFilters.narratives.includes(n)?'badge-cyan':'badge-gray'}"
              style="cursor:pointer;padding:5px 10px"
              onclick="toggleNarrative('${n}')">${n}</span>
          `).join('')}
        </div>
      </div>
      <button class="btn btn-primary" onclick="renderScanner()" style="margin-top:4px">🔄 Áp dụng bộ lọc</button>
    </div>

    <!-- Add Coin Manually -->
    <div class="card">
      <div class="card-title">➕ Thêm Coin Thủ Công</div>
      <div class="form-group">
        <label class="form-label">Symbol</label>
        <input class="form-input" id="addSym" placeholder="VD: TOKEN" />
      </div>
      <div class="form-group">
        <label class="form-label">Tên đầy đủ</label>
        <input class="form-input" id="addName" placeholder="VD: Token Protocol" />
      </div>
      <div class="grid-2 gap-8">
        <div class="form-group">
          <label class="form-label">Market Cap ($M)</label>
          <input class="form-input" id="addCap" type="number" placeholder="VD: 35" />
        </div>
        <div class="form-group">
          <label class="form-label">Pump gần đây (%)</label>
          <input class="form-input" id="addPump" type="number" placeholder="VD: 40" />
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Narrative</label>
        <div style="display:flex;flex-wrap:wrap;gap:5px" id="addNarrativeTags">
          ${NARRATIVES.map(n=>`<span class="badge badge-gray" style="cursor:pointer;padding:5px 10px" onclick="this.className='badge '+(this.className.includes('badge-cyan')?'badge-gray':'badge-cyan');this.dataset.sel=this.dataset.sel?'':'1'" data-n="${n}">${n}</span>`).join('')}
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Wyckoff Phase</label>
        <select class="form-select" id="addPhase">
          <option value="C">Phase C (Spring/Shakeout)</option>
          <option value="D">Phase D (LPS/SOS)</option>
          <option value="re">Re-accumulation</option>
          <option value="dist">Distribution – Tránh</option>
        </select>
      </div>
      <div class="grid-2 gap-8">
        <div class="form-group">
          <label class="form-label">Structure</label>
          <select class="form-select" id="addStructure">
            <option value="clear">✅ Rõ</option>
            <option value="unclear">❌ Không rõ</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Notes</label>
          <input class="form-input" id="addNotes" placeholder="Ghi chú ngắn" />
        </div>
      </div>
      <button class="btn btn-primary" onclick="addCoin()">➕ Thêm vào danh sách</button>
    </div>
  </div>

  ${scannerTop3Panel()}
  ${scannerAvoidPanel()}

  <!-- Coin List Header + Sort -->
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px">
    <div class="page-title" style="font-size:16px">Danh Sách Coin Learned (<span id="coinCount">0</span>)</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      <button class="btn btn-sm btn-outline" onclick="sortCoins('score')">⬇ Score</button>
      <button class="btn btn-sm btn-outline" onclick="sortCoins('cap')">⬇ Cap</button>
      <button class="btn btn-sm btn-outline" onclick="sortCoins('pump')">⬇ Pump 7d</button>
      <button class="btn btn-sm btn-outline" onclick="sortCoins('ath')">⬇ ATH% (xa nhất)</button>
      <button class="btn btn-sm btn-outline" onclick="sortCoins('relvol')">⬇ RelVol</button>
    </div>
  </div>
  <div class="grid-auto" id="coinGrid"></div>
  ${renderDebugPanel()}
  `;

  renderCoinGrid();
}

/* ── Filter & Render Coin Grid ───────────────────────────── */
function filteredCoins() {
  return ST.coins.filter(c => {
    const hasCap = Number.isFinite(c.cap) && c.cap > 0;
    if (hasCap) {
      const capM = c.cap / 1e6;
      if (capM < scanFilters.capMin || capM > scanFilters.capMax) return false;
    }
    const pump = c.pump7d !== undefined ? c.pump7d : c.pumpRecent;
    if (pump > scanFilters.pumpMax) return false;
    if (scanFilters.structure !== 'all' && c.structure !== scanFilters.structure) return false;
    if (scanFilters.narratives.length > 0 && !(c.narratives || []).some(n => scanFilters.narratives.includes(n))) return false;
    return true;
  });
}

let _sortMode = 'score';

function renderCoinGrid() {
  let coins = filteredCoins();
  coins = coins.sort((a, b) => {
    if (_sortMode === 'score') return (b.riskAdjustedScore || b.score || 0) - (a.riskAdjustedScore || a.score || 0);
    if (_sortMode === 'cap')   return b.cap - a.cap;
    if (_sortMode === 'pump')  return (b.pump7d !== undefined ? b.pump7d : b.pumpRecent) - (a.pump7d !== undefined ? a.pump7d : a.pumpRecent);
    if (_sortMode === 'ath')   return (a.athChange || 0) - (b.athChange || 0);
    if (_sortMode === 'relvol') return (b.relVol || 0) - (a.relVol || 0);
    return 0;
  });

  const grid = $('coinGrid');
  if (!grid) return;
  if ($('coinCount')) $('coinCount').textContent = coins.length;
  if (!coins.length) {
    grid.innerHTML = '<div class="text-muted text-sm" style="grid-column:1/-1;text-align:center;padding:40px">Không có coin nào khớp bộ lọc.</div>';
    return;
  }

  const phaseCls   = { C:'phase-C', D:'phase-D', re:'phase-re', dist:'phase-dist' };
  const phaseLabel = { C:'Phase C', D:'Phase D', re:'Re-acc', dist:'Distribution' };

  grid.innerHTML = coins.map(c => {
    const finalScore = Math.round(c.finalScore ?? c.score ?? 0);
    const rawScore = Math.round(c.rawScore ?? c.score ?? 0);
    const riskAdj = Math.round(c.riskAdjustedScore ?? c.score ?? 0);
    const quant = c.quantEdge || getSetupQuantProfile(c.setup || c.structureTag || 'Unknown');
    const maturityLabel = c.scoreBreakdown?.structure >= 8 ? 'mature' : c.scoreBreakdown?.structure >= 5 ? 'developing' : 'weak';
    const smLabel = c.vsaTag === 'absorption' ? 'present' : c.vsaTag === 'weak' ? 'weak' : 'neutral';
    const cgBadge = c.fromCG ? '<span class="badge badge-cyan" style="font-size:9px;padding:2px 6px">CG Live</span>' : '';
    const priceStr = c.price ? fmtPrice(c.price) : '';
    const p24 = c.priceChange24h || 0;
    const pump7 = c.pump7d !== undefined ? c.pump7d : c.pumpRecent;

    return `
    <div class="coin-card" onclick="openCoinDetail('${c.id}')">
      <div class="coin-header">
        <div>
          <div class="coin-symbol" style="display:flex;align-items:center;gap:5px">${c.symbol} ${cgBadge}</div>
          <div class="coin-cap">${c.name} · ${formatCap(c.cap)}</div>
        </div>
        <div style="text-align:right">
          <span class="badge ${c.status==='SCALP_READY' ? 'badge-purple' : c.status==='PLAYABLE' ? 'badge-cyan' : c.status==='PROBE' ? 'badge-yellow' : c.rejected ? 'badge-red' : 'badge-cyan'}">${c.status==='SCALP_READY' ? 'Scalp ready' : c.status==='PLAYABLE' ? 'Playable' : c.status==='PROBE' ? 'Probe' : (c.quantLabel || 'No edge')}</span>
          <div style="font-size:22px;font-weight:900;font-family:'JetBrains Mono',monospace;color:var(--accent);margin-top:2px">${riskAdj}</div>
          <div class="text-xs text-muted">raw ${rawScore} · edge ${Math.round(c.edgeScore || 0)}</div>
        </div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0 10px 0">
        <span class="badge ${c.fakePumpRisk==='low'?'badge-green':c.fakePumpRisk==='medium'?'badge-yellow':'badge-red'}">FakePump ${c.fakePumpRisk || 'n/a'}</span>
        <span class="badge ${smLabel==='present'?'badge-cyan':smLabel==='weak'?'badge-gray':'badge-yellow'}">SM ${smLabel}</span>
        <span class="badge ${maturityLabel==='mature'?'badge-green':maturityLabel==='developing'?'badge-yellow':'badge-gray'}">Maturity ${maturityLabel}</span>
        <span class="badge badge-gray">${c.setup || c.structureTag || 'No setup'}</span>
      </div>
      ${priceStr ? `<div style="display:flex;align-items:baseline;gap:8px;margin-bottom:8px"><span class="font-mono fw-700" style="font-size:14px">${priceStr}</span><span style="font-size:12px;font-weight:700;color:${p24>=0?'var(--green)':'var(--red)'}">${p24>=0?'+':''}${p24.toFixed(1)}% 24h</span></div>` : ''}
      <div class="coin-tags">
        <span class="phase-tag ${phaseCls[c.phase]||'phase-re'}">${phaseLabel[c.phase]||c.phase}</span>
        <span class="badge badge-gray">RelVol ${(c.relVol || 0).toFixed(1)}x</span>
        <span class="badge ${quant.band?.cls || 'badge-gray'}">Quant x${(quant.edgeMultiplier || 1).toFixed(2)}</span>
        <span class="badge badge-cyan">Conf ${Math.round((c.executionConfidence || 0) * 100)}%</span>
        <span class="badge badge-gray">${c.entryTiming || 'n/a'}</span>
        <span class="badge ${c.chartEntryQuality==='entry_good'?'badge-green':c.chartEntryQuality==='entry_late'?'badge-red':'badge-yellow'}">${c.chartEntryQuality || 'neutral'}</span>
      </div>
      <div class="coin-stats">
        <div class="coin-stat"><div class="coin-stat-label">Vol 24h</div><div class="coin-stat-val">${formatCap(c.volume24h)}</div></div>
        <div class="coin-stat"><div class="coin-stat-label">7d Pump</div><div class="coin-stat-val" style="color:${pump7>80?'var(--red)':pump7>30?'var(--yellow)':'var(--green)'}">${typeof pump7 === 'number' ? pump7.toFixed(1) : pump7}%</div></div>
        <div class="coin-stat"><div class="coin-stat-label">Risk / Alloc</div><div class="coin-stat-val">${(c.riskPct || 0.5).toFixed(2)}% / ${(c.allocationPct || 0.5).toFixed(2)}%</div></div>
        <div class="coin-stat"><div class="coin-stat-label">Timing / Conf</div><div class="coin-stat-val">${c.entryTiming || 'n/a'} / ${Math.round((c.executionConfidence || 0)*100)}%</div></div>
        <div class="coin-stat"><div class="coin-stat-label">Chart Entry</div><div class="coin-stat-val">${c.chartEntryQuality || 'neutral'} (${(c.chartStretchPct || 0).toFixed ? c.chartStretchPct.toFixed(1) : c.chartStretchPct}% )</div></div>
      </div>
      <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border)">
        ${scoreBreakdownRows(c.scoreBreakdown)}
      </div>
      <div class="text-xs text-muted" style="margin-top:8px">QUALITY LOCK v7.2.6 · Tier ${c.executionTier || c.status || 'n/a'} · Raw ${rawScore} / Final ${finalScore} / RiskAdj ${riskAdj} / Edge ${Math.round(c.edgeScore || 0)} · Exp ${(quant.expectancyR ?? 0)}R · PF ${(quant.profitFactor ?? 1)}</div>
      <div style="display:flex;gap:6px;margin-top:10px">
        <button class="btn btn-sm btn-outline" onclick="event.stopPropagation();openCoinDetail('${c.id}')">🎯 Score</button>
        <button class="btn btn-sm btn-outline" onclick="event.stopPropagation();openPlanFromId('${c.id}')">📋 Plan</button>
        <button class="btn btn-sm btn-danger" onclick="event.stopPropagation();deleteCoin('${c.id}')">🗑</button>
      </div>
    </div>`;
  }).join('');
}

/* ── Filter Controls ─────────────────────────────────────── */
function updateCapFilter(val) {
  scanFilters.capMax = parseInt(val);
  if ($('capLabel')) $('capLabel').textContent = `$${scanFilters.capMin}M – $${val}M`;
}
function updatePumpFilter(val) {
  scanFilters.pumpMax = parseInt(val);
  if ($('pumpLabel')) $('pumpLabel').textContent = val + '%';
}
function updateStructureFilter(v) {
  scanFilters.structure = v;
  renderScanner();
}
function toggleNarrative(n) {
  const idx = scanFilters.narratives.indexOf(n);
  if (idx >= 0) scanFilters.narratives.splice(idx, 1);
  else scanFilters.narratives.push(n);
  renderScanner();
}
function sortCoins(mode) {
  _sortMode = mode;
  renderCoinGrid();
}

/* ── Add Coin Manually ───────────────────────────────────── */
function addCoin() {
  const sym  = $('addSym').value.trim().toUpperCase();
  const name = $('addName').value.trim();
  const cap  = parseFloat($('addCap').value) * 1e6;
  const pump = parseFloat($('addPump').value) || 0;
  if (!sym || !cap) { alert('Nhập ít nhất Symbol và Market Cap.'); return; }
  const narratives = [...document.querySelectorAll('#addNarrativeTags [data-sel="1"]')].map(e => e.dataset.n);
  const coin = {
    id: Date.now().toString(), symbol: sym, name: name || sym,
    cap, volume24h: 0, pumpRecent: pump, pump7d: pump,
    volRatio: 0,
    structure: $('addStructure').value,
    narratives, phase: $('addPhase').value,
    setup: '', entry: 0, stop: 0, tp1: 0, tp2: 0, tp3: 0,
    score: 50, notes: $('addNotes').value.trim(), ema: '', fib: '',
    fromCG: false,
  };
  ST.coins.push(coin);
  ST.save();
  renderScanner();
}

/* ── Delete / Navigate ───────────────────────────────────── */
function deleteCoin(id) {
  if (!confirm('Xóa coin này?')) return;
  ST.coins = ST.coins.filter(c => String(c.id) !== String(id));
  ST.save();
  renderCoinGrid();
}

function openCoinDetail(id) {
  const coin = ST.coins.find(c => String(c.id) === String(id));
  if (coin) { scorerState.coinId = coin.id; navigate('scorer'); }
}

function openPlanFromId(id) {
  const coin = ST.coins.find(c => String(c.id) === String(id));
  if (coin) { planState.coinId = coin.id; navigate('plan'); }
}

function clearCGCoins() {
  if (!confirm('Xóa toàn bộ coin scanner hiện tại?')) return;
  ST.coins = ST.coins.filter(c => !c.fromCG && !c.fromHybrid && !c.isSample && c.source !== 'LIVE');
  ST.scanMeta.top3 = [];
  ST.scanMeta.lastScan = null;
  ST.scanMeta.source = '';
  ST.scanMeta.regime = {};
  ST.scanMeta.insight = {};
  window.__lastHybridResult = null;
  ST.save();
  scanFetchStatus = 'idle';
  scanLastFetch   = null;
  renderScanner();
}

/* ── REAL TRADER quant scan ─────────────────────────────────── */
async function runAISmartScanner() {
  if (hybridScanLock) return;
  if (window.NET_GUARD?.getCooldownLeftMs?.()) {
    alert(`Scanner đang cooldown ${window.NET_GUARD.formatLeft()}. Đợi hết cooldown rồi scan lại.`);
    return;
  }

  hybridScanLock = true;
  scanFetchStatus = 'loading';
  renderScanner();
  const prog = $('cgProgress');
  const bar  = $('cgProgressBar');
  const txt  = $('cgProgressText');
  if (prog) prog.style.display = 'block';

  try {
    const result = await LIVE_SCANNER.run((message, pct) => {
      if (txt) txt.textContent = message;
      if (bar) bar.style.width = pct + '%';
    }, {
      maxCandidates: 24,
      minQuoteVolume: 4_000_000,
      maxQuoteVolume: 90_000_000,
      minTrades: 5000,
      minPreScore: 5,
      maxAbs24hPump: 32
    });

    scanLastFetch = `${result.top3.length} top setup · ${new Date().toLocaleTimeString('vi-VN')}`;
    scanFetchStatus = 'done';
    if (window.PRO_EDGE?.rebuildAfterScan) {
      try { await window.PRO_EDGE.rebuildAfterScan(); } catch (e) { console.warn('[PRO_EDGE] rebuildAfterScan failed:', e); }
    }
    if (txt) txt.textContent = '✅ Live market scan hoàn tất';
    setTimeout(() => { if ($('cgProgress')) $('cgProgress').style.display = 'none'; }, 1800);
    renderScanner();
  } catch (err) {
    scanFetchStatus = 'error';
    if (txt) txt.textContent = '❌ ' + err.message;
    renderScanner();
    alert('Live market scan lỗi: ' + err.message);
  } finally {
    hybridScanLock = false;
  }
}


function resetHybridCache() {
  CACHE.resetEverything();
  ST.scanMeta.cache = {};
  ST.scanMeta.top3 = [];
  ST.scanMeta.lastScan = null;
  ST.scanMeta.source = '';
  ST.scanMeta.regime = {};
  ST.scanMeta.insight = {};
  window.__lastHybridResult = null;
  ST.save();
  alert('Đã reset cache Binance. Lần scan kế tiếp sẽ build live universe sạch lại.');
  renderScanner();
}


// ===== DEBUG PANEL + SOURCE TAG v4.7 =====

function renderDebugPanel() {
  const total = ST.coins.length;
  const bySource = {
    LIVE: ST.coins.filter(c => c.source === 'LIVE').length,
    CG: ST.coins.filter(c => c.source === 'CG').length,
    HYBRID: ST.coins.filter(c => c.source === 'HYBRID').length,
    MANUAL: ST.coins.filter(c => c.source === 'MANUAL').length,
  };

  const last = window.__lastHybridResult || {};
  const fetchFailRatio = Number(last.fetchFailRatio || 0);
  let warn = '';
  if (fetchFailRatio > 0.25) warn = ` · ❌ fetch failed ${last.fetchFailedSymbols?.length || 0}`;
  else if (fetchFailRatio > 0.10) warn = ` · ⚠ partial fetch ${last.fetchFailedSymbols?.length || 0}`;

  return `
  <div class="card mt-20">
    <div class="card-title">🛠 Debug Panel</div>
    <div>Total: ${total} | LIVE: ${bySource.LIVE} | CG: ${bySource.CG} | HYB: ${bySource.HYBRID} | MANUAL: ${bySource.MANUAL}</div>
    <div class="text-xs text-muted" style="margin-top:6px">
      Universe: ${last.liveUniverseCount || 0} · Candidates: ${last.candidateCount || 0} · Qualified: ${last.qualifiedCount || 0} · Rejected: ${last.rejectedCount || 0} · BTC: ${last.btcContext || ST.btc}${warn}
    </div>
  </div>`;
}

function fetchFromScanner(){ return runAISmartScanner(); }
