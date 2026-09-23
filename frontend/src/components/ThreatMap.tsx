import { useEffect, useRef, useState, useMemo } from 'react';
import type { SecurityEvent } from '../types';
import { getHumanEventDescription } from '../utils/explainer';
import { ZoomIn, ZoomOut, RotateCcw, Move } from 'lucide-react';

interface ThreatMapProps {
  events: SecurityEvent[];
  height?: number | string;
  onSelectIp?: (ip: string) => void;
  className?: string;
  selectedCountry?: string | null;
  onResetCountryFilter?: () => void;
}

// Simplified continent & island landmass points [lat, lon] for 100% offline vector map
const CONTINENTS: [number, number][][] = [
  // North America
  [
    [71, -156], [70, -135], [68, -100], [58, -94], [52, -80], [55, -60],
    [47, -53], [44, -64], [41, -70], [30, -81], [25, -80], [29, -89],
    [26, -97], [21, -97], [16, -93], [14, -87], [8, -77], [8, -83],
    [16, -98], [23, -106], [32, -117], [38, -123], [48, -125], [54, -130],
    [59, -140], [60, -150], [58, -157], [65, -168], [71, -156]
  ],
  // Greenland
  [
    [83, -35], [76, -18], [60, -43], [65, -55], [78, -69], [83, -35]
  ],
  // South America
  [
    [12, -72], [10, -61], [6, -52], [-1, -48], [-5, -35], [-12, -37],
    [-23, -42], [-32, -51], [-39, -61], [-46, -66], [-54, -67], [-55, -73],
    [-46, -75], [-33, -71], [-18, -71], [-5, -81], [5, -77], [10, -75], [12, -72]
  ],
  // Europe & Asia (Eurasia)
  [
    [71, 28], [68, 44], [67, 72], [73, 80], [76, 100], [77, 105],
    [72, 125], [72, 140], [66, 170], [64, 180], [60, 163], [53, 142],
    [43, 132], [39, 125], [35, 119], [30, 122], [22, 114], [21, 108],
    [10, 104], [1, 104], [13, 100], [22, 89], [16, 82], [8, 77],
    [20, 73], [25, 62], [25, 57], [13, 43], [30, 32], [31, 35],
    [36, 36], [36, 27], [40, 23], [45, 13], [38, 15], [41, 9],
    [43, 5], [36, -5], [43, -9], [48, -5], [54, 8], [58, 6],
    [62, 5], [71, 25], [71, 28]
  ],
  // Africa
  [
    [36, -5], [37, 10], [32, 25], [31, 32], [22, 37], [12, 43],
    [12, 51], [2, 45], [-4, 39], [-11, 40], [-26, 33], [-34, 26],
    [-34, 18], [-22, 14], [-12, 13], [5, 2], [4, 9], [6, 2],
    [5, -4], [11, -15], [15, -17], [21, -17], [32, -9], [36, -5]
  ],
  // Australia
  [
    [-12, 136], [-12, 142], [-20, 148], [-28, 153], [-37, 150], [-39, 146],
    [-35, 137], [-35, 115], [-22, 114], [-15, 124], [-12, 136]
  ],
  // Great Britain
  [
    [58, -5], [57, -2], [52, 1], [50, -5], [53, -4], [58, -5]
  ],
  // Ireland
  [
    [55, -7], [54, -6], [51, -9], [54, -10], [55, -7]
  ],
  // Iceland
  [
    [66, -24], [66, -14], [63, -14], [63, -24], [66, -24]
  ],
  // Japan
  [
    [45, 142], [43, 145], [35, 140], [31, 130], [33, 130], [36, 136], [41, 141], [45, 142]
  ],
  // Taiwan
  [
    [25.3, 121.6], [24.0, 121.9], [21.9, 120.9], [22.6, 120.3], [25.0, 121.0], [25.3, 121.6]
  ],
  // Sri Lanka
  [
    [9.8, 80.2], [9.5, 81.8], [6.0, 81.9], [6.0, 80.2], [9.8, 80.2]
  ],
  // Madagascar
  [
    [-12, 49], [-16, 50], [-25, 47], [-25, 44], [-19, 44], [-12, 49]
  ],
  // Sumatra (Indonesia)
  [
    [5, 95], [3, 98], [-3, 102], [-6, 105], [-5, 103], [1, 99], [5, 95]
  ],
  // Java (Indonesia)
  [
    [-6, 106], [-7, 114], [-8, 114], [-7, 106], [-6, 106]
  ],
  // Borneo (Indonesia / Malaysia)
  [
    [7, 117], [4, 119], [1, 119], [-4, 116], [-3, 110], [1, 109], [4, 114], [7, 117]
  ],
  // Sulawesi (Indonesia)
  [
    [1, 121], [1, 125], [-5, 123], [-3, 120], [1, 121]
  ],
  // Papua / New Guinea
  [
    [-1, 131], [-3, 141], [-9, 141], [-8, 138], [-4, 135], [-1, 131]
  ],
  // Philippines
  [
    [18, 120], [16, 122], [13, 124], [6, 125], [7, 122], [10, 123], [14, 120], [18, 120]
  ],
  // New Zealand
  [
    [-34, 173], [-37, 176], [-41, 175], [-46, 168], [-46, 166], [-41, 172], [-38, 174], [-34, 173]
  ],
  // Cuba
  [
    [23, -82], [22, -78], [20, -74], [22, -84], [23, -82]
  ]
];

