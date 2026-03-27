/* ── PRE-BUY CHECKLIST PAGE ──────────────────────────────── */
let checkState = new Array(10).fill(false);
let fakeCheck  = new Array(6).fill(false);
let checklistCoinId = null;

function autoChecklistFromCoin(coin) {
  if (!coin) return;
  const rr = (() => {
    const e = Number(coin.entry || coin.price || 0);
    const s = Number(coin.stop || 0);
    const t = Number(coin.tp1 || 0);
    if (!e || !s || !t || e === s) return 0;
    return Math.abs((t - e) / (e - s));
  })();
  checkState = [
    Number(coin.volume24h || 0) >= 5_000_000,
    Number(coin.pumpRecent || 0) < 100,
    /phase|spring|lps|re-acc/i.test(String(coin.setup || coin.structureTag || '')),
    /phase c|phase d|spring|lps/i.test(String(coin.setup || '')),
    String(coin.vsaTag || '') === 'absorption' || Number(coin.scoreBreakdown?.volume || 0) >= 6,
    String(coin.fib || '').includes('0.5') || String(coin.fib || '').includes('0.618'),
    Number(coin.scoreBreakdown?.ema || 0) >= 7,
    Number(coin.scoreBreakdown?.resistance || 0) <= 3,
    ST.btc !== 'bear',
    rr >= 2
  ];
  fakeCheck = [
    String(coin.fakePumpRisk || '') === 'high',
    Number(coin.scoreBreakdown?.entry || 0) < 2,
    Number(coin.pumpRecent || 0) > 15 && String(coin.vsaTag || '') === 'weak',
    !/phase|spring|lps|re-acc/i.test(String(coin.setup || coin.structureTag || '')),
    Number(coin.scoreBreakdown?.cleanliness || 0) <= 3,
    String(coin.fakePumpRisk || '') !== 'low'
  ];
}

function renderChecklist() {
  const checked = checkState.filter(Boolean).length;
  const pct = Math.round(checked/10*100);
  const ok  = checked >= 7;

  const coin = checklistCoinId ? ST.coins.find(c => String(c.id) === String(checklistCoinId)) : null;

  $('page-checklist').innerHTML = `
  <div class="page-header">
    <div class="page-title">✅ Pre-Buy Checklist</div>
    <div class="page-sub">Phải đạt ít nhất 7/10 trước khi bấm nút mua</div>
  </div>

  <div class="card mb-16">
    <div class="card-title">Chọn coin để auto-check</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      ${getTopSetups(6).map(c => `<button class="btn btn-sm ${String(checklistCoinId)===String(c.id)?'btn-primary':'btn-outline'}" onclick="loadChecklistCoin('${c.id}')">${c.symbol}</button>`).join('')}
      ${coin ? `<span class="text-sm text-muted" style="align-self:center">${coin.symbol} · ${coin.setup || coin.structureTag || 'No setup'}</span>` : ''}
    </div>
  </div>

  <div class="grid-2" style="align-items:start">
    <!-- Checklist -->
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
          <div class="checklist-item ${checkState[i]?'checked':''}" onclick="toggleCheck(${i})">
            <div class="ci-num">${i+1}</div>
            <div class="ci-text">
              <div class="ci-main">${main}</div>
              <div class="ci-sub">${sub}</div>
            </div>
            <div class="ci-box">${checkState[i]?'✓':''}</div>
          </div>
        `).join('')}
        <button class="btn btn-outline btn-sm" style="margin-top:8px" onclick="resetChecklist()">🔄 Reset</button>
      </div>
    </div>

    <!-- Score & Fake Pump Signs -->
    <div>
      <!-- Score Display -->
      <div class="card mb-16" style="text-align:center">
        <div class="card-title">Kết Quả</div>
        <div style="font-size:64px;font-weight:900;font-family:'JetBrains Mono',monospace;color:${ok?'var(--green)':'var(--red)'}">${checked}/10</div>
        <div style="margin:8px 0">
          <div class="score-bar-track" style="height:10px">
            <div class="score-bar-fill" style="width:${pct}%;background:${ok?'var(--green)':'var(--red)'}"></div>
          </div>
        </div>
        <div style="font-size:16px;font-weight:800;color:${ok?'var(--green)':'var(--red)'};margin-top:10px">
          ${ok ? '✅ ĐỦ ĐIỀU KIỆN – Có thể xem xét vào lệnh' : `⛔ CHƯA ĐỦ – Cần thêm ${7-checked} tiêu chí nữa`}
        </div>
        <div class="text-sm text-muted" style="margin-top:4px">
          ${ok ? 'Nhớ kiểm tra RR và position size trước khi bấm mua' : 'Không được vào lệnh khi chưa đạt tối thiểu 7/10'}
        </div>
      </div>

      <!-- Fake Pump Warning -->
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
          <div class="checklist-item danger ${fakeCheck[i]?'checked':''}" onclick="toggleFake(${i})">
            <div class="ci-num" style="color:var(--red)">!</div>
            <div class="ci-text">
              <div class="ci-main">${main}</div>
              <div class="ci-sub">${sub}</div>
            </div>
            <div class="ci-box" style="border-color:rgba(239,68,68,.4)">${fakeCheck[i]?'✓':''}</div>
          </div>
        `).join('')}
        ${fakeCheck.some(Boolean) ? `<div style="margin-top:10px;padding:10px;border-radius:8px;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);color:var(--red);font-size:12px;font-weight:600">⚠️ Cảnh báo! Phát hiện ${fakeCheck.filter(Boolean).length} dấu hiệu fake pump. KHÔNG VÀO LỆNH.</div>` : ''}
      </div>

      <!-- Smart Money Signs -->
      <div class="card">
        <div class="card-title" style="color:var(--green)">💎 Dấu Hiệu Smart Money Accumulation</div>
        ${[
          'Nhiều lần quét đáy nhưng không thủng sâu',
          'Khối lượng tăng ở support, giá giữ vững',
          'Giá không giảm thêm dù volume lớn',
          'Test lại đáy bằng volume thấp',
          'Giá giữ được EMA20/EMA50 sau spring',
          'Compression biên độ càng lúc càng chặt',
        ].map(s=>`
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
  checkState[i] = !checkState[i];
  renderChecklist();
}
function toggleFake(i) {
  fakeCheck[i] = !fakeCheck[i];
  renderChecklist();
}
function resetChecklist() {
  checkState = new Array(10).fill(false);
  fakeCheck  = new Array(6).fill(false);
  renderChecklist();
}

function loadChecklistCoin(id) {
  checklistCoinId = id;
  autoChecklistFromCoin(ST.coins.find(c => String(c.id) === String(id)));
  renderChecklist();
}
