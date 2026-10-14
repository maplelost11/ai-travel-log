import { useState, useEffect, useRef } from "react";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, API_BASE } from "@/lib/queryClient";
import type { Trip } from "@shared/schema";

import mogaoImg from "@assets/mogao.jpg";
import mingshaImg from "@assets/mingsha.jpg";
import yumenImg from "@assets/yumen.jpg";
import yardangImg from "@assets/yardang.jpg";
import feitianImg from "@assets/feitian.jpg";

interface GeneratedNode {
  name: string;
  description: string;
  time: string;
  duration: number;
  day: number;
  category: string;
  pitfallTip: string;
  lat: number;
  lng: number;
}

interface AddTripSheetProps {
  onClose: () => void;
}

const DAY_OPTIONS = [1, 2, 3, 4, 5];
const PREFERENCE_OPTIONS = ["必打卡景点", "深度人文", "沙漠探险", "摄影创作", "美食体验", "亲子友好"];

// 生成页轮播的景点图
const GENERATE_SPOTS = [
  { img: mogaoImg, name: "莫高窟" },
  { img: mingshaImg, name: "鸣沙山" },
  { img: yumenImg, name: "玉门关" },
  { img: yardangImg, name: "雅丹" },
  { img: feitianImg, name: "飞天" },
];

