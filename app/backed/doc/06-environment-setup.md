# 06. 环境配置与部署指南

---

## 环境变量

项目根目录的 `.env` 文件：

| 变量 | 必填 | 默认 | 说明 |
|------|------|------|------|
| `DEEPSEEK_API_KEY` | ✓ | — | DeepSeek Chat API Key |
| `AMAP_KEY` | ✓ | — | 高德 Web 服务 Key |
| `PORT` | — | 5000 | 后端监听端口 |
| `DB_PATH` | — | `data/sqlite.db` | SQLite 文件路径 |
| `UPLOAD_DIR` | — | `data/uploads` | 上传图片目录 |
| `SESSION_SECRET` | — | `dev-secret-change-me` | Session 加密密钥（生产必改） |

### `.env.example` 模板
```
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
AMAP_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
PORT=5000
SESSION_SECRET=change-this-to-a-random-string
```

### 获取 Key
- **DeepSeek**：[https://platform.deepseek.com/api_keys](https://platform.deepseek.com/api_keys)
- **高德**：[https://console.amap.com/dev/key/app](https://console.amap.com/dev/key/app)
  - 创建应用时选择 **"Web服务"** 类型
  - 使用控制台中的 **Key** 列，非"安全密钥"

---

## 本地开发

### 前置要求
- Node.js 20+
- npm 10+
- Windows / macOS / Linux 均可（`better-sqlite3` 会自动编译）

### 启动步骤
```bash
cd app/backed

npm install --registry https://registry.npmmirror.com   # 国内用镜像源

cp .env.example .env   # 填入真实 Key

npm run dev   # tsx watch 热重载
```

启动成功日志：
```
[db] initialized at D:\...\data\sqlite.db
[server] listening on http://localhost:5000
[server] uploads dir: D:\...\data\uploads
```

### 验证启动
```bash
curl http://localhost:5000/api/health
# {"ok":true,"uptime":1.2,"now":"2026-04-21T..."}
```

---

## 运行验证脚本

Phase 1 验证各模块：

```bash
npm run verify:amap       # 高德 6 个 API
npm run verify:deepseek   # DeepSeek 对话/工具调用/结构化
npm run verify:db         # Drizzle CRUD
npm run verify:upload     # multer + 地图代理
npm run verify:agent      # 端到端 Agent 流水线（较慢，~2分钟）
npm run verify:all        # 顺序执行前 5 个
```

Phase 2 接口测试（需先 `npm run dev`）：

```bash
# 另开终端
npx tsx scripts/test-api.ts      # 全量 REST 接口测试
npx tsx scripts/test-ai-sse.ts   # SSE 行程生成测试
```

---

## 目录隔离规则

| 目录 | 用途 | 是否隔离 |
|------|------|---------|
| `data/sqlite.db` | 正式数据库 | — |
| `data/uploads/` | 正式上传文件 | — |
| `data/test-verify.db` | `verify-db.ts` 用 | ✓ 脚本运行后自动清理 |
| `data/test-uploads/` | `verify-upload.ts` 用 | ✓ 脚本运行后自动清理 |
| `data/test-staticmap.png` | `verify-amap.ts` 产物 | — 可手动删除 |

**如何重置数据库？** 停止服务后删除 `data/sqlite.db`，下次启动会自动重建空表。

---

## 生产构建与部署

### 1. 构建
```bash
npm run build
```
输出：`dist/index.cjs`（含所有依赖，除 `better-sqlite3` native 模块）

### 2. 启动
```bash
NODE_ENV=production \
PORT=80 \
DEEPSEEK_API_KEY=xxx \
AMAP_KEY=xxx \
SESSION_SECRET=$(openssl rand -hex 32) \
node dist/index.cjs
```

### 3. 进程守护（推荐 PM2）
```bash
npm i -g pm2
pm2 start dist/index.cjs --name ai-travel-backend
pm2 save
```

### 4. 反向代理（nginx 示例）
```nginx
server {
  listen 443 ssl http2;
  server_name your-domain.com;

  # 静态上传文件
  location /uploads/ {
    proxy_pass http://127.0.0.1:5000;
  }

  # API 与 SSE
  location /api/ {
    proxy_pass http://127.0.0.1:5000;
    proxy_http_version 1.1;
    proxy_set_header Connection "";        # SSE 必需
    proxy_buffering off;                   # SSE 必需
    proxy_read_timeout 300s;               # 允许长连接
  }
}
```

**SSE 关键配置：** `proxy_buffering off` + 足够的 `proxy_read_timeout`。

---

## 前后端联调

### 开发模式
前端 Vite 开发服务器（见 `app/frontend`）通常在 `:5173`，需要：
1. 后端已允许 CORS（`server/index.ts` 已配置）
2. 前端 `queryClient.ts` 中的 `API_BASE` 指向后端地址
   ```typescript
   const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";
   ```
   开发阶段可改为 `"http://localhost:5000"`

### 生产模式
方案 A：前后端同域部署（推荐）
- 前端 `npm run build` 输出到 `dist/`
- 后端新增 `app.use(express.static("path/to/frontend/dist"))`
- 所有路径同域，无跨域

方案 B：分离部署
- 前端 CDN 部署
- 后端 API 域名独立
- 前端环境变量注入后端地址

---

## 常见问题排查

### Q1: `npm install` 报 `EPERM` 或 `ECONNRESET`
**原因**：Windows 下 node_modules 文件锁 / 国内网络
**解决**：
```bash
# 关闭所有编辑器/node 进程
rm -rf node_modules package-lock.json
npm install --registry https://registry.npmmirror.com
```

### Q2: `better-sqlite3` 编译失败
**原因**：缺少 C++ 构建工具
**解决**（Windows）：
```bash
npm i -g windows-build-tools  # 或安装 VS Build Tools
```

### Q3: DeepSeek 返回 `401 Unauthorized`
- 检查 `.env` 中 `DEEPSEEK_API_KEY` 是否正确
- Key 前缀应为 `sk-`
- 前端调用不经后端，而是直接调 deepseek 会导致此错误 → 必须走后端 `/api/ai/...`

### Q4: 高德返回 `INVALID_USER_SCODE`
**原因**：用了 Web端 Key 调 Web服务 API
**解决**：使用截图中 **Service Key** 这一行的值，对应绑定服务为 "Web服务"

### Q5: SSE 连接 30s 断开
**原因**：nginx / 云厂商反向代理超时
**解决**：
- nginx: `proxy_read_timeout 300s; proxy_buffering off;`
- 后端已启用 15s 心跳 `: heartbeat`

### Q6: 图片上传 413 错误
**原因**：请求体超过中间件限制
**解决**：
- multer 配置单文件 5MB
- Express body parser `express.json({ limit: "2mb" })` 仅影响 JSON，不影响 multipart

---

## 日志与监控

当前实现：
- `server/index.ts` 为所有 `/api/*` 请求输出一行日志（方法 + 路径 + 时间）
- 错误走 `app.use(errorHandler)` 统一捕获

生产建议：
- 使用 `pino` 替换 `console.log`
- SSE 关键事件打点（iteration 次数、token 消耗）
- 接入 Sentry / OpenTelemetry
