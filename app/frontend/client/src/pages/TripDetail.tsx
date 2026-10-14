import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Reorder } from "framer-motion";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, API_BASE } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Trip, Node, Checkin, UserProfile } from "@shared/schema";
import CheckInSheet from "@/components/CheckInSheet";
import NodeEditSheet from "@/components/NodeEditSheet";
import AddNodeSheet from "@/components/AddNodeSheet";
import TripEditSheet from "@/components/TripEditSheet";
import mogaoImg from "@assets/mogao.jpg";

const nodeDay = (n: Node) => n.day ?? 1;

/** 根据拖拽后的顺序，计算需要 PATCH 的 day / order（与当前 Tab 语义一致） */
function computeReorderPatches(newOrder: Node[], activeDay: number, allTripNodes: Node[]): { id: number; day: number; order: number }[] {
  const patches: { id: number; day: number; order: number }[] = [];
  if (newOrder.length === 0) return patches;

  if (activeDay !== 0) {
    const dayVal = nodeDay(newOrder[0]);
    for (let i = 0; i < newOrder.length; i++) {
      const n = newOrder[i];
      if (n.order !== i || nodeDay(n) !== dayVal) patches.push({ id: n.id, day: dayVal, order: i });
    }
    return patches;
  }

  const dayOrder = Array.from(new Set(allTripNodes.map(n => nodeDay(n)))).sort((a, b) => a - b);
  const counts = new Map<number, number>();
  allTripNodes.forEach(n => {
    const d = nodeDay(n);
    counts.set(d, (counts.get(d) || 0) + 1);
  });
  let idx = 0;
  for (const d of dayOrder) {
    const c = counts.get(d) ?? 0;
    for (let k = 0; k < c; k++) {
      const n = newOrder[idx++];
      if (!n) break;
      if (nodeDay(n) !== d || n.order !== k) patches.push({ id: n.id, day: d, order: k });
    }
  }
  return patches;
}

// ======================== 地图画布组件（真实高德底图 + SVG overlay） ========================
const DEFAULT_MAP_W = 390;
const DEFAULT_MAP_H = 280;
const DUNHUANG_FALLBACK = { lng: 94.6624, lat: 40.1416 }; // 敦煌市中心

/**
 * Web Mercator: 给定地图中心 (centerLng, centerLat) 与高德静态地图 zoom，
 * 把任意 (lng, lat) 投影到图像 (x, y) 像素坐标。
 * 参考：tile size 256，2^zoom 个 tile，世界像素宽 = 256 * 2^zoom。
 */
function mercatorProjection(centerLng: number, centerLat: number, zoom: number, width: number, height: number) {
  const TILE = 256;
  const scale = TILE * Math.pow(2, zoom);
  const project = (lng: number, lat: number) => {
    const x = (lng + 180) / 360 * scale;
    const sinLat = Math.sin((lat * Math.PI) / 180);
    const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale;
    return { x, y };
  };
  const c = project(centerLng, centerLat);
  return (lng: number, lat: number) => {
    const p = project(lng, lat);
    return {
      x: width / 2 + (p.x - c.x),
      y: height / 2 + (p.y - c.y),
    };
  };
}

/**
 * 根据节点的经纬度算出合适的中心点 + 缩放等级（让所有节点都进画面）。
 * 高德静态地图 zoom 范围 1–17；我们从 17 开始逐级降级直到所有点都落在画面内带一定 padding。
 */
function computeMapView(coords: Array<{ lng: number; lat: number }>, mapW = DEFAULT_MAP_W, mapH = DEFAULT_MAP_H): { centerLng: number; centerLat: number; zoom: number } {
  if (coords.length === 0) {
    return { centerLng: DUNHUANG_FALLBACK.lng, centerLat: DUNHUANG_FALLBACK.lat, zoom: 11 };
  }
  if (coords.length === 1) {
    return { centerLng: coords[0].lng, centerLat: coords[0].lat, zoom: 14 };
  }
  const lngs = coords.map(c => c.lng);
  const lats = coords.map(c => c.lat);
  const centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
  const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;

  const PADDING = 48; // 画面边距，保证 marker 不贴边
  for (let zoom = 17; zoom >= 3; zoom--) {
    const project = mercatorProjection(centerLng, centerLat, zoom, mapW, mapH);
    const allIn = coords.every(({ lng, lat }) => {
      const { x, y } = project(lng, lat);
      return x >= PADDING && x <= mapW - PADDING && y >= PADDING && y <= mapH - PADDING;
    });
    if (allIn) return { centerLng, centerLat, zoom };
  }
  return { centerLng, centerLat, zoom: 3 };
}

// 每一天一种高识别度颜色（适配深色底图，前 6 天命中不同色相；超过则循环）
const DAY_COLORS = ["#e8c878", "#74c0fc", "#f783ac", "#8ce99a", "#ffa94d", "#b197fc", "#4dd4ac"];
const dayColor = (day: number | null | undefined) =>
  DAY_COLORS[(Math.max(1, day ?? 1) - 1) % DAY_COLORS.length];

/**
 * 标签碰撞规避：为每个 pin 在候选位置（下/上/右/左）里挑第一个不与已放置标签矩形相交的位置。
 * 都失败则隐藏该标签（pin 本身仍保留）。
 */
type LabelPlaced = { x: number; y: number; w: number; h: number; anchor: "middle" | "start" | "end"; text: string } | null;
function placeLabels(
  pins: { x: number; y: number; name: string }[],
  w: number,
  h: number,
): LabelPlaced[] {
  const placed: { x: number; y: number; w: number; h: number }[] = [];
  const results: LabelPlaced[] = [];
  for (const pin of pins) {
    const text = pin.name.length > 7 ? pin.name.slice(0, 7) + "…" : pin.name;
    const wLabel = Math.min(text.length, 8) * 9 + 10;
    const hLabel = 15;
    // 优先级：下方 → 上方 → 右侧 → 左侧
    const candidates: Array<{ x: number; y: number; anchor: "middle" | "start" | "end" }> = [
      { x: pin.x, y: pin.y + 24, anchor: "middle" },
      { x: pin.x, y: pin.y - 22, anchor: "middle" },
      { x: pin.x + 18, y: pin.y + 4, anchor: "start" },
      { x: pin.x - 18, y: pin.y + 4, anchor: "end" },
    ];
    let chosen: LabelPlaced = null;
    for (const c of candidates) {
      let rectX: number;
      if (c.anchor === "middle") rectX = c.x - wLabel / 2;
      else if (c.anchor === "start") rectX = c.x;
      else rectX = c.x - wLabel;
      const rectY = c.y - hLabel / 2;
      if (rectX < 0 || rectX + wLabel > w || rectY < 0 || rectY + hLabel > h) continue;
      const collide = placed.some(p =>
        rectX < p.x + p.w && rectX + wLabel > p.x &&
        rectY < p.y + p.h && rectY + hLabel > p.y
      );
      if (!collide) {
        placed.push({ x: rectX, y: rectY, w: wLabel, h: hLabel });
        chosen = { x: c.x, y: c.y, w: wLabel, h: hLabel, anchor: c.anchor, text };
        break;
      }
    }
    results.push(chosen);
  }
  return results;
}

