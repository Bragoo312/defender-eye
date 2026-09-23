import { useState, useEffect } from 'react';
import type { TabId } from './Sidebar';
import {
  RotateCw,
  Zap,
  Clock,
  ShieldAlert,
  Server,
} from 'lucide-react';

interface HeaderProps {
  activeTab: TabId;
  demoMode: boolean;
  onRefresh: () => void;
  refreshing: boolean;
  connected: boolean;
  activeBansCount: number;
  events24hCount: number;
}

const tabTitles: Record<TabId, { title: string; subtitle: string }> = {
  dashboard: {
    title: 'Оперативный центр безопасности (SOC)',
    subtitle: 'Аналитика атак, телеметрия хоста и активные блокировки в реальном времени',
  },
  events: {
    title: 'Журнал событий безопасности',
    subtitle: 'Нормализованные алерты Open Defender с GeoIP и сигнатурным анализом',
  },
  threatmap: {
    title: 'Глобальная карта кибератак',
    subtitle: 'Офлайн векторная гео-визуализация атакующих хостов и лазерных векторов',
  },
  blocks: {
    title: 'Реестр активных блокировок',
    subtitle: 'IP-адреса, отправленные в бан подсистемой iptables/nftables',
  },
  ips: {
    title: 'Каталог атакующих IP-адресов',
    subtitle: 'История рецидивов, привязка к ASN провайдерам и геолокация',
  },
  ssh: {
    title: 'SSH Защита & Brute-force',
    subtitle: 'Анализ попыток подбора учетных записей и атак на порт 22',
  },
  ports: {
    title: 'Сканирование портов и Recon',
    subtitle: 'Разведка периметра хоста, сканирование портов и сервисов',
  },
  system: {
    title: 'Системная телеметрия хоста',
    subtitle: 'Аппаратная загрузка сервера: CPU, RAM, Swap, Disk, LoadAvg, Network',
  },
  settings: {
    title: 'Конфигурация Defender Eye',
    subtitle: 'Параметры хранения, интеграция Open Defender и ключи шифрования',
  },
};

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  demoMode,
  onRefresh,
  refreshing,
  connected,
  activeBansCount,
  events24hCount,
}) => {
  const [timeStr, setTimeStr] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(
        now.toLocaleTimeString('ru-RU', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const { title, subtitle } = tabTitles[activeTab] || tabTitles.dashboard;

  return (
    <header className="h-16 bg-[#0d131f]/95 backdrop-blur border-b border-slate-800/80 px-6 flex items-center justify-between z-10 shrink-0">
      {/* Title & Subtitle */}
      <div className="flex flex-col">
        <h1 className="text-base font-semibold text-slate-100 flex items-center gap-2">
          <span>{title}</span>
          {!connected && (
            <span className="text-[11px] font-mono text-rose-400 bg-rose-950/60 border border-rose-800 px-2 py-0.5 rounded">
              Потеря связи
            </span>
          )}
        </h1>
        <p className="text-xs text-slate-400 truncate max-w-xl">{subtitle}</p>
      </div>

      {/* Action Controls & Indicators */}
      <div className="flex items-center gap-4">
        {/* Quick Stats Pill */}
        <div className="hidden md:flex items-center gap-3 px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800 text-xs font-mono">
          <div className="flex items-center gap-1.5 text-rose-400">
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Банов:</span>
            <span className="font-bold text-white">{activeBansCount}</span>
          </div>
          <div className="w-px h-3 bg-slate-700" />
          <div className="flex items-center gap-1.5 text-cyan-400">
            <Server className="w-3.5 h-3.5" />
            <span>24ч:</span>
            <span className="font-bold text-white">{events24hCount.toLocaleString()}</span>
          </div>
        </div>

        {/* Live Clock */}
        <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900/60 border border-slate-800/60 text-xs font-mono text-slate-400">
          <Clock className="w-3.5 h-3.5 text-cyan-400" />
          <span>{timeStr || '00:00:00'}</span>
        </div>

        {/* Demo Mode Status Badge (only displayed if server was started with --demo) */}
        {demoMode && (
          <div
            title="Сервер запущен с флагом --demo. События и метрики симулированы в демонстрационных целях."
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/40 shadow-[0_0_12px_rgba(245,158,11,0.2)]"
          >
            <Zap className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
            <span>ДЕМО-РЕЖИМ</span>
          </div>
        )}

        {/* Manual Refresh */}
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="p-2 rounded-lg bg-slate-900 text-slate-400 border border-slate-800 hover:text-cyan-400 hover:border-cyan-500/30 transition-all disabled:opacity-50"
          title="Обновить данные"
        >
          <RotateCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-cyan-400' : ''}`} />
        </button>
      </div>
    </header>
  );
};
