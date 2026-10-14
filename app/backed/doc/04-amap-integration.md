# 04. 高德 API 集成规范

> 实现位置：[`server/services/amap.ts`](../server/services/amap.ts)
> 真实响应样本：[`contracts/amap-api-responses.json`](./contracts/amap-api-responses.json)
> 所用 Key 类型：**Web 服务** Key（支持 `restapi.amap.com`）
> 文档基础：[高德 Web 服务 API 官方文档](https://lbs.amap.com/api/webservice/summary/)

---

## 认证与 Key 管理

```
AMAP_KEY=95bcc60a6449f9cf2b4acd761d4b80c0  # Web 服务 Key（截图中第一行）
```

- **仅限后端持有**；所有前端对地图的访问都经过后端代理
- 浏览器端 JS API（Web端 Key）目前未使用；如将来引入地图组件再单独配置

---

## 通用调用规则

```typescript
const BASE = "https://restapi.amap.com";

async function amapFetchJson(pathname, params) {
  const url = new URL(pathname, BASE);
  for (const [k, v] of Object.entries(params)) url.searchParams.append(k, String(v));
  url.searchParams.append("key", AMAP_KEY);

  const data = await (await fetch(url)).json();
  if (data.status !== "1") throw new Error(`Amap ${data.infocode}: ${data.info}`);
  return data;
}
```

- 所有接口统一附加 `key` query 参数
- 所有接口返回 `status: "1"` 视为成功，否则抛异常
- JSON 接口返回结构不包裹 `data`，字段直接挂在根对象

---

## 6 个已封装接口

| 函数 | 高德 Endpoint | 用途 |
|------|--------------|------|
| `geocode(address, city?)` | `/v3/geocode/geo` | 地址→坐标（谨慎使用） |
| `poiSearch(keywords, city, opts)` | `/v3/place/text` | 关键字搜索景点/餐厅 |
| `poiAround(location, keywords, opts)` | `/v3/place/around` | 周边搜索 |
| `drivingRoute(origin, destination)` | `/v5/direction/driving` | 驾车路线 |
| `weather(adcode)` / `weatherLive(adcode)` | `/v3/weather/weatherInfo` | 天气预报/实况 |
| `staticMapUrl() / fetchStaticMap()` | `/v3/staticmap` | 静态地图 |

---

## 1. `geocode` — 地理编码

**⚠️ 注意：不推荐作为景点坐标获取方式**

Phase 1 验证发现：`geocode("莫高窟", "敦煌")` 会返回**深圳南山区的同名 POI**，忽略 city 限制。

```typescript
const data = await geocode("敦煌路1号", "敦煌");
// { formatted_address, location, lat, lng, adcode, city, province }
```

**使用建议：**
- 仅用于**模糊地址**（如"敦煌路1号"）
- **获取景点坐标请改用 `poiSearch`**

---

## 2. `poiSearch` — POI 关键字搜索 ⭐

最常用的接口，也是 Agent 主要调用的工具。

```typescript
const pois = await poiSearch("莫高窟", "敦煌", { offset: 5 });
// PoiItem[]
```

### `PoiItem` 数据契约
```typescript
interface PoiItem {
  id: string;
  name: string;              // "莫高窟景区"
  address: string;           // "314省道太阳温泉酒店13.6公里处"
  location: string;          // "94.809374,40.042511"（原始字符串）
  lat: number;               // 40.042511（解析后）
  lng: number;               // 94.809374
  type: string;              // "风景名胜;风景名胜;世界遗产"
  tel?: string;              // "4008333715"
  rating?: string;           // "4.8"
  openTime?: string;         // "08:00-18:00"
  photos?: string[];         // 图片 URL 数组
  adcode?: string;           // "620982"
  cityname?: string;         // "酒泉市"
}
```

### 关键映射
- 高德返回 `location: "lng,lat"` 字符串 → 拆分到 `lat` + `lng` 数字字段
- `biz_ext.rating` / `biz_ext.open_time` 提升到顶层 `rating` / `openTime`
- `photos[].url` 过滤空值后组装为字符串数组

### 请求参数
| 参数 | 默认 | 说明 |
|------|------|------|
| `keywords` | — | 搜索关键词（支持空格） |
| `city` | — | 城市名（中文） |
| `offset` | 10 | 每页条数（Phase 1 验证 5 条响应稳定） |
| `page` | 1 | 页码 |
| `extensions` | `all` | `all` 返回含照片和评分，`base` 仅基础 |

---

## 3. `poiAround` — POI 周边搜索

```typescript
const pois = await poiAround("94.6624,40.1416", "餐厅", { radius: 3000, offset: 5 });
```

- `location`: `lng,lat` 字符串
- `radius`: 搜索半径（米，默认 3000）
- 返回结构同 `PoiItem`，额外含 `distance` 字段（米）

---

## 4. `drivingRoute` — 驾车路线

```typescript
const route = await drivingRoute("94.809374,40.042511", "94.680396,40.088833");
// { distance: 28611, taxiCost: 35, duration: undefined, stepsCount: 11, firstStep: "..." }
```

### 关键字段
| 字段 | 单位 | 说明 |
|------|------|------|
| `distance` | 米 | 总距离 |
| `taxiCost` | 元 | 预估打车费用 |
| `stepsCount` | 条 | 路线分段数 |
| `firstStep` | — | 第一步文字描述（如"向北行驶10米右转"） |

### 原始响应结构（供参考）
```json
{
  "route": {
    "taxi_cost": "39",
    "paths": [
      {
        "distance": "31606",
        "steps": [
          { "instruction": "向北行驶415米右转", "orientation": "北", "road_name": "240省道", "step_distance": "415" }
        ]
      }
    ]
  }
}
```

---

## 5. `weather` / `weatherLive` — 天气

```typescript
const forecast = await weather("620982");   // 预报
const live = await weatherLive("620982");   // 实况
```

### 敦煌常用 adcode
| 区域 | adcode |
|------|--------|
| 敦煌市 | `620982` |
| 酒泉市 | `620900` |
| 甘肃省 | `620000` |

### 预报 `casts` 结构
```typescript
interface WeatherCast {
  date: string;         // "2026-04-21"
  week: string;         // "2" (周二)
  dayweather: string;   // "多云"
  nightweather: string; // "多云"
  daytemp: string;      // "22"
  nighttemp: string;    // "7"
  daywind: string;      // "北"
  nightwind: string;    // "北"
  // ...
}
```

返回未来 4 天预报；实况返回单条 `lives[0]`。

---

## 6. `staticMapUrl` / `fetchStaticMap` — 静态地图

```typescript
const url = staticMapUrl({
  location: "94.8091,40.0362",
  zoom: 14,
  size: "750*400",
  scale: 2,
  markers: "large,0xc89630,A:94.8091,40.0362",
});

const buffer = await fetchStaticMap({ location: "94.8091,40.0362" });
```

### markers 语法
```
{size},{color},{label}:{lng,lat}|{size},{color},{label}:{lng,lat}|...
```
- `size`: `small` | `mid` | `large`
- `color`: 16 进制（如 `0xc89630` 敦煌金）
- `label`: A-Z 或 0-9
- 多个 marker 用 `|` 分隔

### 返回
`image/png` 二进制，建议后端响应头：
```
Content-Type: image/png
Cache-Control: public, max-age=604800   # 7 天
```

---

## 在业务中的使用约束

### 1. Agent 工具层调用
LangChain Tools 仅消费 `amap.ts` 的封装函数，**绝不直接拼接 URL**。
见 [`server/ai/tools.ts`](../server/ai/tools.ts)。

### 2. 坐标字段格式
- **高德要求**：`"lng,lat"` 字符串
- **内部存储**：`lat:number` + `lng:number`
- 任何跨层传递都需显式转换（参见 `mapPoi` 函数）

### 3. 错误处理
- HTTP 错误 → 抛 `Error("Amap HTTP xxx")`
- 业务错误 → 抛 `Error("Amap {infocode}: {info}")`
- 调用方用 `try/catch` 捕获后转 500 响应

### 4. 频率限制
Web 服务 Key 免费额度：
- **地理编码/POI**：5000 次/日
- **路径规划**：5000 次/日
- **静态地图**：30000 次/日

当前用量监控未实现；建议后续加入缓存层（POI 搜索 30 分钟 / 天气 1 小时 / 静态地图 7 天）。

---

## 常见问题

### Q: 为什么 `geocode("莫高窟", "敦煌")` 返回深圳结果？
A: 高德的 `geocode` 对 city 参数**非强约束**，会做模糊匹配。解决方案：使用 `poiSearch(keywords, city)`，city 参数会严格过滤。

### Q: POI 返回的 `photos[].url` 是 HTTP 不是 HTTPS
A: 高德 CDN 域名 `store.is.autonavi.com` 本身支持 HTTPS，前端展示时可主动替换协议。

### Q: 静态地图能否在前端直接请求？
A: **不能**。`AMAP_KEY` 只在后端持有，前端必须请求 `/api/map/static`。

### Q: 一次 Agent 调用消耗多少次 API 额度？
A: 实测平均 8-10 次（1 次天气 + 6-8 次 POI 搜索），远低于免费额度。
