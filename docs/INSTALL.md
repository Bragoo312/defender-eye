# Руководство по установке Defender Eye

Это пошаговое руководство описывает развертывание **Defender Eye** на чистом VPS-сервере под управлением Linux (Debian 11/12/13, Ubuntu 20.04/22.04/24.04).

---

## Системные требования

* **Процессор:** 1 vCPU (минимально)
* **Оперативная память:** от 512 МБ (рекомендуется 1–2 ГБ)
* **Дисковое пространство:** 100 МБ для бинарного файла и базы SQLite
* **Архитектура:** x86_64 (`amd64`) или ARM64 (`aarch64`)
* **Сетевые порты:** внешние порты открывать **не требуется** (доступ по SSH-туннелю)

---

## Вариант 1: Установка через официальный DEB-пакет (Рекомендуется для Ubuntu / Debian)

Самый быстрый и чистый способ развертывания — использование готового `.deb` пакета из раздела [Releases](https://github.com/Bragoo312/defender-eye/releases):

```bash
# 1. Скачайте пакет (для x86_64 / amd64):
curl -sLO https://github.com/Bragoo312/defender-eye/releases/download/v1.0.0/defender-eye_1.0.0_amd64.deb

# 2. Установите:
sudo apt install ./defender-eye_1.0.0_amd64.deb
# или:
# sudo dpkg -i defender-eye_1.0.0_amd64.deb
```
*(Для ARM64 серверов используйте `defender-eye_1.0.0_arm64.deb`)*

Пакет автоматически создаст пользователя `defender-eye`, необходимые директории, службу `systemd` и сразу запустит её.

---

## Вариант 2: Автоматическая установка через скрипт (Git / Терминал)

1. Клонируйте репозиторий на ваш сервер:
```bash
git clone https://github.com/Bragoo312/defender-eye.git /opt/defender-eye
cd /opt/defender-eye
```

2. Запустите инсталлятор с правами root:
```bash
sudo bash scripts/install.sh
```

Скрипт автоматически:
- Определит архитектуру процессора (`amd64` / `arm64`);
- Создаст изолированного системного пользователя `defender-eye`;
- Разместит бинарник в `/usr/local/bin/defender-eye`;
- Настроит конфигурацию в `/etc/defender-eye/config.yaml`;
- Создаст и запустит службу `systemd` с изоляцией ядра и ограничением по памяти (350 МБ).

---

## Вариант 3: Ручная установка из исходников

### 1. Копирование бинарного файла
В зависимости от архитектуры вашего сервера:
```bash
# Для серверов Intel/AMD x86_64:
sudo cp bin/defender-eye-linux-amd64 /usr/local/bin/defender-eye

# Для серверов ARM64 (Hetzner ARM, Oracle Cloud Ampere, Raspberry Pi):
sudo cp bin/defender-eye-linux-arm64 /usr/local/bin/defender-eye

sudo chmod 755 /usr/local/bin/defender-eye
```

### 2. Создание пользователя и директорий
```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin defender-eye
sudo mkdir -p /etc/defender-eye /var/lib/defender-eye /var/log/defender-eye /usr/share/defender-eye/geoip
sudo chown -R defender-eye:defender-eye /var/lib/defender-eye /var/log/defender-eye /usr/share/defender-eye
```

### 3. Настройка конфигурационного файла
```bash
sudo cp configs/config.example.yaml /etc/defender-eye/config.yaml
sudo sed -i 's|data/defender.db|/var/lib/defender-eye/defender.db|g' /etc/defender-eye/config.yaml
sudo chown defender-eye:defender-eye /etc/defender-eye/config.yaml
sudo chmod 640 /etc/defender-eye/config.yaml
```

### 4. Создание службы systemd
Создайте файл `/etc/systemd/system/defender-eye.service`:
```ini
[Unit]
Description=Defender Eye - Security Dashboard & E2EE Collector
After=network.target

[Service]
Type=simple
User=defender-eye
Group=defender-eye
WorkingDirectory=/var/lib/defender-eye
ExecStart=/usr/local/bin/defender-eye --config /etc/defender-eye/config.yaml
Restart=always
RestartSec=5s

# Sandboxing
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/defender-eye /var/log/defender-eye /usr/share/defender-eye
ReadOnlyPaths=/etc/defender-eye /proc

MemoryMax=350M

[Install]
WantedBy=multi-user.target
```

Запустите службу:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now defender-eye.service
```

---

## Подключение и обновление офлайн-базы MaxMind GeoIP

Скрипт `scripts/install.sh` загружает актуальную базу городов и стран **автоматически** во время первоначальной установки.

В дальнейшем обновлять базу данных можно двумя удобными способами:
1. **Прямо в веб-панели (в 1 клик):** Перейдите во вкладку **«Настройки»** ➔ блок **«Автономная база MaxMind GeoIP»** ➔ нажмите кнопку **«Обновить базу GeoIP сейчас»**. База скачается и мгновенно подключится «на лету» без перезапуска сервиса.
2. **Через терминал на сервере:**
```bash
sudo bash scripts/download-geoip.sh
```
*Перезапуск службы не требуется — резолвер подхватывает обновленный файл на лету.*

---

## Безопасный доступ к панели через SSH-туннель

Панель слушает на `127.0.0.1:8080`, не создавая уязвимостей в открытом интернете.
На вашем локальном компьютере выполните:

```bash
ssh -L 8080:127.0.0.1:8080 root@ip-вашего-сервера
```

После этого откройте браузер:
```
http://localhost:8080
```

---

## Проверка статуса и журналов

```bash
# Статус службы
sudo systemctl status defender-eye

# Журнал работы в реальном времени
sudo journalctl -u defender-eye -f
```
