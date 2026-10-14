import "dotenv/config";
import { ChatDeepSeek } from "@langchain/deepseek";
import {
  HumanMessage,
  SystemMessage,
  AIMessage,
  ToolMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import { z } from "zod";
import { tools, toolByName } from "./tools";

const MAX_ITERATIONS = 8;

export const GeneratedNodeSchema = z.object({
  day: z.number().describe("第几天，从 1 开始"),
  order: z.number().describe("当天内的顺序，从 0 开始"),
  name: z.string().describe("地点名称"),
  description: z.string().describe("一句话描述"),
  category: z.enum(["景点", "餐饮", "住宿", "交通"]).describe("节点类型"),
  time: z.string().describe("建议到达时间，格式 HH:mm"),
  duration: z.number().describe("停留时间，单位分钟"),
  lat: z.number().describe("纬度"),
  lng: z.number().describe("经度"),
  pitfallTip: z.string().describe("避坑提示或贴士，可为空字符串"),
});

export const ItinerarySchema = z.object({
  tripTitle: z.string().describe("行程标题"),
  destination: z.string().describe("目的地"),
  totalDays: z.number().describe("总天数"),
  nodes: z.array(GeneratedNodeSchema).describe("行程节点列表，按天和顺序排列"),
});

export type GeneratedNode = z.infer<typeof GeneratedNodeSchema>;
export type Itinerary = z.infer<typeof ItinerarySchema>;

export interface AgentEvent {
  type: "tool_call" | "tool_result" | "ai_thought" | "final";
  iteration: number;
  data: any;
}

export interface GenerateRequest {
  destination: string;
  days: number;
  preferences: string[];
  startDate: string;
  /** 用户自由填写的个性化要求，会并入系统提示与首轮对话 */
  userPrompt?: string;
}

function buildSystemPrompt(req: GenerateRequest) {
  const extra = req.userPrompt?.trim()
    ? `\n- 用户个性化说明（请优先满足，且不与安全/地理常识冲突）：\n${req.userPrompt.trim()}`
    : "";

  return `你是一位专业的旅游行程规划师，当前案例以 ${req.destination} 为主。

用户需求：
- 目的地：${req.destination}
- 天数：${req.days} 天
- 出发日期：${req.startDate}
- 偏好：${req.preferences.join("、") || "无"}${extra}

你必须通过调用工具来获取真实数据：
1. 先用 get_weather(adcode) 查询当地天气（敦煌 adcode=620982）
2. 使用 poi_search(keywords, city) 搜索景点、餐厅等地点，获取真实的经纬度
3. 可选地使用 route_plan(origin, destination) 评估相邻景点之间的距离

规划原则：
- 每天安排 3-5 个节点（景点/餐饮交替）
- 节点顺序符合地理位置顺序，减少往返
- 每个节点必须包含真实经纬度（从 poi_search 返回的 location 中获取）
- 避开已知坑点（如需预约、高温时段不宜户外等）
- 餐饮就近选择，覆盖午餐和晚餐

完成规划后，请用清晰的结构化文本呈现每天的行程。`;
}

/**
 * Agent 主循环：LLM ↔ 工具，收集所有上下文
 * 以事件流的形式回调，便于 SSE 推送。
 */
export async function runAgent(
  req: GenerateRequest,
  onEvent?: (ev: AgentEvent) => void
): Promise<BaseMessage[]> {
  const model = new ChatDeepSeek({
    model: "deepseek-chat",
    temperature: 0.3,
  });

  const modelWithTools = model.bindTools(tools);

  const prefLine = req.preferences.join("、") || "综合体验";
  const userExtra = req.userPrompt?.trim()
    ? `\n\n【用户额外要求】\n${req.userPrompt.trim()}`
    : "";

  const messages: BaseMessage[] = [
    new SystemMessage(buildSystemPrompt(req)),
    new HumanMessage(
      `请为我规划一份「${req.destination}」${req.days} 天行程，偏好：${prefLine}。${userExtra}`
    ),
  ];

  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
    const response = await modelWithTools.invoke(messages);
    messages.push(response);

    const toolCalls = response.tool_calls || [];

    if (response.content) {
      onEvent?.({
        type: "ai_thought",
        iteration,
        data: typeof response.content === "string" ? response.content : JSON.stringify(response.content),
      });
    }

    if (toolCalls.length === 0) {
      onEvent?.({ type: "final", iteration, data: response.content });
      break;
    }

    for (const tc of toolCalls) {
      onEvent?.({
        type: "tool_call",
        iteration,
        data: { name: tc.name, args: tc.args, id: tc.id },
      });

      const selected = toolByName[tc.name as keyof typeof toolByName];
      let toolOutput: string;
      if (!selected) {
        toolOutput = `Error: unknown tool ${tc.name}`;
      } else {
        try {
          toolOutput = String(await selected.invoke(tc.args as any));
        } catch (e) {
          toolOutput = `Tool error: ${String(e)}`;
        }
      }

      onEvent?.({
        type: "tool_result",
        iteration,
        data: { name: tc.name, result: toolOutput },
      });

      messages.push(
        new ToolMessage({
          tool_call_id: tc.id!,
          content: toolOutput,
        })
      );
    }
  }

  return messages;
}

/**
 * 将 Agent 产出的自由文本 + 工具结果，通过 withStructuredOutput 转化为结构化节点。
 */
export async function structurize(
  messages: BaseMessage[],
  req: GenerateRequest
): Promise<Itinerary> {
  const structModel = new ChatDeepSeek({
    model: "deepseek-chat",
    temperature: 0,
  });

  // 汇总 AI 最终发言 + 所有工具返回，作为上下文
  const aiTexts = messages
    .filter((m) => m instanceof AIMessage)
    .map((m) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content)))
    .filter(Boolean)
    .join("\n---\n");

  const toolTexts = messages
    .filter((m) => m instanceof ToolMessage)
    .map((m) => String(m.content))
    .join("\n---\n");

  const structured = structModel.withStructuredOutput(ItinerarySchema);

  return await structured.invoke([
    new SystemMessage(
      "根据已有的行程规划文本和工具调用数据，生成结构化 JSON。每个节点必须包含真实的经纬度坐标（从工具返回中提取）。按 day 升序、order 递增排列。"
    ),
    new HumanMessage(
      `用户信息：\n${JSON.stringify(req)}\n\nAI 规划文本:\n${aiTexts}\n\n工具返回数据:\n${toolTexts}`
    ),
  ]);
}
