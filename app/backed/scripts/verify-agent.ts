/**
 * Phase 1: LangChain Agent + 高德 Tools 端到端验证
 * 模拟完整的 AI 行程生成流程：
 *   用户输入 → Agent 调用工具 → 生成结构化行程节点
 */
import "dotenv/config";
import { ChatDeepSeek } from "@langchain/deepseek";
import { tool } from "@langchain/core/tools";
import { HumanMessage, SystemMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import { z } from "zod";
import fs from "fs";
import path from "path";

const AMAP_KEY = process.env.AMAP_KEY!;
const BASE = "https://restapi.amap.com";

async function amapGet(url: string) {
  const res = await fetch(`${BASE}${url}&key=${AMAP_KEY}`);
  return await res.json();
}

// ===== 定义高德工具 =====

const poiSearchTool = tool(
  async ({ keywords, city, offset }) => {
    const data = await amapGet(
      `/v3/place/text?keywords=${encodeURIComponent(keywords)}&city=${encodeURIComponent(city)}&offset=${offset || 5}&page=1&extensions=all`
    );
    const pois = (data.pois || []).slice(0, 5).map((p: any) => ({
      name: p.name,
      address: p.address,
      location: p.location,
      type: p.type,
      tel: p.tel,
      rating: p.biz_ext?.rating,
      openTime: p.biz_ext?.open_time,
    }));
    return JSON.stringify(pois);
  },
  {
    name: "poi_search",
    description: "在指定城市搜索POI兴趣点（景点、餐厅、酒店等）",
    schema: z.object({
      keywords: z.string().describe("搜索关键词，如：景点、餐厅、酒店"),
      city: z.string().describe("城市名称"),
      offset: z.number().optional().describe("返回数量，默认5"),
    }),
  }
);

const weatherTool = tool(
  async ({ adcode }) => {
    const data = await amapGet(
      `/v3/weather/weatherInfo?city=${adcode}&extensions=all`
    );
    const forecast = data.forecasts?.[0];
    return JSON.stringify({
      city: forecast?.city,
      casts: forecast?.casts?.slice(0, 3),
    });
  },
  {
    name: "get_weather",
    description: "查询指定城市的天气预报（需要城市adcode）",
    schema: z.object({
      adcode: z.string().describe("城市行政编码，如敦煌=620982"),
    }),
  }
);

const routePlanTool = tool(
  async ({ origin, destination }) => {
    const data = await amapGet(
      `/v5/direction/driving?origin=${origin}&destination=${destination}`
    );
    const firstPath = data.route?.paths?.[0];
    return JSON.stringify({
      distance: firstPath?.distance,
      taxi_cost: data.route?.taxi_cost,
      steps_count: firstPath?.steps?.length,
      first_step: firstPath?.steps?.[0]?.instruction,
    });
  },
  {
    name: "route_plan",
    description: "规划两点间的驾车路线，返回距离和预估费用",
    schema: z.object({
      origin: z.string().describe("起点经纬度，格式：lng,lat"),
      destination: z.string().describe("终点经纬度，格式：lng,lat"),
    }),
  }
);

const tools = [poiSearchTool, weatherTool, routePlanTool];

// ===== Agent 循环 =====

async function runAgent() {
  console.log("=".repeat(60));
  console.log("LangChain Agent + 高德工具 端到端验证");
  console.log("=".repeat(60));

  const model = new ChatDeepSeek({
    model: "deepseek-chat",
    temperature: 0.3,
  });

  const modelWithTools = model.bindTools(tools);

  const systemPrompt = `你是一个专业的敦煌旅游行程规划师。
用户会告诉你旅行偏好，你需要：
1. 先查询目的地天气
2. 搜索相关景点/餐厅
3. 规划景点间路线
4. 综合以上信息给出行程建议

请根据工具返回的真实数据来规划行程。`;

  const userInput = "我想去敦煌玩2天，喜欢历史文化和自然景观，帮我规划一下行程，包含吃饭的地方";

  let messages: any[] = [
    new SystemMessage(systemPrompt),
    new HumanMessage(userInput),
  ];

  console.log(`\n用户: ${userInput}\n`);

  const agentLog: any[] = [];
  let iteration = 0;
  const MAX_ITERATIONS = 8;

  while (iteration < MAX_ITERATIONS) {
    iteration++;
    console.log(`--- Iteration ${iteration} ---`);

    const response = await modelWithTools.invoke(messages);

    if (response.content) {
      console.log(`AI: ${typeof response.content === "string" ? response.content.slice(0, 200) : JSON.stringify(response.content).slice(0, 200)}...`);
    }

    const toolCalls = response.tool_calls || [];
    if (toolCalls.length === 0) {
      console.log("(No tool calls — agent finished)");
      agentLog.push({
        iteration,
        role: "ai_final",
        content: response.content,
      });
      messages.push(response);
      break;
    }

    console.log(`Tool calls: ${toolCalls.map((tc: any) => `${tc.name}(${JSON.stringify(tc.args)})`).join(", ")}`);
    agentLog.push({
      iteration,
      role: "ai_tool_call",
      toolCalls: toolCalls.map((tc: any) => ({
        name: tc.name,
        args: tc.args,
        id: tc.id,
      })),
    });

    messages.push(response);

    for (const tc of toolCalls) {
      const selectedTool = tools.find((t) => t.name === tc.name);
      if (!selectedTool) {
        console.log(`  ⚠️ Unknown tool: ${tc.name}`);
        messages.push(new ToolMessage({
          tool_call_id: tc.id!,
          content: `Error: unknown tool ${tc.name}`,
        }));
        continue;
      }

      console.log(`  Calling ${tc.name}...`);
      const toolResult = await selectedTool.invoke(tc.args as any);
      console.log(`  Result: ${String(toolResult).slice(0, 200)}...`);

      messages.push(new ToolMessage({
        tool_call_id: tc.id!,
        content: String(toolResult),
      }));

      agentLog.push({
        iteration,
        role: "tool_result",
        name: tc.name,
        args: tc.args,
        result: JSON.parse(String(toolResult)),
      });
    }
  }

  // 最终获取结构化输出
  console.log("\n" + "=".repeat(60));
  console.log("生成结构化行程节点...");
  console.log("=".repeat(60));

  const structuredModel = new ChatDeepSeek({
    model: "deepseek-chat",
    temperature: 0,
  });

  const ItinerarySchema = z.object({
    tripTitle: z.string().describe("行程标题"),
    destination: z.string().describe("目的地"),
    totalDays: z.number().describe("总天数"),
    nodes: z.array(
      z.object({
        day: z.number().describe("第几天"),
        order: z.number().describe("当天顺序"),
        name: z.string().describe("地点名称"),
        description: z.string().describe("一句话描述"),
        category: z.enum(["景点", "餐饮", "住宿", "交通"]),
        time: z.string().describe("建议到达时间 HH:mm"),
        duration: z.number().describe("停留时间（分钟）"),
        lat: z.number().describe("纬度"),
        lng: z.number().describe("经度"),
        pitfallTip: z.string().describe("避坑提示"),
      })
    ),
  });

  const structuredWithSchema = structuredModel.withStructuredOutput(ItinerarySchema);

  const lastAiMessage = messages.filter((m: any) => m instanceof AIMessage || m._getType?.() === "ai").pop();
  const finalContent = lastAiMessage?.content || "";

  const structuredResult = await structuredWithSchema.invoke([
    new SystemMessage(
      "将以下行程规划转换为结构化JSON。每个节点必须包含真实的经纬度坐标。"
    ),
    new HumanMessage(
      `请将以下行程内容转为结构化数据：\n\n${typeof finalContent === "string" ? finalContent : JSON.stringify(finalContent)}`
    ),
  ]);

  console.log("\n结构化行程输出:");
  console.log(JSON.stringify(structuredResult, null, 2));

  return {
    agentLog,
    structuredItinerary: structuredResult,
    totalIterations: iteration,
  };
}

async function main() {
  const result = await runAgent();

  const outPath = path.resolve(".cursor/rules/agent-pipeline.json");
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2), "utf-8");
  console.log(`\n✅ Agent pipeline result saved to: ${outPath}`);
}

main().catch(console.error);
