package api

import (
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/Bragoo312/defender-eye/internal/config"
	"github.com/Bragoo312/defender-eye/internal/database"
	"github.com/Bragoo312/defender-eye/internal/geoip"
	"github.com/Bragoo312/defender-eye/internal/model"
	"github.com/Bragoo312/defender-eye/internal/normalizer"
	"github.com/Bragoo312/defender-eye/internal/opendedefender"
	"github.com/Bragoo312/defender-eye/internal/simulator"
	"github.com/gorilla/websocket"
)

type Hub struct {
	mu         sync.RWMutex
	sseClients map[chan []byte]bool
	wsClients  map[*websocket.Conn]bool
}

func NewHub() *Hub {
	return &Hub{
		sseClients: make(map[chan []byte]bool),
		wsClients:  make(map[*websocket.Conn]bool),
	}
}

func (h *Hub) BroadcastEvent(event model.SecurityEvent) {
	data, err := json.Marshal(map[string]interface{}{
		"type":  "security_event",
		"event": event,
	})
	if err != nil {
		return
	}

	h.mu.RLock()
	defer h.mu.RUnlock()

	// Broadcast to SSE
	for ch := range h.sseClients {
		select {
		case ch <- data:
		default:
		}
	}

	// Broadcast to WebSockets
	for conn := range h.wsClients {
		_ = conn.WriteMessage(websocket.TextMessage, data)
	}
}

func (h *Hub) BroadcastStats(stats model.DashboardStats) {
	data, err := json.Marshal(map[string]interface{}{
		"type":  "stats_update",
		"stats": stats,
	})
	if err != nil {
		return
	}

	h.mu.RLock()
	defer h.mu.RUnlock()

	for ch := range h.sseClients {
		select {
		case ch <- data:
		default:
		}
	}

	for conn := range h.wsClients {
		_ = conn.WriteMessage(websocket.TextMessage, data)
	}
}

type Server struct {
	cfg           *config.Config
	db            *database.DB
	norm          *normalizer.Normalizer
	sim           *simulator.Simulator
	hub           *Hub
	staticFS      fs.FS
	openDefKey    string
	geoResolver   *geoip.Resolver
	openDefServer *opendedefender.Server
}

func NewServer(cfg *config.Config, db *database.DB, norm *normalizer.Normalizer, sim *simulator.Simulator, hub *Hub, staticFS fs.FS, openDefKey string, geoResolver *geoip.Resolver, openDefServer *opendedefender.Server) *Server {
	return &Server{
		cfg:           cfg,
		db:            db,
		norm:          norm,
		sim:           sim,
		hub:           hub,
		staticFS:      staticFS,
		openDefKey:    openDefKey,
		geoResolver:   geoResolver,
		openDefServer: openDefServer,
	}
}

var wsUpgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()

	// API routes
	mux.HandleFunc("/api/v1/health", s.handleHealth)
	mux.HandleFunc("/api/v1/stats", s.handleStats)
	mux.HandleFunc("/api/v1/events", s.handleEvents)
	mux.HandleFunc("/api/v1/events/stream", s.handleSSE)
	mux.HandleFunc("/api/v1/ips", s.handleIPs)
	mux.HandleFunc("/api/v1/ips/", s.handleIPDetails)
	mux.HandleFunc("/api/v1/ip/action", s.handleIPAction)
	mux.HandleFunc("/api/v1/blocks", s.handleBlocks)
	mux.HandleFunc("/api/v1/ports", s.handlePorts)
	mux.HandleFunc("/api/v1/ssh", s.handleSSH)
	mux.HandleFunc("/api/v1/metrics/system", s.handleSystemMetrics)
	mux.HandleFunc("/api/v1/settings", s.handleSettings)
	mux.HandleFunc("/api/v1/geoip/status", s.handleGeoIPStatus)
	mux.HandleFunc("/api/v1/geoip/update", s.handleGeoIPUpdate)
	mux.HandleFunc("/api/v1/opendedefender/agents", s.handleGetAgents)
	mux.HandleFunc("/api/v1/opendedefender/agents/push", s.handlePushAgentConfig)
	mux.HandleFunc("/api/v1/patch/ebpf/status", s.handleEbpfPatchStatus)
	mux.HandleFunc("/api/v1/patch/ebpf/apply", s.handleEbpfPatchApply)

	// WebSocket for frontend
	mux.HandleFunc("/ws/events", s.handleWS)

	// Frontend static assets
	if s.staticFS != nil {
		fileServer := http.FileServer(http.FS(s.staticFS))
		mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
			// If not API route and file doesn't exist, serve index.html for SPA routing
			path := strings.TrimPrefix(r.URL.Path, "/")
			if path == "" {
				fileServer.ServeHTTP(w, r)
				return
			}
			if _, err := fs.Stat(s.staticFS, path); err != nil {
				r.URL.Path = "/"
			}
			fileServer.ServeHTTP(w, r)
		})
	}

	return s.corsMiddleware(mux)
}

