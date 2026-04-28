/* ── PRE-BUY CHECKLIST PAGE v10.6.9.10 SMART AUTO-AUDIT ───────────────── */
// FIXED v10.6.9.10: Persistent Symbol-Aware Checklist State
let CHECKLIST_RECORDS = {}; // { SYMBOL: { checks: [], fakes: [], overrides: {} } }
let autoCheckedSet = new Set(); // Tracks indices of items auto-validated by the engine
let checklistCoinId = null;

function getChecklistCandidates() {
  return Array.isArray(ST?.coins) ? ST.coins.filter(Boolean) : [];
}

function getChecklistTopSetups() {
  try {
    const top = typeof getTopSetups === 'function' ? getTopSetups(6) : [];
    return Array.isArray(top) ? top.filter(Boolean) : [];
  } catch (e) {
    return [];
  }
}

function findChecklistCoinById(id) {
  if (!id) return null;
  return getChecklistCandidates().find(c => String(c.id) === String(id)) || null;
}

function findChecklistCoinBySymbol(symbol) {
  if (!symbol) return null;
  return getChecklistCandidates().find(
    c => String(c.symbol || '').toUpperCase() === String(symbol).toUpperCase()
  ) || null;
}

function isActionableChecklistCoin(c) {
  if (!c) return false;
  const mode = String(c.executionTier || c.status || '').toUpperCase();
  return ['READY', 'SCALP_READY', 'PLAYABLE', 'PROBE', 'PROBE_PENDING', 'EARLY'].includes(mode);
}

function isWatchableChecklistCoin(c) {
  if (!c) return false;
  const mode = String(c.executionTier || c.status || '').toUpperCase();
  const signalType = String(c.signalType || '').toLowerCase();
  return ['WATCH', 'EARLY'].includes(mode) || signalType === 'watch';
}

function resolveChecklistCoin() {
  let coin = findChecklistCoinById(checklistCoinId);
  if (coin) return coin;

  const top = getChecklistTopSetups();
  if (top.length) return top[0];

  const suggestedSymbol =
    ST?.scanMeta?.proEdge?.suggestedSymbol ||
    ST?.proEdgeSnapshot?.suggestedSymbol ||
    ST?.suggestedSymbol ||
    null;

  coin = findChecklistCoinBySymbol(suggestedSymbol);
  if (coin) return coin;

  coin = getChecklistCandidates().find(isActionableChecklistCoin);
  if (coin) return coin;

  coin = getChecklistCandidates().find(isWatchableChecklistCoin);
  if (coin) return coin;

  return getChecklistCandidates()[0] || null;
}

function ensureChecklistCoinSelected() {
  const coin = resolveChecklistCoin();
  checklistCoinId = coin ? coin.id : null;
  return coin;
}

