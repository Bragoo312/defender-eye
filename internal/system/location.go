package system

import (
	"context"
	"io"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/Bragoo312/defender-eye/internal/geoip"
	"github.com/Bragoo312/defender-eye/internal/model"
)

var (
	cachedLocation   *model.ServerLocation
	lastLocationTime time.Time
	locationMu       sync.RWMutex
)

// DetectServerLocation discovers the server's public IP and resolves its geographic coordinates.
// Falls back to Frankfurt coordinates if offline or unresolved.
func DetectServerLocation(resolver *geoip.Resolver) model.ServerLocation {
	locationMu.RLock()
	if cachedLocation != nil && time.Since(lastLocationTime) < 10*time.Minute {
		loc := *cachedLocation
		locationMu.RUnlock()
		return loc
	}
	locationMu.RUnlock()

	locationMu.Lock()
	defer locationMu.Unlock()

	// Default fallback coordinates (Frankfurt)
	fallback := model.ServerLocation{
		IP:          "127.0.0.1",
		City:        "Frankfurt",
		CountryCode: "DE",
		CountryName: "Germany",
		Latitude:    50.1109,
		Longitude:   8.6821,
	}

	publicIP := discoverPublicIP()
	if publicIP == "" {
		cachedLocation = &fallback
		lastLocationTime = time.Now()
		return fallback
	}

	fallback.IP = publicIP

	if resolver != nil && resolver.IsActive() {
		loc := resolver.Lookup(publicIP)
		if loc.Latitude != 0 || loc.Longitude != 0 {
			res := model.ServerLocation{
				IP:          publicIP,
				City:        loc.City,
				CountryCode: loc.CountryCode,
				CountryName: loc.CountryName,
				Latitude:    loc.Latitude,
				Longitude:   loc.Longitude,
			}
			cachedLocation = &res
			lastLocationTime = time.Now()
			return res
		}
	}

	cachedLocation = &fallback
	lastLocationTime = time.Now()
	return fallback
}

func discoverPublicIP() string {
	client := &http.Client{
		Timeout: 2 * time.Second,
	}

	urls := []string{
		"https://api.ipify.org",
		"https://ifconfig.me/ip",
		"https://icanhazip.com",
	}

	for _, u := range urls {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		req, err := http.NewRequestWithContext(ctx, "GET", u, nil)
		if err != nil {
			cancel()
			continue
		}
		req.Header.Set("User-Agent", "curl/7.88.1")
		resp, err := client.Do(req)
		if err == nil && resp.StatusCode == http.StatusOK {
			body, _ := io.ReadAll(io.LimitReader(resp.Body, 64))
			_ = resp.Body.Close()
			cancel()
			ipStr := strings.TrimSpace(string(body))
			if parsed := net.ParseIP(ipStr); parsed != nil && !parsed.IsLoopback() && !parsed.IsPrivate() {
				return ipStr
			}
		}
		if resp != nil {
			_ = resp.Body.Close()
		}
		cancel()
	}

	// Local network interfaces fallback
	ifaces, err := net.Interfaces()
	if err == nil {
		for _, iface := range ifaces {
			if iface.Flags&net.FlagLoopback != 0 || iface.Flags&net.FlagUp == 0 {
				continue
			}
			addrs, err := iface.Addrs()
			if err != nil {
				continue
			}
			for _, addr := range addrs {
				var ip net.IP
				switch v := addr.(type) {
				case *net.IPNet:
					ip = v.IP
				case *net.IPAddr:
					ip = v.IP
				}
				if ip != nil && !ip.IsLoopback() {
					if ipv4 := ip.To4(); ipv4 != nil && !ipv4.IsPrivate() {
						return ipv4.String()
					}
				}
			}
		}
	}

	return ""
}
