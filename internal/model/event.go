package model

import "time"

// Severity levels
const (
	SeverityInfo     = "info"
	SeverityLow      = "low"
	SeverityMedium   = "medium"
	SeverityHigh     = "high"
	SeverityCritical = "critical"
)

// Actions
const (
	ActionBlocked = "blocked"
	ActionAlerted = "alerted"
	ActionLogged  = "logged"
)

// SecurityEvent represents the internal normalized event structure
type SecurityEvent struct {
	ID          int64     `json:"id"`
	EventID     string    `json:"event_id"`
	Timestamp   time.Time `json:"timestamp"`
	Source      string    `json:"source"`
	Monitor     string    `json:"monitor"`
	EventType   string    `json:"event_type"`
	Severity    string    `json:"severity"`
	SourceIP    string    `json:"source_ip"`
	SourcePort  int       `json:"source_port"`
	DestPort    int       `json:"dest_port"`
	Protocol    string    `json:"protocol"`
	Action      string    `json:"action"`
	Service     string    `json:"service"`
	Username    string    `json:"username,omitempty"`
	Message     string    `json:"message"`
	CountryCode string    `json:"country_code"`
	CountryName string    `json:"country_name"`
	City        string    `json:"city"`
	Latitude    float64   `json:"latitude"`
	Longitude   float64   `json:"longitude"`
	ASN         uint      `json:"asn"`
	ASOrg       string    `json:"as_org"`
	RawData     string    `json:"raw_data,omitempty"`
}

// IPInfo represents aggregated telemetry and profile for an IP
type IPInfo struct {
	IP          string    `json:"ip"`
	CountryCode string    `json:"country_code"`
	CountryName string    `json:"country_name"`
	City        string    `json:"city"`
	Latitude    float64   `json:"latitude"`
	Longitude   float64   `json:"longitude"`
	ASN         uint      `json:"asn"`
	ASOrg       string    `json:"as_org"`
	FirstSeen   time.Time `json:"first_seen"`
	LastSeen    time.Time `json:"last_seen"`
	TotalEvents int       `json:"total_events"`
	IsBanned    bool      `json:"is_banned"`
	LastAction  string    `json:"last_action"`
}

// BlockInfo represents a banned IP entry and its lifecycle
type BlockInfo struct {
	ID         int64     `json:"id"`
	IP         string    `json:"ip"`
	BannedAt   time.Time `json:"banned_at"`
	ExpiresAt  time.Time `json:"expires_at"`
	BanSeconds int       `json:"ban_seconds"`
	Reason     string    `json:"reason"`
	Monitor    string    `json:"monitor"`
	Status     string    `json:"status"` // "active", "expired", "unbanned"
}

// SystemMetric records host performance counters
type SystemMetric struct {
	ID            int64     `json:"id"`
	Timestamp     time.Time `json:"timestamp"`
	CPUPercent    float64   `json:"cpu_percent"`
	RAMUsedBytes  uint64    `json:"ram_used_bytes"`
	RAMTotalBytes uint64    `json:"ram_total_bytes"`
	SwapUsedBytes uint64    `json:"swap_used_bytes"`
	SwapTotalBytes uint64   `json:"swap_total_bytes"`
	DiskUsedBytes uint64    `json:"disk_used_bytes"`
	DiskTotalBytes uint64   `json:"disk_total_bytes"`
	LoadAvg1      float64   `json:"load_avg_1"`
	LoadAvg5      float64   `json:"load_avg_5"`
	LoadAvg15     float64   `json:"load_avg_15"`
	NetRxBytesSec float64   `json:"net_rx_bytes_sec"`
	NetTxBytesSec float64   `json:"net_tx_bytes_sec"`
}

// CountryStat aggregates attack numbers per country
type CountryStat struct {
	CountryCode string `json:"country_code"`
	CountryName string `json:"country_name"`
	Count       int    `json:"count"`
	Percentage  float64 `json:"percentage"`
}

// PortStat aggregates attacks by target port
type PortStat struct {
	Port    int    `json:"port"`
	Service string `json:"service"`
	Count   int    `json:"count"`
}

// DashboardStats holds KPI and overview summaries for the dashboard
type DashboardStats struct {
	EventsTotal24h   int             `json:"events_total_24h"`
	EventsTotal7d    int             `json:"events_total_7d"`
	UniqueIPs24h     int             `json:"unique_ips_24h"`
	BlockedIPsActive int             `json:"blocked_ips_active"`
	TotalBlocks      int             `json:"total_blocks"`
	TopCountries     []CountryStat   `json:"top_countries"`
	TopPorts         []PortStat      `json:"top_ports"`
	RecentEvents     []SecurityEvent `json:"recent_events"`
	RecentBlocks     []BlockInfo     `json:"recent_blocks"`
	CurrentSystem    SystemMetric    `json:"current_system"`
}

// ListeningPort represents an active open network socket on the server with security audit details
type ListeningPort struct {
	Port           int    `json:"port"`
	Protocol       string `json:"protocol"`       // "tcp", "tcp6", "udp"
	BindAddress    string `json:"bind_address"`   // "0.0.0.0", "127.0.0.1", "::", "::1"
	Service        string `json:"service"`        // "SSH", "Redis", "HTTP", etc.
	ProcessName    string `json:"process_name"`   // "sshd", "redis-server", etc.
	RiskLevel      string `json:"risk_level"`     // "critical", "high", "medium", "safe", "info"
	Recommendation string `json:"recommendation"` // Expert advice on why & how to secure
}
