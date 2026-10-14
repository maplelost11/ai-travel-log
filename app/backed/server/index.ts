import "dotenv/config";
import express from "express";
import session from "express-session";
import createMemoryStore from "memorystore";
import path from "path";
import { initDb } from "./db";
import { registerRoutes } from "./routes";
import { UPLOAD_DIR } from "./services/upload";

const MemoryStore = createMemoryStore(session);

const PORT = Number(process.env.PORT || 5000);

async function main() {
  initDb();

  const app = express();

  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true, limit: "2mb" }));

  app.use(
    session({
      secret: process.env.SESSION_SECRET || "dev-secret-change-me",
      resave: false,
      saveUninitialized: false,
      store: new MemoryStore({ checkPeriod: 86_400_000 }),
      cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 },
    })
  );

  // 请求日志
  app.use((req, _res, next) => {
    if (req.path.startsWith("/api")) {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    }
    next();
  });

  // CORS（开发模式方便前端 vite dev 跨域）
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", req.headers.origin || "*");
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type,Authorization");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  // 静态文件：上传的图片
  app.use("/uploads", express.static(UPLOAD_DIR));

  // 健康检查
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, uptime: process.uptime(), now: new Date().toISOString() });
  });

  // 业务路由
  registerRoutes(app);

  // 全局错误处理
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("[error]", err);
    if (res.headersSent) return;
    res.status(err.status || 500).json({
      error: err.code || "internal_error",
      message: err.message || String(err),
    });
  });

  app.listen(PORT, () => {
    console.log(`[server] listening on http://localhost:${PORT}`);
    console.log(`[server] uploads dir: ${UPLOAD_DIR}`);
  });
}

main().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
