/**
 * 验证"按天过滤 → 不同 zoom 等级"的链路。
 * 模拟前端 MapCanvas 在 activeDay=0/1/2/3/4 分别会请求什么。
 */
import "dotenv/config";

const BASE = process.env.TEST_BASE || "http://localhost:5000";
const MAP_W = 390;
const MAP_H = 280;

function mercator(cLng: number, cLat: number, zoom: number, w: number, h: number) {
  const TILE = 256;
  const scale = TILE * Math.pow(2, zoom);
  const project = (lng: number, lat: number) => {
    const x = ((lng + 180) / 360) * scale;
    const s = Math.sin((lat * Math.PI) / 180);
    const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale;
    return { x, y };
  };
  const c = project(cLng, cLat);
  return (lng: number, lat: number) => {
    const p = project(lng, lat);
    return { x: w / 2 + (p.x - c.x), y: h / 2 + (p.y - c.y) };
  };
}

function computeView(coords: { lng: number; lat: number }[]) {
  if (coords.length === 0) return { centerLng: 94.66, centerLat: 40.14, zoom: 11 };
  if (coords.length === 1) return { centerLng: coords[0].lng, centerLat: coords[0].lat, zoom: 14 };
  const lngs = coords.map(c => c.lng);
  const lats = coords.map(c => c.lat);
  const centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
  const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const PADDING = 48;
  for (let z = 17; z >= 3; z--) {
    const p = mercator(centerLng, centerLat, z, MAP_W, MAP_H);
    const allIn = coords.every(({ lng, lat }) => {
      const { x, y } = p(lng, lat);
      return x >= PADDING && x <= MAP_W - PADDING && y >= PADDING && y <= MAP_H - PADDING;
    });
    if (allIn) return { centerLng, centerLat, zoom: z };
  }
  return { centerLng, centerLat, zoom: 3 };
}

async function main() {
  const ns = (await (await fetch(`${BASE}/api/trips/3/nodes`)).json()) as any[];
  const all = ns.map(n => ({ lng: n.lng as number, lat: n.lat as number, name: n.name, day: n.day }));
  const groups = new Map<number, typeof all>();
  for (const n of all) {
    if (!groups.has(n.day)) groups.set(n.day, []);
    groups.get(n.day)!.push(n);
  }

  const keys: (number | "all")[] = ["all", ...Array.from(groups.keys()).sort()];

  for (const k of keys) {
    const subset = k === "all" ? all : groups.get(k)!;
    const view = computeView(subset);
    const mapUrl =
      `${BASE}/api/map/static?location=${view.centerLng},${view.centerLat}` +
      `&zoom=${view.zoom}&size=${MAP_W}*${MAP_H}&markers=`;
    const res = await fetch(mapUrl);
    const bytes = (await res.arrayBuffer()).byteLength;
    console.log(
      `${String(k === "all" ? "ALL" : `Day${k}`).padEnd(6)} ` +
      `count=${String(subset.length).padEnd(2)} ` +
      `zoom=${view.zoom}  ` +
      `center=(${view.centerLng.toFixed(3)}, ${view.centerLat.toFixed(3)})  ` +
      `map=${res.status} ${bytes}B`
    );
  }
}

main().catch(e => { console.error(e); process.exit(1); });
