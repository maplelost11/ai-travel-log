import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Trip, UserProfile } from "@shared/schema";
import { useLocation } from "wouter";
import AddTripSheet from "@/components/AddTripSheet";
import { useTheme } from "@/components/ThemeProvider";
import { useToast } from "@/hooks/use-toast";

// 景点图片映射
import mogaoImg from "@assets/mogao.jpg";
import mingshaImg from "@assets/mingsha.jpg";
import yumenImg from "@assets/yumen.jpg";
import yardangImg from "@assets/yardang.jpg";
import feitianImg from "@assets/feitian.jpg";

// 轮播图片数据
const HERO_SPOTS = [
  {
    img: mogaoImg,
    name: "莫高窟",
    subtitle: "千佛洞 · 世界文化遗产",
    pos: "center top",
  },
  {
    img: mingshaImg,
    name: "鸣沙山·月牙泉",
    subtitle: "沙中绿洲 · 千古奇观",
    pos: "center center",
  },
  {
    img: yumenImg,
    name: "玉门关",
    subtitle: "丝绸之路 · 汉代边塞",
    pos: "center center",
  },
];

// 景点封面图池（按关键词匹配）
const SPOT_IMAGES: Record<string, string> = {
  "莫高窟": mogaoImg,
  "鸣沙山": mingshaImg,
  "月牙泉": mingshaImg,
  "玉门关": yumenImg,
  "雅丹": yardangImg,
  "敦煌": mogaoImg,
};

function getSpotImage(title: string): string {
  for (const [key, img] of Object.entries(SPOT_IMAGES)) {
    if (title.includes(key)) return img;
  }
  return mogaoImg;
}

// ======================== 竹简卷轴图标（旅行计划）========================
function ScrollIcon({ active }: { active: boolean }) {
  const gold = active ? "rgba(200,150,48,1)" : "rgba(200,150,48,0.45)";
  const goldFill = active ? "rgba(200,150,48,0.18)" : "rgba(200,150,48,0.06)";
  return (
    <svg width="32" height="36" viewBox="0 0 32 36" fill="none" xmlns="http://www.w3.org/2000/svg"
      style={{ overflow: "visible", filter: active ? "drop-shadow(0 0 6px rgba(200,150,48,0.7))" : "none", transition: "filter 0.3s" }}>
      {/* 卷轴主体 */}
      <rect x="4" y="6" width="24" height="24" rx="1.5" fill={goldFill} stroke={gold} strokeWidth="1.2" />
      {/* 顶部卷轴滚轴 */}
      <rect x="2" y="4" width="28" height="4" rx="2" fill={goldFill} stroke={gold} strokeWidth="1" />
      {/* 底部卷轴滚轴 */}
      <rect x="2" y="28" width="28" height="4" rx="2" fill={goldFill} stroke={gold} strokeWidth="1" />
      {/* 两端木轴圆 */}
      <circle cx="2" cy="6" r="2" fill={gold} opacity="0.7" />
      <circle cx="30" cy="6" r="2" fill={gold} opacity="0.7" />
      <circle cx="2" cy="30" r="2" fill={gold} opacity="0.7" />
      <circle cx="30" cy="30" r="2" fill={gold} opacity="0.7" />
      {/* 丝路路线纹：横线 */}
      <line x1="8" y1="13" x2="24" y2="13" stroke={gold} strokeWidth="0.8" strokeDasharray="2 1.5" />
      <line x1="8" y1="18" x2="24" y2="18" stroke={gold} strokeWidth="0.8" strokeDasharray="2 1.5" />
      <line x1="8" y1="23" x2="24" y2="23" stroke={gold} strokeWidth="0.8" strokeDasharray="2 1.5" />
      {/* 路线上的地点节点 */}
      <circle cx="10" cy="18" r="1.5" fill={gold} opacity="0.8" />
      <circle cx="16" cy="13" r="1.5" fill={gold} opacity="0.8" />
      <circle cx="22" cy="23" r="1.5" fill={gold} opacity="0.8" />
      {/* 连接折线 */}
      <polyline points="10,18 16,13 22,23" stroke={gold} strokeWidth="0.9" fill="none" opacity="0.6" />
      {/* 突破底部边框的装饰竖轴 */}
      <rect x="14.5" y="30" width="3" height="7" rx="1.5" fill={gold} opacity="0.6" />
    </svg>
  );
}

