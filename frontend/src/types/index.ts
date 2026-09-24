export interface SecurityEvent {
  id: number;
  event_id: string;
  timestamp: string;
  source: string;
  monitor: string;
  event_type: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  source_ip: string;
  source_port: number;
  dest_port: number;
  protocol: string;
  action: 'blocked' | 'alerted' | 'logged';
  service: string;
  username?: string;
  message: string;
  country_code: string;
  country_name: string;
  city: string;
  latitude: number;
  longitude: number;
  asn: number;
  as_org: string;
  raw_data?: string;
}

export interface IPInfo {
  ip: string;
  country_code: string;
  country_name: string;
  city: string;
  latitude: number;
  longitude: number;
  asn: number;
  as_org: string;
  first_seen: string;
  last_seen: string;
  total_events: number;
  is_banned: boolean;
  last_action: string;
}

export interface BlockInfo {
  id: number;
  ip: string;
  banned_at: string;
  expires_at: string;
  ban_seconds: number;
  reason: string;
  monitor: string;
  status: 'active' | 'expired' | 'unbanned';
}

export interface SystemMetric {
  id: number;
  timestamp: string;
  cpu_percent: number;
  ram_used_bytes: number;
  ram_total_bytes: number;
  swap_used_bytes: number;
  swap_total_bytes: number;
  disk_used_bytes: number;
  disk_total_bytes: number;
  load_avg_1: number;
  load_avg_5: number;
  load_avg_15: number;
  net_rx_bytes_sec: number;
  net_tx_bytes_sec: number;
}

export interface CountryStat {
  country_code: string;
  country_name: string;
  count: number;
  percentage: number;
}

export interface PortStat {
  port: number;
  service: string;
  count: number;
}

export interface ServerLocation {
  ip: string;
  city: string;
  country_code: string;
  country_name: string;
  latitude: number;
  longitude: number;
}

export interface DashboardStats {
  events_total_24h: number;
  events_total_7d: number;
  unique_ips_24h: number;
  blocked_ips_active: number;
  total_blocks: number;
  top_countries: CountryStat[];
  top_ports: PortStat[];
  recent_events: SecurityEvent[];
  recent_blocks: BlockInfo[];
  current_system: SystemMetric;
  server_location?: ServerLocation;
  ssh_port?: number;
  ssh_service_name?: string;
}

export interface Settings {
  retention_days: number;
  demo_mode: boolean;
  geoip_enabled: boolean;
  open_defender_key: string;
  bind_address: string;
  default_ban_seconds: number;
}

export interface ListeningPort {
  port: number;
  protocol: string;
  bind_address: string;
  service: string;
  process_name: string;
  risk_level: 'critical' | 'high' | 'medium' | 'safe' | 'info';
  recommendation: string;
}
