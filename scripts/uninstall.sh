#!/usr/bin/env bash
# ==============================================================================
# Defender Eye — Clean Removal Script
# ==============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}[ERROR] Скрипт должен запускаться от имени root (sudo).${NC}"
  exit 1
fi

echo -e "${RED}=== Удаление Defender Eye ===${NC}"

# Stop and disable systemd service
echo -e "${YELLOW}[1/4] Остановка и отключение службы...${NC}"
systemctl stop defender-eye.service 2>/dev/null || true
systemctl disable defender-eye.service 2>/dev/null || true
rm -f /etc/systemd/system/defender-eye.service
systemctl daemon-reload

# Remove binary
echo -e "${YELLOW}[2/4] Удаление бинарного файла...${NC}"
rm -f /usr/local/bin/defender-eye

# Remove configuration and logs
echo -e "${YELLOW}[3/4] Удаление конфигурации и журналов...${NC}"
rm -rf /etc/defender-eye
rm -rf /var/log/defender-eye
rm -rf /usr/share/defender-eye

# Ask about database
echo -e "${YELLOW}[4/4] Удалить базу данных SQLite? (/var/lib/defender-eye/defender.db)${NC}"
read -p "Удалить базу? [y/N]: " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  rm -rf /var/lib/defender-eye
  userdel defender-eye 2>/dev/null || true
  echo -e "${GREEN}✓ База данных и системный пользователь удалены.${NC}"
else
  echo -e "${CYAN}База данных сохранена в /var/lib/defender-eye/defender.db${NC}"
fi

echo -e "${GREEN}✓ Defender Eye успешно удален.${NC}"