// ======================== 敦煌莲花纹图标（添加旅程）========================
function LotusAddIcon() {
  const renderPetal = (rot: number, scale: number) => (
    <path
      key={rot}
      d="M 42 66 C 26 55, 34 30, 42 16 C 50 30, 58 55, 42 66 Z"
      transform={`translate(42, 66) rotate(${rot}) scale(${scale}) translate(-42, -66)`}
      fill="rgba(255, 208, 96, 0.08)"
      stroke="#ffe08a"
      strokeWidth={1.2 / scale}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );

  return (
    <svg width="84" height="84" viewBox="0 0 84 84" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ overflow: "visible" }}>
      {/* 柔弱发光底座背景 (不抢戏) */}
      <circle cx="42" cy="46" r="26" fill="#ffd060" opacity="0.08" filter="blur(8px)" />

      {/* 简单的莲叶底托, 横压稳定中心 */}
      <path d="M 42 68 C 22 68, 12 55, 22 60 C 30 63, 38 66, 42 66 C 46 66, 54 63, 62 60 C 72 55, 62 68, 42 68 Z"
        fill="rgba(255, 208, 96, 0.15)" stroke="#ffe08a" strokeWidth="1" />

      {/* ===== 空心发光线框薄羽莲瓣 ===== */}
      {/* 通过透明度的简单叠加形成天然纵深光晕 */}
      <g style={{ filter: "drop-shadow(0 0 4px rgba(255, 208, 96, 0.35))" }}>
        {[-65, 65].map(rot => renderPetal(rot, 0.65))}
        {[-45, 45].map(rot => renderPetal(rot, 0.8))}
        {[-25, 25].map(rot => renderPetal(rot, 0.92))}
        {renderPetal(0, 1)}
      </g>

      {/* 中心十字加号: 提供发光源 */}
      <path d="M40 50 L 44 50 M 42 48 L 42 52" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" style={{ filter: "drop-shadow(0 0 3px #ffffff)" }} />
    </svg>
  );
}

// ======================== 铜镜图标（我的）========================
function MirrorIcon({ active }: { active: boolean }) {
  const gold = active ? "rgba(200,150,48,1)" : "rgba(200,150,48,0.45)";
  const goldFill = active ? "rgba(200,150,48,0.18)" : "rgba(200,150,48,0.06)";
  return (
    <svg width="32" height="36" viewBox="0 0 32 36" fill="none" xmlns="http://www.w3.org/2000/svg"
      style={{ overflow: "visible", filter: active ? "drop-shadow(0 0 6px rgba(200,150,48,0.7))" : "none", transition: "filter 0.3s" }}>
      {/* 铜镜主体圆 */}
      <circle cx="16" cy="15" r="13" fill={goldFill} stroke={gold} strokeWidth="1.2" />
      {/* 镜内圆纹 */}
      <circle cx="16" cy="15" r="9" fill="none" stroke={gold} strokeWidth="0.7" strokeDasharray="1.5 1.5" />
      <circle cx="16" cy="15" r="5.5" fill="none" stroke={gold} strokeWidth="0.6" />
      {/* 镜钮（中心圆孔） */}
      <circle cx="16" cy="15" r="2.5" fill={gold} opacity="0.8" />
      <circle cx="16" cy="15" r="1.2" fill={goldFill} />
      {/* 四神纹（简化方向标记） */}
      <line x1="16" y1="3" x2="16" y2="6.5" stroke={gold} strokeWidth="0.9" />
      <line x1="16" y1="23.5" x2="16" y2="27" stroke={gold} strokeWidth="0.9" />
      <line x1="3" y1="15" x2="6.5" y2="15" stroke={gold} strokeWidth="0.9" />
      <line x1="25.5" y1="15" x2="29" y2="15" stroke={gold} strokeWidth="0.9" />
      {/* 斜向装饰刻线 */}
      <line x1="7" y1="6" x2="9" y2="8" stroke={gold} strokeWidth="0.7" opacity="0.6" />
      <line x1="25" y1="6" x2="23" y2="8" stroke={gold} strokeWidth="0.7" opacity="0.6" />
      <line x1="7" y1="24" x2="9" y2="22" stroke={gold} strokeWidth="0.7" opacity="0.6" />
      <line x1="25" y1="24" x2="23" y2="22" stroke={gold} strokeWidth="0.7" opacity="0.6" />
      {/* 镜柄 — 突破底部边框 */}
      <rect x="13.5" y="27" width="5" height="10" rx="2.5" fill={gold} opacity="0.55" />
      {/* 镜柄纹 */}
      <line x1="16" y1="29" x2="16" y2="35" stroke="rgba(12,10,9,0.4)" strokeWidth="0.8" strokeDasharray="1 1" />
    </svg>
  );
}

