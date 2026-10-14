/**
 * 验证"给定一组节点 → 算出中心/缩放 → 拉取干净底图"的链路能工作。
 * 这是前端 MapCanvas 在做的事情，等价地在 Node 侧跑一遍。
 */
import "dotenv/config";

const BASE = process.env.TEST_BASE || "http://localhost:5000";
const MAP_W = 390;
const MAP_H = 280;

function mercator(cLng: number, cLat: number, zoom: number, w: number, h: number) {
  const TILE = 256;
  const scale = TILE * Math.pow(2, zoom);
  const project = (lng: number, lat: number) => {
    const x = (lng + 180) / 360 * scale;
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
  const lngs = coords.map(c => c.lng), lats = coords.map(c => c.lat);
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
  const trips = (await (await fetch(`${BASE}/api/trips`)).json()) as any[];
  if (!trips?.length) {
    console.log("没有 trip，跳过");
    return;
  }
  for (const trip of trips) {
    const nodes = (await (await fetch(`${BASE}/api/trips/${trip.id}/nodes`)).json()) as any[];
    const coords = (nodes || [])
      .filter(n => typeof n.lat === "number" && typeof n.lng === "number")
      .map(n => ({ lng: n.lng, lat: n.lat, name: n.name }));

    if (coords.length === 0) {
      console.log(`trip #${trip.id} ${trip.title}: 无坐标，跳过`);
      continue;
    }

    const view = computeView(coords);
    const p = mercator(view.centerLng, view.centerLat, view.zoom, MAP_W, MAP_H);
    const projected = coords.map(c => ({ ...c, ...p(c.lng, c.lat) }));

    console.log(`\n=== trip #${trip.id} ${trip.title} ===`);
    console.log(`  coords: ${coords.length}`);
    console.log(`  center: ${view.centerLng.toFixed(4)}, ${view.centerLat.toFixed(4)}`);
    console.log(`  zoom  : ${view.zoom}`);
    projected.forEach(c => {
      console.log(`    - ${c.name.padEnd(12)} (${c.lng.toFixed(3)}, ${c.lat.toFixed(3)}) → px(${c.x.toFixed(1)}, ${c.y.toFixed(1)})`);
    });

    const mapUrl = `${BASE}/api/map/static?location=${view.centerLng},${view.centerLat}&zoom=${view.zoom}&size=${MAP_W}*${MAP_H}&markers=`;
    const res = await fetch(mapUrl);
    const buf = await res.arrayBuffer();
    console.log(`  map   : status=${res.status} bytes=${buf.byteLength}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
