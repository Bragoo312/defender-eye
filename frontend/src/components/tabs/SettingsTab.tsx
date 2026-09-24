import { useState, useEffect } from 'react';
import type { Settings, DashboardStats } from '../../types';
import {
  getSettings,
  updateSettings,
  getGeoIPStatus,
  updateGeoIP,
  getAgents,
  pushAgentConfig,
  getEbpfPatchStatus,
  applyEbpfPatch,
  getOpenDefenderLinkStatus,
  autoLinkOpenDefender,
  syncOpenDefenderLocal,
  type GeoIPStatus,
  type AgentInfo,
  type EbpfPatchStatus,
  type OpenDefenderLinkStatus,
} from '../../api/client';
import {
  Settings as SettingsIcon,
  Key,
  Copy,
  Check,
  RotateCw,
  Terminal,
  Database,
  Save,
  Globe,
  Download,
  AlertCircle,
  Send,
  ShieldCheck,
  Sliders,
  Activity,
  Search,
  RotateCcw,
  Shield,
  Wrench,
  CheckCircle2,
  AlertTriangle,
  Zap,
} from 'lucide-react';

interface SettingsTabProps {
  demoMode: boolean;
  onToggleDemoMode: () => void;
  stats?: DashboardStats | null;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({ demoMode, onToggleDemoMode, stats }) => {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [retentionDays, setRetentionDays] = useState(30);
  const [telemetryRate, setTelemetryRate] = useState<string>(() => {
    return localStorage.getItem('defender_telemetry_rate') || '3000';
  });

  const handleTelemetryRateChange = (val: string) => {
    setTelemetryRate(val);
    localStorage.setItem('defender_telemetry_rate', val);
  };

  const [copiedTunnel, setCopiedTunnel] = useState(false);
  const [copiedConfig, setCopiedConfig] = useState(false);
  const [geoStatus, setGeoStatus] = useState<GeoIPStatus | null>(null);
  const [updatingGeo, setUpdatingGeo] = useState(false);
  const [geoMsg, setGeoMsg] = useState<string | null>(null);
  const [geoErr, setGeoErr] = useState<string | null>(null);

  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('server-01');
  const [agentSshMode, setAgentSshMode] = useState<'blocker' | 'logger' | 'disabled'>('blocker');
  const [agentSshEngine, setAgentSshEngine] = useState<'syslog' | 'journal'>('syslog');
  const [agentSshTries, setAgentSshTries] = useState<number>(5);
  const [agentSshWindow, setAgentSshWindow] = useState<number>(300);
  const [agentSshBan, setAgentSshBan] = useState<number>(900);
  const [agentSshPattern, setAgentSshPattern] = useState<string>(
    '(?:\\bFailed (?:password|publickey) for (?:invalid user )?\\S+ from|\\bmaximum authentication attempts exceeded for \\S+ from|\\bDisconnecting authenticating user (?:invalid user )?\\S+|\\bConnection closed by authenticating user (?:invalid user )?\\S+) (?P<ip>(?:\\d{1,3}\\.){3}\\d{1,3})'
  );
  const [agentWebReconMode, setAgentWebReconMode] = useState<'blocker' | 'logger' | 'disabled'>('disabled');
  const [agentWebBruteMode, setAgentWebBruteMode] = useState<'blocker' | 'logger' | 'disabled'>('disabled');
  const [agentDbMode, setAgentDbMode] = useState<'blocker' | 'logger' | 'disabled'>('disabled');
  const [agentWhitelist, setAgentWhitelist] = useState<string>('127.0.0.1');

  // Dynamic port & service detection
  const currentPort = typeof window !== 'undefined' && window.location.port ? window.location.port : '8080';
  const sshPort = stats?.ssh_port || 22;
  const sshServiceName = stats?.ssh_service_name || 'ssh';

  // eBPF Antirecon state
  const [agentEbpfMode, setAgentEbpfMode] = useState<'blocker' | 'logger' | 'disabled'>('logger');
  const [agentEbpfPortsCount, setAgentEbpfPortsCount] = useState<number>(5);
  const [agentEbpfBlacklistPorts, setAgentEbpfBlacklistPorts] = useState<string>('23, 3389');
  const [agentEbpfWhitelistPorts, setAgentEbpfWhitelistPorts] = useState<string>(() => {
    const list = [sshPort, 80, 443];
    const p = parseInt(currentPort, 10);
    if (!isNaN(p) && !list.includes(p)) list.push(p);
    return list.join(', ');
  });

  useEffect(() => {
    if (stats?.ssh_port) {
      setAgentEbpfWhitelistPorts((prev) => {
        const ports = prev.split(',').map((s) => parseInt(s.trim(), 10)).filter((p) => !isNaN(p));
        if (!ports.includes(stats.ssh_port!)) {
          ports.unshift(stats.ssh_port!);
          return ports.join(', ');
        }
        return prev;
      });
    }
  }, [stats?.ssh_port]);

  // Resource Monitor state
  const [agentResourceEnabled, setAgentResourceEnabled] = useState<boolean>(true);
  const [agentResourceCpuWarn, setAgentResourceCpuWarn] = useState<number>(85);
  const [agentResourceRamWarn, setAgentResourceRamWarn] = useState<number>(90);
  const [agentResourceSnapshot, setAgentResourceSnapshot] = useState<boolean>(true);

  const [pushingConfig, setPushingConfig] = useState(false);
  const [pushMsg, setPushMsg] = useState<string | null>(null);
  const [pushErr, setPushErr] = useState<string | null>(null);

  // eBPF Auto-Patcher State
  const [ebpfPatchStatus, setEbpfPatchStatus] = useState<EbpfPatchStatus | null>(null);
  const [checkingPatch, setCheckingPatch] = useState(false);
  const [applyingPatch, setApplyingPatch] = useState(false);
  const [patchMsg, setPatchMsg] = useState<string | null>(null);
  const [patchErr, setPatchErr] = useState<string | null>(null);

  // Open Defender Zero-Touch Link State
  const [linkStatus, setLinkStatus] = useState<OpenDefenderLinkStatus | null>(null);
  const [checkingLink, setCheckingLink] = useState(false);
  const [linking, setLinking] = useState(false);
  const [syncingLocal, setSyncingLocal] = useState(false);
  const [localSyncMsg, setLocalSyncMsg] = useState<string | null>(null);
  const [localSyncErr, setLocalSyncErr] = useState<string | null>(null);

  const checkLinkStatus = async () => {
    setCheckingLink(true);
    try {
      const res = await getOpenDefenderLinkStatus();
      setLinkStatus(res);
    } catch (err) {
      console.error('Failed to get link status:', err);
    } finally {
      setCheckingLink(false);
    }
  };

  const checkPatchStatus = async () => {
    setCheckingPatch(true);
    setPatchErr(null);
    try {
      const res = await getEbpfPatchStatus();
      setEbpfPatchStatus(res);
    } catch (err: any) {
      setPatchErr(err.message || 'Ошибка проверки статуса патча');
    } finally {
      setCheckingPatch(false);
    }
  };

  const handleApplyPatch = async () => {
    setApplyingPatch(true);
    setPatchMsg(null);
    setPatchErr(null);
    try {
      const res = await applyEbpfPatch();
      setPatchMsg(res.message);
      await checkPatchStatus();
    } catch (err: any) {
      setPatchErr(err.message || 'Ошибка применения патча');
    } finally {
      setApplyingPatch(false);
    }
  };

  useEffect(() => {
    checkPatchStatus();
    checkLinkStatus();
  }, []);

  const applyConfigToForm = (c: any) => {
    if (!c) return;
    if (c.ssh_monitor) {
      if (c.ssh_monitor.mode) setAgentSshMode(c.ssh_monitor.mode);
      if (c.ssh_monitor.engine) setAgentSshEngine(c.ssh_monitor.engine === 'journal' ? 'journal' : 'syslog');
      if (c.ssh_monitor.tries) setAgentSshTries(c.ssh_monitor.tries);
      if (c.ssh_monitor.window_seconds) setAgentSshWindow(c.ssh_monitor.window_seconds);
      if (c.ssh_monitor.ban_seconds) setAgentSshBan(c.ssh_monitor.ban_seconds);
      if (c.ssh_monitor.pattern) setAgentSshPattern(c.ssh_monitor.pattern);
    }
    if (c.web_recon_monitor?.mode) setAgentWebReconMode(c.web_recon_monitor.mode);
    if (c.web_brute_monitor?.mode) setAgentWebBruteMode(c.web_brute_monitor.mode);
    if (c.database_monitor?.mode) setAgentDbMode(c.database_monitor.mode);
    if (Array.isArray(c.ip_whitelist)) setAgentWhitelist(c.ip_whitelist.join(', '));

    if (c.ebpf_monitors?.network_antirecon) {
      const e = c.ebpf_monitors.network_antirecon;
      if (e.mode) setAgentEbpfMode(e.mode);
      if (e.ports_count) setAgentEbpfPortsCount(e.ports_count);
      if (Array.isArray(e.blacklist_ports)) setAgentEbpfBlacklistPorts(e.blacklist_ports.join(', '));
      if (Array.isArray(e.whitelist_ports)) setAgentEbpfWhitelistPorts(e.whitelist_ports.join(', '));
    }

    if (c.resource_monitor) {
      const r = c.resource_monitor;
      if (typeof r.enabled === 'boolean') setAgentResourceEnabled(r.enabled);
      if (r.cpu_usage_persentage?.alert) setAgentResourceCpuWarn(r.cpu_usage_persentage.alert);
      if (r.ram_usage_persentage?.alert) setAgentResourceRamWarn(r.ram_usage_persentage.alert);
      if (typeof r.output_top_snaphot_dir === 'string') setAgentResourceSnapshot(Boolean(r.output_top_snaphot_dir));
    }
  };

  useEffect(() => {
    getSettings()
      .then((data) => {
        setSettings(data);
        if (data.retention_days) setRetentionDays(data.retention_days);
      })
      .catch((err) => console.error(err));

    getGeoIPStatus()
      .then((data) => setGeoStatus(data))
      .catch((err) => console.error('Failed to get GeoIP status:', err));

    getAgents()
      .then((res) => {
        if (res.agents && res.agents.length > 0) {
          setAgents(res.agents);
          const first = res.agents[0];
          setSelectedAgentId(first.config_id || 'server-01');
          if (first.config && first.config.config) {
            applyConfigToForm(first.config.config);
          }
        }
      })
      .catch((err) => console.error('Failed to fetch agents:', err));
  }, []);

  const handlePushConfig = async () => {
    setPushingConfig(true);
    setPushMsg(null);
    setPushErr(null);

    const payload = {
      config: {
        exporter: {
          enabled: true,
          endpoint_address: `ws://127.0.0.1:${currentPort}/ws/agent`,
          user_id: 'admin',
          config_id: selectedAgentId || 'server-01',
          endpoint_rsa_public_key: settings?.open_defender_key || '',
        },
        blocked_ips_database: '/var/open-defender/blocked.db',
        ip_whitelist: agentWhitelist
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        ssh_monitor: {
          mode: agentSshMode,
          engine: agentSshEngine,
          log_path: agentSshEngine === 'syslog' ? '/var/log/auth.log' : '',
          unit_name: sshServiceName,
          tries: agentSshTries,
          window_seconds: agentSshWindow,
          ban_seconds: agentSshBan,
          pattern: agentSshPattern,
        },
        web_recon_monitor: {
          mode: agentWebReconMode,
          engine: 'syslog',
          log_path: '/var/log/nginx/access.log',
          unit_name: 'nginx',
          tries: 10,
          window_seconds: 60,
          ban_seconds: 600,
          pattern: '(?P<ip>(?:\\d{1,3}\\.){3}\\d{1,3}) - - \\x5b.*?\\x5d "(?:GET|POST|HEAD) \\S+ HTTP/\\d\\.\\d" 40[34]',
        },
        web_brute_monitor: {
          mode: agentWebBruteMode,
          engine: 'syslog',
          log_path: '/var/log/nginx/access.log',
          unit_name: 'nginx',
          tries: 5,
          window_seconds: 120,
          ban_seconds: 900,
          pattern: '(?P<ip>(?:\\d{1,3}\\.){3}\\d{1,3}) - - \\x5b.*?\\x5d "POST (?:/login|/wp-login\\.php|/admin) HTTP/\\d\\.\\d" 40[13]',
        },
        database_monitor: {
          mode: agentDbMode,
          engine: 'journal',
          log_path: '',
          unit_name: 'postgresql',
          tries: 5,
          window_seconds: 300,
          ban_seconds: 900,
          pattern: 'host=(?P<ip>(?:\\d{1,3}\\.){3}\\d{1,3}).*FATAL:\\s+password authentication failed for user',
        },
        resource_monitor: {
          enabled: agentResourceEnabled,
          cpu_usage_persentage: {
            warning: agentResourceCpuWarn - 20 > 10 ? agentResourceCpuWarn - 20 : 60,
            alert: agentResourceCpuWarn,
          },
          ram_usage_persentage: {
            warning: agentResourceRamWarn - 20 > 10 ? agentResourceRamWarn - 20 : 60,
            alert: agentResourceRamWarn,
          },
          traffic_usage_mbs: { warning: 0, alert: 0 },
          disk_usage_iops: { warning: 0, alert: 0 },
          output_top_snaphot_dir: agentResourceSnapshot ? '/var/log/open-defender/' : '',
        },
        ebpf_monitors: {
          network_antirecon: {
            mode: agentEbpfMode,
            ports_count: agentEbpfPortsCount,
            window_seconds: 300,
            ban_seconds: 900,
            whitelist_ports: agentEbpfWhitelistPorts
              .split(',')
              .map((p) => parseInt(p.trim(), 10))
              .filter((n) => !isNaN(n)),
            blacklist_ports: agentEbpfBlacklistPorts
              .split(',')
              .map((p) => parseInt(p.trim(), 10))
              .filter((n) => !isNaN(n)),
          },
        },
      },
    };

    try {
      const res = await pushAgentConfig(selectedAgentId || 'server-01', payload);
      setPushMsg(res.message || 'Конфигурация успешно отправлена на агент по WebSocket!');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Ошибка отправки конфигурации';
      setPushErr(message);
    } finally {
      setPushingConfig(false);
    }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      const updated = await updateSettings({
        retention_days: retentionDays,
        demo_mode: demoMode,
      });
      setSettings(updated);
    } catch (err) {
      console.error('Failed to save settings:', err);
    } finally {
      setSaving(false);
    }
  };

