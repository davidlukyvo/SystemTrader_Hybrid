# SystemTrader Hybrid — Self-Hosted Ubuntu/Debian Runbook

This runbook defines the safe path for running SystemTrader Hybrid on self-hosted Ubuntu/Debian server environments, including Ubuntu 24.04 for long-lived operation.

The system remains a capital-preservation decision support tool. Self-hosted operation must not change Alpha Guard thresholds, execution authority, or trade semantics.

## Target Architecture

Phase 1 keeps the existing browser app as the runtime source of truth. Phase 2 can optionally move scheduled scan triggering to a systemd timer while still using that same browser runtime:

```text
nginx static site
  -> headless Chrome browser runtime
    -> IndexedDB + SMART_SCAN scheduler
    -> local Telegram relay reading server env vars
    -> ops/health-check.js over Chrome DevTools Protocol
    -> ops/export-backup.js over Chrome DevTools Protocol
    -> optional ops/scanner-runner.js systemd timer over Chrome DevTools Protocol
    -> Telegram health alerts from the server env vars
```

Self-hosted operation does not introduce auto-trading and does not promote scanner-only candidates.

## Phase 1 — Stable Self-Hosted Mode

Goal: keep the existing browser-based app running safely while adding operational guardrails.

- Serve `index.html` and static assets through `nginx`; do not use `python -m http.server` for long-running production use.
- Run Chrome/Chromium under a process supervisor such as `systemd` or `pm2` if scheduler automation is needed from the browser app.
- Add a watchdog that checks the latest scan timestamp and alerts when the app is stale.
- Rotate logs for browser console output, nginx access/error logs, and scan snapshots.
- Export sanitized backups with `DB.exportAll()` on a fixed schedule.
- Keep the dashboard available for manual review; do not treat the server runner as an auto-trading bot.

## Ubuntu 24.04 Setup

### One-Command Bootstrap

After cloning the repo on the server:

```bash
cd SystemTrader_Hybrid
sudo bash ops/bootstrap-vps.sh
```

Optional environment overrides before running bootstrap:

```bash
sudo ST_DOMAIN=systemtrader.example.com ST_APP_URL='http://127.0.0.1/?telegramMode=env' bash ops/bootstrap-vps.sh
```

The bootstrap script installs nginx, Chrome, Node support, static app files, systemd services, timers, the Telegram env relay, backup/health jobs, and the optional Phase 2 runner units. The runner timer is installed but remains disabled until `ST_ENABLE_RUNNER=1`.

After bootstrap, add secrets if they were not already configured:

```bash
sudo nano /etc/systemtrader/systemtrader.env
sudo systemctl restart systemtrader-telegram-relay.service
bash /opt/systemtrader/ops/post-install-check.sh
```

The script does not hardcode Telegram secrets. It creates `/etc/systemtrader/systemtrader.env` from `ops/systemtrader.env.example` and prints next steps when secrets or domain are missing.

### Manual Setup

Create a dedicated user:

```bash
sudo useradd --system --create-home --home-dir /var/lib/systemtrader --shell /usr/sbin/nologin systemtrader
sudo mkdir -p /opt/systemtrader /etc/systemtrader /var/backups/systemtrader
sudo chown -R systemtrader:systemtrader /var/lib/systemtrader /var/backups/systemtrader
sudo chmod 700 /var/backups/systemtrader
```

Install dependencies:

```bash
sudo apt update
sudo apt install -y nginx curl ca-certificates
```

Install Chrome stable from Google or use Chromium if your server image supports it. The sample service expects:

```text
/usr/bin/google-chrome
```

Install Node.js 22+ for built-in WebSocket support. If using older Node, install the optional `ws` package for the ops scripts.

Deploy source:

```bash
sudo rsync -a --delete ./ /opt/systemtrader/
sudo chown -R systemtrader:systemtrader /opt/systemtrader
```

Install nginx config:

```bash
sudo cp /opt/systemtrader/ops/nginx/systemtrader.conf /etc/nginx/sites-available/systemtrader
sudo ln -sf /etc/nginx/sites-available/systemtrader /etc/nginx/sites-enabled/systemtrader
sudo nginx -t
sudo systemctl reload nginx
```

## Phase 1 Secret Hygiene

Telegram credentials are secrets and must not live in Git, screenshots, logs, or backup JSON.

Required environment variables on server:

```bash
TELEGRAM_BOT_TOKEN="..."
TELEGRAM_CHAT_ID="..."
```

Browser static files cannot safely read server environment variables directly. For self-hosted mode, use one of these patterns:

