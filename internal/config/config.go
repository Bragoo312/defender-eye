package config

import (
	"fmt"
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"
)

type Config struct {
	Server       ServerConfig       `yaml:"server"`
	GeoIP        GeoIPConfig        `yaml:"geoip"`
	OpenDefender OpenDefenderConfig `yaml:"open_defender"`
	Ingestion    IngestionConfig    `yaml:"ingestion"`
	Metrics      MetricsConfig      `yaml:"metrics"`
}

type ServerConfig struct {
	BindAddress   string `yaml:"bind_address"`
	DatabasePath  string `yaml:"database_path"`
	RetentionDays int    `yaml:"retention_days"`
	DemoMode      bool   `yaml:"demo_mode"`
}

type GeoIPConfig struct {
	Enabled  bool   `yaml:"enabled"`
	MMDBPath string `yaml:"mmdb_path"`
}

type OpenDefenderConfig struct {
	Enabled           bool   `yaml:"enabled"`
	WSEndpoint        string `yaml:"ws_endpoint"`
	PrivateKeyPath    string `yaml:"private_key_path"`
	PublicKeyPath     string `yaml:"public_key_path"`
	DefaultBanSeconds int    `yaml:"default_ban_seconds"`
}

type IngestionConfig struct {
	Enabled     bool   `yaml:"enabled"`
	APIPath     string `yaml:"api_path"`
	SecretToken string `yaml:"secret_token"`
}

type MetricsConfig struct {
	CollectionIntervalSeconds int `yaml:"collection_interval_seconds"`
}

func DefaultConfig() *Config {
	return &Config{
		Server: ServerConfig{
			BindAddress:   "127.0.0.1:8080",
			DatabasePath:  "data/defender.db",
			RetentionDays: 30,
			DemoMode:      false,
		},
		GeoIP: GeoIPConfig{
			Enabled:  true,
			MMDBPath: "geoip/GeoLite2-Country.mmdb",
		},
		OpenDefender: OpenDefenderConfig{
			Enabled:           true,
			WSEndpoint:        "/ws/agent",
			PrivateKeyPath:    "configs/server_rsa.key",
			PublicKeyPath:     "configs/server_rsa.pub",
			DefaultBanSeconds: 900,
		},
		Ingestion: IngestionConfig{
			Enabled:     true,
			APIPath:     "/api/v1/events",
			SecretToken: "",
		},
		Metrics: MetricsConfig{
			CollectionIntervalSeconds: 30,
		},
	}
}

func LoadConfig(path string) (*Config, error) {
	cfg := DefaultConfig()

	if path == "" {
		return cfg, nil
	}

	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			// If file does not exist, return defaults
			return cfg, nil
		}
		return nil, fmt.Errorf("reading config file %s: %w", path, err)
	}

	if err := yaml.Unmarshal(data, cfg); err != nil {
		return nil, fmt.Errorf("parsing config yaml %s: %w", path, err)
	}

	// Ensure directory for database exists
	if dir := filepath.Dir(cfg.Server.DatabasePath); dir != "." && dir != "" {
		_ = os.MkdirAll(dir, 0755)
	}

	return cfg, nil
}
