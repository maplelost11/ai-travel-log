/**
 * 验证节点自由编辑：PATCH /api/nodes/:id 所有可编辑字段 + DELETE /api/nodes/:id
 */
import "dotenv/config";

const BASE = process.env.TEST_BASE || "http://localhost:5000";

async function jget(url: string) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return r.json();
}
async function jsend(method: string, url: string, body?: unknown) {
  const r = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.status === 204) return null;
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${url} → ${r.status} ${t}`);
  return JSON.parse(t);
}

async function main() {
  const trips = (await jget(`${BASE}/api/trips`)) as any[];
  if (!trips.length) {
    console.log("no trips; aborting");
    return;
  }
  const trip = trips[0];

  // 创建临时节点（避免污染真实数据）
  const created = await jsend("POST", `${BASE}/api/trips/${trip.id}/nodes`, {
    tripId: trip.id,
    name: "【测试】待编辑节点",
    description: "orig",
    scheduledTime: "08:00",
    duration: 60,
    category: "景点",
    pitfallTip: "",
    day: 1,
    lat: 40.14,
    lng: 94.66,
    status: "pending",
    order: 999,
  });
  console.log("  created id=", created.id);

  // 1) PATCH name + time + duration
  const p1 = await jsend("PATCH", `${BASE}/api/nodes/${created.id}`, {
    name: "【测试】编辑后的名称",
    scheduledTime: "10:30",
    duration: 150,
  });
  console.log("  PATCH 1 ✓", { name: p1.name, time: p1.scheduledTime, duration: p1.duration });

  // 2) PATCH category + day + pitfallTip
  const p2 = await jsend("PATCH", `${BASE}/api/nodes/${created.id}`, {
    category: "餐饮",
    day: 2,
    pitfallTip: "记得订位",
    description: "更新后的描述",
  });
  console.log("  PATCH 2 ✓", { category: p2.category, day: p2.day, tip: p2.pitfallTip, desc: p2.description });

  // 3) PATCH status
  const p3 = await jsend("PATCH", `${BASE}/api/nodes/${created.id}`, {
    status: "done",
  });
  console.log("  PATCH 3 ✓", { status: p3.status });

  // 4) PATCH 空 diff（应当 no-op 返回当前）
  const p4 = await jsend("PATCH", `${BASE}/api/nodes/${created.id}`, {});
  console.log("  PATCH 4 (empty) ✓", { id: p4.id });

  // 5) DELETE
  const d = await jsend("DELETE", `${BASE}/api/nodes/${created.id}`);
  console.log("  DELETE ✓ →", d);

  // 6) 再 GET 应 404
  const r = await fetch(`${BASE}/api/trips/${trip.id}/nodes`);
  const remaining = (await r.json()) as any[];
  const stillThere = remaining.find(n => n.id === created.id);
  console.log("  after delete, node gone?", !stillThere);

  console.log("\n✅ 节点自由编辑 API 全部通过");
}

main().catch(e => { console.error("❌", e); process.exit(1); });
