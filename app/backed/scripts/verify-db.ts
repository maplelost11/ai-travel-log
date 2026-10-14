/**
 * Phase 1: Drizzle + SQLite 验证脚本
 * 使用隔离的测试数据库 data/test-verify.db
 */
import "dotenv/config";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import fs from "fs";
import path from "path";

const DB_PATH = path.resolve("data/test-verify.db");

// 清理旧的测试数据库
if (fs.existsSync(DB_PATH)) {
  fs.unlinkSync(DB_PATH);
  console.log(`Removed old test DB: ${DB_PATH}`);
}

const sqlite = new Database(DB_PATH);
const db = drizzle(sqlite);

// ===== 表定义 (复用 shared/schema.ts 的结构) =====
const trips = sqliteTable("trips", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  destination: text("destination").notNull().default("敦煌"),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  coverEmoji: text("cover_emoji").default("🏜️"),
  status: text("status").notNull().default("planning"),
  totalDays: integer("total_days").default(3),
});

const nodes = sqliteTable("nodes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tripId: integer("trip_id").notNull(),
  name: text("name").notNull(),
  description: text("description").default(""),
  scheduledTime: text("scheduled_time").default(""),
  duration: integer("duration").default(120),
  lat: real("lat").default(40.1416),
  lng: real("lng").default(94.6624),
  status: text("status").notNull().default("pending"),
  order: integer("order").notNull().default(0),
  category: text("category").default("景点"),
  pitfallTip: text("pitfall_tip").default(""),
  ticketInfo: text("ticket_info").default(""),
  day: integer("day").default(1),
});

const userProfile = sqliteTable("user_profile", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nickname: text("nickname").default("旅行者"),
  avatar: text("avatar").default("🧭"),
  totalTrips: integer("total_trips").default(0),
  totalCities: integer("total_cities").default(0),
  onboardingDone: integer("onboarding_done").default(0),
});

const checkins = sqliteTable("checkins", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nodeId: integer("node_id").notNull(),
  tripId: integer("trip_id").notNull(),
  photos: text("photos").default("[]"),
  caption: text("caption").default(""),
  createdAt: text("created_at").notNull(),
});

const results: Record<string, any> = {};

async function verifyCreateTables() {
  console.log("=".repeat(60));
  console.log("1. 建表 — 4 张表");
  console.log("=".repeat(60));

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
  `);

  const tableList = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all() as { name: string }[];
  console.log("Created tables:", tableList.map((t) => t.name));

  results.tables = tableList.map((t) => t.name);
}

async function verifyCRUD() {
  console.log("\n" + "=".repeat(60));
  console.log("2. CRUD 操作 — trips + nodes");
  console.log("=".repeat(60));

  // CREATE
  const tripRows = db
    .insert(trips)
    .values({
      title: "敦煌3日深度游",
      destination: "敦煌",
      startDate: "2026-04-24",
      endDate: "2026-04-26",
      status: "planning",
      totalDays: 3,
    })
    .returning()
    .all();
  const trip = tripRows[0];
  console.log("Created trip:", trip);

  const node1Rows = db
    .insert(nodes)
    .values({
      tripId: trip.id,
      name: "莫高窟",
      description: "世界文化遗产",
      scheduledTime: "08:30",
      duration: 180,
      lat: 40.042511,
      lng: 94.809374,
      status: "pending",
      order: 0,
      category: "景点",
      pitfallTip: "需提前预约",
      day: 1,
    })
    .returning()
    .all();
  const node1 = node1Rows[0];
  console.log("Created node:", node1);

  const node2Rows = db
    .insert(nodes)
    .values({
      tripId: trip.id,
      name: "鸣沙山月牙泉",
      description: "5A景区",
      scheduledTime: "15:00",
      duration: 180,
      lat: 40.088833,
      lng: 94.680396,
      status: "pending",
      order: 1,
      category: "景点",
      day: 1,
    })
    .returning()
    .all();
  const node2 = node2Rows[0];
  console.log("Created node:", node2);

  // READ
  const allTrips = db.select().from(trips).all();
  console.log("\nAll trips:", allTrips);

  const tripNodes = db
    .select()
    .from(nodes)
    .where(eq(nodes.tripId, trip.id))
    .all();
  console.log("Trip nodes:", tripNodes);

  // UPDATE
  const updatedRows = db
    .update(nodes)
    .set({ status: "done" })
    .where(eq(nodes.id, node1.id))
    .returning()
    .all();
  const updated = updatedRows[0];
  console.log("\nUpdated node status:", updated);

  // CREATE checkin
  const checkinRows = db
    .insert(checkins)
    .values({
      nodeId: node1.id,
      tripId: trip.id,
      photos: JSON.stringify(["/uploads/test1.jpg", "/uploads/test2.jpg"]),
      caption: "打卡莫高窟！",
      createdAt: new Date().toISOString(),
    })
    .returning()
    .all();
  const checkin = checkinRows[0];
  console.log("Created checkin:", checkin);

  // CREATE profile
  const profileRows = db
    .insert(userProfile)
    .values({
      nickname: "大漠行者",
      avatar: "🧭",
      onboardingDone: 1,
    })
    .returning()
    .all();
  const profile = profileRows[0];
  console.log("Created profile:", profile);

  // DELETE
  db.delete(trips).where(eq(trips.id, trip.id)).run();
  const remaining = db.select().from(trips).all();
  console.log("\nAfter delete, remaining trips:", remaining.length);

  results.crud = {
    createdTrip: trip,
    createdNodes: [node1, node2],
    updatedNode: updated,
    createdCheckin: checkin,
    createdProfile: profile,
    deleteWorks: remaining.length === 0,
  };
}

async function verifyZodSchema() {
  console.log("\n" + "=".repeat(60));
  console.log("3. Zod Schema 验证");
  console.log("=".repeat(60));

  const insertTripSchema = createInsertSchema(trips).omit({ id: true });
  const insertNodeSchema = createInsertSchema(nodes).omit({ id: true });

  const validTrip = insertTripSchema.safeParse({
    title: "敦煌之旅",
    destination: "敦煌",
    startDate: "2026-04-24",
    endDate: "2026-04-26",
  });
  console.log("Valid trip parse:", validTrip.success);

  const invalidTrip = insertTripSchema.safeParse({
    destination: "敦煌",
  });
  console.log("Invalid trip parse (missing title):", invalidTrip.success);
  if (!invalidTrip.success) {
    console.log("Error:", invalidTrip.error.issues.map((i) => `${i.path}: ${i.message}`));
  }

  results.zodSchema = {
    validTripPasses: validTrip.success,
    invalidTripFails: !invalidTrip.success,
    tripSchemaShape: Object.keys(insertTripSchema.shape),
    nodeSchemaShape: Object.keys(insertNodeSchema.shape),
  };
}

async function main() {
  await verifyCreateTables();
  await verifyCRUD();
  await verifyZodSchema();

  sqlite.close();

  const outPath = path.resolve(".cursor/rules/drizzle-db-schema.json");
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2), "utf-8");
  console.log(`\n✅ All results saved to: ${outPath}`);

  // Clean up test DB
  if (fs.existsSync(DB_PATH)) {
    fs.unlinkSync(DB_PATH);
    console.log(`Cleaned up test DB: ${DB_PATH}`);
  }
}

main().catch(console.error);
