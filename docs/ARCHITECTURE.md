# Архитектура Defender Eye

Документ определяет архитектуру, форматы данных, модель событий и технические решения для **Defender Eye** — легковесного self-hosted дашборда безопасности для Linux-серверов и агента **Open Defender**.

---

## 1. Исследование Open Defender: протокол и форматы данных

### 1.1 Как Defender Eye получает данные от Open Defender
Агент Open Defender (компонент `pkg/connector`) умеет экспортировать события через WebSocket-соединение с оконечным шифрованием (E2EE):
1. **Транспорт**: WebSocket-соединение на `exporter.endpoint_address`.
2. **Шифрование**: 
   * Ключ AES (256 бит) шифруется публичным RSA-ключом сервера (RSA-OAEP с SHA-256).
   * Тело сообщения шифруется алгоритмом AES-256-GCM (12-байтный IV/nonce).
   * Структура фрейма: `[256 байт RSA(aes_key)][12 байт nonce][зашифрованное тело JSON + 16 байт tag]`.
3. **Рукопожатие (Handshake)**:
   * Агент генерирует сессионную пару ключей RSA-2048 при старте сессии.
   * Агент отправляет `system/hello` с публичным ключом сессии и версией (`agent_version`).
   * Сервер **обязан** ответить сообщением `config/set_config` в течение 30 секунд. Если ответ не пришел, сессия разрывается агентом.
   * Агент подтверждает конфигурацию сообщением `system/ack`.
   * Сервер периодически (каждые 30 с) шлет `ping`, агент отвечает `pong`.
4. **Поток событий (`alert/raised`)**:
   * При фиксации инцидента монитор агента формирует сообщение `alert/raised` с массивом `events` (содержит ровно одно событие).
   * Доставка `at-most-once` (без повторных попыток и подтверждений).

Дополнительно Defender Eye поддерживает **Local HTTP Ingestion API** (`POST /api/v1/events` на `127.0.0.1:8080`), что позволяет отправлять события не только через сложный WebSocket Open Defender, но и от легковесных bash-скриптов, syslog-фильтров и пользовательских интеграций.

---

### 1.2 Каталог событий Open Defender

| `source` | Условие возникновения | Доступные поля в полезной нагрузке |
|---|---|---|
| `ssh_monitor` | Превышение лимита неудачных попыток входа SSH за временное окно | `ip`, `message`, `happened_at`, `details.engine` (syslog/journal), `details.source` (/var/log/auth.log) |
| `web_brute_monitor` | Превышение лимита попыток входа на веб-страницах логина | `ip`, `message`, `happened_at`, `details.engine`, `details.source` |
| `web_recon_monitor` | Сканирование несуществующих путей (404-разведка, probing) | `ip`, `message`, `happened_at`, `details.engine`, `details.source` |
| `database_monitor` | Неудачные попытки авторизации в СУБД (PostgreSQL / MySQL) | `ip`, `message`, `happened_at`, `details.engine`, `details.source` |
| `network_antirecon` | eBPF детектирует сканирование портов (SYN/connect scan) или обращение к черному списку портов | `ip`, `message`, `happened_at` (поле `details` отсутствует) |
| `resource_monitor` | Превышение порогов CPU, RAM, дискового I/O или сетевого трафика | `severity` (`warning`/`alert`), `happened_at`, `details.metric`, `details.value`, `details.unit`, `details.limit` (`ip` пустой) |
| `ip_ban` | Фактическая блокировка IP межсетевым экраном (`iptables`/`nftables`) | `ip`, `message`, `happened_at` |

---

### 1.5 Новые подсистемы Defender Eye v1.3.0

1. **Аудит открытых портов сервера (Active Ports Security Engine)**:
   * Напрямую считывает слушающие сокеты ядра Linux из `/proc/net/tcp` и `/proc/net/tcp6`.
   * Декодирует hex-координаты `local_address` с учетом little-endian байтового порядка IPv4/IPv6.
   * Оценивает привязку сетевого интерфейса (`0.0.0.0` / `::` vs `127.0.0.1` / `::1`).
   * Классифицирует уровень риска (`CRITICAL`, `HIGH`, `MEDIUM`, `SAFE`, `INFO`) и генерирует конкретные рекомендации по закрытию внешнего доступа.

