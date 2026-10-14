import type { Response } from "express";
import { runAgent, structurize, type GenerateRequest, type GeneratedNode } from "./agent";

/**
 * SSE 行程生成入口。
 * 按 node 级别流式推送，便于前端展示进度。
 *
 * 前端协议（见 AddTripSheet.tsx）：
 *   data: { "type": "node", "node": {...}, "index": 0, "total": 8 }
 *   data: { "type": "done" }
 */
export async function streamItinerary(req: GenerateRequest, res: Response) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  const write = (obj: any) => {
    res.write(`data: ${JSON.stringify(obj)}\n\n`);
    // @ts-expect-error flushHeaders for express 5
    res.flush?.();
  };

  const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 15000);

  try {
    // 进度提示
    write({ type: "status", message: "正在调研目的地..." });

    const messages = await runAgent(req, (ev) => {
      if (ev.type === "tool_call") {
        write({ type: "status", message: `调用 ${ev.data.name}...` });
      }
    });

    write({ type: "status", message: "正在整理行程..." });

    const itinerary = await structurize(messages, req);

    // 按 day/order 逐个推送节点
    const sorted = [...itinerary.nodes].sort(
      (a, b) => a.day - b.day || a.order - b.order
    );

    for (let i = 0; i < sorted.length; i++) {
      const node: GeneratedNode = sorted[i];
      write({
        type: "node",
        node,
        index: i,
        total: sorted.length,
      });
      // 轻微延时，让前端逐条动效显示
      await new Promise((r) => setTimeout(r, 120));
    }

    write({ type: "done", total: sorted.length, tripTitle: itinerary.tripTitle });
  } catch (err) {
    console.error("[ai] generate error:", err);
    write({ type: "error", message: String(err) });
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
}
