#!/usr/bin/env bash
# ==============================================================================
# Defender Eye — Automated Installation & systemd Setup Script
# Ultra-lightweight Linux Security Dashboard for Open Defender
# Compatible with Debian 11/12/13, Ubuntu 20.04/22.04/24.04, amd64 & arm64
# ==============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${CYAN}"
echo "  ____        __                 _             _____            "
echo " |  _ \  ___ / _| ___ _ __   __| | ___ _ __  | ____|   _  ___   "
echo " | | | |/ _ \ |_ / _ \ '_ \ / _\` |/ _ \ '__| |  _|  | | | |/ _ \ "
echo " | |_| |  __/  _|  __/ | | | (_| |  __/ |    | |___ | |_| |  __/ "
echo " |____/ \___|_|  \___|_| |_|\__,_|\___|_|    |_____(_)__, |\___| "
echo "                                                      |___/      "
echo -e "${NC}"
echo -e "${CYAN}=== Установка Defender Eye: Self-Hosted SOC Dashboard ===${NC}\n"

# 1. Root check
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}[ERROR] Скрипт должен запускаться от имени root (sudo).${NC}"
  exit 1
fi

# 2. Architecture detection
ARCH=$(uname -m)
case "$ARCH" in
  x86_64)
    BIN_NAME="defender-eye-linux-amd64"
    ;;
  aarch64|arm64)
    BIN_NAME="defender-eye-linux-arm64"
    ;;
  *)
    echo -e "${RED}[ERROR] Неподдерживаемая архитектура: $ARCH. Поддерживаются amd64 и arm64.${NC}"
    exit 1
    ;;
esac

echo -e "${GREEN}[1/6] Архитектура системы:${NC} $ARCH (Бинарник: $BIN_NAME)"

# 3. Create dedicated system user & assign groups
if ! id -u defender-eye >/dev/null 2>&1; then
  echo -e "${GREEN}[2/7] Создание системного пользователя defender-eye...${NC}"
  useradd --system --no-create-home --shell /usr/sbin/nologin defender-eye
else
  echo -e "${GREEN}[2/7] Пользователь defender-eye уже существует.${NC}"
fi

# Add defender-eye to adm and systemd-journal groups for log inspection
usermod -aG adm,systemd-journal defender-eye 2>/dev/null || true

# Setup sudoers drop-in for non-root restart of open-defender service
if [ -d /etc/sudoers.d ]; then
  cat << 'EOF' > /etc/sudoers.d/defender-eye
defender-eye ALL=(ALL) NOPASSWD: /bin/systemctl restart open-defender, /usr/bin/systemctl restart open-defender
EOF
  chmod 440 /etc/sudoers.d/defender-eye
fi

# 4. Setup directories
echo -e "${GREEN}[3/7] Подготовка рабочих директорий...${NC}"
mkdir -p /etc/defender-eye
mkdir -p /var/lib/defender-eye
mkdir -p /var/log/defender-eye
mkdir -p /usr/share/defender-eye/geoip

chown -R defender-eye:defender-eye /var/lib/defender-eye
chown -R defender-eye:defender-eye /var/log/defender-eye
chown -R defender-eye:defender-eye /usr/share/defender-eye
chown -R defender-eye:defender-eye /etc/defender-eye

# 5. Copy or install binary
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_BIN="/usr/local/bin/defender-eye"

if [ -f "$SCRIPT_DIR/bin/$BIN_NAME" ]; then
  echo -e "${GREEN}[4/7] Установка локального бинарного файла...${NC}"
  cp "$SCRIPT_DIR/bin/$BIN_NAME" "$TARGET_BIN"
elif [ -f "$SCRIPT_DIR/bin/defender-eye" ]; then
  cp "$SCRIPT_DIR/bin/defender-eye" "$TARGET_BIN"
else
  echo -e "${YELLOW}[4/7] Бинарник не найден, попытка сборки из исходников...${NC}"
  if ! command -v go >/dev/null 2>&1; then
    if command -v apt-get >/dev/null 2>&1; then
      echo -e "${YELLOW}Установка Go через apt...${NC}"
      apt-get update -qq && apt-get install -y -qq golang-go
    fi
  fi
  if command -v go >/dev/null 2>&1; then
    (cd "$SCRIPT_DIR" && go build -ldflags="-s -w" -o "$TARGET_BIN" ./cmd/defender-eye)
  else
    echo -e "${RED}[ERROR] Бинарник не найден в bin/$BIN_NAME и Go не удалось установить.${NC}"
    exit 1
  fi
fi

chmod 755 "$TARGET_BIN"

# 6. Setup GeoIP Database (MaxMind MMDB)
GEOIP_CITY="/usr/share/defender-eye/geoip/GeoLite2-City.mmdb"
GEOIP_COUNTRY="/usr/share/defender-eye/geoip/GeoLite2-Country.mmdb"
if [ ! -f "$GEOIP_CITY" ] && [ ! -f "$GEOIP_COUNTRY" ]; then
  echo -e "${GREEN}[5/7] Загрузка актуальной базы GeoIP (города и страны)...${NC}"
  if [ -f "$SCRIPT_DIR/scripts/download-geoip.sh" ]; then
    bash "$SCRIPT_DIR/scripts/download-geoip.sh" || true
  fi
