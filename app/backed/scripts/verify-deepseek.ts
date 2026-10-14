/**
 * Phase 1: DeepSeek 模型验证脚本
 * 测试 ChatDeepSeek 基础对话、tool calling、结构化输出
 */
import "dotenv/config";
import { ChatDeepSeek } from "@langchain/deepseek";
import { tool } from "@langchain/core/tools";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import fs from "fs";
import path from "path";

const results: Record<string, any> = {};

async function verifyBasicChat() {
  console.log("=".repeat(60));
  console.log("1. 基础对话 — ChatDeepSeek invoke()");
  console.log("=".repeat(60));

  const model = new ChatDeepSeek({
    model: "deepseek-chat",
    temperature: 0.7,
  });

  const response = await model.invoke([
    new SystemMessage("你是一个敦煌旅游专家，回答要简洁。"),
    new HumanMessage("莫高窟最佳参观时间是什么时候？一句话回答。"),
  ]);

  console.log("Response content:", response.content);
  console.log("Response metadata:", JSON.stringify(response.response_metadata, null, 2));
  console.log("Usage:", JSON.stringify(response.usage_metadata, null, 2));

  results.basicChat = {
    content: response.content,
    model: response.response_metadata?.model,
    usage: response.usage_metadata,
  };
}

async function verifyToolCalling() {
  console.log("\n" + "=".repeat(60));
  console.log("2. Tool Calling — 模型触发工具调用");
  console.log("=".repeat(60));

  const weatherTool = tool(
    async ({ city }) => {
      return JSON.stringify({
        city,
        weather: "晴",
        temperature: "22°C",
        wind: "西北风3级",
      });
    },
    {
      name: "get_weather",
      description: "查询指定城市的天气信息",
      schema: z.object({
        city: z.string().describe("城市名称"),
      }),
    }
  );

  const model = new ChatDeepSeek({
    model: "deepseek-chat",
    temperature: 0,
  });

  const modelWithTools = model.bindTools([weatherTool]);

  const response = await modelWithTools.invoke([
    new HumanMessage("敦煌现在天气怎么样？"),
  ]);

  console.log("Response content:", response.content);
  console.log("Tool calls:", JSON.stringify(response.tool_calls, null, 2));

  results.toolCalling = {
    content: response.content,
    toolCalls: response.tool_calls,
    hasToolCalls: (response.tool_calls?.length ?? 0) > 0,
  };
}

async function verifyStructuredOutput() {
  console.log("\n" + "=".repeat(60));
  console.log("3. 结构化输出 — withStructuredOutput()");
  console.log("=".repeat(60));

  const TripNodeSchema = z.object({
    name: z.string().describe("景点名称"),
    description: z.string().describe("景点描述，一句话"),
    time: z.string().describe("建议到达时间，格式 HH:mm"),
    duration: z.number().describe("建议停留时间，单位分钟"),
    category: z.enum(["景点", "餐饮", "住宿", "交通"]).describe("节点类型"),
    pitfallTip: z.string().describe("避坑提示"),
  });

  const model = new ChatDeepSeek({
    model: "deepseek-chat",
    temperature: 0,
  });

  const structured = model.withStructuredOutput(TripNodeSchema);

  const response = await structured.invoke([
    new SystemMessage("你是敦煌旅游专家。根据用户请求返回一个行程节点的结构化数据。"),
    new HumanMessage("生成莫高窟的行程节点信息"),
  ]);

  console.log("Structured output:", JSON.stringify(response, null, 2));

  results.structuredOutput = response;
}

async function main() {
  console.log(`DEEPSEEK_API_KEY: ${process.env.DEEPSEEK_API_KEY ? "set (" + process.env.DEEPSEEK_API_KEY.slice(0, 8) + "...)" : "NOT SET"}\n`);

  await verifyBasicChat();
  await verifyToolCalling();
  await verifyStructuredOutput();

  const outPath = path.resolve(".cursor/rules/deepseek-capabilities.json");
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2), "utf-8");
  console.log(`\n✅ All results saved to: ${outPath}`);
}

main().catch(console.error);
