import "dotenv/config";
import type { Config } from "drizzle-kit";
import path from "path";

export default {
  schema: "./shared/schema.ts",
  out: "./migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: path.resolve(process.env.DB_PATH || "data/sqlite.db"),
  },
} satisfies Config;