2. **Авто-патчер eBPF модуля Open Defender (eBPF Endianness Auto-Patcher)**:
   * Решает известную аппаратную проблему перепутанного порядка байт адреса/порта (`bpf_ntohl`/`bpf_ntohs`) в eBPF модуле Open Defender.
   * Проверяет версионность агента (`v1.3.1+`), наличие скомпилированного бинарника в `/usr/local/bin/open-defender` или `/usr/bin/open-defender`.
   * При наличии исходного C-файла `pkg/ebpfmonitors/bpf/network_monitor.bpf.c` выполняет безопасную замену строк с автоматическим созданием резервной копии `.bak`.
   * Автоматически выполняет перезапуск `systemctl restart open-defender`.

3. **Панель моментального управления IP (Quick IP Action Panel)**:
   * Интегрирована в модальное окно сведений об IP.
   * Поддерживает действия: Перманентный бан, Временный бан на 1 час, Временный бан на 24 часа, Разблокировка, Добавление в белый список.
   * Транслирует экшены на все подключенные агенты Open Defender по E2EE WebSocket каналу.

---

### 1.3 Данные, которые Open Defender НЕ предоставляет (Критически важно!)

В соответствии с главным принципом проекта (**не выдумывать данные, которых источник не дает**), фиксируются следующие ограничения:

1. **Имя пользователя SSH (`username`)**:
   * В стандартном агенте Open Defender регулярное выражение ищет только `(?P<ip>...)`.
   * Поле `username` **отсутствует** в структуре `alert/raised`.
   * *Решение Defender Eye*: поле `username` отображается как `—` (неизвестно), если только имя не содержится явно в тексте `message` или если событие поступило не от кастомного парсера auth.log. Запрещено автоматически подставлять `root` или гадать.
2. **Порты (`source_port`, `destination_port`)**:
   * Open Defender не передает порт источника атаки (`source_port`).
   * Open Defender не передает явный номер целевого порта (`destination_port`), кроме контекста источника (SSH = 22 по умолчанию, web = 80/443).
   * *Решение Defender Eye*: целевой порт дедуцируется на уровне нормализатора только при явной уверенности (SSH = 22), либо указывается как `N/A`. Исходный порт не выдумывается.
3. **Конкретный URL веб-атаки**:
   * В событии `web_recon_monitor` и `web_brute_monitor` Open Defender передает только факт срабатывания и путь к логу сервера. Сам запрошенный путь (`/wp-login.php`, `.env`) в структурированном виде отсутствует.
4. **Событие разблокировки (`unban`)**:
   * В Open Defender пул блокировок `banpool` управляет временем бана в оперативной памяти (`ban_seconds`). По истечении таймера правило iptables удаляется молча, **сообщение `ip_unban` по сети не отправляется**.
   * *Решение Defender Eye*: расчет статуса блокировки производится на стороне Defender Eye по формуле: `expires_at = banned_at + ban_seconds`. Если текущее время больше `expires_at`, статус отображается как `expired`.

---

### 1.4 Производные данные (вычисляемые Defender Eye)

1. **Геолокация и сетевая принадлежность (GeoIP / ASN)**:
   * Вычисляются локально с помощью базы **MaxMind GeoLite2 (MMDB)** без внешних сетевых запросов.
   * Определяются: `country_code`, `country_name`, `city`, `latitude`, `longitude`, `asn`, `as_org`.
   * Если база MMDB отсутствует — приложение работает в штатном режиме, отображая страну как `Unknown` (`XX`), без сбоев и ошибок.
2. **Агрегация IP (`ips`)**:
   * `first_seen`, `last_seen`, общее количество инцидентов, количество блокировок, затронутые сервисы.
3. **Severity (уровень критичности)**:
   * Open Defender выставляет `severity` только для `resource_monitor`.
   * Normalizer Defender Eye назначает уровень по строгому правилу:
     * `ip_ban` -> `CRITICAL`
     * `ssh_monitor`, `database_monitor`, `web_brute_monitor` -> `HIGH`
     * `network_antirecon`, `web_recon_monitor` -> `MEDIUM`
     * `resource_monitor` (alert) -> `HIGH`, (warning) -> `LOW`
     * информационные системные события -> `INFO`

---