function MapCanvas({
  nodes,
  activeDay,
  onNodeClick,
  width = DEFAULT_MAP_W,
  height = DEFAULT_MAP_H,
}: {
  nodes: Node[];
  activeDay: number;
  onNodeClick: (n: Node) => void;
  width?: number;
  height?: number;
}) {
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  // 缩放/平移/气泡
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const [tappedPinIdx, setTappedPinIdx] = useState<number | null>(null);

  const sorted = useMemo(
    () =>
      [...nodes].sort((a, b) =>
        activeDay === 0 ? nodeDay(a) - nodeDay(b) || a.order - b.order : a.order - b.order,
      ),
    [nodes, activeDay],
  );
  const validCoords = useMemo(
    () => sorted.filter(n => typeof n.lat === "number" && typeof n.lng === "number")
      .map(n => ({ lng: n.lng as number, lat: n.lat as number })),
    [sorted]
  );

  const view = useMemo(() => computeMapView(validCoords, width, height), [validCoords, width, height]);
  const project = useMemo(
    () => mercatorProjection(view.centerLng, view.centerLat, view.zoom, width, height),
    [view, width, height]
  );

  const mapUrl1 = useMemo(() => {
    const params = new URLSearchParams({
      location: `${view.centerLng},${view.centerLat}`,
      zoom: String(view.zoom),
      size: `${width}*${height}`,
      markers: "",
    });
    return `${API_BASE}/api/map/static?${params}`;
  }, [view, width, height]);

  const mapUrl2 = useMemo(() => {
    const params = new URLSearchParams({
      location: `${view.centerLng},${view.centerLat}`,
      zoom: String(view.zoom + 1),
      size: `${width}*${height}`,
      markers: "",
    });
    return `${API_BASE}/api/map/static?${params}`;
  }, [view, width, height]);

  const mapUrl3 = useMemo(() => {
    const params = new URLSearchParams({
      location: `${view.centerLng},${view.centerLat}`,
      zoom: String(view.zoom + 2),
      size: `${width}*${height}`,
      markers: "",
    });
    return `${API_BASE}/api/map/static?${params}`;
  }, [view, width, height]);

  // 投影到像素 + 对坐标几乎一致的点做圆周分布 jitter（避免完全重叠）
  const pins = useMemo(() => {
    type Pin = { node: Node; indexLabel: string; x: number; y: number; color: string };
    const raw: Pin[] = [];
    const MAP_W = width;
    const MAP_H = height;
    sorted.forEach((node, idx) => {
      if (typeof node.lat !== "number" || typeof node.lng !== "number") return;
      const { x, y } = project(node.lng, node.lat);
      raw.push({
        node,
        indexLabel: activeDay === 0 ? `D${nodeDay(node)}-${(node.order ?? 0) + 1}` : String(idx + 1),
        x, y,
        color: dayColor(node.day),
      });
    });
    // 聚合近点 → 对聚合内的每个点做圆周偏移
    const CLUSTER_R = 14; // 恢复原始像素
    const groups: Pin[][] = [];
    for (const p of raw) {
      const existing = groups.find(g => {
        const first = g[0];
        const dx = first.x - p.x, dy = first.y - p.y;
        return dx * dx + dy * dy < CLUSTER_R * CLUSTER_R;
      });
      if (existing) existing.push(p);
      else groups.push([p]);
    }
    const offset: Pin[] = [];
    for (const g of groups) {
      if (g.length === 1) {
        offset.push(g[0]);
      } else {
        const R = 11 + g.length * 1.5; // 恢复原始扩张半径
        g.forEach((p, i) => {
          const angle = (i / g.length) * Math.PI * 2 - Math.PI / 2;
          offset.push({ ...p, x: p.x + Math.cos(angle) * R, y: p.y + Math.sin(angle) * R });
        });
      }
    }
    return offset;
  }, [sorted, project, activeDay]);

  const statusOpacity = (status: string) => (status === "done" ? 0.55 : 1);

  const clampPan = (x: number, y: number, scale: number) => {
    if (scale <= 1) return { x: 0, y: 0 };
    const maxX = (width * (scale - 1)) / 2;
    const maxY = (height * (scale - 1)) / 2;
    return {
      x: Math.max(-maxX, Math.min(maxX, x)),
      y: Math.max(-maxY, Math.min(maxY, y))
    };
  };

  // 拖拽
  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - transform.x, y: e.clientY - transform.y };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const rawX = e.clientX - dragStartRef.current.x;
    const rawY = e.clientY - dragStartRef.current.y;
    setTransform(prev => ({ ...prev, ...clampPan(rawX, rawY, prev.scale) }));
  };
  const handlePointerUp = () => setIsDragging(false);

  // 滚轮缩放
  const updateScale = (delta: number) => {
    setTransform(prev => {
      const scale = Math.max(1, Math.min(5, prev.scale + delta));
      const { x, y } = clampPan(prev.x, prev.y, scale);
      return { scale, x, y };
    });
  };
  const handleWheel = (e: React.WheelEvent) => {
    e.stopPropagation();
    updateScale(e.deltaY > 0 ? -0.15 : 0.15);
  };
  const zoomIn = () => updateScale(0.4);
  const zoomOut = () => updateScale(-0.4);
  const resetView = () => { setTransform({ scale: 1, x: 0, y: 0 }); setTappedPinIdx(null); };

  // 比例尺
  const metersPerPx = 156543.03 * Math.cos(view.centerLat * Math.PI / 180) / Math.pow(2, view.zoom) / transform.scale;
  const niceDs = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000];
  const rawDist = 60 * metersPerPx;
  const niceDist = niceDs.find(d => d >= rawDist) || Math.round(rawDist);
  const barPx = Math.round(niceDist / metersPerPx);
  const scaleLabel = niceDist >= 1000 ? `${niceDist / 1000}km` : `${niceDist}m`;

  return (
    <div
      className="relative overflow-hidden"
      style={{ height, touchAction: "none", cursor: isDragging ? "grabbing" : "grab" }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onWheel={handleWheel}
      onClick={() => setTappedPinIdx(null)}
    >
      {/* 可缩放/平移的内容层 */}
      <div style={{
        transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
        transformOrigin: "center center",
        transition: isDragging ? "none" : "transform 0.2s ease-out",
        width: "100%", height: "100%", position: "relative",
      }}>
        {/* 高德静态地图底图 - 三档细节叠加层 */}
        <div className="absolute inset-0 flex items-center justify-center">
          {/* 档位 1: 全局视口 */}
          <img
            src={mapUrl1} alt="map-g1"
            className="absolute w-full h-full object-cover"
            style={{ filter: "brightness(0.78) contrast(1.05) saturate(0.9)" }}
            onLoad={() => setMapLoaded(true)}
            onError={() => setMapFailed(true)}
            data-testid="map-static-bg"
          />
          {/* 档位 2: 缩放 >= 1.8 时淡入，展示干道细节，逻辑尺寸为1/2 */}
          <img
            src={mapUrl2} alt="map-g2"
            className="absolute object-cover pointer-events-none"
            style={{ 
              width: "50%", height: "50%", 
              filter: "brightness(0.78) contrast(1.05) saturate(0.9)",
              opacity: transform.scale >= 1.8 ? 1 : 0,
              transition: "opacity 0.4s ease-in-out"
            }}
          />
          {/* 档位 3: 缩放 >= 3.5 时淡入，展示街道/建筑细节，逻辑尺寸为1/4 */}
          <img
            src={mapUrl3} alt="map-g3"
            className="absolute object-cover pointer-events-none"
            style={{ 
              width: "25%", height: "25%", 
              filter: "brightness(0.78) contrast(1.05) saturate(0.9)",
              opacity: transform.scale >= 3.5 ? 1 : 0,
              transition: "opacity 0.4s ease-in-out"
            }}
          />
        </div>

        {/* SVG overlay */}
        <svg className="absolute inset-0 w-full h-full" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
          {/* 路线（线宽随缩放比例反向调整，保持视觉粗细不变） */}
          {pins.map((pin, i) => {
            if (i === 0) return null;
            const prev = pins[i - 1];
            if (prev.node.day !== pin.node.day) return null;
            const bothDone = prev.node.status === "done" && pin.node.status === "done";
            return (
              <line key={`line-${i}`}
                x1={prev.x} y1={prev.y} x2={pin.x} y2={pin.y}
                stroke={pin.color} strokeOpacity={bothDone ? 0.35 : 0.75}
                strokeWidth={2.5 / transform.scale} strokeDasharray={bothDone ? "none" : `${6 / transform.scale} ${4 / transform.scale}`}
                className={bothDone ? "" : "route-line"}
              />
            );
          })}

          {/* 节点标记点（恢复原始大小，反向缩放保持固定比例，选中的置于顶层） */}
          {pins.map((pin, i) => ({ pin, i })).sort((a, b) => {
            if (a.i === tappedPinIdx) return 1;
            if (b.i === tappedPinIdx) return -1;
            return 0;
          }).map(({ pin, i }) => {
            const { node, x, y, color, indexLabel } = pin;
            const isDone = node.status === "done";
            const isActive = node.status === "active";
            const op = statusOpacity(node.status);
            return (
              <g key={node.id} 
                 onClick={(e) => { e.stopPropagation(); setTappedPinIdx(tappedPinIdx === i ? null : i); onNodeClick(node); }} 
                 style={{ cursor: "pointer" }}
                 transform={`translate(${x}, ${y}) scale(${1 / transform.scale})`}
              >
                {isActive && (
                  <circle cx="0" cy="0" r="22" fill={color} opacity="0.35">
                    <animate attributeName="r" values="14;24;14" dur="1.8s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.4;0.05;0.4" dur="1.8s" repeatCount="indefinite" />
                  </circle>
                )}
                <circle cx="0" cy="0" r="12" fill="rgba(12,10,9,0.92)" stroke="#ffffff" strokeWidth="1.5" opacity={op} />
                <circle cx="0" cy="0" r="9" fill={color} opacity={isDone ? 0.5 : 1} />
                <text x="0" y="3.2" textAnchor="middle" fill={isDone ? "rgba(255,255,255,0.7)" : "#1a1208"} fontSize={indexLabel.length >= 4 ? 7 : 10} fontWeight="bold" style={{ pointerEvents: "none", userSelect: "none" }}>
                  {isDone ? "✓" : indexLabel}
                </text>
              </g>
            );
          })}

          {/* 点击气泡（反向缩放保持固定大小） */}
          {tappedPinIdx !== null && pins[tappedPinIdx] && (() => {
            const pin = pins[tappedPinIdx];
            const name = pin.node.name.length > 8 ? pin.node.name.slice(0, 8) + "…" : pin.node.name;
            const time = pin.node.scheduledTime || "";
            // 放大气泡基础尺寸
            const bw = Math.max(name.length * 14 + 32, 110);
            const bh = time ? 46 : 30;
            const bx = -bw / 2;
            const by = -bh - 22; // 位于标记点上方
            return (
              <g style={{ pointerEvents: "none" }} transform={`translate(${pin.x}, ${pin.y}) scale(${1 / transform.scale})`}>
                <rect x={bx} y={by} width={bw} height={bh} rx={8} fill="rgba(12,10,9,0.92)" stroke={pin.color} strokeWidth="1.2" />
                <polygon points={`-6,${by + bh} 0,${by + bh + 7} 6,${by + bh}`} fill="rgba(12,10,9,0.92)" />
                <text x={bx + bw / 2} y={by + (time ? 18 : 20)} textAnchor="middle" fill="#e8c878" fontSize="14" fontWeight="600">{name}</text>
                {time && <text x={bx + bw / 2} y={by + 36} textAnchor="middle" fill="rgba(232,200,120,0.65)" fontSize="11">{time}</text>}
              </g>
            );
          })()}
        </svg>
      </div>

      {/* === 以下UI不受缩放/平移影响 === */}

      {/* 加载/失败 */}
      {!mapLoaded && !mapFailed && (
        <div className="absolute inset-0 flex items-center justify-center bg-stone-900/60 pointer-events-none">
          <div className="text-xs text-muted-foreground">正在加载地图...</div>
        </div>
      )}
      {mapFailed && (
        <div className="absolute inset-0 flex items-center justify-center bg-stone-900/80 pointer-events-none">
          <div className="text-xs text-muted-foreground">地图加载失败</div>
        </div>
      )}

      {/* 缩放按钮 */}
      <div className="absolute top-2 right-3 flex flex-col gap-1 z-10">
        <button onClick={(e) => { e.stopPropagation(); zoomIn(); }} className="w-7 h-7 rounded-md flex items-center justify-center text-sm font-bold" style={{ background: "rgba(0,0,0,0.6)", color: "#e8c878", backdropFilter: "blur(4px)" }}>+</button>
        <button onClick={(e) => { e.stopPropagation(); zoomOut(); }} className="w-7 h-7 rounded-md flex items-center justify-center text-sm font-bold" style={{ background: "rgba(0,0,0,0.6)", color: "#e8c878", backdropFilter: "blur(4px)" }}>−</button>
        <button onClick={(e) => { e.stopPropagation(); resetView(); }} className="w-7 h-7 rounded-md flex items-center justify-center text-[9px]" style={{ background: "rgba(0,0,0,0.6)", color: "#e8c878", backdropFilter: "blur(4px)" }}>⟲</button>
      </div>

      {/* 比例尺 */}
      <div className="absolute bottom-2 left-3 flex flex-col items-start z-10 pointer-events-none">
        <span className="text-[8px] text-stone-300 mb-0.5">{scaleLabel}</span>
        <div style={{ width: barPx, height: 3, background: "#e8c878", borderRadius: 1, boxShadow: "0 0 3px rgba(0,0,0,0.6)" }} />
      </div>

      {/* 图例 */}
      <div className="absolute bottom-2 right-3 flex items-center gap-2 flex-wrap max-w-[200px] justify-end z-10" style={{ background: "rgba(0,0,0,0.55)", padding: "2px 6px", borderRadius: "6px", backdropFilter: "blur(4px)" }}>
        {activeDay === 0 ? (
          Array.from(new Set(sorted.map(n => nodeDay(n)))).sort((a, b) => a - b).map(d => (
            <div key={d} className="flex items-center gap-0.5">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: dayColor(d) }} />
              <span className="text-[8px] text-stone-200">D{d}</span>
            </div>
          ))
        ) : (
          <>
            <div className="flex items-center gap-0.5">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: dayColor(activeDay) }} />
              <span className="text-[8px] text-stone-200">第{activeDay}天</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ======================== 拖拽排序列表（framer-motion Reorder，支持触摸） ========================
