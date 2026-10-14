# AI 旅游 Log 后端规范文档

> 本文档面向后端开发者、前端联调者和未来维护者。
> 所有规范都基于 **Phase 1 真实验证数据** 与 **Phase 2 实际联调结果**，并非理论设计。

---

## 📑 文档索引

| 编号 | 文档 | 说明 |
|------|------|------|
| 01 | [架构总览](./01-architecture.md) | 整体架构、技术栈、目录结构、模块依赖 |
| 02 | [API 接口规范](./02-api-specification.md) | 19 个 REST 路由 + 1 个 SSE 路由的详细约定 |
| 03 | [数据模型](./03-data-model.md) | 4 张表的 Drizzle Schema、约束、索引 |
| 04 | [高德 API 集成规范](./04-amap-integration.md) | 6 个高德接口的封装约定与数据映射 |
| 05 | [AI Agent 流程](./05-ai-agent-pipeline.md) | LangChain + DeepSeek 行程生成链路 |
| 06 | [环境配置与部署](./06-environment-setup.md) | 环境变量、本地启动、生产部署 |
| 07 | [前后端对齐报告（Phase 3）](./07-frontend-backend-alignment.md) | 前端调用审计、能力缺口、冒烟结果 |

---

## 📂 原始数据契约 (contracts/)

Phase 1 验证阶段采集的真实接口返回数据，用作所有业务代码开发的**数据基准**。

| 文件 | 来源脚本 | 内容 |
|------|----------|------|
| `amap-api-responses.json` | `scripts/verify-amap.ts` | 高德 6 个 API 的完整响应样本 |
| `deepseek-capabilities.json` | `scripts/verify-deepseek.ts` | DeepSeek 基础对话/工具调用/结构化输出验证 |
| `agent-pipeline.json` | `scripts/verify-agent.ts` | 端到端 Agent 调用轨迹 + 结构化节点输出 |
| `drizzle-db-schema.json` | `scripts/verify-db.ts` | Drizzle CRUD 验证、Zod schema shape |
| `upload-staticmap.json` | `scripts/verify-upload.ts` | multer 上传 + 静态地图代理 |
| `phase2-api-test-results.json` | `scripts/test-api.ts` | Phase 2 全量接口测试结果 |

---

## 🚀 快速开始

```bash
cd app/backed
npm install
cp .env.example .env   # 填入 DEEPSEEK_API_KEY 和 AMAP_KEY
npm run dev            # 启动开发服务器 (http://localhost:5000)
```

详细启动流程见 [06-environment-setup.md](./06-environment-setup.md)。

---

## 🔒 规范约束原则

1. **数据契约优先**：所有对外部服务的封装，必须以 `contracts/*.json` 中的真实响应为准，不允许凭空臆测字段
2. **坐标格式统一**：高德返回 `"lng,lat"` 字符串；数据库与内部传递统一用 `lat:number, lng:number`；存储精度保留到小数点后 6 位
3. **Key 不外泄**：`AMAP_KEY` 和 `DEEPSEEK_API_KEY` 仅在后端使用；所有地图请求通过后端代理
4. **目录隔离**：测试用 `data/test-*.db`、`data/test-uploads/`；正式用 `data/sqlite.db`、`data/uploads/`
5. **SSE 协议稳定**：`/api/ai/generate-itinerary` 的事件格式已被前端强依赖，任何修改需同步到前端
6. **Zod 强校验**：所有写操作的请求 body 必须经过 `insertXxxSchema` 校验，失败返回 400
