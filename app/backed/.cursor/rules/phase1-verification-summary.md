# Phase 1 验证汇总 — 数据契约与开发规范

> 验证日期: 2026-04-21
> 所有验证脚本位于 `scripts/` 目录

---

## 1. 环境变量 (.env)

```
DEEPSEEK_API_KEY=<your_deepseek_api_key>
AMAP_KEY=<your_amap_key>
```

- `DEEPSEEK_API_KEY`: DeepSeek Chat API（deepseek-chat 模型）
- `AMAP_KEY`: 高德地图 Web 服务 API（Service Key，绑定 Web服务）

---

## 2. 高德地图 API 数据契约

详细响应见 `amap-api-responses.json`

### 2.1 地理编码 `/v3/geocode/geo`
- **注意**: 地理编码可能返回同名 POI 的错误城市结果（如深圳的"莫高窟"）
- **建议**: 优先使用 POI 搜索获取景点坐标，而非地理编码

### 2.2 POI 关键字搜索 `/v3/place/text`
- 核心字段: `name`, `location`(lng,lat), `address`, `type`, `tel`, `biz_ext.rating`, `biz_ext.open_time`, `photos[].url`
- `location` 格式为 `"lng,lat"` 字符串，需解析为数字
- `extensions=all` 返回完整信息含照片和评分

### 2.3 POI 周边搜索 `/v3/place/around`
- 入参: `location=lng,lat`，`radius=3000`（米）
- 返回含 `distance` 字段（单位米）

### 2.4 驾车路线规划 `/v5/direction/driving`
- 入参: `origin=lng,lat`，`destination=lng,lat`
- 返回: `route.paths[0].distance`（米），`route.taxi_cost`（元）
- 每个 step: `instruction`, `road_name`, `step_distance`, `orientation`

### 2.5 天气查询 `/v3/weather/weatherInfo`
- 敦煌 adcode: `620982`
- `extensions=base`: 实况天气 → `lives[0]`
- `extensions=all`: 预报天气 → `forecasts[0].casts[]`
- cast 字段: `date`, `dayweather`, `nightweather`, `daytemp`, `nighttemp`

### 2.6 静态地图 `/v3/staticmap`
- 返回 `image/png`
- 参数: `location`, `zoom`, `size=750*400`, `scale=2`, `markers=large,0xc89630,A:lng,lat`
- 多标记点用 `|` 分隔

---

## 3. DeepSeek 模型能力契约

详细数据见 `deepseek-capabilities.json`

### 3.1 基础对话
- 模型: `deepseek-chat`
- 支持 SystemMessage + HumanMessage
- token 用量在 `response.usage_metadata` 中

### 3.2 Tool Calling
- `model.bindTools(tools)` 后 invoke
- 返回 `response.tool_calls[]`，每个含 `name`, `args`, `id`
- 模型会在 `content` 中说明意图，同时触发工具调用

### 3.3 结构化输出
- `model.withStructuredOutput(zodSchema)` 直接返回 JS 对象
- 支持 `z.enum`、嵌套对象、数组等复杂类型
- **无需额外解析JSON**

---

## 4. Drizzle + SQLite 数据模型契约

详细数据见 `drizzle-db-schema.json`

### 4.1 表结构
| 表名 | 关键字段 |
|------|---------|
| `trips` | id, title, destination, start_date, end_date, cover_emoji, status, total_days |
| `nodes` | id, trip_id, name, description, scheduled_time, duration, lat, lng, status, order, category, pitfall_tip, ticket_info, day |
| `user_profile` | id, nickname, avatar, total_trips, total_cities, onboarding_done |
| `checkins` | id, node_id, trip_id, photos(JSON), caption, created_at |

### 4.2 Drizzle 同步 API 注意事项
- better-sqlite3 驱动下，`.returning()` 需追加 `.all()` 获取数组
- 不支持解构赋值 `const [row] = db.insert(...).returning()` → 需写为 `.returning().all()[0]`
- `.run()` 用于无返回值操作（如 delete）
- Zod schema 通过 `createInsertSchema(table).omit({ id: true })` 生成

---

## 5. Agent Pipeline 契约

详细数据见 `agent-pipeline.json`

### 5.1 工具链
| 工具名 | 入参 | 出参 |
|--------|------|------|
| `poi_search` | keywords, city, offset? | POI[] { name, address, location, type, rating, openTime } |
| `get_weather` | adcode | { city, casts[] } |
| `route_plan` | origin, destination | { distance, taxi_cost, steps_count } |

### 5.2 Agent 行为特征
- 平均迭代次数: 7 轮
- 调用顺序: 天气 → POI搜索(多次) → 路线规划 → 最终总结
- 模型会自动组合多次工具调用结果
- 最终输出可通过 `withStructuredOutput()` 转为结构化节点

### 5.3 结构化节点 Schema
```typescript
z.object({
  tripTitle: z.string(),
  destination: z.string(),
  totalDays: z.number(),
  nodes: z.array(z.object({
    day: z.number(),
    order: z.number(),
    name: z.string(),
    description: z.string(),
    category: z.enum(["景点", "餐饮", "住宿", "交通"]),
    time: z.string(),    // "HH:mm"
    duration: z.number(), // 分钟
    lat: z.number(),
    lng: z.number(),
    pitfallTip: z.string(),
  })),
})
```

---

## 6. 上传与静态地图代理契约

详细数据见 `upload-staticmap.json`

### 6.1 multer 上传
- 端点: `POST /api/upload`，字段名 `photos`，最多 9 张
- 文件名: `{timestamp}-{random}.{ext}`
- 限制: 5MB，仅 jpeg/png/webp/gif
- 返回: `{ urls: string[], count: number }`

### 6.2 静态地图代理
- 端点: `GET /api/map/static?location=lng,lat&zoom=14`
- 代理高德静态地图 API，返回 `image/png`
- 避免前端暴露 AMAP_KEY

---

## 7. 环境隔离规则

| 模块 | 隔离策略 | 实现方式 |
|------|---------|---------|
| 高德 API | 无需隔离 | 无状态 HTTP 调用 |
| DeepSeek | 无需隔离 | 无状态 HTTP 调用 |
| LangChain Agent | 无需隔离 | 组合层，无自身持久状态 |
| SQLite DB | **需要隔离** | 测试用 `data/test-verify.db`，正式用 `data/sqlite.db` |
| 文件上传 | **需要隔离** | 测试用 `data/test-uploads/`，正式用 `data/uploads/` |

---

## 8. Phase 2 关键约束（基于验证发现）

1. **POI 搜索优于地理编码**：获取景点坐标应使用 `/v3/place/text` 而非 `/v3/geocode/geo`
2. **坐标格式统一**: 高德返回 `"lng,lat"` 字符串，存储时转为 `lat: number, lng: number`
3. **Drizzle 返回值**: better-sqlite3 下 `returning()` 需追加 `.all()` 才能获取数组
4. **Agent 迭代上限**: 设置 `MAX_ITERATIONS = 8` 防止无限循环
5. **SSE 流式输出**: Agent 每轮迭代可推送一个 SSE event 给前端
6. **静态地图代理**: 通过后端代理避免前端暴露 AMAP_KEY
