package database

import (
	"database/sql"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/Bragoo312/defender-eye/internal/model"
	_ "modernc.org/sqlite"
)

type DB struct {
	conn *sql.DB
}

type EventFilters struct {
	Monitor     string
	Severity    string
	Action      string
	IP          string
	CountryCode string
	Search      string
}

func Open(dbPath string) (*DB, error) {
	conn, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("opening sqlite at %s: %w", dbPath, err)
	}

	// Performance pragmas for 1 CPU / 2 GB RAM server
	pragmas := []string{
		"PRAGMA journal_mode = WAL;",
		"PRAGMA synchronous = NORMAL;",
		"PRAGMA busy_timeout = 5000;",
		"PRAGMA cache_size = -2000;", // ~2MB cache
	}
	for _, pragma := range pragmas {
		if _, err := conn.Exec(pragma); err != nil {
			log.Printf("[DB] Warning pragma %s: %v", pragma, err)
		}
	}

	db := &DB{conn: conn}
	if err := db.initSchema(); err != nil {
		_ = conn.Close()
		return nil, fmt.Errorf("initializing db schema: %w", err)
	}

	return db, nil
}

func (db *DB) Close() error {
	return db.conn.Close()
}

func (db *DB) initSchema() error {
	schema := `
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
		latitude REAL DEFAULT 0,
		longitude REAL DEFAULT 0,
		asn INTEGER DEFAULT 0,
		as_org TEXT,
		raw_data TEXT
	);

	CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp DESC);
	CREATE INDEX IF NOT EXISTS idx_events_source_ip ON events(source_ip);
	CREATE INDEX IF NOT EXISTS idx_events_monitor ON events(monitor);
	CREATE INDEX IF NOT EXISTS idx_events_severity ON events(severity);

	CREATE TABLE IF NOT EXISTS ips (
		ip TEXT PRIMARY KEY,
		country_code TEXT,
		country_name TEXT,
		city TEXT,
		latitude REAL DEFAULT 0,
		longitude REAL DEFAULT 0,
		asn INTEGER DEFAULT 0,
		as_org TEXT,
		first_seen DATETIME NOT NULL,
		last_seen DATETIME NOT NULL,
		total_events INTEGER DEFAULT 1,
		is_banned INTEGER DEFAULT 0,
		last_action TEXT
	);

	CREATE INDEX IF NOT EXISTS idx_ips_last_seen ON ips(last_seen DESC);
	CREATE INDEX IF NOT EXISTS idx_ips_country ON ips(country_code);

	CREATE TABLE IF NOT EXISTS blocks (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		ip TEXT NOT NULL,
		banned_at DATETIME NOT NULL,
		expires_at DATETIME NOT NULL,
		ban_seconds INTEGER NOT NULL,
		reason TEXT NOT NULL,
		monitor TEXT NOT NULL,
		status TEXT NOT NULL
	);

	CREATE INDEX IF NOT EXISTS idx_blocks_ip ON blocks(ip);
	CREATE INDEX IF NOT EXISTS idx_blocks_expires_at ON blocks(expires_at);

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

	CREATE TABLE IF NOT EXISTS settings (
		key TEXT PRIMARY KEY,
		value TEXT NOT NULL,
		updated_at DATETIME NOT NULL
	);

	CREATE TABLE IF NOT EXISTS opendedefender_agent_configs (
		config_id TEXT PRIMARY KEY,
		payload TEXT NOT NULL,
		updated_at DATETIME NOT NULL
	);
	`

	_, err := db.conn.Exec(schema)
	return err
}