func (s *Server) corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Defender-Secret")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	demo := false
	if s.sim != nil {
		demo = s.sim.IsRunning()
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":  "ok",
		"version": "1.0.0",
		"time":    time.Now().UTC(),
		"demo":    demo,
	})
}

func (s *Server) handleStats(w http.ResponseWriter, r *http.Request) {
	stats, err := s.db.GetStats()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, stats)
}

func (s *Server) handleEvents(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodPost {
		s.handleIngest(w, r)
		return
	}

	query := r.URL.Query()
	limit, _ := strconv.Atoi(query.Get("limit"))
	offset, _ := strconv.Atoi(query.Get("offset"))

	filters := database.EventFilters{
		Monitor:     query.Get("monitor"),
		Severity:    query.Get("severity"),
		Action:      query.Get("action"),
		IP:          query.Get("ip"),
		CountryCode: query.Get("country"),
		Search:      query.Get("search"),
	}

	events, total, err := s.db.GetEvents(limit, offset, filters)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"events": events,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	})
}

func (s *Server) handleIngest(w http.ResponseWriter, r *http.Request) {
	// Secret token check if configured
	if s.cfg.Ingestion.SecretToken != "" {
		token := r.Header.Get("X-Defender-Secret")
		if subtle.ConstantTimeCompare([]byte(token), []byte(s.cfg.Ingestion.SecretToken)) != 1 {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
	} else {
		// When no token is configured, only accept requests from loopback
		host, _, _ := net.SplitHostPort(r.RemoteAddr)
		ip := net.ParseIP(host)
		if ip == nil || !ip.IsLoopback() {
			http.Error(w, "Forbidden: configure ingestion.secret_token or access via loopback only", http.StatusForbidden)
			return
		}
	}

	var in normalizer.IngestEventInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		http.Error(w, "Invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	if in.Source == "" {
		in.Source = "collector"
	}

	event := s.norm.Normalize(in)
	if err := s.db.SaveEvent(event, s.cfg.OpenDefender.DefaultBanSeconds); err != nil {
		http.Error(w, "Saving event: "+err.Error(), http.StatusInternalServerError)
		return
	}

	s.hub.BroadcastEvent(event)
	writeJSON(w, http.StatusCreated, map[string]interface{}{
		"status":   "accepted",
		"event_id": event.EventID,
	})
}

func (s *Server) handleIPs(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	limit, _ := strconv.Atoi(query.Get("limit"))
	offset, _ := strconv.Atoi(query.Get("offset"))
	search := query.Get("search")

	ips, total, err := s.db.GetIPs(limit, offset, search)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"ips":    ips,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	})
}

func (s *Server) handleIPDetails(w http.ResponseWriter, r *http.Request) {
	ipStr := strings.TrimPrefix(r.URL.Path, "/api/v1/ips/")
	if ipStr == "" {
		http.Error(w, "Missing IP parameter", http.StatusBadRequest)
		return
	}

	ipInfo, events, err := s.db.GetIPDetails(ipStr)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"ip":     ipInfo,
		"events": events,
	})
}

type IPActionInput struct {
	IP       string `json:"ip"`
	Action   string `json:"action"`   // "ban", "unban", "whitelist"
	Duration string `json:"duration"` // "permanent", "1h", "24h"
}

