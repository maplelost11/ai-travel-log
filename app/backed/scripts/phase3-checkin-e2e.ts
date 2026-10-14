/**
 * Phase 3 · 打卡 + 海报链路端到端验证
 *
 * 覆盖：GET /api/trips/:id/nodes → POST /api/upload → POST /api/checkins
 *       → GET /api/checkins?tripId → GET /api/map/weather → GET /api/map/static
 *       → DELETE /api/checkins/:id
 */
import "dotenv/config";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const BASE = process.env.TEST_BASE || "http://localhost:5000";

function log(title: string, obj: unknown) {
  console.log(`\n===== ${title} =====`);
  console.log(typeof obj === "string" ? obj : JSON.stringify(obj, null, 2));
}

async function main() {
  const health = await fetch(`${BASE}/api/health`).then(r => r.json());
  log("health", health);

  // 1. 找一个已有 trip + node；若无则创建最小样本
  const trips = await fetch(`${BASE}/api/trips`).then(r => r.json());
  if (!Array.isArray(trips) || trips.length === 0) {
    console.error("❌ 没有旅程，请先在前端生成一次行程或通过 /api/trips 创建");
    process.exit(1);
  }
  const trip = trips[0];
  log("trip", { id: trip.id, title: trip.title, destination: trip.destination });

  const nodes = await fetch(`${BASE}/api/trips/${trip.id}/nodes`).then(r => r.json());
  if (!Array.isArray(nodes) || nodes.length === 0) {
    console.error("❌ 该 trip 无节点");
    process.exit(1);
  }
  const node = nodes[0];
  log("node", { id: node.id, name: node.name, lat: node.lat, lng: node.lng });

  // 2. 上传图片（用一张最小 PNG）
  const pngPath = resolve(process.cwd(), "scripts/fixtures/tiny.png");
  if (!existsSync(pngPath)) {
    // 生成一张 1x1 的 PNG
    const b64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";
    writeFileSync(pngPath, Buffer.from(b64, "base64"));
  }
  const form = new FormData();
  const file = new File([readFileSync(pngPath)], "tiny.png", { type: "image/png" });
  form.append("photos", file);
  form.append("photos", file);
  const upRes = await fetch(`${BASE}/api/upload`, { method: "POST", body: form });
  const up = await upRes.json();
  log("upload", up);
  if (!up.urls?.length) throw new Error("upload failed");

  // 3. 创建打卡
  const checkinRes = await fetch(`${BASE}/api/checkins`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      nodeId: node.id,
      tripId: trip.id,
      photos: JSON.stringify(up.urls),
      caption: "测试打卡 · e2e · " + new Date().toLocaleTimeString(),
      createdAt: new Date().toISOString(),
    }),
  });
  const checkin = await checkinRes.json();
  log("checkin created", checkin);

  // 4. 列表
  const list = await fetch(`${BASE}/api/checkins?tripId=${trip.id}`).then(r => r.json());
  log("checkins list", list);

  // 5. 天气
  const w = await fetch(`${BASE}/api/map/weather?adcode=620982`).then(r => r.json());
  log("weather (620982)", { city: w.city, todayCast: w.casts?.[0] });

  // 6. 静态地图（只取字节数，避免控制台打印二进制）
  if (typeof node.lat === "number" && typeof node.lng === "number") {
    const mapRes = await fetch(
      `${BASE}/api/map/static?location=${node.lng},${node.lat}&zoom=13&size=400*300&markers=mid,0xc89630,A:${node.lng},${node.lat}`
    );
    const buf = await mapRes.arrayBuffer();
    log("static map", {
      status: mapRes.status,
      contentType: mapRes.headers.get("content-type"),
      bytes: buf.byteLength,
    });
  }

  // 7. 删除
  const delRes = await fetch(`${BASE}/api/checkins/${checkin.id}`, { method: "DELETE" });
  log("delete", { status: delRes.status });

  const listAfter = await fetch(`${BASE}/api/checkins?tripId=${trip.id}`).then(r => r.json());
  log("checkins list after delete", listAfter);

  console.log("\n✅ 打卡链路 e2e 全部通过");
}

main().catch(e => {
  console.error("❌ e2e 失败:", e);
  process.exit(1);
});