func (db *DB) SaveEvent(event model.SecurityEvent, defaultBanSeconds int) error {
	tx, err := db.conn.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	// 1. Insert Event
	insertEvent := `
	INSERT INTO events (
		event_id, timestamp, source, monitor, event_type, severity,
		source_ip, source_port, dest_port, protocol, action, service,
		username, message, country_code, country_name, city, latitude,
		longitude, asn, as_org, raw_data
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`
	res, err := tx.Exec(insertEvent,
		event.EventID, event.Timestamp.UTC(), event.Source, event.Monitor, event.EventType, event.Severity,
		event.SourceIP, event.SourcePort, event.DestPort, event.Protocol, event.Action, event.Service,
		event.Username, event.Message, event.CountryCode, event.CountryName, event.City, event.Latitude,
		event.Longitude, event.ASN, event.ASOrg, event.RawData,
	)
	if err != nil {
		return fmt.Errorf("inserting event: %w", err)
	}
	event.ID, _ = res.LastInsertId()

	// 2. Upsert IP if IP is provided
	if event.SourceIP != "" && event.SourceIP != "127.0.0.1" && event.SourceIP != "::1" {
		isBannedInt := 0
		if event.Action == model.ActionBlocked || event.Monitor == "ip_ban" {
			isBannedInt = 1
		}

		upsertIP := `
		INSERT INTO ips (
			ip, country_code, country_name, city, latitude, longitude,
			asn, as_org, first_seen, last_seen, total_events, is_banned, last_action
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
		ON CONFLICT(ip) DO UPDATE SET
			last_seen = excluded.last_seen,
			total_events = ips.total_events + 1,
			is_banned = CASE WHEN excluded.is_banned = 1 THEN 1 ELSE ips.is_banned END,
			last_action = excluded.last_action,
			country_code = COALESCE(NULLIF(excluded.country_code, ''), ips.country_code),
			city = COALESCE(NULLIF(excluded.city, ''), ips.city)
		`
		_, err = tx.Exec(upsertIP,
			event.SourceIP, event.CountryCode, event.CountryName, event.City, event.Latitude, event.Longitude,
			event.ASN, event.ASOrg, event.Timestamp.UTC(), event.Timestamp.UTC(), isBannedInt, event.Action,
		)
		if err != nil {
			return fmt.Errorf("upserting ip: %w", err)
		}

		// 3. Insert Block entry if action is blocked or ip_ban
		if isBannedInt == 1 {
			if defaultBanSeconds <= 0 {
				defaultBanSeconds = 900
			}
			expiresAt := event.Timestamp.Add(time.Duration(defaultBanSeconds) * time.Second).UTC()
			insertBlock := `
			INSERT INTO blocks (ip, banned_at, expires_at, ban_seconds, reason, monitor, status)
			VALUES (?, ?, ?, ?, ?, ?, 'active')
			`
			_, err = tx.Exec(insertBlock, event.SourceIP, event.Timestamp.UTC(), expiresAt, defaultBanSeconds, event.Message, event.Monitor)
			if err != nil {
				return fmt.Errorf("inserting block: %w", err)
			}
		}
	}

	return tx.Commit()
}

func (db *DB) GetStats() (model.DashboardStats, error) {
	var stats model.DashboardStats
	now := time.Now().UTC()
	since24h := now.Add(-24 * time.Hour)
	since7d := now.Add(-7 * 24 * time.Hour)

	// Events in 24h
	_ = db.conn.QueryRow("SELECT COUNT(*) FROM events WHERE timestamp >= ?", since24h).Scan(&stats.EventsTotal24h)
	// Events in 7d
	_ = db.conn.QueryRow("SELECT COUNT(*) FROM events WHERE timestamp >= ?", since7d).Scan(&stats.EventsTotal7d)
	// Unique IPs in 24h
	_ = db.conn.QueryRow("SELECT COUNT(DISTINCT source_ip) FROM events WHERE timestamp >= ? AND source_ip != ''", since24h).Scan(&stats.UniqueIPs24h)
	// Active blocked IPs (expires_at > now)
	_ = db.conn.QueryRow("SELECT COUNT(DISTINCT ip) FROM blocks WHERE expires_at > ? AND status = 'active'", now).Scan(&stats.BlockedIPsActive)
	// Total blocks ever
	_ = db.conn.QueryRow("SELECT COUNT(*) FROM blocks").Scan(&stats.TotalBlocks)

	// Top countries (24h)
	topCountries, err := db.GetTopCountries()
	if err == nil {
		stats.TopCountries = topCountries
	}

	// Top ports (24h)
	topPorts, err := db.GetTopPorts()
	if err == nil {
		stats.TopPorts = topPorts
	}

	// Recent events
	recentEvents, _, err := db.GetEvents(15, 0, EventFilters{})
	if err == nil {
		stats.RecentEvents = recentEvents
	}

	// Recent blocks
	recentBlocks, _, err := db.GetBlocks(10, 0, "")
	if err == nil {
		stats.RecentBlocks = recentBlocks
	}

	// Current system metric
	_ = db.conn.QueryRow(`
		SELECT id, timestamp, cpu_percent, ram_used_bytes, ram_total_bytes, swap_used_bytes,
		       swap_total_bytes, disk_used_bytes, disk_total_bytes, load_avg_1, load_avg_5,
		       load_avg_15, net_rx_bytes_sec, net_tx_bytes_sec
		FROM system_metrics ORDER BY timestamp DESC LIMIT 1
	`).Scan(
		&stats.CurrentSystem.ID, &stats.CurrentSystem.Timestamp, &stats.CurrentSystem.CPUPercent,
		&stats.CurrentSystem.RAMUsedBytes, &stats.CurrentSystem.RAMTotalBytes, &stats.CurrentSystem.SwapUsedBytes,
		&stats.CurrentSystem.SwapTotalBytes, &stats.CurrentSystem.DiskUsedBytes, &stats.CurrentSystem.DiskTotalBytes,
		&stats.CurrentSystem.LoadAvg1, &stats.CurrentSystem.LoadAvg5, &stats.CurrentSystem.LoadAvg15,
		&stats.CurrentSystem.NetRxBytesSec, &stats.CurrentSystem.NetTxBytesSec,
	)

	return stats, nil
}

