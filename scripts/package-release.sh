#!/usr/bin/env bash
set -e

VERSION="${1:-1.0.0}"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$PROJECT_ROOT/dist"
BUILD_DIR="/tmp/defender-eye-build"

echo "=== Сборка релизных пакетов Defender Eye v${VERSION} ==="

mkdir -p "$DIST_DIR"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

# 1. Проверяем наличие скомпилированных бинарников
if [ ! -f "$PROJECT_ROOT/bin/defender-eye-linux-amd64" ]; then
    echo "Ошибка: bin/defender-eye-linux-amd64 не найден."
    exit 1
fi

if [ ! -f "$PROJECT_ROOT/bin/defender-eye-linux-arm64" ]; then
    echo "Ошибка: bin/defender-eye-linux-arm64 не найден."
    exit 1
fi

# Функция сборки .deb пакета для заданной архитектуры
build_deb() {
    local ARCH="$1"
    local BIN_SRC="$2"
    local PKG_NAME="defender-eye_${VERSION}_${ARCH}"
    local STAGING="$BUILD_DIR/$PKG_NAME"

    echo "--- Сборка DEB пакета: ${PKG_NAME}.deb ---"
    rm -rf "$STAGING"
    mkdir -p "$STAGING/DEBIAN"
    mkdir -p "$STAGING/usr/local/bin"
    mkdir -p "$STAGING/etc/defender-eye"
    mkdir -p "$STAGING/lib/systemd/system"
    mkdir -p "$STAGING/usr/share/defender-eye/geoip"
    chmod 755 "$STAGING/DEBIAN"

    # Бинарный файл
    cp "$BIN_SRC" "$STAGING/usr/local/bin/defender-eye"
    chmod 755 "$STAGING/usr/local/bin/defender-eye"

    # Базовая конфигурация
    cat << 'EOF' > "$STAGING/etc/defender-eye/config.yaml"
# Defender Eye Configuration
server:
  bind_address: "127.0.0.1:8080"
  database_path: "/var/lib/defender-eye/defender.db"
  retention_days: 30
  demo_mode: false

geoip:
  enabled: true
  mmdb_path: "/usr/share/defender-eye/geoip/GeoLite2-City.mmdb"

open_defender:
  enabled: true
  ws_endpoint: "/ws/agent"
  private_key_path: "/etc/defender-eye/server_rsa.key"
  public_key_path: "/etc/defender-eye/server_rsa.pub"
  default_ban_seconds: 900

ingestion:
  enabled: true
  api_path: "/api/v1/events"
  secret_token: ""

metrics:
  collection_interval_seconds: 30
EOF
    chmod 640 "$STAGING/etc/defender-eye/config.yaml"

    # Служба systemd
    cat << 'EOF' > "$STAGING/lib/systemd/system/defender-eye.service"
[Unit]
Description=Defender Eye - Self-Hosted Security Dashboard & E2EE Collector
After=network.target network-online.target
Wants=network-online.target
Documentation=https://github.com/Bragoo312/defender-eye

[Service]
Type=simple
User=defender-eye
Group=defender-eye
WorkingDirectory=/var/lib/defender-eye
ExecStart=/usr/local/bin/defender-eye --config /etc/defender-eye/config.yaml
Restart=always
RestartSec=5s

# Security Sandboxing
ProtectSystem=strict
ProtectHome=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
ReadWritePaths=/var/lib/defender-eye /var/log/defender-eye /usr/share/defender-eye /etc/defender-eye
ReadOnlyPaths=/proc

# Resource limits (safe for 1 vCPU / 2 GB RAM VPS)
MemoryMax=350M
CPUQuota=80%

[Install]
WantedBy=multi-user.target
EOF
    chmod 644 "$STAGING/lib/systemd/system/defender-eye.service"

    # DEBIAN/control
    cat << EOF > "$STAGING/DEBIAN/control"
Package: defender-eye
Version: ${VERSION}
Section: net
Priority: optional
Architecture: ${ARCH}
Maintainer: Bragoo312 <https://github.com/Bragoo312/defender-eye>
Depends: ca-certificates
Homepage: https://github.com/Bragoo312/defender-eye
Description: Defender Eye - Security Dashboard & E2EE Collector for Open Defender
 Ultra-lightweight self-hosted security monitoring panel and E2EE telemetry
 collector for Open Defender and Linux servers. Includes real-time HUD,
 interactive GeoIP attack map, SSH brute-force monitor, SQLite WAL, and
 one-click GeoIP updates. Zero cloud exposure.
EOF
    chmod 644 "$STAGING/DEBIAN/control"

    # DEBIAN/conffiles
    echo "/etc/defender-eye/config.yaml" > "$STAGING/DEBIAN/conffiles"
    chmod 644 "$STAGING/DEBIAN/conffiles"

    # DEBIAN/postinst
    cat << 'EOF' > "$STAGING/DEBIAN/postinst"
#!/bin/sh
set -e

# Создание системной группы и пользователя defender-eye
if ! getent group defender-eye >/dev/null; then
    groupadd -r defender-eye
fi

if ! getent passwd defender-eye >/dev/null; then
    useradd -r -g defender-eye -d /var/lib/defender-eye -s /usr/sbin/nologin \
        -c "Defender Eye daemon" defender-eye
fi

# Создание каталогов
mkdir -p /var/lib/defender-eye
mkdir -p /var/log/defender-eye
mkdir -p /usr/share/defender-eye/geoip
mkdir -p /etc/defender-eye

# Настройка прав
chown -R defender-eye:defender-eye /var/lib/defender-eye /var/log/defender-eye /usr/share/defender-eye /etc/defender-eye
chmod 750 /var/lib/defender-eye /var/log/defender-eye
chmod 755 /usr/share/defender-eye /usr/share/defender-eye/geoip
chmod 750 /etc/defender-eye

if [ -f /etc/defender-eye/config.yaml ]; then
    chmod 640 /etc/defender-eye/config.yaml
fi

# Перезапуск службы, если systemd активен
if [ -d /run/systemd/system ]; then
    systemctl --system daemon-reload >/dev/null 2>&1 || true
    systemctl enable defender-eye.service >/dev/null 2>&1 || true
    if systemctl is-active --quiet defender-eye.service; then
        systemctl restart defender-eye.service >/dev/null 2>&1 || true
    else
        systemctl start defender-eye.service >/dev/null 2>&1 || true
    fi
fi

echo "=========================================================="
echo " [OK] Defender Eye v${VERSION} успешно установлен!"
echo " Служба запущена: sudo systemctl status defender-eye"
echo " Доступ через SSH-туннель: ssh -L 8080:127.0.0.1:8080 user@server"
echo " Веб-интерфейс: http://localhost:8080"
echo "=========================================================="

exit 0
EOF
    chmod 755 "$STAGING/DEBIAN/postinst"

    # DEBIAN/prerm
    cat << 'EOF' > "$STAGING/DEBIAN/prerm"
#!/bin/sh
set -e

if [ "$1" = "remove" ] || [ "$1" = "upgrade" ]; then
    if [ -d /run/systemd/system ]; then
        systemctl stop defender-eye.service >/dev/null 2>&1 || true
        if [ "$1" = "remove" ]; then
            systemctl disable defender-eye.service >/dev/null 2>&1 || true
        fi
    fi
fi

exit 0
EOF
    chmod 755 "$STAGING/DEBIAN/prerm"

    # DEBIAN/postrm
    cat << 'EOF' > "$STAGING/DEBIAN/postrm"
#!/bin/sh
set -e

if [ -d /run/systemd/system ]; then
    systemctl --system daemon-reload >/dev/null 2>&1 || true
fi

if [ "$1" = "purge" ]; then
    rm -rf /var/log/defender-eye
fi

exit 0
EOF
    chmod 755 "$STAGING/DEBIAN/postrm"

    # Сборка пакета через dpkg-deb
    dpkg-deb --build --root-owner-group "$STAGING" "$DIST_DIR/${PKG_NAME}.deb"
    echo "Создан: $DIST_DIR/${PKG_NAME}.deb"
}

