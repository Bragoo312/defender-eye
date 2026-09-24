# 👁️ Defender Eye v1.3.2

<div align="center">

![Defender Eye SOC](https://img.shields.io/badge/Security_SOC-Defender_Eye_v1.3.2-06b6d4?style=for-the-badge&logo=shield)
[![Designed for Open Defender](https://img.shields.io/badge/Designed_for-Open_Defender-7c3aed?style=for-the-badge&logo=shield)](https://github.com/fridalif/open-defender)
![Go](https://img.shields.io/badge/Go-1.24+-00ADD8?style=for-the-badge&logo=go)
![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react)
![Tailwind](https://img.shields.io/badge/Tailwind_CSS-v4-38B2AC?style=for-the-badge&logo=tailwind-css)
![SQLite](https://img.shields.io/badge/SQLite-WAL_Mode-003B57?style=for-the-badge&logo=sqlite)
![VPS Budget](https://img.shields.io/badge/Resource_Footprint-1_CPU_%2F_2_GB_RAM-10b981?style=for-the-badge)

<p align="center">
  <b>Ультралегкий self-hosted центр мониторинга безопасности сервера (Security SOC Dashboard), аудит открытых портов, Zero-Touch авто-связка и E2EE WebSocket-коллектор для Open Defender.</b>
</p>

[Установка](#-быстрый-старт) • [Zero-Touch](#-zero-touch-setup) • [Архитектура](#-архитектура-и-принципы) • [Возможности](#-ключевые-возможности) • [Документация](#-документация) • [SSH-Туннель](#-безопасный-доступ)

</div>

---

> [!NOTE]
> ### 🛡️ Веб-панель и центр управления для [Open Defender](https://github.com/fridalif/open-defender)
> **Defender Eye** создана как автономный графический интерфейс и монитор безопасности для открытой системы защиты **[Open Defender](https://github.com/fridalif/open-defender)** (eBPF & SSH Intrusion Prevention System). Панель принимает события по зашифрованному сквозному каналу (E2EE), визуализирует кибератаки на интерактивной карте в реальном времени, проводит аудит открытых портов хоста и позволяет управлять блокировками в один клик.

---

## 📌 О проекте

**Defender Eye** предназначен для превращения разрозненных логов и системных алертов в наглядный **киберпанельный дашборд**, визуально вдохновленный интерфейсом **3X-UI**:

* 🌘 **Глубокий темный SOC-интерфейс** с неоновыми акцентами, карточками KPI и радарной сеткой.
* ⚡ **Realtime-поток инцидентов** на базе Server-Sent Events (SSE) с мгновенной отрисовкой атак.
* 🌐 **100% автономная векторная карта атак** на HTML5 Canvas с неоновыми пунктирными границами государств и лазерными траекториями (без обращений к внешним сервисам вроде Google Maps или OpenStreetMap).
* 🔓 **Аудит активных открытых портов (Live Port Security Engine):** сканирование `/proc/net/tcp`, оценка привязки к `0.0.0.0` vs `127.0.0.1`, категории риска (`CRITICAL`, `HIGH`, `MEDIUM`, `SAFE`) и точные инструкции "Почему открыт и как заблокировать".
* 🛠️ **Автоматический eBPF Auto-Patcher:** встроенный в Настройки инструмент исправления порядка байт (endianness) сетевого монитора Open Defender (поддержка готовых бинарников v1.3.1+ и исходного C-кода).
* 🛡️ **Панель быстрой блокировки IP:** мгновенный перманентный или временный (1ч/24ч) бан, разбан и внесение в белый список из карточки IP с вещанием на агенты через E2EE WebSocket.
* 🚀 **Единый статический бинарник:** веб-панель React 19 полностью скомпилирована внутрь Go-бинарника (`//go:embed all:dist`). Для работы **не нужны Docker, Node.js, Nginx, Redis или PostgreSQL**.

---

## 🎯 Профиль ресурсов: 1 CPU / 2 GB RAM

Панель специально спроектирована для работы на самых доступных VPS-серверах:
- **Потребление RAM:** ~35–60 МБ при активном потоке атак.
- **Потребление CPU:** < 0.5% (чтение `/proc` и быстрые срезы SQLite).
- **Настройка телеметрии:** настраиваемый интервал опроса (1s, 2s, 3s, 5s, 10s) под задачи администратора.
- **Диск:** база данных SQLite с режимом WAL и автоматической ротацией старых записей. Точный подсчет дискового пространства через `syscall.Statfs`.

---

## ⚡ Ключевые возможности

### 1. 📊 Оперативный центр (SOC Dashboard)
4 ключевые метрики (Атаки 24ч, Уникальные IP, Активные баны, Аппаратная нагрузка сервера), встроенный мини-радар атак, рейтинг стран-агрессоров и интерактивный список активных блокировок с таймерами до разбана.

### 2. ⚡ Журнал событий безопасности (Events Log)
Исправленная фильтрация по уровню угрозы (`critical`, `high`, `medium`, `low`), типу действия (`blocked`, `alerted`, `logged`) и векторам атак (`ssh_brute`, `ssh_monitor`, `web_recon`, `web_brute`, `db_brute`, `port_scan`, `network_antirecon`, `resource_overload`). Клик по строке открывает модальное окно с деталями.

### 3. 🌐 Автономная карта угроз (Threat Map Cyber Radar)
Векторная визуализация на Canvas с отрисовкой неоновых границ государств (`ctx.setLineDash`), поддержкой вывода до 3000–5000 атаковавших IP и 100% выбором всей истории при клике на конкретную страну.

### 4. 🔍 Аудит открытых сетевых портов (Active Ports Audit)
Таблица текущих слушающих сокетов сервера (`/proc/net/tcp` и `/proc/net/tcp6`), привязанных сервисов (`sshd`, `nginx`, `redis-server`, `mysqld`, `postgres`, `mongod`), проверка публичного bind (0.0.0.0) и выдача рекомендаций по защите.

### 5. 🛠️ Авто-патчер eBPF модуля Open Defender
Автоматическое обнаружение установленного агента Open Defender, определение версии (v1.3.1+), проверка необходимости патча байтового порядка eBPF и применение фикса в один клик с перезапуском службы `systemctl restart open-defender`.

### 6. 🎛️ Панель управления IP в один клик
В модальном окне IP-адреса доступен блок управления: быстрый перманентный бан, бан на 1 час, бан на 24 часа, снятие блокировки и добавление в белый список с отправкой команд на открытый Open Defender WebSocket E2EE.

### 7. ⏱️ Регулируемая частота обновления телеметрии
В Настройках доступен выбор скорости обновления системных метрик CPU, RAM, Swap, диска и сети (1s, 2s, 3s, 5s, 10s).

### 8. ⚡ Zero-Touch интеграция с Open Defender (NEW v1.3.2)
* **Полная автоматизация связки:** при установке Defender Eye и Open Defender на одном сервере система автоматически находит `/etc/open-defender/config.yaml`, прописывает RSA-ключ, активирует экспорт телеметрии (`exporter: enabled: true`) и перезапускает службу.
* **Независимость от порядка установки:** фоновый демон сам обнаружит Open Defender, если тот будет установлен позже.
* **Синхронизация из UI в 1 клик:** все настройки (SSH, веб-сканеры, СУБД, белый список, eBPF) настраиваются в веб-панели и синхронизируются с конфигом на сервере без необходимости открывать терминал.

---

## 🚀 Быстрый старт

### Способ 1: Установка через готовый DEB-пакет (Ubuntu / Debian) — Рекомендуется

В разделе [**Releases**](https://github.com/Bragoo312/defender-eye/releases) доступны официальные `.deb` пакеты для архитектур `amd64` (x86_64) и `arm64`:

```bash
# 1. Скачайте пакет под вашу архитектуру:
curl -sLO https://github.com/Bragoo312/defender-eye/releases/download/v1.3.2/defender-eye_1.3.2_amd64.deb

# 2. Установите одной командой:
sudo apt install ./defender-eye_1.3.2_amd64.deb
```
*Пакет автоматически создаст системного пользователя `defender-eye`, настроит конфигурацию в `/etc/defender-eye/config.yaml`, свяжет Open Defender (Zero-Touch) и запустит службу `systemd`.*

---

### Способ 2: Установка через терминал (Git / Скрипт)

```bash
git clone https://github.com/Bragoo312/defender-eye.git /opt/defender-eye
cd /opt/defender-eye
sudo bash scripts/install.sh
```

---

## 🛡️ Права запуска (Root / Sudo)

> **Важно:** Для корректного считывания сетевых сокетов ядра (`/proc/net/tcp`), аудита процессов, точного сбора дисковой телеметрии и работы eBPF авто-патчера (`systemctl restart open-defender`) Defender Eye должен запускаться с привилегиями **`root`** или через **`sudo`**. Если на сервере учетная запись не root, запускайте бинарник через `sudo ./defender-eye` или настройте systemd-юнит с правами суперпользователя.

---

## 🔒 Безопасный доступ через SSH-Туннель

Для максимальной безопасности панель слушает только локальный интерфейс `127.0.0.1:8080`. Для безопасного подключения выполните SSH порт-форвардинг:

```bash
ssh -L 8080:127.0.0.1:8080 user@your-vps-ip
```
После этого откройте в браузере: **http://127.0.0.1:8080**.

---

## 📚 Документация

* [**ARCHITECTURE.md**](docs/ARCHITECTURE.md) — Подробное описание E2EE рукопожатия, eBPF патчера, порта аудита и SQLite WAL.
* [**CONFIGURATION.md**](docs/CONFIGURATION.md) — Настройки `config.yaml`, токены инжестирования и интеграция с Open Defender.
* [**INSTALL.md**](docs/INSTALL.md) — Инструкция по сборке из исходников и установке на Debian/Ubuntu/CentOS/Alpine.
* [**TROUBLESHOOTING.md**](docs/TROUBLESHOOTING.md) — Решение проблем с eBPF патчером, правами доступа и портами.

---

## 📜 Лицензия

Проект распространяется под лицензией MIT.
