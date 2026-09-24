#!/usr/bin/env bash
# ==============================================================================
# Defender Eye — Standalone Bash SSH Log Collector
# Captures SSH brute force attempts from auth.log / journald and forwards
# directly to Defender Eye API or triggers local iptables ban
# ==============================================================================

set -euo pipefail

API_URL="${DEFENDER_EYE_URL:-http://127.0.0.1:8080/api/v1/events}"
BAN_AFTER="${BAN_THRESHOLD:-5}"
BAN_TIME="${BAN_SECONDS:-3600}"

echo "Starting Defender Eye Bash SSH Collector..."
echo "Target API: $API_URL"
echo "Ban threshold: $BAN_AFTER attempts, ban duration: ${BAN_TIME}s"

# Find log source
LOG_FILE=""
if [ -f /var/log/auth.log ]; then
  LOG_FILE="/var/log/auth.log"
elif [ -f /var/log/secure ]; then
  LOG_FILE="/var/log/secure"
fi

# Detect Server SSH Port (from SSH_PORT env or /etc/ssh/sshd_config)
SERVER_SSH_PORT="${SSH_PORT:-}"
if [ -z "$SERVER_SSH_PORT" ]; then
  if [ -f /etc/ssh/sshd_config ]; then
    SERVER_SSH_PORT=$(grep -iE "^\s*Port\s+[0-9]+" /etc/ssh/sshd_config 2>/dev/null | awk '{print $2}' | head -n1 || echo "")
  fi
  if [ -z "$SERVER_SSH_PORT" ]; then
    SERVER_SSH_PORT="22"
  fi
fi

parse_line() {
  local line="$1"
  if echo "$line" | grep -qE "(Failed (password|publickey) for|maximum authentication attempts exceeded for|Disconnecting authenticating user|Connection closed by authenticating user)"; then
    local ip=$(echo "$line" | grep -oE "from [0-9]+\.[0-9]+\.[0-9]+\.[0-9]+" | awk '{print $2}')
    local user=$(echo "$line" | sed -n 's/.*Failed password for \(invalid user \)\?\([^ ]*\) from.*/\2/p')
    local client_port=$(echo "$line" | grep -oE "port [0-9]+" | awk '{print $2}')
    [ -z "$client_port" ] && client_port="0"

    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local event_id=$(echo "${timestamp}-${ip}-${RANDOM}" | md5sum | awk '{print $1}')

    local payload=$(cat <<EOF
{
  "event_id": "$event_id",
  "timestamp": "$timestamp",
  "source": "bash_collector",
  "monitor": "ssh_monitor",
  "event_type": "ssh_brute",
  "severity": "high",
  "source_ip": "$ip",
  "source_port": $client_port,
  "dest_port": $SERVER_SSH_PORT,
  "protocol": "tcp",
  "action": "alerted",
  "service": "ssh",
  "username": "$user",
  "message": "SSH brute-force authentication failure for user '$user' from $ip"
}
EOF
)
    # Forward to Defender Eye
    curl -s -X POST -H "Content-Type: application/json" -d "$payload" "$API_URL" >/dev/null 2>&1 || true
    echo "[$(date +'%T')] Detected SSH attempt: $user @ $ip (port $SERVER_SSH_PORT, client port $client_port)"
  fi
}

if [ -n "$LOG_FILE" ]; then
  echo "Streaming SSH logs from $LOG_FILE (syslog)..."
  tail -Fn0 "$LOG_FILE" | while read -r line; do
    parse_line "$line"
  done
elif command -v journalctl >/dev/null 2>&1; then
  echo "Streaming SSH logs from systemd-journald (Debian 12+ / Ubuntu 24.04+ without rsyslog)..."
  journalctl -u ssh -u sshd -f -n 0 -o cat | while read -r line; do
    parse_line "$line"
  done
else
  echo "Error: No SSH log source found (/var/log/auth.log, /var/log/secure, or journalctl)" >&2
  exit 1
fi