func (s *Server) handleIPAction(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var in IPActionInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		http.Error(w, "Invalid JSON body: "+err.Error(), http.StatusBadRequest)
		return
	}

	ip := net.ParseIP(in.IP)
	if ip == nil {
		http.Error(w, "Invalid IP address", http.StatusBadRequest)
		return
	}

	banSeconds := 0
	switch in.Duration {
	case "1h":
		banSeconds = 3600
	case "24h":
		banSeconds = 86400
	default:
		banSeconds = 0 // permanent
	}

	var actionErr error
	switch in.Action {
	case "ban":
		actionErr = s.db.SetIPBanStatus(in.IP, true, "manual_ban", banSeconds, "Ручная блокировка из интерфейса SOC")
		if actionErr == nil {
			event := model.SecurityEvent{
				EventID:   fmt.Sprintf("man-%d", time.Now().UnixNano()),
				Timestamp: time.Now().UTC(),
				Source:    "ui_admin",
				Monitor:   "ip_ban",
				EventType: "manual_action",
				Severity:  "critical",
				SourceIP:  in.IP,
				Protocol:  "tcp",
				Action:    "blocked",
				Service:   "soc_admin",
				Message:   fmt.Sprintf("Ручная блокировка адреса из панели управления (длительность: %s)", in.Duration),
			}
			if ipInfo, _, err := s.db.GetIPDetails(in.IP); err == nil && ipInfo != nil {
				event.CountryCode = ipInfo.CountryCode
				event.CountryName = ipInfo.CountryName
				event.City = ipInfo.City
				event.Latitude = ipInfo.Latitude
				event.Longitude = ipInfo.Longitude
			}
			_ = s.db.SaveEvent(event, banSeconds)
			s.hub.BroadcastEvent(event)

			if s.openDefServer != nil {
				s.openDefServer.BroadcastAction("ban_ip", in.IP, banSeconds)
			}
		}
	case "unban":
		actionErr = s.db.SetIPBanStatus(in.IP, false, "manual_unban", 0, "Снятие блокировки из панели SOC")
		if actionErr == nil {
			event := model.SecurityEvent{
				EventID:   fmt.Sprintf("man-%d", time.Now().UnixNano()),
				Timestamp: time.Now().UTC(),
				Source:    "ui_admin",
				Monitor:   "ip_ban",
				EventType: "manual_action",
				Severity:  "low",
				SourceIP:  in.IP,
				Protocol:  "tcp",
				Action:    "alerted",
				Service:   "soc_admin",
				Message:   "Ручное снятие блокировки адреса из панели управления",
			}
			if ipInfo, _, err := s.db.GetIPDetails(in.IP); err == nil && ipInfo != nil {
				event.CountryCode = ipInfo.CountryCode
				event.CountryName = ipInfo.CountryName
				event.City = ipInfo.City
				event.Latitude = ipInfo.Latitude
				event.Longitude = ipInfo.Longitude
			}
			_ = s.db.SaveEvent(event, 0)
			s.hub.BroadcastEvent(event)

			if s.openDefServer != nil {
				s.openDefServer.BroadcastAction("unban_ip", in.IP, 0)
			}
		}
	case "whitelist":
		actionErr = s.db.SetIPBanStatus(in.IP, false, "whitelist", 0, "Добавление в белый список")
		if actionErr == nil {
			event := model.SecurityEvent{
				EventID:   fmt.Sprintf("man-%d", time.Now().UnixNano()),
				Timestamp: time.Now().UTC(),
				Source:    "ui_admin",
				Monitor:   "ip_ban",
				EventType: "manual_action",
				Severity:  "low",
				SourceIP:  in.IP,
				Protocol:  "tcp",
				Action:    "logged",
				Service:   "soc_admin",
				Message:   "Адрес добавлен в белый список панели SOC",
			}
			_ = s.db.SaveEvent(event, 0)
			s.hub.BroadcastEvent(event)
		}
	default:
		http.Error(w, "Unsupported action", http.StatusBadRequest)
		return
	}

	if actionErr != nil {
		http.Error(w, "Executing IP action: "+actionErr.Error(), http.StatusInternalServerError)
		return
	}

	// Broadcast updated stats to UI
	if stats, err := s.db.GetStats(); err == nil {
		s.hub.BroadcastStats(stats)
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":  "ok",
		"message": "Действие успешно выполнено",
	})
}

