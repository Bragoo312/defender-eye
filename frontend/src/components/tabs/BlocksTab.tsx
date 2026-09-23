import { useState, useEffect, useCallback } from 'react';
import type { BlockInfo } from '../../types';
import { getBlocks } from '../../api/client';
import { getHumanBanReason } from '../../utils/explainer';
import {
  Clock,
  RotateCw,
  ChevronLeft,
  ChevronRight,
  Info,
} from 'lucide-react';

interface BlocksTabProps {
  onSelectIp: (ip: string) => void;
}

export const BlocksTab: React.FC<BlocksTabProps> = ({ onSelectIp }) => {
  const [blocks, setBlocks] = useState<BlockInfo[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'expired'>('active');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const fetchBlocks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getBlocks({
        limit: pageSize,
        offset: (page - 1) * pageSize,
        status: statusFilter === 'all' ? undefined : statusFilter,
      });
      setBlocks(res.blocks || []);
      setTotal(res.total || 0);
    } catch (err) {
      console.error('Failed to load blocks:', err);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, statusFilter]);

  useEffect(() => {
    fetchBlocks();
  }, [fetchBlocks]);

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

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6 pb-12 font-sans">
      {/* Educational Banner for Regular Users */}
      <div className="p-4 rounded-2xl bg-cyan-950/20 border border-cyan-500/30 flex items-start gap-3 text-xs text-slate-300">
        <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
        <div className="space-y-1 leading-relaxed">
          <div className="font-semibold text-cyan-300">
            Как работает автоматическая блокировка нарушителей (Автобан)?
          </div>
          <p className="text-slate-300">
            Когда система замечает, что с одного IP-адреса многократно вводят неверные пароли к SSH или сканируют порты сервера, брандмауэр Linux (iptables/nftables) моментально блокирует этот адрес. Все входящие соединения от него сбрасываются. По истечении таймера бан автоматически снимается.
          </p>
        </div>
      </div>

      {/* Control Bar & Filter Tabs */}
      <div className="p-4 rounded-2xl bg-[#0f172a]/90 border border-slate-800/80 shadow-lg flex flex-wrap items-center justify-between gap-4">
        {/* Status Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-900 rounded-xl border border-slate-800 text-xs">
          <button
            onClick={() => {
              setStatusFilter('active');
              setPage(1);
            }}
            className={`px-4 py-1.5 rounded-lg font-medium transition-all ${
              statusFilter === 'active'
                ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            🔴 Активные баны
          </button>
          <button
            onClick={() => {
              setStatusFilter('all');
              setPage(1);
            }}
            className={`px-4 py-1.5 rounded-lg font-medium transition-all ${
              statusFilter === 'all'
                ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            📋 Все записи
          </button>
          <button
            onClick={() => {
              setStatusFilter('expired');
              setPage(1);
            }}
            className={`px-4 py-1.5 rounded-lg font-medium transition-all ${
              statusFilter === 'expired'
                ? 'bg-slate-800 text-slate-200 border border-slate-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            ⚪ Снятые (Истёкшие)
          </button>
        </div>

        {/* Refresh Button */}
        <button
          onClick={fetchBlocks}
          disabled={loading}
          className="p-2 rounded-xl bg-slate-900 border border-slate-700/80 text-slate-400 hover:text-cyan-400 hover:border-cyan-500/30 transition-all disabled:opacity-50"
          title="Обновить список"
        >
          <RotateCw className={`w-4 h-4 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
        </button>
      </div>

      {/* Blocks Table with Plain Explanations */}
      <div className="rounded-2xl bg-[#0f172a]/90 border border-slate-800/80 shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-[#0b101d] text-slate-400 font-mono uppercase tracking-wider text-[11px]">
                <th className="py-3.5 px-4 font-semibold">Нарушитель (IP)</th>
                <th className="py-3.5 px-4 font-semibold">За что забанен (простыми словами)</th>
                <th className="py-3.5 px-4 font-semibold">Время наказания</th>
                <th className="py-3.5 px-4 font-semibold">Срок бана</th>
                <th className="py-3.5 px-4 font-semibold">Таймер до снятия</th>
                <th className="py-3.5 px-4 font-semibold">Статус</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading && blocks.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-slate-400 font-mono">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <RotateCw className="w-6 h-6 animate-spin text-cyan-400" />
                      <span>Загрузка данных блокировок...</span>
                    </div>
                  </td>
                </tr>
              ) : blocks.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-slate-400 font-sans">
                    {statusFilter === 'active'
                      ? 'В данный момент активных банов нет. Ваш сервер работает в штатном режиме.'
                      : 'Записи о блокировках отсутствуют'}
                  </td>
                </tr>
              ) : (
                blocks.map((b) => {
                  const isActive =
                    b.status === 'active' &&
                    (!b.expires_at || new Date(b.expires_at).getTime() > Date.now());

                  const banReason = getHumanBanReason(b);

                  return (
                    <tr
                      key={b.id}
                      onClick={() => onSelectIp(b.ip)}
                      className="hover:bg-slate-800/40 cursor-pointer transition-colors"
                    >
                      {/* IP */}
                      <td className="py-3.5 px-4 font-bold text-rose-400 hover:text-rose-300 font-mono">
                        {b.ip}
                        <div className="text-[10px] text-slate-400 font-sans mt-0.5">
                          Клик для открытия досье
                        </div>
                      </td>

                      {/* Plain Reason */}
                      <td className="py-3.5 px-4 text-slate-200 font-sans max-w-sm">
                        <div className="font-semibold text-slate-200">
                          {banReason.title}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {banReason.subtitle}
                        </div>
                      </td>

                      {/* Banned At */}
                      <td className="py-3.5 px-4 text-slate-400 whitespace-nowrap font-mono">
                        {new Date(b.banned_at).toLocaleString('ru-RU')}
                      </td>

                      {/* Ban Duration */}
                      <td className="py-3.5 px-4 text-slate-300 whitespace-nowrap font-sans">
                        {b.ban_seconds ? `${Math.round(b.ban_seconds / 60)} мин` : 'Бессрочно'}
                      </td>

                      {/* Remaining Time */}
                      <td className="py-3.5 px-4 whitespace-nowrap font-mono">
                        {isActive ? (
                          <div className="flex items-center gap-1.5 text-amber-300 font-bold">
                            <Clock className="w-3.5 h-3.5" />
                            <span>{formatRemainingTime(b.expires_at)}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 font-sans">Бан снят</span>
                        )}
                      </td>

                      {/* Status Badge */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {isActive ? (
                          <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800 flex items-center gap-1 w-fit font-bold">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
                            В бане
                          </span>
                        ) : (
                          <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 w-fit">
                            Снят
                          </span>
                        )}
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
            Показано {blocks.length > 0 ? (page - 1) * pageSize + 1 : 0}–
            {Math.min(total, page * pageSize)} из <span className="text-white font-bold">{total.toLocaleString()}</span> записей
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
