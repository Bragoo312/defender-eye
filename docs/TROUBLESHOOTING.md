# Диагностика и устранение неполадок (Troubleshooting)

В данном руководстве собраны типовые ситуации и методы их решения при эксплуатации Defender Eye.

---

## 1. Панель не открывается в браузере

### Симптом
Браузер сообщает `ERR_CONNECTION_REFUSED` при попытке открыть `http://localhost:8080`.

### Причины и решение
1. **Не поднят SSH-туннель:**
   Панель по умолчанию слушает адрес `127.0.0.1` на сервере. Убедитесь, что вы запустили туннель:
   ```bash
   ssh -L 8080:127.0.0.1:8080 user@your-server-ip
   ```
2. **Служба defender-eye не запущена на сервере:**
   Проверьте статус службы:
   ```bash
   sudo systemctl status defender-eye
   ```
   Если служба остановилась, посмотрите последние строки журнала:
   ```bash
   sudo journalctl -u defender-eye -n 50 --no-pager
   ```
3. **Порт 8080 уже занят другим сервисом:**
   Проверьте, кто слушает порт 8080 на сервере:
   ```bash
   sudo ss -tulpn | grep 8080
   ```
   Если порт занят, измените `bind_address` в `/etc/defender-eye/config.yaml` (например, на `127.0.0.1:8088`), перезапустите службу и используйте порт 8088 в SSH-туннеле:
   ```bash
   ssh -L 8088:127.0.0.1:8088 user@your-server-ip
   ```

---

## 2. Агент Open Defender не передает алерты

### Симптом
В интерфейсе Defender Eye индикатор горит зеленым, но события атак не появляются в реальном времени.

### Шаги проверки:
1. **Проверьте сетевой эндпоинт в конфиге Open Defender:**
   В файле `~/open-defender/config.yaml` должно быть указано:
   ```yaml
   server:
     url: "ws://127.0.0.1:8080/ws/agent"
   ```
2. **Проверьте журналы Open Defender:**
   ```bash
   journalctl -u open-defender -n 50 --no-pager
   ```
3. **Проверьте правила брандмауэра iptables:**
   ```bash
   sudo iptables -L -n -v
   ```
4. **Тест отправки тестового алерта вручную:**
   Вы можете отправить тестовое событие через curl прямо на сервере:
   ```bash
   curl -X POST http://127.0.0.1:8080/api/v1/events \
     -H "Content-Type: application/json" \
     -d '{
       "source": "manual_test",
       "monitor": "ssh_monitor",
       "event_type": "ssh_brute",
       "severity": "high",
       "source_ip": "1.2.3.4",
       "dest_port": 22,
       "protocol": "tcp",
       "action": "blocked",
       "message": "Manual test event"
     }'
   ```
   Событие должно мгновенно отобразиться во вкладке "Обзор" и "События".

---

## 3. Страны и города отображаются как "Не определена"

### Симптом
В таблице событий вместо флага и названия страны отображается `XX` или `Не определена`.

### Причина:
Отсутствует локальный файл базы данных MaxMind MMDB (`GeoLite2-City.mmdb` или `GeoLite2-Country.mmdb`).

### Решение:
1. Поместите файл базы данных в директорию:
   ```bash
   sudo mkdir -p /usr/share/defender-eye/geoip
   sudo cp GeoLite2-City.mmdb /usr/share/defender-eye/geoip/GeoLite2-City.mmdb
   sudo chown defender-eye:defender-eye /usr/share/defender-eye/geoip/GeoLite2-City.mmdb
   ```
2. Убедитесь, что путь в `/etc/defender-eye/config.yaml` совпадает:
   ```yaml
   geoip:
     enabled: true
     db_path: "/usr/share/defender-eye/geoip/GeoLite2-City.mmdb"
   ```
3. Defender Eye автоматически загрузит базу данных без перезапуска.

---

## 4. Ошибка доступа к файлу базы данных SQLite

### Симптом
В логах ошибка `unable to open database file: permission denied` или `database is locked`.

### Решение:
1. Проверьте права владельца на директорию базы:
   ```bash
   sudo chown -R defender-eye:defender-eye /var/lib/defender-eye
   sudo chmod 750 /var/lib/defender-eye
   sudo chmod 640 /var/lib/defender-eye/defender.db*
   ```
2. SQLite работает в режиме WAL, поэтому в директории должны создаваться временные файлы `defender.db-wal` и `defender.db-shm`. Системный пользователь `defender-eye` обязан иметь право записи в родительскую директорию.