## 2. Нормализованная модель данных (Event Normalizer)

Слой нормализации преобразует сырые события любого источника (Open Defender WebSocket, HTTP API, локальный лог-коллектор) в единую внутреннюю структуру.

```go
type SecurityEvent struct {
    ID              int64             `json:"id"`
    EventID         string            `json:"event_id"`         // UUID события
    Timestamp       time.Time         `json:"timestamp"`        // Время фиксации
    Source          string            `json:"source"`           // open_defender, collector, manual
    Monitor         string            `json:"monitor"`          // ssh_monitor, web_recon, etc.
    EventType       string            `json:"event_type"`       // bruteforce, recon, portscan, resource, ban
    Severity        string            `json:"severity"`         // info, low, medium, high, critical
    SourceIP        string            `json:"source_ip"`        // IPv4 / IPv6
    SourcePort      int               `json:"source_port"`      // 0 если не определен
    DestPort        int               `json:"dest_port"`        // 22, 80, 443 и т.д.
    Protocol        string            `json:"protocol"`         // tcp, udp, icmp
    Action          string            `json:"action"`           // blocked, detected, alerted, logged
    Service         string            `json:"service"`          // ssh, http, postgresql, system
    Username        string            `json:"username"`         // если извлечен, иначе пусто
    Message         string            `json:"message"`          // исходное сообщение
    CountryCode     string            `json:"country_code"`     // US, RU, NL, DE, CN
    CountryName     string            `json:"country_name"`     // United States, Russia...
    City            string            `json:"city"`             // Amsterdam, Frankfurt...
    Latitude        float64           `json:"latitude"`
    Longitude       float64           `json:"longitude"`
    ASN             uint              `json:"asn"`
    ASOrg           string            `json:"as_org"`
    RawData         string            `json:"raw_data"`         // Исходный JSON
}
```

---

## 3. Схема базы данных (SQLite)

База данных располагается локально: `/var/lib/defender-eye/defender.db`.
Включен режим **WAL (Write-Ahead Logging)** и `PRAGMA synchronous = NORMAL` для максимального быстродействия и минимального износа диска при 1 CPU / 2 GB RAM.

```sql
-- Таблица нормализованных событий
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT UNIQUE NOT NULL,
    timestamp DATETIME NOT NULL,
    source TEXT NOT NULL,
    monitor TEXT NOT NULL,
    event_type TEXT NOT NULL,
    severity TEXT NOT NULL,
    source_ip TEXT,
    source_port INTEGER DEFAULT 0,
    dest_port INTEGER DEFAULT 0,
    protocol TEXT DEFAULT 'tcp',
    action TEXT NOT NULL,
    service TEXT NOT NULL,
    username TEXT,
    message TEXT NOT NULL,
    country_code TEXT,
    country_name TEXT,
    city TEXT,
    latitude REAL,
    longitude REAL,
    asn INTEGER DEFAULT 0,
    as_org TEXT,
    raw_data TEXT
);

CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_source_ip ON events(source_ip);
CREATE INDEX IF NOT EXISTS idx_events_monitor ON events(monitor);
CREATE INDEX IF NOT EXISTS idx_events_severity ON events(severity);

-- Агрегированная информация по IP-адресам
CREATE TABLE IF NOT EXISTS ips (
    ip TEXT PRIMARY KEY,
    country_code TEXT,
    country_name TEXT,
    city TEXT,
    latitude REAL,
    longitude REAL,
    asn INTEGER,
    as_org TEXT,
    first_seen DATETIME NOT NULL,
    last_seen DATETIME NOT NULL,
    total_events INTEGER DEFAULT 1,
    is_banned INTEGER DEFAULT 0,
    last_action TEXT
);

CREATE INDEX IF NOT EXISTS idx_ips_last_seen ON ips(last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_ips_country ON ips(country_code);

-- История и текущее состояние блокировок
CREATE TABLE IF NOT EXISTS blocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip TEXT NOT NULL,
    banned_at DATETIME NOT NULL,
    expires_at DATETIME NOT NULL,
    ban_seconds INTEGER NOT NULL,
    reason TEXT NOT NULL,
    monitor TEXT NOT NULL,
    status TEXT NOT NULL -- active, expired, unbanned
);

CREATE INDEX IF NOT EXISTS idx_blocks_ip ON blocks(ip);
CREATE INDEX IF NOT EXISTS idx_blocks_expires_at ON blocks(expires_at);

-- Периодические системные метрики хоста (снимки раз в 30-60 сек)
CREATE TABLE IF NOT EXISTS system_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME NOT NULL,
    cpu_percent REAL,
    ram_used_bytes INTEGER,
    ram_total_bytes INTEGER,
    swap_used_bytes INTEGER,
    swap_total_bytes INTEGER,
    disk_used_bytes INTEGER,
    disk_total_bytes INTEGER,
    load_avg_1 REAL,
    load_avg_5 REAL,
    load_avg_15 REAL,
    net_rx_bytes_sec REAL,
    net_tx_bytes_sec REAL
);

CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON system_metrics(timestamp DESC);

-- Настройки приложения и метаданные
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME NOT NULL
);
```

