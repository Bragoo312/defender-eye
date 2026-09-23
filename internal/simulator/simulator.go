package simulator

import (
	"context"
	"fmt"
	"math/rand"
	"sync"
	"time"

	"github.com/Bragoo312/defender-eye/internal/model"
	"github.com/Bragoo312/defender-eye/internal/normalizer"
)

type AttackProfile struct {
	IP          string
	CountryCode string
	CountryName string
	City        string
	Latitude    float64
	Longitude   float64
	ASN         uint
	ASOrg       string
}

var attackPool = []AttackProfile{
	{IP: "185.220.101.5", CountryCode: "NL", CountryName: "Netherlands", City: "Amsterdam", Latitude: 52.3676, Longitude: 4.9041, ASN: 60729, ASOrg: "Tor Exit Node"},
	{IP: "45.155.205.133", CountryCode: "RU", CountryName: "Russia", City: "Moscow", Latitude: 55.7558, Longitude: 37.6173, ASN: 48666, ASOrg: "HostKey Ltd"},
	{IP: "198.235.24.40", CountryCode: "US", CountryName: "United States", City: "Ashburn", Latitude: 39.0438, Longitude: -77.4874, ASN: 14061, ASOrg: "DigitalOcean LLC"},
	{IP: "103.149.28.19", CountryCode: "SG", CountryName: "Singapore", City: "Singapore", Latitude: 1.3521, Longitude: 103.8198, ASN: 13335, ASOrg: "Cloudflare Inc"},
	{IP: "194.26.29.112", CountryCode: "DE", CountryName: "Germany", City: "Frankfurt", Latitude: 50.1109, Longitude: 8.6821, ASN: 24940, ASOrg: "Hetzner Online GmbH"},
	{IP: "114.119.130.82", CountryCode: "CN", CountryName: "China", City: "Beijing", Latitude: 39.9042, Longitude: 116.4074, ASN: 4134, ASOrg: "Chinanet"},
	{IP: "89.248.165.74", CountryCode: "SC", CountryName: "Seychelles", City: "Victoria", Latitude: -4.6191, Longitude: 55.4513, ASN: 202425, ASOrg: "IP Volume inc"},
	{IP: "51.15.23.109", CountryCode: "FR", CountryName: "France", City: "Paris", Latitude: 48.8566, Longitude: 2.3522, ASN: 12876, ASOrg: "Scaleway"},
	{IP: "167.99.182.204", CountryCode: "GB", CountryName: "United Kingdom", City: "London", Latitude: 51.5074, Longitude: -0.1278, ASN: 14061, ASOrg: "DigitalOcean LLC"},
	{IP: "92.118.160.17", CountryCode: "BG", CountryName: "Bulgaria", City: "Sofia", Latitude: 42.6977, Longitude: 23.3219, ASN: 44390, ASOrg: "Global Telecommunication"},
}

type Simulator struct {
	mu      sync.Mutex
	running bool
	cancel  context.CancelFunc
	sink    opendedefenderEventSink
}

type opendedefenderEventSink interface {
	HandleEvent(event model.SecurityEvent)
}

func NewSimulator(sink opendedefenderEventSink) *Simulator {
	return &Simulator{
		sink: sink,
	}
}

func (s *Simulator) Start() {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.running {
		return
	}

	ctx, cancel := context.WithCancel(context.Background())
	s.cancel = cancel
	s.running = true

	go s.runLoop(ctx)
}

func (s *Simulator) Stop() {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.running {
		return
	}
	s.cancel()
	s.running = false
}

func (s *Simulator) IsRunning() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.running
}

func (s *Simulator) runLoop(ctx context.Context) {
	// Emit an initial burst of events on start so the dashboard looks full immediately
	s.emitInitialBurst()

	for {
		// Random interval between 2 and 7 seconds
		delay := time.Duration(2000+rand.Intn(4000)) * time.Millisecond
		select {
		case <-ctx.Done():
			return
		case <-time.After(delay):
			s.emitRandomAttack()
		}
	}
}

func (s *Simulator) emitInitialBurst() {
	for i := 0; i < 8; i++ {
		s.emitRandomAttack()
		time.Sleep(100 * time.Millisecond)
	}
}

