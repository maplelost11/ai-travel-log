# 07 · 前后端对齐报告（Phase 3）

> 生成日期：2026-04-21  
> 最近更新：2026-04-21（B 组全部关闭：打卡 + 海报 + 天气 + 节点编辑 + POI 手动添加 + 旅程编辑）  
> 范围：基于已完成的 Phase 1（契约验证）、Phase 2（后端构建）产物，审计前端 `app/frontend` 对接现状。  
> 原则：**以后端功能为准；前后端不一致时不强行补齐，先用占位提示，等后续补充。**

---

## 总览

| 分组 | 含义 | 条目数 | 处理方式 |
|---|---|---|---|
| A | 前端已调用、后端已实现 | 20 | 直接联调 ✅ |
| B | 后端已实现、前端未使用 | 0 | 全部关闭 🎉 |
| C | 前端有 UI 入口、后端无对应能力 | 5 | 加 toast 占位 🔴 |
| D | 工程配置问题 | 5 | 已修复 🛠 |

HTTP 契约冒烟：**10/10 通过** + **打卡 e2e** + **节点编辑 e2e** + **POI 添加节点 / 旅程编辑 e2e** 全部通过（见文末）。

---

## A · 完全对齐（可直接联调）

| 前端调用点 | HTTP | 后端路由 | 说明 |
|---|---|---|---|
| `Onboarding.handleStart` | `POST /api/profile` | ✓ `routes.ts:104` | upsert；字段 `nickname/avatar/onboardingDone` 一致 |
| `Main` useQuery trips | `GET /api/trips` | ✓ `routes.ts:30` | 列表 |
| `Main` useQuery profile | `GET /api/profile` | ✓ `routes.ts:99` | 无 profile 时返回 `null` |
| `Main` deleteTrip | `DELETE /api/trips/:id` | ✓ `routes.ts:60` | 级联删 nodes/checkins |
| `AddTripSheet.createTrip` | `POST /api/trips` | ✓ `routes.ts:40` | 字段 `title/destination/startDate/endDate/coverEmoji/status/totalDays` 完全一致 |
| `AddTripSheet.createNode` | `POST /api/trips/:tripId/nodes` | ✓ `routes.ts:70` | 前端会额外传 `time`（AI 生成字段），zod 自动 strip 掉，安全 |
| `AddTripSheet.handleGenerate` | `POST /api/ai/generate-itinerary` (SSE) | ✓ `routes.ts:176` | 事件协议 `node`/`done`/`status`/`error` 一致；前端用 `node`+`done` |
| `TripDetail` useQuery trip | `GET /api/trips/:id` | ✓ `routes.ts:34` | 详情 |
| `TripDetail` useQuery nodes | `GET /api/trips/:tripId/nodes` | ✓ `routes.ts:66` | 节点列表 |
| `TripDetail.updateNode` | `PATCH /api/nodes/:id` | ✓ `routes.ts:82` | 状态切换 `pending/active/done/skipped` |
| `TripDetail` useQuery checkins | `GET /api/checkins?tripId=` | ✓ `routes.ts:114` | **NEW** · 节点详情显示已有打卡胶囊 |
| `TripDetail` useQuery weather | `GET /api/map/weather?adcode=` | ✓ `routes.ts:157` | **NEW** · 顶部天气卡片（今日+明日） |
| `CheckInSheet.submit` (上传) | `POST /api/upload` (multipart) | ✓ `routes.ts:137` | **NEW** · 多图上传，返回 `{urls[]}` |
| `CheckInSheet.submit` (打卡) | `POST /api/checkins` | ✓ `routes.ts:119` | **NEW** · 字段 `nodeId/tripId/photos/caption/createdAt` 一致 |
| `PosterSheet.delete` | `DELETE /api/checkins/:id` | ✓ `routes.ts:131` | **NEW** · 海报态可删除 |
| `PosterSheet` 背景图 | `GET /api/map/static?location=...&markers=...` | ✓ `routes.ts:150` | **NEW** · 静态地图 PNG（后端代理高德签名） |
| `NodeEditSheet.save` | `PATCH /api/nodes/:id` | ✓ `routes.ts:82` | **NEW** · 节点自由编辑（名称/时间/时长/分类/天数/状态/描述/避坑） |
| `NodeEditSheet.delete` | `DELETE /api/nodes/:id` | ✓ `routes.ts:89` | **NEW** · 节点删除入口（原 B 组） |
| `AddNodeSheet.search` | `GET /api/map/poi-search` | ✓ `routes.ts:167` | **NEW** · POI 搜索 + 关键字建议词 |
| `AddNodeSheet.create` | `POST /api/trips/:tripId/nodes` | ✓ `routes.ts:70` | **NEW** · 手动添加节点（自动推算 order / 继承 POI 坐标） |
| `TripEditSheet.save` | `PATCH /api/trips/:id` | ✓ `routes.ts:49` | **NEW** · 旅程元信息编辑（标题 / 目的地 / 封面 / 起始日期 / 天数 / 状态） |
| `TripEditSheet.delete` | `DELETE /api/trips/:id` | ✓ `routes.ts:60` | **NEW** · 详情页内便捷删除入口 |

