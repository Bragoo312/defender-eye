import { useState, useEffect } from 'react';
import { ThreatMap } from '../ThreatMap';
import type { SecurityEvent, CountryStat } from '../../types';
import { getEvents } from '../../api/client';
import { Globe, Radio, Crosshair, Layers, Zap, Loader2 } from 'lucide-react';

interface ThreatMapTabProps {
  events: SecurityEvent[];
  topCountries: CountryStat[];
  onSelectIp: (ip: string) => void;
}

export const ThreatMapTab: React.FC<ThreatMapTabProps> = ({
  events,
  topCountries,
  onSelectIp,
}) => {
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'all' | 'live'>('all');
  const [historicalEvents, setHistoricalEvents] = useState<SecurityEvent[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);

  // Fetch events from database when selected country or viewMode changes
  useEffect(() => {
    let isCancelled = false;

    if (viewMode === 'all' || selectedCountry) {
      setLoadingHistory(true);
      getEvents({
        limit: 500,
        country: selectedCountry || undefined,
      })
        .then((res) => {
          if (!isCancelled) setHistoricalEvents(res.events);
        })
        .catch((err) => console.error('[ThreatMapTab] Error fetching history:', err))
        .finally(() => {
          if (!isCancelled) setLoadingHistory(false);
        });
    }

    return () => {
      isCancelled = true;
    };
  }, [selectedCountry, viewMode]);

  // Determine events to render on map canvas
  const eventsToDisplay = selectedCountry
    ? historicalEvents.filter((e) => e.country_code === selectedCountry)
    : viewMode === 'all'
    ? historicalEvents.length > 0
      ? historicalEvents
      : events
    : events;

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner & Stats HUD */}
      <div className="p-4 rounded-2xl bg-[#0f172a]/90 border border-slate-800/80 shadow-lg flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Globe className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <span>Глобальный монитор геораспределенных атак</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
                OFFLINE VECTOR RADAR
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Автономная проекция координат без обращений к внешним картографическим серверам
            </p>
          </div>
        </div>

        {/* View Mode Toggle & HUD Stats */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs font-mono">
            <button
              onClick={() => {
                setSelectedCountry(null);
                setViewMode('all');
              }}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-medium transition-all cursor-pointer ${
                viewMode === 'all' && !selectedCountry
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
              <span>Все векторы из базы ({eventsToDisplay.length})</span>
            </button>
            <button
              onClick={() => {
                setSelectedCountry(null);
                setViewMode('live');
              }}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-medium transition-all cursor-pointer ${
                viewMode === 'live' && !selectedCountry
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 font-bold shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Zap className="w-3.5 h-3.5 text-rose-400" />
              <span>Живой поток ({events.length})</span>
            </button>
          </div>

          <div className="flex items-center gap-3 font-mono text-xs">
            <div className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center gap-2">
              <span className="text-slate-400">Страны-источники:</span>
              <span className="text-cyan-400 font-bold">{topCountries.length}</span>
            </div>
            {loadingHistory && (
              <div className="px-2.5 py-1.5 rounded-xl bg-cyan-950/60 border border-cyan-800 text-cyan-400 flex items-center gap-1.5 animate-pulse">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Загрузка...</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Full-Size Map Canvas */}
      <ThreatMap
        events={eventsToDisplay}
        height={560}
        onSelectIp={onSelectIp}
        selectedCountry={selectedCountry}
        onResetCountryFilter={() => setSelectedCountry(null)}
        className="w-full"
      />

      {/* Country Leaderboard and Attack Vectors Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Country Breakdown (2 cols) */}
        <div className="lg:col-span-2 p-5 rounded-2xl bg-[#0f172a]/90 border border-slate-800/80 shadow-lg">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <span className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Crosshair className="w-4 h-4 text-cyan-400" />
              <span>Распределение атак по странам</span>
            </span>
            {selectedCountry && (
              <button
                onClick={() => setSelectedCountry(null)}
                className="text-xs text-cyan-400 hover:underline font-mono"
              >
                Сбросить фильтр ({selectedCountry})
              </button>
            )}
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 text-[11px] uppercase">
                  <th className="py-2.5 px-3">#</th>
                  <th className="py-2.5 px-3">Код</th>
                  <th className="py-2.5 px-3">Страна</th>
                  <th className="py-2.5 px-3 text-right">Количество атак</th>
                  <th className="py-2.5 px-3">Доля</th>
                  <th className="py-2.5 px-3 text-center">Фильтр</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {topCountries.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      Данные отсутствуют
                    </td>
                  </tr>
                ) : (
                  topCountries.map((c, i) => (
                    <tr
                      key={c.country_code || i}
                      className={`hover:bg-slate-800/40 transition-colors ${
                        selectedCountry === c.country_code ? 'bg-cyan-500/10' : ''
                      }`}
                    >
                      <td className="py-2.5 px-3 text-slate-400">{i + 1}</td>
                      <td className="py-2.5 px-3">
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300 font-bold border border-slate-700 text-[10px]">
                          {c.country_code || 'XX'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-200 font-sans font-medium">
                        {c.country_name || 'Неизвестно'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-white">
                        {c.count.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 min-w-[140px]">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-cyan-400 rounded-full"
                              style={{ width: `${Math.min(100, Math.max(5, c.percentage))}%` }}
                            />
                          </div>
                          <span className="text-[11px] text-slate-400 w-10 text-right">
                            {c.percentage ? c.percentage.toFixed(1) : 0}%
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <button
                          onClick={() =>
                            setSelectedCountry(
                              selectedCountry === c.country_code ? null : c.country_code
                            )
                          }
                          className="px-2 py-1 rounded bg-slate-800 hover:bg-cyan-500/20 text-cyan-400 border border-slate-700 text-[10px]"
                        >
                          {selectedCountry === c.country_code ? 'Сбросить' : 'Выбрать'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Defense Tactics Info Panel */}
        <div className="p-5 rounded-2xl bg-[#0f172a]/90 border border-slate-800/80 shadow-lg space-y-4">
          <span className="text-sm font-semibold text-slate-200 flex items-center gap-2 pb-3 border-b border-slate-800">
            <Radio className="w-4 h-4 text-emerald-400" />
            <span>Параметры геозащиты</span>
          </span>

          <div className="space-y-3 text-xs text-slate-300 leading-relaxed font-sans">
            <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl space-y-1">
              <div className="font-semibold text-cyan-300">Принцип работы карты:</div>
              <p className="text-slate-400 text-[11px]">
                Векторные траектории связывают географические координаты входящих пакетов атак с
                защищаемым сервером. Вся отрисовка выполняется на Canvas в браузере клиента.
              </p>
            </div>

            <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl space-y-1">
              <div className="font-semibold text-emerald-300">Полная приватность:</div>
              <p className="text-slate-400 text-[11px]">
                Defender Eye не передает IP адреса и геолокацию на сторонние картографические
                сервисы (Google Maps, OpenStreetMap, Mapbox). Используется локальная MaxMind MMDB база.
              </p>
            </div>

            <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl space-y-1">
              <div className="font-semibold text-rose-300">Мгновенный отклик:</div>
              <p className="text-slate-400 text-[11px]">
                При фиксации атаки Open Defender немедленно выставляет правило в цепочку брандмауэра
                хоста, блокируя соединение на сетевом уровне ядра Linux.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
