import { tool } from "@langchain/core/tools";
import { z } from "zod";
import * as amap from "../services/amap";

/** POI 关键字搜索（供 LLM 调用） */
export const poiSearchTool = tool(
  async ({ keywords, city, offset }) => {
    const pois = await amap.poiSearch(keywords, city, { offset: offset ?? 5 });
    return JSON.stringify(
      pois.slice(0, 5).map((p) => ({
        name: p.name,
        address: p.address,
        location: p.location,
        type: p.type,
        rating: p.rating,
        openTime: p.openTime,
        tel: p.tel,
      }))
    );
  },
  {
    name: "poi_search",
    description:
      "在指定城市搜索 POI 兴趣点（景点、餐厅、酒店、交通枢纽等）。返回 POI 列表及其位置坐标。",
    schema: z.object({
      keywords: z.string().describe("搜索关键词，如：景点、餐厅、酒店、博物馆"),
      city: z.string().describe("城市名称，如：敦煌"),
      offset: z.number().optional().describe("返回条数，默认 5"),
    }),
  }
);

/** 天气预报 */
export const weatherTool = tool(
  async ({ adcode }) => {
    const data = await amap.weather(adcode);
    if (!data) return "无天气数据";
    return JSON.stringify({
      city: data.city,
      casts: data.casts.slice(0, 4),
    });
  },
  {
    name: "get_weather",
    description: "查询指定城市的未来4天天气预报，需要城市行政编码(adcode)。敦煌 adcode 为 620982。",
    schema: z.object({
      adcode: z.string().describe("城市行政编码，如敦煌=620982"),
    }),
  }
);

/** 驾车路线规划 */
export const routePlanTool = tool(
  async ({ origin, destination }) => {
    const info = await amap.drivingRoute(origin, destination);
    if (!info) return "无路线数据";
    return JSON.stringify({
      distance_m: info.distance,
      taxi_cost_yuan: info.taxiCost,
      steps_count: info.stepsCount,
    });
  },
  {
    name: "route_plan",
    description: "规划两个经纬度坐标之间的驾车路线，返回距离（米）和打车费用（元）",
    schema: z.object({
      origin: z.string().describe("起点经纬度，格式：lng,lat"),
      destination: z.string().describe("终点经纬度，格式：lng,lat"),
    }),
  }
);

/** 所有工具集合 */
export const tools = [poiSearchTool, weatherTool, routePlanTool];

/** 按名称快速查找工具（给 Agent 手动调度时用） */
export const toolByName = Object.fromEntries(tools.map((t) => [t.name, t]));