function TripNodesReorderList({
  tripId,
  activeDay,
  nodes,
  filteredNodes,
  persistReorder,
  listClassName,
  children,
}: {
  tripId: number;
  activeDay: number;
  nodes: Node[];
  filteredNodes: Node[];
  persistReorder: { isPending: boolean; mutate: (order: Node[]) => void };
  listClassName?: string;
  children: (node: Node, index: number) => ReactNode;
}) {
  const listKey = `${tripId}:${activeDay}:${nodes.map(n => `${n.id}:${n.day}:${n.order}`).join(",")}`;
  const [dragList, setDragList] = useState<Node[]>(filteredNodes);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setDragList(filteredNodes);
  }, [listKey, filteredNodes]);

  useEffect(
    () => () => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
    },
    [],
  );

  const schedulePersist = (next: Node[]) => {
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      persistReorder.mutate(next);
      persistTimer.current = null;
    }, 420);
  };

  return (
    <Reorder.Group
      as="div"
      axis="y"
      values={dragList}
      onReorder={next => {
        setDragList(next);
        schedulePersist(next);
      }}
      className={listClassName}
      style={{ pointerEvents: persistReorder.isPending ? "none" : undefined }}
    >
      {dragList.map((node, i) => (
        <Reorder.Item
          key={node.id}
          value={node}
          as="div"
          className="relative"
          dragElastic={0.12}
        >
          {children(node, i)}
        </Reorder.Item>
      ))}
    </Reorder.Group>
  );
}

