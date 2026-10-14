import { eq, asc } from "drizzle-orm";
import { db } from "./db";
import {
  trips,
  nodes,
  userProfile,
  checkins,
  type Trip,
  type InsertTrip,
  type Node,
  type InsertNode,
  type UserProfile,
  type InsertUserProfile,
  type Checkin,
  type InsertCheckin,
} from "../shared/schema";

export interface IStorage {
  // Trips
  listTrips(): Promise<Trip[]>;
  getTrip(id: number): Promise<Trip | undefined>;
  createTrip(data: InsertTrip): Promise<Trip>;
  updateTrip(id: number, data: Partial<InsertTrip>): Promise<Trip | undefined>;
  deleteTrip(id: number): Promise<void>;

  // Nodes
  listNodes(tripId: number): Promise<Node[]>;
  getNode(id: number): Promise<Node | undefined>;
  createNode(data: InsertNode): Promise<Node>;
  updateNode(id: number, data: Partial<InsertNode>): Promise<Node | undefined>;
  deleteNode(id: number): Promise<void>;

  // Profile
  getProfile(): Promise<UserProfile | undefined>;
  upsertProfile(data: InsertUserProfile): Promise<UserProfile>;

  // Checkins
  listCheckins(tripId?: number): Promise<Checkin[]>;
  getCheckinsByNode(nodeId: number): Promise<Checkin[]>;
  createCheckin(data: InsertCheckin): Promise<Checkin>;
  deleteCheckin(id: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // ================== Trips ==================
  async listTrips(): Promise<Trip[]> {
    return db.select().from(trips).orderBy(asc(trips.id)).all();
  }

  async getTrip(id: number): Promise<Trip | undefined> {
    const rows = db.select().from(trips).where(eq(trips.id, id)).all();
    return rows[0];
  }

  async createTrip(data: InsertTrip): Promise<Trip> {
    const rows = db.insert(trips).values(data).returning().all();
    return rows[0];
  }

  async updateTrip(id: number, data: Partial<InsertTrip>): Promise<Trip | undefined> {
    const rows = db.update(trips).set(data).where(eq(trips.id, id)).returning().all();
    return rows[0];
  }

  async deleteTrip(id: number): Promise<void> {
    db.delete(nodes).where(eq(nodes.tripId, id)).run();
    db.delete(checkins).where(eq(checkins.tripId, id)).run();
    db.delete(trips).where(eq(trips.id, id)).run();
  }

  // ================== Nodes ==================
  async listNodes(tripId: number): Promise<Node[]> {
    return db
      .select()
      .from(nodes)
      .where(eq(nodes.tripId, tripId))
      .orderBy(asc(nodes.day), asc(nodes.order))
      .all();
  }

  async getNode(id: number): Promise<Node | undefined> {
    const rows = db.select().from(nodes).where(eq(nodes.id, id)).all();
    return rows[0];
  }

  async createNode(data: InsertNode): Promise<Node> {
    const rows = db.insert(nodes).values(data).returning().all();
    return rows[0];
  }

  async updateNode(id: number, data: Partial<InsertNode>): Promise<Node | undefined> {
    const rows = db.update(nodes).set(data).where(eq(nodes.id, id)).returning().all();
    return rows[0];
  }

  async deleteNode(id: number): Promise<void> {
    db.delete(checkins).where(eq(checkins.nodeId, id)).run();
    db.delete(nodes).where(eq(nodes.id, id)).run();
  }

  // ================== Profile ==================
  async getProfile(): Promise<UserProfile | undefined> {
    const rows = db.select().from(userProfile).all();
    return rows[0];
  }

  async upsertProfile(data: InsertUserProfile): Promise<UserProfile> {
    const existing = await this.getProfile();
    if (existing) {
      const rows = db
        .update(userProfile)
        .set(data)
        .where(eq(userProfile.id, existing.id))
        .returning()
        .all();
      return rows[0];
    }
    const rows = db.insert(userProfile).values(data).returning().all();
    return rows[0];
  }

  // ================== Checkins ==================
  async listCheckins(tripId?: number): Promise<Checkin[]> {
    const q = db.select().from(checkins);
    if (tripId !== undefined) {
      return q.where(eq(checkins.tripId, tripId)).all();
    }
    return q.all();
  }

  async getCheckinsByNode(nodeId: number): Promise<Checkin[]> {
    return db.select().from(checkins).where(eq(checkins.nodeId, nodeId)).all();
  }

  async createCheckin(data: InsertCheckin): Promise<Checkin> {
    const rows = db.insert(checkins).values(data).returning().all();
    return rows[0];
  }

  async deleteCheckin(id: number): Promise<void> {
    db.delete(checkins).where(eq(checkins.id, id)).run();
  }
}

export const storage: IStorage = new DatabaseStorage();
