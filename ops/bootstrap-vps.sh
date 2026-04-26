#!/usr/bin/env bash
set -euo pipefail

APP_NAME="systemtrader"
APP_DIR="${ST_INSTALL_DIR:-/opt/systemtrader}"
APP_USER="${ST_RUN_USER:-systemtrader}"
ENV_DIR="/etc/systemtrader"
ENV_FILE="${ENV_DIR}/systemtrader.env"
BACKUP_DIR="${ST_BACKUP_DIR:-/var/backups/systemtrader}"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOMAIN="${ST_DOMAIN:-_}"
APP_URL="${ST_APP_URL:-http://127.0.0.1/?telegramMode=env}"

log() { printf '\033[1;36m[bootstrap]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[bootstrap:warn]\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m[bootstrap:error]\033[0m %s\n' "$*" >&2; exit 1; }

need_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    fail "Run with sudo/root: sudo bash ops/bootstrap-vps.sh"
  fi
}

detect_ubuntu() {
  if [[ -r /etc/os-release ]]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    if [[ "${ID:-}" != "ubuntu" ]]; then
      warn "This script is intended for Ubuntu 24.04; detected ${PRETTY_NAME:-unknown}."
    elif [[ "${VERSION_ID:-}" != "24.04" ]]; then
      warn "This script is intended for Ubuntu 24.04; detected ${PRETTY_NAME:-unknown}."
    fi
  fi
}

ensure_user() {
  if ! id "${APP_USER}" >/dev/null 2>&1; then
    log "Creating system user ${APP_USER}"
    useradd --system --create-home --home-dir /var/lib/systemtrader --shell /usr/sbin/nologin "${APP_USER}"
  fi
}

install_packages() {
  log "Installing base packages"
  apt-get update
  apt-get install -y nginx curl ca-certificates rsync nodejs npm gnupg
}

install_chrome_if_missing() {
  if command -v google-chrome >/dev/null 2>&1; then
    log "Chrome already installed: $(command -v google-chrome)"
    return
  fi
  warn "google-chrome not found; installing Google Chrome stable"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /etc/apt/keyrings/google-linux.gpg
  chmod a+r /etc/apt/keyrings/google-linux.gpg
  printf 'deb [arch=amd64 signed-by=/etc/apt/keyrings/google-linux.gpg] http://dl.google.com/linux/chrome/deb/ stable main\n' > /etc/apt/sources.list.d/google-chrome.list
  apt-get update
  apt-get install -y google-chrome-stable
}

ensure_node_websocket() {
  local major
  major="$(node -p "Number(process.versions.node.split('.')[0])" 2>/dev/null || echo 0)"
  if [[ "${major}" -lt 22 ]]; then
    warn "Node.js ${major} detected. Installing optional ws package in ${APP_DIR} for CDP WebSocket support."
    (cd "${APP_DIR}" && npm install --no-save ws)
  fi
}

install_app_files() {
  log "Deploying app files to ${APP_DIR}"
  mkdir -p "${APP_DIR}" "${ENV_DIR}" "${BACKUP_DIR}" /var/lib/systemtrader/chrome-profile /var/lib/systemtrader/run
  rsync -a --delete \
    --exclude '.git' \
    --exclude 'node_modules' \
    "${REPO_DIR}/" "${APP_DIR}/"
  chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}" /var/lib/systemtrader "${BACKUP_DIR}"
  chmod 700 "${BACKUP_DIR}" /var/lib/systemtrader
}

install_env_file() {
  if [[ ! -f "${ENV_FILE}" ]]; then
    log "Creating ${ENV_FILE}"
    install -m 0640 -o root -g "${APP_USER}" "${REPO_DIR}/ops/systemtrader.env.example" "${ENV_FILE}"
  else
    log "Keeping existing ${ENV_FILE}"
  fi

  if ! grep -q '^ST_APP_URL=' "${ENV_FILE}"; then
    printf '\nST_APP_URL=%s\n' "${APP_URL}" >> "${ENV_FILE}"
  fi

  if [[ -n "${ST_ENABLE_RUNNER:-}" ]] && ! grep -q '^ST_ENABLE_RUNNER=' "${ENV_FILE}"; then
    printf 'ST_ENABLE_RUNNER=%s\n' "${ST_ENABLE_RUNNER}" >> "${ENV_FILE}"
  fi
}

