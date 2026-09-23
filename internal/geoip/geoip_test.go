package geoip

import (
	"testing"
)

func TestResolver_FallbackAndLAN(t *testing.T) {
	r := NewResolver("")
	if r.IsActive() {
		t.Errorf("expected resolver with empty path to be inactive")
	}

	// Test private/loopback IP handling
	loc := r.Lookup("127.0.0.1")
	if loc.CountryCode != "LAN" {
		t.Errorf("expected LAN country code for loopback, got %s", loc.CountryCode)
	}

	locPrivate := r.Lookup("192.168.1.50")
	if locPrivate.CountryCode != "LAN" {
		t.Errorf("expected LAN for private IP, got %s", locPrivate.CountryCode)
	}

	// Test public IP when inactive
	locPublic := r.Lookup("8.8.8.8")
	if locPublic.CountryCode != "XX" {
		t.Errorf("expected XX for public IP with no DB, got %s", locPublic.CountryCode)
	}

	// Test invalid IP string
	locInvalid := r.Lookup("not-an-ip")
	if locInvalid.CountryCode != "XX" {
		t.Errorf("expected XX for invalid IP, got %s", locInvalid.CountryCode)
	}

	// Test reload invalid file
	err := r.Reload("non_existent_file_xyz.mmdb")
	if err == nil {
		t.Errorf("expected error when reloading nonexistent MMDB file")
	}

	r.Close()
	if r.IsActive() {
		t.Errorf("expected resolver to be inactive after Close()")
	}
}