func (s *Simulator) emitRandomAttack() {
	profile := attackPool[rand.Intn(len(attackPool))]
	now := time.Now().UTC()

	attackTypes := []string{
		"ssh_brute",
		"web_recon",
		"web_brute",
		"port_scan",
		"db_brute",
		"ip_ban",
	}
	chosen := attackTypes[rand.Intn(len(attackTypes))]

	var event model.SecurityEvent
	event.Timestamp = now
	event.Source = "open_defender"
	event.SourceIP = profile.IP
	event.CountryCode = profile.CountryCode
	event.CountryName = profile.CountryName
	event.City = profile.City
	event.Latitude = profile.Latitude
	event.Longitude = profile.Longitude
	event.ASN = profile.ASN
	event.ASOrg = profile.ASOrg

	switch chosen {
	case "ssh_brute":
		usernames := []string{"root", "admin", "ubuntu", "test", "postgres", "user", "guest"}
		user := usernames[rand.Intn(len(usernames))]
		attempts := 5 + rand.Intn(15)
		event.Monitor = "ssh_monitor"
		event.EventType = "ssh_brute"
		event.Service = "ssh"
		event.DestPort = 22
		event.Protocol = "tcp"
		event.Severity = model.SeverityHigh
		event.Action = model.ActionAlerted
		event.Username = user
		event.Message = fmt.Sprintf("Подбор пароля SSH: попытка входа под пользователем '%s' (%d неудачных попыток за 60с)", user, attempts)

	case "web_recon":
		paths := []string{"/admin", "/wp-login.php", "/.env", "/phpmyadmin", "/actuator/health", "/api/v1/debug"}
		path := paths[rand.Intn(len(paths))]
		event.Monitor = "web_recon_monitor"
		event.EventType = "web_recon"
		event.Service = "http"
		event.DestPort = 80
		event.Protocol = "tcp"
		event.Severity = model.SeverityMedium
		event.Action = model.ActionAlerted
		event.Message = fmt.Sprintf("Поиск уязвимостей сайта: сканирование скрытого пути %s", path)

	case "web_brute":
		event.Monitor = "web_brute_monitor"
		event.EventType = "web_brute"
		event.Service = "http"
		event.DestPort = 443
		event.Protocol = "tcp"
		event.Severity = model.SeverityHigh
		event.Action = model.ActionAlerted
		event.Message = "Подбор пароля в веб-панель: множественные неудачные попытки входа POST"

	case "port_scan":
		scannedPorts := 5 + rand.Intn(20)
		event.Monitor = "network_antirecon"
		event.EventType = "port_scan"
		event.Service = "network"
		event.DestPort = 0
		event.Protocol = "tcp"
		event.Severity = model.SeverityMedium
		event.Action = model.ActionAlerted
		event.Message = fmt.Sprintf("Скрытая разведка портов: eBPF перехватил SYN-сканирование (%d закрытых портов)", scannedPorts)

	case "db_brute":
		event.Monitor = "database_monitor"
		event.EventType = "db_brute"
		event.Service = "database"
		event.DestPort = 5432
		event.Protocol = "tcp"
		event.Severity = model.SeverityHigh
		event.Action = model.ActionAlerted
		event.Username = "postgres"
		event.Message = "Взлом базы данных: серия ошибок аутентификации PostgreSQL на порту 5432"

	case "ip_ban":
		event.Monitor = "ip_ban"
		event.EventType = "ip_ban"
		event.Service = "firewall"
		event.DestPort = 0
		event.Protocol = "all"
		event.Severity = model.SeverityCritical
		event.Action = model.ActionBlocked
		event.Message = fmt.Sprintf("Автобан: адрес %s заблокирован через iptables на 15 минут за превышение лимита атак", profile.IP)
	}

	norm := normalizer.NewNormalizer(nil)
	normalized := norm.Normalize(normalizer.IngestEventInput{
		Timestamp:  &event.Timestamp,
		Source:     event.Source,
		Monitor:    event.Monitor,
		IP:         event.SourceIP,
		Message:    event.Message,
		Severity:   event.Severity,
		Action:     event.Action,
		DestPort:   event.DestPort,
		Username:   event.Username,
	})
	// Keep profile's geo data for simulator
	normalized.CountryCode = profile.CountryCode
	normalized.CountryName = profile.CountryName
	normalized.City = profile.City
	normalized.Latitude = profile.Latitude
	normalized.Longitude = profile.Longitude
	normalized.ASN = profile.ASN
	normalized.ASOrg = profile.ASOrg

	if s.sink != nil {
		s.sink.HandleEvent(normalized)
	}
}
