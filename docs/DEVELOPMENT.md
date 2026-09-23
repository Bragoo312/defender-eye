# Руководство разработчика Defender Eye

В этом документе приведены инструкции по разработке, тестированию и сборке **Defender Eye**.

---

## Архитектура проекта

```
defender-eye/
├── bin/                       # Скомпилированные бинарники (Windows, Linux amd64/arm64)
├── cmd/defender-eye/          # Точка входа main.go, разбор CLI флагов, старт сервисов
├── configs/                   # Шаблоны конфигурационных файлов (YAML)
├── docs/                      # Архитектурная и эксплуатационная документация
├── frontend/                  # React 19 + TypeScript + Vite + Tailwind CSS v4
│   ├── src/
│   │   ├── api/               # Клиент API и Server-Sent Events (SSE)
│   │   ├── components/        # UI компоненты (Sidebar, Header, ThreatMap, Modals)
│   │   │   └── tabs/          # 9 основных вкладок дашборда
│   │   └── types/             # TypeScript контракты моделей данных
├── internal/
│   ├── api/                   # REST API, SSE брокер, CORS, WebSocket
│   ├── config/                # Загрузчик и валидатор конфигурации YAML
│   ├── database/              # SQLite репозиторий (pure Go modernc.org/sqlite, WAL)
│   ├── geoip/                 # MaxMind MMDB резолвер без внешних HTTP-запросов
│   ├── model/                 # Нормализованные структуры инцидентов и метрик
│   ├── normalizer/            # Парсер сигнатур алертов Open Defender
│   ├── opendedefender/        # E2EE WebSocket сервер (RSA-OAEP + AES-256-GCM)
│   ├── simulator/             # Реалистичный мультивекторный генератор атак
│   ├── system/                # Сборщик метрик /proc (CPU, RAM, Swap, Disk, Net)
│   └── web/                   # Встраивание статики React SPA (//go:embed all:dist)
└── scripts/                   # Скрипты развертывания и управления (systemd)
```

---

## Требования для локальной разработки

1. **Go:** версия `1.22+` (рекомендуется Go 1.24 / 1.27)
2. **Node.js:** версия `v20+` (рекомендуется Node v22 / v24) и `npm`

---

## Запуск в режиме разработки

### 1. Запуск Go бэкенда
```bash
go run ./cmd/defender-eye --demo --config configs/config.example.yaml
```
Бэкенд запустится на `http://127.0.0.1:8080`.

### 2. Запуск фронтенда с Hot Module Replacement (HMR)
```bash
cd frontend
npm install
npm run dev
```
Фронтенд запустится на `http://localhost:5173` и будет автоматически проксировать вызовы `/api` и `/ws` на `http://127.0.0.1:8080`.

---

## Запуск юнит-тестов

```bash
# Запуск всех тестов в Go
go test -v ./...

# Тестирование конкретных модулей
go test -v ./internal/normalizer
go test -v ./internal/database
```

---

## Сборка релизных бинарных файлов

### 1. Сборка фронтенда React SPA
```bash
cd frontend
npm run build
cd ..
```
Собранные файлы автоматически попадают в `internal/web/dist/`.

### 2. Кросс-компиляция статических бинарников
Благодаря использованию pure Go SQLite (`modernc.org/sqlite`), CGO не требуется, и сборка под любые ОС и архитектуры выполняется мгновенно:

```bash
# Windows x86_64 (.exe)
go build -ldflags="-s -w" -o bin/defender-eye.exe ./cmd/defender-eye

# Linux x86_64 (amd64)
GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -ldflags="-s -w" -o bin/defender-eye-linux-amd64 ./cmd/defender-eye

# Linux ARM64 (aarch64)
GOOS=linux GOARCH=arm64 CGO_ENABLED=0 go build -ldflags="-s -w" -o bin/defender-eye-linux-arm64 ./cmd/defender-eye
```
Каждый полученный файл содержит внутри и бэкенд, и базу данных, и полноценный веб-интерфейс (Single-Binary Deployment).
