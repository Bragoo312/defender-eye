package geoip

import (
	"log"
	"net"
	"os"
	"sync"

	"github.com/oschwald/geoip2-golang"
)

type Location struct {
	CountryCode string
	CountryName string
	City        string
	Latitude    float64
	Longitude   float64
	ASN         uint
	ASOrg       string
}

type Resolver struct {
	mu     sync.RWMutex
	dbCity *geoip2.Reader
	dbASN  *geoip2.Reader
	active bool
}

func NewResolver(mmdbPath string) *Resolver {
	r := &Resolver{}

	if mmdbPath == "" {
		return r
	}

	if _, err := os.Stat(mmdbPath); os.IsNotExist(err) {
		log.Printf("[GeoIP] MMDB database not found at %s. Geolocation will be skipped (fallback mode).", mmdbPath)
		return r
	}

	db, err := geoip2.Open(mmdbPath)
	if err != nil {
		log.Printf("[GeoIP] Warning: failed to open MMDB at %s: %v", mmdbPath, err)
		return r
	}

	r.dbCity = db
	r.active = true
	log.Printf("[GeoIP] Successfully loaded offline GeoIP database from %s", mmdbPath)
	return r
}

func (r *Resolver) Close() {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.dbCity != nil {
		_ = r.dbCity.Close()
	}
	if r.dbASN != nil {
		_ = r.dbASN.Close()
	}
	r.active = false
}

func (r *Resolver) Reload(mmdbPath string) error {
	db, err := geoip2.Open(mmdbPath)
	if err != nil {
		return err
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	if r.dbCity != nil {
		_ = r.dbCity.Close()
	}
	r.dbCity = db
	r.active = true
	log.Printf("[GeoIP] Successfully reloaded offline GeoIP database from %s", mmdbPath)
	return nil
}

func (r *Resolver) IsActive() bool {
	if r == nil {
		return false
	}
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.active
}

func (r *Resolver) Lookup(ipStr string) Location {
	loc := Location{
		CountryCode: "XX",
		CountryName: "Unknown",
	}

	ip := net.ParseIP(ipStr)
	if ip == nil {
		return loc
	}

	// Check for private / loopback IPs
	if ip.IsLoopback() || ip.IsPrivate() {
		loc.CountryCode = "LAN"
		loc.CountryName = "Local Network"
		loc.City = "Internal"
		return loc
	}

	r.mu.RLock()
	defer r.mu.RUnlock()

	if !r.active || r.dbCity == nil {
		return loc
	}

	record, err := r.dbCity.City(ip)
	if err == nil && record != nil {
		if record.Country.IsoCode != "" {
			loc.CountryCode = record.Country.IsoCode
			loc.CountryName = record.Country.Names["en"]
			if loc.CountryName == "" {
				loc.CountryName = record.Country.Names["ru"]
			}
		}
		if record.City.Names != nil {
			loc.City = record.City.Names["en"]
		}
		loc.Latitude = record.Location.Latitude
		loc.Longitude = record.Location.Longitude
	}

	return loc
}
