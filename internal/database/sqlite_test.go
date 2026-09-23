package database

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/Bragoo312/defender-eye/internal/model"
)

func TestSQLiteDatabase(t *testing.T) {
	tempDir := t.TempDir()
	dbPath := filepath.Join(tempDir, "test_defender.db")

	db, err := Open(dbPath)
	if err != nil {
		t.Fatalf("failed to open database: %v", err)
	}
	defer db.Close()

	// 1. Save an event
	now := time.Now().UTC()
	event := model.SecurityEvent{
		EventID:     "test-ev-1",
		Timestamp:   now,
		Source:      "open_defender",
		Monitor:     "ssh_monitor",
		EventType:   "ssh_brute",
		Severity:    model.SeverityHigh,
		SourceIP:    "203.0.113.19",
		DestPort:    22,
		Protocol:    "tcp",
		Action:      model.ActionAlerted,
		Service:     "ssh",
		Message:     "ssh_monitor -> 5 failed attempts",
		CountryCode: "US",
		CountryName: "United States",
		City:        "New York",
		Latitude:    40.7128,
		Longitude:   -74.0060,
	}

	if err := db.SaveEvent(event, 900); err != nil {
		t.Fatalf("failed to save event: %v", err)
	}

	// 2. Query event
	events, total, err := db.GetEvents(10, 0, EventFilters{})
	if err != nil {
		t.Fatalf("failed to get events: %v", err)
	}
	if total != 1 || len(events) != 1 {
		t.Fatalf("expected 1 event, got total=%d len=%d", total, len(events))
	}
	if events[0].EventID != "test-ev-1" {
		t.Fatalf("expected event_id test-ev-1, got %s", events[0].EventID)
	}

	// 3. Verify IP was automatically upserted
	ips, totalIPs, err := db.GetIPs(10, 0, "")
	if err != nil {
		t.Fatalf("failed to get ips: %v", err)
	}
	if totalIPs != 1 || len(ips) != 1 {
		t.Fatalf("expected 1 ip, got total=%d len=%d", totalIPs, len(ips))
	}
	if ips[0].IP != "203.0.113.19" || ips[0].CountryCode != "US" {
		t.Fatalf("unexpected ip record: %+v", ips[0])
	}

	// 4. Save a block event
	blockEvent := model.SecurityEvent{
		EventID:     "test-block-1",
		Timestamp:   now,
		Source:      "open_defender",
		Monitor:     "ip_ban",
		EventType:   "ip_ban",
		Severity:    model.SeverityCritical,
		SourceIP:    "203.0.113.19",
		Action:      model.ActionBlocked,
		Service:     "firewall",
		Message:     "ip_ban -> banned via iptables",
		CountryCode: "US",
		CountryName: "United States",
	}

	if err := db.SaveEvent(blockEvent, 900); err != nil {
		t.Fatalf("failed to save block event: %v", err)
	}

	// 5. Query blocks
	blocks, totalBlocks, err := db.GetBlocks(10, 0, "active")
	if err != nil {
		t.Fatalf("failed to get blocks: %v", err)
	}
	if totalBlocks != 1 || len(blocks) != 1 {
		t.Fatalf("expected 1 active block, got total=%d len=%d", totalBlocks, len(blocks))
	}
	if blocks[0].IP != "203.0.113.19" {
		t.Fatalf("expected block for 203.0.113.19, got %s", blocks[0].IP)
	}

	// 6. Test Stats
	stats, err := db.GetStats()
	if err != nil {
		t.Fatalf("failed to get stats: %v", err)
	}
	if stats.EventsTotal24h != 2 {
		t.Fatalf("expected 2 events in 24h, got %d", stats.EventsTotal24h)
	}
	if stats.BlockedIPsActive != 1 {
		t.Fatalf("expected 1 active blocked IP, got %d", stats.BlockedIPsActive)
	}

	// 7. Test Retention
	if err := db.ApplyRetention(30); err != nil {
		t.Fatalf("retention failed: %v", err)
	}

	_ = os.Remove(dbPath)
}
