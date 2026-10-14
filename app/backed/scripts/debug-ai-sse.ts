/**
 * 直连后端 /api/ai/generate-itinerary，逐帧打印 SSE 事件
 * 用于排查"前端点击生成后无响应"的真实原因
 */
const BASE = process.env.API_BASE || "http://localhost:5000";

async function main() {
  const body = {
    destination: "敦煌",
    days: 3,
    preferences: ["必打卡景点"],
    startDate: "2026-04-24",
  };

  const started = Date.now();
  console.log(`[debug] POST ${BASE}/api/ai/generate-itinerary`);
  console.log(`[debug] body =`, body);

  let res: Response;
  try {
    res = await fetch(`${BASE}/api/ai/generate-itinerary`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.error(`[debug] fetch failed after ${Date.now() - started}ms:`, e);
    process.exit(1);
  }

  console.log(`[debug] status = ${res.status} ${res.statusText}`);
  console.log(`[debug] content-type = ${res.headers.get("content-type")}`);

  if (!res.body) {
    console.error("[debug] no response body");
    process.exit(1);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let eventCount = 0;
  let nodeCount = 0;
  let lastTick = Date.now();

  // 独立定时器显示心跳，帮助分辨是"卡住"还是"慢"
  const tick = setInterval(() => {
    const idle = Date.now() - lastTick;
    console.log(`  ...等待中 (已接收 ${eventCount} 事件 / ${nodeCount} 节点 / ${idle}ms 未更新)`);
  }, 5000);

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      lastTick = Date.now();
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() || "";

      for (const chunk of parts) {
        if (!chunk.trim()) continue;
        if (chunk.startsWith(":")) {
          console.log(`[heartbeat] ${chunk.trim()}`);
          continue;
        }
        if (chunk.startsWith("data: ")) {
          const payload = chunk.slice(6);
          try {
            const evt = JSON.parse(payload);
            eventCount++;
            const t = ((Date.now() - started) / 1000).toFixed(1);
            switch (evt.type) {
              case "status":
                console.log(`[+${t}s] 📡 status: ${evt.message}`);
                break;
              case "node":
                nodeCount++;
                console.log(
                  `[+${t}s] 📍 node[${evt.index + 1}/${evt.total}] ${evt.node?.name} day=${evt.node?.day} time=${evt.node?.time}`
                );
                break;
              case "done":
                console.log(`[+${t}s] ✅ done. total=${evt.total} title=${evt.tripTitle}`);
                break;
              case "error":
                console.error(`[+${t}s] ❌ error: ${evt.message}`);
                break;
              default:
                console.log(`[+${t}s] ? ${JSON.stringify(evt)}`);
            }
          } catch (e) {
            console.warn(`[debug] JSON parse failed:`, payload);
          }
        } else {
          console.log(`[debug] raw chunk:`, chunk);
        }
      }
    }
  } finally {
    clearInterval(tick);
  }

  const dur = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`\n[debug] 流结束。总耗时 ${dur}s；共 ${eventCount} 事件、${nodeCount} 节点`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
