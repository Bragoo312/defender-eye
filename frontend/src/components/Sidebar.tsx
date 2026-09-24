import React from 'react';
import {
  LayoutDashboard,
  ShieldAlert,
  Globe,
  Ban,
  Network,
  Terminal,
  Radio,
  Cpu,
  Settings,
  Eye,
} from 'lucide-react';

export type TabId =
  | 'dashboard'
  | 'events'
  | 'threatmap'
  | 'blocks'
  | 'ips'
  | 'ssh'
  | 'ports'
  | 'system'
  | 'settings';

interface SidebarProps {
  activeTab: TabId;
  onSelectTab: (tab: TabId) => void;
  connected: boolean;
  activeBansCount: number;
  eventsTotal24h: number;
}

interface NavItem {
  id: TabId;
  label: string;
  icon: React.ElementType;
  badge?: number | string;
  badgeColor?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  connected,
  activeBansCount,
  eventsTotal24h,
}) => {
  const navItems: NavItem[] = [
    { id: 'dashboard', label: 'Обзор', icon: LayoutDashboard },
    {
      id: 'events',
      label: 'События',
      icon: ShieldAlert,
      badge: eventsTotal24h > 0 ? eventsTotal24h.toLocaleString() : undefined,
      badgeColor: 'bg-cyan-950 text-cyan-400 border border-cyan-800',
    },
    { id: 'threatmap', label: 'Карта угроз', icon: Globe },
    {
      id: 'blocks',
      label: 'Блокировки',
      icon: Ban,
      badge: activeBansCount > 0 ? activeBansCount : undefined,
      badgeColor: 'bg-rose-950 text-rose-400 border border-rose-800/80 animate-pulse',
    },
    { id: 'ips', label: 'IP Реестр', icon: Network },
    { id: 'ssh', label: 'SSH Атаки', icon: Terminal },
    { id: 'ports', label: 'Порты', icon: Radio },
    { id: 'system', label: 'Система', icon: Cpu },
    { id: 'settings', label: 'Настройки', icon: Settings },
  ];

  return (
    <aside className="w-64 bg-[#0d131f] border-r border-slate-800/80 flex flex-col h-screen select-none shrink-0 z-20">
      {/* Brand Header */}
      <div className="h-16 flex items-center px-5 border-b border-slate-800/80 gap-3">
        <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/40 text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.25)]">
          <Eye className="w-5 h-5 text-cyan-400" />
          <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-[#0d131f]" />
        </div>
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span className="font-bold tracking-wider text-base text-slate-100 uppercase">
              Defender<span className="text-cyan-400">Eye</span>
            </span>
            <span className="text-[10px] font-mono uppercase px-1.5 py-0.2 bg-cyan-950/80 text-cyan-400 border border-cyan-800 rounded">
              v1.3.1
            </span>
          </div>
          <span className="text-xs text-slate-400 font-medium">Security SOC HUD</span>
        </div>
      </div>

      {/* Navigation List */}
      <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
        <div className="px-3 pb-2 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
          Мониторинг
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all group ${
                isActive
                  ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 shadow-[0_0_12px_rgba(6,182,212,0.15)]'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon
                  className={`w-4 h-4 transition-colors ${
                    isActive ? 'text-cyan-400' : 'text-slate-400 group-hover:text-slate-300'
                  }`}
                />
                <span>{item.label}</span>
              </div>
              {item.badge !== undefined && (
                <span className={`text-[11px] font-mono px-2 py-0.5 rounded-full ${item.badgeColor || 'bg-slate-800 text-slate-300'}`}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Collector / Status Footer */}
      <div className="p-4 border-t border-slate-800/80 bg-[#0a0e17]/80">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              {connected ? (
                <>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </>
              ) : (
                <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
              )}
            </span>
            <span className="text-xs font-mono text-slate-300">
              {connected ? 'E2EE Realtime' : 'Reconnecting...'}
            </span>
          </div>
          <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-800/50">
            TLS/SSE
          </span>
        </div>
        <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
          <span>Engine</span>
          <span className="text-slate-300">SQLite WAL</span>
        </div>
        <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono mt-1">
          <span>Mode</span>
          <span className="text-emerald-400 font-medium">Self-Hosted SOC</span>
        </div>
      </div>
    </aside>
  );
};
