/* ── Telegram Integration Layer ─────────────────────────── */
window.Telegram = (() => {
  const DEFAULTS = {
    enabled: false,
    botToken: '',
    chatId: '',
    alertReadyMinRR: 1.1,
    alertReadyMinConf: 0.75,
    alertScalpMinRR: 1.1,
    alertScalpMinConf: 0.70,
    alertWatchMinRR: 1.0,
    alertWatchMinConf: 0.60,
    includeEarly: true,
    includeProbe: true,
    lastTestAt: 0,
  };

  let config = { ...DEFAULTS };
  let sentMap = {};
  let antiSpamState = {
    lastSentTime: 0,
    lastSignature: '',
    lastRegime: '',
    sessionCounts: { date: '', morning: 0, afternoon: 0, night: 0 }
  };

  function sanitizeConfig(raw) {
    const row = raw && typeof raw === 'object' ? raw : {};
    const num = (v, d) => Number.isFinite(Number(v)) ? Number(v) : d;
    return {
      enabled: !!row.enabled,
      botToken: String(row.botToken || '').trim(),
      chatId: String(row.chatId || '').trim(),
      alertReadyMinRR: num(row.alertReadyMinRR, DEFAULTS.alertReadyMinRR),
      alertReadyMinConf: num(row.alertReadyMinConf, DEFAULTS.alertReadyMinConf),
      alertScalpMinRR: num(row.alertScalpMinRR, DEFAULTS.alertScalpMinRR),
      alertScalpMinConf: num(row.alertScalpMinConf, DEFAULTS.alertScalpMinConf),
      alertWatchMinRR: num(row.alertWatchMinRR, DEFAULTS.alertWatchMinRR),
      alertWatchMinConf: num(row.alertWatchMinConf, DEFAULTS.alertWatchMinConf),
      includeEarly: row.includeEarly !== false,
      includeProbe: row.includeProbe !== false,
      lastTestAt: num(row.lastTestAt, 0),
    };
  }

  function sanitizeSentMap(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out = {};
    Object.entries(raw).forEach(([k, v]) => {
      if (typeof k === 'string' && v && typeof v === 'object') out[k] = v;
      else if (typeof k === 'string' && Number.isFinite(Number(v))) out[k] = { timestamp: Number(v) };
    });
    return out;
  }

  function sanitizeAntiSpam(raw) {
    const base = { lastSentTime: 0, lastSignature: '', lastRegime: '', sessionCounts: { date: '', morning: 0, afternoon: 0, night: 0 } };
    if (!raw || typeof raw !== 'object') return base;
    return {
      lastSentTime: Number(raw.lastSentTime || 0),
      lastSignature: String(raw.lastSignature || ''),
      lastRegime: String(raw.lastRegime || ''),
      sessionCounts: (raw.sessionCounts && typeof raw.sessionCounts === 'object') ? {
        date: String(raw.sessionCounts.date || ''),
        morning: Number(raw.sessionCounts.morning || 0),
        afternoon: Number(raw.sessionCounts.afternoon || 0),
        night: Number(raw.sessionCounts.night || 0)
      } : base.sessionCounts
    };
  }

  async function init() {
    try {
      if (!window.DB) return { ok: false };
      const [savedCfg, savedSent, savedSpam] = await Promise.all([
        DB.getSetting('telegramConfig'),
        DB.getSetting('telegramSentAlerts'),
        DB.getSetting('telegramAntiSpamState'),
      ]);
      config = sanitizeConfig(savedCfg);
      sentMap = sanitizeSentMap(savedSent);
      antiSpamState = sanitizeAntiSpam(savedSpam);
      return { ok: true, config };
    } catch (err) {
      console.warn('[TELEGRAM] init failed:', err);
      return { ok: false, error: err };
    }
  }

  function getConfig() { return { ...config }; }
  function getAntiSpamState() { return { ...antiSpamState }; }

  async function updateAntiSpamState(next) {
    antiSpamState = { ...antiSpamState, ...(next || {}) };
    if (window.DB) await DB.setSetting('telegramAntiSpamState', antiSpamState);
  }

  async function setConfig(next) {
    config = sanitizeConfig({ ...config, ...(next || {}) });
    if (window.DB) await DB.setSetting('telegramConfig', config);
    return getConfig();
  }

  async function saveSentMap() {
    if (window.DB) await DB.setSetting('telegramSentAlerts', sentMap);
  }

  function isConfigured() {
    return !!(config.botToken && config.chatId);
  }

  async function send(message) {
    if (!isConfigured()) throw new Error('Telegram chưa cấu hình bot token / chat id');
    const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
    const trace = {
      at: Date.now(),
      chatId: config.chatId,
      enabled: config.enabled,
      messagePreview: String(message || '').slice(0, 500)
    };
    try {
      console.log('[TG TRACE] send invoked', trace);
      window.__LAST_TELEGRAM_SEND__ = { ...trace, phase: 'invoked' };
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: config.chatId,
          text: message,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        })
      });
      const data = await res.json().catch(() => ({}));
      const finalTrace = { ...trace, phase: 'response', ok: !!res.ok && data.ok !== false, httpStatus: res.status, data };
      window.__LAST_TELEGRAM_SEND__ = finalTrace;
      console.log('[TG TRACE] send response', finalTrace);
      if (!res.ok || data.ok === false) {
        throw new Error(data.description || `Telegram HTTP ${res.status}`);
      }
      return data;
    } catch (err) {
      const failTrace = { ...trace, phase: 'failed', error: String(err?.message || err) };
      window.__LAST_TELEGRAM_SEND__ = failTrace;
      console.error('[TG TRACE] send failed', failTrace);
      throw err;
    }
  }

  function hasSent(key, signal) {
    const last = sentMap[key];
    if (!last || typeof last !== 'object') return false;

    // ── Smart Overrides: Break cooldown if signal improved significantly ──
    if (signal) {
      const curRR = Number(signal.rr || 0);
      const lastRR = Number(last.rr || 0);
      const curConf = Number(signal.executionConfidence || 0);
      const lastConf = Number(last.confidence || 0);
      const curScore = Number(signal.score || 0);
      const lastScore = Number(last.score || 0);
      const curSt = window.getExecutionDisplayStatus
        ? window.getExecutionDisplayStatus(signal)
        : String(signal.displayStatus || signal.finalAuthorityStatus || signal.status || '').toUpperCase();
      const lastSt = String(last.status || '').toUpperCase();

      // 1. Status Upgrade / Energy Event (E.g. WATCH -> PROBE, PROBE -> READY)
      const isUpgrade = (lastSt === 'WATCH' && ['PROBE', 'PLAYABLE', 'READY'].includes(curSt)) ||
                        (lastSt === 'PROBE' && ['PLAYABLE', 'READY', 'READY_STRONG', 'ENTRY_CANDIDATE'].includes(curSt)) ||
                        (lastSt === 'PLAYABLE' && ['READY', 'READY_STRONG'].includes(curSt));
      
      if (isUpgrade && curSt !== lastSt) return false;
      
      // General upgrade catch-all (if moving to a more actionable state)
      if (curSt !== lastSt && ['READY', 'READY_STRONG', 'ENTRY_CANDIDATE', 'PLAYABLE', 'PROBE'].includes(curSt)) return false;
      
      // 2. RR increase (+1.0 or +30%)
      if (curRR >= lastRR + 1.0 || curRR >= lastRR * 1.3) return false;
      // 3. Significant confidence / score jump (+15%)
      if (curConf >= lastConf + 0.15 || (lastScore > 0 && curScore >= lastScore * 1.15)) return false;
    }

    // ── Variable Cooldowns ──
    const diffMs = Date.now() - (last.timestamp || 0);
    const status = String(last.status || '').toUpperCase();
    let hrs = 4; // WATCH (Default)
    if (['READY', 'READY_STRONG', 'ENTRY_CANDIDATE'].includes(status)) hrs = 1;
    else if (status === 'PLAYABLE') hrs = 1.5;
    else if (status === 'PROBE') hrs = 2;

    return diffMs < (hrs * 3600 * 1000);
  }

  async function markSent(key, signal) {
    const sentStatus = window.getExecutionDisplayStatus
      ? window.getExecutionDisplayStatus(signal)
      : String(signal?.displayStatus || signal?.finalAuthorityStatus || signal?.status || 'READY').toUpperCase();
    sentMap[key] = {
      timestamp: Date.now(),
      rr: Number(signal?.rr || 0),
      confidence: Number(signal?.executionConfidence || 0),
      score: Number(signal?.score || 0),
      status: sentStatus,
      setup: signal?.setup || 'n/a'
    };
    await saveSentMap();
  }


  async function sendCritical(message, cooldownKey = 'system_fatal', cooldownMs = 10 * 60 * 1000) {
    const key = `critical:${String(cooldownKey || 'system_fatal')}`;
    const entry = sentMap[key];
    const lastTs = Number(entry?.timestamp || 0);
    if (lastTs && (Date.now() - lastTs) < cooldownMs) {
      return { ok: true, skipped: true, reason: 'critical_cooldown_active' };
    }
    const result = await send(message);
    sentMap[key] = {
      timestamp: Date.now(),
      rr: 0,
      confidence: 0,
      score: 0,
      status: 'CRITICAL',
      setup: 'system'
    };
    await saveSentMap();
    return result;
  }

  async function sendTestMessage(tempToken = null, tempChatId = null) {
    const cfg = getConfig();
    const token = tempToken || cfg.botToken;
    const cid = tempChatId || cfg.chatId;

    if (!token || !cid) throw new Error('Vui lòng nhập Bot Token và Chat ID trước khi test.');

    const msg = [
      '🧪 <b>System Trader v10.6.9.56</b>',
      '',
      'Telegram Alert Engine connection verified.',
      `• Source: <code>${window.location.hostname || 'Local'}</code>`,
      `• Timestamp: <code>${new Date().toLocaleString()}</code>`,
    ].join('\n');

    // Manually use the provided credentials for the test call
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: cid,
        text: msg,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      })
    });
    
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      throw new Error(data.description || `Telegram HTTP ${res.status}`);
    }

    if (!tempToken) await setConfig({ lastTestAt: Date.now() });
    return data;
  }

  return {
    init,
    getConfig,
    setConfig,
    isConfigured,
    send,
    sendCritical,
    hasSent,
    markSent,
    getAntiSpamState,
    updateAntiSpamState,
    sendTest: sendTestMessage,
  };
})();
