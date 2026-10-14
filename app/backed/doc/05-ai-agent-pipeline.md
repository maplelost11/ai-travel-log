# 05. AI Agent 流程规范

> 实现位置：
> - [`server/ai/tools.ts`](../server/ai/tools.ts) — LangChain Tools
> - [`server/ai/agent.ts`](../server/ai/agent.ts) — Agent 主循环 + 结构化输出
> - [`server/ai/index.ts`](../server/ai/index.ts) — SSE 入口
>
> 验证数据：
> - [`contracts/deepseek-capabilities.json`](./contracts/deepseek-capabilities.json)
> - [`contracts/agent-pipeline.json`](./contracts/agent-pipeline.json)

---

## 技术选型

| 组件 | 选型 | 原因 |
|------|------|------|
| LLM | `deepseek-chat` | 国内网络友好，支持 Tool Calling 与结构化输出 |
| 框架 | LangChain.js 1.3 | 成熟的 Tool 抽象、Message 类型系统 |
| SDK | `@langchain/deepseek` | 官方适配 |
| 数据验证 | Zod | 与 LangChain 原生集成，可直接 `withStructuredOutput(schema)` |

配置：
```typescript
new ChatDeepSeek({
  model: "deepseek-chat",
  temperature: 0.3,    // 规划阶段需要少许创造性
  // temperature: 0 用于结构化输出阶段
});
```

---

## 数据流概览

```mermaid
flowchart TB
    Req[POST /api/ai/generate-itinerary<br/>{destination,days,preferences,startDate}]
    Req --> SSEOpen[打开 SSE 响应]
    SSEOpen --> Loop{runAgent 循环<br/>最多 8 轮}
    Loop -->|LLM 决策| Tool1[poi_search]
    Loop -->|LLM 决策| Tool2[get_weather]
    Loop -->|LLM 决策| Tool3[route_plan]
    Tool1 --> Merge[消息累积]
    Tool2 --> Merge
    Tool3 --> Merge
    Merge --> Loop
    Loop -->|LLM 不再调用工具| Struct[structurize<br/>withStructuredOutput]
    Struct --> Push[按 day/order 排序<br/>逐节点 SSE 推送]
    Push --> Done[done 事件]
```

---

## Tools 定义

### 工具清单

| Tool 名 | 入参 | 出参（JSON 字符串） |
|--------|------|--------------------|
| `poi_search` | `{ keywords, city, offset? }` | `[{ name, address, location, type, rating, openTime, tel }]` |
| `get_weather` | `{ adcode }` | `{ city, casts: [{ date, dayweather, nighttemp, ... }] }` |
| `route_plan` | `{ origin, destination }` | `{ distance_m, taxi_cost_yuan, steps_count }` |

> 工具返回一律为**字符串化 JSON**（LangChain 协议要求）。
> LLM 会自行解析并决策后续调用。

### 工具定义范式
```typescript
const poiSearchTool = tool(
  async ({ keywords, city, offset }) => {
    const pois = await amap.poiSearch(keywords, city, { offset: offset ?? 5 });
    return JSON.stringify(pois.slice(0, 5).map(p => ({
      name: p.name, address: p.address, location: p.location,
      type: p.type, rating: p.rating, openTime: p.openTime, tel: p.tel,
    })));
  },
  {
    name: "poi_search",
    description: "在指定城市搜索 POI 兴趣点...",
    schema: z.object({
      keywords: z.string().describe("..."),
      city: z.string().describe("..."),
      offset: z.number().optional(),
    }),
  }
);
```

### 工具设计原则
1. **返回数据裁剪**：`slice(0, 5)` 限制每次工具返回的条数，避免吃光上下文窗口
2. **字段精简**：只暴露 LLM 需要的核心字段（如不返回 `typecode` / `gridcode`）
3. **description 清晰**：告诉 LLM"什么时候用、入参是什么、返回什么"
4. **Zod schema 强约束**：参数验证由 LangChain 自动完成

---

## Agent 主循环

### 核心代码结构
```typescript
const messages = [
  new SystemMessage(buildSystemPrompt(req)),
  new HumanMessage(`请为我规划敦煌${req.days}天行程...`),
];

for (let iteration = 1; iteration <= 8; iteration++) {
  const response = await modelWithTools.invoke(messages);
  messages.push(response);

  if (!response.tool_calls?.length) break;  // LLM 完成规划

  for (const tc of response.tool_calls) {
    const toolOutput = await toolByName[tc.name].invoke(tc.args);
    messages.push(new ToolMessage({ tool_call_id: tc.id, content: toolOutput }));
  }
}
```

### 为什么不用 `createReactAgent`？
- 我们需要**在每轮迭代中推送 SSE 事件**（进度状态）
- 我们需要**精确控制最大迭代次数**
- 我们需要**可替换的工具调度**（便于将来做 mock/dry-run）

