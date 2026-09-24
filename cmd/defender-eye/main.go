package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/Bragoo312/defender-eye/internal/api"
	"github.com/Bragoo312/defender-eye/internal/config"
	"github.com/Bragoo312/defender-eye/internal/database"
	"github.com/Bragoo312/defender-eye/internal/geoip"
	"github.com/Bragoo312/defender-eye/internal/model"
	"github.com/Bragoo312/defender-eye/internal/normalizer"
	"github.com/Bragoo312/defender-eye/internal/opendedefender"
	"github.com/Bragoo312/defender-eye/internal/simulator"
	"github.com/Bragoo312/defender-eye/internal/system"
	"github.com/Bragoo312/defender-eye/internal/web"
)

const AppVersion = "1.3.1"

type appSink struct {
	db  *database.DB
	hub *api.Hub
	cfg *config.Config
}

func (s *appSink) HandleEvent(event model.SecurityEvent) {
	if err := s.db.SaveEvent(event, s.cfg.OpenDefender.DefaultBanSeconds); err != nil {
		log.Printf("[Sink] Error saving event: %v", err)
		return
	}
	s.hub.BroadcastEvent(event)
}

func main() {
	configPath := flag.String("config", "", "Path to configuration file")
	showVersion := flag.Bool("version", false, "Show version and exit")
	demoFlag := flag.Bool("demo", false, "Start with attack simulator enabled")
	flag.Parse()

	if *showVersion {
		fmt.Printf("Defender Eye v%s (Linux Security Dashboard)\n", AppVersion)
		return
	}

	// 1. Determine config path
	chosenPath := *configPath
	if chosenPath == "" {
		candidates := []string{
			"configs/config.yaml",
			"/etc/defender-eye/config.yaml",
			"configs/config.example.yaml",
		}
		for _, c := range candidates {
			if _, err := os.Stat(c); err == nil {
				chosenPath = c
				break
			}
		}
	}

	cfg, err := config.LoadConfig(chosenPath)
	if err != nil {
		log.Fatalf("[Main] Failed to load config: %v", err)
	}
	if *demoFlag {
		cfg.Server.DemoMode = true
	}

	log.Printf("[Main] Starting Defender Eye v%s...", AppVersion)
	log.Printf("[Main] Using config: %s", chosenPath)

	// 2. Open SQLite Database
	db, err := database.Open(cfg.Server.DatabasePath)
	if err != nil {
		log.Fatalf("[Main] Failed to initialize SQLite database: %v", err)
	}
	defer db.Close()
	log.Printf("[Main] SQLite database ready at %s", cfg.Server.DatabasePath)

	// 3. Initialize Offline GeoIP
	var geoResolver *geoip.Resolver
	if cfg.GeoIP.Enabled {
		geoResolver = geoip.NewResolver(cfg.GeoIP.MMDBPath)
		defer geoResolver.Close()
	}

	// 4. Initialize Normalizer & Realtime Hub
	norm := normalizer.NewNormalizer(geoResolver)
	hub := api.NewHub()
	sink := &appSink{
		db:  db,
		hub: hub,
		cfg: cfg,
	}

	// 5. Initialize Simulator
	sim := simulator.NewSimulator(sink)
	if cfg.Server.DemoMode {
		log.Println("[Simulator] Demo mode active - generating realistic simulated telemetry...")
		sim.Start()
	}

	// 6. Initialize Open Defender E2EE WebSocket Server
	var openDefKey string
	var openDefServer *opendedefender.Server
	if cfg.OpenDefender.Enabled {
		openDefServer, err = opendedefender.NewServer(
			cfg.OpenDefender.PrivateKeyPath,
			cfg.OpenDefender.PublicKeyPath,
			norm,
			sink,
			db,
		)
		if err != nil {
			log.Printf("[OpenDefender] Warning: failed to start E2EE agent listener: %v", err)
		} else {
			openDefKey = openDefServer.GetPublicKeyBase64()
			log.Printf("[OpenDefender] E2EE agent listener active on %s", cfg.OpenDefender.WSEndpoint)
		}
	}

	// 7. Background workers: System Metrics & Retention
	sysCollector := system.NewCollector()
	metricsTicker := time.NewTicker(time.Duration(cfg.Metrics.CollectionIntervalSeconds) * time.Second)
	defer metricsTicker.Stop()

	go func() {
		for range metricsTicker.C {
			m := sysCollector.Collect()
			_ = db.SaveSystemMetric(m)
		}
	}()

	retentionTicker := time.NewTicker(6 * time.Hour)
	defer retentionTicker.Stop()
	go func() {
		// Run initial retention on start
		_ = db.ApplyRetention(cfg.Server.RetentionDays)
		for range retentionTicker.C {
			_ = db.ApplyRetention(cfg.Server.RetentionDays)
		}
	}()

	// 8. Prepare Static Frontend Assets
	staticFS := web.GetFS()
	if staticFS != nil {
		log.Println("[Frontend] Serving embedded React UI")
	} else if _, err := os.Stat("dist/index.html"); err == nil {
		staticFS = os.DirFS("dist")
		log.Println("[Frontend] Serving local dist/ React UI")
	}

	// 9. Setup HTTP Server and API Routes
	apiServer := api.NewServer(cfg, db, norm, sim, hub, staticFS, openDefKey, geoResolver, openDefServer)
	router := apiServer.Routes()

	// If Open Defender is enabled, mount its WS endpoint onto the router (supporting /ws/agent and /ws/collector aliases)
	if openDefServer != nil {
		baseHandler := router
		configuredPath := strings.TrimSuffix(cfg.OpenDefender.WSEndpoint, "/")
		router = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			cleanPath := strings.TrimSuffix(r.URL.Path, "/")
			if cleanPath == configuredPath ||
				cleanPath == "/ws/agent" ||
				cleanPath == "/ws/collector" {
				openDefServer.ServeHTTP(w, r)
				return
			}
			baseHandler.ServeHTTP(w, r)
		})
	}

	// 10. Bind TCP Listener with Automatic Free Port Selection
	listener, finalAddr, err := bindWithPortFallback(cfg.Server.BindAddress)
	if err != nil {
		log.Fatalf("[Main] Failed to bind any listening address: %v", err)
	}
	cfg.Server.BindAddress = finalAddr

	httpSrv := &http.Server{
		Handler:      router,
		ReadTimeout:  60 * time.Second,
		WriteTimeout: 60 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	// 11. Start Server
	go func() {
		log.Printf("[Main] Defender Eye listening on http://%s", finalAddr)
		log.Printf("[Main] Open via SSH tunnel: ssh -L <port>:%s user@server", finalAddr)
		if err := httpSrv.Serve(listener); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[Main] Server error: %v", err)
		}
	}()

	// 12. Graceful Shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("[Main] Shutting down Defender Eye gracefully...")
	sim.Stop()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := httpSrv.Shutdown(ctx); err != nil {
		log.Printf("[Main] Force shutdown: %v", err)
	}

	log.Println("[Main] Defender Eye stopped cleanly.")
}

