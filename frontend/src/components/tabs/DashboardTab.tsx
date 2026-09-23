import type { DashboardStats, SecurityEvent } from '../../types';
import { ThreatMap } from '../ThreatMap';
import { getHumanEventDescription, getHumanBanReason } from '../../utils/explainer';
import {
  ShieldAlert,
  Users,
  Ban,
  Cpu,
  ArrowRight,
  Clock,
  Radio,
  Info,
} from 'lucide-react';

interface DashboardTabProps {
  stats: DashboardStats | null;
  onSelectIp: (ip: string) => void;
  onSelectEvent: (event: SecurityEvent) => void;
  onNavigateTab: (tab: any) => void;
}

export const DashboardTab: React.FC<DashboardTabProps> = ({
  stats,
  onSelectIp,
  onSelectEvent,
  onNavigateTab,
}) => {
  const sys = stats?.current_system;
  const recentEvents = stats?.recent_events || [];
  const recentBlocks = stats?.recent_blocks || [];
  const topCountries = stats?.top_countries || [];

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 MB';
    const mb = bytes / (1024 * 1024);
    if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
    return `${mb.toFixed(0)} MB`;
  };

  const formatRemainingTime = (expiresAt: string) => {
    if (!expiresAt) return 'Бессрочно';
    const diffMs = new Date(expiresAt).getTime() - Date.now();
    if (diffMs <= 0) return 'Истёк';
    const totalSec = Math.floor(diffMs / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    if (min >= 60) {
      const hours = Math.floor(min / 60);
      return `${hours}ч ${min % 60}м`;
    }
    return `${min}м ${sec}с`;
  };

  return (
    <div className="space-y-6 pb-12 font-sans">
      {/* Friendly Guide Banner */}
      <div className="p-3.5 rounded-2xl bg-cyan-950/20 border border-cyan-500/30 flex items-start gap-3 text-xs text-slate-300">
        <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <span className="font-semibold text-cyan-300">Оперативный центр безопасности: </span>
          Здесь в реальном времени отображаются атаки, которые ваш сервер отбивает прямо сейчас. На карте вы можете приближать и перемещать изображение, а при наведении на светящуюся точку увидеть, кто и за что пытается атаковать ваш сервер.
        </div>
      </div>

      {/* 4 Top KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: 24h Attacks */}
        <div className="p-5 rounded-2xl bg-[#0f172a]/90 border border-slate-800/80 shadow-lg relative overflow-hidden group hover:border-cyan-500/30 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/5 rounded-full blur-xl group-hover:bg-cyan-500/10 transition-all" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Отражено атак (24 часа)
            </span>
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-mono font-bold text-white tracking-tight">
              {stats?.events_total_24h ? stats.events_total_24h.toLocaleString() : 0}
            </span>
            <span className="text-xs text-slate-400 font-mono">попыток</span>
          </div>
          <div className="mt-2 text-xs text-slate-400 flex items-center justify-between pt-2 border-t border-slate-800/60 font-mono">
            <span>Всего за 7 дней:</span>
            <span className="text-cyan-400 font-medium">
              {stats?.events_total_7d ? stats.events_total_7d.toLocaleString() : 0}
            </span>
          </div>
        </div>

        {/* Card 2: Unique Attackers */}
        <div className="p-5 rounded-2xl bg-[#0f172a]/90 border border-slate-800/80 shadow-lg relative overflow-hidden group hover:border-indigo-500/30 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-xl group-hover:bg-indigo-500/10 transition-all" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Атакующих хостов (24ч)
            </span>
            <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-mono font-bold text-white tracking-tight">
              {stats?.unique_ips_24h ? stats.unique_ips_24h.toLocaleString() : 0}
            </span>
            <span className="text-xs text-slate-400 font-mono">уникальных IP</span>
          </div>
          <div className="mt-2 text-xs text-slate-400 flex items-center justify-between pt-2 border-t border-slate-800/60 font-mono">
            <span>Геолокация:</span>
            <span className="text-emerald-400 font-medium">Офлайн MaxMind MMDB</span>
          </div>
        </div>

        {/* Card 3: Active Bans */}
        <div className="p-5 rounded-2xl bg-[#0f172a]/90 border border-slate-800/80 shadow-lg relative overflow-hidden group hover:border-rose-500/30 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/5 rounded-full blur-xl group-hover:bg-rose-500/10 transition-all" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Сейчас в бане
            </span>
            <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
              <Ban className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-mono font-bold text-rose-400 tracking-tight">
              {stats?.blocked_ips_active || 0}
            </span>
            <span className="text-xs text-slate-400 font-mono">в iptables</span>
          </div>
          <div className="mt-2 text-xs text-slate-400 flex items-center justify-between pt-2 border-t border-slate-800/60 font-mono">
            <span>Всего забанено:</span>
            <span className="text-slate-300">{stats?.total_blocks || 0}</span>
          </div>
        </div>

        {/* Card 4: Host Telemetry */}
        <div className="p-5 rounded-2xl bg-[#0f172a]/90 border border-slate-800/80 shadow-lg relative overflow-hidden group hover:border-emerald-500/30 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-xl group-hover:bg-emerald-500/10 transition-all" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Нагрузка вашего сервера
            </span>
            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Cpu className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-mono font-bold text-emerald-400 tracking-tight">
              {sys ? `${sys.cpu_percent.toFixed(1)}%` : '0%'}
            </span>
            <span className="text-xs text-slate-400 font-mono">CPU</span>
          </div>
          <div className="mt-2 text-xs text-slate-400 flex items-center justify-between pt-2 border-t border-slate-800/60 font-mono">
            <span>RAM:</span>
            <span className="text-slate-300">
              {sys
                ? `${formatBytes(sys.ram_used_bytes)} / ${formatBytes(sys.ram_total_bytes)}`
                : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* Middle Section: Live Threat Map & Top Countries */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Threat Map with Pan & Zoom */}
        <div className="lg:col-span-2 space-y-2">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-cyan-400" />
              <span className="text-sm font-semibold text-slate-200">
                Интерактивный радар атак (можно перетаскивать и приближать)
              </span>
            </div>
            <button
              onClick={() => onNavigateTab('threatmap')}
              className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-medium transition-colors"
            >
              <span>Полноэкранная карта</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <ThreatMap events={recentEvents} height={390} onSelectIp={onSelectIp} />
        </div>

        {/* Top Attacking Countries */}
        <div className="p-5 rounded-2xl bg-[#0f172a]/90 border border-slate-800/80 shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <span className="text-sm font-semibold text-slate-200">
                География атак (Откуда нападают)
              </span>
              <span className="text-xs text-slate-400 font-mono">24ч</span>
            </div>

            <div className="mt-4 space-y-3.5">
              {topCountries.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400 font-mono">
                  Событий безопасности пока не зафиксировано
                </div>
              ) : (
                topCountries.slice(0, 6).map((c, i) => (
                  <div key={c.country_code || i} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400 font-bold w-4">{i + 1}.</span>
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300 font-bold border border-slate-700 text-[10px]">
                          {c.country_code || 'XX'}
                        </span>
                        <span className="text-slate-200 font-sans font-medium">
                          {c.country_name || 'Неизвестно'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-white font-bold">{c.count.toLocaleString()}</span>
                        <span className="text-slate-400 text-[11px]">
                          ({c.percentage ? c.percentage.toFixed(1) : 0}%)
                        </span>
                      </div>
                    </div>
                    <div className="h-1.5 w-full bg-slate-800/80 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-cyan-500 to-indigo-500 rounded-full"
                        style={{ width: `${Math.min(100, Math.max(4, c.percentage))}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800/80 mt-4 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Источник геоданных:</span>
            <span className="font-mono text-emerald-400">Локальная MaxMind MMDB</span>
          </div>
        </div>
      </div>

      {/* Lower Section: Recent Events Feed & Active Bans */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Realtime Event Feed with Human Explanations */}
        <div className="lg:col-span-2 p-5 rounded-2xl bg-[#0f172a]/90 border border-slate-800/80 shadow-lg">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-sm font-semibold text-slate-200">
                Живая лента инцидентов (Что происходит прямо сейчас)
              </span>
            </div>
            <button
              onClick={() => onNavigateTab('events')}
              className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-medium transition-colors"
            >
              <span>Открыть весь журнал</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="mt-3 divide-y divide-slate-800/60 max-h-[380px] overflow-y-auto">
            {recentEvents.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400 font-mono">
                Ожидание входящих алертов от Open Defender...
              </div>
            ) : (
              recentEvents.slice(0, 10).map((ev) => {
                const human = getHumanEventDescription(ev);
                return (
                  <div
                    key={ev.id}
                    onClick={() => onSelectEvent(ev)}
                    className="py-3 px-2 flex items-center justify-between hover:bg-slate-800/40 rounded-lg cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                          ev.severity === 'critical'
                            ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]'
                            : ev.severity === 'high'
                            ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]'
                            : 'bg-yellow-500'
                        }`}
                      />
                      <div>
                        <div className="text-xs font-semibold text-slate-200">
                          {human.summary}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono mt-0.5">
                          <span className="text-cyan-400 font-bold">{ev.source_ip}</span>
                          {ev.country_code && (
                            <span className="text-slate-400 font-sans">
                              ({ev.country_name || ev.country_code})
                            </span>
                          )}
                          <span>•</span>
                          <span className="font-sans text-slate-300">{human.category}</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span
                        className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded font-bold ${
                          ev.action === 'blocked'
                            ? 'bg-rose-950 text-rose-300 border border-rose-800'
                            : 'bg-slate-800 text-slate-300 border border-slate-700'
                        }`}
                      >
                        {ev.action === 'blocked' ? 'Заблокирован' : 'Перехвачен'}
                      </span>
                      <div className="text-[10px] text-slate-400 font-mono mt-1">
                        {new Date(ev.timestamp).toLocaleTimeString('ru-RU')}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Active Ban List with Clear Reasons & Countdown */}
        <div className="p-5 rounded-2xl bg-[#0f172a]/90 border border-slate-800/80 shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <span className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <Ban className="w-4 h-4 text-rose-400" />
                <span>Активные блокировки ({recentBlocks.length})</span>
              </span>
              <button
                onClick={() => onNavigateTab('blocks')}
                className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1 font-medium transition-colors"
              >
                <span>Все</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="mt-3 divide-y divide-slate-800/60 max-h-[380px] overflow-y-auto">
              {recentBlocks.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400 font-mono">
                  Активных блокировок нет. Сервер в штатном режиме.
                </div>
              ) : (
                recentBlocks.map((b) => {
                  const banInfo = getHumanBanReason(b);
                  return (
                    <div
                      key={b.id}
                      onClick={() => onSelectIp(b.ip)}
                      className="py-3 px-2 flex items-center justify-between hover:bg-slate-800/40 rounded-lg cursor-pointer transition-colors"
                    >
                      <div>
                        <div className="text-xs font-mono font-bold text-rose-300 hover:text-rose-200">
                          {b.ip}
                        </div>
                        <div className="text-[11px] text-slate-300 mt-0.5 truncate max-w-[190px]">
                          {banInfo.title}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[11px] font-mono text-amber-300 flex items-center justify-end gap-1 font-bold">
                          <Clock className="w-3 h-3" />
                          <span>{formatRemainingTime(b.expires_at)}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                          Срок: {Math.round(b.ban_seconds / 60)} мин
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800/80 mt-4 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Фильтрация на хосте:</span>
            <span className="font-mono text-rose-400 font-bold">iptables DROP</span>
          </div>
        </div>
      </div>
    </div>
  );
};
