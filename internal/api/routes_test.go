package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Bragoo312/defender-eye/internal/config"
	"github.com/Bragoo312/defender-eye/internal/geoip"
)

func TestHandleGeoIPStatus(t *testing.T) {
	cfg := &config.Config{
		GeoIP: config.GeoIPConfig{
			MMDBPath: "nonexistent.mmdb",
			Enabled:  true,
		},
	}
	resolver := geoip.NewResolver("")
	server := NewServer(cfg, nil, nil, nil, NewHub(), nil, "test-key", resolver, nil)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/geoip/status", nil)
	rr := httptest.NewRecorder()

	server.handleGeoIPStatus(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", rr.Code)
	}

	var status map[string]interface{}
	if err := json.NewDecoder(rr.Body).Decode(&status); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if status["enabled"] != true {
		t.Errorf("expected enabled=true, got %v", status["enabled"])
	}
	if status["active"] != false {
		t.Errorf("expected active=false for nonexistent mmdb, got %v", status["active"])
	}
}

func TestHandleHealth(t *testing.T) {
	server := NewServer(&config.Config{}, nil, nil, nil, NewHub(), nil, "", nil, nil)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/health", nil)
	rr := httptest.NewRecorder()

	server.handleHealth(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", rr.Code)
	}

	var res map[string]interface{}
	if err := json.NewDecoder(rr.Body).Decode(&res); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if res["status"] != "ok" {
		t.Errorf("expected status 'ok', got %v", res["status"])
	}
}
