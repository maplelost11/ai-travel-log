import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Node } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

interface Props {
  node: Node;
  totalDays: number;
  onClose: () => void;
}

const CATEGORIES = ["景点", "餐饮", "住宿", "交通"] as const;
const STATUSES: Array<{ v: Node["status"]; label: string; color: string }> = [
  { v: "pending", label: "待去", color: "#f59e0b" },
  { v: "active", label: "进行中", color: "#22c55e" },
  { v: "done", label: "已完成", color: "#9ca3af" },
  { v: "skipped", label: "已跳过", color: "#ef4444" },
];

/**
 * 节点自由编辑：支持修改名称/时间/时长/分类/描述/避坑/天数/状态。
 * 坐标只读（修改坐标需要重新地理编码，从"编辑现有节点"流程分离）。
 */
export default function NodeEditSheet({ node, totalDays, onClose }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [form, setForm] = useState({
    name: node.name,
    scheduledTime: node.scheduledTime || "",
    duration: node.duration ?? 120,
    category: (node.category || "景点") as string,
    description: node.description || "",
    pitfallTip: node.pitfallTip || "",
    day: node.day ?? 1,
    status: node.status,
  });

  const patch = useMutation({
    mutationFn: async (diff: Partial<Node>) =>
      apiRequest<Node>("PATCH", `/api/nodes/${node.id}`, diff),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/trips", node.tripId, "nodes"] });
      toast({ title: "已保存", duration: 1500 });
      onClose();
    },
    onError: (e: Error) => {
      toast({ title: "保存失败", description: e.message, duration: 3000 });
    },
  });

  const del = useMutation({
    mutationFn: async () => apiRequest("DELETE", `/api/nodes/${node.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/trips", node.tripId, "nodes"] });
      toast({ title: "节点已删除", duration: 1500 });
      onClose();
    },
  });

  const handleSave = () => {
    const diff: Partial<Node> = {};
    if (form.name !== node.name) diff.name = form.name.trim();
    if (form.scheduledTime !== (node.scheduledTime || "")) diff.scheduledTime = form.scheduledTime;
    if (form.duration !== node.duration) diff.duration = Number(form.duration);
    if (form.category !== (node.category || "景点")) diff.category = form.category;
    if (form.description !== (node.description || "")) diff.description = form.description;
    if (form.pitfallTip !== (node.pitfallTip || "")) diff.pitfallTip = form.pitfallTip;
    if (form.day !== (node.day ?? 1)) diff.day = Number(form.day);
    if (form.status !== node.status) diff.status = form.status;

    if (Object.keys(diff).length === 0) {
      toast({ title: "未修改", duration: 1500 });
      onClose();
      return;
    }
    if (!form.name.trim()) {
      toast({ title: "名称不能为空", duration: 2000 });
      return;
    }
    patch.mutate(diff);
  };

  const handleDelete = () => {
    if (!confirm(`确认删除「${node.name}」吗？该操作无法撤销。`)) return;
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
          <div>
            <h2 className="text-lg font-bold text-foreground">✏️ 编辑节点</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              第{node.day}天 · 顺序 {node.order + 1} · 坐标 {node.lat?.toFixed(3)},{node.lng?.toFixed(3)}
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground text-sm" data-testid="btn-edit-close">关闭</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-4 flex flex-col gap-4">
          {/* 名称 */}
          <Field label="名称">
            <input
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              maxLength={40}
              className="w-full bg-card border border-border rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/60"
              data-testid="input-edit-name"
            />
          </Field>

          {/* 时间 + 时长 一行 */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="计划时间">
              <input
                type="time"
                value={form.scheduledTime}
                onChange={e => setForm({ ...form, scheduledTime: e.target.value })}
                className="w-full bg-card border border-border rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/60"
                data-testid="input-edit-time"
              />
            </Field>
            <Field label="时长(分钟)">
              <input
                type="number"
                min={15}
                max={720}
                step={15}
                value={form.duration}
                onChange={e => setForm({ ...form, duration: Number(e.target.value) })}
                className="w-full bg-card border border-border rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/60"
                data-testid="input-edit-duration"
              />
            </Field>
          </div>

          {/* 分类 + 天数 */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="分类">
              <div className="flex gap-1.5">
                {CATEGORIES.map(c => (
                  <button
                    key={c}
                    onClick={() => setForm({ ...form, category: c })}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all active:scale-95 ${
                      form.category === c
                        ? "text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                    style={form.category === c ? { background: "hsl(var(--primary))" } : {}}
                    data-testid={`btn-category-${c}`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="所属天数">
              <div className="flex gap-1.5 overflow-x-auto">
                {Array.from({ length: Math.max(1, totalDays) }, (_, i) => i + 1).map(d => (
                  <button
                    key={d}
                    onClick={() => setForm({ ...form, day: d })}
                    className={`flex-shrink-0 min-w-[36px] py-2 px-3 rounded-lg text-xs font-medium transition-all active:scale-95 ${
                      form.day === d
                        ? "text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                    style={form.day === d ? { background: "hsl(var(--primary))" } : {}}
                    data-testid={`btn-day-${d}`}
                  >
                    D{d}
                  </button>
                ))}
              </div>
            </Field>
          </div>

          {/* 状态 */}
          <Field label="当前状态">
            <div className="flex gap-2">
              {STATUSES.map(s => (
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
                  data-testid={`btn-status-${s.v}`}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />
                  {s.label}
                </button>
              ))}
            </div>
          </Field>

          {/* 描述 */}
          <Field label="描述">
            <textarea
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value.slice(0, 200) })}
              rows={2}
              placeholder="简短描述这个节点..."
              className="w-full bg-card border border-border rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/60 resize-none"
              data-testid="input-edit-description"
            />
            <p className="text-right text-[10px] text-muted-foreground mt-1">{form.description.length}/200</p>
          </Field>

          {/* 避坑提示 */}
          <Field label="避坑提示">
            <textarea
              value={form.pitfallTip}
              onChange={e => setForm({ ...form, pitfallTip: e.target.value.slice(0, 200) })}
              rows={2}
              placeholder="如门票预约、最佳时段、人流高峰等..."
              className="w-full bg-card rounded-xl px-4 py-2.5 text-sm focus:outline-none resize-none"
              style={{
                border: "1px solid rgba(245,158,11,0.35)",
                color: "rgba(245,158,11,0.9)",
                background: "rgba(245,158,11,0.06)",
              }}
              data-testid="input-edit-pitfall"
            />
          </Field>
        </div>

        {/* 操作栏 */}
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
            data-testid="btn-delete-node"
          >
            {del.isPending ? "删除中..." : "🗑 删除"}
          </button>
          <button
            onClick={handleSave}
            disabled={patch.isPending}
            className="flex-1 py-3 rounded-2xl text-sm font-semibold transition-all active:scale-95 disabled:opacity-50"
            style={{ background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}
            data-testid="btn-save-node"
          >
            {patch.isPending ? "保存中..." : "✓ 保存修改"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
        {label}
      </label>
      {children}
    </div>
  );
}