func bindWithPortFallback(bindAddr string) (net.Listener, string, error) {
	host, portStr, err := net.SplitHostPort(bindAddr)
	if err != nil {
		if strings.HasPrefix(bindAddr, ":") {
			host = ""
			portStr = strings.TrimPrefix(bindAddr, ":")
		} else {
			host = "127.0.0.1"
			portStr = "8080"
		}
	}

	startPort, _ := strconv.Atoi(portStr)
	if startPort <= 0 {
		startPort = 8080
	}

	// 1. Try original requested address
	targetAddr := fmt.Sprintf("%s:%d", host, startPort)
	ln, err := net.Listen("tcp", targetAddr)
	if err == nil {
		return ln, targetAddr, nil
	}

	log.Printf("[Main] WARNING: Configured address %s is busy or unavailable (%v)", targetAddr, err)
	log.Printf("[Main] Searching for an available free port...")

	// 2. Scan fallback candidates: startPort+1 .. startPort+20, then common alt ports (8081, 8082, 8090, 8888, 9090)
	candidatePorts := make([]int, 0, 30)
	for p := startPort + 1; p <= startPort+20; p++ {
		candidatePorts = append(candidatePorts, p)
	}
	for _, p := range []int{8081, 8082, 8083, 8090, 8888, 9090, 9091} {
		candidatePorts = append(candidatePorts, p)
	}

	for _, port := range candidatePorts {
		candidateAddr := fmt.Sprintf("%s:%d", host, port)
		ln, err := net.Listen("tcp", candidateAddr)
		if err == nil {
			log.Printf("[Main] >>> Successfully auto-selected free port %d: http://%s <<<", port, candidateAddr)
			return ln, candidateAddr, nil
		}
	}

	// 3. Fallback to OS-assigned port (:0)
	ephemeralAddr := fmt.Sprintf("%s:0", host)
	ln, err = net.Listen("tcp", ephemeralAddr)
	if err == nil {
		actualAddr := ln.Addr().String()
		log.Printf("[Main] >>> Successfully auto-selected OS ephemeral port: http://%s <<<", actualAddr)
		return ln, actualAddr, nil
	}

	return nil, "", fmt.Errorf("unable to bind to any port: %w", err)
}

