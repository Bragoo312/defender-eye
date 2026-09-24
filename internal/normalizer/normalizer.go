package normalizer

import (
	"crypto/rand"
	"encoding/hex"
	"strings"
	"time"

	"github.com/Bragoo312/defender-eye/internal/geoip"
	"github.com/Bragoo312/defender-eye/internal/model"
	"github.com/Bragoo312/defender-eye/internal/system"
)

type Normalizer struct {
	resolver *geoip.Resolver
}

func NewNormalizer(resolver *geoip.Resolver) *Normalizer {
	return &Normalizer{
		resolver: resolver,
	}
}

// IngestEventInput represents an incoming raw event from HTTP or collector
type IngestEventInput struct {
	Timestamp   *time.Time             `json:"timestamp,omitempty"`
	HappenedAt  string                 `json:"happened_at,omitempty"`
	Source      string                 `json:"source"`
	Monitor     string                 `json:"monitor,omitempty"`
	IP          string                 `json:"ip"`
	Message     string                 `json:"message"`
	Severity    string                 `json:"severity,omitempty"`
	Action      string                 `json:"action,omitempty"`
	DestPort    int                    `json:"dest_port,omitempty"`
	Username    string                 `json:"username,omitempty"`
	Details     map[string]interface{} `json:"details,omitempty"`
}

func (n *Normalizer) Normalize(in IngestEventInput) model.SecurityEvent {
	event := model.SecurityEvent{
		EventID:  generateEventID(),
		Source:   in.Source,
		Monitor:  in.Monitor,
		SourceIP: strings.TrimSpace(in.IP),
		Message:  in.Message,
		Action:   in.Action,
		Username: in.Username,
		DestPort: in.DestPort,
	}

	// 1. Resolve Timestamp
	if in.Timestamp != nil {
		event.Timestamp = *in.Timestamp
	} else if in.HappenedAt != "" {
		if t, err := time.Parse(time.RFC3339, in.HappenedAt); err == nil {
			event.Timestamp = t
		} else {
			event.Timestamp = time.Now().UTC()
		}
	} else {
		event.Timestamp = time.Now().UTC()
	}

	// If source is open_defender and monitor was placed in source field
	if event.Monitor == "" {
		event.Monitor = in.Source
	}

	// 2. Classify Event Type, Service, Default Ports, Severity & Action
	switch event.Monitor {
	case "ssh_monitor":
		event.EventType = "ssh_brute"
		event.Service = "ssh"
		if event.DestPort == 0 {
			event.DestPort = system.GetSSHPort()
		}
		event.Protocol = "tcp"
		event.Severity = model.SeverityHigh
		if event.Action == "" {
			event.Action = model.ActionAlerted
		}

	case "web_brute_monitor":
		event.EventType = "web_brute"
		event.Service = "http"
		if event.DestPort == 0 {
			event.DestPort = 80
		}
		event.Protocol = "tcp"
		event.Severity = model.SeverityHigh
		if event.Action == "" {
			event.Action = model.ActionAlerted
		}

	case "web_recon_monitor":
		event.EventType = "web_recon"
		event.Service = "http"
		if event.DestPort == 0 {
			event.DestPort = 80
		}
		event.Protocol = "tcp"
		event.Severity = model.SeverityMedium
		if event.Action == "" {
			event.Action = model.ActionAlerted
		}

	case "database_monitor":
		event.EventType = "db_brute"
		event.Service = "database"
		if event.DestPort == 0 {
			event.DestPort = 5432
		}
		event.Protocol = "tcp"
		event.Severity = model.SeverityHigh
		if event.Action == "" {
			event.Action = model.ActionAlerted
		}

	case "network_antirecon":
		event.EventType = "port_scan"
		event.Service = "network"
		event.Protocol = "tcp"
		event.Severity = model.SeverityMedium
		if event.Action == "" {
			event.Action = model.ActionAlerted
		}

	case "resource_monitor":
		event.EventType = "resource_overload"
		event.Service = "system"
		event.Protocol = ""
		if in.Severity != "" {
			event.Severity = in.Severity
		} else {
			event.Severity = model.SeverityMedium
		}
		if event.Action == "" {
			event.Action = model.ActionAlerted
		}

	case "ip_ban":
		event.EventType = "ip_ban"
		event.Service = "firewall"
		event.Protocol = "all"
		event.Severity = model.SeverityCritical
		event.Action = model.ActionBlocked

	default:
		event.EventType = "custom_alert"
		if event.Service == "" {
			event.Service = "security"
		}
		if event.Severity == "" {
			event.Severity = model.SeverityMedium
		}
		if event.Action == "" {
			event.Action = model.ActionAlerted
		}
	}

	// 3. Resolve GeoIP if SourceIP is present
	if event.SourceIP != "" && n.resolver != nil {
		loc := n.resolver.Lookup(event.SourceIP)
		event.CountryCode = loc.CountryCode
		event.CountryName = loc.CountryName
		event.City = loc.City
		event.Latitude = loc.Latitude
		event.Longitude = loc.Longitude
		event.ASN = loc.ASN
		event.ASOrg = loc.ASOrg
	}

	return event
}

func generateEventID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
