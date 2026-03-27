/* ── COIN SCORER PAGE ────────────────────────────────────── */
let scorerState = {
  coinId: null,
  scores: {
    spring: 0, test: 0, lps: 0,
    absorption: 0, relVol: 0,
    fib: 0, ema1: 0, ema2: 0,
    resistance: 0, btcCtx: 0,
    liquidity: 0
  }
};

const SCORER_CRITERIA = [
  { group:'A. Structure Quality – 30 pts', items:[
    { key:'spring',     max:10, label:'Spring rõ ràng', sub:'Quét thủng đáy · Rút râu · Close lại trong range' },
    { key:'test',       max:10, label:'Test Spring volume thấp', sub:'Giá về retest, không thủng, volume thấp hơn' },
    { key:'lps',        max:10, label:'LPS / Early Phase D', sub:'Last Point of Support xác nhận sau spring' },
  ]},
  { group:'B. Volume Quality – 20 pts', items:[
    { key:'absorption', max:10, label:'Absorption near support', sub:'Volume tăng ở support nhưng giá không giảm thêm' },
    { key:'relVol',     max:10, label:'Relative volume tốt (chưa fake pump)', sub:'Volume tăng 2x–10x · Không spike điên cuồng' },
  ]},
  { group:'C. Fib Confluence – 10 pts', items:[
    { key:'fib',        max:10, label:'Fib 0.5 / 0.618 + support', sub:'Fib trùng đáy range hoặc EMA hoặc demand zone' },
  ]},
  { group:'D. EMA Condition – 10 pts', items:[
    { key:'ema1',       max:5,  label:'Giá reclaim EMA20/EMA50', sub:'Giá đứng trên EMA20 hoặc EMA50' },
    { key:'ema2',       max:5,  label:'EMA20 chuẩn bị cắt EMA50', sub:'EMA20 bullish cross hoặc sắp cross' },
  ]},
  { group:'E. Overhead Resistance – 10 pts', items:[
    { key:'resistance', max:10, label:'Ít kháng cự phía trên', sub:'Không bị chặn ngay, có room để chạy' },
  ]},
  { group:'F. Market Context – 10 pts', items:[
    { key:'btcCtx',     max:10, label:'BTC sideway / bullish (alt-friendly)', sub:'BTC không breakdown · Market context tốt' },
  ]},
  { group:'G. Liquidity & Cleanliness – 10 pts', items:[
    { key:'liquidity',  max:10, label:'Range sạch, dễ đặt stop', sub:'Structure rõ · Stop loss hợp lý · Không xấu' },
  ]},
];

