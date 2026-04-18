# v10.6.8.2 Telegram Runtime Trace

Adds verbose runtime tracing for AlertEngine and Telegram.send to diagnose why scan alerts are suppressed or fail silently.

Key additions:
- pages/scanner.js logs signalRows + processSignals result and stores window.__LAST_ALERT_TRACE__
- alert-engine.js logs filter, suppression, cooldown, duplicate, send attempt, success/fail
- telegram.js logs send invocation/response/failure and stores window.__LAST_TELEGRAM_SEND__

Open browser console after scan to inspect `[ALERT TRACE]` and `[TG TRACE]` entries.
