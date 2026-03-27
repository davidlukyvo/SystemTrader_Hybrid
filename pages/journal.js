/* ── TRADE JOURNAL PAGE v6.1 Adaptive Edge + Learning Feedback ─────────────── */
function journalSetupStats() {
  return computeQuantStats().setupStats || [];
}

function renderJournal() {
  const quant = computeQuantStats();
  ST.journal = Array.isArray(ST.journal) ? ST.journal : [];
  const total = ST.journal.length;
  const onSystemCount = ST.journal.filter(j=>j.onSystem).length;
  const setupStats = journalSetupStats();
  const bestSetup = setupStats[0];

  $('page-journal').innerHTML = `
  <div class="page-header">
    <div class="page-title">📓 Trade Journal</div>
    <div class="page-sub">Ghi lại lệnh để aggressive edge engine tự điều chỉnh edge multiplier theo setup</div>
  </div>

  <div class="grid-4 mb-20">
    <div class="stat-card stat-green"><div class="stat-label">Win Rate</div><div class="stat-value">${quant.winRate}%</div><div class="stat-note">${quant.wins} wins / ${quant.totalClosed} closed</div></div>
    <div class="stat-card stat-cyan"><div class="stat-label">Expectancy</div><div class="stat-value">${quant.expectancyR}R</div><div class="stat-note">Avg R ${quant.avgR}</div></div>
    <div class="stat-card stat-yellow"><div class="stat-label">Profit Factor</div><div class="stat-value">${quant.profitFactor}</div><div class="stat-note">Learning ${quant.learningMode} · quality ${quant.quality}</div></div>
    <div class="stat-card stat-purple"><div class="stat-label">Best Setup</div><div class="stat-value" style="font-size:22px">${bestSetup ? bestSetup.setup : '–'}</div><div class="stat-note">${bestSetup ? 'x'+bestSetup.edgeMultiplier+' edge' : 'Chưa đủ dữ liệu'}</div></div>
  </div>

  <div class="grid-2 mb-20" style="align-items:start">
    <div class="card">
      <div class="card-title">➕ Thêm Lệnh Mới</div>
      <div class="grid-2 gap-8">
        <div class="form-group"><label class="form-label">Coin</label><input class="form-input font-mono" id="jCoin" placeholder="TOKEN"/></div>
        <div class="form-group"><label class="form-label">Ngày</label><input class="form-input" id="jDate" type="date" value="${new Date().toISOString().split('T')[0]}"/></div>
      </div>
      <div class="grid-2 gap-8">
        <div class="form-group"><label class="form-label">Setup Type</label><select class="form-select" id="jSetup"><option>Spring</option><option>Spring + Test</option><option>LPS</option><option>Early Phase D</option><option>Phase C Candidate</option><option>Breakout Retest</option></select></div>
        <div class="form-group"><label class="form-label">Kết quả</label><select class="form-select" id="jResult"><option value="open">🔵 Đang mở</option><option value="win">✅ Win</option><option value="loss">❌ Loss</option><option value="be">⚪ Break-even</option></select></div>
      </div>
      <div class="grid-3 gap-8">
        <div class="form-group"><label class="form-label">Entry</label><input class="form-input font-mono" id="jEntry" type="number" step="any"/></div>
        <div class="form-group"><label class="form-label">Stop</label><input class="form-input font-mono" id="jStop" type="number" step="any"/></div>
        <div class="form-group"><label class="form-label">TP hit</label><input class="form-input font-mono" id="jTp" type="number" step="any"/></div>
      </div>
      <div class="form-group"><label class="form-label">Lý do vào lệnh</label><textarea class="form-textarea" id="jReason" placeholder="Mô tả setup..."></textarea></div>
      <div class="form-group"><label class="form-label">Đúng / Sai ở đâu</label><textarea class="form-textarea" id="jLesson" placeholder="Bài học rút ra..."></textarea></div>
      <div class="toggle-row" id="jOnSysRow" onclick="this.classList.toggle('checked');this.dataset.v=this.classList.contains('checked')?'1':'0'">
        <div><div class="toggle-label">Đúng system không?</div><div class="toggle-sub">Trade này có tuân theo đúng quy tắc hệ thống không</div></div>
        <div class="toggle-box">✓</div>
      </div>
      <button class="btn btn-primary" style="margin-top:12px" onclick="addJournalEntry()">💾 Lưu Lệnh</button>
    </div>

    <div class="card">
      <div class="card-title">📊 Setup Edge Table</div>
      ${setupStats.length ? setupStats.map(s => `<div style="padding:12px;border-radius:10px;background:var(--bg-hover);border:1px solid var(--border);margin-bottom:8px"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><div><div class="fw-700">${s.setup}</div><div class="text-xs text-muted">WR ${s.wr}% · Exp ${s.expectancyR}R · PF ${s.profitFactor}</div></div><div style="text-align:right"><span class="badge ${s.band.cls}">${s.band.label}</span><div class="font-mono fw-700" style="margin-top:4px">x${s.edgeMultiplier}</div></div></div><div class="text-xs text-muted" style="margin-top:8px">Confidence ${Math.round(s.confidence*100)}% · Closed ${s.closed} · W/L ${s.wins}/${s.losses}</div></div>`).join('') : '<div class="text-muted text-sm">Chưa có dữ liệu setup. Learning engine đang bootstrap từ prior baseline.</div>'}
      <div style="margin-top:12px;padding:12px;border-radius:8px;background:rgba(124,58,237,.08);border:1px solid rgba(124,58,237,.2);font-size:12px"><strong style="color:#a78bfa">🎯 Learning hint:</strong><br>Ưu tiên setup có expectancy dương, PF > 1.2 và confidence tăng dần.</div>
      <div style="margin-top:12px;padding:12px;border-radius:8px;background:rgba(0,229,255,.06);border:1px solid rgba(0,229,255,.18);font-size:12px"><div class="fw-700">System Discipline</div><div class="text-muted" style="margin-top:4px">${onSystemCount}/${total} lệnh được đánh dấu là đúng system.</div></div>
    </div>
  </div>

  <div class="card">
    <div class="card-title">Lịch Sử Lệnh (${total})</div>
    ${total === 0 ? '<div class="text-muted text-sm">Chưa có lệnh nào được log.</div>' : `<div style="overflow-x:auto"><table class="j-table"><thead><tr><th>Coin</th><th>Ngày</th><th>Setup</th><th>Entry</th><th>Stop</th><th>TP</th><th>R</th><th>Kết Quả</th><th>System</th><th></th></tr></thead><tbody>${ST.journal.slice().reverse().map(j=>{ const rClr = j.result==='win'?'var(--green)':j.result==='loss'?'var(--red)':j.result==='be'?'var(--text-muted)':'var(--accent)'; const rLbl = j.result==='win'?'✅ Win':j.result==='loss'?'❌ Loss':j.result==='be'?'⚪ BE':'🔵 Open'; const r = journalRMultiple(j); return `<tr><td class="mono fw-700">${j.coin}</td><td>${j.date}</td><td><span class="badge badge-gray">${j.setup}</span></td><td class="mono">${j.entry||'–'}</td><td class="mono text-red">${j.stop||'–'}</td><td class="mono text-green">${j.tp||'–'}</td><td class="mono">${Number.isFinite(r) ? r.toFixed(2)+'R' : '–'}</td><td style="color:${rClr};font-weight:700">${rLbl}</td><td>${j.onSystem?'<span class="badge badge-green">✓ Yes</span>':'<span class="badge badge-red">✗ No</span>'}</td><td><button class="btn btn-sm btn-danger" onclick="deleteJournal('${j.id}')">🗑</button></td></tr>`; }).join('')}</tbody></table></div>`}
  </div>`;
}

function addJournalEntry() {
  const coin = $('jCoin').value.trim().toUpperCase();
  if (!coin) { alert('Nhập tên coin'); return; }
  const entry = {
    id: Date.now().toString(),
    coin, date: $('jDate').value,
    setup: $('jSetup').value,
    result: $('jResult').value,
    entry: parseFloat($('jEntry').value)||null,
    stop:  parseFloat($('jStop').value)||null,
    tp:    parseFloat($('jTp').value)||null,
    reason: $('jReason').value,
    lesson: $('jLesson').value,
    onSystem: $('jOnSysRow').dataset.v === '1',
  };
  ST.journal.push(entry);
  ST.scanMeta.quant = computeQuantStats();
  ST.save();
  renderJournal();
}

async function deleteJournal(id) {
  if (!confirm('Xóa lệnh này?')) return;
  ST.journal = (Array.isArray(ST.journal) ? ST.journal : []).filter(j=>j.id!==id);
  if (window.DB && typeof DB.deleteTrade === 'function') {
    try { await DB.deleteTrade(id); } catch (e) { console.warn('[JOURNAL] deleteTrade failed', e); }
  }
  ST.scanMeta.quant = computeQuantStats();
  ST.save();
  renderJournal();
}
