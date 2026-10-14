import { useState } from "react";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import mogaoImg from "@assets/mogao.jpg";

const slides = [
  {
    emoji: "🏜️",
    bg: "from-amber-900/80 via-orange-800/60 to-amber-950",
    particles: ["✦", "✧", "⋆"],
    title: "即兴出发",
    subtitle: "不需要提前一个月规划",
    desc: "30秒生成敦煌专属行程，说走就走",
    accent: "#f59e0b",
  },
  {
    emoji: "🗺️",
    bg: "from-stone-900/80 via-orange-900/50 to-stone-950",
    particles: ["◦", "·", "○"],
    title: "动线画布",
    subtitle: "行程实时可视化",
    desc: "在地图上规划路线，突发变化一键重排，完成节点自动标记",
    accent: "#ef4444",
  },
  {
    emoji: "⚠️",
    bg: "from-red-950/80 via-amber-900/50 to-stone-950",
    particles: ["★", "☆", "✦"],
    title: "避坑指南",
    subtitle: "莫高窟抢票 · 包车价格 · 信号盲区",
    desc: "每个节点内嵌当地人才知道的真实踩坑提示",
    accent: "#f97316",
  },
];

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [nickname, setNickname] = useState("");
  const [entering, setEntering] = useState(false);
  const [, navigate] = useLocation();

  const isLast = step === slides.length;

  const next = () => {
    if (step < slides.length - 1) setStep(s => s + 1);
    else if (step === slides.length - 1) setStep(slides.length);
  };

  const handleStart = async () => {
    setEntering(true);
    try {
      await apiRequest("POST", "/api/profile", {
        nickname: nickname.trim() || "旅行者",
        avatar: "🧭",
        onboardingDone: 1,
      });
    } catch {}
    setTimeout(() => navigate("/main"), 500);
  };

  const slide = slides[step];

  return (
    <div className="flex items-center justify-center min-h-screen bg-stone-950 p-4">
      <div className="phone-frame relative overflow-hidden" style={{ background: "#0c0a09" }}>
        {/* 状态栏 */}
        <div className="absolute top-0 left-0 right-0 h-12 flex items-center justify-between px-6 z-20">
          <span className="text-white/60 text-xs font-medium">10:48</span>
          <div className="w-28 h-6 bg-black rounded-full" />
          <div className="flex gap-1 items-center">
            <div className="w-4 h-3 border border-white/60 rounded-sm relative">
              <div className="absolute left-0.5 top-0.5 bottom-0.5 w-2/3 bg-white/60 rounded-sm" />
            </div>
          </div>
        </div>

        {!isLast ? (
          /* ===== 引导幻灯片（前3页不动）===== */
          <div
            key={step}
            className={`absolute inset-0 bg-gradient-to-b ${slide.bg} flex flex-col`}
          >
            {/* 粒子背景 */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              {[...Array(18)].map((_, i) => (
                <div
                  key={i}
                  className="absolute text-white/10 sand-particle select-none"
                  style={{
                    left: `${(i * 37 + 5) % 95}%`,
                    top: `${(i * 53 + 10) % 85}%`,
                    fontSize: `${8 + (i % 6) * 4}px`,
                    animationDelay: `${(i * 0.4) % 4}s`,
                  }}
                >
                  {slide.particles[i % slide.particles.length]}
                </div>
              ))}
            </div>

            {/* 内容区 */}
            <div className="flex-1 flex flex-col items-center justify-center px-8 pt-16">
              <div
                className="onboard-enter text-8xl mb-8 select-none"
                style={{ textShadow: `0 0 40px ${slide.accent}40` }}
              >
                {slide.emoji}
              </div>

              <div className="onboard-enter-delay-1 text-center">
                <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">{slide.title}</h1>
                <p className="text-sm font-medium mb-4" style={{ color: slide.accent }}>{slide.subtitle}</p>
                <p className="text-white/60 text-sm leading-relaxed max-w-xs">{slide.desc}</p>
              </div>
            </div>

            {/* 底部 */}
            <div className="onboard-enter-delay-2 px-8 pb-12 flex flex-col gap-4">
              <div className="flex justify-center gap-2">
                {slides.map((_, i) => (
                  <div
                    key={i}
                    className="rounded-full transition-all duration-300"
                    style={{
                      width: i === step ? 24 : 6,
                      height: 6,
                      background: i === step ? slide.accent : "rgba(255,255,255,0.3)",
                    }}
                  />
                ))}
              </div>

              <button
                onClick={next}
                className="w-full py-4 rounded-2xl font-semibold text-sm text-white transition-all active:scale-95"
                style={{ background: slide.accent }}
                data-testid="btn-next-slide"
              >
                {step === slides.length - 1 ? "开始旅程 →" : "继续"}
              </button>

              <button
                onClick={() => setStep(slides.length)}
                className="text-white/30 text-xs text-center hover:text-white/50 transition-colors"
              >
                跳过引导
              </button>
            </div>
          </div>
        ) : (
          /* ===== 第4页：你好旅行者 — 莫高窟全屏背景 ===== */
          <div className="absolute inset-0 flex flex-col overflow-hidden">

            {/* 莫高窟全屏背景图 */}
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: `url(${mogaoImg})`,
                backgroundSize: "cover",
                backgroundPosition: "center top",
                filter: "brightness(0.45) saturate(0.7)",
              }}
            />

            {/* 壁画裂纹质感叠层 */}
            <div
              className="absolute inset-0 opacity-30"
              style={{
                background: `
                  repeating-linear-gradient(
                    92deg,
                    transparent,
                    transparent 120px,
                    rgba(0,0,0,0.08) 121px,
                    transparent 122px
                  ),
                  repeating-linear-gradient(
                    178deg,
                    transparent,
                    transparent 80px,
                    rgba(0,0,0,0.06) 81px,
                    transparent 82px
                  )
                `,
              }}
            />

            {/* 底部向上渐变遮罩，让文字区可读 */}
            <div
              className="absolute bottom-0 left-0 right-0"
              style={{
                height: "70%",
                background: "linear-gradient(to top, rgba(12,10,9,0.97) 0%, rgba(12,10,9,0.85) 40%, transparent 100%)",
              }}
            />

            {/* 顶部光晕 */}
            <div
              className="absolute top-0 left-0 right-0 h-40 opacity-20"
              style={{
                background: "radial-gradient(ellipse at 50% -10%, #c8963060, transparent 70%)",
              }}
            />

            {/* 内容区 */}
            <div className="relative z-10 flex-1 flex flex-col justify-end px-8 pb-0">
              {/* 上方：景点文字装饰 */}
              <div className="mb-auto pt-20 flex flex-col items-center">
                {/* 小装饰标签 */}
                <div
                  className="onboard-enter inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-6"
                  style={{
                    background: "rgba(200,150,48,0.15)",
                    border: "1px solid rgba(200,150,48,0.3)",
                  }}
                >
                  <span className="text-xs" style={{ color: "#c89630" }}>莫高窟</span>
                  <span className="text-white/30 text-xs">·</span>
                  <span className="text-xs text-white/50">敦煌千年</span>
                </div>

                {/* 主标题 */}
                <div className="onboard-enter-delay-1 text-center">
                  <h1
                    className="font-bold text-white mb-3 tracking-widest"
                    style={{
                      fontSize: "28px",
                      textShadow: "0 2px 20px rgba(0,0,0,0.8)",
                      letterSpacing: "0.15em",
                    }}
                  >
                    你好，旅行者
                  </h1>
                  <p
                    className="text-sm leading-relaxed max-w-[240px] mx-auto"
                    style={{
                      color: "rgba(220,180,120,0.7)",
                      textShadow: "0 1px 8px rgba(0,0,0,0.6)",
                    }}
                  >
                    给自己起个旅途名字吧
                  </p>
                </div>
              </div>

              {/* 引号诗句 */}
              <div
                className="onboard-enter-delay-2 text-center py-8"
                style={{ color: "rgba(200,150,48,0.45)", fontSize: "11px", letterSpacing: "0.12em" }}
              >
                「大漠孤烟直，长河落日圆」
              </div>
            </div>

            {/* 底部输入区 */}
            <div className="relative z-10 px-6 pb-10 flex flex-col gap-4">
              {/* 分割线 */}
              <div
                className="onboard-enter-delay-2 h-px w-full mb-1"
                style={{ background: "linear-gradient(to right, transparent, rgba(200,150,48,0.3), transparent)" }}
              />

              <div className="onboard-enter-delay-2">
                <div
                  className="relative rounded-2xl overflow-hidden"
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(200,150,48,0.2)",
                  }}
                >
                  {/* 内部微光 */}
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      background: "linear-gradient(135deg, rgba(200,150,48,0.04) 0%, transparent 60%)",
                    }}
                  />
                  <input
                    type="text"
                    placeholder="比如：大漠行者、飞天客..."
                    value={nickname}
                    onChange={e => setNickname(e.target.value)}
                    maxLength={12}
                    className="relative w-full bg-transparent px-5 py-4 text-white placeholder:text-white/25 text-sm focus:outline-none"
                    style={{ caretColor: "#c89630" }}
                    data-testid="input-nickname"
                  />
                </div>
                <p className="text-white/20 text-xs mt-1.5 text-right pr-1">{nickname.length}/12</p>
              </div>

              <button
                onClick={handleStart}
                disabled={entering}
                className="onboard-enter-delay-3 w-full py-4 rounded-2xl font-semibold text-sm transition-all active:scale-95 disabled:opacity-50 relative overflow-hidden"
                style={{
                  background: "linear-gradient(135deg, #c89630 0%, #a07020 100%)",
                  color: "#0c0a09",
                  boxShadow: "0 4px 24px rgba(200,150,48,0.35)",
                }}
                data-testid="btn-start"
              >
                {/* 按钮内光效 */}
                <div
                  className="absolute inset-0 opacity-30"
                  style={{
                    background: "linear-gradient(135deg, rgba(255,255,255,0.3) 0%, transparent 60%)",
                  }}
                />
                <span className="relative z-10">
                  {entering ? "进入中..." : "踏上旅途 →"}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 桌面端提示 */}
      <div className="hidden md:block absolute bottom-6 text-white/30 text-xs">
        这是一个安卓App的交互原型 · 390×844 px
      </div>
    </div>
  );
}