function autoChecklistFromCoin(coin) {
  if (!coin) return;
  const sym = (coin.symbol || '').toUpperCase();
  if (!CHECKLIST_RECORDS[sym]) {
    CHECKLIST_RECORDS[sym] = {
      checks: new Array(10).fill(false),
      fakes: new Array(6).fill(false),
      overrides: {} // { index: true/false }
    };
  }
  const record = CHECKLIST_RECORDS[sym];

  const rr = (() => {
    const e = Number(coin.entry || coin.price || 0);
    const s = Number(coin.stop || 0);
    const t = Number(coin.tp1 || 0);
    if (!e || !s || !t || e === s) return 0;
    return Math.abs((t - e) / (e - s));
  })();

  const mode = String(coin.executionTier || coin.status || '').toUpperCase();
  const probeLike =
    ['PROBE', 'PLAYABLE', 'SCALP_READY'].includes(mode) ||
    String(coin.positionStage || '').toLowerCase() === 'probe' ||
    String(coin.signalType || '').toLowerCase() === 'probe';

  const activeLike = ['PLAYABLE', 'SCALP_READY', 'READY'].includes(mode);

  // ⚡ SMART AUTO-VALIDATION (v10.6.9)
  const strategic = window.ST?.strategic;
  const isAltSeasonPotential = strategic?.dominance?.value < 52;
  const isMarketFear = strategic?.fng?.value < 35;
  const isRainbowSafety = strategic?.riskMultiplier >= 0.85;

  autoCheckedSet.clear();

  record.checks = [
    // 1. Liquidity (Smart Threshold)
    Number(coin.volume24h || 0) >= (isAltSeasonPotential ? 3_500_000 : 5_000_000),
    
    // 2. Pump Check
    Number(coin.pumpRecent || 0) < 100,
    
    // 3. Accumulation Structure
    /phase|spring|lps|re-acc/i.test(String(coin.setup || coin.structureTag || '')) || probeLike,
    
    // 4. wyckoff phase
    /phase c|phase d|spring|lps/i.test(String(coin.setup || coin.structureTag || '')) || probeLike,
    
    // 5. Volume Absorption (Sentiment Aware)
    (() => {
      const volScore = Number(coin.scoreBreakdown?.volume || 0);
      return String(coin.vsaTag || '') === 'absorption' || volScore >= (isMarketFear ? 4 : 6);
    })(),

    // 6. Fib
    String(coin.fib || '').includes('0.5') || String(coin.fib || '').includes('0.618') || String(coin.fib || '').includes('above-0.5'),
    
    // 7. EMA Trend
    Number(coin.scoreBreakdown?.ema || 0) >= (probeLike ? 5 : 7),
    
    // 8. Resistance/Headroom
    Number(coin.scoreBreakdown?.resistance || 0) <= (probeLike ? 5 : 3),
    
    // 9. BTC Strategic Guard (RAINBOW + SENTIMENT)
    isRainbowSafety && strategic?.fng?.label !== '極度貪婪' && String(strategic?.verdict || '').indexOf('CRITICAL') === -1,
    
    // 10. RR Alignment
    rr >= (probeLike ? 0.9 : activeLike ? 1.1 : 2)
  ];

  // Mark all true results as auto-validated
  record.checks.forEach((val, i) => { if (val) autoCheckedSet.add(i); });

  const fakeRisk = String(coin.fakePumpRisk || '').toLowerCase();
  const entryQuality = String(coin.chartEntryQuality || '').toLowerCase();
  const conf = Number(coin.executionConfidence || 0);
  const stretchPct = Math.abs(Number(coin.chartStretchPct || 0));

  record.fakes = [
    fakeRisk === 'high',
    (entryQuality === 'structure_risk' || entryQuality === 'entry_late') && conf < 0.52,
    Number(coin.pumpRecent || 0) > 25 && String(coin.vsaTag || '') === 'weak' && conf < 0.60,
    !/phase|spring|lps|re-acc/i.test(String(coin.setup || coin.structureTag || '')) && Number(coin.score || 0) < 16 && !probeLike,
    (coin.scoreBreakdown?.cleanliness !== undefined ? Number(coin.scoreBreakdown.cleanliness) <= 2 : false) || stretchPct > 32,
    fakeRisk === 'medium' && conf < 0.50
  ];
}

function renderChecklistEmptyState(message = 'Chưa có coin đủ điều kiện để auto-check') {
  $('page-checklist').innerHTML = `
    <div class="page-header">
      <div class="page-title">✅ Pre-Buy Checklist</div>
      <div class="page-sub">Checklist adapt theo mode: PROBE/PLAYABLE cần 5/10 · SCALP_READY cần 6/10 · CONFIRM cần 7/10</div>
    </div>

    <div class="card">
      <div class="card-title">Checklist</div>
      <div class="text-sm text-muted">${message}</div>
      <div class="text-sm text-muted" style="margin-top:8px">
        Hãy scan lại hoặc chọn coin khác từ Crypto Scanner.
      </div>
    </div>
  `;
}