# 2. Собираем deb пакеты
build_deb "amd64" "$PROJECT_ROOT/bin/defender-eye-linux-amd64"
build_deb "arm64" "$PROJECT_ROOT/bin/defender-eye-linux-arm64"

# 3. Собираем tar.gz архивы для универсальной установки
echo "--- Сборка tar.gz архивов ---"
for ARCH in amd64 arm64; do
    PKG_TAR="defender-eye_${VERSION}_linux_${ARCH}"
    TAR_STAGING="$BUILD_DIR/$PKG_TAR"
    mkdir -p "$TAR_STAGING"
    cp "$PROJECT_ROOT/bin/defender-eye-linux-${ARCH}" "$TAR_STAGING/defender-eye"
    cp "$PROJECT_ROOT/configs/config.example.yaml" "$TAR_STAGING/"
    cp "$PROJECT_ROOT/README.md" "$TAR_STAGING/"
    cp "$PROJECT_ROOT/LICENSE" "$TAR_STAGING/"
    mkdir -p "$TAR_STAGING/scripts"
    cp "$PROJECT_ROOT/scripts/install.sh" "$TAR_STAGING/scripts/"
    cp "$PROJECT_ROOT/scripts/download-geoip.sh" "$TAR_STAGING/scripts/"

    tar -czf "$DIST_DIR/${PKG_TAR}.tar.gz" -C "$BUILD_DIR" "$PKG_TAR"
    echo "Создан: $DIST_DIR/${PKG_TAR}.tar.gz"
done

# 4. Собираем Windows zip
if [ -f "$PROJECT_ROOT/bin/defender-eye.exe" ]; then
    echo "--- Сборка Windows ZIP архива ---"
    PKG_ZIP="defender-eye_${VERSION}_windows_amd64"
    ZIP_STAGING="$BUILD_DIR/$PKG_ZIP"
    mkdir -p "$ZIP_STAGING"
    cp "$PROJECT_ROOT/bin/defender-eye.exe" "$ZIP_STAGING/"
    cp "$PROJECT_ROOT/configs/config.example.yaml" "$ZIP_STAGING/"
    cp "$PROJECT_ROOT/README.md" "$ZIP_STAGING/"
    cp "$PROJECT_ROOT/LICENSE" "$ZIP_STAGING/"
    
    cd "$BUILD_DIR" && zip -r "$DIST_DIR/${PKG_ZIP}.zip" "$PKG_ZIP" >/dev/null 2>&1 || python3 -c "
import shutil
shutil.make_archive('$DIST_DIR/${PKG_ZIP}', 'zip', '$BUILD_DIR', '$PKG_ZIP')
"
    echo "Создан: $DIST_DIR/${PKG_ZIP}.zip"
fi

# 5. Генерируем контрольные суммы SHA256
echo "--- Генерация контрольных сумм SHA256 ---"
cd "$DIST_DIR"
sha256sum *.deb *.tar.gz *.zip > SHA256SUMS 2>/dev/null || shasum -a 256 *.deb *.tar.gz *.zip > SHA256SUMS
cat SHA256SUMS

echo "=== Сборка завершена успешно! Файлы в папке dist/ ==="
ls -lh "$DIST_DIR"
