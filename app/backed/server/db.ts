import "dotenv/config";
import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../shared/schema";

const DB_PATH = path.resolve(process.env.DB_PATH || "data/sqlite.db");

const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

export const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });

/**
 * 初始化表结构。开发阶段使用 `CREATE TABLE IF NOT EXISTS`，
 * 生产环境可替换为 drizzle-kit 迁移。
 */
export function initDb() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS trips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      destination TEXT NOT NULL DEFAULT '敦煌',
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      cover_emoji TEXT DEFAULT '🏜️',
      status TEXT NOT NULL DEFAULT 'planning',
      total_days INTEGER DEFAULT 3
    );

    CREATE TABLE IF NOT EXISTS nodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      scheduled_time TEXT DEFAULT '',
      duration INTEGER DEFAULT 120,
      lat REAL DEFAULT 40.1416,
      lng REAL DEFAULT 94.6624,
      status TEXT NOT NULL DEFAULT 'pending',
      "order" INTEGER NOT NULL DEFAULT 0,
      category TEXT DEFAULT '景点',
      pitfall_tip TEXT DEFAULT '',
      ticket_info TEXT DEFAULT '',
      day INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS user_profile (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nickname TEXT DEFAULT '旅行者',
      avatar TEXT DEFAULT '🧭',
      total_trips INTEGER DEFAULT 0,
      total_cities INTEGER DEFAULT 0,
      onboarding_done INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS checkins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      node_id INTEGER NOT NULL,
      trip_id INTEGER NOT NULL,
      photos TEXT DEFAULT '[]',
      caption TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_nodes_trip_id ON nodes(trip_id);
    CREATE INDEX IF NOT EXISTS idx_checkins_trip_id ON checkins(trip_id);
    CREATE INDEX IF NOT EXISTS idx_checkins_node_id ON checkins(node_id);
  `);

  console.log(`[db] initialized at ${DB_PATH}`);
}
