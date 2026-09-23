import type { DashboardStats, SecurityEvent, IPInfo, BlockInfo, SystemMetric, PortStat, Settings, ListeningPort } from '../types';

const BASE_URL = '';

export async function getStats(): Promise<DashboardStats> {
  const res = await fetch(`${BASE_URL}/api/v1/stats`);
  if (!res.ok) throw new Error('Failed to fetch stats');
  return res.json();
}

export async function getEvents(params: {
  limit?: number;
  offset?: number;
  monitor?: string;
  severity?: string;
  action?: string;
  ip?: string;
  country?: string;
  search?: string;
}): Promise<{ events: SecurityEvent[]; total: number; limit: number; offset: number }> {
  const query = new URLSearchParams();
  if (params.limit !== undefined && params.limit !== null) query.set('limit', params.limit.toString());
  if (params.offset !== undefined && params.offset !== null) query.set('offset', params.offset.toString());
  if (params.monitor) query.set('monitor', params.monitor);
  if (params.severity) query.set('severity', params.severity);
  if (params.action) query.set('action', params.action);
  if (params.ip) query.set('ip', params.ip);
  if (params.country) query.set('country', params.country);
  if (params.search) query.set('search', params.search);

  const res = await fetch(`${BASE_URL}/api/v1/events?${query.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch events');
  return res.json();
}

export async function getIPs(params: {
  limit?: number;
  offset?: number;
  search?: string;
}): Promise<{ ips: IPInfo[]; total: number; limit: number; offset: number }> {
  const query = new URLSearchParams();
  if (params.limit !== undefined && params.limit !== null) query.set('limit', params.limit.toString());
  if (params.offset !== undefined && params.offset !== null) query.set('offset', params.offset.toString());
  if (params.search) query.set('search', params.search);

  const res = await fetch(`${BASE_URL}/api/v1/ips?${query.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch IPs');
  return res.json();
}

export async function getIPDetails(ip: string): Promise<{ ip: IPInfo; events: SecurityEvent[] }> {
  const res = await fetch(`${BASE_URL}/api/v1/ips/${encodeURIComponent(ip)}`);
  if (!res.ok) throw new Error('Failed to fetch IP details');
  return res.json();
}

export async function getBlocks(params: {
  limit?: number;
  offset?: number;
  status?: string;
}): Promise<{ blocks: BlockInfo[]; total: number; limit: number; offset: number }> {
  const query = new URLSearchParams();
  if (params.limit !== undefined && params.limit !== null) query.set('limit', params.limit.toString());
  if (params.offset !== undefined && params.offset !== null) query.set('offset', params.offset.toString());
  if (params.status) query.set('status', params.status);

  const res = await fetch(`${BASE_URL}/api/v1/blocks?${query.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch blocks');
  return res.json();
}

export async function getPorts(): Promise<PortStat[]> {
  const res = await fetch(`${BASE_URL}/api/v1/ports`);
  if (!res.ok) throw new Error('Failed to fetch ports');
  return res.json();
}

export async function getSSH(params: {
  limit?: number;
  offset?: number;
}): Promise<{ events: SecurityEvent[]; total: number }> {
  const query = new URLSearchParams();
  if (params.limit) query.set('limit', params.limit.toString());
  if (params.offset) query.set('offset', params.offset.toString());

  const res = await fetch(`${BASE_URL}/api/v1/ssh?${query.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch SSH events');
  return res.json();
}

export async function getSystemMetrics(): Promise<SystemMetric[]> {
  const res = await fetch(`${BASE_URL}/api/v1/metrics/system`);
  if (!res.ok) throw new Error('Failed to fetch system metrics');
  return res.json();
}

export async function getSettings(): Promise<Settings> {
  const res = await fetch(`${BASE_URL}/api/v1/settings`);
  if (!res.ok) throw new Error('Failed to fetch settings');
  return res.json();
}

export async function updateSettings(data: {
  demo_mode?: boolean;
  retention_days?: number;
}): Promise<Settings> {
  const res = await fetch(`${BASE_URL}/api/v1/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update settings');
  return res.json();
}

export function subscribeRealtime(
  onEvent: (event: SecurityEvent) => void,
  onConnected?: (connected: boolean) => void
): () => void {
  // Use Server-Sent Events (SSE) for reliable native reconnection
  const eventSource = new EventSource(`${BASE_URL}/api/v1/events/stream`);

  eventSource.onopen = () => {
    onConnected?.(true);
  };

  eventSource.onmessage = (msg) => {
    try {
      const data = JSON.parse(msg.data);
      if (data.type === 'security_event' && data.event) {
        onEvent(data.event);
      }
    } catch {
      // ignore parse error
    }
  };

  eventSource.onerror = () => {
    onConnected?.(false);
  };

  return () => {
    eventSource.close();
  };
}

export interface GeoIPStatus {
  enabled: boolean;
  active: boolean;
  path: string;
  exists: boolean;
  size_mb: string;
  updated_at: string;
}

export async function getGeoIPStatus(): Promise<GeoIPStatus> {
  const res = await fetch(`${BASE_URL}/api/v1/geoip/status`);
  if (!res.ok) throw new Error('Failed to fetch GeoIP status');
  return res.json();
}

export async function updateGeoIP(): Promise<{ status: string; message: string; size_mb: string; path: string }> {
  const res = await fetch(`${BASE_URL}/api/v1/geoip/update`, {
    method: 'POST',
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'Не удалось обновить базу данных GeoIP');
  }
  return res.json();
}

export interface AgentInfo {
  config_id: string;
  user_id?: string;
  agent_version?: string;
  connected: boolean;
  remote_addr?: string;
  config?: any;
}

export async function getAgents(): Promise<{ enabled: boolean; agents: AgentInfo[] }> {
  const res = await fetch(`${BASE_URL}/api/v1/opendedefender/agents`);
  if (!res.ok) throw new Error('Failed to fetch Open Defender agents');
  return res.json();
}

export async function pushAgentConfig(configID: string, configData: any): Promise<{ status: string; message: string }> {
  const res = await fetch(`${BASE_URL}/api/v1/opendedefender/agents/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      config_id: configID,
      config: configData,
    }),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'Не удалось отправить конфигурацию на агент');
  }
  return res.json();
}

export async function executeIPAction(
  ip: string,
  action: 'ban' | 'unban' | 'whitelist',
  duration: 'permanent' | '1h' | '24h' = 'permanent'
): Promise<{ status: string; message: string }> {
  const res = await fetch(`${BASE_URL}/api/v1/ip/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ip, action, duration }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || 'Не удалось выполнить действие над IP');
  }
  return res.json();
}

export interface EbpfPatchStatus {
  file_exists: boolean;
  binary_exists?: boolean;
  binary_path?: string;
  agent_version?: string;
  status: 'already_patched' | 'patch_needed' | 'not_found' | 'read_error';
  patch_needed: boolean;
  file_path: string;
  message: string;
}

export async function getEbpfPatchStatus(): Promise<EbpfPatchStatus> {
  const res = await fetch(`${BASE_URL}/api/v1/patch/ebpf/status`);
  if (!res.ok) throw new Error('Failed to fetch eBPF patch status');
  return res.json();
}

export async function applyEbpfPatch(): Promise<{ status: string; message: string; backup_path?: string }> {
  const res = await fetch(`${BASE_URL}/api/v1/patch/ebpf/apply`, {
    method: 'POST',
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || 'Не удалось применить патч eBPF');
  }
  return res.json();
}

export async function getListeningPorts(): Promise<{ ports: ListeningPort[]; count: number }> {
  const res = await fetch(`${BASE_URL}/api/v1/ports/listening`);
  if (!res.ok) throw new Error('Failed to fetch listening ports');
  return res.json();
}
