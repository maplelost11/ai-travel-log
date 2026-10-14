import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, API_BASE } from "@/lib/queryClient";
import type { Node, Checkin } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import PosterSheet from "./PosterSheet";

interface Props {
  node: Node;
  userNickname?: string;
  onClose: () => void;
  onDeleted?: () => void;
  existingCheckin?: Checkin | null;
}

type Step = "form" | "poster";

export default function CheckInSheet({ node, userNickname, onClose, onDeleted, existingCheckin }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 如果已有打卡，直接进入 poster 阶段；否则从 form 开始
  const [step, setStep] = useState<Step>(existingCheckin ? "poster" : "form");
  const [files, setFiles] = useState<File[]>([]);
  const [caption, setCaption] = useState("");
  const [uploadedUrls, setUploadedUrls] = useState<string[]>(() => {
    if (!existingCheckin) return [];
    try { return JSON.parse(existingCheckin.photos || "[]"); } catch { return []; }
  });
  const [checkin, setCheckin] = useState<Checkin | null>(existingCheckin || null);

  // ============ 图片选择 ============
  const handlePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files || []);
    const valid = list.filter(f => f.size <= 6 * 1024 * 1024); // 6MB 限制
    if (valid.length < list.length) {
      toast({ title: "部分照片过大", description: "单张超过 6MB 已被跳过", duration: 2500 });
    }
    setFiles(prev => [...prev, ...valid].slice(0, 9));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (idx: number) => setFiles(prev => prev.filter((_, i) => i !== idx));

  // ============ 提交：上传 + 创建 checkin ============
  const submitMut = useMutation({
    mutationFn: async () => {
      if (files.length === 0) {
        throw new Error("至少选择一张照片");
      }
      // 1. 上传
      const form = new FormData();
      files.forEach(f => form.append("photos", f));
      const upRes = await fetch(`${API_BASE}/api/upload`, {
        method: "POST",
        body: form,
      });
      if (!upRes.ok) throw new Error(`上传失败 ${upRes.status}`);
      const upData = (await upRes.json()) as { urls: string[]; count: number };

      // 2. 创建打卡
      const c = await apiRequest<Checkin>("POST", "/api/checkins", {
        nodeId: node.id,
        tripId: node.tripId,
        photos: JSON.stringify(upData.urls),
        caption: caption.trim(),
        createdAt: new Date().toISOString(),
      });

      return { checkin: c, urls: upData.urls };
    },
    onSuccess: ({ checkin, urls }) => {
      setUploadedUrls(urls);
      setCheckin(checkin);
      setStep("poster");
      qc.invalidateQueries({ queryKey: ["/api/checkins", node.tripId] });
      toast({ title: "打卡成功 ✨", description: "正在为你生成海报...", duration: 2000 });
    },
    onError: (err: Error) => {
      toast({ title: "打卡失败", description: err.message, duration: 3000 });
    },
  });

  // ============ 删除打卡 ============
  const deleteMut = useMutation({
    mutationFn: async () => {
      if (!checkin) return;
      await apiRequest("DELETE", `/api/checkins/${checkin.id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/checkins", node.tripId] });
      toast({ title: "已删除打卡", duration: 1500 });
      onDeleted?.();
      onClose();
    },
  });

  // ============ Poster 阶段 ============
  if (step === "poster" && checkin) {
    return (
      <PosterSheet
        node={node}
        checkin={checkin}
        photoUrls={uploadedUrls}
        userNickname={userNickname}
        onClose={onClose}
        onBack={existingCheckin ? undefined : () => setStep("form")}
        onDelete={() => deleteMut.mutate()}
        deleting={deleteMut.isPending}
      />
    );
  }

  // ============ Form 阶段 ============
  return (
    <div
      className="absolute inset-0 z-50 flex flex-col justify-end"
      style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="rounded-t-3xl slide-up overflow-hidden flex flex-col"
        style={{
          maxHeight: "92%",
          background: "hsl(var(--background))",
          borderTop: "1px solid rgba(200,150,48,0.2)",
        }}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ background: "rgba(200,150,48,0.3)" }} />
        </div>

        <div className="px-5 pt-2 pb-3 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground">📸 打卡</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {node.name} · {node.scheduledTime || "此刻"}
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground text-sm">关闭</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-4 flex flex-col gap-4">
          {/* 照片选择 */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">
              照片（最多 9 张）
            </label>
            <div className="grid grid-cols-3 gap-2">
              {files.map((f, i) => (
                <div
                  key={i}
                  className="relative aspect-square rounded-xl overflow-hidden"
                  style={{ border: "1px solid rgba(200,150,48,0.2)" }}
                >
                  <img
                    src={URL.createObjectURL(f)}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                  <button
                    onClick={() => removeFile(i)}
                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white text-xs"
                  >✕</button>
                </div>
              ))}
              {files.length < 9 && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="aspect-square rounded-xl flex flex-col items-center justify-center gap-1 transition-all active:scale-95"
                  style={{
                    background: "rgba(200,150,48,0.08)",
                    border: "1px dashed rgba(200,150,48,0.4)",
                    color: "rgba(200,150,48,0.75)",
                  }}
                  data-testid="btn-pick-photo"
                >
                  <span className="text-2xl">+</span>
                  <span className="text-[10px]">添加照片</span>
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handlePick}
            />
          </div>

          {/* 备注 */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">
              说点什么（可选）
            </label>
            <textarea
              value={caption}
              onChange={e => setCaption(e.target.value.slice(0, 140))}
              placeholder="比如：第一次见莫高窟的壁画，震撼无言..."
              rows={3}
              className="w-full bg-card border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:border-primary/60 resize-none"
              data-testid="input-caption"
            />
            <p className="text-right text-[10px] text-muted-foreground mt-1">{caption.length}/140</p>
          </div>

          {/* 节点信息预览 */}
          <div
            className="rounded-xl px-3 py-2.5 flex items-center gap-3"
            style={{ background: "rgba(200,150,48,0.06)", border: "1px solid rgba(200,150,48,0.15)" }}
          >
            <span className="text-xl">📍</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground truncate">{node.name}</p>
              <p className="text-[10px] text-muted-foreground">
                第{node.day}天 · {node.lat?.toFixed(3)}, {node.lng?.toFixed(3)}
              </p>
            </div>
          </div>
        </div>

        <div className="px-5 pb-8 pt-2 border-t border-border">
          <button
            onClick={() => submitMut.mutate()}
            disabled={files.length === 0 || submitMut.isPending}
            className="w-full py-4 rounded-2xl font-semibold text-sm transition-all active:scale-95 disabled:opacity-40 relative overflow-hidden"
            style={{ background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}
            data-testid="btn-submit-checkin"
          >
            {submitMut.isPending ? "上传中..." : "✨ 生成打卡海报"}
          </button>
        </div>
      </div>
    </div>
  );
}