func (s *Server) handleBlocks(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	limit, _ := strconv.Atoi(query.Get("limit"))
	offset, _ := strconv.Atoi(query.Get("offset"))
	status := query.Get("status") // "active", "expired", or ""

	blocks, total, err := s.db.GetBlocks(limit, offset, status)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"blocks": blocks,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	})
}

func (s *Server) handlePorts(w http.ResponseWriter, r *http.Request) {
	ports, err := s.db.GetTopPorts()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, ports)
}

func (s *Server) handleSSH(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	limit, _ := strconv.Atoi(query.Get("limit"))
	offset, _ := strconv.Atoi(query.Get("offset"))

	events, total, err := s.db.GetEvents(limit, offset, database.EventFilters{
		Monitor: "ssh_monitor",
	})
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"events": events,
		"total":  total,
	})
}

func (s *Server) handleSystemMetrics(w http.ResponseWriter, r *http.Request) {
	metrics, err := s.db.GetRecentMetrics(30)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, metrics)
}

func (s *Server) handleSettings(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodPost {
		var req struct {
			DemoMode      *bool `json:"demo_mode"`
			RetentionDays *int  `json:"retention_days"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		if req.DemoMode != nil {
			if *req.DemoMode {
				s.sim.Start()
			} else {
				s.sim.Stop()
			}
		}
		if req.RetentionDays != nil && *req.RetentionDays > 0 {
			s.cfg.Server.RetentionDays = *req.RetentionDays
			_ = s.db.ApplyRetention(*req.RetentionDays)
		}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"retention_days":     s.cfg.Server.RetentionDays,
		"demo_mode":          s.sim.IsRunning(),
		"geoip_enabled":      s.cfg.GeoIP.Enabled,
		"open_defender_key":  s.openDefKey,
		"bind_address":       s.cfg.Server.BindAddress,
		"default_ban_seconds": s.cfg.OpenDefender.DefaultBanSeconds,
	})
}

func (s *Server) handleSSE(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming unsupported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	clientChan := make(chan []byte, 32)
	s.hub.mu.Lock()
	s.hub.sseClients[clientChan] = true
	s.hub.mu.Unlock()

	defer func() {
		s.hub.mu.Lock()
		delete(s.hub.sseClients, clientChan)
		s.hub.mu.Unlock()
	}()

	// Send initial connect ping
	fmt.Fprintf(w, "event: connected\ndata: {\"status\":\"ok\"}\n\n")
	flusher.Flush()

	notify := r.Context().Done()
	for {
		select {
		case <-notify:
			return
		case msg := <-clientChan:
			fmt.Fprintf(w, "data: %s\n\n", msg)
			flusher.Flush()
		}
	}
}

func (s *Server) handleWS(w http.ResponseWriter, r *http.Request) {
	conn, err := wsUpgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[WS] Upgrade error: %v", err)
		return
	}

	s.hub.mu.Lock()
	s.hub.wsClients[conn] = true
	s.hub.mu.Unlock()

	defer func() {
		s.hub.mu.Lock()
		delete(s.hub.wsClients, conn)
		s.hub.mu.Unlock()
		_ = conn.Close()
	}()

	// Keep-alive reading
	for {
		if _, _, err := conn.ReadMessage(); err != nil {
			break
		}
	}
}

func (s *Server) handleGeoIPStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	path := s.cfg.GeoIP.MMDBPath
	var exists bool
	var sizeMB float64
	var updatedAt time.Time

	if fi, err := os.Stat(path); err == nil {
		exists = true
		sizeMB = float64(fi.Size()) / (1024 * 1024)
		updatedAt = fi.ModTime()
	}

	active := false
	if s.geoResolver != nil {
		active = s.geoResolver.IsActive()
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"enabled":    s.cfg.GeoIP.Enabled,
		"active":     active,
		"path":       path,
		"exists":     exists,
		"size_mb":    fmt.Sprintf("%.1f", sizeMB),
		"updated_at": updatedAt.Format("2006-01-02 15:04:05"),
	})
}

func (s *Server) handleGeoIPUpdate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	targetPath := s.cfg.GeoIP.MMDBPath
	if targetPath == "" {
		targetPath = "geoip/GeoLite2-City.mmdb"
	}

	dir := filepath.Dir(targetPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]interface{}{
			"error": fmt.Sprintf("создание папки: %v", err),
		})
		return
	}

	tmpFile := targetPath + ".downloading"
	mirrorURL := "https://github.com/P3TERX/GeoLite.mmdb/raw/download/GeoLite2-City.mmdb"

	client := &http.Client{Timeout: 180 * time.Second}
	resp, err := client.Get(mirrorURL)
	if err != nil {
		// Fallback to Country database if City mirror is unreachable
		mirrorURL = "https://github.com/P3TERX/GeoLite.mmdb/raw/download/GeoLite2-Country.mmdb"
		resp, err = client.Get(mirrorURL)
		if err != nil {
			writeJSON(w, http.StatusBadGateway, map[string]interface{}{
				"error": fmt.Sprintf("ошибка соединения с сервером базы данных: %v", err),
			})
			return
		}
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		writeJSON(w, http.StatusBadGateway, map[string]interface{}{
			"error": fmt.Sprintf("зеркало вернуло HTTP %d", resp.StatusCode),
		})
		return
	}

	out, err := os.Create(tmpFile)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]interface{}{
			"error": fmt.Sprintf("создание временного файла: %v", err),
		})
		return
	}

	written, err := io.Copy(out, resp.Body)
	_ = out.Close()
	if err != nil {
		_ = os.Remove(tmpFile)
		writeJSON(w, http.StatusInternalServerError, map[string]interface{}{
			"error": fmt.Sprintf("ошибка записи данных: %v", err),
		})
		return
	}

	// Rename atomically
	_ = os.Remove(targetPath) // on Windows rename over existing file requires remove
	if err := os.Rename(tmpFile, targetPath); err != nil {
		_ = os.Remove(tmpFile)
		writeJSON(w, http.StatusInternalServerError, map[string]interface{}{
			"error": fmt.Sprintf("замена файла базы: %v", err),
		})
		return
	}

	// Hot reload in-memory resolver
	if s.geoResolver != nil {
		if err := s.geoResolver.Reload(targetPath); err != nil {
			log.Printf("[GeoIP] Warning reload failed: %v", err)
		}
	}

	sizeMB := float64(written) / (1024 * 1024)
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":  "ok",
		"message": "База данных GeoIP успешно обновлена и подключена на лету",
		"size_mb": fmt.Sprintf("%.1f", sizeMB),
		"path":    targetPath,
	})
}

func (s *Server) handleGetAgents(w http.ResponseWriter, r *http.Request) {
	if s.openDefServer == nil {
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"enabled": false,
			"agents":  []interface{}{},
		})
		return
	}
	agents := s.openDefServer.GetAgents()
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"enabled": true,
		"agents":  agents,
	})
}

func (s *Server) handlePushAgentConfig(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.openDefServer == nil {
		http.Error(w, "Open Defender listener is disabled", http.StatusBadRequest)
		return
	}

	var req struct {
		ConfigID string          `json:"config_id"`
		Config   json.RawMessage `json:"config"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	if req.ConfigID == "" {
		http.Error(w, "config_id is required", http.StatusBadRequest)
		return
	}

	if err := s.openDefServer.PushConfig(req.ConfigID, req.Config); err != nil {
		http.Error(w, "Failed to push config: "+err.Error(), http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":    "ok",
		"message":   "Конфигурация успешно отправлена на агент по WebSocket",
		"config_id": req.ConfigID,
	})
}

func writeJSON(w http.ResponseWriter, code int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(data)
}

func findEbpfMonitorFile() string {
	userHome, _ := os.UserHomeDir()
	candidatePaths := []string{
		"/opt/open-defender/pkg/ebpfmonitors/bpf/network_monitor.bpf.c",
		"/usr/local/open-defender/pkg/ebpfmonitors/bpf/network_monitor.bpf.c",
		"/etc/open-defender/bpf/network_monitor.bpf.c",
		filepath.Join(userHome, "open-defender", "pkg", "ebpfmonitors", "bpf", "network_monitor.bpf.c"),
		"./open-defender/pkg/ebpfmonitors/bpf/network_monitor.bpf.c",
		"../open-defender/pkg/ebpfmonitors/bpf/network_monitor.bpf.c",
	}

	for _, p := range candidatePaths {
		if p == "" {
			continue
		}
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	return ""
}

func (s *Server) handleEbpfPatchStatus(w http.ResponseWriter, r *http.Request) {
	filePath := findEbpfMonitorFile()
	if filePath == "" {
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"file_exists":  false,
			"status":       "not_found",
			"patch_needed": false,
			"file_path":    "",
			"message":      "Файл network_monitor.bpf.c не найден в стандартных директориях Open Defender",
		})
		return
	}

	content, err := os.ReadFile(filePath)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"file_exists":  true,
			"status":       "read_error",
			"patch_needed": false,
			"file_path":    filePath,
			"message":      fmt.Sprintf("Ошибка чтения файла: %v", err),
		})
		return
	}

	src := string(content)
	alreadyPatched := strings.Contains(src, "ip->saddr;") && strings.Contains(src, "tcp->dest;") &&
		!strings.Contains(src, "bpf_ntohl(ip->saddr)") && !strings.Contains(src, "bpf_ntohs(tcp->dest)")

	if alreadyPatched {
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"file_exists":  true,
			"status":       "already_patched",
			"patch_needed": false,
			"file_path":    filePath,
			"message":      "Патч не требуется (уже применён)",
		})
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"file_exists":  true,
		"status":       "patch_needed",
		"patch_needed": true,
		"file_path":    filePath,
		"message":      "Патч требуется (обнаружены устаревшие макросы bpf_ntohl / bpf_ntohs)",
	})
}

