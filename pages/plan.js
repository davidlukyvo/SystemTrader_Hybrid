/* ── TRADE PLAN PAGE ─────────────────────────────────────── */
let planState = { coinId: null, coinSymbol: '' };

function resolvePlanCoin({ preferSuggested = false } = {}) {
  const byId = planState.coinId ? ST.coins.find(x => String(x.id) === String(planState.coinId)) : null;
  if (byId) return byId;
  const symInput = (planState.coinSymbol || $('planSym')?.value || '').trim().toUpperCase();
  if (symInput) {
    const bySym = ST.coins.find(x => String(x.symbol || '').toUpperCase() === symInput);
    if (bySym) {
      planState.coinId = bySym.id;
      planState.coinSymbol = bySym.symbol;
      return bySym;
    }
  }
  if (preferSuggested) {
    const suggested = window.PRO_EDGE?.getSuggestedCoin ? window.PRO_EDGE.getSuggestedCoin() : null;
    if (suggested) {
      planState.coinId = suggested.id;
      planState.coinSymbol = suggested.symbol;
      return suggested;
    }
  }
  return null;
}

function getPlanGateInfo(c) {
  const snap = ST.scanMeta?.proEdge || null;
  const entry = parseFloat($('planEntry')?.value);
  const stop = parseFloat($('planStop')?.value);
  const tp1 = parseFloat($('planTp1')?.value);
  const risk = (entry && stop) ? Math.abs(entry - stop) : 0;
  const rr1 = (entry && stop && tp1 && risk) ? ((tp1 - entry) / risk) : 0;
  const execCheck = window.EXEC_GATE?.isExecutable
    ? window.EXEC_GATE.isExecutable(c, { requirePlayable: true, minRR: 1.2, minConfidence: 0.5 })
    : { ok: !!c };
  const rrBlocked = !rr1 || rr1 < 1.2;
  const gateBlocked = !!snap?.disableTrading;
  const suggestedMismatch = snap?.suggestedSymbol && c?.symbol && String(snap.suggestedSymbol) !== String(c.symbol) && (snap.gateMode === 'REDUCED' || snap.gateMode === 'ENABLED');
  let reason = '';
  if (gateBlocked) reason = snap?.gateReason || 'PRO EDGE tắt trade';
  else if (!execCheck.ok) reason = `Coin chưa executable (${execCheck.reason})`;
  else if (rrBlocked) reason = 'RR dưới 1.2';
  else if (suggestedMismatch) reason = `PRO EDGE đang ưu tiên ${snap.suggestedSymbol}`;
  return { blocked: gateBlocked || !execCheck.ok || rrBlocked, reason, rr1: Number(rr1 || 0).toFixed(2) };
}