- Preferred: server-side Telegram relay reads `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`, while the browser sends only the prepared message body to the relay.
- Transitional: browser app may still use local Telegram config for manual/local use, but self-hosted automation must prefer the environment-backed relay.

Create the environment file:

```bash
sudo cp /opt/systemtrader/ops/systemtrader.env.example /etc/systemtrader/systemtrader.env
sudo nano /etc/systemtrader/systemtrader.env
sudo chown root:systemtrader /etc/systemtrader/systemtrader.env
sudo chmod 640 /etc/systemtrader/systemtrader.env
```

Recommended values:

```bash
ST_APP_URL=http://127.0.0.1/?telegramMode=env
ST_CDP_URL=http://127.0.0.1:9222
ST_HEALTH_STALE_MINUTES=180
ST_HEALTH_TELEGRAM=1
ST_BACKUP_DIR=/var/backups/systemtrader
ST_BACKUP_KEEP_DAYS=30
ST_ENABLE_RUNNER=0
ST_RUN_DIR=/var/lib/systemtrader/run
ST_RUNNER_SCAN_TIMEOUT_MS=120000
ST_RUNNER_TELEGRAM=0
ST_RUNNER_NOTIFY_ZERO_ACTIONABLE=0
ST_TELEGRAM_RELAY_HOST=127.0.0.1
ST_TELEGRAM_RELAY_PORT=8787
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
```

Backup safety:

- `DB.exportAll()` redacts `telegramConfig.botToken` and `telegramConfig.chatId`.
- Any nested Telegram token/chat/secret-like fields inside exported settings are also redacted.
- Backup files should be treated as sensitive anyway because they contain trading history and scan state.

Validation checklist:

- Run an export and confirm no Telegram token or chat ID appears in the JSON.
- Confirm Telegram still sends from the server using environment variables.
- Confirm local/manual fallback still works during the migration window.
- Confirm logs do not print full token or chat ID.

## Telegram Env Relay

Install the local relay before enabling Telegram alerts:

```bash
sudo cp /opt/systemtrader/ops/systemd/systemtrader-telegram-relay.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now systemtrader-telegram-relay.service
```

Check relay health:

```bash
systemctl status systemtrader-telegram-relay.service
curl http://127.0.0.1:8787/health
```

nginx proxies browser messages from:

```text
/api/telegram/send -> http://127.0.0.1:8787/telegram/send
```

The browser app prefers `/api/telegram/send` when served over HTTP(S). self-hosted runtime should use `?telegramMode=env`, which refuses legacy local-secret fallback if the relay is unavailable. Local manual mode without this query string can still fall back to legacy config during the migration window.

## Browser Runtime

Install sample service:

```bash
sudo cp /opt/systemtrader/ops/systemd/systemtrader-browser.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now systemtrader-browser.service
```

Check status:

```bash
systemctl status systemtrader-browser.service
journalctl -u systemtrader-browser.service -f
curl http://127.0.0.1:9222/json/list
```

Important notes:

- Chrome uses `/var/lib/systemtrader/chrome-profile` so IndexedDB persists across restarts.
- Remote debugging is bound to `127.0.0.1`; do not expose port `9222` publicly.
- `ST_APP_URL` should point to the nginx-served app.

## Health Check

Install timer:

```bash
sudo cp /opt/systemtrader/ops/systemd/systemtrader-health.service /etc/systemd/system/
sudo cp /opt/systemtrader/ops/systemd/systemtrader-health.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now systemtrader-health.timer
```

Manual run:

```bash
sudo -u systemtrader env $(sudo cat /etc/systemtrader/systemtrader.env | xargs) node /opt/systemtrader/ops/health-check.js
```

The health check fails closed when:

- the app page is unreachable through Chrome DevTools Protocol;
- `window.ST`, `window.DB`, or `window.SMART_SCAN` is missing;
- the latest scan timestamp is older than `ST_HEALTH_STALE_MINUTES`.

When `ST_HEALTH_TELEGRAM=1`, health warnings are sent using `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` from the server environment.

## Sanitized Backups

Install timer:

```bash
sudo cp /opt/systemtrader/ops/systemd/systemtrader-backup.service /etc/systemd/system/
sudo cp /opt/systemtrader/ops/systemd/systemtrader-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now systemtrader-backup.timer
```

Manual run:

```bash
sudo systemctl start systemtrader-backup.service
ls -lah /var/backups/systemtrader
```

The backup script:

- calls `DB.exportAll()` from the running browser;
- writes files as `systemtrader-backup-*.json`;
- refuses to write if a Telegram token/chat secret-like value is still present;
- prunes old backups by `ST_BACKUP_KEEP_DAYS`.

## Log Rotation

nginx logs are handled by the distro nginx logrotate policy. Add a small systemd journal retention policy if needed:

```bash
sudo mkdir -p /etc/systemd/journald.conf.d
sudo tee /etc/systemd/journald.conf.d/systemtrader.conf >/dev/null <<'EOF'
[Journal]
SystemMaxUse=500M
MaxRetentionSec=30day
EOF
sudo systemctl restart systemd-journald
```

Operational log commands:

```bash
journalctl -u systemtrader-browser.service --since today
journalctl -u systemtrader-health.service --since today
journalctl -u systemtrader-backup.service --since today
tail -f /var/log/nginx/systemtrader.error.log
```

## Secret Rotation Procedure

Use this procedure if a token is exposed or when rotating credentials routinely.

1. Create or revoke the bot token with BotFather.
2. Update server environment variables:
   ```bash
   sudo nano /etc/systemtrader/systemtrader.env
   ```
3. Set the new `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` values.
4. Restart the relay:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl restart systemtrader-telegram-relay
   ```
5. Send a Telegram test message from the server.
6. Export a fresh backup and verify it contains no token/chat secret.
7. Delete old local browser Telegram config after the relay is confirmed stable.

Emergency rotation checklist:

- Disable Telegram sending in `/etc/systemtrader/systemtrader.env` with `ST_HEALTH_TELEGRAM=0`.
- Revoke old bot token.
- Update env file with the new bot token/chat ID.
- Restart services that read the env file.
- Verify backups remain redacted.

## Phase 2 — Professional Runner

Goal: move scheduled scan execution out of a browser-tab interval while keeping the existing browser app, IndexedDB state, Alpha Guard, persistence, UI, and Telegram authority contract unchanged.

Phase 2 is additive:

- It does not change Alpha Guard, thresholds, scoring, `deployableTop3`, `technicalTop3`, or alert authority semantics.
- It does not place orders and does not turn the system into an auto-trading bot.
- It still supports local development with `python -m http.server <port>`.
- It uses the already-running headless Chrome runtime and calls `SMART_SCAN.trigger('auto', 'systemd_timer')` through Chrome DevTools Protocol.

Installed runner files:

- `ops/scanner-runner.js`: one-shot scanner runner with lock-file protection.
- `ops/systemd/systemtrader-runner.service`: systemd oneshot service.
- `ops/systemd/systemtrader-runner.timer`: fixed scan schedule aligned with the browser scheduler hours.

Runner output files:

```text
/var/lib/systemtrader/run/last_scan.json
/var/lib/systemtrader/run/runtime_audit.json
/var/lib/systemtrader/run/last_error.json
```

Enable the runner only after Phase 1 is accepted:

```bash
sudo sed -i '/^ST_ENABLE_RUNNER=/d' /etc/systemtrader/systemtrader.env
echo 'ST_ENABLE_RUNNER=1' | sudo tee -a /etc/systemtrader/systemtrader.env
sudo systemctl enable --now systemtrader-runner.timer
```

Manual runner test:

```bash
sudo systemctl start systemtrader-runner.service
journalctl -u systemtrader-runner.service -n 80 --no-pager
cat /var/lib/systemtrader/run/last_scan.json
```

Optional runner Telegram notifications:

```bash
ST_RUNNER_TELEGRAM=1
ST_RUNNER_NOTIFY_ZERO_ACTIONABLE=0
```

Runner notification policy:

- Failure alerts are sent when `ST_RUNNER_TELEGRAM=1`.
- Scan-complete alerts are sent only when deployable candidates exist.
- Zero-actionable scan alerts are suppressed unless `ST_RUNNER_NOTIFY_ZERO_ACTIONABLE=1`.

Operational notes:

- Keep the in-app `SMART_SCAN` scheduler disabled or non-overlapping when `systemtrader-runner.timer` is enabled.
- The runner uses a lock file to avoid overlapping scans.
- The runner writes compact health/audit files; full sanitized backups remain owned by `ops/export-backup.js`.
- The browser dashboard remains the review UI, while the systemd timer becomes the reliable scheduling layer.

## Failure Policy

- Fail closed when scanner, persistence, or Telegram relay errors.
- Prefer “no alert” over sending an unverified or stale alert.
- Alert stale runtime separately from trading opportunity alerts.
- Never promote `technicalTop3` or scanner-only candidates into deployable status.