// ======================== 底部导航 (沉浸香盒/盛放金莲 终极版) ========================
function BottomNav({ tab, onTab }: { tab: string; onTab: (t: string) => void }) {
  // 极亮烈焰烫金光效
  const activeGold = "#ffd060";
  const inactiveGold = "rgba(255,208,96,0.25)";
  // 高温碳烤般的炽热金光特效
  const glowShadow = "drop-shadow(0 0 6px #fff9d6) drop-shadow(0 0 14px rgba(255,140,0,0.8))";

  // 古典缠枝祥云辅助装饰（减弱存在感，不显突兀）
  const SideCloudPattern = ({ flip = false }: { flip?: boolean }) => (
    <svg width="20" height="40" viewBox="0 0 20 40" fill="none" xmlns="http://www.w3.org/2000/svg"
      style={{ transform: flip ? "scaleX(-1)" : "none", filter: "drop-shadow(0 0 2px rgba(255,208,96,0.2))" }}>
      <path d="M 18 8 C 14 4, 6 6, 8 12 C 10 18, 14 14, 13 10" stroke="rgba(255,208,96,0.4)" strokeWidth="1" fill="none" />
      <path d="M 6 15 C 0 22, 4 30, 10 28 C 16 26, 12 18, 8 22" stroke="rgba(255,208,96,0.3)" strokeWidth="0.8" fill="none" />
      <path d="M 10 32 C 4 36, 10 42, 16 38" stroke="rgba(255,208,96,0.2)" strokeWidth="0.8" fill="none" />
    </svg>
  );

  return (
    <div
      className="absolute z-50 flex items-center justify-between px-6 pb-0 drop-shadow-2xl"
      style={{
        height: "82px",
        left: "14px", right: "14px", bottom: "24px", // 完全悬浮的胶囊盒设计，离底24px
        borderRadius: "44px", // 全包裹圆润感
        // 深海墨青渐变底盘，匹配参考图的中式暗色调
        background: "linear-gradient(135deg, #131a20 0%, #0c1116 50%, #161e26 100%)",
        border: "1px solid rgba(0,0,0,0.9)", // 本体暗角收边
        boxShadow: "0 15px 35px rgba(0,0,0,0.6), inset 0 2px 6px rgba(255,255,255,0.06)",
        overflow: "hidden"
      }}
    >
      {/* ===== 背景砂砾洒金皮面噪点纹理 (极致削弱使其若隐若现) ===== */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.12]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          mixBlendMode: "overlay"
        }}
      />

      {/* ===== 香盒嵌金回字边纹框 ===== */}
      <div
        className="absolute inset-0 pointer-events-none m-2 rounded-[36px]"
        style={{
          border: "1px solid rgba(255,208,96,0.3)",
          boxShadow: "inset 0 0 0 1px rgba(255,208,96,0.1), 0 0 8px rgba(255,208,96,0.1)"
        }}
      />

      {/* ===== 左侧栏：文字与祥云守护 ===== */}
      <div className="relative flex-1 flex justify-center items-center h-full">
        <div className="absolute left-2 opacity-80"><SideCloudPattern /></div>
        <button
          onClick={() => onTab("trips")}
          data-testid="nav-trips"
          className="flex flex-col items-center justify-center transition-all active:scale-95 relative z-10"
        >
          <svg width="50" height="52" viewBox="0 0 50 52" fill="none" xmlns="http://www.w3.org/2000/svg"
            style={{ filter: tab === "trips" ? glowShadow : "drop-shadow(0 0 3px rgba(255,208,96,0.15))", transition: "filter 0.4s ease" }}>
            <text x="25" y="24" textAnchor="middle" fontSize="24" fontFamily="'Zhi Mang Xing', cursive" fill={tab === "trips" ? activeGold : inactiveGold}>行</text>
            <text x="25" y="48" textAnchor="middle" fontSize="24" fontFamily="'Zhi Mang Xing', cursive" fill={tab === "trips" ? activeGold : inactiveGold}>程</text>
          </svg>
        </button>
        <div className="absolute right-2 opacity-80"><SideCloudPattern flip /></div>
      </div>

      {/* ===== 中央盛景大金莲 (不受框线局限，稍微靠上绽放) ===== */}
      <button
        onClick={() => onTab("add")}
        data-testid="nav-add"
        className="flex flex-col items-center justify-center transition-all active:scale-90 relative z-20 flex-shrink-0"
        style={{ marginTop: "-2px", padding: 0 }}
      >
        <LotusAddIcon />
      </button>

      {/* ===== 右侧栏：文字与祥云守护 ===== */}
      <div className="relative flex-1 flex justify-center items-center h-full">
        <div className="absolute left-2 opacity-80"><SideCloudPattern /></div>
        <button
          onClick={() => onTab("profile")}
          data-testid="nav-profile"
          className="flex flex-col items-center justify-center transition-all active:scale-95 relative z-10"
        >
          <svg width="50" height="52" viewBox="0 0 50 52" fill="none" xmlns="http://www.w3.org/2000/svg"
            style={{ filter: tab === "profile" ? glowShadow : "drop-shadow(0 0 3px rgba(255,208,96,0.15))", transition: "filter 0.4s ease" }}>
            <text x="25" y="24" textAnchor="middle" fontSize="24" fontFamily="'Zhi Mang Xing', cursive" fill={tab === "profile" ? activeGold : inactiveGold}>我</text>
            <text x="25" y="48" textAnchor="middle" fontSize="24" fontFamily="'Zhi Mang Xing', cursive" fill={tab === "profile" ? activeGold : inactiveGold}>的</text>
          </svg>
        </button>
        <div className="absolute right-2 opacity-80"><SideCloudPattern flip /></div>
      </div>

    </div>
  );
}