function renderPlan() {
  const coins = ST.coins;
  const suggested = window.PRO_EDGE?.getSuggestedCoin ? window.PRO_EDGE.getSuggestedCoin() : null;
  const c = resolvePlanCoin({ preferSuggested: true }) || suggested;

  $('page-plan').innerHTML = `
  <div class="page-header">
    <div class="page-title">📋 Trade Plan</div>
    <div class="page-sub">Lập kế hoạch giao dịch chi tiết cho từng coin · hỗ trợ auto-generate</div>
  </div>
  <div class="btc-warning" style="display:${ST.btc==='bear'?'block':'none'}">⚠️ BTC BREAKDOWN — Cân nhắc giảm size hoặc không vào lệnh</div>

  <div class="grid-2" style="align-items:start">
    <div class="card">
      <div class="card-title">Chọn / Nạp Coin</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">
        ${coins.map(c=>`<button class="btn btn-sm ${String(planState.coinId)===String(c.id)?'btn-primary':'btn-outline'}" onclick="loadPlanCoin('${c.id}')">${c.symbol}</button>`).join('')}
      </div>
      <div class="divider"></div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin:10px 0 12px 0;flex-wrap:wrap">
        <div class="card-title" style="margin:0">Form Lập Plan</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-outline btn-sm" onclick="useProEdgeSuggestion()" ${(suggested)?'':'disabled'}>🧠 Use PRO EDGE</button>
          <button class="btn btn-primary btn-sm" onclick="autoGeneratePlan()" ${c?'':'disabled'}>⚙️ Auto-generate plan</button>
        </div>
      </div>

      <div class="grid-2 gap-8">
        <div class="form-group">
          <label class="form-label">Symbol</label>
          <input class="form-input font-mono" id="planSym" value="${c?c.symbol:''}" placeholder="TOKEN"/>
        </div>
        <div class="form-group">
          <label class="form-label">Setup Type</label>
          <select class="form-select" id="planSetup">
            <option value="Spring" ${(c?.setup||'').includes('Spring')?'selected':''}>Spring Entry</option>
            <option value="LPS" ${(c?.setup||'').includes('LPS')?'selected':''}>Test / LPS</option>
            <option value="Retest" ${(c?.setup||'').includes('Breakout')?'selected':''}>Breakout Retest</option>
          </select>
        </div>
      </div>

      <div class="grid-2 gap-8">
        <div class="form-group">
          <label class="form-label">Entry Price</label>
          <input class="form-input font-mono" id="planEntry" type="number" step="any" value="${c?.entry ?? ''}" oninput="calcPlanRR()"/>
        </div>
        <div class="form-group">
          <label class="form-label">Stop Loss</label>
          <input class="form-input font-mono" id="planStop" type="number" step="any" value="${c?.stop ?? ''}" oninput="calcPlanRR()"/>
        </div>
      </div>

      <div class="grid-3 gap-8">
        <div class="form-group"><label class="form-label">TP1</label><input class="form-input font-mono" id="planTp1" type="number" step="any" value="${c?.tp1 ?? ''}" oninput="calcPlanRR()"/></div>
        <div class="form-group"><label class="form-label">TP2</label><input class="form-input font-mono" id="planTp2" type="number" step="any" value="${c?.tp2 ?? ''}" oninput="calcPlanRR()"/></div>
        <div class="form-group"><label class="form-label">TP3</label><input class="form-input font-mono" id="planTp3" type="number" step="any" value="${c?.tp3 ?? ''}" oninput="calcPlanRR()"/></div>
      </div>

      <div class="form-group">
        <label class="form-label">Invalid Condition</label>
        <textarea class="form-textarea" id="planInvalid" placeholder="Khi nào setup bị hủy">${c?.invalid || ''}</textarea>
      </div>

      <div class="form-group">
        <label class="form-label">Lý do vào lệnh</label>
        <textarea class="form-textarea" id="planReason" placeholder="Mô tả thesis vào lệnh">${c?.reason || ''}</textarea>
      </div>

      ${c ? `<div style="padding:10px;border-radius:8px;background:var(--bg-hover);font-size:12px"><div class="fw-700" style="margin-bottom:6px">AI Summary</div><div class="text-muted">${c.setup || c.structureTag || 'No setup'} · FakePump ${c.fakePumpRisk || 'n/a'} · RelVol ${c.relVol ? c.relVol.toFixed(1) : '–'}x · RiskAdj ${Math.round(c.riskAdjustedScore || c.score || 0)} · Edge ${Math.round(c.edgeScore || 0)} · Alloc ${(c.allocationPct || 0.5).toFixed(2)}%</div></div>` : ''}

      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
        <button class="btn btn-primary" id="savePlanBtn" onclick="savePlan()">💾 Lưu Trade Plan</button>
        <button class="btn btn-outline" onclick="copyPlanSummary()" ${c?'':'disabled'}>📋 Copy Summary</button>
      </div>
    </div>

    <div>
      <div class="card mb-16" id="rrCard">
        <div class="card-title">📐 Risk/Reward Analysis</div>
        <div id="rrDisplay"><div class="text-muted text-sm">Nhập Entry và Stop để tính RR</div></div><div id="planGateNotice" style="margin-top:10px"></div>
      </div>

      <div class="card mb-16">
        <div class="card-title">🧠 Gợi ý vào lệnh</div>
        ${c ? `
          <div style="padding:10px;border-radius:8px;background:var(--bg-hover);margin-bottom:8px">
            <div class="text-xs text-muted">Setup</div>
            <div class="fw-700">${c.setup || c.structureTag || 'No setup'}</div>
          </div>
          <div style="padding:10px;border-radius:8px;background:var(--bg-hover);margin-bottom:8px">
            <div class="text-xs text-muted">Score Breakdown</div>
            <div style="margin-top:6px">${scoreBreakdownRows(c.scoreBreakdown || {})}</div>
          </div>
          <div style="padding:10px;border-radius:8px;background:var(--bg-hover);margin-bottom:8px">
            <div class="text-xs text-muted">Quant Edge</div>
            <div class="text-sm" style="margin-top:6px">${c.quantLabel || 'No edge'} · Exp ${(c.quantEdge?.expectancyR ?? 0)}R · PF ${(c.quantEdge?.profitFactor ?? 1)} · Edge x${(c.quantEdge?.edgeMultiplier ?? 1).toFixed(2)}</div>
          </div>
          <div style="padding:10px;border-radius:8px;background:var(--bg-hover)">
            <div class="text-xs text-muted">Reject / Caution</div>
            <div class="text-sm" style="margin-top:6px">${c.rejectReasons?.length ? c.rejectReasons.join(' · ') : 'Không có cảnh báo lớn'}</div>
          </div>` : '<div class="text-muted text-sm">Chọn coin để xem gợi ý.</div>'}
      </div>

      <div class="card">
        <div class="card-title">✅ Chốt lời theo kế hoạch</div>
        ${[
          ['TP1', 'Chốt 25–30% vị thế', 'Dời stop về hòa vốn nếu thị trường không xấu'],
          ['TP2', 'Chốt thêm 30–40%', 'Giữ phần còn lại nếu momentum còn tốt'],
          ['TP3', 'Runner / moon bag', 'Chỉ giữ khi BTC context không xấu và fake pump risk thấp'],
        ].map(([t,a,n])=>`<div style="padding:10px;border-radius:8px;background:var(--bg-hover);margin-bottom:6px"><div style="font-weight:700;color:var(--green);font-size:12px">${t}</div><div style="font-size:12px;margin-top:2px">${a}</div><div class="text-xs text-muted">${n}</div></div>`).join('')}
      </div>
    </div>
  </div>`;

  if (c) calcPlanRR();
  updatePlanGateUI();
}