// ======================== 节点列表项 ========================
function NodeItem({
  node,
  index,
  onStatusChange,
  onSelect,
  isSelected,
  checkin,
  onCheckIn,
  onEdit,
}: {
  node: Node;
  index: number;
  onStatusChange: (id: number, status: string) => void;
  onSelect: (n: Node) => void;
  isSelected: boolean;
  checkin?: Checkin | null;
  onCheckIn: (n: Node, existing: Checkin | null) => void;
  onEdit: (n: Node) => void;
}) {
  const statusConfig = {
    pending: { icon: "○", color: "text-amber-500", bgLine: "bg-amber-200 dark:bg-amber-900" },
    active: { icon: "◉", color: "text-green-500", bgLine: "bg-green-200 dark:bg-green-900" },
    done: { icon: "✓", color: "text-stone-400", bgLine: "bg-stone-200 dark:bg-stone-700" },
    skipped: { icon: "╳", color: "text-red-400", bgLine: "bg-red-100 dark:bg-red-950" },
  };

  const s = statusConfig[node.status as keyof typeof statusConfig] || statusConfig.pending;
  const isDone = node.status === "done";
  const isSkipped = node.status === "skipped";

  return (
    <div
      className={`flex gap-3 px-4 py-0 transition-all cursor-grab active:cursor-grabbing ${isSelected ? "bg-primary/5 dark:bg-primary/10 rounded-xl" : ""}`}
      onClick={() => onSelect(node)}
    >
      {/* 时间线 */}
      <div className="flex flex-col items-center flex-shrink-0 w-6">
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={e => {
            e.stopPropagation();
            const next = { pending: "active", active: "done", done: "pending", skipped: "pending" };
            onStatusChange(node.id, next[node.status as keyof typeof next] || "pending");
          }}
          className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all active:scale-90 border-2 ${
            isDone ? "border-stone-300 dark:border-stone-600 text-stone-400" :
            node.status === "active" ? "border-green-400 text-green-500" :
            "border-amber-300 text-amber-500"
          } bg-background`}
          data-testid={`btn-node-status-${node.id}`}
        >
          {s.icon}
        </button>
        <div className={`w-0.5 flex-1 min-h-[20px] ${s.bgLine} opacity-50 my-0.5`} />
      </div>

      {/* 内容 */}
      <div className={`flex-1 pb-4 ${isDone || isSkipped ? "opacity-50" : ""}`}>
        <div className="flex items-start justify-between gap-2 pt-0.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-medium ${
                isDone ? "text-stone-400" : "text-muted-foreground"
              }`}>
                {node.scheduledTime || "待定"}
              </span>
              {node.status === "active" && (
                <span className="text-[9px] px-1.5 py-0.5 bg-green-100 dark:bg-green-950/40 text-green-600 dark:text-green-400 rounded-full font-semibold">
                  进行中
                </span>
              )}
            </div>
            <h4 className={`text-sm font-semibold mt-0.5 ${isDone ? "line-through text-muted-foreground" : "text-foreground"}`}>
              {node.name}
            </h4>
          </div>
          <span className="text-xs text-muted-foreground flex-shrink-0 pt-0.5 whitespace-nowrap">
            {node.duration}分钟
          </span>
        </div>

        {isSelected && (
          <div className="mt-2 space-y-2">
            {node.description && (
              <p className="text-xs text-muted-foreground leading-relaxed">{node.description}</p>
            )}
            {node.pitfallTip && (
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/40 rounded-lg px-3 py-2">
                <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">{node.pitfallTip}</p>
              </div>
            )}

            {/* 已有打卡的照片预览 */}
            {checkin && (() => {
              let photos: string[] = [];
              try { photos = JSON.parse(checkin.photos || "[]"); } catch {}
              if (photos.length === 0) return null;
              return (
                <button
                  onPointerDown={e => e.stopPropagation()}
                  onClick={e => { e.stopPropagation(); onCheckIn(node, checkin); }}
                  className="w-full flex items-center gap-2 p-2 rounded-lg transition-all active:scale-[0.98]"
                  style={{
                    background: "rgba(200,150,48,0.08)",
                    border: "1px solid rgba(200,150,48,0.2)",
                  }}
                  data-testid={`btn-view-checkin-${node.id}`}
                >
                  <div className="flex -space-x-2">
                    {photos.slice(0, 3).map((url, i) => (
                      <img
                        key={i}
                        src={url.startsWith("http") ? url : `${API_BASE}${url}`}
                        alt=""
                        className="w-8 h-8 rounded-full object-cover border-2"
                        style={{ borderColor: "hsl(var(--background))" }}
                      />
                    ))}
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-[11px] font-medium" style={{ color: "#c89630" }}>
                      ✓ 已打卡 · {photos.length} 张照片
                    </p>
                    {checkin.caption && (
                      <p className="text-[10px] text-muted-foreground truncate">{checkin.caption}</p>
                    )}
                  </div>
                  <span className="text-xs" style={{ color: "rgba(200,150,48,0.6)" }}>查看 →</span>
                </button>
              );
            })()}

            {/* 操作按钮 */}
            <div className="flex gap-2 pt-1 flex-wrap">
              {node.status !== "done" && (
                <button
                  onPointerDown={e => e.stopPropagation()}
                  onClick={e => { e.stopPropagation(); onStatusChange(node.id, "done"); }}
                  className="flex-1 min-w-[90px] py-2 rounded-lg text-xs font-semibold bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400 transition-all active:scale-95"
                >
                  ✓ 标记完成
                </button>
              )}
              {!checkin && (node.status === "active" || node.status === "done") && (
                <button
                  onPointerDown={e => e.stopPropagation()}
                  onClick={e => { e.stopPropagation(); onCheckIn(node, null); }}
                  className="flex-1 min-w-[80px] py-2 rounded-lg text-xs font-semibold transition-all active:scale-95"
                  style={{
                    background: "rgba(200,150,48,0.15)",
                    color: "#c89630",
                    border: "1px solid rgba(200,150,48,0.35)",
                  }}
                  data-testid={`btn-checkin-${node.id}`}
                >
                  📸 打卡
                </button>
              )}
              <button
                onPointerDown={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); onEdit(node); }}
                className="py-2 px-3 rounded-lg text-xs font-semibold transition-all active:scale-95"
                style={{
                  background: "rgba(116,192,252,0.12)",
                  color: "#74c0fc",
                  border: "1px solid rgba(116,192,252,0.3)",
                }}
                data-testid={`btn-edit-${node.id}`}
              >
                ✏️ 编辑
              </button>
              <button
                onPointerDown={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); onStatusChange(node.id, "skipped"); }}
                className="py-2 px-3 rounded-lg text-xs font-semibold bg-muted text-muted-foreground transition-all active:scale-95"
              >
                跳过
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ======================== 变更提示组件 ========================
function ChangeAlert({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div
      className="absolute top-14 left-4 right-4 z-40 slide-up"
    >
      <div className="bg-amber-50 dark:bg-amber-950 border border-amber-300 dark:border-amber-700 rounded-2xl p-4 flex gap-3 items-start shadow-lg">
        <span className="text-xl">⚡</span>
        <div className="flex-1">
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 mb-0.5">行程变更建议</p>
          <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">{message}</p>
        </div>
        <button onClick={onDismiss} className="text-amber-500 text-sm">✕</button>
      </div>
    </div>
  );
}

