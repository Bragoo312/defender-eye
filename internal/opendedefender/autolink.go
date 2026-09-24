package opendedefender

import (
	"fmt"
	"log"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"github.com/Bragoo312/defender-eye/internal/config"
)

const (
	DefaultOpenDefenderConfigPath = "/etc/open-defender/config.yaml"
)

// LinkStatus represents the current status of local Open Defender integration
type LinkStatus struct {
	ConfigFound   bool   `json:"config_found"`
	ConfigPath    string `json:"config_path"`
	ExporterReady bool   `json:"exporter_ready"`
	KeyMatched    bool   `json:"key_matched"`
	ServiceActive bool   `json:"service_active"`
	Connected     bool   `json:"connected"`
	Message       string `json:"message"`
}

// FindOpenDefenderConfigFile searches known standard paths for Open Defender's config.yaml
func FindOpenDefenderConfigFile() string {
	candidates := []string{
		DefaultOpenDefenderConfigPath,
		"/opt/open-defender/config.yaml",
		"/usr/local/open-defender/config.yaml",
		"./open-defender.yaml",
	}
	for _, p := range candidates {
		if fi, err := os.Stat(p); err == nil && !fi.IsDir() {
			return p
		}
	}
	return ""
}

// GetPortFromBindAddress extracts the numeric port from host:port or :port
func GetPortFromBindAddress(bindAddr string) int {
	_, portStr, err := net.SplitHostPort(bindAddr)
	if err == nil {
		if p, err := strconv.Atoi(portStr); err == nil && p > 0 {
			return p
		}
	}
	clean := strings.TrimPrefix(bindAddr, ":")
	if p, err := strconv.Atoi(clean); err == nil && p > 0 {
		return p
	}
	return 8080
}

// CheckLinkStatus inspects local system state, config file and agent connection
func CheckLinkStatus(cfg *config.Config, s *Server) LinkStatus {
	st := LinkStatus{
		ConfigPath: FindOpenDefenderConfigFile(),
	}

	if st.ConfigPath != "" {
		st.ConfigFound = true
		if content, err := os.ReadFile(st.ConfigPath); err == nil {
			str := string(content)
			targetKey := ""
			if s != nil {
				targetKey = s.GetPublicKeyBase64()
			}
			st.ExporterReady = strings.Contains(str, "enabled: true") && strings.Contains(str, "/ws/agent")
			if targetKey != "" && strings.Contains(str, targetKey) {
				st.KeyMatched = true
			}
		}
	}

	// Check if open-defender systemd service is active
	cmd := exec.Command("systemctl", "is-active", "--quiet", "open-defender")
	if err := cmd.Run(); err == nil {
		st.ServiceActive = true
	}

	// Check if agent is currently connected over WebSocket
	if s != nil {
		for _, ag := range s.GetAgents() {
			if ag.Connected {
				st.Connected = true
				break
			}
		}
	}

	if st.Connected {
		st.Message = "Open Defender подключен и передает телеметрию (E2EE WebSocket активен)"
	} else if st.ConfigFound && st.KeyMatched && st.ServiceActive {
		st.Message = "Служба Open Defender активна, ожидает установки WebSocket-сессии"
	} else if st.ConfigFound && st.KeyMatched {
		st.Message = "Конфигурация привязана к Defender Eye (служба не запущена)"
	} else if st.ConfigFound {
		st.Message = "Обнаружен /etc/open-defender/config.yaml, требуется привязка E2EE ключа"
	} else {
		st.Message = "Open Defender не обнаружен на сервере"
	}

	return st
}

// AutoLinkOpenDefender reads /etc/open-defender/config.yaml and updates the exporter section
// with Defender Eye's endpoint address and RSA public key, then restarts the open-defender daemon.
func AutoLinkOpenDefender(cfg *config.Config, s *Server) (bool, string, error) {
	if s == nil {
		return false, "E2EE сервер Open Defender не инициализирован", nil
	}

	configPath := FindOpenDefenderConfigFile()
	if configPath == "" {
		return false, "Файл конфигурации Open Defender не найден на диске", nil
	}

	pubKey := s.GetPublicKeyBase64()
	if pubKey == "" {
		return false, "Публичный RSA ключ сервера пуст", nil
	}

	port := GetPortFromBindAddress(cfg.Server.BindAddress)
	targetEndpoint := fmt.Sprintf("ws://127.0.0.1:%d/ws/agent", port)

	rawBytes, err := os.ReadFile(configPath)
	if err != nil {
		return false, "", fmt.Errorf("чтение %s: %w", configPath, err)
	}
	content := string(rawBytes)

	// Check if already linked correctly
	if strings.Contains(content, pubKey) &&
		strings.Contains(content, targetEndpoint) &&
		strings.Contains(content, "enabled: true") {
		return false, "Open Defender уже привязан к текущему порту и ключу панели", nil
	}

	// Create backup
	backupPath := configPath + ".bak"
	_ = os.WriteFile(backupPath, rawBytes, 0640)

	exporterBlock := fmt.Sprintf(`exporter:
  enabled: true
  endpoint_address: %s
  user_id: server_admin
  config_id: main_server
  endpoint_rsa_public_key: %s`, targetEndpoint, pubKey)

	// Replace existing exporter block or append
	exporterRe := regexp.MustCompile(`(?m)^exporter:(\s*\n(\s+.*\n)*|\s*\n)`)
	var updatedContent string
	if exporterRe.MatchString(content) {
		updatedContent = exporterRe.ReplaceAllString(content, exporterBlock+"\n")
	} else {
		updatedContent = content + "\n\n" + exporterBlock + "\n"
	}

	if err := os.WriteFile(configPath, []byte(updatedContent), 0640); err != nil {
		return false, "", fmt.Errorf("запись %s: %w", configPath, err)
	}

	// Restart open-defender service
	restartCmd := exec.Command("sudo", "-n", "systemctl", "restart", "open-defender")
	if err := restartCmd.Run(); err != nil {
		cmdFallback := exec.Command("systemctl", "restart", "open-defender")
		_ = cmdFallback.Run()
	}

	log.Printf("[OpenDefender] ✓ Auto-linked %s to Defender Eye on port %d", configPath, port)
	return true, fmt.Sprintf("Open Defender успешно привязан (%s) и служба перезапущена", targetEndpoint), nil
}

// ApplyFullConfigLocally writes user-provided YAML directly to Open Defender's config file and restarts service
func ApplyFullConfigLocally(yamlContent string) (string, error) {
	configPath := FindOpenDefenderConfigFile()
	if configPath == "" {
		configPath = DefaultOpenDefenderConfigPath
		if dir := filepath.Dir(configPath); dir != "" {
			_ = os.MkdirAll(dir, 0755)
		}
	}

	// Backup existing config
	if existing, err := os.ReadFile(configPath); err == nil {
		_ = os.WriteFile(configPath+".bak", existing, 0640)
	}

	if err := os.WriteFile(configPath, []byte(yamlContent), 0640); err != nil {
		return "", fmt.Errorf("не удалось записать %s: %w", configPath, err)
	}

	// Restart service
	cmd := exec.Command("sudo", "-n", "systemctl", "restart", "open-defender")
	if err := cmd.Run(); err != nil {
		cmdFallback := exec.Command("systemctl", "restart", "open-defender")
		_ = cmdFallback.Run()
	}

	return fmt.Sprintf("Конфигурация успешно сохранена в %s и служба open-defender перезапущена", configPath), nil
}
