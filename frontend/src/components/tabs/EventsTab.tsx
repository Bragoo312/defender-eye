import { useState, useEffect, useCallback } from 'react';
import type { SecurityEvent } from '../../types';
import { getEvents } from '../../api/client';
import { getHumanEventDescription } from '../../utils/explainer';
import {
  Search,
  RotateCw,
  ChevronLeft,
  ChevronRight,
  Info,
} from 'lucide-react';

interface EventsTabProps {
  onSelectEvent: (event: SecurityEvent) => void;
  onSelectIp: (ip: string) => void;
}

export const EventsTab: React.FC<EventsTabProps> = ({ onSelectEvent, onSelectIp }) => {
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  // Filters & Pagination State
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [severity, setSeverity] = useState('');
  const [action, setAction] = useState('');
  const [monitor, setMonitor] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getEvents({
        limit: pageSize,
        offset: (page - 1) * pageSize,
        search: debouncedSearch.trim() || undefined,
        severity: severity || undefined,
        action: action || undefined,
        monitor: monitor || undefined,
      });
      setEvents(res.events || []);
      setTotal(res.total || 0);
    } catch (err) {
      console.error('Failed to load events:', err);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, debouncedSearch, severity, action, monitor]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const handleFilterChange = (setter: (val: string) => void, val: string) => {
    setter(val);
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const severityBadge = (sev: string) => {
    switch (sev) {
      case 'critical':
        return { label: 'Критично', style: 'bg-rose-950/80 text-rose-300 border-rose-800' };
      case 'high':
        return { label: 'Высокая', style: 'bg-amber-950/80 text-amber-300 border-amber-800' };
      case 'medium':
        return { label: 'Средняя', style: 'bg-yellow-950/80 text-yellow-300 border-yellow-800' };
      case 'low':
        return { label: 'Низкая', style: 'bg-blue-950/80 text-blue-300 border-blue-800' };
      default:
        return { label: 'Инфо', style: 'bg-slate-800 text-slate-300 border-slate-700' };
    }
  };

  return (
    <div className="space-y-4 pb-12 font-sans">
      {/* Friendly Guide Banner for Regular Users */}
      <div className="p-3.5 rounded-2xl bg-cyan-950/20 border border-cyan-500/30 flex items-start gap-3 text-xs text-slate-300">
        <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <span className="font-semibold text-cyan-300">Как читать этот журнал? </span>
          Каждая строка — это атака, попытка взлома или скрытая сетевая разведка, перехваченная вашим сервером.
          Кликните по любой строке, чтобы прочитать подробное объяснение, откуда пришел атакующий и почему его действия заблокированы.
        </div>
      </div>

      {/* Control Bar: Search & Human Filters */}
      <div className="p-4 rounded-2xl bg-[#0f172a]/90 border border-slate-800/80 shadow-lg flex flex-wrap items-center justify-between gap-4">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Поиск по IP адресу, стране или логину..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-700/80 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 transition-all font-mono"
          />
        </div>

        {/* Dropdown Filters with Human-Friendly Labels */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Attack Vector Filter */}
          <select
            value={monitor}
            onChange={(e) => handleFilterChange(setMonitor, e.target.value)}
            className="bg-slate-900 border border-slate-700/80 rounded-xl text-xs text-slate-300 px-3 py-2 focus:outline-none focus:border-cyan-500/50"
          >
            <option value="">Все типы атак</option>
            <option value="ssh_brute">🔑 Подбор паролей SSH (SSH Brute)</option>
            <option value="ssh_monitor">🔐 Монитор безопасности SSH</option>
            <option value="web_recon">🌐 Поиск уязвимостей сайта (Web Recon)</option>
            <option value="web_brute">🔐 Подбор веб-паролей (Web Brute)</option>
            <option value="db_brute">🗄️ Взлом баз данных (PostgreSQL/MySQL)</option>
            <option value="port_scan">🚪 Разведка сетевых портов (Port Scan)</option>
            <option value="network_antirecon">📡 eBPF Сетевая анти-разведка</option>
            <option value="resource_overload">⚡ Аномальная перегрузка (DDoS)</option>
          </select>

          {/* Action Filter */}
          <select
            value={action}
            onChange={(e) => handleFilterChange(setAction, e.target.value)}
            className="bg-slate-900 border border-slate-700/80 rounded-xl text-xs text-slate-300 px-3 py-2 focus:outline-none focus:border-cyan-500/50"
          >
            <option value="">Любая реакция</option>
            <option value="blocked">🛡️ Заблокирован брандмауэром</option>
            <option value="alerted">⚠️ Перехвачен / Алерт</option>
            <option value="logged">📝 Записан в аудит</option>
          </select>

          {/* Severity Filter */}
          <select
            value={severity}
            onChange={(e) => handleFilterChange(setSeverity, e.target.value)}
            className="bg-slate-900 border border-slate-700/80 rounded-xl text-xs text-slate-300 px-3 py-2 focus:outline-none focus:border-cyan-500/50"
          >
            <option value="">Любая опасность</option>
            <option value="critical">🔴 Критическая</option>
            <option value="high">🟠 Высокая</option>
            <option value="medium">🟡 Средняя</option>
          </select>

          {/* Refresh Button */}
          <button
            onClick={fetchEvents}
            disabled={loading}
            className="p-2 rounded-xl bg-slate-900 border border-slate-700/80 text-slate-400 hover:text-cyan-400 hover:border-cyan-500/30 transition-all disabled:opacity-50"
            title="Обновить журнал"
          >
            <RotateCw className={`w-4 h-4 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Main Events Table */}
      <div className="rounded-2xl bg-[#0f172a]/90 border border-slate-800/80 shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-[#0b101d] text-slate-400 font-mono uppercase tracking-wider text-[11px]">
                <th className="py-3.5 px-4 font-semibold">Время</th>
                <th className="py-3.5 px-4 font-semibold">Категория атаки</th>
                <th className="py-3.5 px-4 font-semibold">Опасность</th>
                <th className="py-3.5 px-4 font-semibold">Кто атаковал (IP / Страна)</th>
                <th className="py-3.5 px-4 font-semibold">Что конкретно делал (простыми словами)</th>
                <th className="py-3.5 px-4 font-semibold">Реакция сервера</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading && events.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2 font-mono">
                      <RotateCw className="w-6 h-6 animate-spin text-cyan-400" />
                      <span>Загрузка журнала событий безопасности...</span>
                    </div>
                  </td>
                </tr>
              ) : events.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-slate-400 font-mono">
                    Событий, соответствующих выбранным фильтрам, не обнаружено
                  </td>
                </tr>
              ) : (
                events.map((ev) => {
                  const human = getHumanEventDescription(ev);
                  const sev = severityBadge(ev.severity);

                  return (
                    <tr
                      key={ev.id}
                      onClick={() => onSelectEvent(ev)}
                      className="hover:bg-slate-800/50 cursor-pointer transition-colors group"
                    >
                      {/* Timestamp */}
                      <td className="py-3.5 px-4 text-slate-400 whitespace-nowrap font-mono">
                        {new Date(ev.timestamp).toLocaleTimeString('ru-RU', {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                        <span className="text-[10px] text-slate-400 ml-1.5 hidden sm:inline">
                          {new Date(ev.timestamp).toLocaleDateString('ru-RU')}
                        </span>
                      </td>

                      {/* Attack Category */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="text-slate-200 font-medium font-sans">
                          {human.category}
                        </span>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                          Цель: {ev.dest_port > 0 ? `порт ${ev.dest_port}` : 'периметр'}
                        </div>
                      </td>

                      {/* Severity */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded border font-bold ${sev.style}`}
                        >
                          {sev.label}
                        </span>
                      </td>

                      {/* Source IP and Country */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectIp(ev.source_ip);
                            }}
                            className="text-cyan-400 hover:text-cyan-300 hover:underline font-bold font-mono"
                            title="Открыть досье этого IP"
                          >
                            {ev.source_ip}
                          </span>
                          {ev.country_code && (
                            <span className="text-[10px] font-mono px-1.5 py-0.2 bg-slate-800 text-slate-300 rounded border border-slate-700">
                              {ev.country_code}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5 truncate max-w-[150px]">
                          {ev.country_name || 'Неизвестно'}
                        </div>
                      </td>

                      {/* Plain Language Summary */}
                      <td className="py-3.5 px-4 text-slate-200 font-sans max-w-md">
                        <div className="font-medium text-slate-200 leading-snug">
                          {human.summary}
                        </div>
                        {ev.username && (
                          <div className="text-[11px] text-amber-300 font-mono mt-0.5">
                            Взламываемый логин: <span className="font-bold">{ev.username}</span>
                          </div>
                        )}
                      </td>

                      {/* Action Taken */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`text-[10px] font-mono uppercase px-2 py-1 rounded font-bold ${
                            ev.action === 'blocked'
                              ? 'bg-rose-950 text-rose-300 border border-rose-800'
                              : ev.action === 'alerted'
                              ? 'bg-amber-950 text-amber-300 border border-amber-800'
                              : 'bg-slate-800 text-slate-300 border border-slate-700'
                          }`}
                        >
                          {ev.action === 'blocked'
                            ? 'Заблокирован'
                            : ev.action === 'alerted'
                            ? 'Перехвачен'
                            : 'Залогирован'}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="p-4 border-t border-slate-800 bg-[#0b101d] flex flex-wrap items-center justify-between gap-4 text-xs font-mono text-slate-400">
          <div>
            Показано {events.length > 0 ? (page - 1) * pageSize + 1 : 0}–
            {Math.min(total, page * pageSize)} из <span className="text-white font-bold">{total.toLocaleString()}</span> записей
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span>Строк на странице:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="bg-slate-900 border border-slate-700/80 rounded-lg text-xs text-slate-300 px-2 py-1"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 hover:text-cyan-400 disabled:opacity-40 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 hover:text-cyan-400 disabled:opacity-40 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
