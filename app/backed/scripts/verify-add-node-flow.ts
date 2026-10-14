/**
 * 端到端验证: POI 搜索 → 创建节点 → 编辑旅程元信息 → 回滚
 *
 * 对齐 AddNodeSheet.tsx / TripEditSheet.tsx 的调用流程。
 */
const BASE = process.env.API_BASE || "http://localhost:5000";

interface Poi { id: string; name: string; lat: number; lng: number; type: string; address: string }
interface TripT { id: number; title: string; destination: string; coverEmoji: string | null; startDate: string; endDate: string; totalDays: number; status: string }
interface NodeT { id: number; tripId: number; name: string; day: number; order: number; lat: number; lng: number; category: string }

async function j<T>(method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} ${r.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : (undefined as unknown as T);
}

const log = (label: string, ...args: unknown[]) =>
  console.log(`[${new Date().toLocaleTimeString()}] ${label}`, ...args);

(async () => {
  log("STEP 1", "拉取已有旅程");
  const trips = await j<TripT[]>("GET", "/api/trips");
  const trip = trips[0];
  if (!trip) throw new Error("没有旅程，请先创建一个");
  log("  ✔ trip", { id: trip.id, title: trip.title, destination: trip.destination });

  log("STEP 2", `POI 搜索: "博物馆" in ${trip.destination}`);
  const pois = await j<Poi[]>("GET", `/api/map/poi-search?keywords=${encodeURIComponent("博物馆")}&city=${encodeURIComponent(trip.destination)}&offset=3`);
  log(`  ✔ 返回 ${pois.length} 个 POI`);
  pois.slice(0, 3).forEach(p => log(`    - ${p.name} (${p.lng.toFixed(3)}, ${p.lat.toFixed(3)})`));
  const target = pois[0];
  if (!target) throw new Error("POI 搜索为空");

  log("STEP 3", "基于选中的 POI 创建节点");
  const existing = await j<NodeT[]>("GET", `/api/trips/${trip.id}/nodes`);
  const day = 1;
  const sameDay = existing.filter(n => n.day === day);
  const order = sameDay.length === 0 ? 0 : Math.max(...sameDay.map(n => n.order ?? 0)) + 1;
  const created = await j<NodeT>("POST", `/api/trips/${trip.id}/nodes`, {
    tripId: trip.id,
    name: `[E2E] ${target.name}`,
    description: target.address,
    scheduledTime: "14:30",
    duration: 90,
    lat: target.lat,
    lng: target.lng,
    status: "pending",
    order,
    category: "景点",
    pitfallTip: "E2E 自动生成，稍后删除",
    day,
  });
  log("  ✔ created node", { id: created.id, name: created.name, order: created.order, lat: created.lat });

  log("STEP 4", "编辑旅程（PATCH）— 只改 coverEmoji/status");
  const beforeEmoji = trip.coverEmoji || "🏜️";
  const beforeStatus = trip.status;
  const nextEmoji = beforeEmoji === "🧭" ? "✨" : "🧭";
  const patched = await j<TripT>("PATCH", `/api/trips/${trip.id}`, {
    coverEmoji: nextEmoji,
    status: "active",
  });
  log("  ✔ patched", { coverEmoji: patched.coverEmoji, status: patched.status });
  if (patched.coverEmoji !== nextEmoji || patched.status !== "active") {
    throw new Error("PATCH 返回字段与预期不符");
  }

  log("STEP 5", "回滚 trip 修改");
  await j("PATCH", `/api/trips/${trip.id}`, {
    coverEmoji: beforeEmoji,
    status: beforeStatus,
  });
  log("  ✔ 已回滚 coverEmoji/status");

  log("STEP 6", "删除 E2E 测试节点");
  await j("DELETE", `/api/nodes/${created.id}`);
  log("  ✔ deleted");

  log("DONE", "✅ 全部通过");
})().catch(err => {
  console.error("\n❌ 验证失败:", err instanceof Error ? err.message : err);
  process.exit(1);
});
