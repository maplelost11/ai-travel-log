# 03. 数据模型

> Schema 定义位置：[`shared/schema.ts`](../shared/schema.ts)
> 数据库类型：SQLite（通过 better-sqlite3 + Drizzle ORM）
> 验证结果：[`contracts/drizzle-db-schema.json`](./contracts/drizzle-db-schema.json)

---

## 实体关系

```mermaid
erDiagram
    USER_PROFILE ||..o{ TRIPS : "owns (implicit single-user)"
    TRIPS ||--o{ NODES : "has many"
    TRIPS ||--o{ CHECKINS : "has many"
    NODES ||--o{ CHECKINS : "checked at"

    USER_PROFILE {
      int id PK
      string nickname
      string avatar
      int total_trips
      int total_cities
      int onboarding_done
    }

    TRIPS {
      int id PK
      string title
      string destination
      string start_date
      string end_date
      string cover_emoji
      string status
      int total_days
    }

    NODES {
      int id PK
      int trip_id FK
      string name
      string description
      string scheduled_time
      int duration
      real lat
      real lng
      string status
      int order
      string category
      string pitfall_tip
      string ticket_info
      int day
    }

    CHECKINS {
      int id PK
      int node_id FK
      int trip_id FK
      string photos_json
      string caption
      string created_at
    }
```

---

## 1. `trips` — 旅行计划

| 字段 | SQL 类型 | 必填 | 默认 | 说明 |
|------|----------|------|------|------|
| `id` | INTEGER PK AUTOINCREMENT | — | — | 主键 |
| `title` | TEXT NOT NULL | ✓ | — | 行程标题 |
| `destination` | TEXT NOT NULL | — | `"敦煌"` | 目的地 |
| `start_date` | TEXT NOT NULL | ✓ | — | `YYYY-MM-DD` |
| `end_date` | TEXT NOT NULL | ✓ | — | `YYYY-MM-DD` |
| `cover_emoji` | TEXT | — | `"🏜️"` | 封面 emoji |
| `status` | TEXT NOT NULL | — | `"planning"` | `planning` / `active` / `completed` |
| `total_days` | INTEGER | — | 3 | 总天数 |

**TypeScript 类型：**
```typescript
type Trip = {
  id: number;
  title: string;
  destination: string;
  startDate: string;       // 下划线字段映射为驼峰
  endDate: string;
  coverEmoji: string | null;
  status: string;
  totalDays: number | null;
};
```

---

## 2. `nodes` — 行程节点

| 字段 | SQL 类型 | 必填 | 默认 | 说明 |
|------|----------|------|------|------|
| `id` | INTEGER PK AUTOINCREMENT | — | — | 主键 |
| `trip_id` | INTEGER NOT NULL | ✓ | — | 外键 → trips.id（应用层约束） |
| `name` | TEXT NOT NULL | ✓ | — | 地点名称 |
| `description` | TEXT | — | `""` | 简介 |
| `scheduled_time` | TEXT | — | `""` | 计划到达时间 `HH:mm` |
| `duration` | INTEGER | — | 120 | 停留时长（分钟） |
| `lat` | REAL | — | 40.1416 | 纬度 |
| `lng` | REAL | — | 94.6624 | 经度 |
| `status` | TEXT NOT NULL | — | `"pending"` | `pending` / `active` / `done` / `skipped` |
| `order` | INTEGER NOT NULL | — | 0 | 当天内排序（需要引号：SQL 关键字） |
| `category` | TEXT | — | `"景点"` | `景点` / `餐饮` / `住宿` / `交通` |
| `pitfall_tip` | TEXT | — | `""` | 避坑提示 |
| `ticket_info` | TEXT | — | `""` | 门票信息 |
| `day` | INTEGER | — | 1 | 第几天 |

**索引：**
- `idx_nodes_trip_id` on `trip_id`

**默认坐标：** `(40.1416, 94.6624)` — 敦煌市中心

---

## 3. `user_profile` — 用户资料（单用户）

| 字段 | SQL 类型 | 默认 | 说明 |
|------|----------|------|------|
| `id` | INTEGER PK AUTOINCREMENT | — | 单条记录 |
| `nickname` | TEXT | `"旅行者"` | 昵称 |
| `avatar` | TEXT | `"🧭"` | emoji 头像 |
| `total_trips` | INTEGER | 0 | 完成旅程数 |
| `total_cities` | INTEGER | 0 | 去过城市数 |
| `onboarding_done` | INTEGER | 0 | 0/1 布尔值（SQLite 无 bool） |

**业务约束：** `POST /api/profile` 做 upsert 逻辑，不会出现多条记录。

---

## 4. `checkins` — 打卡记录

| 字段 | SQL 类型 | 必填 | 默认 | 说明 |
|------|----------|------|------|------|
| `id` | INTEGER PK AUTOINCREMENT | — | — | 主键 |
| `node_id` | INTEGER NOT NULL | ✓ | — | 外键 → nodes.id |
| `trip_id` | INTEGER NOT NULL | ✓ | — | 外键 → trips.id |
| `photos` | TEXT | — | `"[]"` | **JSON 字符串**，图片 URL 数组 |
| `caption` | TEXT | — | `""` | 打卡文案 |
| `created_at` | TEXT NOT NULL | ✓ | — | ISO 8601 时间戳 |

**索引：**
- `idx_checkins_trip_id` on `trip_id`
- `idx_checkins_node_id` on `node_id`

**应用层约定：**
- `photos` 字段读写前需 `JSON.parse` / `JSON.stringify`
- 典型值：`'["/uploads/1776xxxx-abc.jpg","/uploads/1776yyyy-def.jpg"]'`

---

## Zod Schema

所有表自动生成 `insertXxxSchema` 用于写入前校验：

```typescript
import { insertTripSchema, insertNodeSchema, insertUserProfileSchema, insertCheckinSchema } from "shared/schema";

// 完整校验（POST）
insertTripSchema.parse(body);

// 部分更新（PATCH）
insertTripSchema.partial().parse(body);
```

**TypeScript 类型对应：**
```typescript
type InsertTrip = z.infer<typeof insertTripSchema>;
type Trip = typeof trips.$inferSelect;
```

---

## 字段命名规范

| 数据库 (snake_case) | TypeScript (camelCase) |
|---------------------|------------------------|
| `trip_id` | `tripId` |
| `start_date` | `startDate` |
| `cover_emoji` | `coverEmoji` |
| `total_days` | `totalDays` |
| `scheduled_time` | `scheduledTime` |
| `pitfall_tip` | `pitfallTip` |
| `ticket_info` | `ticketInfo` |
| `onboarding_done` | `onboardingDone` |
| `created_at` | `createdAt` |

Drizzle 在 schema 中已声明列名映射，应用代码始终使用驼峰命名。

---

## 级联删除约束

SQLite 原生 ON DELETE CASCADE 未启用；改为应用层保证一致性：

| 操作 | 级联行为（`storage.ts` 实现） |
|------|-------------------------------|
| `deleteTrip(id)` | 先删除关联的 `nodes` 和 `checkins`，再删除 `trips` |
| `deleteNode(id)` | 先删除关联的 `checkins`，再删除 `nodes` |

---

## 数据库文件约定

| 文件 | 用途 |
|------|------|
| `data/sqlite.db` | 正式运行数据（`initDb()` 自动建表） |
| `data/test-verify.db` | P1 验证脚本专用（脚本运行后自动清理） |
| `migrations/` | Drizzle Kit 迁移文件（`npm run db:push` 生成） |

WAL 模式已在 `server/db.ts` 中启用：`pragma journal_mode = WAL`