else
  echo -e "${GREEN}[5/7] База данных GeoIP уже присутствует.${NC}"
fi

# Detect free port for web dashboard
APP_PORT=8080
while ss -tln 2>/dev/null | grep -q ":${APP_PORT} " || lsof -iTCP:${APP_PORT} -sTCP:LISTEN >/dev/null 2>&1; do
  APP_PORT=$((APP_PORT + 1))
done

# 7. Default configuration
if [ ! -f /etc/defender-eye/config.yaml ]; then
  echo -e "${GREEN}[6/7] Создание базовой конфигурации /etc/defender-eye/config.yaml...${NC}"
  if [ -f "$SCRIPT_DIR/configs/config.example.yaml" ]; then
    cp "$SCRIPT_DIR/configs/config.example.yaml" /etc/defender-eye/config.yaml
    # Fix paths for system service
    sed -i 's|data/defender.db|/var/lib/defender-eye/defender.db|g' /etc/defender-eye/config.yaml
    sed -i 's|geoip/GeoLite2-Country.mmdb|/usr/share/defender-eye/geoip/GeoLite2-City.mmdb|g' /etc/defender-eye/config.yaml
    sed -i 's|configs/server_rsa.key|/etc/defender-eye/server_rsa.key|g' /etc/defender-eye/config.yaml
    sed -i 's|configs/server_rsa.pub|/etc/defender-eye/server_rsa.pub|g' /etc/defender-eye/config.yaml
    if [ "$APP_PORT" -ne 8080 ]; then
      sed -i "s|127.0.0.1:8080|127.0.0.1:${APP_PORT}|g" /etc/defender-eye/config.yaml
      echo -e "${YELLOW}Порт 8080 занят — установлен свободный порт ${APP_PORT}${NC}"
    fi
  fi
  chown defender-eye:defender-eye /etc/defender-eye/config.yaml
  chmod 640 /etc/defender-eye/config.yaml
fi

# 8. systemd service unit with hardened sandboxing
echo -e "${GREEN}[7/7] Регистрация службы systemd...${NC}"
cat << 'EOF' > /etc/systemd/system/defender-eye.service
[Unit]
Description=Defender Eye - Self-Hosted Security Dashboard & E2EE Collector
After=network.target network-online.target
Wants=network-online.target

[Service]
Type=simple
User=defender-eye
Group=defender-eye
WorkingDirectory=/var/lib/defender-eye
ExecStart=/usr/local/bin/defender-eye --config /etc/defender-eye/config.yaml
Restart=always
RestartSec=5s

# Security Sandboxing for 1 CPU / 2 GB VPS
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
ReadWritePaths=/var/lib/defender-eye /var/log/defender-eye /usr/share/defender-eye /etc/defender-eye
ReadOnlyPaths=/proc

# Resource limits (prevent OOM on low-spec VPS)
MemoryMax=350M
CPUQuota=80%

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable defender-eye.service
systemctl restart defender-eye.service

# Detect SSH port and user for tunnel instructions
SSH_PORT="22"
if [ -f /etc/ssh/sshd_config ]; then
  P=$(grep -iE "^\s*Port\s+[0-9]+" /etc/ssh/sshd_config 2>/dev/null | awk '{print $2}' | head -n1 || echo "")
  [ -n "$P" ] && SSH_PORT="$P"
fi

SSH_USER="${SUDO_USER:-root}"
SSH_PORT_FLAG=""
if [ "$SSH_PORT" != "22" ]; then
  SSH_PORT_FLAG="-p $SSH_PORT "
fi

SERVER_IP="$(curl -s --max-time 2 https://api.ipify.org || curl -s --max-time 2 https://ifconfig.me || echo 'your-server-ip')"

echo -e "\n${GREEN}================================================================${NC}"
echo -e "${GREEN}✓ Defender Eye успешно установлен и запущен!${NC}"
echo -e "${GREEN}================================================================${NC}"
echo -e "Служба:         systemctl status defender-eye"
echo -e "Конфигурация:   /etc/defender-eye/config.yaml"
echo -e "База SQLite:    /var/lib/defender-eye/defender.db (WAL mode)"
echo -e "Привязка:       127.0.0.1:${APP_PORT} (Локальный защищенный порт)"
echo -e ""
echo -e "${CYAN}Для подключения с вашего компьютера откройте SSH-туннель:${NC}"
echo -e "  ${YELLOW}ssh ${SSH_PORT_FLAG}-L ${APP_PORT}:127.0.0.1:${APP_PORT} ${SSH_USER}@${SERVER_IP}${NC}"
echo -e ""
echo -e "${CYAN}Затем откройте в браузере:${NC}"
echo -e "  ${GREEN}http://localhost:${APP_PORT}${NC}\n"