function calcPlanRR() {
  const entry = parseFloat($('planEntry')?.value);
  const stop  = parseFloat($('planStop')?.value);
  const tp1   = parseFloat($('planTp1')?.value);
  const tp2   = parseFloat($('planTp2')?.value);
  const tp3   = parseFloat($('planTp3')?.value);
  if (!entry || !stop || !$('rrDisplay')) return;

  const risk  = Math.abs(entry - stop);
  const rr1   = tp1 ? ((tp1 - entry) / risk).toFixed(1) : null;
  const rr2   = tp2 ? ((tp2 - entry) / risk).toFixed(1) : null;
  const rr3   = tp3 ? ((tp3 - entry) / risk).toFixed(1) : null;
  const riskPct = ((risk / entry) * 100).toFixed(1);
  const rrMin = parseFloat(rr1 || 0);
  const rrCls = rrMin >= 2 ? 'rr-good' : rrMin >= 1.5 ? 'rr-ok' : 'rr-bad';

  $('rrDisplay').innerHTML = `
    <div class="rr-display ${rrCls} mb-16">
      <div class="text-xs text-muted" style="margin-bottom:4px">RISK/REWARD (TP1)</div>
      <div class="rr-num">1 : ${rr1||'–'}</div>
      ${rrMin < 2 ? '<div style="font-size:11px;color:var(--red);margin-top:4px">⚠️ RR dưới 1:2 — hệ thống yêu cầu tối thiểu 1:2</div>' : '<div style="font-size:11px;color:var(--green);margin-top:4px">✅ RR hợp lệ</div>'}
    </div>
    <div class="grid-3 gap-8">
      ${[['TP1', rr1, tp1], ['TP2', rr2, tp2], ['TP3', rr3, tp3]].map(([l,rr,tp])=>`
        <div style="text-align:center;padding:10px;border-radius:8px;background:var(--bg-hover)">
          <div class="text-xs text-muted">${l}</div><div class="font-mono fw-700" style="font-size:14px;color:var(--green)">${tp||'–'}</div><div class="text-xs" style="color:var(--accent)">1:${rr||'–'}</div>
        </div>`).join('')}
    </div>
    <div style="margin-top:12px;display:flex;gap:8px">
      <div style="flex:1;padding:8px;border-radius:8px;background:rgba(239,68,68,.07);text-align:center"><div class="text-xs text-muted">Risk / coin</div><div class="font-mono fw-700 text-red">${riskPct}%</div></div>
      <div style="flex:1;padding:8px;border-radius:8px;background:rgba(0,229,255,.07);text-align:center"><div class="text-xs text-muted">Entry</div><div class="font-mono fw-700 text-cyan">${entry}</div></div>
      <div style="flex:1;padding:8px;border-radius:8px;background:rgba(239,68,68,.07);text-align:center"><div class="text-xs text-muted">Stop</div><div class="font-mono fw-700 text-red">${stop}</div></div>
    </div>
    <div style="margin-top:12px;padding:10px;border-radius:8px;background:rgba(124,58,237,.08);border:1px solid rgba(124,58,237,.18)">
      <div class="text-xs text-muted">Quant Allocation Hint</div>
      <div class="fw-700">Risk ${(getCoinBySymbol($('planSym')?.value)?.riskPct || 0.5).toFixed(2)}% · Allocation ${(getCoinBySymbol($('planSym')?.value)?.allocationPct || 0.5).toFixed(2)}% · RiskAdj ${Math.round(getCoinBySymbol($('planSym')?.value)?.riskAdjustedScore || 0)}</div>
    </div>`;
  updatePlanGateUI();
}



