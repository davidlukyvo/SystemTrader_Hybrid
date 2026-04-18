/* ── SETTINGS PAGE v9.3.1 ─────────────────────────────────── */

function renderSettings() {
  const pageEl = $('page-settings');
  if (!pageEl) return;

  const scheduler = ST.scanMeta?.scheduler || { enabled: false, hours: [8, 17, 21] };
  const tg = window.Telegram?.getConfig ? window.Telegram.getConfig() : { enabled: false, botToken: '', chatId: '' };

  pageEl.innerHTML = `
    <div class="page-header">
      <div class="page-title">⚙️ System Settings</div>
      <div class="page-sub">Global configuration and engine maintenance</div>
    </div>

    <div class="grid-2">
      <!-- ── TELEGRAM INTEGRATION ──────────────────────────── -->
      <div class="card">
        <div class="card-title">📱 Telegram Integration</div>
        <div class="settings-group">
          <div class="field-label">Integration State</div>
          <div style="display:flex;gap:8px;align-items:center;margin-bottom:16px">
            <span class="badge ${tg.enabled ? 'badge-green' : 'badge-gray'}">${tg.enabled ? 'ACTIVE' : 'DISABLED'}</span>
            <button class="btn btn-sm ${tg.enabled ? 'btn-danger' : 'btn-success'}" onclick="toggleTelegram()">
              ${tg.enabled ? 'Disable' : 'Enable'}
            </button>
          </div>
          
          <div class="field-label">Bot Token</div>
          <input type="password" id="tgToken" class="input-dark w-100 mb-12" value="${tg.botToken || ''}" placeholder="123456:ABC-DEF...">
          
          <div class="field-label">Chat ID</div>
          <input type="text" id="tgChatId" class="input-dark w-100 mb-16" value="${tg.chatId || ''}" placeholder="-100123456789">
          
          <div style="display:flex;gap:8px;align-items:center">
            <button class="btn btn-sm btn-primary" onclick="saveTelegramSettings()">Save Configuration</button>
            <button class="btn btn-sm btn-outline" onclick="testTelegram()">Test Connection</button>
          </div>
          <div id="tgTestState" class="tg-test-state"></div>
        </div>
      </div>

      <!-- ── SMART SCAN SCHEDULER ──────────────────────────── -->
      <div class="card">
        <div class="card-title">⏱ Smart Scan Scheduler</div>
        <div class="settings-group">
          <div class="field-label">Scheduler State</div>
          <div style="display:flex;gap:8px;align-items:center;margin-bottom:16px">
            <span class="badge ${scheduler.enabled ? 'badge-green' : 'badge-gray'}">${scheduler.enabled ? 'ENABLED' : 'DISABLED'}</span>
            <button class="btn btn-sm ${scheduler.enabled ? 'btn-danger' : 'btn-success'}" onclick="toggleScheduler()">
              ${scheduler.enabled ? 'Stop Scheduler' : 'Start Scheduler'}
            </button>
          </div>

          <div class="field-label">Scan Times (HH:MM, 24h format, comma separated)</div>
          <input type="text" id="scanHours" class="input-dark w-100 mb-12" value="${(scheduler.hours || []).join(', ')}" placeholder="06:00, 10:30, 21:00, 00:00">
          
          <div class="text-xs text-muted mb-16" style="display:flex;flex-direction:column;gap:4px">
            <div>Next scheduled run: <span class="fw-700 text-cyan">${window.SMART_SCAN?.nextRunLabel ? window.SMART_SCAN.nextRunLabel() : 'OFF'}</span></div>
            <div>Last successful run: <span class="fw-700 text-muted">${window.SMART_SCAN?.lastRunLabel ? window.SMART_SCAN.lastRunLabel() : 'None'}</span></div>
          </div>

          <button class="btn btn-sm btn-primary" onclick="saveSchedulerSettings()">Update Schedule</button>
          <div id="schedulerError" class="text-red text-xs mt-8" style="display:none"></div>
        </div>
      </div>
    </div>

    <!-- ── DATA MANAGEMENT ─────────────────────────────── -->
    <div class="card mt-20">
      <div class="card-title">🛢 Engine Data Maintenance</div>
      <div id="settingsDataStats" class="mb-16">Loading metrics...</div>
      
      <div style="display:flex;gap:12px;flex-wrap:wrap">
        <button class="btn btn-outline" onclick="downloadBackup()">⬇ Export Full Backup (v8/v9)</button>
        <button class="btn btn-outline" onclick="triggerImportBackup()">⬆ Import Data Pattern</button>
        <button class="btn btn-danger" onclick="confirmResetDB()">⚠️ Wipe Database</button>
      </div>
    </div>

    <div class="card mt-20">
      <div class="card-title">🛠 Appearance & Sound</div>
      <div class="settings-group">
        <div class="flex-between mb-12">
          <div>
            <div class="fw-600">Signal Notification Sound</div>
            <div class="text-xs text-muted">Play alert when hard-gate unlocks a setup</div>
          </div>
          <input type="checkbox" id="soundEnabled" checked>
        </div>
        <div class="flex-between">
          <div>
            <div class="fw-600">Compact Coin Cards</div>
            <div class="text-xs text-muted">Use institutional-grade compact view in scanner</div>
          </div>
          <input type="checkbox" id="compactMode" checked>
        </div>
      </div>
    </div>
  `;

  loadSettingsDBStats();
}

