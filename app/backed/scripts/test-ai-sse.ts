/**
 * 测试 SSE AI 行程生成路由
 */
const BASE = process.env.BASE || "http://localhost:5000";

async function main() {
  const res = await fetch(BASE + "/api/ai/generate-itinerary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      destination: "敦煌",
      days: 2,
      preferences: ["必打卡景点", "美食体验"],
      startDate: "2026-04-25",
    }),
  });

  console.log("SSE Response:", res.status, res.headers.get("content-type"));

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const events: any[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const data = JSON.parse(line.slice(6));
          events.push(data);
          if (data.type === "status") {
            console.log("[status]", data.message);
          } else if (data.type === "node") {
            console.log(`[node ${data.index + 1}/${data.total}]`, data.node.name, "·", data.node.category, "·", data.node.time);
          } else if (data.type === "done") {
            console.log("[done]", data);
          } else if (data.type === "error") {
            console.log("[error]", data.message);
          }
        } catch {}
      }
    }
  }

  console.log("\n✅ Total events:", events.length);
  console.log("Node events:", events.filter(e => e.type === "node").length);
}

main().catch(console.error);
