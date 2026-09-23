import { useState, useEffect, useCallback } from 'react';
import { Sidebar, type TabId } from './components/Sidebar';
import { Header } from './components/Header';
import { DashboardTab } from './components/tabs/DashboardTab';
import { EventsTab } from './components/tabs/EventsTab';
import { ThreatMapTab } from './components/tabs/ThreatMapTab';
import { BlocksTab } from './components/tabs/BlocksTab';
import { IPsTab } from './components/tabs/IPsTab';
import { SSHTab } from './components/tabs/SSHTab';
import { PortsTab } from './components/tabs/PortsTab';
import { SystemTab } from './components/tabs/SystemTab';
import { SettingsTab } from './components/tabs/SettingsTab';
import { EventModal } from './components/EventModal';
import { IPModal } from './components/IPModal';
import type { DashboardStats, SecurityEvent } from './types';
import { getStats, getSettings, updateSettings, subscribeRealtime } from './api/client';

export function App() {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [demoMode, setDemoMode] = useState<boolean>(true);
  const [connected, setConnected] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Inspector Modals
  const [selectedEvent, setSelectedEvent] = useState<SecurityEvent | null>(null);
  const [selectedIp, setSelectedIp] = useState<string | null>(null);

  // Live Toast for incoming critical alerts
  const [liveToast, setLiveToast] = useState<SecurityEvent | null>(null);

  // Fetch initial dashboard stats
  const fetchStats = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await getStats();
      setStats(data);
    } catch (err) {
      console.error('Failed to load stats:', err);
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Fetch settings to sync demoMode state
  const fetchSettings = useCallback(async () => {
    try {
      const s = await getSettings();
      setDemoMode(s.demo_mode);
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  }, []);

  const [pollIntervalMs, setPollIntervalMs] = useState<number>(() => {
    const saved = localStorage.getItem('defender_telemetry_rate');
    return saved ? parseInt(saved, 10) : 3000;
  });

  useEffect(() => {
    const saved = localStorage.getItem('defender_telemetry_rate');
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (parsed > 0) {
        setPollIntervalMs((prev) => (prev !== parsed ? parsed : prev));
      }
    }
  }, [activeTab]);

  useEffect(() => {
    fetchStats();
    fetchSettings();

    // Configurable telemetry polling interval (1s, 2s, 3s, 5s, 10s)
    const interval = setInterval(fetchStats, pollIntervalMs);
    return () => clearInterval(interval);
  }, [fetchStats, fetchSettings, pollIntervalMs]);

  // Subscribe to SSE real-time security events
  useEffect(() => {
    const unsubscribe = subscribeRealtime(
      (newEvent: SecurityEvent) => {
        // Trigger live toast
        setLiveToast(newEvent);
        setTimeout(() => setLiveToast(null), 4000);

        // Prepend event to current stats
        setStats((prev) => {
          if (!prev) return prev;
          const updatedEvents = [newEvent, ...(prev.recent_events || [])].slice(0, 50);

          let activeBlocks = prev.blocked_ips_active;
          let recentBlocks = prev.recent_blocks || [];
          if (newEvent.action === 'blocked') {
            activeBlocks += 1;
            recentBlocks = [
              {
                id: Math.random(),
                ip: newEvent.source_ip,
                banned_at: newEvent.timestamp,
                expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
                ban_seconds: 3600,
                reason: newEvent.message,
                monitor: newEvent.monitor,
                status: 'active' as const,
              },
              ...recentBlocks,
            ].slice(0, 20);
          }

          return {
            ...prev,
            events_total_24h: prev.events_total_24h + 1,
            events_total_7d: prev.events_total_7d + 1,
            blocked_ips_active: activeBlocks,
            recent_events: updatedEvents,
            recent_blocks: recentBlocks,
          };
        });
      },
      (isConnected: boolean) => {
        setConnected(isConnected);
      }
    );

    return () => unsubscribe();
  }, []);

  // Handle Demo Mode Switch
  const handleToggleDemoMode = async () => {
    const nextVal = !demoMode;
    setDemoMode(nextVal);
    try {
      await updateSettings({ demo_mode: nextVal });
      fetchStats();
    } catch (err) {
      console.error('Failed to toggle demo mode:', err);
      setDemoMode(!nextVal);
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0b0f17] text-slate-100 cyber-grid">
      {/* 3X-UI Sidebar */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        connected={connected}
        activeBansCount={stats?.blocked_ips_active || 0}
        eventsTotal24h={stats?.events_total_24h || 0}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Top Header */}
        <Header
          activeTab={activeTab}
          demoMode={demoMode}
          onRefresh={fetchStats}
          refreshing={refreshing}
          connected={connected}
          activeBansCount={stats?.blocked_ips_active || 0}
          events24hCount={stats?.events_total_24h || 0}
        />

        {/* Tab Router Container */}
        <main className="flex-1 overflow-y-auto px-6 py-6">
          {activeTab === 'dashboard' && (
            <DashboardTab
              stats={stats}
              onSelectIp={setSelectedIp}
              onSelectEvent={setSelectedEvent}
              onNavigateTab={setActiveTab}
            />
          )}

          {activeTab === 'events' && (
            <EventsTab onSelectEvent={setSelectedEvent} onSelectIp={setSelectedIp} />
          )}

          {activeTab === 'threatmap' && (
            <ThreatMapTab
              events={stats?.recent_events || []}
              topCountries={stats?.top_countries || []}
              onSelectIp={setSelectedIp}
            />
          )}

          {activeTab === 'blocks' && <BlocksTab onSelectIp={setSelectedIp} />}

          {activeTab === 'ips' && <IPsTab onSelectIp={setSelectedIp} />}

          {activeTab === 'ssh' && (
            <SSHTab onSelectEvent={setSelectedEvent} onSelectIp={setSelectedIp} />
          )}

          {activeTab === 'ports' && <PortsTab />}

          {activeTab === 'system' && (
            <SystemTab currentMetric={stats?.current_system} pollIntervalMs={pollIntervalMs} />
          )}

          {activeTab === 'settings' && (
            <SettingsTab demoMode={demoMode} onToggleDemoMode={handleToggleDemoMode} />
          )}
        </main>
      </div>

      {/* Event Details Modal */}
      {selectedEvent && (
        <EventModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onInspectIp={(ip) => {
            setSelectedEvent(null);
            setSelectedIp(ip);
          }}
        />
      )}

      {/* IP Dossier Modal */}
      {selectedIp && (
        <IPModal
          ip={selectedIp}
          onClose={() => setSelectedIp(null)}
          onSelectEvent={(ev) => {
            setSelectedIp(null);
            setSelectedEvent(ev);
          }}
        />
      )}

      {/* Real-time Incident Cyber Toast */}
      {liveToast && (
        <div
          onClick={() => {
            setSelectedEvent(liveToast);
            setLiveToast(null);
          }}
          className="fixed bottom-5 right-5 z-40 max-w-md p-3.5 bg-[#0f172a]/95 border border-cyan-500/50 rounded-xl shadow-[0_0_20px_rgba(6,182,212,0.3)] backdrop-blur cursor-pointer animate-in slide-in-from-bottom duration-300 flex items-center gap-3"
        >
          <span className="relative flex h-3 w-3 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
          </span>
          <div className="flex-1 truncate">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-cyan-300">
                {liveToast.source_ip}
              </span>
              <span className="text-[10px] font-mono uppercase px-1.5 py-0.2 rounded bg-rose-950 text-rose-300 border border-rose-800">
                {liveToast.action}
              </span>
            </div>
            <p className="text-xs text-slate-300 truncate mt-0.5">{liveToast.message}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
