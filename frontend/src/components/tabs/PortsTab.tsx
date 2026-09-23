import { useState, useEffect } from 'react';
import type { PortStat } from '../../types';
import { getPorts } from '../../api/client';
import {
  Radio,
  RotateCw,
  ShieldCheck,
  Flame,
} from 'lucide-react';

export const PortsTab: React.FC = () => {
  const [ports, setPorts] = useState<PortStat[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchPorts = async () => {
    setLoading(true);
    try {
      const data = await getPorts();
      setPorts(data || []);
    } catch (err) {
      console.error('Failed to load ports:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPorts();
  }, []);

  const totalScans = ports.reduce((acc, p) => acc + p.count, 0);

  // Common port explanations
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
    <div className="space-y-6 pb-12">
      {/* Top Banner */}
      <div className="p-4 rounded-2xl bg-[#0f172a]/90 border border-slate-800/80 shadow-lg flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Radio className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <span>Анализ сканирования сетевых портов</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
                PORT RECONNAISSANCE
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Мониторинг попыток обнаружения открытых сервисов и зондирования периметра VPS
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-xs font-mono text-slate-300 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl">
            Всего обращений: <span className="text-cyan-400 font-bold">{totalScans.toLocaleString()}</span>
          </div>
          <button
            onClick={fetchPorts}
            disabled={loading}
            className="p-2 rounded-xl bg-slate-900 border border-slate-700/80 text-slate-400 hover:text-cyan-400 transition-all"
            title="Обновить"
          >
            <RotateCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Main Ports Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Scanned Ports Ranking (2 cols) */}
        <div className="lg:col-span-2 p-5 rounded-2xl bg-[#0f172a]/90 border border-slate-800/80 shadow-lg">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <span className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Flame className="w-4 h-4 text-amber-400" />
              <span>Рейтинг атакуемых портов</span>
            </span>
            <span className="text-xs text-slate-400 font-mono">Объем зондирования</span>
          </div>

          <div className="mt-4 space-y-4">
            {ports.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400 font-mono">
                Данные о сканировании портов отсутствуют
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
