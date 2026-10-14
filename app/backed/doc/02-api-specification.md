# 02. API 接口规范

> Base URL: `http://localhost:5000` (开发) / 生产按部署配置
> 所有写操作使用 `application/json`；上传使用 `multipart/form-data`；行程生成使用 SSE

---

## 通用约定

### 响应状态码
| 状态码 | 含义 |
|--------|------|
| 200 | 成功（含 GET/POST/PATCH） |
| 204 | 成功无响应体（DELETE） |
| 400 | 请求参数错误（Zod 校验失败） |
| 404 | 资源不存在 |
| 500 | 服务端内部错误 |

### 错误响应格式
```json
{
  "error": "invalid_input",
  "issues": [ { "path": ["title"], "message": "Required" } ]
}
```

### 时间与坐标
- 时间：ISO 8601（`YYYY-MM-DDTHH:mm:ss.sssZ`）
- 日期字段（`startDate` 等）：`YYYY-MM-DD`
- 坐标：`lat` 与 `lng` 为独立的 `number` 字段（非字符串）

---

## 1. 健康检查

### `GET /api/health`

**响应示例：**
```json
{
  "ok": true,
  "uptime": 120.5,
  "now": "2026-04-21T16:58:08.379Z"
}
```

---

## 2. 行程 (Trips)

### `GET /api/trips`
列出所有行程。

**响应：** `Trip[]`（按 id 升序）

### `GET /api/trips/:id`
获取单个行程。
- **404**：不存在

### `POST /api/trips`
创建行程。

**请求体：**
```json
{
  "title": "敦煌探索之旅",
  "destination": "敦煌",
  "startDate": "2026-04-25",
  "endDate": "2026-04-27",
  "coverEmoji": "🏜️",
  "status": "planning",
  "totalDays": 3
}
```

**必填字段：** `title`, `startDate`, `endDate`
**可选字段**：`destination` (默认"敦煌") / `coverEmoji` (默认"🏜️") / `status` (默认"planning") / `totalDays` (默认 3)

### `PATCH /api/trips/:id`
部分更新。

**请求体**：`Partial<InsertTrip>`

### `DELETE /api/trips/:id`
**响应：** 204
**副作用**：级联删除关联的 `nodes` 和 `checkins`

---

## 3. 行程节点 (Nodes)

### `GET /api/trips/:tripId/nodes`
列出某行程下所有节点（按 `day` 升序、`order` 升序）。

### `POST /api/trips/:tripId/nodes`
创建节点。路径中的 `:tripId` 会自动注入 body（前端无需传 `tripId`）。

**请求体：**
```json
{
  "name": "莫高窟",
  "description": "世界文化遗产",
  "scheduledTime": "08:30",
  "duration": 180,
  "lat": 40.042511,
  "lng": 94.809374,
  "status": "pending",
  "order": 0,
  "category": "景点",
  "pitfallTip": "需提前预约",
  "ticketInfo": "",
  "day": 1
}
```

**枚举：**
- `status`: `"pending" | "active" | "done" | "skipped"`
- `category`: `"景点" | "餐饮" | "住宿" | "交通"`

### `PATCH /api/nodes/:id`
更新节点，常用于**标记完成**、**调整顺序**。
前端 `TripDetail.tsx` 在节点完成时调用 `PATCH { status: "done" }`。

### `DELETE /api/nodes/:id`
删除节点（级联删除该节点下的 `checkins`）

---

## 4. 用户资料 (Profile)

系统为单用户本地存储，`user_profile` 表仅有一条记录。

### `GET /api/profile`
**响应：** `UserProfile | null`（首次无记录返回 `null`）

### `POST /api/profile`
创建或更新（upsert）。

**请求体：**
```json
{
  "nickname": "大漠行者",
  "avatar": "🧭",
  "onboardingDone": 1
}
```

---

## 5. 打卡 (Checkins)

### `GET /api/checkins?tripId=x`
列出某行程的所有打卡；不传 `tripId` 返回全部。

### `POST /api/checkins`
创建打卡记录。

**请求体：**
```json
{
  "nodeId": 12,
  "tripId": 3,
  "photos": "[\"/uploads/1776xxxx-abc.jpg\", \"/uploads/1776xxxx-def.jpg\"]",
  "caption": "打卡莫高窟！"
}
```

**字段说明：**
- `photos`: **JSON 字符串**，存储图片 URL 数组（SQLite 无数组类型）
- `createdAt`: 后端自动填充为 `new Date().toISOString()`（若请求体未提供）

### `DELETE /api/checkins/:id`

---

## 6. 图片上传 (Upload)

### `POST /api/upload`
`Content-Type: multipart/form-data`

**字段：** `photos` (可多选，最多 9 张)

**限制：**
- 单文件最大 **5MB**
- 仅允许 `image/jpeg | image/png | image/webp | image/gif`
- 文件名：`{timestamp}-{random6}.ext`，存放到 `data/uploads/`