function renderChecklist() {
  const coin = ensureChecklistCoinSelected();
  if (!coin) {
    renderChecklistEmptyState();
    return;
  }

  const sym = (coin.symbol || '').toUpperCase();
  const record = CHECKLIST_RECORDS[sym] || { checks: new Array(10).fill(false), fakes: new Array(6).fill(false), overrides: {} };
  
  // Aggregate state: record value + user override
  const currentChecks = record.checks.map((val, i) => record.overrides[i] !== undefined ? record.overrides[i] : val);
  const currentFakes = record.fakes.map((val, i) => record.overrides[`f${i}`] !== undefined ? record.overrides[`f${i}`] : val);

  const checkedCount = currentChecks.filter(Boolean).length;
  const pct = Math.round((checkedCount / 10) * 100);
  const mode = String(coin.executionTier || coin.status || '').toUpperCase();
  const passNeed = (mode === 'PROBE' || mode === 'PLAYABLE') ? 5 : (mode === 'SCALP_READY') ? 6 : 7;

  const ok = checkedCount >= passNeed;
  const topCoins = getChecklistTopSetups();

  $('page-checklist').innerHTML = `
  <div class="page-header">
    <div class="page-title">✅ Pre-Buy Checklist</div>
    <div class="page-sub">Checklist adapt theo mode: ${mode} cần ${passNeed}/10 · Symbol: ${sym}</div>
  </div>

  <div class="smart-audit-banner mb-16">
    <div class="sab-icon">⚡</div>
    <div class="sab-content">
      <div class="sab-title">Alpha Guard Smart Audit Active</div>
      <div class="sab-desc">Hệ thống đang tự động xác thực các tiêu chí kỹ thuật dựa trên dữ liệu Scanner & Strategic Hub.</div>
    </div>
  </div>

  <div class="card mb-16">
    <div class="card-title">Chọn coin để auto-check</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      ${topCoins.map(c => `
        <button class="btn btn-sm ${String(checklistCoinId) === String(c.id) ? 'btn-primary' : 'btn-outline'}" onclick="loadChecklistCoin('${c.id}')">
          ${c.symbol}
        </button>
      `).join('')}
      <span class="text-sm text-muted" style="align-self:center">
        ${coin.symbol} · ${coin.setup || coin.structureTag || 'No setup'}
      </span>
    </div>
  </div>

  <div class="grid-2" style="align-items:start">
    <div>
      <div class="card mb-16">
        <div class="card-title">10 Tiêu Chí Trước Khi Vào Lệnh</div>
        ${[
          ['Coin có thanh khoản phù hợp', 'Smart liquidity / mid-cap đủ thanh khoản, không quá dead book'],
          ['Chưa pump >100%', 'Nếu đã pump >100% phải có re-accumulation rõ'],
          ['Có accumulation / re-accumulation', 'Range tích lũy rõ ràng, không random spike'],
          ['Có Spring hoặc LPS xác nhận', 'Ít nhất 1 dấu hiệu Phase C/D rõ ràng'],
          ['Volume là absorption, không phải distribution', 'Volume tăng ở support, giá không giảm thêm'],
          ['Có Fib đẹp 0.5 / 0.618', 'Fib trùng support / EMA / demand zone'],
          ['EMA20/50 đang tốt dần lên', 'Reclaim hoặc cross sắp xảy ra'],
          ['Kháng cự trên đầu không quá dày', 'Có room để chạy trước khi gặp resistance lớn'],
          ['BTC không breakdown', 'BTC sideway hoặc bullish – alt-friendly'],
          ['RR ít nhất 1:2', 'Entry/Stop/TP đã tính, RR ≥ 2.0'],
        ].map(([main, sub], i) => `
          <div class="checklist-item ${currentChecks[i] ? 'checked' : ''} ${autoCheckedSet.has(i) ? 'smart-auto' : ''}" onclick="toggleCheck(${i})">
            <div class="ci-num">${i + 1}</div>
            <div class="ci-text">
              <div class="ci-main">${main} ${autoCheckedSet.has(i) ? '<span class="smart-tag">⚡ AUTO</span>' : ''}</div>
              <div class="ci-sub">${sub}</div>
            </div>
            <div class="ci-box">${currentChecks[i] ? '✓' : ''}</div>
          </div>
        `).join('')}
        <button class="btn btn-outline btn-sm" style="margin-top:8px" onclick="resetChecklist()">🔄 Reset Coin State</button>
      </div>

      <div class="card mb-16">
        <div class="card-title">🔬 Alpha Guard Diagnostic Evidence</div>
        <div class="diagnostic-evidence" style="display:grid; grid-template-columns:1fr 1fr; gap:8px">
          <div class="dev-item" style="padding:10px; border-radius:8px; background:rgba(0,0,0,0.2)">
            <div class="dev-label" style="font-size:10px; color:var(--text-muted)">VSA ABSORPTION</div>
            <div class="dev-val fw-700" style="color:var(--green)">${coin.vsaTag === 'absorption' ? 'DETECTED' : 'NOT CLEAR'}</div>
          </div>
          <div class="dev-item" style="padding:10px; border-radius:8px; background:rgba(0,0,0,0.2)">
            <div class="dev-label" style="font-size:10px; color:var(--text-muted)">EMA SCORE</div>
            <div class="dev-val fw-700" style="color:var(--accent)">${coin.scoreBreakdown?.ema || 0}/10</div>
          </div>
          <div class="dev-item" style="padding:10px; border-radius:8px; background:rgba(0,0,0,0.2)">
            <div class="dev-label" style="font-size:10px; color:var(--text-muted)">LIQUIDITY</div>
            <div class="dev-val fw-700" style="color:var(--text-primary)">$${((coin.volume24h || 0)/1_000_000).toFixed(1)}M</div>
          </div>
          <div class="dev-item" style="padding:10px; border-radius:8px; background:rgba(0,0,0,0.2)">
            <div class="dev-label" style="font-size:10px; color:var(--text-muted)">RR RATIO</div>
            <div class="dev-val fw-700" style="color:var(--yellow)">${Number(coin.rr || 0).toFixed(1)}x</div>
          </div>
        </div>
      </div>
    </div>

    <div>
      <div class="card mb-16" style="text-align:center">
        <div class="card-title">Kết Quả</div>
        <div style="font-size:64px;font-weight:900;font-family:'JetBrains Mono',monospace;color:${ok ? 'var(--green)' : 'var(--red)'}">${checkedCount}/10</div>
        <div style="margin:8px 0">
          <div class="score-bar-track" style="height:10px">
            <div class="score-bar-fill" style="width:${pct}%;background:${ok ? 'var(--green)' : 'var(--red)'}"></div>
          </div>
        </div>
        <div style="font-size:16px;font-weight:800;color:${ok ? 'var(--green)' : 'var(--red)'};margin-top:10px">
          ${ok
            ? '✅ ALPHA GUARD APPROVED'
            : `⛔ PENDING – Cần thêm ${Math.max(0, passNeed - checkedCount)} tiêu chí nữa`}
        </div>
        <div class="text-sm text-muted" style="margin-top:4px">
          ${ok
            ? `Vượt ngưỡng ${passNeed}/10 – Sẵn sàng cho capital deployment.`
            : `Chưa đạt ngưỡng tối thiểu ${passNeed}/10 cho mode hiện tại.`}
        </div>
      </div>

      <div class="card mb-16">
        <div class="card-title" style="color:var(--red)">🚨 Dấu Hiệu Fake Pump – Né Ngay</div>
        ${[
          ['1 cây volume cực lớn spike thẳng đứng', 'Smart money xả, không phải accumulation'],
          ['Nến breakout đóng yếu (close gần low)', 'Fake breakout – selling pressure cao'],
          ['Giá bị xả mạnh ngay sau breakout', 'Distribution đang diễn ra'],
          ['Không có nền tích lũy trước đó', 'Pump tự phát, không có Wyckoff structure'],
          ['Spread quá rộng, wick hỗn loạn', 'Mất kiểm soát – high risk'],
          ['Tin tức thổi mạnh nhưng chart xấu', 'News pump thường không bền'],
        ].map(([main, sub], i) => `
          <div class="checklist-item danger ${currentFakes[i] ? 'checked' : ''}" onclick="toggleFake(${i})">
            <div class="ci-num" style="color:var(--red)">!</div>
            <div class="ci-text">
              <div class="ci-main">${main}</div>
              <div class="ci-sub">${sub}</div>
            </div>
            <div class="ci-box" style="border-color:rgba(239,68,68,.4)">${currentFakes[i] ? '✓' : ''}</div>
          </div>
        `).join('')}

        ${currentFakes.some(Boolean) ? `
          <div style="margin-top:10px;padding:10px;border-radius:8px;background:${currentFakes[0] ? 'rgba(239,68,68,.1)' : 'rgba(245,158,11,.10)'};border:1px solid ${currentFakes[0] ? 'rgba(239,68,68,.3)' : 'rgba(245,158,11,.35)'};color:${currentFakes[0] ? 'var(--red)' : 'var(--yellow)'};font-size:12px;font-weight:600">
            ${currentFakes[0]
              ? `⚠️ Cảnh báo mạnh! Phát hiện ${currentFakes.filter(Boolean).length} dấu hiệu fake pump. KHÔNG VÀO LỆNH.`
              : `⚠️ Có ${currentFakes.filter(Boolean).length} dấu hiệu cảnh báo mềm. Cân nhắc size cực nhỏ.`}
          </div>
        ` : ''}
      </div>

      <div class="card">
        <div class="card-title" style="color:var(--green)">💎 Dấu Hiệu Smart Money Accumulation</div>
        ${[
          'Nhiều lần quét đáy nhưng không thủng sâu',
          'Khối lượng tăng ở support, giá giữ vững',
          'Giá không giảm thêm dù volume lớn',
          'Test lại đáy bằng volume thấp',
          'Giá giữ được EMA20/EMA50 sau spring',
          'Compression biên độ càng lúc càng chặt',
        ].map(s => `
          <div style="display:flex;gap:8px;padding:8px;font-size:12px;border-bottom:1px solid var(--border);align-items:center">
            <span style="color:var(--green)">✓</span>${s}
          </div>
        `).join('')}
      </div>
    </div>
  </div>
  `;
}

