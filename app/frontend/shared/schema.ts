import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// 旅行计划表
export const trips = sqliteTable("trips", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  destination: text("destination").notNull().default("敦煌"),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  coverEmoji: text("cover_emoji").default("🏜️"),
  status: text("status").notNull().default("planning"), // planning | active | completed
  totalDays: integer("total_days").default(3),
});

export const insertTripSchema = createInsertSchema(trips).omit({ id: true });
export type InsertTrip = z.infer<typeof insertTripSchema>;
export type Trip = typeof trips.$inferSelect;

// 行程节点表
export const nodes = sqliteTable("nodes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tripId: integer("trip_id").notNull(),
  name: text("name").notNull(),
  description: text("description").default(""),
  scheduledTime: text("scheduled_time").default(""),
  duration: integer("duration").default(120), // 分钟
  lat: real("lat").default(40.1416),
  lng: real("lng").default(94.6624),
  status: text("status").notNull().default("pending"), // pending | active | done | skipped
  order: integer("order").notNull().default(0),
  category: text("category").default("景点"), // 景点 | 餐饮 | 住宿 | 交通
  pitfallTip: text("pitfall_tip").default(""),
  ticketInfo: text("ticket_info").default(""),
  day: integer("day").default(1),
});

export const insertNodeSchema = createInsertSchema(nodes).omit({ id: true });
export type InsertNode = z.infer<typeof insertNodeSchema>;
export type Node = typeof nodes.$inferSelect;

// 用户信息表（单用户本地）
export const userProfile = sqliteTable("user_profile", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nickname: text("nickname").default("旅行者"),
  avatar: text("avatar").default("🧭"),
  totalTrips: integer("total_trips").default(0),
  totalCities: integer("total_cities").default(0),
  onboardingDone: integer("onboarding_done").default(0),
});

export const insertUserProfileSchema = createInsertSchema(userProfile).omit({ id: true });
export type InsertUserProfile = z.infer<typeof insertUserProfileSchema>;
export type UserProfile = typeof userProfile.$inferSelect;

// 打卡记录表
export const checkins = sqliteTable("checkins", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nodeId: integer("node_id").notNull(),
  tripId: integer("trip_id").notNull(),
  photos: text("photos").default("[]"), // JSON array of image URLs
  caption: text("caption").default(""),
  createdAt: text("created_at").notNull(),
});

export const insertCheckinSchema = createInsertSchema(checkins).omit({ id: true });
export type InsertCheckin = z.infer<typeof insertCheckinSchema>;
export type Checkin = typeof checkins.$inferSelect;