function updatePlanGateUI() {
  const c = resolvePlanCoin({ preferSuggested: true });
  const info = getPlanGateInfo(c);
  const box = $('planGateNotice');
  const btn = $('savePlanBtn');
  if (btn) btn.disabled = !!info.blocked;
  if (box) {
    box.innerHTML = info.blocked
      ? `<div style="padding:10px;border-radius:8px;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.18);font-size:12px;color:var(--red)">⛔ Trade blocked — ${info.reason}</div>`
      : `<div style="padding:10px;border-radius:8px;background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.18);font-size:12px;color:var(--green)">✅ PRO EDGE pass — RR ${info.rr1}</div>`;
  }
}

function loadPlanCoin(id) {
  planState.coinId = id;
  const c = ST.coins.find(x => String(x.id) === String(id));
  planState.coinSymbol = c?.symbol || planState.coinSymbol || '';
  renderPlan();
}

function autoGeneratePlan() {
  const c = resolvePlanCoin({ preferSuggested: true });
  if (!c) return;
  if (typeof buildTradePlan === 'function') {
    const plan = buildTradePlan(c);
    $('planEntry').value = Number(plan.entry || c.entry || c.price || 0).toFixed(8).replace(/0+$/,'').replace(/\.$/,'');
    $('planStop').value = Number(plan.stop || c.stop || 0).toFixed(8).replace(/0+$/,'').replace(/\.$/,'');
    $('planTp1').value = Number(plan.tp1 || c.tp1 || 0).toFixed(8).replace(/0+$/,'').replace(/\.$/,'');
    $('planTp2').value = Number(plan.tp2 || c.tp2 || 0).toFixed(8).replace(/0+$/,'').replace(/\.$/,'');
    $('planTp3').value = Number(plan.tp3 || c.tp3 || 0).toFixed(8).replace(/0+$/,'').replace(/\.$/,'');
    $('planInvalid').value = plan.invalid || c.invalid || '';
    $('planReason').value = plan.reason || c.reason || '';
    calcPlanRR();
  }
}

function savePlan() {
  const sym = $('planSym').value;
  if (!sym) { alert('Nhập symbol'); return; }
  planState.coinSymbol = sym;
  const c = resolvePlanCoin({ preferSuggested: true });
  const id = c?.id || planState.coinId;
  const gateInfo = getPlanGateInfo(c);
  if (gateInfo.blocked) { alert('⛔ PRO EDGE chặn lưu plan: ' + gateInfo.reason); return; }
  if (id) {
    if (c) {
      c.entry   = parseFloat($('planEntry').value) || c.entry;
      c.stop    = parseFloat($('planStop').value)  || c.stop;
      c.tp1     = parseFloat($('planTp1').value)   || c.tp1;
      c.tp2     = parseFloat($('planTp2').value)   || c.tp2;
      c.tp3     = parseFloat($('planTp3').value)   || c.tp3;
      c.invalid = $('planInvalid').value;
      c.reason  = $('planReason').value;
      c.setup   = $('planSetup').value;
    }
    ST.save();
    alert('✅ Trade plan đã lưu!');
  }
}

function copyPlanSummary() {
  if (!planState.coinId) return;
  const sym = $('planSym').value;
  const text = `${sym}\nEntry: ${$('planEntry').value}\nStop: ${$('planStop').value}\nTP1: ${$('planTp1').value}\nTP2: ${$('planTp2').value}\nTP3: ${$('planTp3').value}\nInvalid: ${$('planInvalid').value}`;
  navigator.clipboard?.writeText(text);
  alert('Đã copy plan summary.');
}


function useProEdgeSuggestion() {
  const snap = ST.scanMeta?.proEdge || null;
  const c = window.PRO_EDGE?.getSuggestedCoin ? window.PRO_EDGE.getSuggestedCoin() : null;
  if (!c || snap?.disableTrading) { alert('PRO EDGE chưa unlock coin trade được.'); return; }
  const setupKey = String(c.setup || c.structureTag || '').toLowerCase();
  if (!setupKey || setupKey.includes('no setup') || setupKey.includes('unknown') || Number(c.rr || 0) < 1.2) {
    alert('PRO EDGE chưa có coin playable đúng chuẩn RR/setup.');
    return;
  }
  planState.coinId = c.id;
  planState.coinSymbol = c.symbol;
  renderPlan();
}
