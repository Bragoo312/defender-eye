import { useEffect, useState } from 'react';
import type { SecurityEvent } from '../types';
import { getHumanEventDescription } from '../utils/explainer';
import {
  X,
  ShieldAlert,
  Globe,
  Server,
  Terminal,
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Info,
} from 'lucide-react';

interface EventModalProps {
  event: SecurityEvent | null;
  onClose: () => void;
  onInspectIp?: (ip: string) => void;
}

export const EventModal: React.FC<EventModalProps> = ({
  event,
  onClose,
  onInspectIp,
}) => {
  const [copied, setCopied] = useState(false);
  const [showTechDetails, setShowTechDetails] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!event) return null;

  const human = getHumanEventDescription(event);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const severityBadge = {
    critical: {
      color: 'bg-rose-950 text-rose-300 border-rose-800',
      label: 'Критическая опасность',
    },
    high: {
      color: 'bg-amber-950 text-amber-300 border-amber-800',
      label: 'Высокая опасность',
    },
    medium: {
      color: 'bg-yellow-950 text-yellow-300 border-yellow-800',
      label: 'Средний уровень',
    },
    low: {
      color: 'bg-blue-950 text-blue-300 border-blue-800',
      label: 'Низкий уровень',
    },
    info: {
      color: 'bg-slate-800 text-slate-300 border-slate-700',
      label: 'Информационный',
    },
  }[event.severity || 'medium'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-2xl bg-[#0f172a] border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-[#0b101d]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-slate-100 font-sans">
                  {human.category}
                </h2>
                <span
                  className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border font-bold ${severityBadge.color}`}
                >
                  {severityBadge.label}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Зафиксировано: {new Date(event.timestamp).toLocaleString('ru-RU')}
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

        {/* Content Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1 font-sans">
          {/* Main Plain-Language Explanation Card */}
          <div className="p-4 rounded-xl bg-cyan-950/30 border border-cyan-500/30 space-y-2">
            <div className="flex items-center gap-2 text-cyan-300 font-semibold text-sm">
              <Info className="w-4 h-4 text-cyan-400 shrink-0" />
              <span>Что произошло (простыми словами):</span>
            </div>
            <p className="text-slate-200 text-xs leading-relaxed font-medium">
              {human.summary}
            </p>
            <p className="text-slate-400 text-[11px] leading-relaxed pt-1 border-t border-cyan-900/40">
              {human.details}
            </p>
          </div>

          {/* Action Taken by Server */}
          <div
            className={`p-3.5 rounded-xl border flex items-center gap-3 text-xs ${
              event.action === 'blocked'
                ? 'bg-rose-950/40 border-rose-500/30 text-rose-200'
                : 'bg-slate-900 border-slate-800 text-slate-300'
            }`}
          >
            <div
              className={`p-2 rounded-lg shrink-0 ${
                event.action === 'blocked'
                  ? 'bg-rose-500/20 text-rose-400'
                  : 'bg-emerald-500/20 text-emerald-400'
              }`}
            >
              {event.action === 'blocked' ? (
                <AlertTriangle className="w-4 h-4" />
              ) : (
                <ShieldCheck className="w-4 h-4" />
              )}
            </div>
            <div>
              <div className="font-semibold">
                {event.action === 'blocked'
                  ? 'Реакция сервера: IP успешно заблокирован брандмауэром'
                  : 'Реакция сервера: Подозрительное действие перехвачено и записано'}
              </div>
              <div className="text-[11px] opacity-80 mt-0.5">
                {event.action === 'blocked'
                  ? 'Все входящие сетевые пакеты с этого адреса отбрасываются ядром Linux (iptables / nftables).'
                  : 'Атака не привела к компрометации. Сервер продолжает наблюдать за поведением хоста.'}
              </div>
            </div>
          </div>

          {/* Key Facts Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Attacker Info */}
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-2.5">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 font-sans">
                  <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                  Кто атаковал
                </span>
                {onInspectIp && (
                  <button
                    onClick={() => onInspectIp(event.source_ip)}
                    className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-medium font-sans"
                  >
                    <span>Открыть досье</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                )}
              </div>
              <div className="space-y-1.5 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-400 font-sans">IP адрес:</span>
                  <span className="text-cyan-300 font-bold">{event.source_ip}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-sans">Логин взлома:</span>
                  <span className="text-amber-300 font-bold">{event.username || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-sans">Страна:</span>
                  <span className="text-slate-200 font-sans">
                    {event.country_name || 'Не определена'}{' '}
                    {event.country_code ? `(${event.country_code})` : ''}
                  </span>
                </div>
              </div>
            </div>

            {/* Target Info */}
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-2.5">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 font-sans">
                  <Server className="w-3.5 h-3.5 text-indigo-400" />
                  Куда пытался проникнуть
                </span>
              </div>
              <div className="space-y-1.5 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-400 font-sans">Сетевой порт:</span>
                  <span className="text-indigo-300 font-bold">
                    {event.dest_port > 0 ? `${event.dest_port} (TCP)` : 'Разведка нескольких'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-sans">Служба сервера:</span>
                  <span className="text-slate-200 font-sans uppercase font-bold">
                    {event.service || 'system'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-sans">Подсистема:</span>
                  <span className="text-slate-300 font-sans">{event.monitor || event.source}</span>
                </div>
              </div>
            </div>

            {/* Provider and Location */}
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-2 md:col-span-2 text-xs">
              <span className="font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 font-sans">
                <Globe className="w-3.5 h-3.5 text-emerald-400" />
                Сведения о провайдере атакующего
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
                <div>
                  <div className="text-slate-400 text-[11px]">Город размещения:</div>
                  <div className="font-medium text-slate-200 mt-0.5">{event.city || '—'}</div>
                </div>
                <div>
                  <div className="text-slate-400 text-[11px]">Автономная система:</div>
                  <div className="font-mono text-cyan-300 mt-0.5">
                    {event.asn > 0 ? `AS${event.asn}` : '—'}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400 text-[11px]">Хостинг-провайдер:</div>
                  <div className="font-medium text-slate-200 mt-0.5 truncate">
                    {event.as_org || '—'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Technical Details Accordion */}
          <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/40">
            <button
              onClick={() => setShowTechDetails(!showTechDetails)}
              className="w-full p-3.5 flex items-center justify-between text-xs text-slate-400 hover:text-slate-200 transition-colors font-sans font-medium"
            >
              <span>Технические подробности (для специалистов)</span>
              {showTechDetails ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>

            {showTechDetails && (
              <div className="p-4 border-t border-slate-800 space-y-3 bg-[#0a0e17]">
                <div className="text-xs font-mono text-slate-400 flex items-center justify-between">
                  <span>Системный ID: {event.event_id}</span>
                  {event.raw_data && (
                    <button
                      onClick={() => copyToClipboard(event.raw_data || '')}
                      className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 text-[11px]"
                    >
                      {copied ? (
                        <Check className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                      <span>{copied ? 'Скопировано' : 'Копировать JSON'}</span>
                    </button>
                  )}
                </div>
                {event.raw_data && (
                  <pre className="p-3 bg-black/60 border border-slate-800 rounded-lg text-xs font-mono text-slate-300 overflow-x-auto max-h-40 leading-relaxed">
                    {event.raw_data}
                  </pre>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-800 bg-[#0b101d] flex items-center justify-between text-xs text-slate-400">
          <div className="font-mono">
            IP:{' '}
            <span className="text-cyan-300 font-bold">{event.source_ip}</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 transition-colors font-medium font-sans"
          >
            Понятно, закрыть
          </button>
        </div>
      </div>
    </div>
  );
};
