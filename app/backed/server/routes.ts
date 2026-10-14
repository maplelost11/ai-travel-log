import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { storage } from "./storage";
import {
  insertTripSchema,
  insertNodeSchema,
  insertUserProfileSchema,
  insertCheckinSchema,
} from "../shared/schema";
import * as amap from "./services/amap";
import { upload, fileToUrl } from "./services/upload";
import { streamItinerary } from "./ai";

/** Zod 校验错误统一处理 */
function zodError(res: Response, err: unknown) {
  if (err instanceof z.ZodError) {
    return res.status(400).json({ error: "invalid_input", issues: err.issues });
  }
  console.error(err);
  return res.status(500).json({ error: "internal_error", message: String(err) });
}

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res, next)).catch(next);
}

/** AI 行程生成请求体（含可选个性化提示词） */
const generateItineraryBodySchema = z.object({
  destination: z.string().trim().min(1).max(40).default("敦煌"),
  days: z.coerce.number().int().min(1).max(5).default(3),
  preferences: z.array(z.string().max(32)).max(12).default([]),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default(() => new Date().toISOString().slice(0, 10)),
  userPrompt: z.string().max(800).optional(),
});

export function registerRoutes(app: Express) {
  // ==================== Trips ====================
  app.get("/api/trips", asyncHandler(async (_req, res) => {
    res.json(await storage.listTrips());
  }));

  app.get("/api/trips/:id", asyncHandler(async (req, res) => {
    const trip = await storage.getTrip(Number(req.params.id));
    if (!trip) return res.status(404).json({ error: "not_found" });
    res.json(trip);
  }));

  app.post("/api/trips", asyncHandler(async (req, res) => {
    try {
      const data = insertTripSchema.parse(req.body);
      res.json(await storage.createTrip(data));
    } catch (e) {
      zodError(res, e);
    }
  }));

  app.patch("/api/trips/:id", asyncHandler(async (req, res) => {
    try {
      const partial = insertTripSchema.partial().parse(req.body);
      const updated = await storage.updateTrip(Number(req.params.id), partial);
      if (!updated) return res.status(404).json({ error: "not_found" });
      res.json(updated);
    } catch (e) {
      zodError(res, e);
    }
  }));

  app.delete("/api/trips/:id", asyncHandler(async (req, res) => {
    await storage.deleteTrip(Number(req.params.id));
    res.status(204).end();
  }));

  // ==================== Nodes ====================
  app.get("/api/trips/:tripId/nodes", asyncHandler(async (req, res) => {
    res.json(await storage.listNodes(Number(req.params.tripId)));
  }));

  app.post("/api/trips/:tripId/nodes", asyncHandler(async (req, res) => {
    try {
      const data = insertNodeSchema.parse({
        ...req.body,
        tripId: Number(req.params.tripId),
      });
      res.json(await storage.createNode(data));
    } catch (e) {
      zodError(res, e);
    }
  }));

  app.patch("/api/nodes/:id", asyncHandler(async (req, res) => {
    try {
      const partial = insertNodeSchema.partial().parse(req.body);
      // 空 diff 直接返回当前节点，避免 Drizzle "No values to set"
      if (Object.keys(partial).length === 0) {
        const current = await storage.getNode(Number(req.params.id));
        if (!current) return res.status(404).json({ error: "not_found" });
        return res.json(current);
      }
      const updated = await storage.updateNode(Number(req.params.id), partial);
      if (!updated) return res.status(404).json({ error: "not_found" });
      res.json(updated);
    } catch (e) {
      zodError(res, e);
    }
  }));

  app.delete("/api/nodes/:id", asyncHandler(async (req, res) => {
    await storage.deleteNode(Number(req.params.id));
    res.status(204).end();
  }));

  // ==================== Profile ====================
  app.get("/api/profile", asyncHandler(async (_req, res) => {
    const p = await storage.getProfile();
    res.json(p ?? null);
  }));

  app.post("/api/profile", asyncHandler(async (req, res) => {
    try {
      const data = insertUserProfileSchema.parse(req.body);
      res.json(await storage.upsertProfile(data));
    } catch (e) {
      zodError(res, e);
    }
  }));

  // ==================== Checkins ====================
  app.get("/api/checkins", asyncHandler(async (req, res) => {
    const tripId = req.query.tripId ? Number(req.query.tripId) : undefined;
    res.json(await storage.listCheckins(tripId));
  }));

  app.post("/api/checkins", asyncHandler(async (req, res) => {
    try {
      const data = insertCheckinSchema.parse({
        ...req.body,
        createdAt: req.body.createdAt || new Date().toISOString(),
      });
      res.json(await storage.createCheckin(data));
    } catch (e) {
      zodError(res, e);
    }
  }));

  app.delete("/api/checkins/:id", asyncHandler(async (req, res) => {
    await storage.deleteCheckin(Number(req.params.id));
    res.status(204).end();
  }));

  // ==================== Upload ====================
  app.post("/api/upload", upload.array("photos", 9), asyncHandler(async (req, res) => {
    const files = (req.files as Express.Multer.File[]) || [];
    res.json({
      urls: files.map(fileToUrl),
      count: files.length,
    });
  }));

  // ==================== Map proxy ====================
  app.get("/api/map/static", asyncHandler(async (req, res) => {
    const location = String(req.query.location || "");
    if (!location) return res.status(400).json({ error: "location required" });

    const buffer = await amap.fetchStaticMap({
      location,
      zoom: req.query.zoom ? Number(req.query.zoom) : 13,
      size: typeof req.query.size === "string" ? req.query.size : undefined,
      markers: typeof req.query.markers === "string" ? req.query.markers : undefined,
    });
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=604800");
    res.send(buffer);
  }));

  app.get("/api/map/poi-search", asyncHandler(async (req, res) => {
    const keywords = String(req.query.keywords || "");
    const city = String(req.query.city || "敦煌");
    const pois = await amap.poiSearch(keywords, city, {
      offset: req.query.offset ? Number(req.query.offset) : 10,
    });
    res.json(pois);
  }));

  app.get("/api/map/weather", asyncHandler(async (req, res) => {
    const adcode = String(req.query.adcode || "620982");
    res.json(await amap.weather(adcode));
  }));

  // ==================== AI ====================
  app.post("/api/ai/generate-itinerary", asyncHandler(async (req, res) => {
    try {
      const body = generateItineraryBodySchema.parse(req.body ?? {});
      const userPrompt = body.userPrompt?.trim()
        ? body.userPrompt.trim().slice(0, 800)
        : undefined;
      await streamItinerary(
        {
          destination: body.destination,
          days: body.days,
          preferences: body.preferences,
          startDate: body.startDate,
          userPrompt,
        },
        res,
      );
    } catch (e) {
      return zodError(res, e);
    }
  }));
}