func (db *DB) GetEvents(limit, offset int, filters EventFilters) ([]model.SecurityEvent, int, error) {
	if limit <= 0 {
		limit = 50
	}
	if limit > 5000 {
		limit = 5000
	}

	var where []string
	var args []interface{}

	if filters.Monitor != "" {
		where = append(where, "(monitor = ? OR event_type = ?)")
		args = append(args, filters.Monitor, filters.Monitor)
	}
	if filters.Severity != "" {
		where = append(where, "severity = ?")
		args = append(args, filters.Severity)
	}
	if filters.Action != "" {
		where = append(where, "action = ?")
		args = append(args, filters.Action)
	}
	if filters.IP != "" {
		where = append(where, "source_ip = ?")
		args = append(args, filters.IP)
	}
	if filters.CountryCode != "" {
		where = append(where, "country_code = ?")
		args = append(args, filters.CountryCode)
	}
	if filters.Search != "" {
		where = append(where, "(message LIKE ? OR source_ip LIKE ? OR country_name LIKE ? OR country_code LIKE ?)")
		searchTerm := "%" + filters.Search + "%"
		args = append(args, searchTerm, searchTerm, searchTerm, searchTerm)
	}

	whereClause := ""
	if len(where) > 0 {
		whereClause = "WHERE " + strings.Join(where, " AND ")
	}

	var total int
	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM events %s", whereClause)
	_ = db.conn.QueryRow(countQuery, args...).Scan(&total)

	query := fmt.Sprintf(`
		SELECT id, event_id, timestamp, source, monitor, event_type, severity,
		       source_ip, source_port, dest_port, protocol, action, service,
		       COALESCE(username, ''), message, COALESCE(country_code, ''),
		       COALESCE(country_name, ''), COALESCE(city, ''), latitude, longitude,
		       asn, COALESCE(as_org, '')
		FROM events %s
		ORDER BY timestamp DESC
		LIMIT ? OFFSET ?
	`, whereClause)

	args = append(args, limit, offset)
	rows, err := db.conn.Query(query, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var events []model.SecurityEvent
	for rows.Next() {
		var e model.SecurityEvent
		if err := rows.Scan(
			&e.ID, &e.EventID, &e.Timestamp, &e.Source, &e.Monitor, &e.EventType, &e.Severity,
			&e.SourceIP, &e.SourcePort, &e.DestPort, &e.Protocol, &e.Action, &e.Service,
			&e.Username, &e.Message, &e.CountryCode, &e.CountryName, &e.City, &e.Latitude,
			&e.Longitude, &e.ASN, &e.ASOrg,
		); err != nil {
			return nil, 0, err
		}
		events = append(events, e)
	}

	return events, total, nil
}

func (db *DB) GetIPs(limit, offset int, search string) ([]model.IPInfo, int, error) {
	if limit <= 0 {
		limit = 50
	}

	where := ""
	var args []interface{}
	if search != "" {
		where = "WHERE ip LIKE ? OR country_name LIKE ? OR as_org LIKE ?"
		s := "%" + search + "%"
		args = append(args, s, s, s)
	}

	var total int
	_ = db.conn.QueryRow(fmt.Sprintf("SELECT COUNT(*) FROM ips %s", where), args...).Scan(&total)

	query := fmt.Sprintf(`
		SELECT ip, COALESCE(country_code, ''), COALESCE(country_name, ''), COALESCE(city, ''),
		       latitude, longitude, asn, COALESCE(as_org, ''), first_seen, last_seen,
		       total_events, is_banned, COALESCE(last_action, '')
		FROM ips %s
		ORDER BY last_seen DESC
		LIMIT ? OFFSET ?
	`, where)

	args = append(args, limit, offset)
	rows, err := db.conn.Query(query, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var ips []model.IPInfo
	for rows.Next() {
		var ip model.IPInfo
		var isBannedInt int
		if err := rows.Scan(
			&ip.IP, &ip.CountryCode, &ip.CountryName, &ip.City,
			&ip.Latitude, &ip.Longitude, &ip.ASN, &ip.ASOrg,
			&ip.FirstSeen, &ip.LastSeen, &ip.TotalEvents, &isBannedInt, &ip.LastAction,
		); err != nil {
			return nil, 0, err
		}
		ip.IsBanned = isBannedInt == 1
		ips = append(ips, ip)
	}

	return ips, total, nil
}

func (db *DB) GetIPDetails(ipStr string) (*model.IPInfo, []model.SecurityEvent, error) {
	var ip model.IPInfo
	var isBannedInt int
	err := db.conn.QueryRow(`
		SELECT ip, COALESCE(country_code, ''), COALESCE(country_name, ''), COALESCE(city, ''),
		       latitude, longitude, asn, COALESCE(as_org, ''), first_seen, last_seen,
		       total_events, is_banned, COALESCE(last_action, '')
		FROM ips WHERE ip = ?
	`, ipStr).Scan(
		&ip.IP, &ip.CountryCode, &ip.CountryName, &ip.City,
		&ip.Latitude, &ip.Longitude, &ip.ASN, &ip.ASOrg,
		&ip.FirstSeen, &ip.LastSeen, &ip.TotalEvents, &isBannedInt, &ip.LastAction,
	)
	if err != nil {
		return nil, nil, err
	}
	ip.IsBanned = isBannedInt == 1

	events, _, err := db.GetEvents(50, 0, EventFilters{IP: ipStr})
	if err != nil {
		return &ip, nil, err
	}

	return &ip, events, nil
}

func (db *DB) GetBlocks(limit, offset int, status string) ([]model.BlockInfo, int, error) {
	if limit <= 0 {
		limit = 50
	}

	now := time.Now().UTC()
	where := ""
	var args []interface{}
	if status == "active" {
		where = "WHERE expires_at > ? AND status = 'active'"
		args = append(args, now)
	} else if status == "expired" {
		where = "WHERE expires_at <= ? OR status != 'active'"
		args = append(args, now)
	}

	var total int
	_ = db.conn.QueryRow(fmt.Sprintf("SELECT COUNT(*) FROM blocks %s", where), args...).Scan(&total)

	query := fmt.Sprintf(`
		SELECT id, ip, banned_at, expires_at, ban_seconds, reason, monitor,
		       CASE WHEN expires_at <= ? THEN 'expired' ELSE status END as current_status
		FROM blocks %s
		ORDER BY banned_at DESC
		LIMIT ? OFFSET ?
	`, where)

	callArgs := append([]interface{}{now}, args...)
	callArgs = append(callArgs, limit, offset)

	rows, err := db.conn.Query(query, callArgs...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var blocks []model.BlockInfo
	for rows.Next() {
		var b model.BlockInfo
		if err := rows.Scan(
			&b.ID, &b.IP, &b.BannedAt, &b.ExpiresAt, &b.BanSeconds, &b.Reason, &b.Monitor, &b.Status,
		); err != nil {
			return nil, 0, err
		}
		blocks = append(blocks, b)
	}

	return blocks, total, nil
}

func (db *DB) GetTopCountries() ([]model.CountryStat, error) {
	since7d := time.Now().UTC().Add(-7 * 24 * time.Hour)
	rows, err := db.conn.Query(`
		SELECT COALESCE(country_code, 'XX') as code,
		       COALESCE(country_name, 'Unknown') as name,
		       COUNT(*) as cnt
		FROM events
		WHERE timestamp >= ? AND source_ip != '' AND country_code != '' AND country_code != 'LAN'
		GROUP BY code
		ORDER BY cnt DESC
		LIMIT 10
	`, since7d)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var stats []model.CountryStat
	var totalAll int
	for rows.Next() {
		var s model.CountryStat
		if err := rows.Scan(&s.CountryCode, &s.CountryName, &s.Count); err != nil {
			return nil, err
		}
		stats = append(stats, s)
		totalAll += s.Count
	}

	for i := range stats {
		if totalAll > 0 {
			stats[i].Percentage = float64(stats[i].Count) / float64(totalAll) * 100
		}
	}

	return stats, nil
}

func (db *DB) GetTopPorts() ([]model.PortStat, error) {
	since7d := time.Now().UTC().Add(-7 * 24 * time.Hour)
	rows, err := db.conn.Query(`
		SELECT dest_port, service, COUNT(*) as cnt
		FROM events
		WHERE timestamp >= ? AND dest_port > 0
		GROUP BY dest_port, service
		ORDER BY cnt DESC
		LIMIT 10
	`, since7d)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var stats []model.PortStat
	for rows.Next() {
		var p model.PortStat
		if err := rows.Scan(&p.Port, &p.Service, &p.Count); err != nil {
			return nil, err
		}
		stats = append(stats, p)
	}

	return stats, nil
}

func (db *DB) SaveSystemMetric(m model.SystemMetric) error {
	query := `
	INSERT INTO system_metrics (
		timestamp, cpu_percent, ram_used_bytes, ram_total_bytes, swap_used_bytes,
		swap_total_bytes, disk_used_bytes, disk_total_bytes, load_avg_1, load_avg_5,
		load_avg_15, net_rx_bytes_sec, net_tx_bytes_sec
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`
	_, err := db.conn.Exec(query,
		m.Timestamp.UTC(), m.CPUPercent, m.RAMUsedBytes, m.RAMTotalBytes, m.SwapUsedBytes,
		m.SwapTotalBytes, m.DiskUsedBytes, m.DiskTotalBytes, m.LoadAvg1, m.LoadAvg5,
		m.LoadAvg15, m.NetRxBytesSec, m.NetTxBytesSec,
	)
	return err
}

func (db *DB) GetRecentMetrics(limit int) ([]model.SystemMetric, error) {
	if limit <= 0 {
		limit = 30
	}
	rows, err := db.conn.Query(`
		SELECT id, timestamp, cpu_percent, ram_used_bytes, ram_total_bytes, swap_used_bytes,
		       swap_total_bytes, disk_used_bytes, disk_total_bytes, load_avg_1, load_avg_5,
		       load_avg_15, net_rx_bytes_sec, net_tx_bytes_sec
		FROM system_metrics
		ORDER BY timestamp DESC
		LIMIT ?
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var metrics []model.SystemMetric
	for rows.Next() {
		var m model.SystemMetric
		if err := rows.Scan(
			&m.ID, &m.Timestamp, &m.CPUPercent, &m.RAMUsedBytes, &m.RAMTotalBytes, &m.SwapUsedBytes,
			&m.SwapTotalBytes, &m.DiskUsedBytes, &m.DiskTotalBytes, &m.LoadAvg1, &m.LoadAvg5,
			&m.LoadAvg15, &m.NetRxBytesSec, &m.NetTxBytesSec,
		); err != nil {
			return nil, err
		}
		metrics = append(metrics, m)
	}

	// Reverse so oldest is first for charts
	for i, j := 0, len(metrics)-1; i < j; i, j = i+1, j-1 {
		metrics[i], metrics[j] = metrics[j], metrics[i]
	}

	return metrics, nil
}

func (db *DB) ApplyRetention(days int) error {
	if days <= 0 {
		days = 30
	}
	cutoff := time.Now().UTC().AddDate(0, 0, -days)

	log.Printf("[DB] Running retention cleanup for records older than %d days (%s)...", days, cutoff.Format(time.RFC3339))

	_, err := db.conn.Exec("DELETE FROM events WHERE timestamp < ?", cutoff)
	if err != nil {
		return fmt.Errorf("deleting old events: %w", err)
	}

	_, err = db.conn.Exec("DELETE FROM system_metrics WHERE timestamp < ?", cutoff)
	if err != nil {
		return fmt.Errorf("deleting old system metrics: %w", err)
	}

	_, err = db.conn.Exec("DELETE FROM blocks WHERE expires_at < ? AND status != 'active'", cutoff)
	if err != nil {
		return fmt.Errorf("deleting old blocks: %w", err)
	}

	return nil
}

func (db *DB) SaveAgentConfig(configID string, payload string) error {
	if db == nil || db.conn == nil {
		return nil
	}
	query := `
	INSERT INTO opendedefender_agent_configs (config_id, payload, updated_at)
	VALUES (?, ?, ?)
	ON CONFLICT(config_id) DO UPDATE SET
		payload = excluded.payload,
		updated_at = excluded.updated_at;
	`
	_, err := db.conn.Exec(query, configID, payload, time.Now().UTC())
	return err
}

func (db *DB) GetAgentConfig(configID string) (string, error) {
	if db == nil || db.conn == nil {
		return "", sql.ErrNoRows
	}
	var payload string
	err := db.conn.QueryRow("SELECT payload FROM opendedefender_agent_configs WHERE config_id = ?", configID).Scan(&payload)
	return payload, err
}

func (db *DB) GetAllAgentConfigs() (map[string]string, error) {
	result := make(map[string]string)
	if db == nil || db.conn == nil {
		return result, nil
	}
	rows, err := db.conn.Query("SELECT config_id, payload FROM opendedefender_agent_configs")
	if err != nil {
		return result, err
	}
	defer rows.Close()
	for rows.Next() {
		var id, payload string
		if err := rows.Scan(&id, &payload); err == nil {
			result[id] = payload
		}
	}
	return result, nil
}

func (db *DB) SetIPBanStatus(ip string, isBanned bool, action string, banDurationSec int, reason string) error {
	if db == nil || db.conn == nil {
		return fmt.Errorf("database connection is nil")
	}

	tx, err := db.conn.Begin()
	if err != nil {
		return fmt.Errorf("begin transaction: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	isBannedInt := 0
	if isBanned {
		isBannedInt = 1
	}

	// 1. Update ips table
	_, err = tx.Exec(`UPDATE ips SET is_banned = ?, last_action = ? WHERE ip = ?`, isBannedInt, action, ip)
	if err != nil {
		return fmt.Errorf("updating ips table: %w", err)
	}

	// 2. Manage blocks table
	if isBanned {
		now := time.Now().UTC()
		var expiresAt time.Time
		if banDurationSec <= 0 {
			expiresAt = now.AddDate(100, 0, 0) // ~100 years for permanent
			banDurationSec = 3153600000
		} else {
			expiresAt = now.Add(time.Duration(banDurationSec) * time.Second)
		}

		_, err = tx.Exec(`
			INSERT INTO blocks (ip, banned_at, expires_at, ban_seconds, reason, monitor, status)
			VALUES (?, ?, ?, ?, ?, 'manual_ui', 'active')
		`, ip, now, expiresAt, banDurationSec, reason)
		if err != nil {
			return fmt.Errorf("inserting into blocks table: %w", err)
		}
	} else {
		_, err = tx.Exec(`UPDATE blocks SET status = 'unbanned' WHERE ip = ? AND status = 'active'`, ip)
		if err != nil {
			return fmt.Errorf("updating blocks status to unbanned: %w", err)
		}
	}

	return tx.Commit()
}