// ======================== 主页面 ========================
export default function TripDetail() {
  const [, params] = useRoute("/trip/:id");
  const [, navigate] = useLocation();
  const tripId = parseInt(params?.id || "0");
  const qc = useQueryClient();
  const { toast } = useToast();

  const [viewMode, setViewMode] = useState<"canvas" | "list">("canvas");
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [changeAlert, setChangeAlert] = useState<string | null>(null);
  // activeDay: 0 = 全部总览；1..N = 单日
  const [activeDay, setActiveDay] = useState<number>(0);
  const [checkInTarget, setCheckInTarget] = useState<{ node: Node; existing: Checkin | null } | null>(null);
  const [editTarget, setEditTarget] = useState<Node | null>(null);
  const [addNodeOpen, setAddNodeOpen] = useState(false);
  const [tripEditOpen, setTripEditOpen] = useState(false);
  // 地图折叠/展开/全屏状态
  const [mapExpanded, setMapExpanded] = useState(false);
  const [mapFullscreen, setMapFullscreen] = useState(false);
  const mapOverlayRef = useRef<HTMLDivElement>(null);

  // 同步浏览器全屏退出事件（Esc退出时同步状态）
  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement) setMapFullscreen(false);
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const { data: trip } = useQuery<Trip>({
    queryKey: ["/api/trips", tripId],
    queryFn: () => apiRequest<Trip>("GET", `/api/trips/${tripId}`),
  });

  const { data: nodesRaw, isLoading } = useQuery<Node[]>({
    queryKey: ["/api/trips", tripId, "nodes"],
    queryFn: () => apiRequest<Node[]>("GET", `/api/trips/${tripId}/nodes`),
  });
  const nodes: Node[] = Array.isArray(nodesRaw) ? nodesRaw : [];

  // 打卡记录（按 nodeId 建索引）
  const { data: checkinsRaw } = useQuery<Checkin[]>({
    queryKey: ["/api/checkins", tripId],
    queryFn: () => apiRequest<Checkin[]>("GET", `/api/checkins?tripId=${tripId}`),
    enabled: !!tripId,
  });
  const checkinByNode = new Map<number, Checkin>();
  (checkinsRaw || []).forEach(c => {
    if (!checkinByNode.has(c.nodeId)) checkinByNode.set(c.nodeId, c);
  });

  // 当前用户
  const { data: profile } = useQuery<UserProfile | null>({
    queryKey: ["/api/profile"],
  });

  // 天气（敦煌 adcode=620982；后续目的地动态化时替换）
  type WeatherCast = {
    date: string; week: string;
    dayweather: string; nightweather: string;
    daytemp: string; nighttemp: string;
  };
  const { data: weather } = useQuery<{ city: string; casts: WeatherCast[] } | null>({
    queryKey: ["/api/map/weather", "620982"],
    queryFn: () => apiRequest("GET", `/api/map/weather?adcode=620982`),
  });
  const todayWeather = weather?.casts?.[0];

  const updateNode = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Node> }) =>
      apiRequest("PATCH", `/api/nodes/${id}`, data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["/api/trips", tripId, "nodes"] });
      // 自动变更提示逻辑
      if (vars.data.status === "skipped") {
        const skipped = nodes.find(n => n.id === vars.id);
        if (skipped) {
          setChangeAlert(`「${skipped.name}」已跳过，后续节点时间已自动顺延。建议检查下一节点是否需要调整。`);
        }
      }
      if (vars.data.status === "done") {
        const done = nodes.filter(n => n.status === "done").length + 1;
        if (done === nodes.length) {
          setChangeAlert("🎉 所有节点已完成！你的敦煌旅程圆满结束。");
        }
      }
    },
  });

  /** 与当前 Tab 一致：总览按「天 → order」，单日只按 order */
  const filteredNodes = useMemo(() => {
    const base = activeDay === 0 ? nodes : nodes.filter(n => nodeDay(n) === activeDay);
    return [...base].sort((a, b) =>
      activeDay === 0 ? nodeDay(a) - nodeDay(b) || a.order - b.order : a.order - b.order,
    );
  }, [nodes, activeDay]);

  const persistReorder = useMutation({
    mutationFn: async (newOrder: Node[]) => {
      const patches = computeReorderPatches(newOrder, activeDay, nodes);
      if (patches.length === 0) return;
      for (const p of patches) {
        await apiRequest<Node>("PATCH", `/api/nodes/${p.id}`, { day: p.day, order: p.order });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/trips", tripId, "nodes"] });
      toast({ title: "顺序已调整", duration: 1400 });
    },
    onError: (e: Error) => {
      toast({ title: "调整顺序失败", description: e.message, duration: 2800 });
      qc.invalidateQueries({ queryKey: ["/api/trips", tripId, "nodes"] });
    },
  });

  const handleStatusChange = (id: number, status: string) => {
    updateNode.mutate({ id, data: { status } });
  };

  const days = trip ? trip.totalDays || 1 : 1;
  // 0 代表"全部总览"；只有多日行程才显示总览标签
  const dayTabs: number[] = days > 1 ? [0, ...Array.from({ length: days }, (_, i) => i + 1)] : [1];

  const doneCount = nodes.filter(n => n.status === "done").length;
  const progress = nodes.length > 0 ? Math.round((doneCount / nodes.length) * 100) : 0;

  if (!trip) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-stone-950">
        <div className="phone-frame flex items-center justify-center bg-background">
          <div className="text-4xl">⏳</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-stone-950 p-4">
      <div className="phone-frame relative flex flex-col bg-background overflow-hidden">
        {/* 状态栏 */}
        <div className="absolute top-0 left-0 right-0 h-12 flex items-center justify-between px-6 z-30 bg-background/90 backdrop-blur-sm">
          <span className="text-foreground/50 text-xs">10:48</span>
          <div className="w-28 h-6 bg-foreground/10 rounded-full" />
          <div className="w-8" />
        </div>

        {/* 变更弹窗 */}
        {changeAlert && (
          <ChangeAlert message={changeAlert} onDismiss={() => setChangeAlert(null)} />
        )}

        {/* 顶部栏 — 莫高窟背景 */}
        <div className="pt-12 px-4 pb-3 z-20 relative overflow-hidden border-b border-border"
          style={{ borderColor: "rgba(200,150,48,0.15)" }}
        >
          {/* 莫高窟背景图 */}
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `url(${mogaoImg})`,
              backgroundSize: "cover",
              backgroundPosition: "center top",
              filter: "brightness(0.22) saturate(0.4) sepia(0.2)",
            }}
          />
          {/* 底部渐变 */}
          <div
            className="absolute bottom-0 left-0 right-0 h-full"
            style={{ background: "linear-gradient(to top, hsl(var(--background)) 0%, rgba(0,0,0,0.5) 100%)" }}
          />
          {/* 内容包裹层 */}
          <div className="relative z-10">
          <div className="flex items-center gap-3 mb-3">
            <button
              onClick={() => navigate("/main")}
              className="w-8 h-8 rounded-xl flex items-center justify-center text-sm"
              style={{ background: "rgba(200,150,48,0.15)", border: "1px solid rgba(200,150,48,0.25)", color: "#e8c878" }}
            >
              ←
            </button>
            <button
              onClick={() => setTripEditOpen(true)}
              className="flex-1 min-w-0 text-left rounded-lg px-2 py-0.5 -mx-2 transition-colors hover:bg-white/5 active:scale-[0.98]"
              data-testid="btn-edit-trip"
              title="点击编辑旅程"
            >
              <h1 className="text-base font-bold text-white truncate flex items-center gap-1.5">
                {trip.title}
                <span className="text-[10px]" style={{ color: "rgba(200,150,48,0.55)" }}>✏️</span>
              </h1>
              <p className="text-xs" style={{ color: "rgba(200,150,48,0.65)" }}>
                {trip.destination} · {trip.startDate}
              </p>
            </button>

            {/* 视图切换 */}
            <div className="flex rounded-xl p-0.5" style={{ background: "rgba(0,0,0,0.5)", border: "1px solid rgba(200,150,48,0.2)" }}>
              <button
                onClick={() => setViewMode("canvas")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  viewMode === "canvas" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                }`}
                data-testid="btn-view-canvas"
              >
                地图
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  viewMode === "list" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                }`}
                data-testid="btn-view-list"
              >
                列表
              </button>
            </div>
          </div>

          {/* 进度条 */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${progress}%`, background: "hsl(var(--primary))" }}
              />
            </div>
            <span className="text-[10px] text-muted-foreground flex-shrink-0">
              {doneCount}/{nodes.length} 已完成
            </span>
          </div>

          {/* 天气卡片（今日 + 明日） */}
          {todayWeather && weather && (
            <div className="mt-2.5 flex items-center gap-2 overflow-x-auto">
              <div
                className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-full"
                style={{
                  background: "rgba(200,150,48,0.12)",
                  border: "1px solid rgba(200,150,48,0.25)",
                }}
                data-testid="weather-card-today"
              >
                <span className="text-xs">
                  {todayWeather.dayweather.includes("雨") ? "🌧" :
                   todayWeather.dayweather.includes("雪") ? "❄️" :
                   todayWeather.dayweather.includes("云") ? "⛅" :
                   todayWeather.dayweather.includes("阴") ? "☁️" : "☀️"}
                </span>
                <span className="text-[10px] font-medium" style={{ color: "#e8c878" }}>
                  今天 {weather.city} {todayWeather.dayweather}
                </span>
                <span className="text-[10px]" style={{ color: "rgba(200,150,48,0.8)" }}>
                  {todayWeather.nighttemp}° / {todayWeather.daytemp}°
                </span>
              </div>
              {weather.casts[1] && (
                <div
                  className="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full"
                  style={{
                    background: "rgba(0,0,0,0.35)",
                    border: "1px solid rgba(200,150,48,0.15)",
                  }}
                >
                  <span className="text-[10px]" style={{ color: "rgba(200,150,48,0.7)" }}>明日</span>
                  <span className="text-[10px]" style={{ color: "rgba(200,150,48,0.9)" }}>
                    {weather.casts[1].dayweather} {weather.casts[1].nighttemp}/{weather.casts[1].daytemp}°
                  </span>
                </div>
              )}
            </div>
          )}
          </div>{/* end z-10 wrapper */}
        </div>

        {/* 主内容区 */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* 地图画布模式 */}
          {viewMode === "canvas" && (
            <>
              {/* 地图折叠预览条 — 默认隐藏地图，点击展开 */}
              <button
                onClick={() => setMapExpanded(true)}
                className="mx-4 mt-2 mb-1 flex items-center gap-3 px-4 py-3 rounded-xl transition-all active:scale-[0.98]"
                style={{
                  background: "rgba(200,150,48,0.08)",
                  border: "1px solid rgba(200,150,48,0.2)",
                }}
                data-testid="btn-expand-map"
              >
                <span className="text-lg">🗺</span>
                <div className="flex-1 text-left">
                  <span className="text-xs font-semibold" style={{ color: "#e8c878" }}>
                    {activeDay === 0 ? "总览地图" : `第${activeDay}天地图`}
                  </span>
                  <span className="text-[10px] ml-2" style={{ color: "rgba(200,150,48,0.6)" }}>
                    {filteredNodes.filter(n => typeof n.lat === "number").length} 个坐标点
                  </span>
                </div>
                <span className="text-xs" style={{ color: "rgba(200,150,48,0.5)" }}>点击展开 →</span>
              </button>

              {/* 地图展开覆盖层 — 定位在手机框架内部 */}
              {mapExpanded && (
                <div
                  ref={mapOverlayRef}
                  className={`${mapFullscreen ? "fixed" : "absolute"} inset-0 z-[100] flex flex-col transition-all`}
                  style={{ background: "rgba(0,0,0,0.95)", borderRadius: mapFullscreen ? 0 : "44px", overflow: "hidden" }}
                >
                  {/* 顶部工具栏 */}
                  <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ background: "rgba(0,0,0,0.6)" }}>
                    <button
                      onClick={() => {
                        if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
                        setMapExpanded(false); setMapFullscreen(false);
                      }}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-sm transition-all active:scale-90"
                      style={{ background: "rgba(200,150,48,0.15)", border: "1px solid rgba(200,150,48,0.3)", color: "#e8c878" }}
                    >
                      ✕
                    </button>
                    <span className="text-xs font-medium" style={{ color: "#e8c878" }}>
                      🗺 {activeDay === 0 ? "总览" : `第${activeDay}天`} · {filteredNodes.length} 节点
                    </span>
                    <button
                      onClick={() => {
                        if (!mapFullscreen && mapOverlayRef.current) {
                          mapOverlayRef.current.requestFullscreen?.().catch(() => {});
                          setMapFullscreen(true);
                        } else if (document.fullscreenElement) {
                          document.exitFullscreen?.().catch(() => {});
                          setMapFullscreen(false);
                        }
                      }}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-sm transition-all active:scale-90"
                      style={{ background: "rgba(200,150,48,0.15)", border: "1px solid rgba(200,150,48,0.3)", color: "#e8c878" }}
                      data-testid="btn-fullscreen-map"
                    >
                      {mapFullscreen ? "⊡" : "⛶"}
                    </button>
                  </div>

                  {/* 地图主体 — 适配手机框架(390×844)或浏览器全屏 */}
                  <div className="flex-1 relative overflow-hidden">
                    <MapCanvas
                      nodes={filteredNodes}
                      activeDay={activeDay}
                      onNodeClick={n => setSelectedNode(n === selectedNode ? null : n)}
                      width={mapFullscreen ? (typeof window !== 'undefined' ? window.innerWidth : 800) : 390}
                      height={mapFullscreen ? (typeof window !== 'undefined' ? window.innerHeight - 100 : 600) : 700}
                    />
                  </div>

                  {/* 底部天数切换（在覆盖层里也能切天） */}
                  {days > 1 && (
                    <div className="flex gap-2 px-4 py-3 overflow-x-auto flex-shrink-0" style={{ background: "rgba(0,0,0,0.7)" }}>
                      {dayTabs.map(d => (
                        <button
                          key={d}
                          onClick={() => setActiveDay(d)}
                          className={`flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
                            activeDay === d
                              ? "text-primary-foreground"
                              : "text-stone-400"
                          }`}
                          style={activeDay === d ? { background: "hsl(var(--primary))" } : { background: "rgba(255,255,255,0.08)" }}
                        >
                          {d === 0 ? "🗺 全部" : `第${d}天`}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 天数标签（含"全部"） */}
              {days > 1 && (
                <div className="flex gap-2 px-4 py-2 overflow-x-auto">
                  {dayTabs.map(d => (
                    <button
                      key={d}
                      onClick={() => setActiveDay(d)}
                      className={`flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
                        activeDay === d
                          ? "text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      }`}
                      style={activeDay === d ? { background: "hsl(var(--primary))" } : {}}
                      data-testid={`btn-day-${d}`}
                    >
                      {d === 0 ? "🗺 全部" : `第${d}天`}
                    </button>
                  ))}
                </div>
              )}

              {/* 节点列表（画布模式下的折叠列表）*/}
              <div className="flex-1 overflow-y-auto pt-2">
                {isLoading ? (
                  <div className="px-4 flex flex-col gap-2">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="h-16 skeleton rounded-xl" />
                    ))}
                  </div>
                ) : filteredNodes.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center px-8">
                    <div className="text-4xl mb-3">📍</div>
                    <p className="text-muted-foreground text-sm">
                      {activeDay === 0 ? "暂无节点" : `第${activeDay}天暂无节点`}
                    </p>
                  </div>
                ) : (
                  <>
                    <TripNodesReorderList
                      tripId={tripId}
                      activeDay={activeDay}
                      nodes={nodes}
                      filteredNodes={filteredNodes}
                      persistReorder={persistReorder}
                      listClassName="pt-1"
                    >
                      {(node, i) => (
                        <NodeItem
                          node={node}
                          index={i}
                          onStatusChange={handleStatusChange}
                          onSelect={n => setSelectedNode(selectedNode?.id === n.id ? null : n)}
                          isSelected={selectedNode?.id === node.id}
                          checkin={checkinByNode.get(node.id) || null}
                          onCheckIn={(n, existing) => setCheckInTarget({ node: n, existing })}
                          onEdit={n => setEditTarget(n)}
                        />
                      )}
                    </TripNodesReorderList>
                    <div className="h-4" />
                  </>
                )}
              </div>
            </>
          )}

          {/* 列表模式 */}
          {viewMode === "list" && (
            <div className="flex-1 overflow-y-auto">
              {/* 天数标签 */}
              {days > 1 && (
                <div className="flex gap-2 px-4 py-3 overflow-x-auto border-b border-border">
                  {dayTabs.map(d => {
                    const scope = d === 0 ? nodes : nodes.filter(n => n.day === d);
                    const dayDone = scope.filter(n => n.status === "done").length;
                    const dayTotal = scope.length;
                    return (
                      <button
                        key={d}
                        onClick={() => setActiveDay(d)}
                        className={`flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 ${
                          activeDay === d ? "text-primary-foreground" : "bg-muted text-muted-foreground"
                        }`}
                        style={activeDay === d ? { background: "hsl(var(--primary))" } : {}}
                      >
                        {d === 0 ? "🗺 全部" : `第${d}天`}
                        {dayTotal > 0 && (
                          <span className={`${activeDay === d ? "text-primary-foreground/70" : "text-muted-foreground/60"}`}>
                            {dayDone}/{dayTotal}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {filteredNodes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center px-8">
                  <div className="text-4xl mb-3">📅</div>
                  <p className="text-muted-foreground text-sm">
                    {activeDay === 0 ? "暂无计划" : `第${activeDay}天暂无计划`}
                  </p>
                </div>
              ) : (
                <>
                  <TripNodesReorderList
                    tripId={tripId}
                    activeDay={activeDay}
                    nodes={nodes}
                    filteredNodes={filteredNodes}
                    persistReorder={persistReorder}
                    listClassName="pt-3"
                  >
                    {(node, i) => (
                      <NodeItem
                        node={node}
                        index={i}
                        onStatusChange={handleStatusChange}
                        onSelect={n => setSelectedNode(selectedNode?.id === n.id ? null : n)}
                        isSelected={selectedNode?.id === node.id}
                        checkin={checkinByNode.get(node.id) || null}
                        onCheckIn={(n, existing) => setCheckInTarget({ node: n, existing })}
                        onEdit={n => setEditTarget(n)}
                      />
                    )}
                  </TripNodesReorderList>
                  <div className="h-6" />
                </>
              )}
            </div>
          )}
        </div>

        {/* 底部操作栏 */}
        <div className="border-t border-border px-4 py-3 pb-6 bg-background flex gap-2">
          <button
            onClick={() => setAddNodeOpen(true)}
            className="px-3 py-3 rounded-xl text-sm font-semibold transition-all active:scale-95"
            style={{
              background: "rgba(200,150,48,0.12)",
              color: "#c89630",
              border: "1px solid rgba(200,150,48,0.3)",
            }}
            data-testid="btn-add-node"
            title="搜索 POI 添加节点"
          >
            ＋
          </button>
          <button
            onClick={() => {
              const pending = nodes.find(n => n.status === "pending");
              if (pending) handleStatusChange(pending.id, "active");
            }}
            className="flex-1 py-3 rounded-xl text-sm font-semibold transition-all active:scale-95"
            style={{ background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}
            data-testid="btn-start-next"
          >
            开始下一站
          </button>
          <button
            className="px-4 py-3 rounded-xl text-sm font-semibold bg-muted text-muted-foreground transition-all active:scale-95"
            onClick={() => {
              toast({
                title: "功能暂未实现",
                description: "GPS 实时定位·后续补充中",
                duration: 2200,
              });
            }}
            data-testid="btn-locate"
          >
            📍
          </button>
        </div>

        {/* 打卡 Sheet */}
        {checkInTarget && (
          <CheckInSheet
            node={checkInTarget.node}
            existingCheckin={checkInTarget.existing}
            userNickname={profile?.nickname ?? undefined}
            onClose={() => setCheckInTarget(null)}
            onDeleted={() => setCheckInTarget(null)}
          />
        )}

        {/* 节点编辑 Sheet */}
        {editTarget && (
          <NodeEditSheet
            node={editTarget}
            totalDays={days}
            onClose={() => setEditTarget(null)}
          />
        )}

        {/* 添加节点 Sheet */}
        {addNodeOpen && (
          <AddNodeSheet
            tripId={trip.id}
            destination={trip.destination}
            totalDays={days}
            defaultDay={activeDay > 0 ? activeDay : 1}
            existingNodes={nodes}
            onClose={() => setAddNodeOpen(false)}
          />
        )}

        {/* 旅程编辑 Sheet */}
        {tripEditOpen && (
          <TripEditSheet
            trip={trip}
            onClose={() => setTripEditOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