### AI SSE 事件契约（双向确认）

```
data: { type: "status", message: "正在调研目的地..." }
data: { type: "node", node: GeneratedNode, index: 0, total: 8 }
data: { type: "done", total: 8, tripTitle: "..." }
data: { type: "error", message: "..." }
```

`GeneratedNode` 字段：`{ day, order, name, description, category, time, duration, lat, lng, pitfallTip }`，与前端 `AddTripSheet.GeneratedNode` interface 完全一致。

### 📸 地图打卡 + 海报分享链路（本次新增）

**核心用户故事**：在节点详情点击 `📸 打卡` → 选图/写备注 → 自动上传并创建 checkin → 跳转海报预览（含静态地图、照片九宫格、昵称、日期水印）→ 一键保存 PNG 到本地。

**组件文件**：

- `app/frontend/client/src/components/CheckInSheet.tsx` — 打卡表单 + 上传 + 提交，支持"已有打卡直接进入海报态"
- `app/frontend/client/src/components/PosterSheet.tsx` — 海报渲染 + `html2canvas` 2x 导出 + 删除
- `app/frontend/client/src/pages/TripDetail.tsx` — 节点胶囊入口、天气卡片、Sheet 挂载

**新增前端依赖**：`html2canvas`（海报截图）。

---

## B · 后端已就绪、前端未使用

> 🎉 **已全部关闭**。三批接入：核心打卡链路、节点自由编辑、POI 手动添加 + 旅程元信息编辑。

### ✅ 已从 B 组转入 A 组（2026-04-21）

| 后端能力 | 路由 | 前端入口 | 所属批次 |
|---|---|---|---|
| ~~打卡列表~~ | `GET /api/checkins?tripId=` | `TripDetail` 节点胶囊 | ① 打卡核心 |
| ~~创建打卡~~ | `POST /api/checkins` | `CheckInSheet` | ① |
| ~~删除打卡~~ | `DELETE /api/checkins/:id` | `PosterSheet` | ① |
| ~~图片上传~~ | `POST /api/upload` | `CheckInSheet` | ① |
| ~~静态地图~~ | `GET /api/map/static` | `PosterSheet` 背景 | ① |
| ~~天气查询~~ | `GET /api/map/weather` | `TripDetail` 顶部卡片 | ① |
| ~~节点编辑~~ | `PATCH /api/nodes/:id`（全字段） | `NodeEditSheet` | ② 节点编辑 |
| ~~删节点~~ | `DELETE /api/nodes/:id` | `NodeEditSheet` 底栏 | ② |
| ~~POI 搜索~~ | `GET /api/map/poi-search` | `AddNodeSheet` | ③ 添加 & 编辑 |
| ~~编辑旅程~~ | `PATCH /api/trips/:id` | `TripEditSheet` | ③ |

---

## C · 前端 UI 存在、后端无对应能力（已加 toast 占位）

| 位置 | 元素 | 原行为 | 本次改动 |
|---|---|---|---|
| `Main.tsx` 个人中心 | ⭐ 收藏的路线 | 无 onClick | `toast({title:"功能暂未实现",description:"收藏路线·后续补充中"})` |
| `Main.tsx` 个人中心 | 📸 旅行动线图·导出 | 无 onClick | toast |
| `Main.tsx` 个人中心 | 🔔 莫高窟票务提醒 | 无 onClick | toast |
| `Main.tsx` 个人中心 | 💬 关于·反馈 | 无 onClick | toast |
| `TripDetail.tsx` 底部 | 📍 定位按钮 | 硬编码 alert 文本 | toast "GPS 实时定位·后续补充中" |

> **决策建议**：这些功能需要后端建新模型（收藏表、提醒任务、反馈表、GPS 打点表），待需求明确后再规划。

---

## D · 工程性问题（已修复，让 Phase 3 能跑起来）

| # | 问题 | 修复 |
|---|---|---|
| D1 | `frontend/package.json` 的 `dev/build/start` 仍指向旧 monorepo 的 `server/index.ts` | 改为 `vite`/`vite build`/`vite preview` |
| D2 | `queryClient.ts` 用 `__PORT_5000__` 模板占位，生产不可用 | 改为 `import.meta.env.VITE_API_BASE`，导出为共享常量 |
| D3 | `AddTripSheet.tsx` 自行读 `window.__PORT_5000__` | 统一复用 `API_BASE` 导入 |
| D4 | 前端没有环境变量文件 | 新增 `.env.development`（`VITE_API_BASE=http://localhost:5000`）和 `.env.example` |
| D5 | 后端 CORS 需允许 5173 源 + credentials | 已在 `server/index.ts` 反射 `Origin`（ACAO=origin, ACAC=true），已验证 |

