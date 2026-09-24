package system

import (
	"bufio"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

var (
	cachedSSHPort   int
	lastSSHPortTime time.Time
	sshPortMu       sync.RWMutex
	portRegex       = regexp.MustCompile(`(?i)^\s*Port\s+(\d+)`)
	listenStreamRe  = regexp.MustCompile(`(?i)^\s*ListenStream\s*=\s*(?:.*:)?(\d+)`)
)

// GetSSHPort inspects sshd_config and systemd socket definitions to find the real SSH port.
// Defaults to 22 if not custom configured or if unreadable.
func GetSSHPort() int {
	sshPortMu.RLock()
	if cachedSSHPort > 0 && time.Since(lastSSHPortTime) < 30*time.Second {
		port := cachedSSHPort
		sshPortMu.RUnlock()
		return port
	}
	sshPortMu.RUnlock()

	sshPortMu.Lock()
	defer sshPortMu.Unlock()

	detected := detectSSHPortOnSystem()
	cachedSSHPort = detected
	lastSSHPortTime = time.Now()
	return detected
}

func detectSSHPortOnSystem() int {
	// 1. Check /etc/ssh/sshd_config.d/*.conf
	if matches, err := filepath.Glob("/etc/ssh/sshd_config.d/*.conf"); err == nil {
		for _, file := range matches {
			if p := parsePortFromFile(file, portRegex); p > 0 {
				return p
			}
		}
	}

	// 2. Check /etc/ssh/sshd_config
	if p := parsePortFromFile("/etc/ssh/sshd_config", portRegex); p > 0 {
		return p
	}

	// 3. Check systemd socket activation (/etc/systemd/system/ssh.socket.d/*.conf, /lib/systemd/system/ssh.socket)
	if matches, err := filepath.Glob("/etc/systemd/system/ssh.socket.d/*.conf"); err == nil {
		for _, file := range matches {
			if p := parsePortFromFile(file, listenStreamRe); p > 0 {
				return p
			}
		}
	}
	if p := parsePortFromFile("/lib/systemd/system/ssh.socket", listenStreamRe); p > 0 {
		return p
	}

	return 22
}

func parsePortFromFile(filePath string, re *regexp.Regexp) int {
	f, err := os.Open(filePath)
	if err != nil {
		return 0
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if strings.HasPrefix(line, "#") {
			continue
		}
		if m := re.FindStringSubmatch(line); len(m) > 1 {
			if p, err := strconv.Atoi(m[1]); err == nil && p > 0 && p <= 65535 {
				return p
			}
		}
	}
	return 0
}

// GetSSHServiceName detects whether systemd uses "ssh" (Debian/Ubuntu) or "sshd" (RHEL/CentOS/Fedora)
func GetSSHServiceName() string {
	// 1. Check Debian/Ubuntu systemd units
	debianUnits := []string{
		"/lib/systemd/system/ssh.service",
		"/usr/lib/systemd/system/ssh.service",
		"/etc/systemd/system/ssh.service",
	}
	for _, u := range debianUnits {
		if fi, err := os.Stat(u); err == nil && !fi.IsDir() {
			return "ssh"
		}
	}

	// 2. Check RHEL/CentOS systemd units
	rhelUnits := []string{
		"/lib/systemd/system/sshd.service",
		"/usr/lib/systemd/system/sshd.service",
		"/etc/systemd/system/sshd.service",
	}
	for _, u := range rhelUnits {
		if fi, err := os.Stat(u); err == nil && !fi.IsDir() {
			return "sshd"
		}
	}

	// 3. Fallback based on /etc/os-release
	if data, err := os.ReadFile("/etc/os-release"); err == nil {
		content := strings.ToLower(string(data))
		if strings.Contains(content, "debian") || strings.Contains(content, "ubuntu") {
			return "ssh"
		}
	}

	return "sshd"
}