### Автоматическая очистка (Retention Policy)
Фоновая горутина каждые 6 часов выполняет удаление устаревших данных согласно настройке `retention_days` (7, 30 или 90 дней):
```sql
DELETE FROM events WHERE timestamp < datetime('now', '-' || ? || ' days');
DELETE FROM system_metrics WHERE timestamp < datetime('now', '-' || ? || ' days');
DELETE FROM blocks WHERE expires_at < datetime('now', '-' || ? || ' days') AND status = 'expired';
```

---

## 4. Стек технологий и архитектура компонентов

### 4.1 Backend: Go (Golang)
* **Причины выбора**:
  1. **Минимальное потребление ресурсов**: потребление RAM в простое 15–25 МБ, потребление CPU близко к 0%. Полностью соответствует лимитам VPS 1 CPU / 2 GB RAM.
  2. **Один бинарник**: статическая компиляция без внешних зависимостей (не требуется Node.js runtime, Python или Docker на сервере).
  3. **Встроенный фронтенд**: с помощью директивы `//go:embed dist/*` собранные файлы UI компилируются прямо в исполняемый файл `defender-eye`. Для работы нужен ровно один файл!
  4. **Совместимость с Open Defender**: реализация протокола шифрования RSA-OAEP + AES-GCM идентична коду Open Defender.
* **Основные библиотеки**:
  * `net/http` + маршрутизатор `chi` (минималистичный, без накладных расходов).
  * `modernc.org/sqlite` (чистый Go SQLite без зависимости от CGO) — компилируется под `amd64` и `arm64` без сложностей кросс-компиляции.
  * `gorilla/websocket` — для WebSocket сервера агента и SSE/WebSocket клиентов фронтенда.
  * `github.com/oschwald/geoip2-golang` — для чтения локальных файлов `.mmdb`.

### 4.2 Frontend: React + TypeScript + Vite + Tailwind CSS
* **Стиль**: Dark Cyber SOC, вдохновленный **3X-UI** (темно-серый / графитовый фон `#0d1117`, аккуратная сетка, боковая панель навигации, карточки метрик, статусные индикаторы).
* **Вкладки**:
  1. `Dashboard` — обзор ключевых показателей (CPU, RAM, Uptime, события, заблокированные IP, мини-карта, последние алерты).
  2. `Events` — детальная таблица событий безопасности с пагинацией, полнотекстовым поиском и фильтрами по severity, типу, IP.
  3. `IPs` — реестр атакующих IP с агрегацией по странам, ASN, счетчикам атак и таймлайном инцидентов.
  4. `Blocks` — активные и архивные блокировки с расчетом оставшегося времени бана.
  5. `Threat Map` — полноэкранная неоновая карта атак с локальными векторными контурами стран (без внешних картографических тайлов), точками атак и траекториями.
  6. `SSH Activity` — специализированная вкладка SSH-мониторинга (неудачные входы, брутфорс, география атак).
  7. `Ports` — анализ распределения атак по целевым портам (22, 80, 443, 3306, 5432 и нестандартные порты).
  8. `System` — мониторинг нагрузки хоста (CPU, RAM, Swap, Disk, Load Average, Network RX/TX).
  9. `Settings` — retention-политика, настройка ключей Open Defender, переключение между демо-режимом (симулятором) и реальным сервером.