---

## HTTP 契约冒烟测试

### 1) 基础契约（10/10）

位置：`app/backed/scripts/phase3-smoke.ts`  
运行：`cd app/backed && npx tsx scripts/phase3-smoke.ts`

模拟前端发起的完整链路，不依赖浏览器，也不启 LLM（避免成本）：

```
╔═══════════════════════════════════╗
║   Phase 3 前后端契约冒烟测试结果    ║
╚═══════════════════════════════════╝

  [✓] PASS GET /api/health                          uptime=6316.6s
  [✓] PASS POST /api/profile                        nickname=敦煌探客
  [✓] PASS GET /api/trips                           current=0
  [✓] PASS POST /api/trips                          id=2 title=Phase3 冒烟行程
  [✓] PASS POST /api/trips/:tripId/nodes × 3        ids=2,3,4
  [✓] PASS GET /api/trips/:id                       title=Phase3 冒烟行程
  [✓] PASS GET /api/trips/:tripId/nodes             count=3
  [✓] PASS PATCH /api/nodes/:id                     status=active
  [✓] PASS DELETE /api/trips/:id (cascade)          final count=0, initial=0
  [✓] PASS CORS preflight                           ACAO=http://localhost:5173

  合计：10/10 通过
```

### 3) 节点编辑 e2e

位置：`app/backed/scripts/verify-node-edit.ts`  
覆盖：创建 → 多字段 PATCH（name / scheduledTime / duration / status / day / 坐标 / 描述 / 避坑）→ 空 diff PATCH（幂等处理）→ DELETE。

关键修复：`PATCH /api/nodes/:id` 对**空 body**会触发 Drizzle `No values to set` 500。已在 `routes.ts` 手动短路：

```ts
if (Object.keys(partial).length === 0) {
  // 空 diff 视为幂等查询
  return res.json(await storage.getNode(Number(req.params.id)));
}
```

### 4) POI 添加节点 + 旅程编辑 e2e（本次新增）

位置：`app/backed/scripts/verify-add-node-flow.ts`  
覆盖：拉取 trip → POI 搜索 → 用 POI 坐标 `POST node`（自动 order）→ `PATCH trip`（coverEmoji + status）→ 回滚 → `DELETE node`。

```
STEP 1 拉取已有旅程
  ✔ trip { id: 3, title: '敦煌探索之旅', destination: '敦煌' }
STEP 2 POI 搜索: "博物馆" in 敦煌
  ✔ 返回 3 个 POI
    - 敦煌博物馆 (94.662, 40.129)
    - 敦煌世界地质公园博物馆 (93.240, 40.511)
    - 月牙泉/博物馆 (94.680, 40.141)
STEP 3 基于选中的 POI 创建节点
  ✔ created node { id: 18, order: 3, lat: 40.129241 }
STEP 4 编辑旅程（PATCH）— 只改 coverEmoji/status
  ✔ patched { coverEmoji: '🧭', status: 'active' }
STEP 5 回滚 trip 修改
  ✔ 已回滚 coverEmoji/status
STEP 6 删除 E2E 测试节点
  ✔ deleted
DONE ✅ 全部通过
```

### 2) 打卡 + 海报链路 e2e

位置：`app/backed/scripts/phase3-checkin-e2e.ts`  
运行：`cd app/backed && npx tsx scripts/phase3-checkin-e2e.ts`

完整跑通 **拉取 trip/node → 上传图片 → 创建 checkin → 列表 → 天气 → 静态地图 → 删除** 七步链路：

```
===== upload =====
{ "urls": ["/uploads/1776794142323-2dmklj.png",
           "/uploads/1776794142325-j30x21.png"], "count": 2 }

===== checkin created =====
{ "id": 3, "nodeId": 5, "tripId": 3,
  "photos": "[\"/uploads/...png\",\"/uploads/...png\"]",
  "caption": "测试打卡 · e2e · 01:55:42",
  "createdAt": "2026-04-21T17:55:42.337Z" }

===== weather (620982) =====
{ "city": "敦煌市",
  "todayCast": { "date": "2026-04-22", "dayweather": "晴",
                 "nighttemp": "7", "daytemp": "26" } }

===== static map =====
{ "status": 200, "contentType": "image/png", "bytes": 23086 }

===== delete =====
{ "status": 204 }

✅ 打卡链路 e2e 全部通过
```

**AI SSE 行程生成**：未纳入冒烟（会真实调用 DeepSeek，耗时且有成本）。已在 Phase 1 `scripts/verify-agent.ts` 与 Phase 2 `scripts/test-ai-sse.ts` 中充分验证。