async function loadSettingsDBStats() {
  const el = $('settingsDataStats');
  if (!el || !window.DB) return;
  try {
    const stats = await DB.getStats();
    el.innerHTML = `
      <div class="grid-4 gap-8">
        <div class="metric-cell">
          <div class="metric-cell-label">Total Signals</div>
          <div class="metric-cell-value text-cyan">${stats.signals || 0}</div>
        </div>
        <div class="metric-cell">
          <div class="metric-cell-label">Total Outcomes</div>
          <div class="metric-cell-value text-green">${stats.outcomes || 0}</div>
        </div>
        <div class="metric-cell">
          <div class="metric-cell-label">Positions Logged</div>
          <div class="metric-cell-value text-yellow">${stats.trades || 0}</div>
        </div>
        <div class="metric-cell">
          <div class="metric-cell-label">Storage Version</div>
          <div class="metric-cell-value text-muted">RT V9.3</div>
        </div>
      </div>
    `;
  } catch { el.textContent = 'Data metrics unavailable'; }
}

/* ── Actions ─────────────────────────────────────────────── */

function toggleTelegram() {
  if (!window.Telegram) return;
  const cfg = window.Telegram.getConfig();
  window.Telegram.setConfig({ enabled: !cfg.enabled });
  showToast(`Telegram ${!cfg.enabled ? 'Enabled' : 'Disabled'}`);
  renderSettings();
}

function saveTelegramSettings() {
  if (!window.Telegram) return;
  const token = $('tgToken').value.trim();
  const cid = $('tgChatId').value.trim();
  window.Telegram.setConfig({ botToken: token, chatId: cid });
  showToast('Telegram settings saved');
  renderSettings();
}

async function testTelegram() {
  const stateEl = document.getElementById('tgTestState');
  if (!stateEl || !window.Telegram?.sendTest) return;
  
  // Use current values in inputs if available, else use saved config
  const token = $('tgToken')?.value.trim();
  const chatId = $('tgChatId')?.value.trim();

  stateEl.textContent = '⏳ Sending test signal...';
  stateEl.className = 'tg-test-state show';
  
  try {
    // Pass live values to sendTest
    await window.Telegram.sendTest(token, chatId);
    stateEl.textContent = '✅ Connected: Signal verified';
    stateEl.className = 'tg-test-state show success';
    showToast('Telegram test success');
  } catch (err) {
    console.error('[TELEGRAM] Test failed:', err);
    stateEl.textContent = '❌ Failed: ' + err.message;
    stateEl.className = 'tg-test-state show error';
    showToast('Telegram test failed: ' + err.message, 'error');
  }
}

function toggleScheduler() {
  if (!window.SMART_SCAN) return;
  const cfg = window.SMART_SCAN.getScheduler();
  window.SMART_SCAN.setConfig({ enabled: !cfg.enabled });
  showToast(`Scheduler ${!cfg.enabled ? 'Started' : 'Stopped'}`);
  renderSettings();
}

function saveSchedulerSettings() {
  if (!window.SMART_SCAN) return;
  const input = $('scanHours').value;
  const errEl = $('schedulerError');
  if (errEl) errEl.style.display = 'none';

  const parts = input.split(',').map(s => s.trim()).filter(Boolean);
  const validated = [];
  const errors = [];

  for (let p of parts) {
    if (p === '24:00' || p === '24') p = '00:00';
    if (/^\d{1,2}:\d{2}$/.test(p)) {
      let [h, m] = p.split(':').map(Number);
      if (h >= 24) h = h % 24;
      if (m >= 60) { errors.push(`Invalid minutes: ${p}`); continue; }
      validated.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    } else {
      let h = parseInt(p);
      if (!isNaN(h) && h >= 0 && h <= 23) {
        validated.push(`${String(h).padStart(2, '0')}:00`);
      } else {
        errors.push(`Invalid format: ${p}`);
      }
    }
  }

  if (errors.length) {
    if (errEl) {
      errEl.textContent = errors.join(', ');
      errEl.style.display = 'block';
    }
    showToast(errors[0], 'error');
    return;
  }

  window.SMART_SCAN.setConfig({ hours: validated });
  showToast('Scan schedule updated & normalized');
  renderSettings();
}

async function confirmResetDB() {
  const ok = await showConfirm(
    'Wipe Database', 
    'WARNING: This will delete ALL signals, trades, and outcomes from IndexedDB. This action cannot be undone. System will reload.'
  );
  if (ok) {
    if (window.DB?.wipe) {
      try {
        await window.DB.wipe();
        showToast('Database wiped successfully');
        setTimeout(() => location.reload(), 1500);
      } catch (err) {
        showToast('Wipe failed: ' + err.message, 'error');
      }
    }
  }
}