* **Realtime**: Server-Sent Events (SSE) или WebSocket — легкий поток, обновляющий счетчики и таблицы без перезагрузки страницы.

---

## 5. Развертывание и жизненный цикл (Debian / Ubuntu)

### 5.1 Структура директорий
```text
/opt/defender-eye/
  ├── defender-eye             # Исполняемый бинарник (включает embedded UI)
  └── geoip/
      └── GeoLite2-Country.mmdb # Опциональная локальная база GeoIP

/etc/defender-eye/
  └── config.yaml              # Конфигурация приложения

/var/lib/defender-eye/
  └── defender.db              # База данных SQLite

/var/log/defender-eye/         # Логи работы (или journald)
```

### 5.2 Systemd Unit (`/etc/systemd/system/defender-eye.service`)
```ini
[Unit]
Description=Defender Eye Security Dashboard
After=network.target

[Service]
Type=simple
User=defender-eye
Group=defender-eye
WorkingDirectory=/opt/defender-eye
ExecStart=/opt/defender-eye/defender-eye -config /etc/defender-eye/config.yaml
Restart=on-failure
RestartSec=5s

# Изоляция и безопасность Linux
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/defender-eye /var/log/defender-eye
PrivateTmp=true
NoNewPrivileges=true
CapabilityBoundingSet=

[Install]
WantedBy=multi-user.target
```

### 5.3 Безопасность сети
* По умолчанию параметр `bind_address: "127.0.0.1:8080"`.
* Панель недоступна из публичной сети.
* Подключение администратора выполняется через SSH-туннель:
  ```bash
  ssh -L 8080:127.0.0.1:8080 user@server
  ```
  и открытие `http://127.0.0.1:8080` в локальном браузере.

---

## 6. Скрипты обслуживания

1. `scripts/install.sh`:
   * Создает пользователя `defender-eye`.
   * Создает необходимые каталоги с корректными правами.
   * Копирует скомпилированный бинарник и дефолтный `config.yaml`.
   * Генерирует RSA-ключ сервера для подключения Open Defender (если включен режим экспорта).
   * Инициализирует базу данных SQLite.
   * Создает и активирует systemd-сервис.
   * Выполняет проверку работоспособности (`healthcheck`).
2. `scripts/update.sh`:
   * Останавливает сервис.
   * Обновляет бинарник.
   * Выполняет автоматические миграции SQLite (если схема изменилась).
   * Сохраняет существующую базу данных и пользовательские настройки.
   * Перезапускает сервис.
3. `scripts/uninstall.sh`:
   * Запрашивает подтверждение, нужно ли сохранить базу данных `/var/lib/defender-eye/defender.db`.
   * Останавливает и удаляет systemd-сервис.
   * Удаляет бинарник и файлы приложения.

---

## 7. Этапы реализации (Roadmap)

1. **Phase 1: Research** (Завершено данным документом) — анализ протокола Open Defender, определение модели данных и ограничений.
2. **Phase 2: Project Skeleton & Git** — инициализация структуры репозитория, настройка Git и доступа.
3. **Phase 3: Event Model & Open Defender Adapter** — нормализатор событий, криптографический адаптер WebSocket и Local Ingestion API.
4. **Phase 4: SQLite Database & Retention** — репозиторий SQLite, автосоздание таблиц, индексы, очистка по retention.
5. **Phase 5: Backend Core & Realtime** — HTTP сервер на Go, API эндпоинты, SSE/WebSocket поток, фоновый сборщик системных метрик хоста.
6. **Phase 6: Frontend Development** — React-интерфейс в стиле 3X-UI со всеми вкладками (Dashboard, Events, IPs, Blocks, Threat Map, SSH, Ports, System, Settings).
7. **Phase 7: Offline GeoIP & Offline Threat Map** — интеграция MMDB и автономный рендеринг карты атак без внешних сетевых сервисов.
8. **Phase 8: Deployment & Scripts** — создание systemd-сервиса, скриптов `install.sh`, `update.sh`, `uninstall.sh`.
9. **Phase 9: Testing & Verification** — проверка сборки под Linux/amd64/arm64, тесты нормализации, проверка потребления ресурсов на 1 CPU / 2 GB RAM.
10. **Phase 10: Documentation & GitHub** — финальная документация (`README.md`, `docs/*`), коммит и пуш в GitHub.