function renderScorer() {
  const coin = scorerState.coinId ? ST.coins.find(c => String(c.id) === String(scorerState.coinId)) : null;
  const total = Object.values(scorerState.scores).reduce((a,b)=>a+b,0);
  const g     = gradeInfo(total);

  $('page-scorer').innerHTML = `
  <div class="page-header">
    <div class="page-title">🎯 Coin Scorer</div>
    <div class="page-sub">Chấm điểm 100 điểm theo 7 nhóm tiêu chí</div>
  </div>

  <!-- Coin selector -->
  <div class="card mb-20">
    <div class="card-title">Chọn Coin để Chấm</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      ${ST.coins.map(c => `
        <button class="btn btn-sm ${scorerState.coinId===c.id?'btn-primary':'btn-outline'}"
          onclick="loadScorerCoin(${c.id})">${c.symbol}</button>
      `).join('')}
      <button class="btn btn-sm btn-outline" onclick="resetScorer()">🔄 Reset</button>
    </div>
    ${coin ? `<div style="margin-top:10px;padding:10px 12px;border-radius:8px;background:var(--bg-hover)" class="text-sm">
      <strong class="font-mono">${coin.symbol}</strong> · ${coin.name} · ${formatCap(coin.cap)} · 
      ${coin.narratives.map(n=>narrativeBadge(n)).join('')}
    </div>` : ''}
  </div>

  <div class="grid-2" style="align-items:start">
    <!-- Scoring Criteria -->
    <div>
      ${SCORER_CRITERIA.map(group => `
        <div class="card mb-16">
          <div class="card-title">${group.group}</div>
          ${group.items.map(item => `
            <div class="score-bar-wrap">
              <div class="score-bar-header">
                <div>
                  <div class="score-bar-label">${item.label}</div>
                  <div class="text-xs text-muted">${item.sub}</div>
                </div>
                <div class="score-bar-pts" id="pts_${item.key}">${scorerState.scores[item.key]}/${item.max}</div>
              </div>
              <input type="range" min="0" max="${item.max}" value="${scorerState.scores[item.key]}"
                style="width:100%;margin:6px 0"
                oninput="updateScore('${item.key}',this.value,${item.max})">
              <div class="score-bar-track">
                <div class="score-bar-fill" id="bar_${item.key}" style="width:${scorerState.scores[item.key]/item.max*100}%"></div>
              </div>
            </div>
          `).join('')}
        </div>
      `).join('')}
    </div>

    <!-- Score Total Panel -->
    <div style="position:sticky;top:20px">
      <div class="score-total mb-16">
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;letter-spacing:.5px">TỔNG ĐIỂM</div>
        <div class="score-number ${g.cls}" id="scoreTotal">${total}</div>
        <div style="font-size:11px;color:var(--text-muted);margin:4px 0">/ 100</div>
        <div class="score-grade ${g.cls}" id="scoreGrade">${g.grade}</div>
        <div class="score-desc" id="scoreDesc">${g.desc}</div>
      </div>

      <!-- Breakdown -->
      <div class="card mb-16">
        <div class="card-title">Phân Tích Điểm</div>
        ${[
          ['Structure',   scorerState.scores.spring + scorerState.scores.test + scorerState.scores.lps, 30],
          ['Volume',      scorerState.scores.absorption + scorerState.scores.relVol, 20],
          ['Fib',         scorerState.scores.fib, 10],
          ['EMA',         scorerState.scores.ema1 + scorerState.scores.ema2, 10],
          ['Resistance',  scorerState.scores.resistance, 10],
          ['BTC Context', scorerState.scores.btcCtx, 10],
          ['Liquidity',   scorerState.scores.liquidity, 10],
        ].map(([name, val, max]) => `
          <div style="margin-bottom:10px">
            <div style="display:flex;justify-content:space-between;margin-bottom:4px">
              <span class="text-sm">${name}</span>
              <span class="font-mono text-sm fw-700">${val}/${max}</span>
            </div>
            <div class="score-bar-track">
              <div class="score-bar-fill" style="width:${val/max*100}%"></div>
            </div>
          </div>
        `).join('')}
      </div>

      <!-- Actions -->
      <div style="display:flex;flex-direction:column;gap:8px">
        <button class="btn btn-primary" onclick="saveScorerResult()">💾 Lưu điểm vào coin</button>
        <button class="btn btn-outline" onclick="addToWatchlist()">👁 Thêm vào Watchlist</button>
        ${coin ? `<button class="btn btn-outline" onclick="loadPlanCoin(${coin.id});navigate('plan')">📋 Lập Trade Plan</button>` : ''}
      </div>

      <!-- Decision Box -->
      <div style="margin-top:16px;padding:16px;border-radius:${total>=85?'var(--radius-lg)':'var(--radius-lg)'};
        background:${total>=85?'rgba(16,185,129,.08)':total>=75?'rgba(0,229,255,.06)':total>=65?'rgba(245,158,11,.06)':'rgba(239,68,68,.06)'};
        border:1px solid ${total>=85?'rgba(16,185,129,.25)':total>=75?'rgba(0,229,255,.2)':total>=65?'rgba(245,158,11,.2)':'rgba(239,68,68,.2)'}" id="decisionBox">
        <div style="font-weight:800;margin-bottom:6px;color:${total>=85?'var(--green)':total>=75?'var(--accent)':total>=65?'var(--yellow)':'var(--red)'}">
          ${total>=85?'✅ A SETUP – Có thể vào lệnh':total>=75?'⚡ B+ SETUP – Tiềm năng tốt':total>=65?'📌 WATCHLIST – Chưa vào':'❌ SKIP – Bỏ qua coin này'}
        </div>
        <div class="text-sm text-muted">
          ${total>=85?'Spring/Test và volume xác nhận. BTC context OK. Lập trade plan và vào lệnh theo size quy định.':
            total>=75?'Cần thêm xác nhận. Đặt alert, chờ test hoặc LPS confirm trước khi vào.':
            total>=65?'Setup chưa đủ điều kiện. Theo dõi thêm 1–3 ngày.':'Chart xấu hoặc thiếu nhiều tiêu chí. Không phù hợp với hệ thống.'}
        </div>
      </div>
    </div>
  </div>
  `;
}