### 循环终止条件
1. LLM 返回消息不含 `tool_calls` → 视为完成
2. 达到 `MAX_ITERATIONS = 8` → 强制终止
3. Tool 执行抛异常 → 写入 `ToolMessage` 让 LLM 自行处理（不中断循环）

### 实测数据（见 `agent-pipeline.json`）
| 指标 | 值 |
|------|----|
| 平均迭代次数 | 7 |
| 工具调用分布 | `poi_search`: 5 / `get_weather`: 1 / `route_plan`: 1 |
| 端到端耗时 | 90-120 秒 |
| Token 消耗 | 约 3000-5000 input + 1500-2500 output |

---

## System Prompt 规范

```typescript
function buildSystemPrompt(req: GenerateRequest) {
  return `你是一位专业的敦煌旅游行程规划师。

用户需求：
- 目的地：${req.destination}
- 天数：${req.days} 天
- 出发日期：${req.startDate}
- 偏好：${req.preferences.join("、") || "无"}

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
```

### Prompt 设计原则
- **明确工具使用顺序**：降低 LLM 调用混乱的风险
- **硬编码敦煌 adcode**：减少一次地理编码调用
- **强调"真实经纬度"**：防止 LLM 编造坐标
- **给出节点密度建议**：避免"一天 10 个节点"等不合理安排

---

## 结构化输出阶段

Agent 自由文本不能直接入库，需转为结构化 JSON：

```typescript
const structured = new ChatDeepSeek({ model: "deepseek-chat", temperature: 0 })
  .withStructuredOutput(ItinerarySchema);

const itinerary = await structured.invoke([
  new SystemMessage("根据已有行程文本和工具数据生成结构化 JSON..."),
  new HumanMessage(`用户信息: ${JSON.stringify(req)}\n\nAI 规划: ${aiTexts}\n\n工具返回: ${toolTexts}`),
]);
```

### ItinerarySchema
```typescript
const ItinerarySchema = z.object({
  tripTitle: z.string(),
  destination: z.string(),
  totalDays: z.number(),
  nodes: z.array(z.object({
    day: z.number(),
    order: z.number(),
    name: z.string(),
    description: z.string(),
    category: z.enum(["景点", "餐饮", "住宿", "交通"]),
    time: z.string(),           // "HH:mm"
    duration: z.number(),       // 分钟
    lat: z.number(),
    lng: z.number(),
    pitfallTip: z.string(),
  })),
});
```

### 为什么分两阶段？
- Agent 阶段 `temperature=0.3` 允许创造性；结构化阶段 `temperature=0` 保证字段准确
- 结构化模型只需读入已有结果，不再调用工具，响应快

---

## SSE 推送协议

见 [02-api-specification.md § 8. AI 行程生成](./02-api-specification.md#8-ai-行程生成-sse)

核心事件顺序：
```
status: 正在调研目的地...
status: 调用 get_weather...
status: 调用 poi_search...
...
status: 正在整理行程...
node: { index:0, total:9, node:{...} }
node: { index:1, total:9, node:{...} }
...
node: { index:8, total:9, node:{...} }
done: { total:9, tripTitle:"..." }
```

## 健壮性设计

| 故障场景 | 处理策略 |
|---------|---------|
| DeepSeek API 超时 | Node.js 默认 fetch 无超时，建议上层网关设置 180s |
| 工具执行抛异常 | catch 后写入 ToolMessage，LLM 会重试或跳过 |
| 达到最大迭代数 | 用已有消息直接进入结构化阶段，避免空转 |
| 结构化输出失败 | 返回 `{type:"error"}` SSE，前端走 fallback |
| 客户端断开 | SSE `res.end()` 被动触发，无需额外清理 |

---

## 扩展方向

未实装但规范已预留：
1. **缓存层**：对 `poi_search` 结果按 `(keywords, city)` 做 30min 缓存
2. **Mock 模式**：`MOCK_AI=true` 环境变量下返回 `contracts/agent-pipeline.json` 中的样本，不调用真实 LLM
3. **多目的地**：System Prompt 中的 "敦煌" 硬编码应基于 `req.destination` 动态注入 adcode 字典
4. **并行工具**：DeepSeek 支持单轮多 tool_call，可并行执行减少往返

---

## 快速诊断

| 症状 | 可能原因 | 处置 |
|------|---------|------|
| 生成耗时 > 3 分钟 | 工具调用次数异常 | 打印 `agentLog`，检查 System Prompt 是否引导清晰 |
| `lat`/`lng` 为空或 0 | LLM 未从 `poi_search` 返回中提取坐标 | 加强 Prompt："必须使用工具返回的真实坐标" |
| 节点 category 为其他值 | LLM 幻觉 | `z.enum` 已阻止，Zod 会抛错；检查前端错误处理 |
| 中途断开 | 浏览器 30s 无响应判定断开 | 15s 心跳已启用；检查反向代理缓冲配置 |
