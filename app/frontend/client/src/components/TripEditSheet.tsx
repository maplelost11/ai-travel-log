import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Trip } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

interface Props {
  trip: Trip;
  onClose: () => void;
}

const EMOJI_PRESETS = ["🏜", "🐪", "⛰", "🏛", "🪔", "🎨", "🌅", "🌌", "🧭", "✨"];
const STATUS_OPTIONS: Array<{ v: Trip["status"]; label: string; color: string }> = [
  { v: "planning", label: "计划中", color: "#f59e0b" },
  { v: "active", label: "进行中", color: "#22c55e" },
  { v: "completed", label: "已完成", color: "#9ca3af" },
];

function addDays(isoDate: string, days: number): string {
  try {
    const d = new Date(isoDate);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  } catch {
    return isoDate;
  }
}

/**
 * 旅程元信息编辑：支持改标题、封面 emoji、目的地、起始日期、天数、状态。
 * 提供"删除旅程"便捷入口（带确认）。
 */
export default function TripEditSheet({ trip, onClose }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [form, setForm] = useState({
    title: trip.title,
    destination: trip.destination,
    coverEmoji: trip.coverEmoji || "🏜️",
    startDate: trip.startDate,
    totalDays: trip.totalDays ?? 3,
    status: trip.status,
  });

  // 派生 endDate：开始 + (totalDays - 1) 天
  const derivedEndDate = addDays(form.startDate, Math.max(0, form.totalDays - 1));

  const patch = useMutation({
    mutationFn: async (diff: Partial<Trip>) =>
      apiRequest<Trip>("PATCH", `/api/trips/${trip.id}`, diff),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/trips", trip.id] });
      qc.invalidateQueries({ queryKey: ["/api/trips"] });
      toast({ title: "旅程已更新", duration: 1500 });
      onClose();
    },
    onError: (e: Error) => {
      toast({ title: "更新失败", description: e.message, duration: 3000 });
    },
  });

  const del = useMutation({
    mutationFn: async () => apiRequest("DELETE", `/api/trips/${trip.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/trips"] });
      toast({ title: "旅程已删除", duration: 1500 });
      onClose();
      navigate("/main");
    },
  });

  const handleSave = () => {
    const diff: Partial<Trip> = {};
    if (form.title.trim() !== trip.title) diff.title = form.title.trim();
    if (form.destination.trim() !== trip.destination) diff.destination = form.destination.trim();
    if (form.coverEmoji !== (trip.coverEmoji || "🏜️")) diff.coverEmoji = form.coverEmoji;
    if (form.startDate !== trip.startDate) diff.startDate = form.startDate;
    if (form.totalDays !== (trip.totalDays ?? 3)) {
      diff.totalDays = Number(form.totalDays);
      diff.endDate = derivedEndDate;
    } else if (form.startDate !== trip.startDate) {
      diff.endDate = derivedEndDate;
    }
    if (form.status !== trip.status) diff.status = form.status;

    if (Object.keys(diff).length === 0) {
      toast({ title: "未修改", duration: 1200 });
      onClose();
      return;
    }
    if (!form.title.trim()) {
      toast({ title: "标题不能为空", duration: 2000 });
      return;
    }
    patch.mutate(diff);
  };

  const handleDelete = () => {
    if (!confirm(`确认删除旅程「${trip.title}」吗？所有节点和打卡也将一并删除。`)) return;
    del.mutate();
  };

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
          <h2 className="text-lg font-bold text-foreground">✏️ 编辑旅程</h2>
          <button onClick={onClose} className="text-muted-foreground text-sm">关闭</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-4 flex flex-col gap-4">
          {/* 封面 emoji */}
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">封面</label>
            <div className="flex items-center gap-3">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0"
                style={{ background: "rgba(200,150,48,0.1)", border: "1px solid rgba(200,150,48,0.25)" }}
              >
                {form.coverEmoji}
              </div>
              <div className="flex gap-1.5 flex-wrap flex-1">
                {EMOJI_PRESETS.map(e => (
                  <button
                    key={e}
                    onClick={() => setForm({ ...form, coverEmoji: e })}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-95 ${
                      form.coverEmoji === e ? "ring-2 ring-primary" : ""
                    }`}
                    style={{ background: "hsl(var(--muted))" }}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 标题 */}
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">标题</label>
            <input
              value={form.title}
              onChange={e => setForm({ ...form, title: e.target.value })}
              maxLength={50}
              className="w-full bg-card border border-border rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/60"
              data-testid="input-trip-title"
            />
          </div>

          {/* 目的地 */}
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">目的地</label>
            <input
              value={form.destination}
              onChange={e => setForm({ ...form, destination: e.target.value })}
              maxLength={40}
              className="w-full bg-card border border-border rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/60"
              data-testid="input-trip-destination"
            />
            <p className="text-[10px] text-muted-foreground mt-1">修改目的地不会重新生成节点坐标，已有节点保持原地</p>
          </div>

          {/* 起始日期 + 天数 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">开始日期</label>
              <input
                type="date"
                value={form.startDate}
                onChange={e => setForm({ ...form, startDate: e.target.value })}
                className="w-full bg-card border border-border rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/60"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">天数</label>
              <input
                type="number"
                min={1} max={30}
                value={form.totalDays}
                onChange={e => setForm({ ...form, totalDays: Number(e.target.value) })}
                className="w-full bg-card border border-border rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/60"
              />
            </div>
          </div>
          <div className="-mt-1 text-[10px] text-muted-foreground">
            结束日期自动计算：{derivedEndDate}
          </div>

          {/* 状态 */}
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">旅程状态</label>
            <div className="flex gap-2">
              {STATUS_OPTIONS.map(s => (
                <button
                  key={s.v}
                  onClick={() => setForm({ ...form, status: s.v })}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all active:scale-95 flex items-center justify-center gap-1.5 ${
                    form.status === s.v ? "text-foreground" : "text-muted-foreground"
                  }`}
                  style={{
                    background: form.status === s.v ? `${s.color}25` : "hsl(var(--muted))",
                    border: form.status === s.v ? `1px solid ${s.color}` : "1px solid transparent",
                  }}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="px-5 pb-8 pt-2 border-t border-border flex gap-3">
          <button
            onClick={handleDelete}
            disabled={del.isPending}
            className="px-4 py-3 rounded-2xl text-sm font-medium transition-all active:scale-95 disabled:opacity-50"
            style={{
              background: "rgba(239,68,68,0.12)",
              color: "#ef4444",
              border: "1px solid rgba(239,68,68,0.3)",
            }}
            data-testid="btn-delete-trip"
          >
            {del.isPending ? "删除中..." : "🗑 删除"}
          </button>
          <button
            onClick={handleSave}
            disabled={patch.isPending}
            className="flex-1 py-3 rounded-2xl text-sm font-semibold transition-all active:scale-95 disabled:opacity-50"
            style={{ background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}
            data-testid="btn-save-trip"
          >
            {patch.isPending ? "保存中..." : "✓ 保存修改"}
          </button>
        </div>
      </div>
    </div>
  );
}