  const copyText = (text: string, setter: (val: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setter(true);
    setTimeout(() => setter(false), 2000);
  };

  const handleUpdateGeoIP = async () => {
    setUpdatingGeo(true);
    setGeoMsg(null);
    setGeoErr(null);
    try {
      const res = await updateGeoIP();
      setGeoMsg(`База успешно обновлена! (${res.size_mb || 'MMDB'})`);
      const newStatus = await getGeoIPStatus();
      setGeoStatus(newStatus);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Ошибка загрузки базы данных GeoIP';
      setGeoErr(message);
    } finally {
      setUpdatingGeo(false);
    }
  };

  const openDefenderSampleConfig = `# Конфигурация агента Open Defender (/etc/open-defender/config.yaml)
# Этот файл связывает Open Defender с вашей панелью Defender Eye через E2EE WebSocket

exporter:
  enabled: true
  endpoint_address: "ws://127.0.0.1:${currentPort}/ws/agent" # или /ws/collector
  user_id: "admin"
  config_id: "server-01"
  endpoint_rsa_public_key: "${settings?.open_defender_key || 'DEFENDER_EYE_RSA_PUBLIC_KEY'}"

blocked_ips_database: "/var/open-defender/blocked.db"
ip_whitelist: []

# Монитор SSH (защита от перебора паролей)
ssh_monitor:
  mode: "blocker"            # варианты: disabled, logger, blocker
  engine: "syslog"           # syslog, journal или docker
  log_path: "/var/log/auth.log"
  unit_name: "${sshServiceName}"
  tries: 5
  window_seconds: 300
  ban_seconds: 900
  pattern: '(?:\bFailed (?:password|publickey) for (?:invalid user )?\\S+ from|\bmaximum authentication attempts exceeded for \\S+ from|\bDisconnecting authenticating user (?:invalid user )?\\S+|\bConnection closed by authenticating user (?:invalid user )?\\S+) (?P<ip>(?:\\d{1,3}\\.){3}\\d{1,3})'

# Монитор веб-сканирования (поиск скрытых путей/админок)
web_recon_monitor:
  mode: "disabled"
  engine: "syslog"
  log_path: "/var/log/nginx/access.log"
  unit_name: "nginx"
  tries: 10
  window_seconds: 60
  ban_seconds: 600
  pattern: '(?P<ip>(?:\\d{1,3}\\.){3}\\d{1,3}) - - \\[.*?\\] "(?:GET|POST|HEAD) \\S+ HTTP/\\d\\.\\d" 40[34]'

# Монитор перебора паролей веб-форм
web_brute_monitor:
  mode: "disabled"
  engine: "syslog"
  log_path: "/var/log/nginx/access.log"
  unit_name: "nginx"
  tries: 5
  window_seconds: 120
  ban_seconds: 900
  pattern: '(?P<ip>(?:\\d{1,3}\\.){3}\\d{1,3}) - - \\[.*?\\] "POST (?:/login|/wp-login\\.php|/admin) HTTP/\\d\\.\\d" 40[13]'

# Монитор баз данных (PostgreSQL / MySQL)
database_monitor:
  mode: "disabled"
  engine: "journal"
  log_path: "/var/log/postgresql/postgresql.log" # при необходимости укажите актуальный путь к логу вашей СУБД
  unit_name: "postgresql"
  tries: 5
  window_seconds: 300
  ban_seconds: 900
  pattern: 'host=(?P<ip>(?:\\d{1,3}\\.){3}\\d{1,3}).*FATAL:\\s+password authentication failed for user'

# Монитор ресурсов сервера (CPU, RAM, диск, трафик)
resource_monitor:
  enabled: false
  cpu_usage_persentage:
    warning: 60
    alert: 90
  ram_usage_persentage:
    warning: 60
    alert: 90
  traffic_usage_mbs:
    warning: 0
    alert: 0
  disk_usage_iops:
    warning: 0
    alert: 0
  output_top_snaphot_dir: "/var/log/open-defender/"

# eBPF сетевой монитор (защита от сканирования портов)
ebpf_monitors:
  network_antirecon:
    mode: "disabled"
    ports_count: 10
    window_seconds: 300
    ban_seconds: 900
    whitelist_ports: [${agentEbpfWhitelistPorts}]
    blacklist_ports: [${agentEbpfBlacklistPorts}]
`;

  const handleAutoLink = async () => {
    setLinking(true);
    setLocalSyncMsg(null);
    setLocalSyncErr(null);
    try {
      const res = await autoLinkOpenDefender();
      setLocalSyncMsg(res.message);
      await checkLinkStatus();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка привязки Open Defender';
      setLocalSyncErr(msg);
    } finally {
      setLinking(false);
    }
  };

  const handleSyncLocal = async () => {
    setSyncingLocal(true);
    setLocalSyncMsg(null);
    setLocalSyncErr(null);
    try {
      const res = await syncOpenDefenderLocal(openDefenderSampleConfig);
      setLocalSyncMsg(res.message);
      await checkLinkStatus();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка применения конфигурации на сервере';
      setLocalSyncErr(msg);
    } finally {
      setSyncingLocal(false);
    }
  };

  return (
    <div className="space-y-6 pb-12 max-w-5xl">
      {/* Top Banner */}
      <div className="p-4 rounded-2xl bg-[#0f172a]/90 border border-slate-800/80 shadow-lg flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <SettingsIcon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <span>Параметры Defender Eye & Интеграция E2EE</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Управление хранением базы SQLite, ключами шифрования и подключением Open Defender
            </p>
          </div>
        </div>

        <button
          onClick={handleSaveSettings}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-[0_0_15px_rgba(6,182,212,0.3)] transition-all disabled:opacity-50"
        >
          {saving ? <RotateCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          <span>{saving ? 'Сохранение...' : 'Сохранить настройки'}</span>
        </button>
      </div>

      {/* Grid Settings Panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Panel 1: Retention & General */}
        <div className="p-5 rounded-2xl bg-[#0f172a]/90 border border-slate-800/80 shadow-lg space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <span className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Database className="w-4 h-4 text-cyan-400" />
              <span>Хранение и ротация данных (SQLite WAL)</span>
            </span>
          </div>

          <div className="space-y-4 text-xs font-sans">
            <div>
              <label className="block text-slate-300 font-semibold mb-1.5">
                Срок хранения событий (дней):
              </label>
              <select
                value={retentionDays}
                onChange={(e) => setRetentionDays(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-slate-200 text-xs font-mono focus:outline-none focus:border-cyan-500/50"
              >
                <option value={7}>7 дней (минимальный размер базы ~5 МБ)</option>
                <option value={14}>14 дней</option>
                <option value={30}>30 дней (рекомендуется для 2 GB RAM VPS)</option>
                <option value={60}>60 дней</option>
                <option value={90}>90 дней (~50 МБ)</option>
              </select>
              <p className="text-[11px] text-slate-400 mt-1">
                Фоновый сборщик мусора каждые 6 часов очищает устаревшие записи, не блокируя запись.
              </p>
            </div>

            <div className="pt-2 border-t border-slate-800/80">
              <label className="block text-slate-300 font-semibold mb-1.5">
                Частота опроса системной телеметрии:
              </label>
              <select
                value={telemetryRate}
                onChange={(e) => handleTelemetryRateChange(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-slate-200 text-xs font-mono focus:outline-none focus:border-cyan-500/50"
              >
                <option value="1000">⚡ 1 секунда (Реальное время / Быстрый мониторинг)</option>
                <option value="2000">⚡ 2 секунды</option>
                <option value="3000">⚡ 3 секунды (Рекомендуется)</option>
                <option value="5000">⚡ 5 секунд</option>
                <option value="10000">⚡ 10 секунд (Экономия ресурсов CPU)</option>
              </select>
              <p className="text-[11px] text-slate-400 mt-1">
                Параметр задает скорость обновления графиков загрузки CPU, RAM, диска и сетевого трафика.
              </p>
            </div>

            <div className="pt-2 border-t border-slate-800/80">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-slate-300 font-semibold">Симулятор атак (Demo Mode):</div>
                  <div className="text-[11px] text-slate-400">
                    Генерирует реалистичный трафик атак для демонстрации возможностей панели
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onToggleDemoMode}
                  className={`w-12 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors ${
                    demoMode ? 'bg-cyan-500' : 'bg-slate-800'
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                      demoMode ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800/80 space-y-1">
              <div className="text-slate-300 font-semibold">Адрес прослушивания (Bind Address):</div>
              <div className="font-mono text-cyan-400 p-2 bg-slate-900 rounded-lg border border-slate-800">
                {settings?.bind_address || '127.0.0.1:8080'}
              </div>
              <p className="text-[11px] text-slate-400">
                По соображениям безопасности панель открыта только локально на хосте.
              </p>
            </div>
          </div>
        </div>

        {/* Panel 2: GeoIP Status & One-Click Update */}
        <div className="p-5 rounded-2xl bg-[#0f172a]/90 border border-slate-800/80 shadow-lg space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <span className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Globe className="w-4 h-4 text-emerald-400" />
              <span>Автономная база MaxMind GeoIP</span>
            </span>
            <span
              className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                geoStatus?.active
                  ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800/80'
                  : 'bg-amber-950/80 text-amber-400 border-amber-800/80'
              }`}
            >
              {geoStatus?.active ? 'OFFLINE MMDB АКТИВНА' : 'БАЗА НЕ УСТАНОВЛЕНА'}
            </span>
          </div>

          <div className="space-y-4 text-xs font-sans">
            <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Статус резолвера:</span>
                {geoStatus?.active ? (
                  <span className="font-mono font-bold text-emerald-400 flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5" />
                    Работает локально
                  </span>
                ) : (
                  <span className="font-mono font-bold text-amber-400 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" />
                    Мягкий режим (без гео)
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Файл базы данных:</span>
                <span
                  className="font-mono text-slate-300 text-[11px] truncate max-w-[220px]"
                  title={geoStatus?.path}
                >
                  {geoStatus?.path || 'geoip/GeoLite2-City.mmdb'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Размер на диске:</span>
                <span className="font-mono text-cyan-300">
                  {geoStatus?.exists ? geoStatus.size_mb : '0 MB (отсутствует)'}
                </span>
              </div>
              {geoStatus?.updated_at && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Последнее изменение:</span>
                  <span className="font-mono text-slate-400 text-[11px]">
                    {new Date(geoStatus.updated_at).toLocaleString('ru-RU')}
                  </span>
                </div>
              )}
            </div>

            {geoMsg && (
              <div className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 flex items-center gap-2 text-[11px]">
                <Check className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>{geoMsg}</span>
              </div>
            )}

            {geoErr && (
              <div className="p-2.5 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 flex items-center gap-2 text-[11px]">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{geoErr}</span>
              </div>
            )}

            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={handleUpdateGeoIP}
                disabled={updatingGeo}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-[0_0_15px_rgba(16,185,129,0.25)] transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {updatingGeo ? (
                  <>
                    <RotateCw className="w-4 h-4 animate-spin" />
                    <span>Загрузка базы GeoIP (65 МБ, подождите)...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>
                      {geoStatus?.exists ? 'Обновить базу GeoIP сейчас' : 'Скачать базу GeoIP (в 1 клик)'}
                    </span>
                  </>
                )}
              </button>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Загружает свежую базу <code className="text-cyan-400 font-mono">GeoLite2-City.mmdb</code> (~65 МБ)
                напрямую на сервер и мгновенно подключает её «на лету» без перезапуска сервиса.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Panel 2.5: Interactive Agent Configuration Management & E2EE Push */}
      <div className="p-5 rounded-2xl bg-[#0f172a]/90 border border-slate-800/80 shadow-lg space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <span className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <Sliders className="w-4 h-4 text-cyan-400" />
            <span>Управление конфигурацией агента Open Defender (E2EE Push)</span>
          </span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
            WEBSOCKET REALTIME
          </span>
        </div>

        <p className="text-xs text-slate-300 font-sans leading-relaxed">
          Настройте режим защиты, регулярные выражения и лимиты попыток входа прямо из панели. Изменения
          мгновенно отправляются на подключённый агент Open Defender по шифрованному каналу WebSocket.
        </p>

        {agents.length > 0 && (
          <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-between gap-4">
            <div className="text-xs text-slate-400">Выберите агент для настройки:</div>
            <select
              value={selectedAgentId}
              onChange={(e) => {
                setSelectedAgentId(e.target.value);
                const found = agents.find((a) => a.config_id === e.target.value);
                if (found?.config?.config) {
                  const c = found.config.config;
                  if (c.ssh_monitor) {
                    if (c.ssh_monitor.mode) setAgentSshMode(c.ssh_monitor.mode);
                    if (c.ssh_monitor.tries) setAgentSshTries(c.ssh_monitor.tries);
                    if (c.ssh_monitor.window_seconds) setAgentSshWindow(c.ssh_monitor.window_seconds);
                    if (c.ssh_monitor.ban_seconds) setAgentSshBan(c.ssh_monitor.ban_seconds);
                    if (c.ssh_monitor.pattern) setAgentSshPattern(c.ssh_monitor.pattern);
                  }
                  if (c.web_recon_monitor?.mode) setAgentWebReconMode(c.web_recon_monitor.mode);
                  if (c.web_brute_monitor?.mode) setAgentWebBruteMode(c.web_brute_monitor.mode);
                  if (c.database_monitor?.mode) setAgentDbMode(c.database_monitor.mode);
                  if (Array.isArray(c.ip_whitelist)) setAgentWhitelist(c.ip_whitelist.join(', '));
                }
              }}
              className="bg-slate-950 text-cyan-400 text-xs font-mono border border-slate-700 rounded-lg px-3 py-1.5 focus:outline-none focus:border-cyan-500"
            >
              {agents.map((a) => (
                <option key={a.config_id} value={a.config_id}>
                  {a.config_id} ({a.connected ? '🟢 Онлайн' : '⚪ Офлайн'})
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-sans">
          {/* Module 1: SSH Protection */}
          <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-xl space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="text-slate-200 font-semibold flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-cyan-400" />
                <span>1. 🔑 Защита SSH (Входы и брутфорс)</span>
              </div>
              <button
                type="button"
                onClick={() =>
                  setAgentSshPattern(
                    '(?:\\bFailed (?:password|publickey) for (?:invalid user )?\\S+ from|\\bmaximum authentication attempts exceeded for \\S+ from|\\bDisconnecting authenticating user (?:invalid user )?\\S+|\\bConnection closed by authenticating user (?:invalid user )?\\S+) (?P<ip>(?:\\d{1,3}\\.){3}\\d{1,3})'
                  )
                }
                className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-mono"
                title="Сбросить на универсальное выражение"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Сбросить</span>
              </button>
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Режим работы:</label>
              <select
                value={agentSshMode}
                onChange={(e) => setAgentSshMode(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 font-mono text-xs focus:outline-none focus:border-cyan-500"
              >
                <option value="blocker">blocker — Автоблокировка IP в iptables/nftables</option>
                <option value="logger">logger — Только детекция и журнал без бана</option>
                <option value="disabled">disabled — Монитор выключен</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Движок логов (Источник OS):</label>
              <select
                value={agentSshEngine}
                onChange={(e) => setAgentSshEngine(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-cyan-300 font-mono text-xs focus:outline-none focus:border-cyan-500"
              >
                <option value="syslog">syslog — /var/log/auth.log (Debian 10/11, Ubuntu 20.04/22.04)</option>
                <option value="journal">journal — systemd-journald (Debian 12+ Bookworm, Ubuntu 24.04+)</option>
              </select>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-slate-400 mb-1">Попыток:</label>
                <input
                  type="number"
                  value={agentSshTries}
                  onChange={(e) => setAgentSshTries(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-cyan-400 font-mono text-xs focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Окно (сек):</label>
                <input
                  type="number"
                  value={agentSshWindow}
                  onChange={(e) => setAgentSshWindow(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-cyan-400 font-mono text-xs focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Бан (сек):</label>
                <input
                  type="number"
                  value={agentSshBan}
                  onChange={(e) => setAgentSshBan(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-cyan-400 font-mono text-xs focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Универсальный Regex Pattern:</label>
              <textarea
                value={agentSshPattern}
                onChange={(e) => setAgentSshPattern(e.target.value)}
                rows={2}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 font-mono text-[11px] text-cyan-300 focus:outline-none focus:border-cyan-500 leading-relaxed"
              />
            </div>
          </div>

          {/* Module 2: eBPF Network Antirecon */}
          <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-xl space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="text-slate-200 font-semibold flex items-center gap-2">
                <Globe className="w-4 h-4 text-emerald-400" />
                <span>2. 🌐 Детектор сканеров портов (eBPF)</span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                XDP / eBPF
              </span>
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Режим работы:</label>
              <select
                value={agentEbpfMode}
                onChange={(e) => setAgentEbpfMode(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 font-mono text-xs focus:outline-none focus:border-cyan-500"
              >
                <option value="logger">logger — Детекция разведки из коробки (Без бана)</option>
                <option value="blocker">blocker — Блокировка сканеров (iptables/nftables)</option>
                <option value="disabled">disabled — Монитор выключен</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Порог затронутых закрытых портов (ports_count):</label>
              <input
                type="number"
                value={agentEbpfPortsCount}
                onChange={(e) => setAgentEbpfPortsCount(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-emerald-400 font-mono text-xs focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Порты-ловушки (Honeypot blacklist_ports):</label>
              <input
                type="text"
                placeholder="23, 3389"
                value={agentEbpfBlacklistPorts}
                onChange={(e) => setAgentEbpfBlacklistPorts(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-amber-400 font-mono text-xs focus:outline-none focus:border-cyan-500"
              />
              <p className="text-[10px] text-slate-500 mt-1">Касание ловушки мгновенно подсвечивает бота на карте.</p>
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Порты-исключения (whitelist_ports):</label>
              <input
                type="text"
                placeholder="22, 80, 443"
                value={agentEbpfWhitelistPorts}
                onChange={(e) => setAgentEbpfWhitelistPorts(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-300 font-mono text-xs focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* Module 3: Resource & Anti-Mining Monitor */}
          <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-xl space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="text-slate-200 font-semibold flex items-center gap-2">
                <Activity className="w-4 h-4 text-purple-400" />
                <span>3. 📈 Монитор перегрузки и майнинга</span>
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agentResourceEnabled}
                  onChange={(e) => setAgentResourceEnabled(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-950 text-cyan-500 focus:ring-0 cursor-pointer"
                />
                <span>Включен</span>
              </label>
            </div>

            <div>
              <div className="flex justify-between text-slate-400 mb-1">
                <span>Порог тревоги CPU:</span>
                <span className="font-mono text-purple-300">{agentResourceCpuWarn}%</span>
              </div>
              <input
                type="range"
                min="50"
                max="98"
                value={agentResourceCpuWarn}
                onChange={(e) => setAgentResourceCpuWarn(Number(e.target.value))}
                className="w-full accent-purple-500 bg-slate-950 rounded-lg cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-slate-400 mb-1">
                <span>Порог тревоги RAM:</span>
                <span className="font-mono text-purple-300">{agentResourceRamWarn}%</span>
              </div>
              <input
                type="range"
                min="50"
                max="98"
                value={agentResourceRamWarn}
                onChange={(e) => setAgentResourceRamWarn(Number(e.target.value))}
                className="w-full accent-purple-500 bg-slate-950 rounded-lg cursor-pointer"
              />
            </div>

            <div className="pt-1">
              <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agentResourceSnapshot}
                  onChange={(e) => setAgentResourceSnapshot(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-950 text-cyan-500 focus:ring-0 cursor-pointer"
                />
                <span>Автоснимок процессов (Process Snapshot) при атаке</span>
              </label>
            </div>
          </div>

          {/* Module 4 & 5: Web Recon & Web Brute */}
          <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-xl space-y-3 shadow-sm">
            <div className="text-slate-200 font-semibold flex items-center gap-2">
              <Search className="w-4 h-4 text-blue-400" />
              <span>4. 🕸️ Детектор веб-сканеров и брутфорса</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-400 mb-1">Web Recon (сканеры .git/.env):</label>
                <select
                  value={agentWebReconMode}
                  onChange={(e) => setAgentWebReconMode(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-slate-200 font-mono text-[11px]"
                >
                  <option value="blocker">blocker</option>
                  <option value="logger">logger</option>
                  <option value="disabled">disabled</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Web Brute (/wp-login):</label>
                <select
                  value={agentWebBruteMode}
                  onChange={(e) => setAgentWebBruteMode(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-slate-200 font-mono text-[11px]"
                >
                  <option value="blocker">blocker</option>
                  <option value="logger">logger</option>
                  <option value="disabled">disabled</option>
                </select>
              </div>
            </div>

            <p className="text-[10px] text-slate-500 leading-relaxed">
              Анализирует <code className="text-cyan-400">/var/log/nginx/access.log</code> на аномальные ошибочные запросы (403/404/401).
            </p>
          </div>

          {/* Module 6: Database Monitor */}
          <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-xl space-y-3 shadow-sm">
            <div className="text-slate-200 font-semibold flex items-center gap-2">
              <Database className="w-4 h-4 text-amber-400" />
              <span>5. 🗄️ Монитор баз данных (PostgreSQL / MySQL)</span>
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Режим работы:</label>
              <select
                value={agentDbMode}
                onChange={(e) => setAgentDbMode(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 font-mono text-xs"
              >
                <option value="blocker">blocker — Автоблокировка IP при подборе паролей СУБД</option>
                <option value="logger">logger — Только журнал аномалий без бана</option>
                <option value="disabled">disabled — Монитор выключен</option>
              </select>
            </div>

            <p className="text-[10px] text-slate-500 leading-relaxed">
              Отслеживает несанкционированные попытки авторизации в логах СУБД.
            </p>
          </div>

          {/* Module 7: Whitelist */}
          <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-xl space-y-3 shadow-sm">
            <div className="text-slate-200 font-semibold flex items-center gap-2">
              <Shield className="w-4 h-4 text-emerald-400" />
              <span>6. 🛡️ Белый список IP (IP Whitelist)</span>
            </div>

            <div>
              <input
                type="text"
                placeholder="192.168.1.1, 10.0.0.1, 127.0.0.1"
                value={agentWhitelist}
                onChange={(e) => setAgentWhitelist(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-emerald-400 font-mono text-xs focus:outline-none focus:border-emerald-500"
              />
              <p className="text-[10px] text-slate-500 mt-1.5">
                Доверенные IP-адреса через запятую, защищённые от любых типов блокировок.
              </p>
            </div>
          </div>
        </div>

        {localSyncMsg && (
          <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 flex items-center gap-2 text-xs">
            <Check className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{localSyncMsg}</span>
          </div>
        )}

        {localSyncErr && (
          <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 flex items-center gap-2 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{localSyncErr}</span>
          </div>
        )}

        {pushMsg && (
          <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 flex items-center gap-2 text-xs">
            <Check className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{pushMsg}</span>
          </div>
        )}

        {pushErr && (
          <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 flex items-center gap-2 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{pushErr}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={handleSyncLocal}
            disabled={syncingLocal}
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {syncingLocal ? (
              <>
                <RotateCw className="w-4 h-4 animate-spin" />
                <span>Запись в /etc/open-defender/config.yaml...</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                <span>Применить к Open Defender на сервере</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handlePushConfig}
            disabled={pushingConfig}
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-[0_0_20px_rgba(6,182,212,0.3)] transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {pushingConfig ? (
              <>
                <RotateCw className="w-4 h-4 animate-spin" />
                <span>Шифрование и отправка по WebSocket...</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span>Отправить по WebSocket (Push)</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Panel: Open Defender eBPF Endianness & Binary Auto-Patcher */}
      <div className="p-5 rounded-2xl bg-[#0f172a]/90 border border-slate-800/80 shadow-lg space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Wrench className="w-4 h-4 text-amber-400" />
            <span className="text-sm font-semibold text-slate-200">
              Статус eBPF и патчер агента Open Defender
            </span>
          </div>
          <button
            type="button"
            onClick={checkPatchStatus}
            disabled={checkingPatch}
            className="flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 font-mono cursor-pointer disabled:opacity-50"
          >
            <RotateCw className={`w-3.5 h-3.5 ${checkingPatch ? 'animate-spin' : ''}`} />
            <span>{checkingPatch ? 'Проверка...' : 'Проверить статус'}</span>
          </button>
        </div>

        <p className="text-xs text-slate-300 font-sans leading-relaxed">
          Проверка версий и исправление известной проблемы с разворотом IP-адресов и портов задом наперёд в eBPF модуле. Работает как с официальным готовым бинарником (<code className="text-cyan-400 font-mono">v1.3.1+</code>), так и со сборками из исходников.
        </p>

        {/* Status Display Card */}
        {ebpfPatchStatus && (
          <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-2 text-xs font-mono">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Состояние eBPF модуля:</span>
              {ebpfPatchStatus.status === 'already_patched' || !ebpfPatchStatus.patch_needed ? (
                <span className="text-emerald-400 font-bold px-2 py-0.5 bg-emerald-950/80 border border-emerald-800 rounded flex items-center gap-1 text-[11px]">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Патч не требуется (v1.3.1+)
                </span>
              ) : (
                <span className="text-amber-300 font-bold px-2 py-0.5 bg-amber-950/80 border border-amber-800 rounded flex items-center gap-1 text-[11px]">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" /> Рекомендуется патч / обновление
                </span>
              )}
            </div>

            {ebpfPatchStatus.agent_version && (
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Версия подключенного агента:</span>
                <span className="text-cyan-300 font-bold">{ebpfPatchStatus.agent_version}</span>
              </div>
            )}

            {ebpfPatchStatus.binary_path && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-400 shrink-0">Исполняемый файл:</span>
                <span className="text-slate-300 truncate max-w-md font-mono" title={ebpfPatchStatus.binary_path}>
                  {ebpfPatchStatus.binary_path}
                </span>
              </div>
            )}

            {ebpfPatchStatus.file_path && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-400 shrink-0">Файл исходников C:</span>
                <span className="text-cyan-300 truncate max-w-md font-mono" title={ebpfPatchStatus.file_path}>
                  {ebpfPatchStatus.file_path}
                </span>
              </div>
            )}

            <div className="pt-1.5 border-t border-slate-800/80 text-[11px] text-slate-300 font-sans leading-normal">
              {ebpfPatchStatus.message}
            </div>
          </div>
        )}

        {patchMsg && (
          <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 flex items-center gap-2 text-xs font-mono">
            <Check className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{patchMsg}</span>
          </div>
        )}

        {patchErr && (
          <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 flex items-center gap-2 text-xs font-mono">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{patchErr}</span>
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleApplyPatch}
            disabled={applyingPatch}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-[0_0_15px_rgba(245,158,11,0.2)] transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {applyingPatch ? (
              <>
                <RotateCw className="w-4 h-4 animate-spin" />
                <span>Применение патча и перезапуск службы...</span>
              </>
            ) : (
              <>
                <Wrench className="w-4 h-4" />
                <span>Применить eBPF Патч / Обновить агент в 1 клик</span>
              </>
            )}
          </button>
        </div>

        <details className="text-[11px] text-slate-400 bg-slate-950/50 p-3 rounded-xl border border-slate-800/60 cursor-pointer">
          <summary className="font-medium text-slate-300 hover:text-cyan-300">
            ℹ️ Справка: Бинарная установка vs Исходный код C
          </summary>
          <div className="mt-2 space-y-1.5 font-sans leading-relaxed text-slate-400">
            <p>
              • **Официальный бинарник:** При стандартной установке Open Defender готовым файлом (<code className="text-cyan-400 font-mono">/usr/local/bin/open-defender</code>) eBPF байткод встроен внутрь бинарника, файлы исходников <code className="text-slate-300 font-mono">.c</code> на сервере не требуются.
            </p>
            <p>
              • **Сборка из исходников:** Если на сервере присутствуют исходники C, кнопка безопасно заменяет целевые строки с автоматическим созданием бэкапа <code className="text-emerald-400 font-mono">.bak</code>.
            </p>
            <p>
              • Нажатие кнопки проверяет систему, создает бэкап бинарника и выполняет перезапуск службы <code className="text-cyan-400 font-mono">systemctl restart open-defender</code>.
            </p>
          </div>
        </details>
      </div>

      {/* Panel 3: Open Defender Zero-Touch Integration & Config */}
      <div className="p-5 rounded-2xl bg-[#0f172a]/90 border border-slate-800/80 shadow-lg space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-cyan-400" />
            <span className="text-sm font-semibold text-slate-200">
              Zero-Touch интеграция с Open Defender
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={checkLinkStatus}
              disabled={checkingLink}
              className="flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 font-mono cursor-pointer disabled:opacity-50"
            >
              <RotateCw className={`w-3.5 h-3.5 ${checkingLink ? 'animate-spin' : ''}`} />
              <span>{checkingLink ? 'Проверка...' : 'Обновить статус'}</span>
            </button>
            <span
              className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                linkStatus?.connected
                  ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800/80'
                  : linkStatus?.exporter_ready && linkStatus?.key_matched
                  ? 'bg-cyan-950/80 text-cyan-300 border-cyan-800/80'
                  : linkStatus?.config_found
                  ? 'bg-amber-950/80 text-amber-300 border-amber-800/80'
                  : 'bg-slate-900 text-slate-400 border-slate-700'
              }`}
            >
              {linkStatus?.connected
                ? '🟢 СВЯЗАН И ПОДКЛЮЧЕН'
                : linkStatus?.exporter_ready && linkStatus?.key_matched
                ? '🟡 СВЯЗАН (ОЖИДАЕТ ПОДКЛЮЧЕНИЯ)'
                : linkStatus?.config_found
                ? '🟠 НАЙДЕН (ТРЕБУЕТСЯ СВЯЗКА)'
                : '⚪ НЕ УСТАНОВЛЕН ЛОКАЛЬНО'}
            </span>
          </div>
        </div>

        {/* Status Details Grid */}
        <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-xl space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/60 border border-slate-800/60">
              <span className="text-slate-400">Файл конфигурации:</span>
              <span className={`font-bold flex items-center gap-1.5 ${linkStatus?.config_found ? 'text-emerald-400' : 'text-slate-400'}`}>
                {linkStatus?.config_found ? <Check className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                {linkStatus?.config_path || '/etc/open-defender/config.yaml'}
              </span>
            </div>

            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/60 border border-slate-800/60">
              <span className="text-slate-400">Экспорт телеметрии (exporter):</span>
              <span className={`font-bold flex items-center gap-1.5 ${linkStatus?.exporter_ready ? 'text-emerald-400' : 'text-amber-400'}`}>
                {linkStatus?.exporter_ready ? <Check className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                {linkStatus?.exporter_ready ? 'Включен (enabled: true)' : 'Отключен'}
              </span>
            </div>

            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/60 border border-slate-800/60">
              <span className="text-slate-400">RSA-ключ E2EE:</span>
              <span className={`font-bold flex items-center gap-1.5 ${linkStatus?.key_matched ? 'text-emerald-400' : 'text-amber-400'}`}>
                {linkStatus?.key_matched ? <Check className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                {linkStatus?.key_matched ? 'Связан с Defender Eye' : 'Не привязан'}
              </span>
            </div>

            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/60 border border-slate-800/60">
              <span className="text-slate-400">Служба open-defender:</span>
              <span className={`font-bold flex items-center gap-1.5 ${linkStatus?.service_active ? 'text-emerald-400' : 'text-slate-400'}`}>
                {linkStatus?.service_active ? <Check className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                {linkStatus?.service_active ? 'Активна (systemd)' : 'Не запущена'}
              </span>
            </div>
          </div>

          {linkStatus?.message && (
            <p className="text-[11px] text-slate-400 leading-relaxed font-sans pt-1">
              {linkStatus.message}
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <button
              type="button"
              onClick={handleAutoLink}
              disabled={linking}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-[0_0_15px_rgba(245,158,11,0.25)] transition-all disabled:opacity-50 cursor-pointer"
            >
              {linking ? (
                <>
                  <RotateCw className="w-4 h-4 animate-spin" />
                  <span>Связывание...</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  <span>Авто-привязка ключей (Zero-Touch)</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleSyncLocal}
              disabled={syncingLocal}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-[0_0_15px_rgba(16,185,129,0.25)] transition-all disabled:opacity-50 cursor-pointer"
            >
              {syncingLocal ? (
                <>
                  <RotateCw className="w-4 h-4 animate-spin" />
                  <span>Запись и перезапуск службы...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Применить настройки к файлу на сервере</span>
                </>
              )}
            </button>
          </div>
        </div>

        <div className="space-y-2 pt-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-300 font-sans">
              Конфигурационный файл для агента Open Defender на сервере:
            </p>
            <button
              onClick={() => copyText(openDefenderSampleConfig, setCopiedConfig)}
              className="flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 font-mono"
            >
              {copiedConfig ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedConfig ? 'Конфиг скопирован' : 'Скопировать config.yaml'}</span>
            </button>
          </div>

          <pre className="p-3.5 bg-[#080d1a] border border-slate-800 rounded-xl text-xs font-mono text-cyan-300 overflow-x-auto leading-relaxed">
            {openDefenderSampleConfig}
          </pre>
        </div>
      </div>

      {/* Panel 4: SSH Tunnel Access Guide */}
      <div className="p-5 rounded-2xl bg-[#0f172a]/90 border border-slate-800/80 shadow-lg space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <span className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <Terminal className="w-4 h-4 text-indigo-400" />
            <span>Безопасный доступ через SSH-туннель (Zero Cloud Exposure)</span>
          </span>
          <button
            onClick={() => {
              const sshPortFlag = sshPort !== 22 ? `-p ${sshPort} ` : '';
              const cmd = `ssh ${sshPortFlag}-L ${currentPort}:127.0.0.1:${currentPort} root@your-server-ip`;
              copyText(cmd, setCopiedTunnel);
            }}
            className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-mono"
          >
            {copiedTunnel ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedTunnel ? 'Команда скопирована' : 'Скопировать команду'}</span>
          </button>
        </div>

        <p className="text-xs text-slate-300 font-sans leading-relaxed">
          Панель не требует открытия внешних портов в интернет. Для безопасного входа с вашего
          локального компьютера выполните команду в терминале:
        </p>

        <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl font-mono text-xs text-indigo-300 flex items-center justify-between">
          <span>
            ssh {sshPort !== 22 ? `-p ${sshPort} ` : ''}-L {currentPort}:127.0.0.1:{currentPort} root@your-server-ip
          </span>
        </div>

        <p className="text-[11px] text-slate-400 font-sans">
          После этого откройте браузер по адресу: <code className="text-cyan-400 font-mono">http://localhost:{currentPort}</code>
        </p>
      </div>
    </div>
  );
};
