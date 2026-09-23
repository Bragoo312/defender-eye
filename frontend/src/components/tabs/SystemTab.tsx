import { useState, useEffect } from 'react';
import type { SystemMetric } from '../../types';
import { getSystemMetrics } from '../../api/client';
import {
  Cpu,
  RotateCw,
  HardDrive,
  Activity,
  Layers,
  ArrowDownToLine,
  ArrowUpFromLine,
  Server,
} from 'lucide-react';

interface SystemTabProps {
  currentMetric?: SystemMetric;
}

export const SystemTab: React.FC<SystemTabProps> = ({ currentMetric }) => {
  const [history, setHistory] = useState<SystemMetric[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchMetrics = async () => {
    setLoading(true);
    try {
      const data = await getSystemMetrics();
      setHistory(data || []);
    } catch (err) {
      console.error('Failed to load system metrics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 5000);
    return () => clearInterval(interval);
  }, []);

  const metric = currentMetric || history[history.length - 1];

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 MB';
    const mb = bytes / (1024 * 1024);
    if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
    return `${mb.toFixed(0)} MB`;
  };

  const formatSpeed = (bytesSec: number) => {
    if (!bytesSec || bytesSec === 0) return '0 KB/s';
    const kb = bytesSec / 1024;
    if (kb >= 1024) return `${(kb / 1024).toFixed(2)} MB/s`;
    return `${kb.toFixed(1)} KB/s`;
  };

  // RAM calculations
  const ramPercent =
    metric && metric.ram_total_bytes > 0
      ? (metric.ram_used_bytes / metric.ram_total_bytes) * 100
      : 0;

  // Swap calculations
  const swapPercent =
    metric && metric.swap_total_bytes > 0
      ? (metric.swap_used_bytes / metric.swap_total_bytes) * 100
      : 0;

  // Disk calculations
  const diskPercent =
    metric && metric.disk_total_bytes > 0
      ? (metric.disk_used_bytes / metric.disk_total_bytes) * 100
      : 0;

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner */}
      <div className="p-4 rounded-2xl bg-[#0f172a]/90 border border-slate-800/80 shadow-lg flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <span>Системная телеметрия защищаемого хоста</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                PROCFS TELEMETRY
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Мониторинг аппаратных ресурсов: прямое чтение /proc/stat, /proc/meminfo и /proc/loadavg
            </p>
          </div>
        </div>

        <button
          onClick={fetchMetrics}
          disabled={loading}
          className="p-2 rounded-xl bg-slate-900 border border-slate-700/80 text-slate-400 hover:text-cyan-400 transition-all"
          title="Обновить"
        >
          <RotateCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* 4 Large Resource Gauges */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* CPU */}
        <div className="p-5 rounded-2xl bg-[#0f172a]/90 border border-slate-800/80 shadow-lg space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-slate-400">Процессор (CPU)</span>
            <Cpu className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-mono font-bold text-white">
              {metric ? metric.cpu_percent.toFixed(1) : 0}%
            </span>
          </div>
          <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-cyan-400 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, metric?.cpu_percent || 0)}%` }}
            />
          </div>
          <div className="text-[11px] text-slate-400 font-mono flex justify-between">
            <span>Нагрузка ядер</span>
            <span className="text-slate-300">
              {metric && metric.cpu_percent > 85 ? 'Критическая' : 'Норма'}
            </span>
          </div>
        </div>

        {/* RAM */}
        <div className="p-5 rounded-2xl bg-[#0f172a]/90 border border-slate-800/80 shadow-lg space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-slate-400">Оперативная память</span>
            <Layers className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-mono font-bold text-indigo-300">
              {ramPercent.toFixed(1)}%
            </span>
          </div>
          <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-400 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, ramPercent)}%` }}
            />
          </div>
          <div className="text-[11px] text-slate-400 font-mono flex justify-between">
            <span>Занято:</span>
            <span className="text-slate-300">
              {metric ? `${formatBytes(metric.ram_used_bytes)} / ${formatBytes(metric.ram_total_bytes)}` : '—'}
            </span>
          </div>
        </div>

        {/* Swap */}
        <div className="p-5 rounded-2xl bg-[#0f172a]/90 border border-slate-800/80 shadow-lg space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-slate-400">Файл подкачки (Swap)</span>
            <Activity className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-mono font-bold text-amber-300">
              {swapPercent.toFixed(1)}%
            </span>
          </div>
          <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-400 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, swapPercent)}%` }}
            />
          </div>
          <div className="text-[11px] text-slate-400 font-mono flex justify-between">
            <span>Использовано:</span>
            <span className="text-slate-300">
              {metric ? `${formatBytes(metric.swap_used_bytes)} / ${formatBytes(metric.swap_total_bytes)}` : '—'}
            </span>
          </div>
        </div>

        {/* Disk */}
        <div className="p-5 rounded-2xl bg-[#0f172a]/90 border border-slate-800/80 shadow-lg space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-slate-400">Дисковый накопитель</span>
            <HardDrive className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-mono font-bold text-emerald-300">
              {diskPercent.toFixed(1)}%
            </span>
          </div>
          <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-400 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, diskPercent)}%` }}
            />
          </div>
          <div className="text-[11px] text-slate-400 font-mono flex justify-between">
            <span>Место на диске:</span>
            <span className="text-slate-300">
              {metric ? `${formatBytes(metric.disk_used_bytes)} / ${formatBytes(metric.disk_total_bytes)}` : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* Network & Load Averages */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Load Averages */}
        <div className="p-5 rounded-2xl bg-[#0f172a]/90 border border-slate-800/80 shadow-lg space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <span className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Server className="w-4 h-4 text-cyan-400" />
              <span>Средняя загрузка системы (Load Average)</span>
            </span>
            <span className="text-xs text-slate-400 font-mono">1m / 5m / 15m</span>
          </div>

          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="p-4 bg-slate-900/70 border border-slate-800 rounded-xl">
              <div className="text-xs text-slate-400">1 минута</div>
              <div className="text-2xl font-mono font-bold text-white mt-1">
                {metric ? metric.load_avg_1.toFixed(2) : '0.00'}
              </div>
            </div>
            <div className="p-4 bg-slate-900/70 border border-slate-800 rounded-xl">
              <div className="text-xs text-slate-400">5 минут</div>
              <div className="text-2xl font-mono font-bold text-white mt-1">
                {metric ? metric.load_avg_5.toFixed(2) : '0.00'}
              </div>
            </div>
            <div className="p-4 bg-slate-900/70 border border-slate-800 rounded-xl">
              <div className="text-xs text-slate-400">15 минут</div>
              <div className="text-2xl font-mono font-bold text-white mt-1">
                {metric ? metric.load_avg_15.toFixed(2) : '0.00'}
              </div>
            </div>
          </div>

          <p className="text-xs text-slate-400 font-sans leading-relaxed">
            Показатель Load Average отражает количество потоков, ожидающих времени процессора.
            Значение меньше количества физических ядер процессора указывает на комфортный режим работы.
          </p>
        </div>

        {/* Network Bandwidth */}
        <div className="p-5 rounded-2xl bg-[#0f172a]/90 border border-slate-800/80 shadow-lg space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <span className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              <span>Сетевой трафик интерфейса (Network I/O)</span>
            </span>
            <span className="text-xs text-slate-400 font-mono">Текущая скорость</span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-slate-900/70 border border-slate-800 rounded-xl flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                <ArrowDownToLine className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs text-slate-400">Входящий (RX)</div>
                <div className="text-xl font-mono font-bold text-emerald-400 mt-0.5">
                  {metric ? formatSpeed(metric.net_rx_bytes_sec) : '0 KB/s'}
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-900/70 border border-slate-800 rounded-xl flex items-center gap-3">
              <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400">
                <ArrowUpFromLine className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs text-slate-400">Исходящий (TX)</div>
                <div className="text-xl font-mono font-bold text-cyan-400 mt-0.5">
                  {metric ? formatSpeed(metric.net_tx_bytes_sec) : '0 KB/s'}
                </div>
              </div>
            </div>
          </div>

          <div className="pt-2 text-xs text-slate-400 font-mono flex items-center justify-between border-t border-slate-800/80">
            <span>Архитектура:</span>
            <span className="text-slate-300">Linux x86_64 / arm64 Native</span>
          </div>
        </div>
      </div>
    </div>
  );
};
