/**
 * Phase 1: multer 上传 + 静态地图代理验证
 * 使用隔离目录 data/test-uploads/
 * 启动一个临时 Express 服务来测试完整上传链路
 */
import "dotenv/config";
import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";

const AMAP_KEY = process.env.AMAP_KEY!;
const UPLOAD_DIR = path.resolve("data/test-uploads");
const PORT = 54321;

if (fs.existsSync(UPLOAD_DIR)) {
  fs.rmSync(UPLOAD_DIR, { recursive: true });
}
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`不支持的文件类型: ${file.mimetype}`));
    }
  },
});

const results: Record<string, any> = {};

async function main() {
  const app = express();

  // 上传接口
  app.post("/api/upload", upload.array("photos", 9), (req, res) => {
    const files = req.files as Express.Multer.File[];
    const urls = files.map((f) => `/uploads/${f.filename}`);
    res.json({ urls, count: files.length });
  });

  // 静态地图代理
  app.get("/api/map/static", async (req, res) => {
    const { location, zoom = "13", markers } = req.query;
    const url = `https://restapi.amap.com/v3/staticmap?location=${location}&zoom=${zoom}&size=750*400&markers=${markers || `large,0xc89630,A:${location}`}&scale=2&key=${AMAP_KEY}`;
    try {
      const resp = await fetch(url);
      const buffer = await resp.arrayBuffer();
      res.set("Content-Type", "image/png");
      res.send(Buffer.from(buffer));
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // 静态文件服务
  app.use("/uploads", express.static(UPLOAD_DIR));

  const server = app.listen(PORT, async () => {
    console.log(`Test server running on http://localhost:${PORT}\n`);

    try {
      await testUpload();
      await testStaticMap();

      const outPath = path.resolve(".cursor/rules/upload-staticmap.json");
      fs.writeFileSync(outPath, JSON.stringify(results, null, 2), "utf-8");
      console.log(`\n✅ Results saved to: ${outPath}`);
    } finally {
      server.close();
      // Clean up
      if (fs.existsSync(UPLOAD_DIR)) {
        fs.rmSync(UPLOAD_DIR, { recursive: true });
        console.log(`Cleaned up: ${UPLOAD_DIR}`);
      }
    }
  });
}

async function testUpload() {
  console.log("=".repeat(60));
  console.log("1. multer 图片上传验证");
  console.log("=".repeat(60));

  // Create a test image (1x1 PNG)
  const PNG_1x1 = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
    "base64"
  );

  const testImgPath = path.join(UPLOAD_DIR, "test-input.png");
  fs.writeFileSync(testImgPath, PNG_1x1);

  const formData = new FormData();
  const blob1 = new Blob([PNG_1x1], { type: "image/png" });
  const blob2 = new Blob([PNG_1x1], { type: "image/png" });
  formData.append("photos", blob1, "photo1.png");
  formData.append("photos", blob2, "photo2.png");

  const res = await fetch(`http://localhost:${PORT}/api/upload`, {
    method: "POST",
    body: formData,
  });

  const data = await res.json();
  console.log("Upload response:", JSON.stringify(data, null, 2));

  // Verify files exist
  const uploadedFiles = fs.readdirSync(UPLOAD_DIR).filter((f) => f !== "test-input.png");
  console.log("Uploaded files on disk:", uploadedFiles);
  console.log("Upload count matches:", data.count === 2);

  results.upload = {
    response: data,
    filesOnDisk: uploadedFiles,
    success: data.count === 2 && uploadedFiles.length === 2,
  };
}

async function testStaticMap() {
  console.log("\n" + "=".repeat(60));
  console.log("2. 静态地图代理验证");
  console.log("=".repeat(60));

  const location = "94.809374,40.042511";
  const res = await fetch(
    `http://localhost:${PORT}/api/map/static?location=${location}&zoom=14`
  );

  console.log("Status:", res.status);
  console.log("Content-Type:", res.headers.get("content-type"));

  const buffer = await res.arrayBuffer();
  const outPath = path.join(UPLOAD_DIR, "proxy-staticmap.png");
  fs.writeFileSync(outPath, Buffer.from(buffer));
  console.log(`Proxy map image size: ${buffer.byteLength} bytes`);
  console.log(`Saved to: ${outPath}`);

  results.staticMapProxy = {
    status: res.status,
    contentType: res.headers.get("content-type"),
    size: buffer.byteLength,
    success: res.status === 200 && buffer.byteLength > 1000,
  };
}

main().catch(console.error);
