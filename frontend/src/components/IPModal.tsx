import { useEffect, useState } from 'react';
import type { IPInfo, SecurityEvent } from '../types';
import { getIPDetails } from '../api/client';
import { getHumanIPVerdict, getHumanEventDescription } from '../utils/explainer';
import {
  X,
  Network,
  Ban,
  ShieldAlert,
  Copy,
  Check,
  RotateCw,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';

interface IPModalProps {
  ip: string | null;
  onClose: () => void;
  onSelectEvent?: (event: SecurityEvent) => void;
}

export const IPModal: React.FC<IPModalProps> = ({ ip, onClose, onSelectEvent }) => {
  const [data, setData] = useState<{ ip: IPInfo; events: SecurityEvent[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (!ip) {
      setData(null);
      return;
    }
    setLoading(true);
    getIPDetails(ip)
      .then((res) => setData(res))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, [ip]);

  if (!ip) return null;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const ipInfo = data?.ip;
  const events = data?.events || [];
  const verdict = getHumanIPVerdict(ipInfo, events);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-3xl bg-[#0f172a] border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-[#0b101d]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Network className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-mono font-bold text-cyan-300">{ip}</h2>
                <button
                  onClick={() => copyToClipboard(ip)}
                  className="text-slate-400 hover:text-cyan-400 p-1"
                  title="Скопировать IP"
                >
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
                {ipInfo?.is_banned ? (
                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800 flex items-center gap-1 font-bold">
                    <Ban className="w-3 h-3" />
                    Заблокирован в брандмауэре
                  </span>
                ) : (
                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 flex items-center gap-1 font-bold">
                    <ShieldCheck className="w-3 h-3" />
                    Не в бане
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 font-sans mt-0.5">
                {ipInfo?.country_name || 'Неизвестная страна'}{' '}
                {ipInfo?.city ? `• ${ipInfo.city}` : ''}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1 font-sans">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-400">
              <RotateCw className="w-6 h-6 animate-spin text-cyan-400" />
              <span className="text-sm font-mono">Составление досье на хост...</span>
            </div>
          ) : (
            <>
              {/* Human Verdict Box */}
              <div className="p-4 rounded-xl bg-[#0b1220] border border-slate-700/80 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    <span className="text-sm font-bold text-slate-100">
                      Вердикт системы безопасности:
                    </span>
                  </div>
                  <span
                    className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border font-bold ${verdict.verdictColor}`}
                  >
                    Угроза: {verdict.threatLevel}
                  </span>
                </div>

                <div className="text-xs font-semibold text-cyan-300">
                  {verdict.verdictTitle}
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">
                  {verdict.verdictDesc}
                </p>

                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
                  <span>Рекомендация:</span>
                  <span className="font-semibold text-slate-200 font-sans">
                    {verdict.recommendation}
                  </span>
                </div>
              </div>

              {/* Stat Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-slate-900/70 border border-slate-800 rounded-xl">
                  <div className="text-[11px] text-slate-400">Всего атак</div>
                  <div className="text-xl font-bold font-mono text-white mt-1">
                    {ipInfo?.total_events || events.length}
                  </div>
                  <div className="text-[10px] text-cyan-400 mt-0.5">инцидентов</div>
                </div>
                <div className="p-3 bg-slate-900/70 border border-slate-800 rounded-xl">
                  <div className="text-[11px] text-slate-400">Провайдер хостинга</div>
                  <div className="text-xs font-bold font-mono text-cyan-300 mt-1 truncate">
                    {ipInfo?.asn ? `AS${ipInfo.asn}` : '—'}
                  </div>
                  <div className="text-[10px] text-slate-400 truncate">{ipInfo?.as_org || '—'}</div>
                </div>
                <div className="p-3 bg-slate-900/70 border border-slate-800 rounded-xl">
                  <div className="text-[11px] text-slate-400">Первая попытка</div>
                  <div className="text-xs font-mono text-slate-300 mt-1">
                    {ipInfo?.first_seen
                      ? new Date(ipInfo.first_seen).toLocaleDateString('ru-RU')
                      : '—'}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {ipInfo?.first_seen
                      ? new Date(ipInfo.first_seen).toLocaleTimeString('ru-RU')
                      : ''}
                  </div>
                </div>
                <div className="p-3 bg-slate-900/70 border border-slate-800 rounded-xl">
                  <div className="text-[11px] text-slate-400">Крайняя активность</div>
                  <div className="text-xs font-mono text-slate-300 mt-1">
                    {ipInfo?.last_seen
                      ? new Date(ipInfo.last_seen).toLocaleTimeString('ru-RU')
                      : '—'}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {ipInfo?.last_seen
                      ? new Date(ipInfo.last_seen).toLocaleDateString('ru-RU')
                      : ''}
                  </div>
                </div>
              </div>

              {/* Event Timeline with Human Summaries */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 text-cyan-400" />
                    История враждебных действий ({events.length})
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    Кликните по строке для детального отчета
                  </span>
                </div>

                <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/50">
                  {events.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-400">
                      Событий по данному адресу не зафиксировано
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-800/80 max-h-72 overflow-y-auto">
                      {events.map((ev) => {
                        const humanEv = getHumanEventDescription(ev);
                        return (
                          <div
                            key={ev.id}
                            onClick={() => onSelectEvent?.(ev)}
                            className="p-3 flex items-center justify-between hover:bg-slate-800/60 cursor-pointer transition-colors text-xs"
                          >
                            <div className="flex items-center gap-3">
                              <span
                                className={`w-2 h-2 rounded-full shrink-0 ${
                                  ev.severity === 'critical'
                                    ? 'bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.8)]'
                                    : ev.severity === 'high'
                                    ? 'bg-amber-500'
                                    : 'bg-yellow-500'
                                }`}
                              />
                              <div>
                                <div className="text-slate-200 font-medium">
                                  {humanEv.summary}
                                </div>
                                <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2">
                                  <span className="text-cyan-400 font-mono">
                                    {humanEv.dangerBadge}
                                  </span>
                                  <span>•</span>
                                  <span>
                                    Цель: {ev.dest_port > 0 ? `порт ${ev.dest_port}` : 'периметр'}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              <span
                                className={`text-[10px] uppercase font-mono px-1.5 py-0.5 rounded font-bold ${
                                  ev.action === 'blocked'
                                    ? 'bg-rose-950 text-rose-300 border border-rose-800'
                                    : 'bg-slate-800 text-slate-300'
                                }`}
                              >
                                {ev.action === 'blocked' ? 'Заблокирован' : 'Зафиксирован'}
                              </span>
                              <div className="text-[10px] text-slate-400 font-mono mt-1">
                                {new Date(ev.timestamp).toLocaleTimeString('ru-RU')}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-800 bg-[#0b101d] flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 transition-colors font-medium text-xs font-sans"
          >
            Закрыть досье
          </button>
        </div>
      </div>
    </div>
  );
};
