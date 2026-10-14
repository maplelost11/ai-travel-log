/**
 * Phase 2 路由自测脚本
 * 启动 server 后运行：npx tsx scripts/test-api.ts
 */
import fs from "fs";

const BASE = process.env.BASE || "http://localhost:5000";

async function req(method: string, path: string, body?: any, extra: RequestInit = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    ...extra,
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, body: json };
}

const results: Record<string, any> = {};

async function testHealth() {
  const r = await req("GET", "/api/health");
  console.log("GET /api/health ->", r.status);
  results.health = r;
}

async function testProfile() {
  let r = await req("POST", "/api/profile", {
    nickname: "大漠行者",
    avatar: "🧭",
    onboardingDone: 1,
  });
  console.log("POST /api/profile ->", r.status, r.body);
  results.profileCreate = r;

  r = await req("GET", "/api/profile");
  console.log("GET /api/profile ->", r.status);
  results.profileGet = r;
}

async function testTripsAndNodes() {
  let r = await req("POST", "/api/trips", {
    title: "敦煌测试行程",
    destination: "敦煌",
    startDate: "2026-04-25",
    endDate: "2026-04-27",
    coverEmoji: "🏜️",
    status: "planning",
    totalDays: 3,
  });
  console.log("POST /api/trips ->", r.status, r.body);
  results.tripCreate = r;
  const tripId = r.body.id;

  r = await req("GET", `/api/trips/${tripId}`);
  console.log(`GET /api/trips/${tripId} ->`, r.status);
  results.tripGet = r;

  r = await req("GET", "/api/trips");
  console.log("GET /api/trips ->", r.status, "count =", r.body.length);
  results.tripList = r;

  r = await req("POST", `/api/trips/${tripId}/nodes`, {
    name: "莫高窟",
    description: "世界文化遗产",
    scheduledTime: "08:30",
    duration: 180,
    lat: 40.042511,
    lng: 94.809374,
    status: "pending",
    order: 0,
    category: "景点",
    pitfallTip: "需预约",
    day: 1,
  });
  console.log("POST /api/trips/:id/nodes ->", r.status, r.body);
  results.nodeCreate = r;
  const nodeId = r.body.id;

  r = await req("GET", `/api/trips/${tripId}/nodes`);
  console.log(`GET /api/trips/${tripId}/nodes ->`, r.status, "count =", r.body.length);
  results.nodeList = r;

  r = await req("PATCH", `/api/nodes/${nodeId}`, { status: "done" });
  console.log("PATCH /api/nodes/:id ->", r.status, r.body.status);
  results.nodePatch = r;

  // 打卡
  r = await req("POST", "/api/checkins", {
    nodeId,
    tripId,
    photos: JSON.stringify(["/uploads/test.jpg"]),
    caption: "打卡！",
  });
  console.log("POST /api/checkins ->", r.status, r.body);
  results.checkinCreate = r;

  r = await req("GET", `/api/checkins?tripId=${tripId}`);
  console.log(`GET /api/checkins?tripId=${tripId} ->`, r.status, "count =", r.body.length);
  results.checkinList = r;

  // 清理
  r = await req("DELETE", `/api/trips/${tripId}`);
  console.log(`DELETE /api/trips/${tripId} ->`, r.status);
  results.tripDelete = r;
}

async function testMap() {
  let r = await req("GET", "/api/map/weather?adcode=620982");
  console.log("GET /api/map/weather ->", r.status, r.body?.city);
  results.weather = r;

  r = await req("GET", "/api/map/poi-search?keywords=博物馆&city=敦煌&offset=3");
  console.log("GET /api/map/poi-search ->", r.status, "count =", r.body.length);
  results.poiSearch = r;

  // 静态地图
  const mapRes = await fetch(BASE + "/api/map/static?location=94.8091,40.0362&zoom=14");
  console.log("GET /api/map/static ->", mapRes.status, mapRes.headers.get("content-type"));
  const buf = await mapRes.arrayBuffer();
  console.log("  image size:", buf.byteLength, "bytes");
  results.staticMap = {
    status: mapRes.status,
    contentType: mapRes.headers.get("content-type"),
    size: buf.byteLength,
  };
}

async function testUpload() {
  const PNG_1x1 = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
    "base64"
  );
  const formData = new FormData();
  formData.append("photos", new Blob([PNG_1x1], { type: "image/png" }), "a.png");
  formData.append("photos", new Blob([PNG_1x1], { type: "image/png" }), "b.png");

  const res = await fetch(BASE + "/api/upload", { method: "POST", body: formData });
  const body = await res.json();
  console.log("POST /api/upload ->", res.status, body);
  results.upload = { status: res.status, body };
}

async function main() {
  await testHealth();
  await testProfile();
  await testTripsAndNodes();
  await testMap();
  await testUpload();

  const out = ".cursor/rules/phase2-api-test-results.json";
  fs.writeFileSync(out, JSON.stringify(results, null, 2), "utf-8");
  console.log(`\n✅ Test results saved to: ${out}`);
}

main().catch(console.error);
