import { useState, useRef } from "react";
import { DropZone } from "@/components/DropZone";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Video, Download, Trash2, ArrowRight, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useHistory } from "@/contexts/HistoryContext";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { consumeDownloadUsage, consumeServiceUsage } from "@/lib/memberLimits";

interface VideoFile {
  id: string;
  file: File;
  status: "pending" | "processing" | "done" | "error";
  outputUrl?: string;
  outputSize?: number;
  progress?: number;
  errorMsg?: string;
}

const formatSize = (bytes: number) => {
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(2) + " MB";
};

const FFMPEG_CORE_BASE = "https://unpkg.com/@ffmpeg/core-mt@0.12.6/dist/esm";
const FFMPEG_CORE_BASE_ST = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";

export default function VideoOptimizer() {
  const { addHistoryItem } = useHistory();
  const [files, setFiles] = useState<VideoFile[]>([]);
  const [compression, setCompression] = useState("medium");
  const [resolution, setResolution] = useState("original");
  const [outputFormat, setOutputFormat] = useState("mp4");
  const [audioBitrate, setAudioBitrate] = useState("128");
  const [processing, setProcessing] = useState(false);
  const [globalProgress, setGlobalProgress] = useState(0);
  const ffmpegRef = useRef<FFmpeg | null>(null);

  const updateFile = (id: string, patch: Partial<VideoFile>) =>
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  const loadFFmpeg = async (): Promise<FFmpeg> => {
    if (ffmpegRef.current) return ffmpegRef.current;
    const ff = new FFmpeg();
    // Try multi-thread first, fall back to single-thread
    try {
      await ff.load({
        coreURL: await toBlobURL(`${FFMPEG_CORE_BASE}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${FFMPEG_CORE_BASE}/ffmpeg-core.wasm`, "application/wasm"),
        workerURL: await toBlobURL(`${FFMPEG_CORE_BASE}/ffmpeg-core.worker.js`, "text/javascript"),
      });
    } catch {
      await ff.load({
        coreURL: await toBlobURL(`${FFMPEG_CORE_BASE_ST}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${FFMPEG_CORE_BASE_ST}/ffmpeg-core.wasm`, "application/wasm"),
      });
    }
    ffmpegRef.current = ff;
    return ff;
  };

  const handleFiles = (newFiles: File[]) => {
    const videos = newFiles.filter((f) =>
      ["video/mp4", "video/quicktime", "video/webm", "video/x-msvideo", "video/avi"].includes(f.type)
        || /\.(mp4|mov|webm|avi|mkv)$/i.test(f.name)
    );
    if (!videos.length) {
      toast.error("Please upload MP4, MOV, WebM, or AVI files only");
      return;
    }
    setFiles((prev) => [
      ...prev,
      ...videos.map((f) => ({
        id: crypto.randomUUID(),
        file: f,
        status: "pending" as const,
      })),
    ]);
  };

  const handleOptimize = async () => {
    const pending = files.filter((f) => f.status === "pending");
    if (!pending.length) {
      toast.warning("No pending files to process");
      return;
    }
    const usage = consumeServiceUsage("video-optimizer");
    if (!usage.ok) {
      toast.error(`Video Optimizer limit reached (${usage.used}/${usage.limit})`);
      return;
    }
    setProcessing(true);
    setGlobalProgress(0);
    pending.forEach((f) => updateFile(f.id, { status: "processing", progress: 0 }));

    let ff: FFmpeg;
    try {
      toast.info("Loading video engine… (first load may take 30-60 seconds)");
      ff = await loadFFmpeg();
    } catch (err) {
      toast.error("Failed to load video engine. Check your internet connection.");
      pending.forEach((f) => updateFile(f.id, { status: "pending" }));
      setProcessing(false);
      return;
    }

    const crfMap: Record<string, string> = { low: "24", medium: "28", high: "33" };
    const crf = crfMap[compression] || "28";

    const scaleMap: Record<string, string> = {
      "1080p": "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2",
      "720p": "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2",
      "480p": "scale=854:480:force_original_aspect_ratio=decrease,pad=854:480:(ow-iw)/2:(oh-ih)/2",
      "360p": "scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2",
    };

    let completed = 0;
    for (const fileObj of pending) {
      const ext = fileObj.file.name.split(".").pop() || "mp4";
      const inputName = `in_${fileObj.id}.${ext}`;
      const outputName = `out_${fileObj.id}.${outputFormat}`;

      try {
        ff.on("progress", ({ progress }) => {
          const pct = Math.min(99, Math.round(progress * 100));
          updateFile(fileObj.id, { progress: pct });
          setGlobalProgress(Math.round(((completed + progress) / pending.length) * 100));
        });

        await ff.writeFile(inputName, await fetchFile(fileObj.file));

        const videoFilters: string[] = [];
        if (resolution !== "original" && scaleMap[resolution]) {
          videoFilters.push(scaleMap[resolution]);
        }

        const args = ["-i", inputName];

        // Video codec
        args.push("-c:v", "libx264", "-crf", crf, "-preset", "ultrafast", "-pix_fmt", "yuv420p");

        // Video filters
        if (videoFilters.length) {
          args.push("-vf", videoFilters.join(","));
        }

        // Audio
        args.push("-c:a", "aac", "-b:a", `${audioBitrate}k`);

        // Avoid errors with mov_flags
        if (outputFormat === "mp4") {
          args.push("-movflags", "+faststart");
        }

        args.push("-y", outputName);

        await ff.exec(args);

        const data = await ff.readFile(outputName);
        const blob = new Blob([new Uint8Array(data as ArrayBuffer)], {
          type: outputFormat === "webm" ? "video/webm" : "video/mp4",
        });
        const url = URL.createObjectURL(blob);
        const saving = Math.max(0, Math.round((1 - blob.size / fileObj.file.size) * 100));

        updateFile(fileObj.id, {
          status: "done",
          outputUrl: url,
          outputSize: blob.size,
          progress: 100,
        });

        addHistoryItem({
          name: fileObj.file.name,
          type: "video",
          action: `Compressed → ${resolution} ${outputFormat.toUpperCase()}`,
          originalSize: fileObj.file.size,
          optimizedSize: blob.size,
          saved: saving + "%",
          url,
        });

        // Cleanup memfs
        try { await ff.deleteFile(inputName); } catch { /* ignore */ }
        try { await ff.deleteFile(outputName); } catch { /* ignore */ }
      } catch (err: any) {
        console.error("FFmpeg error:", err);
        updateFile(fileObj.id, { status: "error", errorMsg: String(err?.message || err) });
        toast.error(`Failed: ${fileObj.file.name}`);
      }
      completed++;
    }

    setGlobalProgress(100);
    setProcessing(false);
    const doneCount = files.filter((f) => f.status === "done").length + concurrent(pending);
    toast.success(`Video optimization complete!`);
  };

  function concurrent(arr: VideoFile[]) {
    return arr.filter((f) => f.status !== "error").length;
  }

  const downloadVideo = (fileObj: VideoFile) => {
    if (!fileObj.outputUrl) return;
    const download = consumeDownloadUsage();
    if (!download.ok) {
      toast.error(`Download limit reached (${download.used}/${download.limit})`);
      return;
    }
    const a = document.createElement("a");
    a.href = fileObj.outputUrl;
    const baseName = fileObj.file.name.replace(/\.\w+$/, "");
    a.download = `optimized_${baseName}.${outputFormat}`;
    a.click();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Video Optimizer</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Compress, resize and convert videos — powered by FFmpeg WebAssembly
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Controls */}
        <div className="space-y-4 lg:col-span-1">
          <div className="rounded-xl border border-border bg-card p-5 shadow-card space-y-4">
            <h2 className="text-sm font-semibold text-card-foreground uppercase tracking-wider">Settings</h2>

            <div>
              <label className="text-sm font-medium text-card-foreground">Compression Level</label>
              <Select value={compression} onValueChange={setCompression}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low — Best Quality</SelectItem>
                  <SelectItem value="medium">Medium — Balanced ✓</SelectItem>
                  <SelectItem value="high">High — Smallest Size</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium text-card-foreground">Output Resolution</label>
              <Select value={resolution} onValueChange={setResolution}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="original">Original (Keep Size)</SelectItem>
                  <SelectItem value="1080p">1080p — Full HD</SelectItem>
                  <SelectItem value="720p">720p — HD</SelectItem>
                  <SelectItem value="480p">480p — SD</SelectItem>
                  <SelectItem value="360p">360p — Low</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium text-card-foreground">Output Format</label>
              <Select value={outputFormat} onValueChange={setOutputFormat}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mp4">MP4 — Best Compatibility</SelectItem>
                  <SelectItem value="webm">WebM — Web Optimized</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium text-card-foreground">
                Audio Bitrate: {audioBitrate}kbps
              </label>
              <Slider
                value={[parseInt(audioBitrate)]}
                onValueChange={([v]) => setAudioBitrate(String(v))}
                min={64}
                max={320}
                step={32}
                className="mt-2"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>64k</span><span>128k</span><span>192k</span><span>320k</span>
              </div>
            </div>

            <Button
              onClick={handleOptimize}
              disabled={!files.filter((f) => f.status === "pending").length || processing}
              className="w-full gradient-primary text-primary-foreground border-0"
            >
              {processing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing… {globalProgress}%
                </>
              ) : (
                <>
                  Optimize Videos
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>

            {processing && (
              <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
                <motion.div
                  className="h-full gradient-primary rounded-full"
                  animate={{ width: `${globalProgress}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-4 shadow-card">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Supported Formats</h3>
            <div className="flex flex-wrap gap-1.5">
              {["MP4", "MOV", "WebM", "AVI"].map((f) => (
                <span key={f} className="px-2 py-0.5 rounded-md bg-secondary text-xs font-medium text-secondary-foreground">{f}</span>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              ⚠️ Large videos (&gt;200MB) may be slow due to browser memory. Use smaller clips for best results.
            </p>
          </div>
        </div>

        {/* Upload + Results */}
        <div className="lg:col-span-2 space-y-4">
          <DropZone
            accept="video/mp4,video/quicktime,video/webm,video/x-msvideo,.mp4,.mov,.webm,.avi,.mkv"
            onFiles={handleFiles}
            label="Drop videos here or click to browse"
            sublabel="MP4, MOV, WebM, AVI supported • Max recommended: 200MB"
          />

          <AnimatePresence>
            {files.map((f) => (
              <motion.div
                key={f.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                className="rounded-xl border border-border bg-card shadow-card p-4"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 flex-shrink-0">
                    {f.status === "done" ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : f.status === "error" ? (
                      <AlertCircle className="h-5 w-5 text-destructive" />
                    ) : f.status === "processing" ? (
                      <Loader2 className="h-5 w-5 text-primary animate-spin" />
                    ) : (
                      <Video className="h-5 w-5 text-primary" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-card-foreground truncate">{f.file.name}</p>
                    <div className="text-xs text-muted-foreground">
                      {f.status === "done" && f.outputSize ? (
                        <span>
                          {formatSize(f.file.size)}{" "}
                          <span className="text-muted-foreground">→</span>{" "}
                          <span className="text-green-500 font-medium">{formatSize(f.outputSize)}</span>{" "}
                          <span className="text-green-500">
                            (−{Math.max(0, Math.round((1 - f.outputSize / f.file.size) * 100))}%)
                          </span>
                        </span>
                      ) : f.status === "error" ? (
                        <span className="text-destructive">{f.errorMsg || "Processing failed"}</span>
                      ) : (
                        <span>{formatSize(f.file.size)}</span>
                      )}
                    </div>
                    {f.status === "processing" && (
                      <div className="mt-2 h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                        <motion.div
                          className="h-full gradient-primary rounded-full"
                          animate={{ width: `${f.progress || 0}%` }}
                          transition={{ duration: 0.3 }}
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1.5">
                    {f.status === "done" && f.outputUrl && (
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Download"
                        onClick={() => downloadVideo(f)}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    )}
                    {f.status === "error" && (
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Retry"
                        onClick={() => updateFile(f.id, { status: "pending", errorMsg: undefined })}
                      >
                        <ArrowRight className="h-4 w-4 text-primary" />
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setFiles((p) => p.filter((x) => x.id !== f.id))}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
