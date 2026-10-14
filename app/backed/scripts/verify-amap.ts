/**
 * Phase 1: 高德地图 Web 服务 API 验证脚本
 * 逐一调用 6 个 API，打印真实返回数据，供后续保存为 rules
 */
import "dotenv/config";
import fs from "fs";
import path from "path";

const AMAP_KEY = process.env.AMAP_KEY!;
const BASE = "https://restapi.amap.com";

async function amapGet(url: string) {
  const fullUrl = `${BASE}${url}&key=${AMAP_KEY}`;
  console.log(`\n>>> GET ${fullUrl}\n`);
  const res = await fetch(fullUrl);
  const data = await res.json();
  return data;
}

async function verifyGeocode() {
  console.log("=".repeat(60));
  console.log("1. 地理编码 — geocode('莫高窟', '敦煌')");
  console.log("=".repeat(60));
  const data = await amapGet("/v3/geocode/geo?address=莫高窟&city=敦煌");
  console.log(JSON.stringify(data, null, 2));
  return data;
}

async function verifyPoiSearch() {
  console.log("=".repeat(60));
  console.log("2. POI 关键字搜索 — poiSearch('景点', '敦煌')");
  console.log("=".repeat(60));
  const data = await amapGet(
    "/v3/place/text?keywords=景点&city=敦煌&offset=5&page=1&extensions=all"
  );
  console.log(JSON.stringify(data, null, 2));
  return data;
}

async function verifyPoiAround() {
  console.log("=".repeat(60));
  console.log("3. POI 周边搜索 — poiAround('94.6624,40.1416', '餐厅')");
  console.log("=".repeat(60));
  const data = await amapGet(
    "/v3/place/around?location=94.6624,40.1416&keywords=餐厅&radius=3000&offset=5"
  );
  console.log(JSON.stringify(data, null, 2));
  return data;
}

async function verifyDrivingRoute() {
  console.log("=".repeat(60));
  console.log("4. 驾车路线规划 — 莫高窟 → 鸣沙山");
  console.log("=".repeat(60));
  const data = await amapGet(
    "/v5/direction/driving?origin=94.8091,40.0362&destination=94.6715,40.0816"
  );
  console.log(JSON.stringify(data, null, 2));
  return data;
}

async function verifyWeather() {
  console.log("=".repeat(60));
  console.log("5. 天气查询 — 敦煌 (adcode: 620982)");
  console.log("=".repeat(60));
  const base = await amapGet("/v3/weather/weatherInfo?city=620982&extensions=base");
  console.log("--- 实况天气 ---");
  console.log(JSON.stringify(base, null, 2));

  const all = await amapGet("/v3/weather/weatherInfo?city=620982&extensions=all");
  console.log("--- 预报天气 ---");
  console.log(JSON.stringify(all, null, 2));
  return { base, forecast: all };
}

async function verifyStaticMap() {
  console.log("=".repeat(60));
  console.log("6. 静态地图 — 莫高窟标记点");
  console.log("=".repeat(60));
  const url = `${BASE}/v3/staticmap?location=94.8091,40.0362&zoom=13&size=750*400&markers=large,0xc89630,A:94.8091,40.0362&scale=2&key=${AMAP_KEY}`;
  console.log(`>>> GET ${url}`);
  const res = await fetch(url);
  console.log(`Status: ${res.status}`);
  console.log(`Content-Type: ${res.headers.get("content-type")}`);
  console.log(`Content-Length: ${res.headers.get("content-length")}`);

  const buffer = await res.arrayBuffer();
  const outPath = path.resolve("data/test-staticmap.png");
  fs.writeFileSync(outPath, Buffer.from(buffer));
  console.log(`Image saved to: ${outPath} (${buffer.byteLength} bytes)`);
  return {
    status: res.status,
    contentType: res.headers.get("content-type"),
    size: buffer.byteLength,
    savedTo: outPath,
  };
}

async function main() {
  console.log(`AMAP_KEY: ${AMAP_KEY ? AMAP_KEY.slice(0, 8) + "..." : "NOT SET"}\n`);

  const results: Record<string, any> = {};
  results.geocode = await verifyGeocode();
  results.poiSearch = await verifyPoiSearch();
  results.poiAround = await verifyPoiAround();
  results.drivingRoute = await verifyDrivingRoute();
  results.weather = await verifyWeather();
  results.staticMap = await verifyStaticMap();

  const outPath = path.resolve(".cursor/rules/amap-api-responses.json");
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2), "utf-8");
  console.log(`\n✅ All results saved to: ${outPath}`);
}

main().catch(console.error);