func (s *Server) handleEbpfPatchApply(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	filePath := findEbpfMonitorFile()
	if filePath == "" {
		http.Error(w, "Файл network_monitor.bpf.c не найден", http.StatusNotFound)
		return
	}

	content, err := os.ReadFile(filePath)
	if err != nil {
		http.Error(w, fmt.Sprintf("Ошибка чтения файла: %v", err), http.StatusInternalServerError)
		return
	}

	src := string(content)
	if !strings.Contains(src, "bpf_ntohl") && !strings.Contains(src, "bpf_ntohs") {
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"status":  "already_patched",
			"message": "Файл уже пропатчен, повторное применение не требуется",
		})
		return
	}

	// 1. Create backup copy
	backupPath := filePath + ".bak"
	if err := os.WriteFile(backupPath, content, 0644); err != nil {
		http.Error(w, fmt.Sprintf("Ошибка создания бэкапа %s: %v", backupPath, err), http.StatusInternalServerError)
		return
	}

	// 2. Perform exact safe replacements
	newSrc := src
	newSrc = strings.Replace(newSrc, "e->saddr = bpf_ntohl(ip->saddr);", "e->saddr = ip->saddr;", -1)
	newSrc = strings.Replace(newSrc, "e->dport = bpf_ntohs(tcp->dest);", "e->dport = tcp->dest;", -1)
	newSrc = strings.Replace(newSrc, "bpf_ntohl(ip->saddr)", "ip->saddr", -1)
	newSrc = strings.Replace(newSrc, "bpf_ntohs(tcp->dest)", "tcp->dest", -1)

	// 3. Write updated content
	if err := os.WriteFile(filePath, []byte(newSrc), 0644); err != nil {
		http.Error(w, fmt.Sprintf("Ошибка записи файла %s: %v", filePath, err), http.StatusInternalServerError)
		return
	}

	log.Printf("[PatchManager] Successfully applied eBPF endianness fix to %s. Backup saved at %s", filePath, backupPath)

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":      "success",
		"message":     fmt.Sprintf("Патч успешно применён! Бэкап сохранён в %s", backupPath),
		"backup_path": backupPath,
		"file_path":   filePath,
	})
}