---

## 本地启动说明

```bash
# 终端 1：启动后端
cd app/backed
npm run dev                 # http://localhost:5000

# 终端 2：启动前端
cd app/frontend
npm run dev                 # http://localhost:5173
```

首次启动前，确保：
- `app/backed/.env` 已配置 `DEEPSEEK_API_KEY` 和 `AMAP_KEY`（见 `.env.example`）
- `app/frontend/.env.development` 的 `VITE_API_BASE` 指向后端（默认 5000）

---

## 后续里程碑建议

| 优先级 | 任务 | 预计范围 |
|---|---|---|
| ~~⭐⭐⭐~~ | ~~接入 B 组打卡链路（upload + checkins + static map）~~ | ✅ **2026-04-21 完成** |
| ~~⭐⭐~~ | ~~节点详情补天气~~ | ✅ **2026-04-21 完成** |
| ~~⭐⭐~~ | ~~节点自由编辑 + 删除~~ | ✅ **2026-04-21 完成**（`NodeEditSheet`） |
| ~~⭐⭐~~ | ~~POI 搜索 + 手动添加节点页~~ | ✅ **2026-04-21 完成**（`AddNodeSheet`） |
| ~~⭐⭐~~ | ~~旅程编辑（标题/目的地/日期/封面/状态）~~ | ✅ **2026-04-21 完成**（`TripEditSheet`，标题旁 ✏️ 入口） |
| ⭐ | 节点右滑删除（手势） | 已有 `NodeEditSheet` 删除按钮，右滑仅作可选增强 |
| ⭐ | 补齐 C 组（收藏/提醒/反馈） | 需要先设计新后端模型 |
| ⭐ | 动态 adcode 天气（目前硬编码敦煌 620982） | `Trip` 表加 `adcode` 字段 + 生成时写入 |
| ⭐ | 地图节点可拖拽调整坐标 | 基于现有 PATCH 扩展；需要在 `MapCanvas` 上引入 pointer 事件 |
| ⭐ | 生产部署（PM2 + Nginx） | 见 `06-environment-setup.md` |

---

## 变更日志

### 2026-04-21 · B 组全量关闭（第三批：POI 搜索 + 旅程编辑）

**新增前端代码**：

- `client/src/components/AddNodeSheet.tsx` — POI 搜索两步走（搜索 → 填详情），按 POI type 智能推断分类（🍜/🏨/🚗/📍），选定天数后自动算 `order = max(order) + 1`；自带关键字建议词（博物馆 / 咖啡 / 鸣沙山 / 夜市）。
- `client/src/components/TripEditSheet.tsx` — 旅程元信息编辑：10 个 emoji 预设封面、标题 / 目的地 / 起始日期 / 天数 / 状态；改 `totalDays` 或 `startDate` 时自动重算 `endDate`；内置二次确认的"删除旅程"。
- `client/src/pages/TripDetail.tsx`：
  - 顶部标题改为 `button`，右上角 ✏️ 指示，点击触发 `TripEditSheet`。
  - 底部操作栏左侧新增"＋"大按钮触发 `AddNodeSheet`，默认落到当前 `activeDay`。
  - 现有 nodes 透传给 `AddNodeSheet` 用于 order 推算。

**新增后端脚本**：

- `scripts/verify-add-node-flow.ts` — POI → 创建节点 → PATCH 旅程 → 回滚 → 删节点，6 步 e2e。

**B 组状态**：0 / 10 剩余，全部关闭 🎉。

---

### 2026-04-21 · B 组第二批（节点自由编辑）

**新增前端代码**：

- `client/src/components/NodeEditSheet.tsx` — 表单支持 name / scheduledTime / duration / category / day / status / description / pitfallTip 全字段编辑，diff-aware 提交（仅发送真实变更）；底栏含删除（二次确认）。
- `client/src/pages/TripDetail.tsx`：`NodeItem` 内新增 `✏️ 编辑` 动作按钮。

**后端修复**：

- `routes.ts` 对 `PATCH /api/nodes/:id` 的空 body 短路处理（返回当前节点），避免 Drizzle 抛 `No values to set`。

**新增后端脚本**：

- `scripts/verify-node-edit.ts`（4 步 PATCH + 空 diff 幂等 + DELETE）

---

### 2026-04-21 · B 组第一批（打卡 + 海报 + 天气）

**新增前端代码**：

- `client/src/components/CheckInSheet.tsx`（216 行）
- `client/src/components/PosterSheet.tsx`（235 行）
- `client/src/pages/TripDetail.tsx` 增强：weather query、checkin query、节点打卡按钮、打卡胶囊、Sheet 挂载

**新增后端脚本**：

- `scripts/phase3-checkin-e2e.ts`（e2e 冒烟）

**新增依赖**：

- 前端：`html2canvas`
