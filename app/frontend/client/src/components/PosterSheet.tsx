import { useRef, useState } from "react";
import html2canvas from "html2canvas";
import { API_BASE } from "@/lib/queryClient";
import type { Node, Checkin } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

interface Props {
  node: Node;
  checkin: Checkin;
  photoUrls: string[];
  userNickname?: string;
  onClose: () => void;
  onBack?: () => void;
  onDelete?: () => void;
  deleting?: boolean;
}

/**
 * 海报展示：
 *  - 顶部：静态地图背景 + 节点标记 + 简要信息
 *  - 中部：照片网格（1/2/3/4 张做自适应布局）
 *  - 底部：日期 + 昵称 + App 品牌水印 + 备注
 *  - 操作：保存为图片 / 删除
 */
export default function PosterSheet({
  node, checkin, photoUrls, userNickname, onClose, onBack, onDelete, deleting,
}: Props) {
  const posterRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const { toast } = useToast();

  const mapUrl = (() => {
    if (typeof node.lat !== "number" || typeof node.lng !== "number") return "";
    // 通过后端代理静态地图；使用数字 1 标签，深色样式不支持这里就用默认
    const params = new URLSearchParams({
      location: `${node.lng},${node.lat}`,
      zoom: "13",
      size: "600*300",
      markers: `mid,0xc89630,A:${node.lng},${node.lat}`,
    });
    return `${API_BASE}/api/map/static?${params}`;
  })();

  const dateStr = (() => {
    try {
      const d = new Date(checkin.createdAt);
      return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
    } catch { return checkin.createdAt; }
  })();

  const absPhotos = photoUrls.map(u => (u.startsWith("http") ? u : `${API_BASE}${u}`));

  const handleDownload = async () => {
    if (!posterRef.current) return;
    setDownloading(true);
    try {
      const canvas = await html2canvas(posterRef.current, {
        backgroundColor: "#0c0a09",
        scale: 2,
        useCORS: true,
        logging: false,
      });
      canvas.toBlob(blob => {
        if (!blob) throw new Error("截图失败");
        const link = document.createElement("a");
        link.download = `dunhuang-checkin-${checkin.id}.png`;
        link.href = URL.createObjectURL(blob);
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 2000);
        toast({ title: "海报已保存", description: "文件已下载到默认目录", duration: 2000 });
      }, "image/png");
    } catch (e) {
      toast({
        title: "生成失败",
        description: e instanceof Error ? e.message : String(e),
        duration: 3000,
      });
    } finally {
      setDownloading(false);
    }
  };

  // 照片网格类名（根据数量自适应）
  const gridClass = (() => {
    const n = absPhotos.length;
    if (n <= 1) return "grid-cols-1";
    if (n === 2 || n === 4) return "grid-cols-2"; // 微信朋友圈: 4张图用 2x2 布局
    return "grid-cols-3"; // 3, 5, 6, 7, 8, 9 张采用 3x3 布局
  })();

  return (
    <div
      className="absolute inset-0 z-50 flex flex-col justify-end"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="rounded-t-3xl slide-up overflow-hidden flex flex-col"
        style={{
          maxHeight: "95%",
          background: "hsl(var(--background))",
          borderTop: "1px solid rgba(200,150,48,0.25)",
        }}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ background: "rgba(200,150,48,0.3)" }} />
        </div>

        <div className="px-5 pt-2 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {onBack && (
              <button onClick={onBack} className="text-sm text-muted-foreground">← 返回</button>
            )}
            <h2 className="text-lg font-bold text-foreground">打卡海报</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground text-sm">关闭</button>
        </div>

        {/* 海报预览 */}
        <div className="flex-1 overflow-y-auto px-5 pb-4">
          <div
            ref={posterRef}
            className="relative rounded-2xl overflow-hidden"
            style={{
              background: "linear-gradient(180deg, #1a130a 0%, #0c0a09 100%)",
              border: "1px solid rgba(200,150,48,0.25)",
            }}
          >
            {/* 顶部：静态地图 */}
            <div className="relative" style={{ height: 180 }}>
              {mapUrl ? (
                <img
                  src={mapUrl}
                  alt="map"
                  crossOrigin="anonymous"
                  className="w-full h-full object-cover"
                  style={{ filter: "brightness(0.55) saturate(1.1)" }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
                  暂无坐标
                </div>
              )}
              {/* 渐变遮罩 */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: "linear-gradient(to bottom, rgba(0,0,0,0.2) 0%, transparent 40%, rgba(12,10,9,0.9) 100%)",
                }}
              />
              {/* 节点信息浮层 */}
              <div className="absolute left-4 right-4 bottom-4 flex items-end justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div
                    style={{
                      color: "#e8c878",
                      fontSize: "12px",
                      fontWeight: "600",
                      marginBottom: "4px",
                      textShadow: "0 1px 4px rgba(0,0,0,0.8)",
                    }}
                  >
                    第 {node.day} 天 · {node.scheduledTime || "打卡"}
                  </div>
                  <h3 
                    className="text-white font-bold" 
                    style={{ 
                      fontSize: "20px",
                      textShadow: "0 2px 12px rgba(0,0,0,0.8)",
                      lineHeight: "1.4",
                      wordBreak: "break-word"
                    }}
                  >
                    {node.name}
                  </h3>
                </div>
                <div className="text-right text-[10px] flex-shrink-0" style={{ color: "rgba(200,150,48,0.8)", lineHeight: "1.5" }}>
                  <div>📍 {node.lat?.toFixed(3)}</div>
                  <div>{node.lng?.toFixed(3)}</div>
                </div>
              </div>
            </div>

            {/* 中部：照片网格 */}
            {absPhotos.length > 0 && (
              <div className="px-4 py-4">
                <div className={`grid ${gridClass} gap-2`}>
                  {absPhotos.slice(0, 9).map((url, i) => {
                    const isSingle = absPhotos.length === 1;
                    return (
                      <div
                        key={i}
                        className={`rounded-lg overflow-hidden ${isSingle ? 'max-h-[420px] flex justify-center bg-black/40' : 'aspect-square'}`}
                        style={{ border: "1px solid rgba(200,150,48,0.15)" }}
                      >
                        <img
                          src={url}
                          alt=""
                          crossOrigin="anonymous"
                          className={`w-full ${isSingle ? 'h-auto max-h-[420px] object-contain' : 'h-full object-cover'}`}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 底部：备注 + 签名 */}
            <div className="px-4 pb-5 pt-1">
              {checkin.caption && (
                <p className="text-sm leading-relaxed mb-3" style={{ color: "rgba(232,200,120,0.88)" }}>
                  {checkin.caption}
                </p>
              )}
              <div
                className="flex items-end justify-between pt-3"
                style={{ borderTop: "1px solid rgba(200,150,48,0.18)" }}
              >
                <div>
                  <div className="text-[10px]" style={{ color: "rgba(200,150,48,0.55)" }}>
                    记录人
                  </div>
                  <div className="text-sm font-semibold" style={{ color: "#e8c878" }}>
                    {userNickname || "旅行者"}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px]" style={{ color: "rgba(200,150,48,0.55)" }}>
                    AI 旅游 Log
                  </div>
                  <div className="text-sm font-mono" style={{ color: "#e8c878" }}>{dateStr}</div>
                </div>
              </div>
            </div>

            {/* 装饰：壁画纹理 */}
            <div
              className="absolute inset-0 pointer-events-none opacity-[0.05]"
              style={{
                background: `repeating-linear-gradient(88deg, transparent, transparent 80px, #c89630 81px, transparent 82px)`,
              }}
            />
          </div>
        </div>

        {/* 操作栏 */}
        <div className="px-5 pb-8 pt-2 border-t border-border flex gap-3">
          {onDelete && (
            <button
              onClick={onDelete}
              disabled={deleting}
              className="px-4 py-3.5 rounded-2xl text-sm font-medium bg-muted text-muted-foreground active:scale-95 disabled:opacity-50"
              data-testid="btn-delete-checkin"
            >
              {deleting ? "..." : "🗑 删除"}
            </button>
          )}
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="flex-1 py-3.5 rounded-2xl text-sm font-semibold transition-all active:scale-95 disabled:opacity-50"
            style={{ background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}
            data-testid="btn-download-poster"
          >
            {downloading ? "生成中..." : "💾 保存海报到相册"}
          </button>
        </div>
      </div>
    </div>
  );
}
