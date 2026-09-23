# Справочник конфигурации Defender Eye

Конфигурационный файл Defender Eye пишется в формате **YAML** и по умолчанию располагается по пути `/etc/defender-eye/config.yaml` (или передается ключом `--config`).

---

## Пример полного файла конфигурации

```yaml
server:
  bind_address: "127.0.0.1:8080" # Адрес и порт веб-панели и REST/SSE API
  read_timeout_sec: 60           # Таймаут чтения сетевых запросов
  write_timeout_sec: 60          # Таймаут записи ответов

database:
  path: "/var/lib/defender-eye/defender.db" # Путь к файлу SQLite базы
  wal_mode: true                            # Write-Ahead Logging (высокая скорость)
  busy_timeout_ms: 5000                     # Ожидание при одновременной записи
  retention_days: 30                        # Срок хранения событий атак (в днях)

geoip:
  enabled: true
  db_path: "/usr/share/defender-eye/geoip/GeoLite2-City.mmdb" # Локальный файл MaxMind

open_defender:
  enabled: true
  ws_endpoint: "/ws/agent"        # Эндпоинт входящего WebSocket подключения агента
  private_key_path: ""            # Путь к приватному RSA ключу (если пустой — генерируется автоматически)
  auth_token: "DEFENDER_EYE_TOKEN_ABC123" # Токен авторизации агента
  default_ban_seconds: 3600       # Время бана по умолчанию (1 час)

metrics:
  collection_interval_sec: 5     # Интервал опроса /proc (CPU, RAM, Disk, LoadAvg)
  history_limit: 100             # Количество срезов телеметрии в оперативной памяти

simulator:
  enabled: false                 # Демо-режим симулятора атак (в продакшене отключать)
  intensity: "medium"            # Интенсивность: low (каждые 8с), medium (3с), high (1с)
```

---

## Подробное описание секций

### Секция `server`
* `bind_address`: По умолчанию установлен в `127.0.0.1:8080`. Для безопасного продакшена **крайне не рекомендуется** открывать адрес `0.0.0.0:8080` без настройки Nginx/Caddy с TLS-сертификатом и базовой авторизацией.
* `read_timeout_sec` / `write_timeout_sec`: Защита от зависших соединений (Slowloris).

### Секция `database`
* `path`: Путь к файлу базы. SQLite работает в режиме pure Go (без необходимости GCC/CGO на сервере).
* `wal_mode`: Режим Write-Ahead Logging позволяет одновременно читать аналитику в браузере и непрерывно записывать новые алерты с брандмауэра без блокировок.
* `retention_days`: Количество дней, после которых старые записи автоматически очищаются фоновым сборщиком мусора каждые 6 часов.
  - `7 дней` — размер базы около 5–10 МБ.
  - `30 дней` — рекомендуемый оптимум (~30–50 МБ).
  - `90 дней` — расширенная история (~150 МБ).

### Секция `geoip`
* `enabled`: Включает офлайн-резолвер MaxMind MMDB.
* `db_path`: Путь к локальному бинарному файлу базы данных `GeoLite2-City.mmdb` или `GeoLite2-Country.mmdb`.
* **Принцип приватности:** Defender Eye никогда не делает HTTP-запросов к внешним геолокационным API (ip-api.com, ipinfo.io). Если файл базы отсутствует, система автоматически переходит в мягкий fallback-режим, сохраняя события с меткой `Не определена`.

### Секция `open_defender`
* `enabled`: Активирует E2EE WebSocket сервер для приема входящих подключений от агента Open Defender.
* `ws_endpoint`: Сетевой путь для WebSocket рукопожатия. Поддерживаются оба алиаса: `/ws/agent` и `/ws/collector`.
* `private_key_path` / `public_key_path`: Пути к RSA-2048 ключам. Если файлов нет, Defender Eye автоматически сгенерирует их.
* **Привязка к агенту Open Defender (`/etc/open-defender/config.yaml`):**
  ```yaml
  exporter:
    enabled: true
    endpoint_address: "ws://127.0.0.1:8080/ws/agent"  # или /ws/collector
    user_id: "admin"
    config_id: "server-01"
    endpoint_rsa_public_key: "<ПУБЛИЧНЫЙ_КЛЮЧ_ИЗ_НАСТРОЕК_DEFENDER_EYE>"
  ```

### Секция `metrics`
* `collection_interval_sec`: Периодичность опроса подсистем `/proc/stat`, `/proc/meminfo`, `/proc/loadavg` и `/proc/net/dev`.
* Потребление ресурсов сборщиком телеметрии: менее 0.1% CPU на 1 ядре.

### Секция `simulator`
* `enabled`: Включает/выключает генератор реалистичных атак (SSH Brute-force, сканирование портов, зондирование Nginx/Apache, подбор паролей PostgreSQL/MySQL, блокировки nftables).
* Полезно для ознакомления и тестирования интерфейса. Управляется также кнопкой в правом верхнем углу панели управления.
