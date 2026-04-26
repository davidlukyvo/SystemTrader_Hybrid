#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${ST_INSTALL_DIR:-/opt/systemtrader}"
ENV_FILE="${ST_ENV_FILE:-/etc/systemtrader/systemtrader.env}"

ok=0
warns=0
fails=0

green() { printf '\033[1;32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[1;33m%s\033[0m\n' "$*"; }
red() { printf '\033[1;31m%s\033[0m\n' "$*"; }

pass() { ok=$((ok + 1)); green "PASS: $*"; }
warn() { warns=$((warns + 1)); yellow "WARN: $*"; }
fail() { fails=$((fails + 1)); red "FAIL: $*"; }

check_cmd() {
  if command -v "$1" >/dev/null 2>&1; then pass "$1 installed"; else fail "$1 missing"; fi
}

check_service() {
  local unit="$1"
  if systemctl is-active --quiet "${unit}"; then pass "${unit} active"; else fail "${unit} not active"; fi
}

check_timer() {
  local timer="$1"
  if systemctl is-enabled --quiet "${timer}" && systemctl is-active --quiet "${timer}"; then
    pass "${timer} enabled and active"
  else
    fail "${timer} not enabled/active"
  fi
}

check_optional_runner() {
  if [[ "${ST_ENABLE_RUNNER:-0}" != "1" ]]; then
    warn "Phase 2 runner timer installed but disabled; set ST_ENABLE_RUNNER=1 to enable"
    return
  fi
  check_timer systemtrader-runner.timer
  if [[ -f "${APP_DIR}/ops/scanner-runner.js" ]] && (cd "${APP_DIR}" && node --check ops/scanner-runner.js >/dev/null); then
    pass "scanner-runner.js syntax ok"
  else
    fail "scanner-runner.js unavailable or syntax failed"
  fi
}

load_env() {
  if [[ -r "${ENV_FILE}" ]]; then
    # shellcheck disable=SC1090
    set -a; . "${ENV_FILE}"; set +a
    pass "env file readable: ${ENV_FILE}"
  else
    fail "env file not readable: ${ENV_FILE}"
  fi
}

check_http() {
  local url="$1"
  if curl -fsS --max-time 8 "${url}" >/dev/null; then pass "HTTP reachable: ${url}"; else fail "HTTP not reachable: ${url}"; fi
}

check_relay() {
  local url="http://${ST_TELEGRAM_RELAY_HOST:-127.0.0.1}:${ST_TELEGRAM_RELAY_PORT:-8787}/health"
  local body
  body="$(curl -fsS --max-time 8 "${url}" 2>/dev/null || true)"
  if [[ -z "${body}" ]]; then
    fail "Telegram relay not reachable: ${url}"
    return
  fi
  if grep -q '"ok":true' <<<"${body}" || grep -q '"ok": true' <<<"${body}"; then
    pass "Telegram relay configured"
  else
    warn "Telegram relay reachable but secrets missing"
  fi
}

check_secret_env() {
  if [[ -n "${TELEGRAM_BOT_TOKEN:-}" && -n "${TELEGRAM_CHAT_ID:-}" ]]; then
    pass "Telegram env vars present"
  else
    warn "Telegram env vars missing; edit ${ENV_FILE}"
  fi
}

check_backup_redaction() {
  if [[ ! -x "$(command -v node || true)" ]]; then
    fail "node unavailable for backup redaction check"
    return
  fi
  local output
  output="$(cd "${APP_DIR}" && node - <<'NODE'
const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync('db.js', 'utf8');
const start = src.indexOf('function redactBackupSecret');
const end = src.indexOf('async function exportAll');
if (start < 0 || end < 0 || end <= start) throw new Error('redaction helpers not found');
const token = '123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi';
const chatId = '-1001234567890';
const context = {
  settings: [{ key: 'telegramConfig', value: { enabled: true, botToken: token, chatId, nested: { telegramSecret: token, telegramChatSecret: chatId } } }],
  result: null,
};
vm.createContext(context);
vm.runInContext(`${src.slice(start, end)}\nresult = sanitizeExportSettings(settings);`, context);
const serialized = JSON.stringify(context.result);
if (serialized.includes(token) || serialized.includes(chatId)) {
  console.error('secret leaked');
  process.exit(2);
}
console.log('redacted');
NODE
)" && [[ "${output}" == "redacted" ]] && pass "backup redaction fixture passed" || fail "backup redaction fixture failed"
}

check_health_script() {
  if [[ -x "$(command -v node || true)" && -f "${APP_DIR}/ops/health-check.js" ]]; then
    if (cd "${APP_DIR}" && node --check ops/health-check.js >/dev/null); then
      pass "health-check.js syntax ok"
    else
      fail "health-check.js syntax failed"
    fi
  else
    fail "health-check.js unavailable"
  fi
}

main() {
  echo "SystemTrader Phase 1 post-install check"
  echo "App dir: ${APP_DIR}"
  echo "Env file: ${ENV_FILE}"
  echo

  check_cmd nginx
  check_cmd node
  if command -v google-chrome >/dev/null 2>&1; then pass "google-chrome installed"; else warn "google-chrome missing"; fi
  load_env
  check_secret_env
  check_service systemtrader-telegram-relay.service
  check_service systemtrader-browser.service
  check_timer systemtrader-health.timer
  check_timer systemtrader-backup.timer
  check_optional_runner
  check_http "${ST_APP_URL:-http://127.0.0.1/}"
  check_http "http://127.0.0.1:9222/json/list"
  check_relay
  check_health_script
  check_backup_redaction

  echo
  echo "Summary: ${ok} pass, ${warns} warn, ${fails} fail"
  if [[ "${fails}" -gt 0 ]]; then
    exit 1
  fi
  if [[ "${warns}" -gt 0 ]]; then
    echo "Warnings need review, but core installation is reachable."
  fi
}

main "$@"
