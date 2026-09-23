package normalizer

import (
	"testing"
	"time"

	"github.com/Bragoo312/defender-eye/internal/model"
)

func TestNormalizer(t *testing.T) {
	n := NewNormalizer(nil)

	// Test SSH brute force normalization
	sshInput := IngestEventInput{
		Source:     "open_defender",
		Monitor:    "ssh_monitor",
		IP:         "192.0.2.1",
		Message:    "ssh_monitor -> found offender ip 192.0.2.1 (5 failed attempts)",
		HappenedAt: "2026-09-23T12:00:00Z",
	}
	ev := n.Normalize(sshInput)

	if ev.EventType != "ssh_brute" {
		t.Fatalf("expected event_type ssh_brute, got %s", ev.EventType)
	}
	if ev.DestPort != 22 {
		t.Fatalf("expected dest_port 22, got %d", ev.DestPort)
	}
	if ev.Severity != model.SeverityHigh {
		t.Fatalf("expected severity high, got %s", ev.Severity)
	}
	if ev.Action != model.ActionAlerted {
		t.Fatalf("expected action alerted, got %s", ev.Action)
	}
	if ev.Username != "" {
		t.Fatalf("expected empty username (never invent data), got %s", ev.Username)
	}

	// Test IP Ban normalization
	banInput := IngestEventInput{
		Source:  "open_defender",
		Monitor: "ip_ban",
		IP:      "198.51.100.42",
		Message: "ip_ban -> banned via iptables",
	}
	banEv := n.Normalize(banInput)
	if banEv.EventType != "ip_ban" {
		t.Fatalf("expected event_type ip_ban, got %s", banEv.EventType)
	}
	if banEv.Severity != model.SeverityCritical {
		t.Fatalf("expected severity critical, got %s", banEv.Severity)
	}
	if banEv.Action != model.ActionBlocked {
		t.Fatalf("expected action blocked, got %s", banEv.Action)
	}
}

func TestNormalizerCustomTime(t *testing.T) {
	n := NewNormalizer(nil)
	customTime := time.Date(2026, 1, 15, 10, 0, 0, 0, time.UTC)
	ev := n.Normalize(IngestEventInput{
		Source:    "custom",
		Timestamp: &customTime,
		IP:        "10.0.0.1",
		Message:   "test",
	})
	if !ev.Timestamp.Equal(customTime) {
		t.Fatalf("expected timestamp %v, got %v", customTime, ev.Timestamp)
	}
}
