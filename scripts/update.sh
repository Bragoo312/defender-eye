#!/usr/bin/env bash
# ==============================================================================
# Defender Eye — Safe Binary & Frontend Update Script
# Preserves /var/lib/defender-eye/defender.db and /etc/defender-eye/config.yaml
# ==============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}[ERROR] Скрипт должен запускаться от имени root (sudo).${NC}"
  exit 1
fi

echo -e "${CYAN}=== Обновление Defender Eye ===${NC}"

ARCH=$(uname -m)
case "$ARCH" in
  x86_64) BIN_NAME="defender-eye-linux-amd64" ;;
  aarch64|arm64) BIN_NAME="defender-eye-linux-arm64" ;;
  *) echo -e "${RED}[ERROR] Неизвестная архитектура: $ARCH${NC}"; exit 1 ;;
esac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_BIN="/usr/local/bin/defender-eye"

echo -e "${GREEN}[1/3] Остановка службы defender-eye...${NC}"
systemctl stop defender-eye.service || true

echo -e "${GREEN}[2/3] Обновление бинарного файла...${NC}"
if [ -f "$SCRIPT_DIR/bin/$BIN_NAME" ]; then
  cp "$SCRIPT_DIR/bin/$BIN_NAME" "$TARGET_BIN"
elif [ -f "$SCRIPT_DIR/bin/defender-eye" ]; then
  cp "$SCRIPT_DIR/bin/defender-eye" "$TARGET_BIN"
else
  echo -e "${RED}[ERROR] Скомпилированный бинарник не найден в bin/${NC}"
  exit 1
fi

chmod 755 "$TARGET_BIN"

echo -e "${GREEN}[3/3] Перезапуск службы...${NC}"
systemctl daemon-reload
systemctl start defender-eye.service

echo -e "${GREEN}✓ Обновление успешно завершено!${NC}"
systemctl status defender-eye.service --no-pager
