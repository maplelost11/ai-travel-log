import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Node } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

interface Poi {
  id: string;
  name: string;
  address: string;
  location: string; // "lng,lat"
  lat: number;
  lng: number;
  type: string;
  tel?: string;
  rating?: string;
  openTime?: string;
}

interface Props {
  tripId: number;
  destination: string;
  totalDays: number;
  defaultDay: number;
  existingNodes: Node[];
  onClose: () => void;
}

type Step = "search" | "form";

const CATEGORIES = ["景点", "餐饮", "住宿", "交通"] as const;
type Category = typeof CATEGORIES[number];

function categoryFromPoiType(type: string): Category {
  if (type.includes("餐饮")) return "餐饮";
  if (type.includes("住宿") || type.includes("宾馆") || type.includes("酒店")) return "住宿";
  if (type.includes("交通") || type.includes("汽车") || type.includes("站") || type.includes("机场")) return "交通";
  return "景点";
}

export default function AddNodeSheet({
  tripId, destination, totalDays, defaultDay, existingNodes, onClose,
}: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>("search");
  const [keywords, setKeywords] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<Poi[]>([]);
  const [picked, setPicked] = useState<Poi | null>(null);

  const [form, setForm] = useState({
    scheduledTime: "",
    duration: 120,
    day: defaultDay > 0 ? defaultDay : 1,
    category: "景点" as Category,
    description: "",
    pitfallTip: "",
  });

  // 防抖搜索
  useEffect(() => {
    if (keywords.trim().length < 2) {
      setResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await apiRequest<Poi[]>(
          "GET",
          `/api/map/poi-search?keywords=${encodeURIComponent(keywords.trim())}&city=${encodeURIComponent(destination)}&offset=12`,
        );
        setResults(Array.isArray(data) ? data : []);
      } catch (e) {
        toast({
          title: "搜索失败",
          description: e instanceof Error ? e.message : String(e),
          duration: 2500,
        });
      } finally {
        setSearching(false);
      }
    }, 450);
    return () => clearTimeout(handle);
  }, [keywords, destination, toast]);

  const nextOrderForDay = useMemo(() => {
    const sameDay = existingNodes.filter(n => n.day === form.day);
    if (sameDay.length === 0) return 0;
    return Math.max(...sameDay.map(n => n.order ?? 0)) + 1;
  }, [existingNodes, form.day]);

  const handlePick = (poi: Poi) => {
    setPicked(poi);
    setForm(f => ({ ...f, category: categoryFromPoiType(poi.type) }));
    setStep("form");
  };

  const createMut = useMutation({
    mutationFn: async () => {
      if (!picked) throw new Error("未选择地点");
      return apiRequest<Node>("POST", `/api/trips/${tripId}/nodes`, {
        tripId,
        name: picked.name,
        description: form.description.trim() || picked.address,
        scheduledTime: form.scheduledTime,
        duration: Number(form.duration),
        lat: picked.lat,
        lng: picked.lng,
        status: "pending",
        order: nextOrderForDay,
        category: form.category,
        pitfallTip: form.pitfallTip,
        day: form.day,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/trips", tripId, "nodes"] });
      toast({ title: "节点已添加 🎉", duration: 1800 });
      onClose();
    },
    onError: (e: Error) => {
      toast({ title: "添加失败", description: e.message, duration: 3000 });
    },
  });

  // ====================== 渲染 ======================
  return (
    <div
      className="absolute inset-0 z-50 flex flex-col justify-end"
      style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="rounded-t-3xl slide-up overflow-hidden flex flex-col"
        style={{
          maxHeight: "94%",
          background: "hsl(var(--background))",
          borderTop: "1px solid rgba(200,150,48,0.25)",
        }}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ background: "rgba(200,150,48,0.3)" }} />
        </div>

        <div className="px-5 pt-2 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {step === "form" && (
              <button onClick={() => setStep("search")} className="text-sm text-muted-foreground">← 返回</button>
            )}
            <h2 className="text-lg font-bold text-foreground">
              {step === "search" ? "➕ 添加节点" : "📝 填写详情"}
            </h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground text-sm" data-testid="btn-add-close">关闭</button>
        </div>

        {/* ============ Step 1: 搜索 POI ============ */}
        {step === "search" && (
          <>
            <div className="px-5 pb-3">
              <div
                className="flex items-center gap-2 rounded-xl px-3 py-2.5"
                style={{
                  background: "rgba(200,150,48,0.06)",
                  border: "1px solid rgba(200,150,48,0.25)",
                }}
              >
                <span className="text-base">🔍</span>
                <input
                  autoFocus
                  value={keywords}
                  onChange={e => setKeywords(e.target.value)}
                  placeholder={`在「${destination}」搜索景点 / 美食 / 住宿...`}
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                  data-testid="input-poi-keywords"
                />
                {searching && (
                  <span className="text-xs text-muted-foreground animate-pulse">搜索中…</span>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1.5">
                提示：输入 2 个字符以上自动搜索（数据来自高德地图）
              </p>
            </div>

            <div className="flex-1 overflow-y-auto px-5 pb-4">
              {!searching && keywords.trim().length < 2 && (
                <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
                  <div className="text-4xl">🗺</div>
                  <p className="text-xs text-muted-foreground">输入关键字开始搜索</p>
                  <div className="flex gap-2 flex-wrap justify-center mt-2">
                    {["博物馆", "咖啡", "鸣沙山", "夜市"].map(kw => (
                      <button
                        key={kw}
                        onClick={() => setKeywords(kw)}
                        className="text-[11px] px-2.5 py-1 rounded-full"
                        style={{
                          background: "rgba(200,150,48,0.12)",
                          color: "#c89630",
                          border: "1px solid rgba(200,150,48,0.25)",
                        }}
                      >
                        {kw}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {!searching && keywords.trim().length >= 2 && results.length === 0 && (
                <div className="flex flex-col items-center py-10 gap-2">
                  <div className="text-3xl">🤷</div>
                  <p className="text-xs text-muted-foreground">没有匹配结果，换个关键字试试</p>
                </div>
              )}
              {results.length > 0 && (
                <div className="flex flex-col gap-2">
                  {results.map(poi => {
                    const cat = categoryFromPoiType(poi.type);
                    const catIcon = cat === "餐饮" ? "🍜" : cat === "住宿" ? "🏨" : cat === "交通" ? "🚗" : "📍";
                    return (
                      <button
                        key={poi.id}
                        onClick={() => handlePick(poi)}
                        className="w-full text-left p-3 rounded-xl transition-all active:scale-[0.98] flex gap-3"
                        style={{
                          background: "rgba(200,150,48,0.05)",
                          border: "1px solid rgba(200,150,48,0.15)",
                        }}
                        data-testid={`poi-${poi.id}`}
                      >
                        <div className="text-xl pt-0.5 flex-shrink-0">{catIcon}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-semibold text-foreground truncate">{poi.name}</h4>
                            <span
                              className="text-[9px] px-1.5 py-0.5 rounded-full flex-shrink-0"
                              style={{
                                background: "rgba(200,150,48,0.15)",
                                color: "#c89630",
                              }}
                            >
                              {cat}
                            </span>
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                            {poi.address || `${poi.lng.toFixed(3)}, ${poi.lat.toFixed(3)}`}
                          </p>
                          {(poi.rating || poi.tel) && (
                            <p className="text-[10px] mt-0.5" style={{ color: "rgba(200,150,48,0.75)" }}>
                              {poi.rating && `⭐ ${poi.rating}`}
                              {poi.rating && poi.tel && " · "}
                              {poi.tel}
                            </p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {/* ============ Step 2: 填写详情 ============ */}
        {step === "form" && picked && (
          <>
            <div className="flex-1 overflow-y-auto px-5 pb-4 flex flex-col gap-4">
              {/* 已选 POI */}
              <div
                className="rounded-xl px-3 py-2.5 flex items-center gap-3"
                style={{ background: "rgba(200,150,48,0.08)", border: "1px solid rgba(200,150,48,0.2)" }}
              >
                <div className="text-2xl">
                  {form.category === "餐饮" ? "🍜" : form.category === "住宿" ? "🏨" : form.category === "交通" ? "🚗" : "📍"}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-foreground truncate">{picked.name}</h3>
                  <p className="text-[10px] text-muted-foreground truncate">{picked.address}</p>
                  <p className="text-[10px]" style={{ color: "rgba(200,150,48,0.75)" }}>
                    📍 {picked.lng.toFixed(4)}, {picked.lat.toFixed(4)}
                  </p>
                </div>
              </div>

              {/* 时间 + 时长 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">计划时间</label>
                  <input
                    type="time"
                    value={form.scheduledTime}
                    onChange={e => setForm({ ...form, scheduledTime: e.target.value })}
                    className="w-full bg-card border border-border rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/60"
                    data-testid="input-add-time"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">时长(分钟)</label>
                  <input
                    type="number"
                    min={15} max={720} step={15}
                    value={form.duration}
                    onChange={e => setForm({ ...form, duration: Number(e.target.value) })}
                    className="w-full bg-card border border-border rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/60"
                    data-testid="input-add-duration"
                  />
                </div>
              </div>

              {/* 分类 + 天数 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">分类</label>
                  <div className="flex gap-1.5">
                    {CATEGORIES.map(c => (
                      <button
                        key={c}
                        onClick={() => setForm({ ...form, category: c })}
                        className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all active:scale-95 ${
                          form.category === c ? "text-primary-foreground" : "bg-muted text-muted-foreground"
                        }`}
                        style={form.category === c ? { background: "hsl(var(--primary))" } : {}}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">安排到</label>
                  <div className="flex gap-1.5 overflow-x-auto">
                    {Array.from({ length: Math.max(1, totalDays) }, (_, i) => i + 1).map(d => (
                      <button
                        key={d}
                        onClick={() => setForm({ ...form, day: d })}
                        className={`flex-shrink-0 min-w-[36px] py-2 px-3 rounded-lg text-xs font-medium transition-all active:scale-95 ${
                          form.day === d ? "text-primary-foreground" : "bg-muted text-muted-foreground"
                        }`}
                        style={form.day === d ? { background: "hsl(var(--primary))" } : {}}
                      >
                        D{d}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* 描述 */}
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                  描述 <span className="normal-case text-[9px]">(留空将使用 POI 地址)</span>
                </label>
                <textarea
                  rows={2}
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value.slice(0, 200) })}
                  placeholder={picked.address}
                  className="w-full bg-card border border-border rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/60 resize-none"
                />
              </div>

              {/* 避坑 */}
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">避坑提示（可选）</label>
                <textarea
                  rows={2}
                  value={form.pitfallTip}
                  onChange={e => setForm({ ...form, pitfallTip: e.target.value.slice(0, 200) })}
                  placeholder="如需要提前预约、避开高峰..."
                  className="w-full rounded-xl px-4 py-2.5 text-sm focus:outline-none resize-none"
                  style={{
                    border: "1px solid rgba(245,158,11,0.35)",
                    color: "rgba(245,158,11,0.9)",
                    background: "rgba(245,158,11,0.06)",
                  }}
                />
              </div>
            </div>

            <div className="px-5 pb-8 pt-2 border-t border-border">
              <button
                onClick={() => createMut.mutate()}
                disabled={createMut.isPending}
                className="w-full py-3.5 rounded-2xl text-sm font-semibold transition-all active:scale-95 disabled:opacity-50"
                style={{ background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}
                data-testid="btn-create-node"
              >
                {createMut.isPending ? "添加中..." : `✨ 添加到第 ${form.day} 天`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
