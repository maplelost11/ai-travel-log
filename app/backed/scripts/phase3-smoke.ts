/**
 * Phase 3 冒烟测试：模拟前端发起的所有关键 HTTP 调用
 * 验证前后端契约完全对齐（不测 AI SSE，因调用 LLM 耗时且已在 Phase 2 覆盖）
 */
const BASE = "http://localhost:5000";

async function req<T = any>(method: string, path: string, body?: any): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${method} ${path} => ${res.status}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

async function main() {
  const results: Array<[string, "PASS" | "FAIL", string]> = [];
  const rec = (name: string, ok: boolean, detail: string) =>
    results.push([name, ok ? "PASS" : "FAIL", detail]);

  // 1. health
  try {
    const h = await req("GET", "/api/health");
    rec("GET /api/health", h.ok === true, `uptime=${h.uptime?.toFixed?.(1)}s`);
  } catch (e) { rec("GET /api/health", false, String(e)); }

  // 2. profile upsert（模拟 Onboarding 提交）
  try {
    const p = await req("POST", "/api/profile", {
      nickname: "敦煌探客",
      avatar: "🧭",
      onboardingDone: 1,
    });
    rec("POST /api/profile", !!p.id, `nickname=${p.nickname}`);
  } catch (e) { rec("POST /api/profile", false, String(e)); }

  // 3. 列表 trips（模拟 Main）
  let initialTripCount = 0;
  try {
    const trips = await req<any[]>("GET", "/api/trips");
    initialTripCount = trips.length;
    rec("GET /api/trips", Array.isArray(trips), `current=${trips.length}`);
  } catch (e) { rec("GET /api/trips", false, String(e)); }

  // 4. 创建 trip（模拟 AddTripSheet.handleSave 保存阶段的 payload）
  let tripId = 0;
  try {
    const t = await req<any>("POST", "/api/trips", {
      title: "Phase3 冒烟行程",
      destination: "敦煌",
      startDate: "2026-05-01",
      endDate: "2026-05-03",
      coverEmoji: "🏜️",
      status: "planning",
      totalDays: 3,
    });
    tripId = t.id;
    rec("POST /api/trips", !!t.id, `id=${t.id} title=${t.title}`);
  } catch (e) { rec("POST /api/trips", false, String(e)); }

  // 5. 批量创建节点（模拟保存 AI 生成的节点，包含前端会附带的 time 字段）
  let nodeIds: number[] = [];
  try {
    for (let i = 0; i < 3; i++) {
      const node = await req<any>("POST", `/api/trips/${tripId}/nodes`, {
        name: `测试节点${i + 1}`,
        description: "描述",
        time: "10:00",            // 前端 AI 生成字段，应被 zod strip 掉
        scheduledTime: "10:00",
        duration: 120,
        day: 1,
        order: i,
        category: "景点",
        pitfallTip: "",
        lat: 40.1416,
        lng: 94.6624,
        tripId,
      });
      nodeIds.push(node.id);
    }
    rec("POST /api/trips/:tripId/nodes × 3", nodeIds.length === 3, `ids=${nodeIds.join(",")}`);
  } catch (e) { rec("POST /api/trips/:tripId/nodes", false, String(e)); }

  // 6. 获取 trip 详情（模拟 TripDetail 进入页面）
  try {
    const t = await req<any>("GET", `/api/trips/${tripId}`);
    rec("GET /api/trips/:id", t.id === tripId, `title=${t.title}`);
  } catch (e) { rec("GET /api/trips/:id", false, String(e)); }

  // 7. 获取节点列表
  try {
    const ns = await req<any[]>("GET", `/api/trips/${tripId}/nodes`);
    rec("GET /api/trips/:tripId/nodes", ns.length === 3, `count=${ns.length}`);
  } catch (e) { rec("GET /api/trips/:tripId/nodes", false, String(e)); }

  // 8. PATCH 节点状态（模拟 TripDetail 点击状态圆圈）
  try {
    const upd = await req<any>("PATCH", `/api/nodes/${nodeIds[0]}`, { status: "active" });
    rec("PATCH /api/nodes/:id", upd.status === "active", `status=${upd.status}`);
  } catch (e) { rec("PATCH /api/nodes/:id", false, String(e)); }

  // 9. 删除 trip（级联删节点；模拟 Main 删除卡片）
  try {
    await req("DELETE", `/api/trips/${tripId}`);
    const after = await req<any[]>("GET", "/api/trips");
    rec(
      "DELETE /api/trips/:id (cascade)",
      after.length === initialTripCount,
      `final count=${after.length}, initial=${initialTripCount}`
    );
  } catch (e) { rec("DELETE /api/trips/:id", false, String(e)); }

  // 10. CORS 预检（模拟浏览器跨源）
  try {
    const res = await fetch(`${BASE}/api/trips`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:5173",
        "Access-Control-Request-Method": "POST",
      },
    });
    const allow = res.headers.get("access-control-allow-origin");
    rec("CORS preflight", allow === "http://localhost:5173", `ACAO=${allow}`);
  } catch (e) { rec("CORS preflight", false, String(e)); }

  // ===== 打印报告 =====
  console.log("\n╔═══════════════════════════════════╗");
  console.log("║   Phase 3 前后端契约冒烟测试结果    ║");
  console.log("╚═══════════════════════════════════╝\n");
  for (const [name, status, detail] of results) {
    const mark = status === "PASS" ? "✓" : "✗";
    console.log(`  [${mark}] ${status.padEnd(4)} ${name.padEnd(40)} ${detail}`);
  }
  const passCount = results.filter((r) => r[1] === "PASS").length;
  console.log(`\n  合计：${passCount}/${results.length} 通过\n`);
  if (passCount !== results.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