function toggleCheck(i) {
  const coin = ensureChecklistCoinSelected();
  if (!coin) return;
  const sym = (coin.symbol || '').toUpperCase();
  const record = CHECKLIST_RECORDS[sym];
  if (!record) return;

  // Toggle override
  const currentVal = record.overrides[i] !== undefined ? record.overrides[i] : record.checks[i];
  record.overrides[i] = !currentVal;
  
  renderChecklist();
}

function toggleFake(i) {
  const coin = ensureChecklistCoinSelected();
  if (!coin) return;
  const sym = (coin.symbol || '').toUpperCase();
  const record = CHECKLIST_RECORDS[sym];
  if (!record) return;

  const key = `f${i}`;
  const currentVal = record.overrides[key] !== undefined ? record.overrides[key] : record.fakes[i];
  record.overrides[key] = !currentVal;
  
  renderChecklist();
}

function resetChecklist() {
  const coin = ensureChecklistCoinSelected();
  if (!coin) return;
  const sym = (coin.symbol || '').toUpperCase();
  delete CHECKLIST_RECORDS[sym];
  autoChecklistFromCoin(coin);
  renderChecklist();
}

function loadChecklistCoin(id) {
  checklistCoinId = id;
  const coin = findChecklistCoinById(id);
  if (coin) autoChecklistFromCoin(coin);
  renderChecklist();
}

function initChecklistPage() {
  const coin = ensureChecklistCoinSelected();
  if (coin) autoChecklistFromCoin(coin);
  renderChecklist();
}