**响应：**
```json
{
  "urls": ["/uploads/1776790695089-2fu9zj.png", "/uploads/1776790695089-ryyw39.png"],
  "count": 2
}
```

**静态文件访问：**
- 通过 `GET /uploads/:filename` 直接获取（Express static 挂载）

---

## 7. 地图代理 (Map)

### `GET /api/map/static`
静态地图代理，返回 PNG。

**Query 参数：**
| 参数 | 必填 | 默认 | 说明 |
|------|------|------|------|
| `location` | ✓ | — | `lng,lat` |
| `zoom` | — | 13 | 1-17 |
| `size` | — | `750*400` | `宽*高` |
| `markers` | — | `large,0xc89630,A:{location}` | 高德 markers 语法 |

**响应：** `Content-Type: image/png`，缓存 7 天

### `GET /api/map/poi-search`
POI 关键字搜索（前端可直接调用，不用担心 Key 泄漏）。

**Query：** `keywords`, `city` (默认"敦煌"), `offset` (默认 10)

**响应：** `PoiItem[]`（详见 [04-amap-integration.md](./04-amap-integration.md)）

### `GET /api/map/weather`
天气预报查询。

**Query：** `adcode` (默认 `620982` 敦煌)

**响应：**
```json
{
  "city": "敦煌市",
  "adcode": "620982",
  "casts": [
    { "date": "2026-04-21", "dayweather": "多云", "nightweather": "多云", "daytemp": "22", "nighttemp": "7", ... }
  ]
}
```

---

## 8. AI 行程生成 (SSE)

### `POST /api/ai/generate-itinerary`
**Server-Sent Events** 流式响应。

**请求体：**
```json
{
  "destination": "敦煌",
  "days": 3,
  "preferences": ["必打卡景点", "美食体验"],
  "startDate": "2026-04-25"
}
```

**响应头：**
```
Content-Type: text/event-stream; charset=utf-8
Cache-Control: no-cache, no-transform
Connection: keep-alive
```

### SSE 事件类型

#### `status` — 进度提示
```json
{ "type": "status", "message": "调用 poi_search..." }
```

#### `node` — 生成的单个行程节点
```json
{
  "type": "node",
  "index": 0,
  "total": 9,
  "node": {
    "day": 1,
    "order": 0,
    "name": "莫高窟景区",
    "description": "世界文化遗产",
    "category": "景点",
    "time": "09:00",
    "duration": 240,
    "lat": 40.0419,
    "lng": 94.8092,
    "pitfallTip": "需提前预约"
  }
}
```

#### `done` — 生成完成
```json
{ "type": "done", "total": 9, "tripTitle": "敦煌2日精华游" }
```

#### `error` — 生成失败
```json
{ "type": "error", "message": "..." }
```

### 行为约定
- 每 15 秒发送 `: heartbeat` 保持连接
- 整体耗时约 30–120 秒（取决于模型响应速度和 Agent 迭代次数）
- 最多 8 轮 Agent 迭代（防止无限循环）
- 每个节点之间有 120ms 延时（便于前端动效展示）

前端实现见 `app/frontend/client/src/components/AddTripSheet.tsx`（`handleGenerate` 函数）。

---

## 路由清单速查

| # | 方法 | 路径 | 说明 |
|---|------|------|------|
| 1 | GET | `/api/health` | 健康检查 |
| 2 | GET | `/api/trips` | 行程列表 |
| 3 | POST | `/api/trips` | 创建行程 |
| 4 | GET | `/api/trips/:id` | 获取行程 |
| 5 | PATCH | `/api/trips/:id` | 更新行程 |
| 6 | DELETE | `/api/trips/:id` | 删除行程 |
| 7 | GET | `/api/trips/:tripId/nodes` | 节点列表 |
| 8 | POST | `/api/trips/:tripId/nodes` | 创建节点 |
| 9 | PATCH | `/api/nodes/:id` | 更新节点 |
| 10 | DELETE | `/api/nodes/:id` | 删除节点 |
| 11 | GET | `/api/profile` | 获取用户资料 |
| 12 | POST | `/api/profile` | 保存用户资料 |
| 13 | GET | `/api/checkins?tripId=x` | 打卡列表 |
| 14 | POST | `/api/checkins` | 创建打卡 |
| 15 | DELETE | `/api/checkins/:id` | 删除打卡 |
| 16 | POST | `/api/upload` | 图片上传 |
| 17 | GET | `/api/map/static` | 静态地图 |
| 18 | GET | `/api/map/poi-search` | POI 搜索 |
| 19 | GET | `/api/map/weather` | 天气查询 |
| 20 | POST | `/api/ai/generate-itinerary` | **SSE** AI 行程生成 |

---

## 测试结果

所有路由通过 `scripts/test-api.ts` 和 `scripts/test-ai-sse.ts` 验证。
完整测试记录：[`contracts/phase2-api-test-results.json`](./contracts/phase2-api-test-results.json)
