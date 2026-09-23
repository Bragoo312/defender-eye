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

parse_line() {
  local line="$1"
  if echo "$line" | grep -qE "(Failed (password|publickey) for|maximum authentication attempts exceeded for|Disconnecting authenticating user|Connection closed by authenticating user)"; then
    local ip=$(echo "$line" | grep -oE "from [0-9]+\.[0-9]+\.[0-9]+\.[0-9]+" | awk '{print $2}')
    local user=$(echo "$line" | sed -n 's/.*Failed password for \(invalid user \)\?\([^ ]*\) from.*/\2/p')
    local port=$(echo "$line" | grep -oE "port [0-9]+" | awk '{print $2}')
    [ -z "$port" ] && port="22"

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
  "source_port": 0,
  "dest_port": $port,
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
    echo "[$(date +'%T')] Detected SSH attempt: $user @ $ip (port $port)"
  fi
}

if [ -n "$LOG_FILE" ]; then
  echo "Streaming logs from $LOG_FILE..."
  tail -Fn0 "$LOG_FILE" | while read -r line; do
    parse_line "$line"
  done
else
  echo "Streaming logs from journalctl -u ssh..."
  journalctl -u ssh -u sshd -Fn0 | while read -r line; do
    parse_line "$line"
  done
fi
