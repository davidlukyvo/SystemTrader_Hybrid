/* ── RISK CALCULATOR PAGE ────────────────────────────────── */
function renderRisk() {
  const storedEquity = Number(window.ST?.sessionState?.totalEquity || window.ST?.account?.totalEquity || 10000);
  $('page-risk').innerHTML = `
  <div class="page-header">
    <div class="page-title">🛡 Risk Calculator</div>
    <div class="page-sub">Tính toán position size, RR, và TP levels chuẩn hệ thống</div>
  </div>

  <div class="grid-2" style="align-items:start">
    <!-- Inputs -->
    <div class="card">
      <div class="card-title">Thông Số Tài Khoản & Lệnh</div>

      <div class="form-group">
        <label class="form-label">Tài khoản (USDT)</label>
        <input class="form-input font-mono" id="rAcct" type="number" value="${storedEquity}" oninput="calcRisk()"/>
      </div>
      <div class="form-group">
        <label class="form-label">Rủi ro mỗi lệnh: <span id="rRiskPctLabel" style="color:var(--accent)">1%</span></label>
        <input type="range" min="0.5" max="2" step="0.5" value="1" id="rRiskPct" oninput="updateRiskPct(this.value)"/>
        <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-muted);margin-top:2px">
          <span>0.5% (thận trọng)</span><span>1% (chuẩn)</span><span>2% (max)</span>
        </div>
      </div>

      <div class="grid-2 gap-8">
        <div class="form-group">
          <label class="form-label">Entry Price</label>
          <input class="form-input font-mono" id="rEntry" type="number" step="any" value="1.00" oninput="calcRisk()"/>
        </div>
        <div class="form-group">
          <label class="form-label">Stop Loss</label>
          <input class="form-input font-mono" id="rStop" type="number" step="any" value="0.90" oninput="calcRisk()"/>
        </div>
      </div>

      <div class="grid-3 gap-8">
        <div class="form-group">
          <label class="form-label">TP1</label>
          <input class="form-input font-mono" id="rTp1" type="number" step="any" oninput="calcRisk()"/>
        </div>
        <div class="form-group">
          <label class="form-label">TP2</label>
          <input class="form-input font-mono" id="rTp2" type="number" step="any" oninput="calcRisk()"/>
        </div>
        <div class="form-group">
          <label class="form-label">TP3</label>
          <input class="form-input font-mono" id="rTp3" type="number" step="any" oninput="calcRisk()"/>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Mode</label>
        <div style="display:flex;gap:6px">
          <button class="btn btn-sm btn-outline" id="modeNormal" onclick="toggleMode('normal')">📈 Spot Swing</button>
          <button class="btn btn-sm btn-primary" id="modeMicro" onclick="toggleMode('micro')">🚀 Micro-cap (70/30)</button>
        </div>
      </div>
    </div>

    <!-- Results -->
    <div>
      <div class="card mb-16">
        <div class="card-title">📊 Kết Quả</div>
        <div id="riskResult">
          <div class="text-muted text-sm">Nhập thông số để tính...</div>
        </div>
      </div>

      <div class="card mb-16">
        <div class="card-title">📖 Ví Dụ Mẫu</div>
        <div style="padding:12px;border-radius:8px;background:var(--bg-hover);font-size:12px">
          <div style="margin-bottom:6px"><strong>Tài khoản:</strong> 10,000 USDT</div>
          <div style="margin-bottom:6px"><strong>Risk 1%:</strong> 100 USDT</div>
          <div style="margin-bottom:6px"><strong>Entry:</strong> 1.00 · <strong>Stop:</strong> 0.90</div>
          <div style="margin-bottom:6px"><strong>Risk/coin:</strong> 0.10</div>
          <div style="color:var(--accent);font-weight:700">→ Khối lượng = 100 / 0.10 = <strong>1,000 coin</strong></div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">⚠️ Quy Tắc Risk</div>
        ${[
          ['0.5–1%', 'Rủi ro mỗi lệnh', 'Tối đa 1% tài khoản / lệnh'],
          ['RR ≥ 1:2', 'Tỷ lệ lợi nhuận tối thiểu', 'Không vào lệnh khi RR < 1:2'],
          ['Không all-in', 'Không dồn vốn 1 coin', 'Đặc biệt với micro-cap'],
          ['Đa dạng narrative', 'Không tập trung 1 sector', 'Tránh rủi ro tập trung'],
        ].map(([v,l,d])=>`
          <div style="display:flex;gap:10px;padding:9px;border-radius:8px;background:var(--bg-hover);margin-bottom:6px;align-items:center">
            <div style="font-family:'JetBrains Mono',monospace;font-weight:800;color:var(--accent);min-width:54px;font-size:12px">${v}</div>
            <div><div style="font-size:12px;font-weight:600">${l}</div><div class="text-xs text-muted">${d}</div></div>
          </div>
        `).join('')}
      </div>
    </div>
  </div>
  `;
  calcRisk();
}

let riskMode = 'micro';

function toggleMode(m) {
  riskMode = m;
  $('modeNormal').className = 'btn btn-sm ' + (m==='normal'?'btn-primary':'btn-outline');
  $('modeMicro').className  = 'btn btn-sm ' + (m==='micro'?'btn-primary':'btn-outline');
  calcRisk();
}