install_nginx() {
  log "Installing nginx site"
  install -m 0644 "${REPO_DIR}/ops/nginx/systemtrader.conf" /etc/nginx/sites-available/systemtrader
  if [[ "${DOMAIN}" != "_" ]]; then
    sed -i "s/server_name _;/server_name ${DOMAIN};/" /etc/nginx/sites-available/systemtrader
  fi
  ln -sf /etc/nginx/sites-available/systemtrader /etc/nginx/sites-enabled/systemtrader
  nginx -t
  systemctl enable nginx
  systemctl reload nginx || systemctl restart nginx
}

install_systemd() {
  log "Installing systemd units"
  install -m 0644 "${REPO_DIR}/ops/systemd/systemtrader-browser.service" /etc/systemd/system/
  install -m 0644 "${REPO_DIR}/ops/systemd/systemtrader-telegram-relay.service" /etc/systemd/system/
  install -m 0644 "${REPO_DIR}/ops/systemd/systemtrader-health.service" /etc/systemd/system/
  install -m 0644 "${REPO_DIR}/ops/systemd/systemtrader-health.timer" /etc/systemd/system/
  install -m 0644 "${REPO_DIR}/ops/systemd/systemtrader-backup.service" /etc/systemd/system/
  install -m 0644 "${REPO_DIR}/ops/systemd/systemtrader-backup.timer" /etc/systemd/system/
  install -m 0644 "${REPO_DIR}/ops/systemd/systemtrader-runner.service" /etc/systemd/system/
  install -m 0644 "${REPO_DIR}/ops/systemd/systemtrader-runner.timer" /etc/systemd/system/
  systemctl daemon-reload
  systemctl enable --now systemtrader-telegram-relay.service
  systemctl enable --now systemtrader-browser.service
  systemctl enable --now systemtrader-health.timer
  systemctl enable --now systemtrader-backup.timer
  if grep -q '^ST_ENABLE_RUNNER=1' "${ENV_FILE}" 2>/dev/null; then
    systemctl enable --now systemtrader-runner.timer
  else
    warn "Phase 2 runner timer installed but not enabled. Set ST_ENABLE_RUNNER=1 in ${ENV_FILE}, then enable systemtrader-runner.timer."
  fi
}

print_next_steps() {
  local missing=0
  if ! grep -q '^TELEGRAM_BOT_TOKEN=.\+' "${ENV_FILE}" || ! grep -q '^TELEGRAM_CHAT_ID=.\+' "${ENV_FILE}"; then
    missing=1
  fi

  cat <<EOF

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SystemTrader Phase 1 bootstrap complete
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

App dir:      ${APP_DIR}
Env file:     ${ENV_FILE}
Backup dir:  ${BACKUP_DIR}
App URL:      ${APP_URL}
Domain:       ${DOMAIN}

Useful commands:
  systemctl status systemtrader-browser.service
  systemctl status systemtrader-telegram-relay.service
  systemctl list-timers 'systemtrader-*'
  bash ${APP_DIR}/ops/post-install-check.sh

Enable Phase 2 runner after Phase 1 is accepted:
  sudo sed -i '/^ST_ENABLE_RUNNER=/d' ${ENV_FILE}
  echo 'ST_ENABLE_RUNNER=1' | sudo tee -a ${ENV_FILE}
  sudo systemctl enable --now systemtrader-runner.timer

EOF

  if [[ "${missing}" -eq 1 ]]; then
    cat <<EOF
NEXT STEP REQUIRED:
  Telegram secrets are not configured yet.

  sudo nano ${ENV_FILE}
  # Set:
  # TELEGRAM_BOT_TOKEN=...
  # TELEGRAM_CHAT_ID=...

  sudo systemctl restart systemtrader-telegram-relay.service
  bash ${APP_DIR}/ops/post-install-check.sh

EOF
  fi

  if [[ "${DOMAIN}" == "_" ]]; then
    cat <<EOF
OPTIONAL NEXT STEP:
  Set ST_DOMAIN before bootstrap, or edit nginx server_name later:
  sudo nano /etc/nginx/sites-available/systemtrader
  sudo nginx -t && sudo systemctl reload nginx

EOF
  fi
}

main() {
  need_root
  detect_ubuntu
  ensure_user
  install_packages
  install_chrome_if_missing
  install_app_files
  ensure_node_websocket
  install_env_file
  install_nginx
  install_systemd
  print_next_steps
}

main "$@"