// ======================== 旅行计划卡片 ========================
function TripCard({ trip }: { trip: Trip }) {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();

  const del = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/trips/${trip.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/trips"] });
      toast({ title: "已删除旅程", duration: 1600 });
    },
    onError: (e: Error) => {
      toast({ title: "删除失败", description: e.message, duration: 2800 });
    },
  });

  const statusMap = {
    planning: { label: "规划中", color: "text-amber-300 bg-amber-900/40" },
    active: { label: "进行中", color: "text-green-300 bg-green-900/40" },
    completed: { label: "已完成", color: "text-stone-400 bg-stone-800/60" },
  };

  const s = statusMap[trip.status as keyof typeof statusMap] || statusMap.planning;
  const coverImg = getSpotImage(trip.title + (trip.destination || ""));

  return (
    <div
      className="group relative rounded-2xl overflow-hidden active:scale-[0.98] transition-transform cursor-pointer"
      style={{ height: "128px" }}
      onClick={() => navigate(`/trip/${trip.id}`)}
      data-testid={`card-trip-${trip.id}`}
    >
      {/* 背景图片 */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `url(${coverImg})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "brightness(0.35) saturate(0.6)",
        }}
      />
      {/* 暗色叠层 */}
      <div
        className="absolute inset-0"
        style={{
          background: "linear-gradient(135deg, rgba(12,10,9,0.88) 0%, rgba(12,10,9,0.35) 100%)",
        }}
      />
      {/* 壁画纹理叠层 */}
      <div
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage: `repeating-linear-gradient(90deg, transparent, transparent 60px, rgba(200,150,48,0.3) 61px, transparent 62px)`,
        }}
      />

      {/* 内容区 — 整体 flex 两栏布局 */}
      <div className="absolute inset-0 flex items-stretch px-4 py-3.5">
        {/* 左侧：文字信息 */}
        <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
          <h3 className="font-semibold text-[15px] leading-tight text-white truncate">
            {trip.title}
          </h3>
          <p className="text-xs font-medium" style={{ color: "rgba(200,150,48,0.75)" }}>
            {trip.destination} · {trip.totalDays}天
          </p>
          <p className="text-[11px] text-white/40 tracking-wide">
            {trip.startDate} → {trip.endDate}
          </p>
        </div>

        {/* 右侧：状态标签 + 删除按钮，纵向排列 */}
        <div className="flex flex-col items-end justify-between ml-3 flex-shrink-0">
          <span className={`text-[10px] px-2.5 py-1 rounded-full font-medium ${s.color}`}>
            {s.label}
          </span>
          <button
            type="button"
            disabled={del.isPending}
            className="opacity-0 group-hover:opacity-100 focus:opacity-100 w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-200 active:scale-90 disabled:opacity-40"
            style={{
              background: "rgba(200,150,48,0.08)",
              border: "1px solid rgba(200,150,48,0.25)",
            }}
            title="删除旅程"
            data-testid={`btn-delete-trip-${trip.id}`}
            onClick={e => {
              e.stopPropagation();
              e.preventDefault();
              if (!confirm(`确定删除「${trip.title}」？节点与打卡将一并删除。`)) return;
              del.mutate();
            }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              {/* 桶盖 */}
              <path d="M3 4h10" stroke="rgba(200,150,48,0.7)" strokeWidth="1.2" strokeLinecap="round" />
              {/* 盖把手 */}
              <path d="M6.5 4V3a1.5 1.5 0 0 1 3 0v1" stroke="rgba(200,150,48,0.6)" strokeWidth="1" strokeLinecap="round" />
              {/* 桶身 */}
              <path d="M4 4.5l.7 8.5a1 1 0 0 0 1 .9h4.6a1 1 0 0 0 1-.9l.7-8.5" stroke="rgba(200,150,48,0.65)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
              {/* 桶内竖线 */}
              <line x1="6.5" y1="6.5" x2="6.5" y2="11.5" stroke="rgba(200,150,48,0.4)" strokeWidth="0.8" strokeLinecap="round" />
              <line x1="9.5" y1="6.5" x2="9.5" y2="11.5" stroke="rgba(200,150,48,0.4)" strokeWidth="0.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* 右侧边缘光 */}
      <div
        className="absolute right-0 top-0 bottom-0 w-0.5 opacity-30"
        style={{ background: "linear-gradient(to bottom, transparent, #c89630, transparent)" }}
      />
    </div>
  );
}

// ======================== 主页 ========================
export default function Main() {
  const [tab, setTab] = useState("trips");
  const [showAdd, setShowAdd] = useState(false);
  const [heroIdx, setHeroIdx] = useState(0);
  const { theme, toggle } = useTheme();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const notImplemented = (feature: string) =>
    toast({ title: "功能暂未实现", description: `${feature}·后续补充中`, duration: 2200 });

  const { data: trips = [], isLoading } = useQuery<Trip[]>({
    queryKey: ["/api/trips"],
  });

  const { data: profile } = useQuery<UserProfile | null>({
    queryKey: ["/api/profile"],
  });

  const handleTab = (t: string) => {
    if (t === "add") { setShowAdd(true); return; }
    setTab(t);
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-stone-950 p-4">
      <div className="phone-frame relative" style={{ fontFamily: "var(--font-sans)" }}>
        {/* 状态栏 */}
        <div className="absolute top-0 left-0 right-0 h-12 flex items-center justify-between px-6 z-30 bg-transparent">
          <span className="text-white/60 text-xs font-medium">10:48</span>
          <div className="w-28 h-6 bg-black/40 rounded-full" />
          <button onClick={toggle} className="text-white/50 text-sm">
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
        </div>

        {/* 主内容区 */}
        <div className="absolute inset-0 pt-0 pb-20 overflow-hidden flex flex-col bg-background">

          {/* ===== 旅行计划 Tab ===== */}
          {tab === "trips" && (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* 头部 Hero Banner — 壁画风景点轮播 */}
              <div
                className="relative flex-shrink-0 overflow-hidden"
                style={{ height: "200px" }}
              >
                {/* 背景图片 */}
                <div
                  className="absolute inset-0 transition-all duration-700"
                  style={{
                    backgroundImage: `url(${HERO_SPOTS[heroIdx].img})`,
                    backgroundSize: "cover",
                    backgroundPosition: HERO_SPOTS[heroIdx].pos,
                    filter: "brightness(0.42) saturate(0.6)",
                  }}
                />
                {/* 底部渐变 */}
                <div
                  className="absolute bottom-0 left-0 right-0 h-20"
                  style={{ background: "linear-gradient(to top, hsl(var(--background)) 0%, transparent 100%)" }}
                />
                {/* 顶部状态栏渐变 */}
                <div
                  className="absolute top-0 left-0 right-0 h-16"
                  style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, transparent 100%)" }}
                />
                {/* 壁画纹理叠层 */}
                <div
                  className="absolute inset-0 opacity-15"
                  style={{
                    backgroundImage: `repeating-linear-gradient(88deg, transparent, transparent 80px, rgba(200,150,48,0.4) 81px, transparent 82px)`,
                  }}
                />

                {/* 文字内容 */}
                <div className="absolute bottom-6 left-5 right-5 flex items-end justify-between">
                  <div>
                    <p
                      className="text-xs mb-1 font-medium tracking-widest uppercase"
                      style={{ color: "rgba(200,150,48,0.8)" }}
                    >
                      {profile?.nickname ? `${profile.nickname}的旅行` : "我的旅行"}
                    </p>
                    <h1 className="text-xl font-bold text-white tracking-tight">
                      {HERO_SPOTS[heroIdx].name}
                    </h1>
                    <p className="text-xs text-white/45 mt-0.5">{HERO_SPOTS[heroIdx].subtitle}</p>
                  </div>
                  {/* 轮播指示点 */}
                  <div className="flex gap-1.5 pb-1">
                    {HERO_SPOTS.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setHeroIdx(i)}
                        className="rounded-full transition-all duration-300"
                        style={{
                          width: i === heroIdx ? 16 : 5,
                          height: 5,
                          background: i === heroIdx ? "#c89630" : "rgba(255,255,255,0.3)",
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* 快速入口 */}
              <div className="px-5 mb-3 mt-1 grid grid-cols-3 gap-2">
                {[
                  { label: "敦煌专线", img: mogaoImg },
                  { label: "30秒生成", img: yardangImg },
                  { label: "避坑指南", img: yumenImg },
                ].map(item => (
                  <button
                    key={item.label}
                    onClick={() => setShowAdd(true)}
                    className="relative rounded-xl overflow-hidden active:scale-95 transition-transform"
                    style={{ height: "68px" }}
                  >
                    {/* 背景图 */}
                    <div
                      className="absolute inset-0"
                      style={{
                        backgroundImage: `url(${item.img})`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                        filter: "brightness(0.35) saturate(0.5)",
                      }}
                    />
                    <div
                      className="absolute inset-0"
                      style={{ background: "linear-gradient(135deg, rgba(12,10,9,0.6) 0%, rgba(12,10,9,0.3) 100%)" }}
                    />
                    {/* 毛笔墨迹字，无emoji — 加深加粗、字距态 */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
                      {/* 毛笔字主体 */}
                      <svg width="64" height="22" viewBox="0 0 64 22" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <text
                          x="32" y="17"
                          textAnchor="middle"
                          fontSize="14"
                          fontFamily="'Noto Serif SC','STKaiti','KaiTi','楷体',serif"
                          fontWeight="900"
                          letterSpacing="2"
                          fill="rgba(180,120,40,0.92)"
                          style={{ fontStyle: "italic" }}
                        >{item.label}</text>
                      </svg>
                      {/* 墨线装饰 */}
                      <div style={{ width: "28px", height: "1px", background: "rgba(160,110,40,0.35)" }} />
                    </div>
                    {/* 底部金线 */}
                    <div
                      className="absolute bottom-0 left-2 right-2 h-px"
                      style={{ background: "rgba(200,150,48,0.4)" }}
                    />
                  </button>
                ))}
              </div>

              {/* 旅程列表 */}
              <div className="flex-1 overflow-y-auto px-5 pb-4 flex flex-col gap-3">
                {/* 列表标题 */}
                <div className="flex items-center gap-2">
                  <div
                    className="h-px flex-1"
                    style={{ background: "linear-gradient(to right, rgba(200,150,48,0.3), transparent)" }}
                  />
                  <span
                    className="text-xs font-medium tracking-widest"
                    style={{ color: "rgba(200,150,48,0.6)" }}
                  >
                    {trips.length > 0 ? `共 ${trips.length} 段旅程` : "开始你的旅程"}
                  </span>
                  <div
                    className="h-px flex-1"
                    style={{ background: "linear-gradient(to left, rgba(200,150,48,0.3), transparent)" }}
                  />
                </div>

                {isLoading ? (
                  [...Array(2)].map((_, i) => (
                    <div key={i} className="h-28 skeleton rounded-2xl" />
                  ))
                ) : trips.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    {/* 空状态 — 带背景图 */}
                    <div
                      className="w-full rounded-2xl overflow-hidden relative mb-4"
                      style={{ height: "140px" }}
                    >
                      <div
                        className="absolute inset-0"
                        style={{
                          backgroundImage: `url(${mingshaImg})`,
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                          filter: "brightness(0.3) saturate(0.5)",
                        }}
                      />
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <div className="text-4xl mb-2">🏔️</div>
                        <p
                          className="text-xs font-medium"
                          style={{ color: "rgba(200,150,48,0.7)" }}
                        >
                          诗和远方在等你
                        </p>
                      </div>
                    </div>
                    <h3 className="font-semibold text-foreground mb-1">还没有旅程</h3>
                    <p className="text-muted-foreground text-sm mb-4 max-w-[200px]">
                      点击下方「＋」按钮，用AI一键生成敦煌行程
                    </p>
                    <button
                      onClick={() => setShowAdd(true)}
                      className="px-6 py-3 rounded-2xl text-sm font-semibold transition-all active:scale-95"
                      style={{ background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}
                    >
                      添加第一段旅程
                    </button>
                  </div>
                ) : (
                  trips.map(trip => <TripCard key={trip.id} trip={trip} />)
                )}
              </div>
            </div>
          )}

          {/* ===== 我的 Tab ===== */}
          {tab === "profile" && (
            <div className="flex-1 overflow-y-auto">
              {/* 封面 — 飞天壁画全屏背景 */}
              <div
                className="relative flex items-end px-5 pb-5"
                style={{ height: "200px" }}
              >
                {/* 飞天壁画背景 */}
                <div
                  className="absolute inset-0"
                  style={{
                    backgroundImage: `url(${feitianImg})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center top",
                    filter: "brightness(0.38) saturate(0.6)",
                  }}
                />
                {/* 顶部状态栏遮罩 */}
                <div
                  className="absolute top-0 left-0 right-0 h-16"
                  style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, transparent 100%)" }}
                />
                {/* 底部渐变到背景色 */}
                <div
                  className="absolute bottom-0 left-0 right-0 h-24"
                  style={{ background: "linear-gradient(to top, hsl(var(--background)) 0%, transparent 100%)" }}
                />
                {/* 壁画纹理叠层 */}
                <div
                  className="absolute inset-0 opacity-20"
                  style={{
                    backgroundImage: `repeating-linear-gradient(92deg, transparent, transparent 60px, rgba(200,150,48,0.3) 61px, transparent 62px)`,
                  }}
                />

                {/* 用户信息 */}
                <div className="relative z-10 flex items-end gap-3">
                  <div
                    className="w-16 h-16 rounded-2xl flex items-center justify-center border"
                    style={{
                      background: "rgba(200,150,48,0.15)",
                      borderColor: "rgba(200,150,48,0.3)",
                      backdropFilter: "blur(8px)",
                    }}
                  >
                    {/* 司南图标：汉代磁勺+地盘，替代现代指南针emoji */}
                    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                      {/* 地盘：方形底座 */}
                      <rect x="4" y="4" width="32" height="32" rx="2" fill="rgba(200,150,48,0.12)" stroke="rgba(200,150,48,0.55)" strokeWidth="1" />
                      {/* 地盘：同心圆 */}
                      <circle cx="20" cy="20" r="12" fill="none" stroke="rgba(200,150,48,0.4)" strokeWidth="0.8" />
                      <circle cx="20" cy="20" r="8" fill="none" stroke="rgba(200,150,48,0.3)" strokeWidth="0.6" />
                      {/* 地盘：八方刻线（子午卯酉等） */}
                      <line x1="20" y1="8" x2="20" y2="12" stroke="rgba(200,150,48,0.6)" strokeWidth="0.8" />
                      <line x1="20" y1="28" x2="20" y2="32" stroke="rgba(200,150,48,0.6)" strokeWidth="0.8" />
                      <line x1="8" y1="20" x2="12" y2="20" stroke="rgba(200,150,48,0.6)" strokeWidth="0.8" />
                      <line x1="28" y1="20" x2="32" y2="20" stroke="rgba(200,150,48,0.6)" strokeWidth="0.8" />
                      <line x1="11.5" y1="11.5" x2="14.2" y2="14.2" stroke="rgba(200,150,48,0.4)" strokeWidth="0.7" />
                      <line x1="28.5" y1="11.5" x2="25.8" y2="14.2" stroke="rgba(200,150,48,0.4)" strokeWidth="0.7" />
                      <line x1="11.5" y1="28.5" x2="14.2" y2="25.8" stroke="rgba(200,150,48,0.4)" strokeWidth="0.7" />
                      <line x1="28.5" y1="28.5" x2="25.8" y2="25.8" stroke="rgba(200,150,48,0.4)" strokeWidth="0.7" />
                      {/* 磁勺：勺身（椭圆） */}
                      <ellipse cx="20" cy="21" rx="4" ry="5.5" fill="rgba(200,150,48,0.75)" stroke="rgba(200,150,48,0.9)" strokeWidth="0.5" />
                      {/* 磁勺：勺柄（指向南方，朝上） */}
                      <rect x="19.2" y="11.5" width="1.6" height="4.5" rx="0.8" fill="rgba(200,150,48,0.9)" />
                      {/* 勺头高光 */}
                      <ellipse cx="19.2" cy="19.5" rx="1.2" ry="1.8" fill="rgba(255,220,120,0.35)" />
                      {/* 中心点 */}
                      <circle cx="20" cy="20" r="1.2" fill="rgba(200,150,48,0.9)" />
                      {/* 南字标记（指向北极，勺柄朝南） */}
                      <text x="20" y="7" textAnchor="middle" fontSize="3.5" fill="rgba(200,150,48,0.8)" fontFamily="serif">南</text>
                      <text x="20" y="37" textAnchor="middle" fontSize="3.5" fill="rgba(200,150,48,0.5)" fontFamily="serif">北</text>
                    </svg>
                  </div>
                  <div className="mb-1">
                    <h2 className="text-white font-bold text-lg">{profile?.nickname || "旅行者"}</h2>
                    <p className="text-xs" style={{ color: "rgba(200,150,48,0.6)" }}>丝路探险者</p>
                  </div>
                </div>
              </div>

              {/* 统计卡片 */}
              <div
                className="mx-5 -mt-3 rounded-2xl p-4 grid grid-cols-3 gap-2 mb-4"
                style={{
                  background: "hsl(var(--card))",
                  border: "1px solid rgba(200,150,48,0.15)",
                  boxShadow: "0 0 0 1px hsl(var(--border))",
                }}
              >
                {[
                  { num: trips.length, label: "段旅程" },
                  { num: trips.filter(t => t.status === "completed").length, label: "已完成" },
                  { num: trips.length > 0 ? 1 : 0, label: "城市" },
                ].map(s => (
                  <div key={s.label} className="text-center">
                    <div
                      className="text-xl font-bold"
                      style={{ color: "hsl(var(--primary))" }}
                    >
                      {s.num}
                    </div>
                    <div className="text-[10px] text-muted-foreground">{s.label}</div>
                  </div>
                ))}
              </div>

              {/* 功能列表 */}
              <div className="mx-5 flex flex-col gap-2">
                {[
                  { icon: "⭐", label: "收藏的路线", right: "未实现", action: () => notImplemented("收藏路线") },
                  { icon: "📸", label: "旅行动线图", right: "未实现", action: () => notImplemented("动线导出") },
                  { icon: "🔔", label: "莫高窟票务提醒", right: "未实现", action: () => notImplemented("票务提醒") },
                  { icon: "🌙", label: "深色模式", right: theme === "dark" ? "已开" : "关闭", action: toggle },
                  { icon: "💬", label: "关于 · 反馈", right: "未实现", action: () => notImplemented("反馈") },
                ].map(item => (
                  <button
                    key={item.label}
                    onClick={item.action}
                    className="bg-card border border-border rounded-xl px-4 py-3 flex items-center justify-between active:scale-[0.98] transition-transform"
                    style={{ borderColor: "rgba(200,150,48,0.12)" }}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-base">{item.icon}</span>
                      <span className="text-sm text-foreground">{item.label}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{item.right}</span>
                  </button>
                ))}
              </div>

              <div className="pb-6" />
            </div>
          )}
        </div>

        {/* 底部导航 */}
        <BottomNav tab={tab} onTab={handleTab} />

        {/* 添加旅程抽屉 */}
        {showAdd && <AddTripSheet onClose={() => setShowAdd(false)} />}
      </div>
    </div>
  );
}
