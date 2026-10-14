import "dotenv/config";

const AMAP_KEY = process.env.AMAP_KEY!;
const BASE = "https://restapi.amap.com";

if (!AMAP_KEY) {
  console.warn("[amap] AMAP_KEY not set; high-map services will fail");
}

async function amapFetchJson<T = any>(pathname: string, params: Record<string, string | number | undefined>): Promise<T> {
  const url = new URL(pathname, BASE);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.append(k, String(v));
  }
  url.searchParams.append("key", AMAP_KEY);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Amap HTTP ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as any;
  if (data.status && data.status !== "1") {
    throw new Error(`Amap error ${data.infocode}: ${data.info}`);
  }
  return data as T;
}

// ==================== 类型 ====================
export interface PoiItem {
  id: string;
  name: string;
  address: string;
  location: string;        // "lng,lat"
  lat: number;
  lng: number;
  type: string;
  tel?: string;
  rating?: string;
  openTime?: string;
  photos?: string[];
  adcode?: string;
  cityname?: string;
}

export interface WeatherCast {
  date: string;
  week: string;
  dayweather: string;
  nightweather: string;
  daytemp: string;
  nighttemp: string;
  daywind: string;
  nightwind: string;
}

export interface RouteInfo {
  distance: number;       // meters
  taxiCost: number;       // yuan
  duration?: number;      // seconds
  stepsCount: number;
  firstStep?: string;
}

// ==================== 工具 ====================
function parseLocation(loc: string): { lat: number; lng: number } {
  const [lng, lat] = loc.split(",").map(Number);
  return { lat, lng };
}

function mapPoi(p: any): PoiItem {
  const loc = parseLocation(p.location);
  return {
    id: p.id,
    name: p.name,
    address: typeof p.address === "string" ? p.address : "",
    location: p.location,
    lat: loc.lat,
    lng: loc.lng,
    type: p.type,
    tel: typeof p.tel === "string" ? p.tel : undefined,
    rating: p.biz_ext?.rating,
    openTime: p.biz_ext?.open_time,
    photos: Array.isArray(p.photos)
      ? p.photos.map((ph: any) => ph.url).filter(Boolean)
      : [],
    adcode: p.adcode,
    cityname: p.cityname,
  };
}

// ==================== 对外服务 ====================

/** 地理编码（优先用 POI 搜索获取坐标，此接口仅用于模糊地址） */
export async function geocode(address: string, city?: string) {
  const data = await amapFetchJson("/v3/geocode/geo", { address, city });
  const first = data.geocodes?.[0];
  if (!first) return null;
  return {
    formatted_address: first.formatted_address,
    location: first.location,
    ...parseLocation(first.location),
    adcode: first.adcode,
    city: first.city,
    province: first.province,
  };
}

/** POI 关键字搜索 */
export async function poiSearch(
  keywords: string,
  city: string,
  opts: { offset?: number; page?: number } = {}
): Promise<PoiItem[]> {
  const data = await amapFetchJson("/v3/place/text", {
    keywords,
    city,
    offset: opts.offset ?? 10,
    page: opts.page ?? 1,
    extensions: "all",
  });
  return (data.pois || []).map(mapPoi);
}

/** POI 周边搜索 */
export async function poiAround(
  location: string,
  keywords: string,
  opts: { radius?: number; offset?: number } = {}
): Promise<PoiItem[]> {
  const data = await amapFetchJson("/v3/place/around", {
    location,
    keywords,
    radius: opts.radius ?? 3000,
    offset: opts.offset ?? 10,
    extensions: "all",
  });
  return (data.pois || []).map(mapPoi);
}

/** 驾车路线规划 */
export async function drivingRoute(origin: string, destination: string): Promise<RouteInfo | null> {
  const data = await amapFetchJson("/v5/direction/driving", { origin, destination });
  const path = data.route?.paths?.[0];
  if (!path) return null;
  return {
    distance: Number(path.distance || 0),
    taxiCost: Number(data.route?.taxi_cost || 0),
    duration: path.duration ? Number(path.duration) : undefined,
    stepsCount: path.steps?.length || 0,
    firstStep: path.steps?.[0]?.instruction,
  };
}

/** 天气预报 */
export async function weather(adcode: string) {
  const data = await amapFetchJson("/v3/weather/weatherInfo", {
    city: adcode,
    extensions: "all",
  });
  const forecast = data.forecasts?.[0];
  if (!forecast) return null;
  return {
    city: forecast.city,
    adcode: forecast.adcode,
    casts: (forecast.casts || []) as WeatherCast[],
  };
}

/** 实况天气 */
export async function weatherLive(adcode: string) {
  const data = await amapFetchJson("/v3/weather/weatherInfo", {
    city: adcode,
    extensions: "base",
  });
  return data.lives?.[0] || null;
}

/**
 * 构造静态地图 URL（后端代理时调用）。
 * markers 格式参考 https://lbs.amap.com/api/webservice/guide/api/staticmaps
 */
export function staticMapUrl(opts: {
  location: string;
  zoom?: number;
  size?: string;
  markers?: string;
  scale?: number;
}): string {
  const url = new URL("/v3/staticmap", BASE);
  url.searchParams.append("location", opts.location);
  url.searchParams.append("zoom", String(opts.zoom ?? 13));
  url.searchParams.append("size", opts.size ?? "750*400");
  url.searchParams.append("scale", String(opts.scale ?? 2));
  // markers: 显式传空串表示"不画默认 marker"（用于前端自定义 overlay 场景）
  if (opts.markers === undefined) {
    url.searchParams.append("markers", `large,0xc89630,A:${opts.location}`);
  } else if (opts.markers !== "") {
    url.searchParams.append("markers", opts.markers);
  }
  url.searchParams.append("key", AMAP_KEY);
  return url.toString();
}

/** 代理静态地图请求（避免暴露 key 到前端） */
export async function fetchStaticMap(opts: Parameters<typeof staticMapUrl>[0]): Promise<Buffer> {
  const url = staticMapUrl(opts);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Amap staticmap HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
