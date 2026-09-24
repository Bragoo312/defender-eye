import { useState, useEffect, useCallback } from 'react';
import type { SecurityEvent } from '../../types';
import { getSSH } from '../../api/client';
import { getHumanEventDescription } from '../../utils/explainer';
import {
  Terminal,
  RotateCw,
  Ban,
  Users,
  Key,
  ChevronLeft,
  ChevronRight,
  Info,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';

interface SSHTabProps {
  onSelectEvent: (event: SecurityEvent) => void;
  onSelectIp: (ip: string) => void;
}

export const SSHTab: React.FC<SSHTabProps> = ({ onSelectEvent, onSelectIp }) => {
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const fetchSSH = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getSSH({
        limit: pageSize,
        offset: (page - 1) * pageSize,
      });
      setEvents(res.events || []);
      setTotal(res.total || 0);
    } catch (err) {
      console.error('Failed to load SSH events:', err);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize]);

  useEffect(() => {
    fetchSSH();
  }, [fetchSSH]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const uniqueIps = new Set(events.map((e) => e.source_ip)).size;
  const blockedCount = events.filter((e) => e.action === 'blocked').length;
  const detectedPorts = Array.from(
    new Set(events.map((e) => e.dest_port).filter((p): p is number => Boolean(p && p > 0)))
  );
  const sshPortDisplay = detectedPorts.length > 0 ? detectedPorts.join(', ') : '22';

  return (
    <div className="space-y-6 pb-12 font-sans">
      {/* Educational Banner for Regular Users */}
      <div className="p-4 rounded-2xl bg-cyan-950/20 border border-cyan-500/30 flex items-start gap-3 text-xs text-slate-300">
        <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
        <div className="space-y-1 leading-relaxed">
          <div className="font-semibold text-cyan-300">
            Что такое SSH Brute-force и почему эти IP здесь фиксируются?
          </div>
          <p className="text-slate-300">
            Служба SSH (порт {sshPortDisplay}) используется для управления сервером. В интернете действуют тысячи автоматических ботнетов, которые перебирают простые и словарные пароли к учетным записям <code className="text-rose-400">root</code>, <code className="text-amber-400">admin</code>, <code className="text-amber-400">ubuntu</code>. Defender Eye в реальном времени перехватывает эти попытки и блокирует IP-адрес нападающего до того, как он сможет угадать пароль.
          </p>
        </div>
      </div>

      {/* 4 SSH Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-[#0f172a]/90 border border-slate-800/80 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Попыток подбора паролей
            </span>
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <Terminal className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-mono font-bold text-white tracking-tight">
              {total.toLocaleString()}
            </span>
            <span className="text-xs text-slate-400 font-mono">попыток</span>
          </div>
          <div className="mt-2 text-xs text-slate-400 flex items-center justify-between pt-2 border-t border-slate-800/60 font-mono">
            <span>Атакуемый сервис:</span>
            <span className="text-cyan-400 font-medium">SSH (порт {sshPortDisplay})</span>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-[#0f172a]/90 border border-slate-800/80 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Уникальных ботов-взломщиков
            </span>
            <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-mono font-bold text-indigo-400 tracking-tight">
              {uniqueIps}
            </span>
            <span className="text-xs text-slate-400 font-mono">хостов на стр.</span>
          </div>
          <div className="mt-2 text-xs text-slate-400 flex items-center justify-between pt-2 border-t border-slate-800/60 font-mono">
            <span>Протокол:</span>
            <span className="text-slate-200 font-medium">TCP / OpenSSH</span>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-[#0f172a]/90 border border-slate-800/80 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Отправлено в бан за SSH
            </span>
            <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
              <Ban className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-mono font-bold text-rose-400 tracking-tight">
              {blockedCount}
            </span>
            <span className="text-xs text-slate-400 font-mono">в бане</span>
          </div>
          <div className="mt-2 text-xs text-slate-400 flex items-center justify-between pt-2 border-t border-slate-800/60 font-mono">
            <span>Реакция ядра:</span>
            <span className="text-rose-400 font-medium font-sans">Сброс пакетов (Drop)</span>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-[#0f172a]/90 border border-slate-800/80 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Защита аутентификации
            </span>
            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Key className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-xl font-mono font-bold text-emerald-400 tracking-tight flex items-center gap-1.5">
              <ShieldCheck className="w-5 h-5" />
              АКТИВНА
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-400 flex items-center justify-between pt-2 border-t border-slate-800/60 font-mono">
            <span>Порог автобана:</span>
            <span className="text-slate-300 font-medium font-sans">5 ошибок за 1 мин</span>
          </div>
        </div>
      </div>

      {/* SSH Events Table */}
      <div className="rounded-2xl bg-[#0f172a]/90 border border-slate-800/80 shadow-lg overflow-hidden">
        <div className="p-4 border-b border-slate-800 bg-[#0b101d] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-cyan-400" />
            <span className="text-sm font-semibold text-slate-200">
              Журнал перехваченных попыток входа по SSH
            </span>
          </div>
          <button
            onClick={fetchSSH}
            disabled={loading}
            className="p-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-400 hover:text-cyan-400 transition-colors"
          >
            <RotateCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-[#0b101d] text-slate-400 font-mono uppercase tracking-wider text-[11px]">
                <th className="py-3.5 px-4 font-semibold">Время</th>
                <th className="py-3.5 px-4 font-semibold">Нападающий (IP / Страна)</th>
                <th className="py-3.5 px-4 font-semibold">К какому логину подбирал пароль</th>
                <th className="py-3.5 px-4 font-semibold">Что произошло (простыми словами)</th>
                <th className="py-3.5 px-4 font-semibold">Реакция сервера</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading && events.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-16 text-center text-slate-400 font-mono">
                    Загрузка SSH алертов...
                  </td>
                </tr>
              ) : events.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-16 text-center text-slate-400 font-sans">
                    Попыток подбора SSH паролей не зафиксировано
                  </td>
                </tr>
              ) : (
                events.map((ev) => {
                  const human = getHumanEventDescription(ev);
                  const isRoot = ev.username === 'root';

                  return (
                    <tr
                      key={ev.id}
                      onClick={() => onSelectEvent(ev)}
                      className="hover:bg-slate-800/40 cursor-pointer transition-colors"
                    >
                      {/* Time */}
                      <td className="py-3.5 px-4 text-slate-400 whitespace-nowrap font-mono">
                        {new Date(ev.timestamp).toLocaleTimeString('ru-RU')}
                        <span className="text-[10px] text-slate-400 ml-1.5 hidden sm:inline">
                          {new Date(ev.timestamp).toLocaleDateString('ru-RU')}
                        </span>
                      </td>

                      {/* Attacker IP */}
                      <td className="py-3.5 px-4 font-bold text-cyan-400 hover:text-cyan-300 font-mono whitespace-nowrap">
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectIp(ev.source_ip);
                          }}
                          className="hover:underline"
                        >
                          {ev.source_ip}
                        </span>
                        <div className="text-[11px] text-slate-400 font-sans font-normal mt-0.5">
                          {ev.country_name || 'Неизвестно'}{' '}
                          {ev.country_code ? `(${ev.country_code})` : ''}
                        </div>
                      </td>

                      {/* Targeted Username */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {ev.username ? (
                          <div className="flex items-center gap-1.5 font-mono">
                            <span
                              className={`px-2 py-0.5 rounded font-bold text-xs ${
                                isRoot
                                  ? 'bg-rose-950 text-rose-300 border border-rose-800 flex items-center gap-1'
                                  : 'bg-slate-800 text-amber-300 border border-slate-700'
                              }`}
                            >
                              {isRoot && <AlertTriangle className="w-3 h-3 text-rose-400" />}
                              {ev.username}
                            </span>
                            {isRoot && (
                              <span className="text-[10px] text-rose-400 font-sans">
                                (Суперпользователь!)
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 font-mono">—</span>
                        )}
                      </td>

                      {/* Plain Description */}
                      <td className="py-3.5 px-4 text-slate-200 font-sans max-w-md">
                        <div className="font-medium text-slate-200">
                          {human.summary}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Попытка проникновения через порт {ev.dest_port > 0 ? ev.dest_port : sshPortDisplay} (SSH Remote Shell)
                        </div>
                      </td>

                      {/* Action */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`text-[10px] uppercase font-mono px-2 py-1 rounded font-bold ${
                            ev.action === 'blocked'
                              ? 'bg-rose-950 text-rose-300 border border-rose-800'
                              : 'bg-slate-800 text-slate-300 border border-slate-700'
                          }`}
                        >
                          {ev.action === 'blocked' ? 'Заблокирован' : 'Перехвачен'}
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
        <div className="p-4 border-t border-slate-800 bg-[#0b101d] flex items-center justify-between text-xs font-mono text-slate-400">
          <div>Всего инцидентов: {total.toLocaleString()}</div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span>Строк:</span>
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
                className="p-1.5 rounded bg-slate-900 border border-slate-700 text-slate-300 disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1.5 rounded bg-slate-900 border border-slate-700 text-slate-300 disabled:opacity-40"
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