function updateRiskPct(v) {
  $('rRiskPctLabel').textContent = v + '%';
  calcRisk();
}

function calcRisk() {
  const acct   = parseFloat($('rAcct')?.value) || 0;
  const riskPct= parseFloat($('rRiskPct')?.value) || 1;
  const entry  = parseFloat($('rEntry')?.value) || 0;
  const stop   = parseFloat($('rStop')?.value)  || 0;
  const tp1    = parseFloat($('rTp1')?.value);
  const tp2    = parseFloat($('rTp2')?.value);
  const tp3    = parseFloat($('rTp3')?.value);
  const res    = $('riskResult');
  if (window.ST?.setTotalEquity && acct > 0) window.ST.setTotalEquity(acct);
  if (!res || !acct || !entry || !stop) return;

  const riskUSDT = acct * riskPct / 100;
  const riskPerCoin = Math.abs(entry - stop);
  if (riskPerCoin === 0) return;

  const qty = riskUSDT / riskPerCoin;
  const posUSDT = qty * entry;
  const posSize = (posUSDT / acct * 100).toFixed(1);
  const rr1 = tp1 ? ((tp1 - entry) / riskPerCoin).toFixed(2) : null;
  const rr2 = tp2 ? ((tp2 - entry) / riskPerCoin).toFixed(2) : null;
  const rr3 = tp3 ? ((tp3 - entry) / riskPerCoin).toFixed(2) : null;
  const rrOk = rr1 && rr1 >= 2;

  const tradeBag = riskMode === 'micro' ? (posUSDT * 0.7).toFixed(0) : posUSDT.toFixed(0);
  const moonBag  = riskMode === 'micro' ? (posUSDT * 0.3).toFixed(0) : 0;

  res.innerHTML = `
    <div class="grid-2 gap-8 mb-16">
      <div style="text-align:center;padding:16px;border-radius:10px;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2)">
        <div class="text-xs text-muted">Rủi ro USDT</div>
        <div class="font-mono fw-800 text-red" style="font-size:22px">$${riskUSDT.toFixed(0)}</div>
        <div class="text-xs text-muted">${riskPct}% tài khoản</div>
      </div>
      <div style="text-align:center;padding:16px;border-radius:10px;background:rgba(0,229,255,.08);border:1px solid rgba(0,229,255,.2)">
        <div class="text-xs text-muted">Khối lượng mua</div>
        <div class="font-mono fw-800 text-cyan" style="font-size:22px">${(Number.isFinite(qty) ? qty : 0).toLocaleString(undefined,{maximumFractionDigits:0})}</div>
        <div class="text-xs text-muted">coin · $${posUSDT.toFixed(0)} · ${posSize}% acct</div>
      </div>
    </div>

    ${riskMode==='micro' ? `
    <div style="padding:10px;border-radius:8px;background:rgba(124,58,237,.08);border:1px solid rgba(124,58,237,.2);margin-bottom:12px;font-size:12px">
      <div style="font-weight:700;color:#a78bfa;margin-bottom:6px">🚀 Micro-cap Split (70/30)</div>
      <div style="display:flex;gap:8px">
        <div style="flex:1;text-align:center;padding:8px;background:var(--bg-base);border-radius:6px">
          <div class="text-xs text-muted">Trading Bag (70%)</div>
          <div class="font-mono fw-700" style="color:var(--accent)">$${tradeBag}</div>
          <div class="text-xs text-muted">TP1/2/3 theo plan</div>
        </div>
        <div style="flex:1;text-align:center;padding:8px;background:var(--bg-base);border-radius:6px">
          <div class="text-xs text-muted">Moon Bag (30%)</div>
          <div class="font-mono fw-700" style="color:#a78bfa">$${moonBag}</div>
          <div class="text-xs text-muted">Giữ nếu narrative mạnh</div>
        </div>
      </div>
    </div>` : ''}

    <div class="grid-3 gap-8 mb-12">
      ${[['TP1', tp1, rr1], ['TP2', tp2, rr2], ['TP3', tp3, rr3]].map(([l,tp,rr])=>`
        <div style="text-align:center;padding:10px;border-radius:8px;background:var(--bg-hover)">
          <div class="text-xs text-muted">${l}</div>
          <div class="font-mono fw-700 text-green" style="font-size:13px">${tp||'–'}</div>
          <div class="text-xs" style="color:var(--accent)">RR: 1:${rr||'–'}</div>
        </div>
      `).join('')}
    </div>

    <div style="padding:10px 14px;border-radius:8px;background:${rrOk?'rgba(16,185,129,.08)':'rgba(239,68,68,.08)'};border:1px solid ${rrOk?'rgba(16,185,129,.2)':'rgba(239,68,68,.2)'};font-size:12px;font-weight:600;color:${rrOk?'var(--green)':'var(--red)'}">
      ${rrOk?'✅ RR hợp lệ – Có thể xem xét vào lệnh':'⚠️ RR < 1:2 – HỆ THỐNG KHÔNG CHO PHÉP VÀO LỆNH'}
    </div>
  `;
}