export default function AddTripSheet({ onClose }: AddTripSheetProps) {
  const [step, setStep] = useState<"form" | "generating" | "preview">("form");
  const [title, setTitle] = useState("敦煌探索之旅");
  const [days, setDays] = useState(3);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return d.toISOString().split("T")[0];
  });
  const [prefs, setPrefs] = useState<string[]>(["必打卡景点"]);
  /** 可选：写给 AI 的个性化说明，会并入生成请求 */
  const [aiUserPrompt, setAiUserPrompt] = useState("");
  const [generatedNodes, setGeneratedNodes] = useState<GeneratedNode[]>([]);
  const [genProgress, setGenProgress] = useState(0);
  const [genTotal, setGenTotal] = useState(0);
  const [spotIdx, setSpotIdx] = useState(0);

  // ===== 真实进度追踪 =====
  type GenPhase = "connecting" | "researching" | "structurizing" | "streaming" | "done";
  const [phase, setPhase] = useState<GenPhase>("connecting");
  const [statusMessage, setStatusMessage] = useState("连接 AI 服务...");
  const [statusCount, setStatusCount] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const startedAtRef = useRef<number>(0);
  const structurizeStartRef = useRef<number | null>(null);
  // 驱动 structurize 阶段进度条平滑推进
  const [structurizeTick, setStructurizeTick] = useState(0);

  const qc = useQueryClient();

  // 背景景点图轮换（保留视觉节奏）
  useEffect(() => {
    if (step !== "generating") return;
    const interval = setInterval(() => {
      setSpotIdx(s => (s + 1) % GENERATE_SPOTS.length);
    }, 1500);
    return () => clearInterval(interval);
  }, [step]);

  // 秒表 + structurize 阶段进度推进
  useEffect(() => {
    if (step !== "generating") return;
    const timer = setInterval(() => {
      setElapsedSec(Math.round((Date.now() - startedAtRef.current) / 1000));
      if (phase === "structurizing") setStructurizeTick(t => t + 1);
    }, 500);
    return () => clearInterval(timer);
  }, [step, phase]);

  // ===== 进度百分比计算（基于阶段） =====
  const progressPercent = (() => {
    if (phase === "connecting") return 2;
    if (phase === "researching") {
      // 每条 status 事件推进，封顶 60%
      return Math.min(60, 5 + statusCount * 7);
    }
    if (phase === "structurizing") {
      // 40 秒内从 60% 爬到 80%；超过也不超过 79%
      const ms = structurizeStartRef.current ? Date.now() - structurizeStartRef.current : 0;
      return 60 + Math.min(19, (ms / 40000) * 20);
    }
    if (phase === "streaming") {
      const base = 80;
      if (genTotal > 0) return base + Math.min(19, (genProgress / genTotal) * 19);
      return base;
    }
    return 100;
  })();
  void structurizeTick; // 仅用于触发 progressPercent 的重新计算

  const createTrip = useMutation({
    mutationFn: async (data: Parameters<typeof apiRequest>[2]) => {
      const resp = await apiRequest<Trip>("POST", "/api/trips", data);
      return resp;
    },
  });

  const createNode = useMutation({
    mutationFn: async ({ tripId, node }: { tripId: number; node: GeneratedNode & { order: number } }) => {
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + days - 1);
      return apiRequest("POST", `/api/trips/${tripId}/nodes`, {
        ...node,
        scheduledTime: node.time,
        tripId,
      });
    },
  });

  const handleGenerate = async () => {
    setStep("generating");
    setGeneratedNodes([]);
    setGenProgress(0);
    setGenTotal(0);
    setSpotIdx(0);
    setPhase("connecting");
    setStatusMessage("连接 AI 服务...");
    setStatusCount(0);
    setElapsedSec(0);
    startedAtRef.current = Date.now();
    structurizeStartRef.current = null;

    const url = `${API_BASE}/api/ai/generate-itinerary`;

    try {
      const genBody: Record<string, unknown> = {
        destination: "敦煌",
        days,
        preferences: prefs,
        startDate,
      };
      const trimmedPrompt = aiUserPrompt.trim();
      if (trimmedPrompt) genBody.userPrompt = trimmedPrompt.slice(0, 800);

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(genBody),
      });

      if (!response.ok || !response.body) {
        setStatusMessage(`连接失败（${response.status}）`);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const line of parts) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));

            if (data.type === "status") {
              const msg = String(data.message || "");
              setStatusMessage(msg);
              setStatusCount(c => c + 1);
              // 识别 structurize 阶段：后端固定推送 "正在整理行程..."
              if (msg.includes("整理") || msg.includes("结构")) {
                setPhase("structurizing");
                structurizeStartRef.current = Date.now();
              } else if (phase === "connecting") {
                setPhase("researching");
              }
            } else if (data.type === "node") {
              setPhase("streaming");
              setGeneratedNodes(prev => [...prev, data.node]);
              setGenProgress(data.index + 1);
              setGenTotal(data.total);
              setStatusMessage(`正在接收节点 ${data.index + 1}/${data.total}: ${data.node?.name || ""}`);
            } else if (data.type === "done") {
              setPhase("done");
              setStatusMessage("行程已生成");
              setStep("preview");
            } else if (data.type === "error") {
              setStatusMessage(`生成失败：${data.message || "未知错误"}`);
            }
          } catch {
            /* ignore malformed chunk */
          }
        }
      }
    } catch (e) {
      setStatusMessage(`网络异常：${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleSave = async () => {
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + days - 1);

    const trip = await createTrip.mutateAsync({
      title,
      destination: "敦煌",
      startDate,
      endDate: endDate.toISOString().split("T")[0],
      coverEmoji: "🏜️",
      status: "planning",
      totalDays: days,
    });

    for (let i = 0; i < generatedNodes.length; i++) {
      await createNode.mutateAsync({ tripId: trip.id, node: { ...generatedNodes[i], order: i } });
    }

    await qc.invalidateQueries({ queryKey: ["/api/trips"] });
    onClose();
  };

  const nodesByDay: Record<number, GeneratedNode[]> = {};
  generatedNodes.forEach(n => {
    if (!nodesByDay[n.day]) nodesByDay[n.day] = [];
    nodesByDay[n.day].push(n);
  });

  const catColor: Record<string, string> = {
    "景点": "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400",
    "餐饮": "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400",
    "住宿": "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400",
    "交通": "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400",
  };

  return (
    <div
      className="absolute inset-0 z-50 flex flex-col justify-end"
      style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)" }}
    >
      <div
        className="rounded-t-3xl slide-up overflow-hidden flex flex-col"
        style={{
          maxHeight: "92%",
          background: "hsl(var(--background))",
          borderTop: "1px solid rgba(200,150,48,0.2)",
        }}
      >
        {/* 拖拽条 */}
        <div className="flex justify-center pt-3 pb-1">
          <div
            className="w-10 h-1 rounded-full"
            style={{ background: "rgba(200,150,48,0.3)" }}
          />
        </div>

        {/* ===== STEP: 表单 ===== */}
        {step === "form" && (
          <>
            <div className="px-5 pt-2 pb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-foreground">添加旅程</h2>
              <button onClick={onClose} className="text-muted-foreground text-sm">关闭</button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 pb-4 flex flex-col gap-5">
              {/* 旅程名称 */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">
                  旅程名称
                </label>
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="w-full bg-card border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:border-primary/60"
                  data-testid="input-trip-title"
                />
              </div>

              {/* 出发日期 */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">
                  出发日期
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="w-full bg-card border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none"
                  data-testid="input-start-date"
                />
              </div>

              {/* 天数选择 */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">
                  旅行天数
                </label>
                <div className="flex gap-2">
                  {DAY_OPTIONS.map(d => (
                    <button
                      key={d}
                      onClick={() => setDays(d)}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                        days === d
                          ? "text-primary-foreground"
                          : "bg-card border border-border text-muted-foreground"
                      }`}
                      style={days === d ? { background: "hsl(var(--primary))" } : {}}
                      data-testid={`btn-days-${d}`}
                    >
                      {d}天
                    </button>
                  ))}
                </div>
              </div>

              {/* 偏好 */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">
                  旅行偏好（可多选）
                </label>
                <div className="flex flex-wrap gap-2">
                  {PREFERENCE_OPTIONS.map(p => (
                    <button
                      key={p}
                      onClick={() => setPrefs(prev =>
                        prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]
                      )}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                        prefs.includes(p)
                          ? "text-primary-foreground"
                          : "bg-card border border-border text-muted-foreground"
                      }`}
                      style={prefs.includes(p) ? { background: "hsl(var(--primary))" } : {}}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* 个性化 AI 提示词（可选） */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">
                  个性化需求 <span className="normal-case font-normal text-muted-foreground/80">（可选）</span>
                </label>
                <textarea
                  value={aiUserPrompt}
                  onChange={e => setAiUserPrompt(e.target.value.slice(0, 800))}
                  rows={4}
                  maxLength={800}
                  placeholder="例如：带父母出行希望少走路；第一天一定要看鸣沙山日落；不吃羊肉；想安排半天博物馆深度讲解……"
                  className="w-full bg-card border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/60 resize-none leading-relaxed"
                  data-testid="input-ai-user-prompt"
                />
                <p className="text-[10px] text-muted-foreground mt-1.5 flex justify-between gap-2">
                  <span>会作为补充说明交给 AI，与上方偏好一起生效。</span>
                  <span className="tabular-nums flex-shrink-0">{aiUserPrompt.length}/800</span>
                </p>
              </div>
            </div>

            <div className="px-5 pb-8 pt-2 border-t border-border">
              <button
                onClick={handleGenerate}
                disabled={!title.trim()}
                className="w-full py-4 rounded-2xl font-semibold text-sm transition-all active:scale-95 disabled:opacity-40 relative overflow-hidden"
                style={{ background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}
                data-testid="btn-generate"
              >
                ✨ AI 生成行程
              </button>
            </div>
          </>
        )}

        {/* ===== STEP: 生成中 ===== */}
        {step === "generating" && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* 景点图片轮播 */}
            <div
              className="relative flex-shrink-0 overflow-hidden"
              style={{ height: "180px" }}
            >
              <div
                className="absolute inset-0 transition-all duration-1000"
                style={{
                  backgroundImage: `url(${GENERATE_SPOTS[spotIdx].img})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  filter: "brightness(0.35) saturate(0.55)",
                }}
              />
              <div
                className="absolute inset-0"
                style={{ background: "linear-gradient(to top, hsl(var(--background)) 0%, transparent 60%)" }}
              />
              {/* 中心文字 */}
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p
                  className="text-xs font-medium tracking-widest mb-1"
                  style={{ color: "rgba(200,150,48,0.7)" }}
                >
                  {GENERATE_SPOTS[spotIdx].name}
                </p>
                <div className="flex gap-1.5">
                  {GENERATE_SPOTS.map((_, i) => (
                    <div
                      key={i}
                      className="rounded-full transition-all duration-500"
                      style={{
                        width: i === spotIdx ? 14 : 4,
                        height: 4,
                        background: i === spotIdx ? "#c89630" : "rgba(255,255,255,0.2)",
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-8 pt-2 pb-6 flex flex-col items-center gap-5">
              <div className="w-full">
                <h3 className="text-center font-semibold text-foreground mb-1.5">AI 正在规划你的行程</h3>
                <p className="text-center text-muted-foreground text-sm leading-relaxed min-h-[20px]">
                  {statusMessage}
                </p>
                {phase === "structurizing" && (
                  <p className="text-center text-[11px] mt-1" style={{ color: "rgba(200,150,48,0.55)" }}>
                    AI 正在汇总节点详情，此阶段约需 30-40 秒，请耐心等待…
                  </p>
                )}
              </div>

              {/* 进度条 */}
              <div className="w-full">
                <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                  <span>
                    {phase === "streaming" && genTotal > 0
                      ? `生成节点 ${genProgress}/${genTotal}`
                      : phase === "structurizing"
                        ? "整理行程结构..."
                        : phase === "researching"
                          ? `调研目的地 · 已收到 ${statusCount} 条进度`
                          : "连接中..."}
                  </span>
                  <span>{Math.round(progressPercent)}% · {elapsedSec}s</span>
                </div>
                <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: "rgba(200,150,48,0.15)" }}>
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${progressPercent}%`,
                      background: "linear-gradient(to right, #a07020, #c89630)",
                    }}
                  />
                </div>
              </div>

              {/* 节点预览 */}
              {generatedNodes.length > 0 && (
                <div className="w-full max-h-44 overflow-y-auto flex flex-col gap-2">
                  {generatedNodes.map((n, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 rounded-xl px-3 py-2 onboard-enter"
                      style={{
                        background: "rgba(200,150,48,0.06)",
                        border: "1px solid rgba(200,150,48,0.15)",
                      }}
                    >
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                        style={{ background: "rgba(200,150,48,0.15)", color: "#c89630" }}
                      >
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{n.name}</p>
                        <p className="text-[10px] text-muted-foreground">第{n.day}天 · {n.time}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 加载点 */}
              <div className="flex gap-2">
                {[0, 1, 2].map(i => (
                  <div
                    key={i}
                    className="w-2 h-2 rounded-full ai-dot"
                    style={{ background: "#c89630", animationDelay: `${i * 0.2}s` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ===== STEP: 预览确认 ===== */}
        {step === "preview" && (
          <>
            {/* 预览头部 — 带景点图片 */}
            <div className="relative overflow-hidden" style={{ height: "100px" }}>
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage: `url(${mogaoImg})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center top",
                  filter: "brightness(0.3) saturate(0.5)",
                }}
              />
              <div
                className="absolute inset-0"
                style={{ background: "linear-gradient(to top, hsl(var(--background)) 0%, transparent 70%)" }}
              />
              <div className="absolute inset-0 flex items-center px-5 justify-between">
                <div>
                  <h2 className="text-lg font-bold text-white">行程已生成 ✨</h2>
                  <p
                    className="text-xs"
                    style={{ color: "rgba(200,150,48,0.7)" }}
                  >
                    {generatedNodes.length} 个节点 · 可在画布中编辑
                  </p>
                </div>
                <button
                  onClick={() => setStep("form")}
                  className="text-xs px-3 py-1.5 rounded-lg"
                  style={{
                    background: "rgba(200,150,48,0.15)",
                    color: "rgba(200,150,48,0.8)",
                    border: "1px solid rgba(200,150,48,0.25)",
                  }}
                >
                  重新生成
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 pb-4 flex flex-col gap-3">
              {Object.entries(nodesByDay).map(([day, dayNodes]) => (
                <div key={day}>
                  <div className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                    <div
                      className="h-px flex-1"
                      style={{ background: "linear-gradient(to right, rgba(200,150,48,0.3), transparent)" }}
                    />
                    <span style={{ color: "rgba(200,150,48,0.6)" }}>第 {day} 天</span>
                    <div
                      className="h-px flex-1"
                      style={{ background: "linear-gradient(to left, rgba(200,150,48,0.3), transparent)" }}
                    />
                  </div>
                  {dayNodes.map((n, i) => (
                    <div
                      key={i}
                      className="rounded-2xl p-3 mb-2"
                      style={{
                        background: "hsl(var(--card))",
                        border: "1px solid rgba(200,150,48,0.1)",
                      }}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-muted-foreground w-10">{n.time}</span>
                          <h4 className="text-sm font-semibold text-foreground">{n.name}</h4>
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${catColor[n.category] || catColor["景点"]}`}>
                          {n.category}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed mb-2 pl-12">{n.description}</p>
                      {n.pitfallTip && (
                        <div
                          className="ml-12 rounded-lg px-3 py-2"
                          style={{
                            background: "rgba(200,150,48,0.06)",
                            border: "1px solid rgba(200,150,48,0.2)",
                          }}
                        >
                          <p
                            className="text-xs leading-relaxed"
                            style={{ color: "rgba(200,150,48,0.75)" }}
                          >
                            {n.pitfallTip}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>

            <div className="px-5 pb-8 pt-2 border-t border-border flex gap-3"
              style={{ borderColor: "rgba(200,150,48,0.12)" }}
            >
              <button
                onClick={onClose}
                className="flex-1 py-3.5 rounded-2xl text-sm font-semibold bg-muted text-muted-foreground"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={createTrip.isPending}
                className="flex-2 px-6 py-3.5 rounded-2xl text-sm font-semibold transition-all active:scale-95 disabled:opacity-50 relative overflow-hidden"
                style={{ background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}
                data-testid="btn-save-trip"
              >
                {createTrip.isPending ? "保存中..." : "保存到行程 →"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
