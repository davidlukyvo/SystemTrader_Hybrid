/* ── ENTRY MODELS PAGE ───────────────────────────────────── */
let activeModel = 'spring';

function renderModels() {
  $('page-models').innerHTML = `
  <div class="page-header">
    <div class="page-title">📐 Entry Models</div>
    <div class="page-sub">3 mẫu vào lệnh chuẩn theo hệ thống Wyckoff/VSA</div>
  </div>

  <div class="model-tab-row">
    <div class="model-tab ${activeModel==='spring'?'active':''}" onclick="switchModel('spring')">Model 1: Spring Entry</div>
    <div class="model-tab ${activeModel==='lps'?'active':''}"    onclick="switchModel('lps')">Model 2: Test / LPS</div>
    <div class="model-tab ${activeModel==='retest'?'active':''}" onclick="switchModel('retest')">Model 3: Breakout Retest</div>
  </div>

  <div id="modelContent"></div>
  `;
  renderModelContent();
}

function switchModel(m) {
  activeModel = m;
  document.querySelectorAll('.model-tab').forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');
  renderModelContent();
}

function renderModelContent() {
  const models = {
    spring: {
      title: 'Model 1: Spring Entry',
      label: '⭐ Đẹp nhất',
      color: 'var(--accent)',
      phase: 'Phase C',
      when: 'Khi thấy Phase C đẹp – Shakeout quét thanh khoản phía dưới rồi reclaim ngay',
      conditions: [
        ['Quét thủng đáy range', 'Giá đâm thủng support, flush liquidity'],
        ['Rút râu mạnh', 'Wick dài phía dưới – rejection rõ ràng'],
        ['Close quay lại trong range', 'Nến đóng cửa trên support – reclaim'],
        ['Volume tăng rõ', 'Volume spike xác nhận hấp thụ'],
        ['Nến test volume thấp hơn', '1–3 nến sau đó retest với volume thấp – confirm'],
      ],
      entry: 'Entry tại vùng reclaim sau spring (trên support breakout điểm)',
      stop: 'Stop dưới đáy cây nến spring (đáy thấp nhất của wick)',
      tps: ['TP1: Range high / kháng cự gần nhất', 'TP2: Range extension (measured move)', 'TP3: Breakout zone / fib extension'],
      note: 'Đây là entry đẹp nhất trong toàn bộ hệ thống. RR thường 1:3 – 1:7+. Stop rất gọn.',
      avoid: 'Không vào nếu close dưới support, wick không rõ, hoặc volume quá yếu',
      svg: buildSpringDiagram(),
    },
    lps: {
      title: 'Model 2: Test / LPS Entry',
      label: '✅ An toàn hơn',
      color: 'var(--green)',
      phase: 'Late Phase C / Early D',
      when: 'Khi spring đã xảy ra và giá đang build lại nền phía trên',
      conditions: [
        ['Giá quay về retest vùng demand', 'Pullback về đáy spring zone (LPS)'],
        ['Volume thấp khi pullback', 'Volume giảm khi giá về – không có selling pressure'],
        ['Không thủng đáy spring', 'Hold above spring low – cấu trúc intact'],
        ['Build trên EMA20 hoặc EMA50', 'Giá giữ được momentum EMA'],
        ['Có SOS xuất hiện trước', 'Đã có ít nhất 1 sign of strength trước đó'],
      ],
      entry: 'Entry tại vùng LPS – pullback về demand sau khi spring đã confirm',
      stop: 'Stop dưới LPS low hoặc dưới spring low (tùy structure)',
      tps: ['TP1: SOS zone / range high', 'TP2: Breakout measured move', 'TP3: Fib extension'],
      note: 'An toàn hơn Spring entry vì spring đã được confirm. Nhưng RR nhỏ hơn một chút.',
      avoid: 'Nếu LPS thủng đáy spring → Invalid. Nếu volume tăng khi pullback → Cảnh báo distribution',
      svg: buildLPSDiagram(),
    },
    retest: {
      title: 'Model 3: Breakout Retest Entry',
      label: '🔒 Ít fake nhất',
      color: 'var(--yellow)',
      phase: 'Phase D',
      when: 'Khi Phase D bắt đầu – breakout range high với volume thật',
      conditions: [
        ['Break range high rõ ràng', 'Nến đóng trên kháng cự cũ – breakout thật'],
        ['Volume thật khi breakout', 'Volume tăng mạnh, không fake'],
        ['Retest lại breakout zone', 'Giá quay về test lại vùng breakout (cũ là resistance, nay là support)'],
        ['Retest không thủng zone', 'Hold trên breakout zone – flip support thành công'],
        ['Volume retest thấp hơn', 'Volume giảm khi retest – không có selling'],
      ],
      entry: 'Entry tại vùng retest breakout zone',
      stop: 'Stop dưới breakout zone (dưới previous resistance)',
      tps: ['TP1: Kháng cự tiếp theo phía trên', 'TP2: Measured move từ base', 'TP3: Fib extension 1.618'],
      note: 'Ít rủi ro fake breakout hơn so với đu trực tiếp. Entry sau khi flip support đã xác nhận.',
      avoid: 'Nếu retest thủng breakout zone → Invalid. Không vào khi breakout bar đóng yếu ngay từ đầu',
      svg: buildBreakoutDiagram(),
    }
  };

  const m = models[activeModel];
  $('modelContent').innerHTML = `
  <div class="grid-2" style="align-items:start">
    <!-- Left: Details -->
    <div>
      <div class="card mb-16">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
          <span class="badge" style="background:rgba(var(--accent-rgb),.1);color:${m.color};border:1px solid ${m.color}33;font-size:11px">${m.label}</span>
          <span class="badge badge-gray">${m.phase}</span>
        </div>
        <div class="card-title">DÙNG KHI NÀO</div>
        <div style="padding:12px;border-radius:8px;background:var(--bg-hover);font-size:13px;margin-bottom:16px">${m.when}</div>

        <div class="card-title">ĐIỀU KIỆN CẦN ĐỦ</div>
        ${m.conditions.map(([ label, sub ], i) => `
          <div class="toggle-row checked" style="cursor:default;margin-bottom:6px">
            <div>
              <div class="toggle-label">${i+1}. ${label}</div>
              <div class="toggle-sub">${sub}</div>
            </div>
            <div class="toggle-box">✓</div>
          </div>
        `).join('')}
      </div>

      <div class="card mb-16">
        <div class="card-title">🎯 ENTRY / STOP / TP</div>
        <div style="display:grid;gap:8px">
          <div style="padding:10px 14px;border-radius:8px;background:rgba(0,229,255,.07);border:1px solid rgba(0,229,255,.2)">
            <div class="text-xs text-muted mb-8" style="margin-bottom:3px">ENTRY</div>
            <div class="text-sm">${m.entry}</div>
          </div>
          <div style="padding:10px 14px;border-radius:8px;background:rgba(239,68,68,.07);border:1px solid rgba(239,68,68,.2)">
            <div class="text-xs text-muted mb-8" style="margin-bottom:3px">STOP LOSS</div>
            <div class="text-sm">${m.stop}</div>
          </div>
          ${m.tps.map((tp, i) => `
            <div style="padding:10px 14px;border-radius:8px;background:rgba(16,185,129,.07);border:1px solid rgba(16,185,129,.2)">
              <div class="text-xs text-muted mb-8" style="margin-bottom:3px">TP${i+1}</div>
              <div class="text-sm">${tp}</div>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="card">
        <div class="card-title">💡 GHI CHÚ & INVALID</div>
        <div style="padding:10px 14px;border-radius:8px;background:rgba(124,58,237,.07);border:1px solid rgba(124,58,237,.2);font-size:13px;margin-bottom:8px">${m.note}</div>
        <div style="padding:10px 14px;border-radius:8px;background:rgba(239,68,68,.07);border:1px solid rgba(239,68,68,.2);font-size:13px">
          <strong style="color:var(--red)">❌ Invalid:</strong> ${m.avoid}
        </div>
      </div>
    </div>

    <!-- Right: Diagram + Position Split -->
    <div>
      <div class="card mb-16">
        <div class="card-title">📊 DIAGRAM ${m.title.toUpperCase()}</div>
        ${m.svg}
      </div>

      <div class="card mb-16">
        <div class="card-title">💰 PHÂN BỔ VỐN THEO MODEL</div>
        ${[
          ['40%', 'Entry chính', 'Tại điểm entry của model này', 'var(--accent)'],
          ['30%', 'Test / LPS', 'Nếu giá pullback thêm về LPS', 'var(--green)'],
          ['30%', 'Breakout Retest', 'Khi Phase D confirm breakout', 'var(--yellow)'],
        ].map(([pct, name, desc, color]) => `
          <div style="display:flex;gap:12px;align-items:center;padding:10px;border-radius:8px;background:var(--bg-hover);margin-bottom:6px">
            <div style="font-size:20px;font-weight:900;font-family:'JetBrains Mono',monospace;color:${color};min-width:44px">${pct}</div>
            <div>
              <div style="font-size:13px;font-weight:600">${name}</div>
              <div class="text-xs text-muted">${desc}</div>
            </div>
          </div>
        `).join('')}
      </div>

      <div class="card">
        <div class="card-title">⚠️ KHÔNG VÀO LỆNH KHI</div>
        ${[
          'Coin đã tăng quá mạnh khỏi nền',
          'Breakout nến đóng yếu',
          'BTC đang breakdown',
          'Stop loss quá xa – RR dưới 1:2',
          'Kháng cự ngay trên đầu',
          'Volume tăng không có follow-through',
        ].map(r => `<div style="display:flex;gap:8px;padding:7px 0;border-bottom:1px solid var(--border);font-size:12px"><span style="color:var(--red)">✗</span>${r}</div>`).join('')}
      </div>
    </div>
  </div>
  `;
}

function buildSpringDiagram() {
  return `<svg viewBox="0 0 400 200" style="width:100%;height:200px" class="chart-diagram">
    <defs>
      <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#00e5ff22"/><stop offset="100%" stop-color="transparent"/></linearGradient>
    </defs>
    <!-- Range band -->
    <rect x="0" y="60" width="400" height="80" fill="rgba(0,229,255,0.04)"/>
    <line x1="0" y1="60" x2="400" y2="60" stroke="#00e5ff44" stroke-width="1" stroke-dasharray="4,4"/>
    <line x1="0" y1="140" x2="400" y2="140" stroke="#ef444444" stroke-width="1" stroke-dasharray="4,4"/>
    <text x="6" y="56" fill="#00e5ff88" font-size="9">Range High</text>
    <text x="6" y="155" fill="#ef444488" font-size="9">Range Low / Support</text>
    <!-- Price path -->
    <polyline points="20,100 80,110 120,120 160,130 175,165 185,155 195,135 220,120 240,105 280,90 320,75 360,55" fill="none" stroke="#00e5ff" stroke-width="2"/>
    <!-- Spring zone -->
    <line x1="175" y1="165" x2="175" y2="135" stroke="#f59e0b" stroke-width="2"/>
    <circle cx="175" cy="165" r="5" fill="#f59e0b"/>
    <text x="180" y="175" fill="#f59e0b" font-size="9">SPRING</text>
    <!-- Entry arrow -->
    <line x1="210" y1="100" x2="210" y2="120" stroke="#10b981" stroke-width="1.5" marker-end="url(#arr)"/>
    <text x="215" y="115" fill="#10b981" font-size="9">ENTRY</text>
    <!-- TP labels -->
    <text x="290" y="85" fill="#10b98188" font-size="9">TP1</text>
    <text x="330" y="68" fill="#10b98188" font-size="9">TP2</text>
  </svg>`;
}

function buildLPSDiagram() {
  return `<svg viewBox="0 0 400 200" style="width:100%;height:200px" class="chart-diagram">
    <line x1="0" y1="60" x2="400" y2="60" stroke="#00e5ff44" stroke-width="1" stroke-dasharray="4,4"/>
    <line x1="0" y1="145" x2="400" y2="145" stroke="#ef444444" stroke-width="1" stroke-dasharray="4,4"/>
    <text x="6" y="56" fill="#00e5ff88" font-size="9">Range High</text>
    <text x="6" y="158" fill="#ef444488" font-size="9">Support</text>
    <!-- Spring already happened -->
    <polyline points="20,110 60,120 90,130 110,160 125,148 140,130 170,115 200,125 215,120 230,108 270,90 320,72 370,55" fill="none" stroke="#00e5ff" stroke-width="2"/>
    <!-- Spring mark -->
    <circle cx="110" cy="160" r="4" fill="#f59e0b"/>
    <text x="112" y="170" fill="#f59e0b88" font-size="8">Spring</text>
    <!-- LPS zone -->
    <rect x="195" y="105" width="40" height="30" fill="rgba(16,185,129,0.12)" rx="4"/>
    <text x="198" y="118" fill="#10b981" font-size="8">LPS</text>
    <text x="198" y="130" fill="#10b98188" font-size="8">ENTRY</text>
    <!-- TP -->
    <text x="300" y="80" fill="#10b98188" font-size="9">SOS / TP</text>
  </svg>`;
}

function buildBreakoutDiagram() {
  return `<svg viewBox="0 0 400 200" style="width:100%;height:200px" class="chart-diagram">
    <line x1="0" y1="90" x2="280" y2="90" stroke="#f59e0b44" stroke-width="1" stroke-dasharray="4,4"/>
    <text x="6" y="86" fill="#f59e0b88" font-size="9">Resistance → New Support</text>
    <!-- Breakout bar -->
    <polyline points="20,140 80,135 130,130 175,115 200,95 220,75 240,90 255,92 270,88 320,72 370,50" fill="none" stroke="#00e5ff" stroke-width="2"/>
    <!-- Breakout point -->
    <circle cx="200" cy="75" r="5" fill="#00e5ff"/>
    <text x="205" y="72" fill="#00e5ff" font-size="9">Breakout</text>
    <!-- Retest zone -->
    <rect x="238" y="82" width="35" height="18" fill="rgba(16,185,129,0.12)" rx="3"/>
    <text x="240" y="95" fill="#10b981" font-size="8">ENTRY</text>
    <text x="240" y="105" fill="#10b98188" font-size="7">Retest</text>
    <text x="335" y="65" fill="#10b98188" font-size="9">TP →</text>
  </svg>`;
}
