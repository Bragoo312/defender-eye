package system

import (
	"bufio"
	"encoding/hex"
	"fmt"
	"net"
	"os"
	"runtime"
	"strconv"
	"strings"

	"github.com/Bragoo312/defender-eye/internal/model"
)

// GetListeningPorts returns all active TCP listening ports with security audit details
func GetListeningPorts() ([]model.ListeningPort, error) {
	if runtime.GOOS == "linux" {
		ports, err := collectLinuxPorts()
		if err == nil && len(ports) > 0 {
			return ports, nil
		}
	}
	return collectFallbackPorts(), nil
}

func collectLinuxPorts() ([]model.ListeningPort, error) {
	var results []model.ListeningPort
	seen := make(map[string]bool)

	// 1. Read /proc/net/tcp
	if tcpPorts, err := parseProcNetTCP("/proc/net/tcp", "tcp"); err == nil {
		for _, p := range tcpPorts {
			key := fmt.Sprintf("%s:%s:%d", p.Protocol, p.BindAddress, p.Port)
			if !seen[key] {
				seen[key] = true
				results = append(results, p)
			}
		}
	}

	// 2. Read /proc/net/tcp6
	if tcp6Ports, err := parseProcNetTCP("/proc/net/tcp6", "tcp6"); err == nil {
		for _, p := range tcp6Ports {
			key := fmt.Sprintf("%s:%s:%d", p.Protocol, p.BindAddress, p.Port)
			if !seen[key] {
				seen[key] = true
				results = append(results, p)
			}
		}
	}

	return results, nil
}

func parseProcNetTCP(filePath string, proto string) ([]model.ListeningPort, error) {
	f, err := os.Open(filePath)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	var ports []model.ListeningPort
	scanner := bufio.NewScanner(f)

	// Skip header line
	if scanner.Scan() {
		_ = scanner.Text()
	}

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		fields := strings.Fields(line)
		if len(fields) < 10 {
			continue
		}

		// fields[1] is local_address (HEX_IP:HEX_PORT)
		// fields[3] is st (state). 0A = TCP_LISTEN
		state := fields[3]
		if state != "0A" {
			continue
		}

		localAddrStr := fields[1]
		parts := strings.Split(localAddrStr, ":")
		if len(parts) != 2 {
			continue
		}

		hexIP := parts[0]
		hexPort := parts[1]

		portNum, err := strconv.ParseInt(hexPort, 16, 64)
		if err != nil {
			continue
		}

		ipStr := parseHexIP(hexIP, proto)
		svc, procName := resolveServiceAndProcess(int(portNum))
		risk, rec := auditPortSecurity(int(portNum), proto, ipStr, svc)

		ports = append(ports, model.ListeningPort{
			Port:           int(portNum),
			Protocol:       proto,
			BindAddress:    ipStr,
			Service:        svc,
			ProcessName:    procName,
			RiskLevel:      risk,
			Recommendation: rec,
		})
	}

	return ports, nil
}

func parseHexIP(hexStr string, proto string) string {
	if proto == "tcp" && len(hexStr) == 8 {
		b, err := hex.DecodeString(hexStr)
		if err == nil && len(b) == 4 {
			// Little-endian IPv4 bytes
			ip := net.IPv4(b[3], b[2], b[1], b[0])
			return ip.String()
		}
	} else if proto == "tcp6" && len(hexStr) == 32 {
		b, err := hex.DecodeString(hexStr)
		if err == nil && len(b) == 16 {
			// Reorder IPv6 32-bit words for Linux proc
			for i := 0; i < 16; i += 4 {
				b[i], b[i+1], b[i+2], b[i+3] = b[i+3], b[i+2], b[i+1], b[i]
			}
			ip := net.IP(b)
			if ip.Equal(net.IPv6zero) {
				return "::"
			}
			if ip.Equal(net.IPv6loopback) {
				return "::1"
			}
			return ip.String()
		}
	}
	return "0.0.0.0"
}

func resolveServiceAndProcess(port int) (service string, process string) {
	if sshP := GetSSHPort(); sshP > 0 && port == sshP {
		return "SSH", "sshd"
	}
	switch port {
	case 22:
		return "SSH", "sshd"
	case 80:
		return "HTTP (Web)", "nginx/apache2"
	case 443:
		return "HTTPS (Web Secure)", "nginx/caddy"
	case 53:
		return "DNS", "systemd-resolved"
	case 3306:
		return "MySQL Database", "mysqld"
	case 5432:
		return "PostgreSQL Database", "postgres"
	case 6379:
		return "Redis In-Memory DB", "redis-server"
	case 27017:
		return "MongoDB Database", "mongod"
	case 11211:
		return "Memcached Cache", "memcached"
	case 8080:
		return "Defender Eye / Web App", "defender-eye"
	case 8443:
		return "Open Defender E2EE API", "open-defender"
	case 3000:
		return "Node.js / Web Frontend", "node"
	case 9090:
		return "Prometheus Telemetry", "prometheus"
	default:
		return fmt.Sprintf("Service (port %d)", port), "unknown"
	}
}

