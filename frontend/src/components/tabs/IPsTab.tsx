import { useState, useEffect, useCallback } from 'react';
import type { IPInfo } from '../../types';
import { getIPs } from '../../api/client';
import {
  Search,
  RotateCw,
  Ban,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Copy,
  Check,
  Info,
} from 'lucide-react';

interface IPsTabProps {
  onSelectIp: (ip: string) => void;
}

export const IPsTab: React.FC<IPsTabProps> = ({ onSelectIp }) => {
  const [ips, setIps] = useState<IPInfo[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [copiedIp, setCopiedIp] = useState<string | null>(null);

  const fetchIPs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getIPs({
        limit: pageSize,
        offset: (page - 1) * pageSize,
        search: search.trim() || undefined,
      });
      setIps(res.ips || []);
      setTotal(res.total || 0);
    } catch (err) {
      console.error('Failed to load IPs:', err);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search]);

  useEffect(() => {
    fetchIPs();
  }, [fetchIPs]);

  const copyIp = (e: React.MouseEvent, ip: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(ip);
    setCopiedIp(ip);
    setTimeout(() => setCopiedIp(null), 2000);
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6 pb-12 font-sans">
      {/* Friendly Guide Banner */}
      <div className="p-4 rounded-2xl bg-cyan-950/20 border border-cyan-500/30 flex items-start gap-3 text-xs text-slate-300">
        <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
        <div className="space-y-1 leading-relaxed">
          <div className="font-semibold text-cyan-300">
            Реестр атакующих IP-адресов
          </div>
          <p className="text-slate-300">
            Здесь собраны все уникальные хосты, с которых на ваш сервер совершались атаки. Система фиксирует страну происхождения, компанию-провайдера (ASN) и количество рецидивов. Нажмите «Открыть досье», чтобы увидеть вердикт системы безопасности.
          </p>
        </div>
      </div>

      {/* Control Bar: Search & Refresh */}
      <div className="p-4 rounded-2xl bg-[#0f172a]/90 border border-slate-800/80 shadow-lg flex flex-wrap items-center justify-between gap-4">
        <div className="relative flex-1 min-w-[260px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Поиск по IP адресу, подсети или ASN провайдеру..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-700/80 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 transition-all font-mono"
          />
        </div>

        <button
          onClick={fetchIPs}
          disabled={loading}
          className="p-2 rounded-xl bg-slate-900 border border-slate-700/80 text-slate-400 hover:text-cyan-400 hover:border-cyan-500/30 transition-all disabled:opacity-50"
          title="Обновить реестр"
        >
          <RotateCw className={`w-4 h-4 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
        </button>
      </div>

      {/* IPs Table */}
      <div className="rounded-2xl bg-[#0f172a]/90 border border-slate-800/80 shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-[#0b101d] text-slate-400 font-mono uppercase tracking-wider text-[11px]">
                <th className="py-3.5 px-4 font-semibold">IP Адрес</th>
                <th className="py-3.5 px-4 font-semibold">Страна & Город</th>
                <th className="py-3.5 px-4 font-semibold">Провайдер / ASN</th>
                <th className="py-3.5 px-4 font-semibold text-right">Инцидентов</th>
                <th className="py-3.5 px-4 font-semibold">Статус бана</th>
                <th className="py-3.5 px-4 font-semibold">Крайняя активность</th>
                <th className="py-3.5 px-4 font-semibold text-center">Досье</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {loading && ips.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <RotateCw className="w-6 h-6 animate-spin text-cyan-400" />
                      <span>Загрузка каталога IP-адресов...</span>
                    </div>
                  </td>
                </tr>
              ) : ips.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-slate-400">
                    IP-адреса не найдены
                  </td>
                </tr>
              ) : (
                ips.map((item) => (
                  <tr
                    key={item.ip}
                    onClick={() => onSelectIp(item.ip)}
                    className="hover:bg-slate-800/40 cursor-pointer transition-colors"
                  >
                    {/* IP & Copy */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-cyan-400 hover:text-cyan-300">
                          {item.ip}
                        </span>
                        <button
                          onClick={(e) => copyIp(e, item.ip)}
                          className="text-slate-500 hover:text-cyan-400 p-0.5"
                          title="Скопировать IP"
                        >
                          {copiedIp === item.ip ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </td>

                    {/* Country & City */}
                    <td className="py-3 px-4 whitespace-nowrap font-sans">
                      <div className="flex items-center gap-2">
                        {item.country_code && (
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 border border-slate-700">
                            {item.country_code}
                          </span>
                        )}
                        <span className="text-slate-200">
                          {item.country_name || 'Неизвестно'}
                        </span>
                        {item.city && (
                          <span className="text-slate-400 text-[11px]">({item.city})</span>
                        )}
                      </div>
                    </td>

                    {/* ASN & Org */}
                    <td className="py-3 px-4 max-w-[200px] truncate text-slate-300">
                      {item.asn > 0 && <span className="text-indigo-400 mr-1.5 font-bold">AS{item.asn}</span>}
                      <span className="font-sans text-slate-400">{item.as_org || '—'}</span>
                    </td>

                    {/* Total Events */}
                    <td className="py-3 px-4 text-right font-bold text-white">
                      {item.total_events.toLocaleString()}
                    </td>

                    {/* Ban Status */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      {item.is_banned ? (
                        <span className="text-[10px] uppercase px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800 flex items-center gap-1 w-fit font-bold">
                          <Ban className="w-3 h-3" />
                          Заблокирован
                        </span>
                      ) : (
                        <span className="text-[10px] uppercase px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 w-fit">
                          Свободен
                        </span>
                      )}
                    </td>

                    {/* Last Seen */}
                    <td className="py-3 px-4 whitespace-nowrap text-slate-400">
                      {item.last_seen ? new Date(item.last_seen).toLocaleString('ru-RU') : '—'}
                    </td>

                    {/* Action */}
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectIp(item.ip);
                        }}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-cyan-500/20 text-cyan-400 border border-slate-700"
                        title="Открыть досье"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="p-4 border-t border-slate-800 bg-[#0b101d] flex flex-wrap items-center justify-between gap-4 text-xs font-mono text-slate-400">
          <div>
            Показано {ips.length > 0 ? (page - 1) * pageSize + 1 : 0}–
            {Math.min(total, page * pageSize)} из <span className="text-white font-bold">{total.toLocaleString()}</span> адресов
          </div>

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
