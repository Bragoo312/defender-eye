#!/usr/bin/env bash
# ==============================================================================
# Defender Eye — Automated GeoIP Database Downloader / Updater
# Downloads offline MaxMind MMDB for map and country resolution
# ==============================================================================

set -euo pipefail

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Determine target directory
if [ -d "/usr/share/defender-eye/geoip" ]; then
  TARGET_DIR="/usr/share/defender-eye/geoip"
elif [ -d "geoip" ]; then
  TARGET_DIR="$(pwd)/geoip"
else
  TARGET_DIR="/usr/share/defender-eye/geoip"
  mkdir -p "$TARGET_DIR"
fi

TARGET_FILE="$TARGET_DIR/GeoLite2-City.mmdb"
URL="https://github.com/P3TERX/GeoLite.mmdb/raw/download/GeoLite2-City.mmdb"

echo -e "${CYAN}=== Загрузка актуальной базы GeoIP (MaxMind MMDB) ===${NC}"
echo -e "Целевая папка:  $TARGET_DIR"
echo -e "Файл базы:      GeoLite2-City.mmdb"

echo -e "\n${YELLOW}Загрузка базы данных с зеркала GitHub...${NC}"
if curl -fSL --progress-bar -o "$TARGET_FILE.tmp" "$URL"; then
  mv -f "$TARGET_FILE.tmp" "$TARGET_FILE"
  chmod 644 "$TARGET_FILE"
  if id -u defender-eye >/dev/null 2>&1; then
    chown defender-eye:defender-eye "$TARGET_FILE"
  fi
  SIZE_MB=$(du -m "$TARGET_FILE" | cut -f1)
  echo -e "\n${GREEN}✓ База GeoIP успешно установлена! (${SIZE_MB} МБ)${NC}"
  echo -e "${GREEN}✓ Перезапуск службы не требуется — дескриптор обновляется на лету.${NC}\n"
else
  rm -f "$TARGET_FILE.tmp"
  echo -e "\n${RED}[ERROR] Не удалось загрузить базу с основного источника.${NC}"
  echo -e "${YELLOW}Попытка загрузки компактной базы GeoLite2-Country...${NC}"
  URL_COUNTRY="https://github.com/P3TERX/GeoLite.mmdb/raw/download/GeoLite2-Country.mmdb"
  if curl -fSL --progress-bar -o "$TARGET_DIR/GeoLite2-Country.mmdb.tmp" "$URL_COUNTRY"; then
    mv -f "$TARGET_DIR/GeoLite2-Country.mmdb.tmp" "$TARGET_DIR/GeoLite2-Country.mmdb"
    chmod 644 "$TARGET_DIR/GeoLite2-Country.mmdb"
    if id -u defender-eye >/dev/null 2>&1; then
      chown defender-eye:defender-eye "$TARGET_DIR/GeoLite2-Country.mmdb"
    fi
    echo -e "${GREEN}✓ Компактная база GeoLite2-Country успешно установлена!${NC}\n"
  else
    rm -f "$TARGET_DIR/GeoLite2-Country.mmdb.tmp"
    echo -e "${RED}[ERROR] Ошибка загрузки базы. Сервер продолжит работу в мягком fallback-режиме.${NC}\n"
    exit 1
  fi
fi