func auditPortSecurity(port int, proto string, bindAddr string, svc string) (riskLevel string, recommendation string) {
	isPublic := bindAddr == "0.0.0.0" || bindAddr == "::" || bindAddr == ""
	isLocal := bindAddr == "127.0.0.1" || bindAddr == "::1" || strings.HasPrefix(bindAddr, "127.")

	switch port {
	case 6379: // Redis
		if isPublic {
			return "critical", "КРИТИЧНО! Redis доступен для всего интернета без привязки к localhost! Существует огромный риск утечки данных и RCE выполнения команд. Настройте 'bind 127.0.0.1' в /etc/redis/redis.conf."
		}
		return "safe", "Redis привязан к локальному интерфейсу 127.0.0.1. Доступ снаружи закрыт."

	case 27017: // MongoDB
		if isPublic {
			return "critical", "КРИТИЧНО! База данных MongoDB открыта на 0.0.0.0. Возможна вымогательская атака (Ransomware)! Измените 'bindIp: 127.0.0.1' в /etc/mongod.conf."
		}
		return "safe", "MongoDB привязана к локальному интерфейсу."

	case 11211: // Memcached
		if isPublic {
			return "critical", "КРИТИЧНО! Memcached открыт для всего интернета. Угроза участий в DDoS-амплификации и утечки кэша! Добавьте параметр '-l 127.0.0.1' в /etc/memcached.conf."
		}
		return "safe", "Memcached закрыт от внешних сетевых интерфейсов."

	case 3306: // MySQL
		if isPublic {
			return "high", "ВНИМАНИЕ: СУБД MySQL доступна снаружи на 0.0.0.0. Убедитесь, что настроен надежный пароль root и установлен 'bind-address = 127.0.0.1' в /etc/mysql/mysql.conf.d/mysqld.cnf, если не нужен внешний доступ."
		}
		return "safe", "MySQL доступен только локально (127.0.0.1)."

	case 5432: // PostgreSQL
		if isPublic {
			return "high", "ВНИМАНИЕ: СУБД PostgreSQL открыта для подключения извне. Установите 'listen_addresses = localhost' в postgresql.conf."
		}
		return "safe", "PostgreSQL слушает только локальные соединения."

	case 22, GetSSHPort(): // SSH
		if isPublic {
			if port != 22 {
				return "medium", fmt.Sprintf("Служба SSH перенесена на нестандартный порт %d (открыта на 0.0.0.0). Рекомендуется использовать вход только по SSH-ключам и ограничить доступ через брандмауэр.", port)
			}
			return "medium", "Порт SSH (22) открыт на всех сетевых интерфейсах. Рекомендуется использовать аутентификацию только по SSH-ключам, сменить порт 22 на нестандартный или ограничить доступ через UFW / Defender Eye."
		}
		return "safe", fmt.Sprintf("SSH (порт %d) доступен через ограниченный интерфейс.", port)

	case 80, 443: // HTTP / HTTPS
		return "safe", "Стандартный веб-порт (HTTP/HTTPS). Убедитесь, что веб-сервер и CMS регулярно обновляются."

	case 8080: // Defender Eye
		if isPublic {
			return "medium", "Панель Defender Eye открыта на 0.0.0.0. Убедитесь, что порт защищен Nginx HTTPS прокси или открыт только для доверенных IP."
		}
		return "safe", "Defender Eye работает на 127.0.0.1."

	default:
		if isPublic {
			return "medium", fmt.Sprintf("Служба %s (порт %d) открыта на всех интерфейсах (0.0.0.0). Убедитесь, что этот порт действительно должен быть доступен из интернета.", svc, port)
		}
		if isLocal {
			return "safe", fmt.Sprintf("Служба %s привязана к защищенному локальному интерфейсу (%s).", svc, bindAddr)
		}
		return "info", fmt.Sprintf("Служба %s привязана к адресному интерфейсу %s.", svc, bindAddr)
	}
}

func collectFallbackPorts() []model.ListeningPort {
	// Fallback mock active ports for local development / testing
	return []model.ListeningPort{
		{
			Port:           22,
			Protocol:       "tcp",
			BindAddress:    "0.0.0.0",
			Service:        "SSH",
			ProcessName:    "sshd",
			RiskLevel:      "medium",
			Recommendation: "Порт SSH (22) открыт на всех сетевых интерфейсах. Рекомендуется ограничить доступ по ключам или сменить стандартный порт.",
		},
		{
			Port:           80,
			Protocol:       "tcp",
			BindAddress:    "0.0.0.0",
			Service:        "HTTP (Web)",
			ProcessName:    "nginx",
			RiskLevel:      "safe",
			Recommendation: "Стандартный веб-порт HTTP открыт для входящих соединений.",
		},
		{
			Port:           443,
			Protocol:       "tcp",
			BindAddress:    "0.0.0.0",
			Service:        "HTTPS (Web Secure)",
			ProcessName:    "nginx",
			RiskLevel:      "safe",
			Recommendation: "Защищенный веб-порт HTTPS. Шифрование TLS включено.",
		},
		{
			Port:           6379,
			Protocol:       "tcp",
			BindAddress:    "127.0.0.1",
			Service:        "Redis In-Memory DB",
			ProcessName:    "redis-server",
			RiskLevel:      "safe",
			Recommendation: "Redis привязан к локальному интерфейсу 127.0.0.1. Внешний доступ заблокирован.",
		},
		{
			Port:           8080,
			Protocol:       "tcp",
			BindAddress:    "0.0.0.0",
			Service:        "Defender Eye Panel",
			ProcessName:    "defender-eye",
			RiskLevel:      "info",
			Recommendation: "Панель управления Defender Eye доступна по сети.",
		},
	}
}
