import { useState, useEffect } from 'react';
import type { PortStat, ListeningPort } from '../../types';
import { getPorts, getListeningPorts } from '../../api/client';
import {
  Radio,
  RotateCw,
  ShieldCheck,
  Flame,
  AlertTriangle,
  Lock,
  Unlock,
  CheckCircle,
  HelpCircle,
  Server,
} from 'lucide-react';

export const PortsTab: React.FC = () => {
  const [ports, setPorts] = useState<PortStat[]>([]);
  const [listeningPorts, setListeningPorts] = useState<ListeningPort[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchAllPortData = async () => {
    setLoading(true);
    try {
      const [reconData, listeningData] = await Promise.all([
        getPorts().catch(() => []),
        getListeningPorts().catch(() => ({ ports: [], count: 0 })),
      ]);
      setPorts(reconData || []);
      setListeningPorts(listeningData?.ports || []);
    } catch (err) {
      console.error('Failed to load ports data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllPortData();
  }, []);

  const totalScans = ports.reduce((acc, p) => acc + p.count, 0);

  const riskBadge = (risk: string) => {
    switch (risk) {
      case 'critical':
        return {
          label: 'КРИТИЧНО',
          style: 'bg-rose-950/90 text-rose-300 border-rose-800 animate-pulse',
          icon: <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />,
        };
      case 'high':
        return {
          label: 'ВЫСОКИЙ РИСК',
          style: 'bg-amber-950/90 text-amber-300 border-amber-800',
          icon: <Flame className="w-3.5 h-3.5 text-amber-400 shrink-0" />,
        };
      case 'medium':
        return {
          label: 'ВНИМАНИЕ',
          style: 'bg-yellow-950/90 text-yellow-300 border-yellow-800',
          icon: <Unlock className="w-3.5 h-3.5 text-yellow-400 shrink-0" />,
        };
      case 'safe':
        return {
          label: 'БЕЗОПАСНО',
          style: 'bg-emerald-950/80 text-emerald-300 border-emerald-800',
          icon: <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />,
        };
      default:
        return {
          label: 'ИНФО',
          style: 'bg-slate-800 text-slate-300 border-slate-700',
          icon: <HelpCircle className="w-3.5 h-3.5 text-slate-400 shrink-0" />,
        };
    }
  };

  const portDescriptions: Record<number, string> = {
    22: 'SSH Remote Shell — популярная цель для перебора паролей и ключей',
    80: 'HTTP Web Traffic — поиск уязвимостей CMS, открытых админок, phpMyAdmin',
    443: 'HTTPS Encrypted Web — сканирование веб-приложений, API и SSL эксплойтов',
    3389: 'RDP (Windows Remote Desktop) — сканирование удаленных рабочих столов',
    3306: 'MySQL / MariaDB — попытки прямого подключения к базе данных',
    5432: 'PostgreSQL — сканирование доступных реляционных баз данных',
    6379: 'Redis Cache — поиск неавторизованных Redis серверов (RCE вектор)',
    27017: 'MongoDB NoSQL — поиск незащищенных баз без пароля',
    8080: 'HTTP Alternate / Proxy / Dev Servers — часто используется тестовыми сервисами',
    8443: 'HTTPS Alternate / Management Console — панели управления и шлюзы',
  };

  return (
    <div className="space-y-6 pb-12 font-sans">
      {/* Header Banner */}
      <div className="p-4 rounded-2xl bg-[#0f172a]/90 border border-slate-800/80 shadow-lg flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Radio className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <span>Аудит открытых портов и сканирования сети</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
                ACTIVE PORT SECURITY AUDIT
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Мониторинг активных сетевых сокетов сервера и анализ внешнего зондирования портов
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-xs font-mono text-slate-300 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl">
            Открытых портов на сервере: <span className="text-cyan-400 font-bold">{listeningPorts.length}</span>
          </div>
          <button
            onClick={fetchAllPortData}
            disabled={loading}
            className="p-2 rounded-xl bg-slate-900 border border-slate-700/80 text-slate-400 hover:text-cyan-400 transition-all cursor-pointer"
            title="Обновить данные портов"
          >
            <RotateCw className={`w-4 h-4 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* SECTION 1: ACTIVE LISTENING PORTS ON SERVER (NEW FEATURE) */}
      <div className="p-5 rounded-2xl bg-[#0f172a]/90 border border-slate-800/80 shadow-lg space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-semibold text-slate-100">
              Все открытые порты на сервере и экспертные рекомендации
            </h3>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            Автоскан: /proc/net/tcp
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-[#0b101d] text-slate-400 font-mono uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4 font-semibold">Порт / Протокол</th>
                <th className="py-3 px-4 font-semibold">Служба / Процесс</th>
                <th className="py-3 px-4 font-semibold">Интерфейс (Bind IP)</th>
                <th className="py-3 px-4 font-semibold">Уровень риска</th>
                <th className="py-3 px-4 font-semibold">Рекомендация и почему открыт</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400 font-mono text-xs">
                    Загрузка списка открытых портов сервера...
                  </td>
                </tr>
              ) : listeningPorts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400 font-mono text-xs">
                    Открытые прослушиваемые порты не обнаружены
                  </td>
                </tr>
              ) : (
                listeningPorts.map((lp, i) => {
                  const rBadge = riskBadge(lp.risk_level);
                  const isPublic = lp.bind_address === '0.0.0.0' || lp.bind_address === '::';

                  return (
                    <tr key={`${lp.port}-${lp.protocol}-${i}`} className="hover:bg-slate-900/50 transition-colors">
                      <td className="py-3 px-4 font-mono">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-cyan-300 font-bold">
                            :{lp.port}
                          </span>
                          <span className="text-[10px] uppercase text-slate-400">{lp.protocol}</span>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-200">{lp.service}</div>
                        <div className="text-[11px] text-slate-400 font-mono">{lp.process_name}</div>
                      </td>

                      <td className="py-3 px-4 font-mono">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-bold ${
                            isPublic
                              ? 'bg-rose-950/40 text-rose-300 border-rose-800/80'
                              : 'bg-emerald-950/40 text-emerald-300 border-emerald-800/80'
                          }`}
                        >
                          {isPublic ? <Unlock className="w-3 h-3 text-rose-400" /> : <Lock className="w-3 h-3 text-emerald-400" />}
                          <span>{lp.bind_address}</span>
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-bold uppercase tracking-wide ${rBadge.style}`}
                        >
                          {rBadge.icon}
                          <span>{rBadge.label}</span>
                        </span>
                      </td>

                      <td className="py-3 px-4 leading-relaxed text-slate-300 max-w-md">
                        {lp.recommendation}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION 2: ATTACKED PORTS RANKING & ADVICE */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Scanned Ports Ranking (2 cols) */}
        <div className="lg:col-span-2 p-5 rounded-2xl bg-[#0f172a]/90 border border-slate-800/80 shadow-lg">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <span className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Flame className="w-4 h-4 text-amber-400" />
              <span>Рейтинг внешне атакуемых портов</span>
            </span>
            <span className="text-xs text-slate-400 font-mono">Объем зондирования</span>
          </div>

          <div className="mt-4 space-y-4">
            {ports.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400 font-mono">
                Данные о внешнем сканировании портов отсутствуют
              </div>
            ) : (
              ports.map((p, idx) => {
                const percentage = totalScans > 0 ? (p.count / totalScans) * 100 : 0;
                return (
                  <div
                    key={p.port}
                    className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-2 hover:border-cyan-500/30 transition-all"
                  >
                    <div className="flex items-center justify-between text-xs font-mono">
                      <div className="flex items-center gap-2.5">
                        <span className="text-slate-400 font-bold w-4">{idx + 1}.</span>
                        <span className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 font-bold border border-cyan-800">
                          Port {p.port}
                        </span>
                        <span className="font-semibold text-slate-200 uppercase font-sans">
                          {p.service || 'Unknown'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-white font-bold">{p.count.toLocaleString()}</span>
                        <span className="text-slate-400 text-[11px]">
                          ({percentage.toFixed(1)}%)
                        </span>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-cyan-500 via-indigo-500 to-rose-500 rounded-full"
                        style={{ width: `${Math.min(100, Math.max(3, percentage))}%` }}
                      />
                    </div>

                    {/* Port Context / Guidance */}
                    <div className="text-[11px] text-slate-400 font-sans pt-0.5">
                      {portDescriptions[p.port] ||
                        'Специфический сетевой порт, сканируемый автоматизированными ботнетами.'}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Security Recommendations Sidebar */}
        <div className="p-5 rounded-2xl bg-[#0f172a]/90 border border-slate-800/80 shadow-lg space-y-4">
          <span className="text-sm font-semibold text-slate-200 flex items-center gap-2 pb-3 border-b border-slate-800">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Рекомендации по защите периметра</span>
          </span>

          <div className="space-y-3 text-xs text-slate-300 font-sans leading-relaxed">
            <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl space-y-1">
              <div className="font-semibold text-cyan-300">1. Смена стандартного SSH порта:</div>
              <p className="text-slate-400 text-[11px]">
                Перенос SSH с порта 22 на произвольный высокий порт (например, 22222) отсекает до
                95% автоматических скриптовых ботнетов.
              </p>
            </div>

            <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl space-y-1">
              <div className="font-semibold text-indigo-300">2. Привязка к localhost (127.0.0.1):</div>
              <p className="text-slate-400 text-[11px]">
                Внутренние базы данных (Redis, MySQL, Postgres) и панели не должны слушать
                `0.0.0.0`. Доступ к ним следует открывать только через SSH-туннели.
              </p>
            </div>

            <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl space-y-1">
              <div className="font-semibold text-emerald-300">3. Правило закрытого периметра:</div>
              <p className="text-slate-400 text-[11px]">
                Настройте брандмауэр Linux по принципу "запрещено всё, кроме явно разрешенного":
                <code className="block mt-1 p-1 bg-black/60 rounded font-mono text-[10px] text-emerald-400">
                  ufw default deny incoming
                </code>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