// Target Defended Server Location (default EU/VPS)
const TARGET_SERVER = {
  lat: 50.1109,
  lon: 8.6821,
  name: 'DEFENDED VPS',
};

interface AttackArc {
  sourceLat: number;
  sourceLon: number;
  severity: string;
  progress: number;
  speed: number;
  color: string;
}

export const ThreatMap: React.FC<ThreatMapProps> = ({
  events,
  height = 450,
  onSelectIp,
  className = '',
  selectedCountry = null,
  onResetCountryFilter,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Pan and Zoom State
  const [zoom, setZoom] = useState<number>(1.0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Tooltip with boundary clipping protection
  const [tooltip, setTooltip] = useState<{
    visible: boolean;
    x: number;
    y: number;
    ip: string;
    country: string;
    eventsCount: number;
    lastSeen: string;
    severity: string;
    humanAction: string;
  } | null>(null);

  // Group events by source IP with coordinates
  const attackNodes = useMemo(() => {
    const nodeMap = new Map<
      string,
      {
        ip: string;
        lat: number;
        lon: number;
        country: string;
        countryCode: string;
        count: number;
        lastSeen: string;
        severity: string;
        latestEvent: SecurityEvent;
      }
    >();

    events.forEach((ev) => {
      let lat = ev.latitude;
      let lon = ev.longitude;

      if (!lat && !lon) {
        const hash = ev.source_ip
          .split('.')
          .reduce((acc, part) => (acc * 31 + parseInt(part, 10)) % 1000, 7);
        lat = ((hash % 100) / 100) * 100 - 40;
        lon = (((hash * 13) % 200) / 200) * 300 - 150;
      }

      if (nodeMap.has(ev.source_ip)) {
        const item = nodeMap.get(ev.source_ip)!;
        item.count += 1;
        item.lastSeen = ev.timestamp;
        if (ev.severity === 'critical') item.severity = 'critical';
        else if (ev.severity === 'high' && item.severity !== 'critical') item.severity = 'high';
      } else {
        nodeMap.set(ev.source_ip, {
          ip: ev.source_ip,
          lat,
          lon,
          country: ev.country_name || 'Неизвестно',
          countryCode: ev.country_code || 'XX',
          count: 1,
          lastSeen: ev.timestamp,
          severity: ev.severity || 'medium',
          latestEvent: ev,
        });
      }
    });

    return Array.from(nodeMap.values()).slice(0, 3000);
  }, [events]);

  // Animated laser arcs
  const arcsRef = useRef<AttackArc[]>([]);

  useEffect(() => {
    const activeNodes = attackNodes.slice(0, 80);
    arcsRef.current = activeNodes.map((n) => {
      let color = '#38bdf8'; // sky
      if (n.severity === 'critical') color = '#f43f5e'; // rose
      else if (n.severity === 'high') color = '#f59e0b'; // amber
      else if (n.severity === 'medium') color = '#eab308'; // yellow

      return {
        sourceLat: n.lat,
        sourceLon: n.lon,
        severity: n.severity,
        progress: Math.random(),
        speed: 0.006 + Math.random() * 0.012,
        color,
      };
    });
  }, [attackNodes]);

  // Canvas render loop
  useEffect(() => {
    let animId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let pulseTime = 0;

    const render = () => {
      pulseTime += 0.03;
      const width = canvas.width;
      const height = canvas.height;

      // Coordinate converter with Pan & Zoom transform
      const toXY = (lat: number, lon: number): [number, number] => {
        // Base equirectangular coordinates
        const baseX = ((lon + 180) / 360) * width;
        const baseY = ((90 - lat) / 180) * height;

        // Apply zoom relative to center, then add pan
        const centerX = width / 2;
        const centerY = height / 2;
        const x = (baseX - centerX) * zoom + centerX + pan.x;
        const y = (baseY - centerY) * zoom + centerY + pan.y;

        return [x, y];
      };

      // Background Clear
      ctx.fillStyle = '#080d1a';
      ctx.fillRect(0, 0, width, height);

      // Cyber Grid lines (Lat / Lon)
      ctx.strokeStyle = 'rgba(30, 41, 59, 0.4)';
      ctx.lineWidth = 1;

      // Longitude lines
      for (let lon = -180; lon <= 180; lon += 30) {
        const [x] = toXY(0, lon);
        if (x >= -50 && x <= width + 50) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, height);
          ctx.stroke();
        }
      }

      // Latitude lines
      for (let lat = -60; lat <= 80; lat += 30) {
        const [, y] = toXY(lat, 0);
        if (y >= -50 && y <= height + 50) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(width, y);
          ctx.stroke();
        }
      }

      // Draw Continents & Country Borders (Offline Vector Paths)
      ctx.fillStyle = 'rgba(30, 41, 59, 0.65)';
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
      ctx.lineWidth = 1.2 * Math.min(2, Math.max(0.8, zoom));
      ctx.setLineDash([3, 3]); // Neon dashed cyber radar borders!

      CONTINENTS.forEach((polygon) => {
        if (polygon.length === 0) return;
        ctx.beginPath();
        const [startX, startY] = toXY(polygon[0][0], polygon[0][1]);
        ctx.moveTo(startX, startY);

        for (let i = 1; i < polygon.length; i++) {
          const [px, py] = toXY(polygon[i][0], polygon[i][1]);
          ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      });
      ctx.setLineDash([]); // Reset line dash for laser arcs and nodes

      // Target Defended Server Position
      const [targetX, targetY] = toXY(TARGET_SERVER.lat, TARGET_SERVER.lon);

      // Laser Attack Arcs (Bézier curves)
      arcsRef.current.forEach((arc) => {
        arc.progress += arc.speed;
        if (arc.progress > 1) arc.progress = 0;

        const [srcX, srcY] = toXY(arc.sourceLat, arc.sourceLon);

        // Control point for curved trajectory
        const midX = (srcX + targetX) / 2;
        const midY = Math.min(srcY, targetY) - Math.abs(srcX - targetX) * 0.25;

        // Draw Arc Trajectory
        ctx.strokeStyle = arc.color + '33';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(srcX, srcY);
        ctx.quadraticCurveTo(midX, midY, targetX, targetY);
        ctx.stroke();

        // Laser packet position
        const t = arc.progress;
        const currentX = (1 - t) * (1 - t) * srcX + 2 * (1 - t) * t * midX + t * t * targetX;
        const currentY = (1 - t) * (1 - t) * srcY + 2 * (1 - t) * t * midY + t * t * targetY;

        ctx.shadowColor = arc.color;
        ctx.shadowBlur = 8;
        ctx.fillStyle = arc.color;
        ctx.beginPath();
        ctx.arc(currentX, currentY, 2.5 * Math.min(1.8, zoom), 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      // Draw Attacking Nodes
      attackNodes.forEach((node) => {
        const [nx, ny] = toXY(node.lat, node.lon);

        let nodeColor = '#38bdf8';
        if (node.severity === 'critical') nodeColor = '#f43f5e';
        else if (node.severity === 'high') nodeColor = '#f59e0b';

        // Pulse ring
        const pulseRadius = (4 + (Math.sin(pulseTime * 2 + node.lat) + 1) * 4) * Math.min(1.6, zoom);
        ctx.strokeStyle = nodeColor + '66';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(nx, ny, pulseRadius, 0, Math.PI * 2);
        ctx.stroke();

        // Inner node dot
        ctx.fillStyle = nodeColor;
        ctx.beginPath();
        ctx.arc(nx, ny, 3.5 * Math.min(1.5, zoom), 0, Math.PI * 2);
        ctx.fill();
      });

      // Draw Target Defended Server
      const serverRadius = (6 + Math.sin(pulseTime * 3) * 2) * Math.min(1.6, zoom);
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(targetX, targetY, serverRadius + 4, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#06b6d4';
      ctx.beginPath();
      ctx.arc(targetX, targetY, 4.5 * Math.min(1.5, zoom), 0, Math.PI * 2);
      ctx.fill();

      // VPS Label
      ctx.font = '10px monospace';
      ctx.fillStyle = '#22d3ee';
      ctx.fillText('VPS TARGET', targetX + 10, targetY - 6);

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [attackNodes, zoom, pan]);

  // Handle Resize
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.scale(dpr, dpr);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Zoom controls
  const handleZoomIn = () => setZoom((z) => Math.min(4.0, Number((z + 0.3).toFixed(1))));
  const handleZoomOut = () => setZoom((z) => Math.max(0.8, Number((z - 0.3).toFixed(1))));
  const handleResetView = () => {
    setZoom(1.0);
    setPan({ x: 0, y: 0 });
    setTooltip(null);
  };

  // Mouse wheel zoom
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      setZoom((z) => Math.min(4.0, Number((z + 0.2).toFixed(1))));
    } else {
      setZoom((z) => Math.max(0.8, Number((z - 0.2).toFixed(1))));
    }
  };

  // Drag / Pan handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return; // Only left click
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    panStartRef.current = { ...pan };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    if (isDragging) {
      // Pan movement
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      setPan({
        x: panStartRef.current.x + dx,
        y: panStartRef.current.y + dy,
      });
      setTooltip(null);
      return;
    }

    // Hover detection for tooltips
    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const width = rect.width;
    const height = rect.height;
    const centerX = width / 2;
    const centerY = height / 2;

    let closestNode: (typeof attackNodes)[0] | null = null;
    let minDist = 18;

    for (const node of attackNodes) {
      const baseX = ((node.lon + 180) / 360) * width;
      const baseY = ((90 - node.lat) / 180) * height;
      const nx = (baseX - centerX) * zoom + centerX + pan.x;
      const ny = (baseY - centerY) * zoom + centerY + pan.y;

      const dist = Math.hypot(mouseX - nx, mouseY - ny);
      if (dist < minDist) {
        minDist = dist;
        closestNode = node;
      }
    }

    if (closestNode) {
      const baseX = ((closestNode.lon + 180) / 360) * width;
      const baseY = ((90 - closestNode.lat) / 180) * height;
      const nx = (baseX - centerX) * zoom + centerX + pan.x;
      const ny = (baseY - centerY) * zoom + centerY + pan.y;

      // Smart boundary positioning: ensure tooltip NEVER gets clipped
      const tooltipWidth = 270;
      const tooltipHeight = 150;

      // Position horizontally: clamp between 12px and width - tooltipWidth - 12px
      let posX = nx - tooltipWidth / 2;
      posX = Math.max(12, Math.min(width - tooltipWidth - 12, posX));

      // Position vertically: flip below node if near top edge
      let posY = ny - tooltipHeight - 16;
      if (posY < 16) {
        posY = ny + 20; // Place below target dot
      }

      const human = getHumanEventDescription(closestNode.latestEvent);

      setTooltip({
        visible: true,
        x: posX,
        y: posY,
        ip: closestNode.ip,
        country: closestNode.country,
        eventsCount: closestNode.count,
        lastSeen: closestNode.lastSeen,
        severity: closestNode.severity,
        humanAction: human.summary,
      });
    } else {
      setTooltip(null);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full overflow-hidden rounded-2xl bg-[#080d1a] border border-slate-800 shadow-2xl select-none ${className}`}
      style={{ height }}
    >
      <canvas
        ref={canvasRef}
        className={`w-full h-full block ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          setIsDragging(false);
          setTooltip(null);
        }}
        onClick={() => {
          if (tooltip && onSelectIp && !isDragging) {
            onSelectIp(tooltip.ip);
          }
        }}
      />

      {/* Top Banner Overlay */}
      <div className="absolute top-3 left-4 pointer-events-auto flex items-center gap-2 flex-wrap z-20">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
        </span>
        <span className="text-[11px] font-mono uppercase tracking-wider text-cyan-400 bg-cyan-950/80 border border-cyan-800/80 px-2.5 py-1 rounded-lg backdrop-blur">
          РАДАР АТАК • {attackNodes.length} ИСТОЧНИКОВ • МАСШТАБ {Math.round(zoom * 100)}%
        </span>

        {selectedCountry && (
          <span className="text-[11px] font-mono text-amber-300 bg-amber-950/90 border border-amber-800 px-2.5 py-1 rounded-lg backdrop-blur flex items-center gap-1.5 font-bold shadow-lg">
            <span>Фильтр: {selectedCountry}</span>
            {onResetCountryFilter && (
              <button
                onClick={onResetCountryFilter}
                className="hover:text-white bg-amber-900/80 hover:bg-rose-900 rounded px-1.5 py-0.5 text-[10px] uppercase font-bold transition-colors cursor-pointer"
                title="Сбросить фильтр по стране"
              >
                ✕ Сбросить
              </button>
            )}
          </span>
        )}
      </div>

      {/* Zoom and Pan Interactive Controls Bar */}
      <div className="absolute top-3 right-4 flex items-center gap-1.5 bg-[#0f172a]/90 backdrop-blur border border-slate-700/80 p-1 rounded-xl shadow-xl z-20">
        <button
          onClick={handleZoomIn}
          className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
          title="Приблизить карту (+)"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={handleZoomOut}
          className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
          title="Отдалить карту (-)"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <div className="w-px h-4 bg-slate-700 mx-0.5" />
        <button
          onClick={handleResetView}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-mono text-cyan-400 hover:text-cyan-300 hover:bg-slate-800 transition-colors"
          title="Сбросить масштаб и положение"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Сброс</span>
        </button>
      </div>

      {/* Drag Hint Footer Overlay */}
      <div className="absolute bottom-3 right-4 pointer-events-none hidden sm:flex items-center gap-2 text-[10px] font-mono text-slate-400 bg-slate-900/80 px-2.5 py-1 rounded border border-slate-800/80">
        <Move className="w-3 h-3 text-cyan-400" />
        <span>Зажмите мышь для перемещения • Колесико для зума</span>
      </div>

      {/* Smart Tooltip (Guaranteed No Clipping) */}
      {tooltip && tooltip.visible && (
        <div
          className="absolute pointer-events-none z-30 bg-[#0f172a]/95 border border-cyan-500/50 rounded-xl p-3 shadow-2xl backdrop-blur text-xs w-[270px] animate-in fade-in duration-150"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <div className="flex items-center justify-between pb-2 border-b border-slate-700/80">
            <span className="font-mono font-bold text-cyan-400 text-sm">{tooltip.ip}</span>
            <span
              className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded font-bold ${
                tooltip.severity === 'critical'
                  ? 'bg-rose-950 text-rose-300 border border-rose-800'
                  : 'bg-amber-950 text-amber-300 border border-amber-800'
              }`}
            >
              {tooltip.severity === 'critical' ? 'Критично' : 'Высокая'}
            </span>
          </div>

          <div className="pt-2 space-y-1.5 text-xs text-slate-300">
            <div className="flex justify-between">
              <span className="text-slate-400">Страна:</span>
              <span className="font-semibold text-slate-200">{tooltip.country}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Всего атак:</span>
              <span className="font-mono font-bold text-white">{tooltip.eventsCount} инцидентов</span>
            </div>
            <div className="p-1.5 bg-slate-900/90 rounded border border-slate-800/80 mt-1">
              <span className="text-slate-400 text-[10px] block font-mono">Что делал атакующий:</span>
              <span className="text-cyan-300 text-[11px] font-medium leading-tight">
                {tooltip.humanAction}
              </span>
            </div>
          </div>

          <div className="mt-2 text-[10px] text-cyan-400/90 text-center font-mono pt-1 border-t border-slate-800/80">
            Кликните для открытия полного досье
          </div>
        </div>
      )}
    </div>
  );
};
