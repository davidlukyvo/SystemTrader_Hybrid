/* ── WATCHLIST PAGE ──────────────────────────────────────── */
function renderWatchlist() {
  $('page-watchlist').innerHTML = `
  <div class="page-header">
    <div class="page-title">👁 Watchlist</div>
    <div class="page-sub">Theo dõi và phân loại coin theo tier setup · auto-tier từ institutional scanner</div>
  </div>

  <div class="card mb-20">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
      <div>
        <div class="card-title" style="margin-bottom:4px">⚙️ Auto-tier Engine</div>
        <div class="text-sm text-muted">Best = READY duy nhất · Watch = PLAYABLE + PROBE + EARLY + WATCH · Avoid = AVOID / rejected · execution engine không leak tier</div>
      </div>
      <button class="btn btn-primary btn-sm" onclick="refreshAutoTier()">🔄 Refresh auto-tier</button>
    </div>
  </div>

  <div class="card mb-20">
    <div class="card-title">➕ Thêm Coin Vào Watchlist</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
      <div class="form-group" style="flex:1;min-width:120px;margin-bottom:0"><label class="form-label">Symbol</label><input class="form-input font-mono" id="wlSym" placeholder="TOKEN"/></div>
      <div class="form-group" style="flex:2;min-width:200px;margin-bottom:0"><label class="form-label">Notes</label><input class="form-input" id="wlNote" placeholder="VD: Spring đẹp, chờ test confirm"/></div>
      <div class="form-group" style="min-width:140px;margin-bottom:0"><label class="form-label">Tier</label><select class="form-select" id="wlTier"><option value="best">🟢 Best Entry</option><option value="watch">🟡 Watch</option><option value="avoid">🔴 Avoid</option></select></div>
      <button class="btn btn-primary" onclick="addWatchlistItem()">➕ Thêm</button>
    </div>
  </div>

  <div class="watchlist-cols">
    ${renderWLColumn('best', '🟢 Best Entry', 'Chỉ setup READY thật sự từ execution engine')}
    ${renderWLColumn('watch', '🟡 Theo Dõi', 'PLAYABLE/PROBE/WATCH cần thêm xác nhận')}
    ${renderWLColumn('avoid', '🔴 Tránh', 'Không phù hợp hệ thống')}
  </div>`;
}

function renderWLColumn(tier, title, sub) {
  const items = ST.watchlist[tier] || [];
  const clsMap = { best:'wl-col-best', watch:'wl-col-watch', avoid:'wl-col-avoid' };
  return `
  <div class="wl-col ${clsMap[tier]}">
    <div class="wl-col-header"><div><div class="wl-col-title">${title}</div><div class="text-xs text-muted">${sub}</div></div><span class="badge ${tier==='best'?'badge-green':tier==='watch'?'badge-yellow':'badge-red'}">${items.length}</span></div>
    ${items.length === 0 ? `<div class="text-muted text-xs" style="padding:12px 0">Chưa có coin nào</div>` :
      items.map(item => {
        const coin = getCoinBySymbol(item.symbol);
        return `
        <div class="wl-item">
          <div style="display:flex;justify-content:space-between;align-items:start;gap:6px">
            <div>
              <div class="wl-item-sym">${item.symbol}</div>
              ${coin ? `<div class="text-xs text-muted" style="margin-top:2px">Score ${coin.score || 0} · ${coin.setup || coin.structureTag || 'No setup'}</div>` : ''}
            </div>
            <div style="display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end">
              ${tier!=='best'?`<button class="btn btn-sm btn-success" style="padding:3px 7px;font-size:10px" onclick="moveWL('${item.symbol}','best')">↑Best</button>`:''}
              ${tier!=='avoid'?`<button class="btn btn-sm btn-danger" style="padding:3px 7px;font-size:10px" onclick="moveWL('${item.symbol}','avoid')">↓Avoid</button>`:''}
              <button class="btn btn-sm btn-danger" style="padding:3px 7px;font-size:10px" onclick="removeWL('${item.symbol}','${tier}')">✕</button>
            </div>
          </div>
          <div class="wl-item-note">${item.note||''}</div>
          <div class="text-xs text-muted" style="margin-top:4px">${new Date(item.addedAt).toLocaleDateString('vi-VN')}</div>
          <div style="display:flex;gap:4px;margin-top:8px;flex-wrap:wrap">
            <button class="btn btn-sm btn-outline" style="font-size:10px" onclick="openWLCoin('${item.symbol}')">🎯 Score</button>
            ${coin ? `<button class="btn btn-sm btn-outline" style="font-size:10px" onclick="openWLPlan('${item.symbol}')">📋 Plan</button>` : ''}
          </div>
        </div>`;
      }).join('')}
  </div>`;
}

function refreshAutoTier() {
  syncWatchlistFromCoins();
  ST.save();
  renderWatchlist();
}

function addWatchlistItem() {
  const sym  = $('wlSym').value.trim().toUpperCase();
  const note = $('wlNote').value.trim();
  const tier = $('wlTier').value;
  if (!sym) { alert('Nhập symbol'); return; }
  ['best','watch','avoid'].forEach(t => {
    ST.watchlist[t] = ST.watchlist[t].filter(i=>i.symbol!==sym);
  });
  ST.watchlist[tier].push({ symbol:sym, note, addedAt: Date.now() });
  ST.save();
  $('wlSym').value = '';
  $('wlNote').value = '';
  renderWatchlist();
}

function moveWL(sym, newTier) {
  const item = ['best','watch','avoid'].flatMap(t=>ST.watchlist[t].filter(i=>i.symbol===sym))[0];
  ['best','watch','avoid'].forEach(t => {
    ST.watchlist[t] = ST.watchlist[t].filter(i=>i.symbol!==sym);
  });
  if (item) { item.addedAt = Date.now(); ST.watchlist[newTier].push(item); }
  ST.save();
  renderWatchlist();
}

function removeWL(sym, tier) {
  ST.watchlist[tier] = ST.watchlist[tier].filter(i=>i.symbol!==sym);
  ST.save();
  renderWatchlist();
}

function openWLCoin(sym) {
  const coin = getCoinBySymbol(sym);
  if (coin) { loadScorerCoin(coin.id); navigate('scorer'); }
  else { navigate('scanner'); }
}

function openWLPlan(sym) {
  const coin = getCoinBySymbol(sym);
  if (coin) { loadPlanCoin(coin.id); navigate('plan'); }
}
