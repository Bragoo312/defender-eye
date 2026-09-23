package system

import (
	"bufio"
	"fmt"
	"os"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/Bragoo312/defender-eye/internal/model"
)

type Collector struct {
	mu           sync.Mutex
	lastCPUTotal uint64
	lastCPUIdle  uint64
	lastNetRX    uint64
	lastNetTX    uint64
	lastSample   time.Time
}

func NewCollector() *Collector {
	return &Collector{
		lastSample: time.Now(),
	}
}

func (c *Collector) Collect() model.SystemMetric {
	c.mu.Lock()
	defer c.mu.Unlock()

	now := time.Now().UTC()
	m := model.SystemMetric{
		Timestamp: now,
	}

	if runtime.GOOS == "linux" {
		c.collectLinux(&m)
	} else {
		c.collectFallback(&m)
	}

	c.lastSample = now
	return m
}

func (c *Collector) collectFallback(m *model.SystemMetric) {
	// Fallback for Windows/macOS local development
	var memStats runtime.MemStats
	runtime.ReadMemStats(&memStats)

	m.CPUPercent = 2.5
	m.RAMTotalBytes = 2 * 1024 * 1024 * 1024 // 2 GB
	m.RAMUsedBytes = memStats.Alloc * 4
	m.SwapTotalBytes = 1024 * 1024 * 1024
	m.SwapUsedBytes = 0
	m.DiskTotalBytes = 50 * 1024 * 1024 * 1024
	m.DiskUsedBytes = 12 * 1024 * 1024 * 1024
	m.LoadAvg1 = 0.15
	m.LoadAvg5 = 0.22
	m.LoadAvg15 = 0.18
	m.NetRxBytesSec = 1024 * 15
	m.NetTxBytesSec = 1024 * 8
}

func (c *Collector) collectLinux(m *model.SystemMetric) {
	// 1. /proc/meminfo
	if f, err := os.Open("/proc/meminfo"); err == nil {
		scanner := bufio.NewScanner(f)
		var memTotal, memAvailable, swapTotal, swapFree uint64
		for scanner.Scan() {
			line := scanner.Text()
			fields := strings.Fields(line)
			if len(fields) >= 2 {
				val, _ := strconv.ParseUint(fields[1], 10, 64)
				val *= 1024 // kB to bytes
				switch fields[0] {
				case "MemTotal:":
					memTotal = val
				case "MemAvailable:":
					memAvailable = val
				case "SwapTotal:":
					swapTotal = val
				case "SwapFree:":
					swapFree = val
				}
			}
		}
		_ = f.Close()

		m.RAMTotalBytes = memTotal
		if memTotal >= memAvailable {
			m.RAMUsedBytes = memTotal - memAvailable
		}
		m.SwapTotalBytes = swapTotal
		if swapTotal >= swapFree {
			m.SwapUsedBytes = swapTotal - swapFree
		}
	}

	// 2. /proc/loadavg
	if data, err := os.ReadFile("/proc/loadavg"); err == nil {
		fields := strings.Fields(string(data))
		if len(fields) >= 3 {
			_, _ = fmt.Sscanf(fields[0], "%f", &m.LoadAvg1)
			_, _ = fmt.Sscanf(fields[1], "%f", &m.LoadAvg5)
			_, _ = fmt.Sscanf(fields[2], "%f", &m.LoadAvg15)
		}
	}

	// 3. /proc/stat for CPU
	if f, err := os.Open("/proc/stat"); err == nil {
		scanner := bufio.NewScanner(f)
		for scanner.Scan() {
			line := scanner.Text()
			if strings.HasPrefix(line, "cpu ") {
				fields := strings.Fields(line)
				if len(fields) >= 5 {
					var total, idle uint64
					for i := 1; i < len(fields); i++ {
						v, _ := strconv.ParseUint(fields[i], 10, 64)
						total += v
						if i == 4 { // idle
							idle = v
						}
					}

					if c.lastCPUTotal > 0 && total > c.lastCPUTotal {
						diffTotal := float64(total - c.lastCPUTotal)
						diffIdle := float64(idle - c.lastCPUIdle)
						m.CPUPercent = (1.0 - (diffIdle / diffTotal)) * 100.0
						if m.CPUPercent < 0 {
							m.CPUPercent = 0
						}
					}
					c.lastCPUTotal = total
					c.lastCPUIdle = idle
				}
				break
			}
		}
		_ = f.Close()
	}

	// 4. Network RX/TX from /proc/net/dev
	if f, err := os.Open("/proc/net/dev"); err == nil {
		scanner := bufio.NewScanner(f)
		var currentRX, currentTX uint64
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if strings.Contains(line, ":") {
				parts := strings.SplitN(line, ":", 2)
				if len(parts) == 2 {
					iface := strings.TrimSpace(parts[0])
					if iface == "lo" {
						continue // skip loopback
					}
					fields := strings.Fields(parts[1])
					if len(fields) >= 9 {
						rx, _ := strconv.ParseUint(fields[0], 10, 64)
						tx, _ := strconv.ParseUint(fields[8], 10, 64)
						currentRX += rx
						currentTX += tx
					}
				}
			}
		}
		_ = f.Close()

		elapsed := time.Since(c.lastSample).Seconds()
		if elapsed > 0 && c.lastNetRX > 0 {
			if currentRX >= c.lastNetRX {
				m.NetRxBytesSec = float64(currentRX-c.lastNetRX) / elapsed
			}
			if currentTX >= c.lastNetTX {
				m.NetTxBytesSec = float64(currentTX-c.lastNetTX) / elapsed
			}
		}
		c.lastNetRX = currentRX
		c.lastNetTX = currentTX
	}
}