function updateScore(key, val, max) {
  scorerState.scores[key] = parseInt(val);
  // Update label
  $(`pts_${key}`).textContent = `${val}/${max}`;
  $(`bar_${key}`).style.width = (val/max*100) + '%';
  // Recompute total
  const total = Object.values(scorerState.scores).reduce((a,b)=>a+b,0);
  const g = gradeInfo(total);
  $('scoreTotal').textContent = total;
  $('scoreTotal').className = 'score-number ' + g.cls;
  $('scoreGrade').textContent = g.grade;
  $('scoreGrade').className   = 'score-grade ' + g.cls;
  $('scoreDesc').textContent  = g.desc;
  // Update breakdown - simpler repaint
  renderScorer();
}

function loadScorerCoin(id) {
  scorerState.coinId = id;
  const c = ST.coins.find(x=>String(x.id)===String(id));
  if (c && c.scorerData) scorerState.scores = {...c.scorerData};
  else if (c && c.scoreBreakdown) {
    const bd = c.scoreBreakdown || {};
    const setup = String(c.setup || '').toLowerCase();
    const fibTag = String(c.fib || '').toLowerCase();
    scorerState.scores = {
      spring: setup.includes('spring') ? Math.min(10, bd.structure || 0) : Math.min(6, bd.structure || 0),
      test: setup.includes('test') || setup.includes('phase c') ? Math.min(10, Math.max(0, (bd.volume || 0))) : 0,
      lps: setup.includes('lps') || setup.includes('phase d') ? Math.min(10, bd.structure || 0) : Math.min(4, bd.structure || 0),
      absorption: c.vsaTag === 'absorption' ? 10 : (c.vsaTag === 'neutral' ? 5 : 0),
      relVol: Math.min(10, Math.round((c.relVol || 0) * 4)),
      fib: fibTag.includes('0.5-0.618') ? 10 : fibTag.includes('above') || fibTag.includes('0.5') ? 6 : 2,
      ema1: Math.min(5, Math.round((bd.ema || 0) / 2)),
      ema2: Math.min(5, Math.max(0, (bd.ema || 0) - 5)),
      resistance: Math.min(10, Math.max(0, 10 - (bd.resistance || 0))),
      btcCtx: ST.btc === 'bull' ? 10 : ST.btc === 'sideway' ? 7 : 2,
      liquidity: Math.min(10, Math.round(((bd.volume || 0) + (bd.cleanliness || 0)) / 2)),
    };
  } else scorerState.scores = { spring:0,test:0,lps:0,absorption:0,relVol:0,fib:0,ema1:0,ema2:0,resistance:0,btcCtx:0,liquidity:0 };
  renderScorer();
}

function resetScorer() {
  scorerState = { coinId: null, scores: { spring:0,test:0,lps:0,absorption:0,relVol:0,fib:0,ema1:0,ema2:0,resistance:0,btcCtx:0,liquidity:0 } };
  renderScorer();
}

function saveScorerResult() {
  if (!scorerState.coinId) { alert('Chọn một coin trước'); return; }
  const total = Object.values(scorerState.scores).reduce((a,b)=>a+b,0);
  const c = ST.coins.find(x=>String(x.id)===String(scorerState.coinId));
  if (c) { c.score = total; c.scorerData = {...scorerState.scores}; }
  ST.save();
  renderScorer();
  alert(`✅ Đã lưu điểm ${total}/100 cho ${c.symbol}`);
}

function addToWatchlist() {
  if (!scorerState.coinId) { alert('Chọn coin trước'); return; }
  const c = ST.coins.find(x=>String(x.id)===String(scorerState.coinId));
  const total = Object.values(scorerState.scores).reduce((a,b)=>a+b,0);
  const tier = total >= 85 ? 'best' : total >= 65 ? 'watch' : 'avoid';
  // remove from all tiers first
  ['best','watch','avoid'].forEach(t => {
    ST.watchlist[t] = ST.watchlist[t].filter(w=>w.symbol!==c.symbol);
  });
  ST.watchlist[tier].push({ symbol: c.symbol, note: `Score ${total} – ${gradeInfo(total).grade}`, addedAt: Date.now() });
  ST.save();
  alert(`Đã thêm ${c.symbol} vào tier "${tier}" trong Watchlist`);
}
