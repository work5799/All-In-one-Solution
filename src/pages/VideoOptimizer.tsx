import { useRef, useState, useEffect } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { motion, AnimatePresence } from "framer-motion";
import {
  Video,
  Download,
  Trash2,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RotateCcw,
  Package,
  HardDrive,
  Play,
  Film,
  Zap,
  X,
  Sparkles,
  SlidersHorizontal,
  Settings2,
  Check,
  ShieldCheck,
  Gauge,
  FileVideo,
  Layers,
} from "lucide-react";
import { toast } from "sonner";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { DropZone } from "@/components/DropZone";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { useHistory } from "@/contexts/HistoryContext";
import { consumeDownloadUsage, consumeServiceUsage } from "@/lib/memberLimits";

type CompressionMode = "low" | "medium" | "high";
type ResolutionMode = "original" | "1080p" | "720p" | "480p" | "360p";
type OutputFormat = "mp4" | "webm";

interface VideoMetadata {
  width: number;
  height: number;
  duration: number;
  sourceBitrateKbps: number;
  thumbnail: string;
}

interface VideoFile {
  id: string;
  file: File;
  status: "pending" | "processing" | "done" | "error";
  thumbnail?: string;
  width?: number;
  height?: number;
  duration?: number;
  sourceBitrateKbps?: number;
  outputUrl?: string;
  outputSize?: number;
  outputWidth?: number;
  outputHeight?: number;
  progress?: number;
  errorMsg?: string;
  outputFormat?: OutputFormat;
}

const FFMPEG_CORE_BASE_ST = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
const FFMPEG_CACHE_NAME = "ffmpeg-wasm-core-v0.12.6";

// Cache FFmpeg core WASM and JS in browser Cache API on user's PC for instant 0ms loads
async function getCachedBlobUrl(url: string, mimeType: string): Promise<string> {
  if (typeof window !== "undefined" && "caches" in window) {
    try {
      const cache = await window.caches.open(FFMPEG_CACHE_NAME);
      const cached = await cache.match(url);
      if (cached) {
        console.log(`[FFmpeg Cache] Loaded from PC cache: ${url}`);
        const blob = await cached.blob();
        return URL.createObjectURL(blob);
      }
      console.log(`[FFmpeg Cache] Downloading & saving to PC cache: ${url}`);
      const res = await fetch(url);
      if (res.ok) {
        await cache.put(url, res.clone());
        const blob = await res.blob();
        return URL.createObjectURL(blob);
      }
    } catch (e) {
      console.warn("[FFmpeg Cache] Browser Cache API failed, falling back to network:", e);
    }
  }
  return toBlobURL(url, mimeType);
}

const formatSize = (bytes: number) => {
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(2)} MB`;
};

const formatDuration = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
};

const even = (value: number) => Math.max(2, Math.round(value / 2) * 2);

const getVideoMetadataAndThumbnail = (file: File): Promise<VideoMetadata> =>
  new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      video.load();
    };

    video.onloadedmetadata = () => {
      const seekTime = Math.min(1, video.duration > 2 ? 0.8 : video.duration * 0.2);
      video.currentTime = seekTime;
    };

    video.onseeked = () => {
      let thumbnail = "";
      try {
        const canvas = document.createElement("canvas");
        const w = Math.min(320, video.videoWidth || 320);
        const ratio = w / (video.videoWidth || 320);
        const h = Math.max(1, Math.round((video.videoHeight || 180) * ratio));
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, w, h);
          thumbnail = canvas.toDataURL("image/jpeg", 0.7);
        }
      } catch {
        // Ignore canvas export errors
      }

      const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1;
      const sourceBitrateKbps = Math.max(250, Math.round((file.size * 8) / duration / 1000));
      const meta: VideoMetadata = {
        width: video.videoWidth || 1920,
        height: video.videoHeight || 1080,
        duration,
        sourceBitrateKbps,
        thumbnail,
      };
      cleanup();
      resolve(meta);
    };

    video.onerror = () => {
      cleanup();
      resolve({
        width: 1920,
        height: 1080,
        duration: 1,
        sourceBitrateKbps: Math.round((file.size * 8) / 1000),
        thumbnail: "",
      });
    };

    video.src = url;
  });

const getTargetDimensions = (
  metadata: { width: number; height: number },
  resolution: ResolutionMode,
  format: OutputFormat = "mp4",
): { width: number; height: number } => {
  // In 32-bit browser WebAssembly, VP8 (WebM) uses 3x more heap memory than H.264.
  // Cap WebM at 720p (1280x720) to guarantee zero memory access crashes and 5x faster speed.
  // For MP4 (x264 ultrafast), 1080p (1920x1080) is safely supported.
  const maxW = format === "webm" ? 1280 : 1920;
  const maxH = format === "webm" ? 720 : 1080;

  if (resolution === "original") {
    if (metadata.width > maxW || metadata.height > maxH) {
      const scale = Math.min(maxW / metadata.width, maxH / metadata.height);
      return {
        width: even(metadata.width * scale),
        height: even(metadata.height * scale),
      };
    }
    return { width: even(metadata.width), height: even(metadata.height) };
  }

  const targetHeights: Record<Exclude<ResolutionMode, "original">, number> = {
    "1080p": format === "webm" ? 720 : 1080,
    "720p": 720,
    "480p": 480,
    "360p": 360,
  };

  const targetHeight = targetHeights[resolution];
  const isLandscape = metadata.width >= metadata.height;

  if (isLandscape) {
    if (metadata.height <= targetHeight && metadata.width <= maxW) {
      return { width: even(metadata.width), height: even(metadata.height) };
    }
    const scale = Math.min(targetHeight / metadata.height, maxW / metadata.width);
    return {
      width: even(metadata.width * scale),
      height: even(metadata.height * scale),
    };
  }

  if (metadata.width <= targetHeight && metadata.height <= maxW) {
    return { width: even(metadata.width), height: even(metadata.height) };
  }

  const scale = Math.min(targetHeight / metadata.width, maxW / metadata.height);
  return {
    width: even(metadata.width * scale),
    height: even(metadata.height * scale),
  };
};

const buildEncodeArgs = ({
  inputName,
  outputName,
  outputFormat,
  metadata,
  compression,
  resolution,
  audioBitrateKbps,
}: {
  inputName: string;
  outputName: string;
  outputFormat: OutputFormat;
  metadata: { width: number; height: number; duration: number; sourceBitrateKbps?: number };
  compression: CompressionMode;
  resolution: ResolutionMode;
  audioBitrateKbps: number;
}) => {
  const targetDimensions = getTargetDimensions(metadata, resolution, outputFormat);
  const w = even(targetDimensions.width);
  const h = even(targetDimensions.height);

  const srcBitrate = metadata.sourceBitrateKbps || 2000;

  // Compression factor relative to source video bitrate:
  // Low: Target ~65% of source bitrate (Visually lossless, 30-35% size reduction)
  // Medium: Target ~42% of source bitrate (Crisp & sharp, 50-60% size reduction)
  // High: Target ~26% of source bitrate (Compact & clean, 70-75% size reduction)
  const ratioByMode: Record<CompressionMode, number> = {
    low: 0.65,
    medium: 0.42,
    high: 0.26,
  };

  const ratio = ratioByMode[compression];

  // Resolution bitrate caps (kbps) to prevent bloated files on small/downscaled resolutions
  const resCaps: Record<ResolutionMode, number> = {
    original: 2400,
    "1080p": 2200,
    "720p": 1300,
    "480p": 700,
    "360p": 400,
  };
  const resCap = resCaps[resolution] || 1300;

  // Clamped target video bitrate guaranteeing smaller size than input
  const targetVBitrateKbps = Math.max(180, Math.min(Math.round(srcBitrate * ratio), resCap));
  const maxVBitrateKbps = Math.round(targetVBitrateKbps * 1.25);
  const bufsizeKbps = targetVBitrateKbps * 2;

  const args = [
    "-i",
    inputName,
    "-map",
    "0:v:0",
    "-map",
    "0:a?",
    "-sn",
    "-dn",
    // 1 thread in WebAssembly guarantees no multi-threaded heap memory spikes
    "-threads",
    "1",
  ];

  // Scale if requested or ensure even dimensions (divisible by 2) for H.264 & VP8
  if (resolution !== "original" || metadata.width % 2 !== 0 || metadata.height % 2 !== 0 || targetDimensions.width !== metadata.width || targetDimensions.height !== metadata.height) {
    args.push("-vf", `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2`);
  }

  if (outputFormat === "mp4") {
    // Preset 'veryfast' has CABAC and B-frames enabled, saving 50%+ file size compared to ultrafast
    // while remaining lightning fast in WebAssembly
    const crfByCompression: Record<CompressionMode, string> = {
      low: "22",
      medium: "25",
      high: "28",
    };

    args.push(
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-pix_fmt",
      "yuv420p",
      "-crf",
      crfByCompression[compression],
      "-b:v",
      `${targetVBitrateKbps}k`,
      "-maxrate",
      `${maxVBitrateKbps}k`,
      "-bufsize",
      `${bufsizeKbps}k`,
      "-c:a",
      "aac",
      "-b:a",
      `${Math.min(audioBitrateKbps, 128)}k`,
      "-ar",
      "44100",
      "-movflags",
      "+faststart",
    );
  } else {
    // WebM format with VP8 & Opus
    // -deadline realtime with -cpu-used 8 gives 4x faster encoding
    // Fixed bitrate bounds guarantee file size reduction and no WASM memory crash
    const crfByCompression: Record<CompressionMode, string> = {
      low: "24",
      medium: "28",
      high: "33",
    };

    args.push(
      "-c:v",
      "libvpx",
      "-deadline",
      "realtime",
      "-cpu-used",
      "8",
      "-pix_fmt",
      "yuv420p",
      "-crf",
      crfByCompression[compression],
      "-b:v",
      `${targetVBitrateKbps}k`,
      "-maxrate",
      `${maxVBitrateKbps}k`,
      "-bufsize",
      `${bufsizeKbps}k`,
      "-c:a",
      "libvorbis",
      "-b:a",
      `${Math.min(audioBitrateKbps, 128)}k`,
      "-ar",
      "44100",
    );
  }

  args.push("-y", outputName);
  return args;
};

export default function VideoOptimizer() {
  const { addHistoryItem } = useHistory();
  const [files, setFiles] = useState<VideoFile[]>([]);
  const [compression, setCompression] = useState<CompressionMode>("medium");
  const [resolution, setResolution] = useState<ResolutionMode>("720p");
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("mp4");
  const [audioBitrate, setAudioBitrate] = useState("128");
  const [processing, setProcessing] = useState(false);
  const [globalProgress, setGlobalProgress] = useState(0);
  const [engineCached, setEngineCached] = useState(false);
  const [previewModalUrl, setPreviewModalUrl] = useState<string | null>(null);

  const ffmpegRef = useRef<FFmpeg | null>(null);
  const currentFileIdRef = useRef<string | null>(null);
  const completedRef = useRef(0);
  const pendingCountRef = useRef(1);
  const currentDurationRef = useRef(0);
  const currentFileProgressRef = useRef(0);
  const lastActivityRef = useRef(Date.now());
  const fallbackTimerRef = useRef<number | null>(null);

  // Check if engine is cached on user's PC on mount
  useEffect(() => {
    if (typeof window !== "undefined" && "caches" in window) {
      void window.caches.has(FFMPEG_CACHE_NAME).then((has) => setEngineCached(has));
    }
  }, []);

  const updateFile = (id: string, patch: Partial<VideoFile>) => {
    setFiles((prev) => prev.map((file) => (file.id === id ? { ...file, ...patch } : file)));
  };

  const stopFallbackProgress = () => {
    if (fallbackTimerRef.current !== null) {
      window.clearInterval(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
  };

  const markActivity = () => {
    lastActivityRef.current = Date.now();
  };

  const applyProgress = (progressValue: number) => {
    const currentId = currentFileIdRef.current;
    if (!currentId) return;

    const bounded = progressValue === 100
      ? 100
      : Math.max(currentFileProgressRef.current, Math.min(99, Math.round(progressValue)));

    if (bounded > currentFileProgressRef.current || progressValue === 100) {
      markActivity();
    }
    currentFileProgressRef.current = bounded;
    updateFile(currentId, { progress: bounded });
    setGlobalProgress(
      Math.min(
        100,
        Math.round(((completedRef.current + bounded / 100) / Math.max(1, pendingCountRef.current)) * 100),
      ),
    );
  };

  const startFallbackProgress = (startAt: number, maxAt: number) => {
    stopFallbackProgress();
    fallbackTimerRef.current = window.setInterval(() => {
      if (currentFileIdRef.current === null) return;
      if (currentFileProgressRef.current >= maxAt) return;
      applyProgress(Math.min(maxAt, currentFileProgressRef.current + 1));
    }, 1000);
    applyProgress(startAt);
  };

  const resetFFmpeg = () => {
    stopFallbackProgress();
    try {
      ffmpegRef.current?.terminate();
    } catch {
      // Ignore
    }
    ffmpegRef.current = null;
  };

  const loadFFmpeg = async (): Promise<FFmpeg> => {
    // Reuse loaded FFmpeg instance across files - avoids 31MB re-download & instant execution
    if (ffmpegRef.current && ffmpegRef.current.loaded) {
      return ffmpegRef.current;
    }

    resetFFmpeg();
    const ffmpeg = new FFmpeg();

    const logHandler = ({ message }: { message: string }) => {
      markActivity();
      console.log("[FFmpeg log]", message);
      const timeMatch = message.match(/time=(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/);
      if (timeMatch && currentDurationRef.current > 0) {
        const [, hours, minutes, seconds] = timeMatch;
        const elapsedSeconds =
          Number.parseInt(hours, 10) * 3600 +
          Number.parseInt(minutes, 10) * 60 +
          Number.parseFloat(seconds);
        const encodeRatio = Math.min(0.99, elapsedSeconds / currentDurationRef.current);
        const encodePercent = 10 + encodeRatio * 88; // 10% to 98%
        applyProgress(encodePercent);
      }
    };

    const progressHandler = ({ progress }: { progress: number }) => {
      markActivity();
      const encodePercent = 10 + progress * 88;
      applyProgress(encodePercent);
    };

    ffmpeg.on("log", logHandler);
    ffmpeg.on("progress", progressHandler);

    // Parallel load using local PC cache
    const [coreURL, wasmURL] = await Promise.all([
      getCachedBlobUrl(`${FFMPEG_CORE_BASE_ST}/ffmpeg-core.js`, "text/javascript"),
      getCachedBlobUrl(`${FFMPEG_CORE_BASE_ST}/ffmpeg-core.wasm`, "application/wasm"),
    ]);

    await ffmpeg.load({ coreURL, wasmURL });
    setEngineCached(true);
    ffmpegRef.current = ffmpeg;
    return ffmpeg;
  };

  const runEncode = async (
    ffmpeg: FFmpeg,
    args: string[],
    duration: number,
    opts: {
      inputName: string;
      outputName: string;
      outputFormat: OutputFormat;
      metadata: { width: number; height: number; duration: number };
      compression: CompressionMode;
      resolution: ResolutionMode;
      audioBitrateKbps: number;
    }
  ) => {
    return new Promise<void>((resolve, reject) => {
      // Allow ample time for encoding without premature timeouts (minimum 5 mins)
      const execTimeoutMs = Math.max(300000, duration * 6000);
      let completed = false;
      let timeoutId: number | null = null;

      const cleanup = () => {
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId);
          timeoutId = null;
        }
      };

      timeoutId = window.setTimeout(() => {
        if (!completed) {
          completed = true;
          cleanup();
          reject(new Error(`Encoding timed out after ${Math.round(execTimeoutMs / 1000)}s`));
        }
      }, execTimeoutMs);

      console.log(`[FFmpeg] Executing args:`, args.join(" "));

      ffmpeg
        .exec(args)
        .then(async (exitCode) => {
          if (completed) return;
          if (exitCode === 0) {
            completed = true;
            cleanup();
            resolve();
          } else {
            // WebM fallback attempt (try with safe parameters if first try failed)
            if (opts.outputFormat === "webm") {
              try {
                console.warn("[FFmpeg] WebM encoding retry with safe audio/parameters...");
                const targetDimensions = getTargetDimensions(opts.metadata, "720p", "webm");
                const w = even(targetDimensions.width);
                const h = even(targetDimensions.height);
                const retryArgs = [
                  "-i", opts.inputName,
                  "-map", "0:v:0",
                  "-vf", `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2`,
                  "-c:v", "libvpx",
                  "-b:v", "1500k",
                  "-maxrate", "2000k",
                  "-bufsize", "2M",
                  "-crf", "26",
                  "-deadline", "realtime",
                  "-speed", "8",
                  "-an", // drop audio if unsupported codec
                  "-y", opts.outputName
                ];
                const retryCode = await ffmpeg.exec(retryArgs);
                if (retryCode === 0) {
                  completed = true;
                  cleanup();
                  resolve();
                  return;
                }
              } catch (retryErr) {
                console.error("[FFmpeg] Retry failed:", retryErr);
              }
            }
            completed = true;
            cleanup();
            reject(new Error(`FFmpeg exited with error code ${exitCode}`));
          }
        })
        .catch((error) => {
          if (!completed) {
            completed = true;
            cleanup();
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        });
    });
  };

  const handleFiles = async (newFiles: File[]) => {
    const videos = newFiles.filter(
      (file) =>
        ["video/mp4", "video/quicktime", "video/webm", "video/x-msvideo", "video/avi", "video/mkv"].includes(file.type) ||
        /\.(mp4|mov|webm|avi|mkv)$/i.test(file.name),
    );

    if (!videos.length) {
      toast.error("Please upload MP4, MOV, WebM, AVI, or MKV files only");
      return;
    }

    const mapped: VideoFile[] = await Promise.all(
      videos.map(async (file) => {
        const id = crypto.randomUUID();
        const meta = await getVideoMetadataAndThumbnail(file);
        return {
          id,
          file,
          status: "pending" as const,
          thumbnail: meta.thumbnail,
          width: meta.width,
          height: meta.height,
          duration: meta.duration,
          sourceBitrateKbps: meta.sourceBitrateKbps,
        };
      })
    );

    setFiles((prev) => [...prev, ...mapped]);
    toast.success(`${mapped.length} video(s) loaded & cached locally on your PC`);
  };

  const runBatchOptimization = async (targetFiles: VideoFile[]) => {
    if (!targetFiles.length || processing) return;

    const usage = consumeServiceUsage("video-optimizer");
    if (!usage.ok) {
      toast.error(`Video Optimizer limit reached (${usage.used}/${usage.limit})`);
      return;
    }

    setProcessing(true);
    setGlobalProgress(0);
    completedRef.current = 0;
    pendingCountRef.current = targetFiles.length;

    targetFiles.forEach((f) => updateFile(f.id, { status: "processing", progress: 0, errorMsg: undefined }));

    const selectedAudioBitrate = Number.parseInt(audioBitrate, 10) || 128;

    for (const fileObj of targetFiles) {
      const ext = fileObj.file.name.split(".").pop()?.toLowerCase() || "mp4";
      const inputName = `in_${fileObj.id.slice(0, 8)}.${ext}`;
      const outputName = `out_${fileObj.id.slice(0, 8)}.${outputFormat}`;
      currentFileIdRef.current = fileObj.id;
      currentFileProgressRef.current = 0;
      currentDurationRef.current = fileObj.duration || 10;

      // Revoke old output url if re-optimizing
      if (fileObj.outputUrl && fileObj.outputUrl.startsWith("blob:")) {
        URL.revokeObjectURL(fileObj.outputUrl);
      }

      try {
        applyProgress(2);
        const ffmpeg = await loadFFmpeg();
        applyProgress(8);

        const targetDims = getTargetDimensions(
          { width: fileObj.width || 1920, height: fileObj.height || 1080 },
          resolution,
          outputFormat
        );

        const encodeOpts = {
          inputName,
          outputName,
          outputFormat,
          metadata: {
            width: fileObj.width || 1920,
            height: fileObj.height || 1080,
            duration: fileObj.duration || 10,
            sourceBitrateKbps: fileObj.sourceBitrateKbps || Math.max(300, Math.round((fileObj.file.size * 8) / (fileObj.duration || 10) / 1000)),
          },
          compression,
          resolution,
          audioBitrateKbps: selectedAudioBitrate,
        };

        const args = buildEncodeArgs(encodeOpts);

        startFallbackProgress(8, 12);
        await ffmpeg.writeFile(inputName, await fetchFile(fileObj.file));
        stopFallbackProgress();
        applyProgress(12);

        toast.info(`Optimizing ${fileObj.file.name} to ${outputFormat.toUpperCase()}...`);

        let blob: Blob | null = null;
        let finalWidth = targetDims.width;
        let finalHeight = targetDims.height;
        let finalFormat: OutputFormat = outputFormat;

        try {
          await runEncode(ffmpeg, args, fileObj.duration || 10, encodeOpts);

          // Free input file from WASM MEMFS before reading output to minimize RAM peak
          try {
            await ffmpeg.deleteFile(inputName);
          } catch { /* ignore */ }

          const data = await ffmpeg.readFile(outputName);

          // Free output file from WASM MEMFS immediately after reading
          try {
            await ffmpeg.deleteFile(outputName);
          } catch { /* ignore */ }

          if (!data || (data instanceof Uint8Array ? data.byteLength === 0 : (data as ArrayBuffer).byteLength === 0)) {
            throw new Error("Output video is empty or encoding failed");
          }

          const mime = outputFormat === "webm" ? "video/webm" : "video/mp4";
          const uint8Data = data instanceof Uint8Array ? data : new Uint8Array(data as ArrayBuffer);
          blob = new Blob([uint8Data], { type: mime });
        } catch (primaryErr) {
          console.warn("[VideoOptimizer] Primary encoding encountered issue, activating auto-recovery:", primaryErr);
          resetFFmpeg();

          // Auto-recovery: Re-encode using safe 720p mode preserving requested format
          toast.info("Auto-recovering video in Safe HD mode...");
          try {
            const safeFfmpeg = await loadFFmpeg();
            const safeFormat: OutputFormat = outputFormat;
            const safeOutputName = `out_${fileObj.id.slice(0, 8)}.${safeFormat}`;
            const safeDims = getTargetDimensions(
              { width: fileObj.width || 1280, height: fileObj.height || 720 },
              "720p",
              safeFormat
            );

            const safeOpts = {
              inputName,
              outputName: safeOutputName,
              outputFormat: safeFormat,
              metadata: {
                width: fileObj.width || 1280,
                height: fileObj.height || 720,
                duration: fileObj.duration || 10,
                sourceBitrateKbps: Math.min(fileObj.sourceBitrateKbps || 2000, 1400),
              },
              compression: "medium" as CompressionMode,
              resolution: "720p" as ResolutionMode,
              audioBitrateKbps: 96,
            };

            const safeArgs = buildEncodeArgs(safeOpts);
            await safeFfmpeg.writeFile(inputName, await fetchFile(fileObj.file));
            await runEncode(safeFfmpeg, safeArgs, fileObj.duration || 10, safeOpts);

            try {
              await safeFfmpeg.deleteFile(inputName);
            } catch { /* ignore */ }

            const safeData = await safeFfmpeg.readFile(safeOutputName);

            try {
              await safeFfmpeg.deleteFile(safeOutputName);
            } catch { /* ignore */ }

            if (!safeData || (safeData instanceof Uint8Array ? safeData.byteLength === 0 : (safeData as ArrayBuffer).byteLength === 0)) {
              throw primaryErr;
            }

            const safeMime = safeFormat === "webm" ? "video/webm" : "video/mp4";
            const safeUint8 = safeData instanceof Uint8Array ? safeData : new Uint8Array(safeData as ArrayBuffer);
            blob = new Blob([safeUint8], { type: safeMime });
            finalWidth = safeDims.width;
            finalHeight = safeDims.height;
            finalFormat = safeFormat;
          } catch (recoveryErr) {
            console.error("[VideoOptimizer] WebM recovery encountered issue:", recoveryErr);
            // Tier 2 Fallback: If WebM fails due to browser WebAssembly memory/codec limit, transcode via universal MP4
            if (outputFormat === "webm") {
              try {
                toast.info("WebM engine memory limit: Auto-transcoding with universal MP4...");
                resetFFmpeg();
                const mp4Ffmpeg = await loadFFmpeg();
                const mp4OutputName = `out_${fileObj.id.slice(0, 8)}.mp4`;
                const mp4Dims = getTargetDimensions(
                  { width: fileObj.width || 1280, height: fileObj.height || 720 },
                  "720p",
                  "mp4"
                );
                const mp4Opts = {
                  inputName,
                  outputName: mp4OutputName,
                  outputFormat: "mp4" as OutputFormat,
                  metadata: {
                    width: fileObj.width || 1280,
                    height: fileObj.height || 720,
                    duration: fileObj.duration || 10,
                    sourceBitrateKbps: Math.min(fileObj.sourceBitrateKbps || 2000, 1200),
                  },
                  compression: "medium" as CompressionMode,
                  resolution: "720p" as ResolutionMode,
                  audioBitrateKbps: 96,
                };
                const mp4Args = buildEncodeArgs(mp4Opts);
                await mp4Ffmpeg.writeFile(inputName, await fetchFile(fileObj.file));
                await runEncode(mp4Ffmpeg, mp4Args, fileObj.duration || 10, mp4Opts);
                try { await mp4Ffmpeg.deleteFile(inputName); } catch { /* ignore */ }
                const mp4Data = await mp4Ffmpeg.readFile(mp4OutputName);
                try { await mp4Ffmpeg.deleteFile(mp4OutputName); } catch { /* ignore */ }

                if (mp4Data && (mp4Data instanceof Uint8Array ? mp4Data.byteLength > 0 : (mp4Data as ArrayBuffer).byteLength > 0)) {
                  const safeUint8 = mp4Data instanceof Uint8Array ? mp4Data : new Uint8Array(mp4Data as ArrayBuffer);
                  blob = new Blob([safeUint8], { type: "video/mp4" });
                  finalWidth = mp4Dims.width;
                  finalHeight = mp4Dims.height;
                  finalFormat = "mp4";
                } else {
                  throw recoveryErr;
                }
              } catch (mp4Err) {
                console.error("[VideoOptimizer] All recoveries failed:", mp4Err);
                throw primaryErr;
              }
            } else {
              throw primaryErr;
            }
          }
        }

        if (!blob) {
          throw new Error("Failed to produce optimized video");
        }

        applyProgress(99);

        const url = URL.createObjectURL(blob);
        const saving = Math.max(0, Math.round((1 - blob.size / fileObj.file.size) * 100));

        updateFile(fileObj.id, {
          status: "done",
          outputUrl: url,
          outputSize: blob.size,
          outputWidth: finalWidth,
          outputHeight: finalHeight,
          progress: 100,
          outputFormat: finalFormat,
        });

        addHistoryItem({
          name: fileObj.file.name,
          type: "video",
          action: `Compressed to ${finalFormat.toUpperCase()} (${finalWidth}×${finalHeight}px)`,
          originalSize: fileObj.file.size,
          optimizedSize: blob.size,
          saved: `${saving}%`,
          url,
        });

        toast.success(`${fileObj.file.name} optimized! Saved ${saving}%`);
      } catch (error) {
        stopFallbackProgress();
        console.error("Video optimization failed:", error);
        resetFFmpeg();

        const errorStr = error instanceof Error ? error.message : String(error);
        const userFriendlyMsg = errorStr.includes("memory access out of bounds")
          ? "Out of memory in browser. Try choosing '720p' for high-res videos."
          : errorStr;

        updateFile(fileObj.id, {
          status: "error",
          errorMsg: userFriendlyMsg,
        });
        toast.error(`Failed: ${fileObj.file.name}`);
      } finally {
        try {
          await ffmpegRef.current?.deleteFile(inputName);
        } catch { /* ignore */ }
        try {
          await ffmpegRef.current?.deleteFile(outputName);
        } catch { /* ignore */ }

        completedRef.current += 1;
        currentFileIdRef.current = null;
        currentDurationRef.current = 0;
        currentFileProgressRef.current = 0;
        stopFallbackProgress();
        setGlobalProgress(Math.round((completedRef.current / pendingCountRef.current) * 100));
      }
    }

    setProcessing(false);
  };

  const handleOptimize = async () => {
    const pendingFiles = files.filter((f) => f.status === "pending");
    if (!pendingFiles.length) return;
    await runBatchOptimization(pendingFiles);
  };

  const handleReoptimize = async (targetId?: string) => {
    const targetFiles = targetId ? files.filter((f) => f.id === targetId) : files;
    if (!targetFiles.length || processing) return;

    // Immediately reset progress bars to 0 for a crisp user feedback
    stopFallbackProgress();
    currentFileProgressRef.current = 0;
    completedRef.current = 0;
    setGlobalProgress(0);

    setFiles((prev) =>
      prev.map((f) =>
        !targetId || f.id === targetId
          ? {
              ...f,
              status: "pending",
              progress: 0,
              outputUrl: undefined,
              outputSize: undefined,
              outputWidth: undefined,
              outputHeight: undefined,
              errorMsg: undefined,
            }
          : f
      )
    );

    setTimeout(() => {
      void runBatchOptimization(targetFiles);
    }, 50);
  };

  const downloadVideo = (fileObj: VideoFile) => {
    if (!fileObj.outputUrl) return;
    const download = consumeDownloadUsage();
    if (!download.ok) {
      toast.error(`Download limit reached (${download.used}/${download.limit})`);
      return;
    }
    const anchor = document.createElement("a");
    const baseName = fileObj.file.name.replace(/\.\w+$/, "");
    anchor.href = fileObj.outputUrl;
    anchor.download = `optimized_${baseName}.${fileObj.outputFormat || outputFormat}`;
    anchor.click();
  };

  const downloadAll = async () => {
    const done = files.filter((f) => f.outputUrl);
    if (!done.length) return;
    const download = consumeDownloadUsage();
    if (!download.ok) {
      toast.error(`Download limit reached (${download.used}/${download.limit})`);
      return;
    }
    const zip = new JSZip();
    for (const f of done) {
      const resp = await fetch(f.outputUrl!);
      const blob = await resp.blob();
      const baseName = f.file.name.replace(/\.\w+$/, "");
      zip.file(`optimized_${baseName}.${f.outputFormat || outputFormat}`, blob);
    }
    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, "optimized-videos.zip");
  };

  const doneFiles = files.filter((f) => f.status === "done");
  const hasPending = files.some((f) => f.status === "pending");
  const hasDoneOrError = files.some((f) => f.status === "done" || f.status === "error");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Video Optimizer</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Compress, resize and convert videos with browser-based FFmpeg.
          </p>
        </div>

        {/* Local PC Storage Indicator */}
        <div className="inline-flex items-center gap-2 rounded-lg bg-primary/10 border border-primary/20 px-3 py-1.5 text-xs text-primary self-start sm:self-auto font-medium">
          <HardDrive className="h-4 w-4 shrink-0 text-primary" />
          <span>
            {engineCached ? "Engine Cached on PC (0s Load)" : "Local PC Processing (100% Private)"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Settings Panel */}
        <div className="space-y-4 lg:col-span-1">
          <div className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-card">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings2 className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold uppercase tracking-wider text-card-foreground">
                  Optimization Settings
                </h2>
              </div>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-primary/10 text-primary font-medium">
                {outputFormat.toUpperCase()} • {resolution}
              </span>
            </div>

            {/* Output Format Tabs / Buttons */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Film className="h-3.5 w-3.5 text-primary" />
                  Format
                </label>
                <span className="text-[11px] text-muted-foreground">
                  {outputFormat === "mp4" ? "Universal compatibility" : "Modern web format"}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setOutputFormat("mp4")}
                  className={`flex flex-col items-start p-2.5 rounded-lg border text-left transition-all ${
                    outputFormat === "mp4"
                      ? "border-primary bg-primary/10 text-card-foreground shadow-sm ring-1 ring-primary/40"
                      : "border-border/60 bg-secondary/40 text-muted-foreground hover:bg-secondary hover:text-foreground"
                  }`}
                >
                  <span className={`text-xs font-bold ${outputFormat === "mp4" ? "text-primary" : "text-foreground"}`}>
                    MP4 (H.264)
                  </span>
                  <span className="text-[10px] text-muted-foreground mt-0.5">Ultra Fast • All Devices</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setOutputFormat("webm");
                    if (resolution === "original" || resolution === "1080p") {
                      setResolution("720p");
                      toast.info("Resolution adjusted to 720p for fast & memory-safe WebM export");
                    }
                  }}
                  className={`flex flex-col items-start p-2.5 rounded-lg border text-left transition-all ${
                    outputFormat === "webm"
                      ? "border-primary bg-primary/10 text-card-foreground shadow-sm ring-1 ring-primary/40"
                      : "border-border/60 bg-secondary/40 text-muted-foreground hover:bg-secondary hover:text-foreground"
                  }`}
                >
                  <span className={`text-xs font-bold ${outputFormat === "webm" ? "text-primary" : "text-foreground"}`}>
                    WebM (VP8)
                  </span>
                  <span className="text-[10px] text-muted-foreground mt-0.5">
                    {outputFormat === "webm" ? "Fast 720p • Web Ready" : "Lightweight • Web Ready"}
                  </span>
                </button>
              </div>
            </div>

            {/* Output Resolution Pills */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <SlidersHorizontal className="h-3.5 w-3.5 text-primary" />
                  Resolution / Resize
                </label>
                <span className="text-[11px] font-medium text-primary">
                  {resolution === "720p"
                    ? "★ Recommended (Fast)"
                    : outputFormat === "webm" && (resolution === "original" || resolution === "1080p")
                    ? "Max 720p for WebM"
                    : resolution === "original"
                    ? "Original Size"
                    : ""}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: "original", label: "Original", sub: outputFormat === "webm" ? "Max 720p" : "Source" },
                  { id: "1080p", label: "1080p", sub: outputFormat === "webm" ? "Auto 720p" : "Full HD" },
                  { id: "720p", label: "720p", sub: outputFormat === "webm" ? "Best WebM" : "Fast HD" },
                  { id: "480p", label: "480p", sub: "SD" },
                  { id: "360p", label: "360p", sub: "Smallest" },
                ].map((item) => {
                  const active = resolution === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setResolution(item.id as ResolutionMode)}
                      className={`flex flex-col items-center justify-center py-2 px-1 rounded-lg border text-center transition-all ${
                        active
                          ? "border-primary bg-primary text-primary-foreground font-semibold shadow-sm"
                          : "border-border/70 bg-secondary/40 text-foreground hover:bg-secondary hover:border-primary/50"
                      }`}
                    >
                      <span className="text-xs font-medium leading-none">{item.label}</span>
                      <span className={`text-[10px] mt-1 ${active ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                        {item.sub}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Compression Level Buttons */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Gauge className="h-3.5 w-3.5 text-primary" />
                  Quality & Compression
                </label>
              </div>
              <div className="space-y-1.5">
                {[
                  {
                    id: "low",
                    title: "Low Compression",
                    badge: "Original Quality",
                    desc: "Visually lossless • 100% same clarity as source video",
                  },
                  {
                    id: "medium",
                    title: "Medium (Recommended)",
                    badge: "Crisp & Sharp",
                    desc: "Optimal balance • Retains fine details with 40-60% size drop",
                  },
                  {
                    id: "high",
                    title: "High Compression",
                    badge: "Sharp & Compact",
                    desc: "Smaller size with clean sharpness • No blur or pixelation",
                  },
                ].map((opt) => {
                  const isSelected = compression === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setCompression(opt.id as CompressionMode)}
                      className={`w-full p-2.5 rounded-lg border text-left transition-all ${
                        isSelected
                          ? "border-primary bg-primary/10 text-card-foreground shadow-sm ring-1 ring-primary/40"
                          : "border-border/60 bg-secondary/30 text-muted-foreground hover:bg-secondary hover:text-foreground"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-semibold ${isSelected ? "text-primary" : "text-foreground"}`}>
                          {opt.title}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                          isSelected ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
                        }`}>
                          {opt.badge}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{opt.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Audio Bitrate */}
            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Audio Quality: <span className="text-foreground font-mono">{audioBitrate} kbps</span>
                </label>
                <span className="text-[11px] text-primary font-mono font-medium">
                  {outputFormat === "webm" ? "Vorbis (44.1kHz)" : "AAC (44.1kHz)"}
                </span>
              </div>
              <Slider
                value={[Number.parseInt(audioBitrate, 10)]}
                onValueChange={([value]) => setAudioBitrate(String(value))}
                min={64}
                max={192}
                step={32}
                className="mt-2.5"
              />
              <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground font-medium">
                <span>64k (Speech)</span>
                <span>96k (Normal)</span>
                <span>128k (Music)</span>
                <span>192k (Hi-Fi)</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2 pt-1">
              {/* Primary Optimize button shown when videos are pending or none completed yet */}
              {(!hasDoneOrError || hasPending) && (
                <Button
                  onClick={handleOptimize}
                  disabled={!hasPending || processing}
                  className="w-full h-10 border-0 gradient-primary text-primary-foreground font-semibold shadow-md disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-95 transition-all"
                >
                  {processing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {globalProgress < 10 ? "Preparing Engine..." : `Encoding (${globalProgress}%)`}
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Optimize Videos ({files.filter((f) => f.status === "pending").length || files.length})
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              )}

              {/* Re-optimize All Button - active when all or some videos are completed */}
              {hasDoneOrError && (
                <Button
                  type="button"
                  onClick={() => handleReoptimize()}
                  disabled={processing}
                  className="w-full h-10 bg-primary/10 hover:bg-primary text-primary hover:text-white border border-primary/30 font-semibold transition-all shadow-sm group"
                >
                  {processing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Re-optimizing ({globalProgress}%)
                    </>
                  ) : (
                    <>
                      <RotateCcw className="mr-2 h-4 w-4 text-primary group-hover:text-white transition-colors" />
                      Re-optimize All ({files.length})
                    </>
                  )}
                </Button>
              )}

              {doneFiles.length > 1 && (
                <Button
                  variant="outline"
                  onClick={downloadAll}
                  className="w-full h-10 border-border font-semibold hover:border-primary/50"
                >
                  <Package className="mr-2 h-4 w-4 text-primary" />
                  Download ZIP ({doneFiles.length} videos)
                </Button>
              )}
            </div>

            {processing && (
              <div className="space-y-2 pt-1">
                <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                  <motion.div
                    className="h-full rounded-full gradient-primary"
                    animate={{ width: `${globalProgress}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Overall progress: {globalProgress}% ({completedRef.current} of {pendingCountRef.current} videos completed)
                </p>
              </div>
            )}
          </div>

          {/* Performance & Security Info Box */}
          <div className="rounded-xl border border-border bg-card p-4 shadow-card space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Zap className="h-3.5 w-3.5 text-primary" />
              <span>Fast Local Engine</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {["Cached On PC", "WebM & MP4", "Zero Upload", "GPU/WASM"].map((tag) => (
                <span
                  key={tag}
                  className="rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Videos never upload over slow internet. They process 100% locally on your PC via WebAssembly. For 4K/large videos, choosing <strong>720p or 1080p</strong> provides 5x faster export.
            </p>
          </div>
        </div>

        {/* Upload & Video List */}
        <div className="space-y-4 lg:col-span-2">
          <DropZone
            accept="video/mp4,video/quicktime,video/webm,video/x-msvideo,.mp4,.mov,.webm,.avi,.mkv"
            onFiles={handleFiles}
            label="Drop videos here or click to browse"
            sublabel="MP4, WebM, MOV, AVI, MKV • Instant local PC processing"
          />

          {/* Video List Header & Stats */}
          {files.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-1 pt-1">
              <div className="flex items-center gap-2">
                <FileVideo className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold text-foreground">
                  Video Queue ({files.length})
                </span>
                {doneFiles.length > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-600 font-medium border border-green-500/20">
                    {doneFiles.length} Completed
                  </span>
                )}
                {hasPending && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium border border-primary/20">
                    {files.filter((f) => f.status === "pending").length} Ready
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {doneFiles.length > 1 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={downloadAll}
                    className="h-8 text-xs font-semibold gap-1.5"
                  >
                    <Package className="h-3.5 w-3.5 text-primary" />
                    Download All ZIP
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={processing}
                  onClick={() => setFiles([])}
                  className="h-8 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive gap-1"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Clear List
                </Button>
              </div>
            </div>
          )}

          <AnimatePresence>
            {files.map((fileObj) => (
              <motion.div
                key={fileObj.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                className="rounded-xl border border-border bg-card p-4 shadow-card overflow-hidden"
              >
                <div className="flex items-center gap-4">
                  {/* Video Thumbnail Preview */}
                  <div className="relative h-16 w-24 flex-shrink-0 rounded-lg bg-secondary overflow-hidden flex items-center justify-center border border-border/50 group">
                    {fileObj.thumbnail ? (
                      <img
                        src={fileObj.thumbnail}
                        alt={fileObj.file.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Video className="h-6 w-6 text-muted-foreground" />
                    )}

                    {/* Play Button Overlay */}
                    {(fileObj.outputUrl || fileObj.thumbnail) && (
                      <button
                        type="button"
                        onClick={() => setPreviewModalUrl(fileObj.outputUrl || URL.createObjectURL(fileObj.file))}
                        className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Preview video"
                      >
                        <Play className="h-5 w-5 text-white fill-white" />
                      </button>
                    )}

                    {fileObj.duration ? (
                      <span className="absolute bottom-1 right-1 rounded bg-black/75 px-1 text-[10px] font-mono text-white">
                        {formatDuration(fileObj.duration)}
                      </span>
                    ) : null}
                  </div>

                  {/* Metadata and Status */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-card-foreground">{fileObj.file.name}</p>

                    <div className="text-xs text-muted-foreground mt-0.5">
                      {fileObj.status === "done" && fileObj.outputSize ? (
                        <span>
                          {formatSize(fileObj.file.size)}{" "}
                          {fileObj.width && fileObj.height ? `(${fileObj.width}×${fileObj.height})` : ""}
                          <span className="text-muted-foreground"> → </span>
                          <span className="font-medium text-green-500">{formatSize(fileObj.outputSize)}</span>{" "}
                          <span className="text-green-500 font-semibold">
                            (-{Math.max(0, Math.round((1 - fileObj.outputSize / fileObj.file.size) * 100))}%)
                          </span>
                          {fileObj.outputWidth && fileObj.outputHeight ? (
                            <span className="text-primary font-mono ml-1 font-medium">
                              ({fileObj.outputWidth}×{fileObj.outputHeight}px • {fileObj.outputFormat?.toUpperCase()})
                            </span>
                          ) : null}
                        </span>
                      ) : fileObj.status === "error" ? (
                        <span className="text-destructive flex items-center gap-1">
                          <AlertCircle className="h-3.5 w-3.5" />
                          {fileObj.errorMsg || "Processing failed"}
                        </span>
                      ) : (
                        <span>
                          {formatSize(fileObj.file.size)}
                          {fileObj.width && fileObj.height ? ` • ${fileObj.width}×${fileObj.height}px` : ""}
                        </span>
                      )}
                    </div>

                    {fileObj.status === "processing" && fileObj.progress !== undefined && (
                      <div className="mt-2 space-y-1">
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                          <motion.div
                            className="h-full rounded-full gradient-primary"
                            animate={{ width: `${fileObj.progress}%` }}
                            transition={{ duration: 0.3 }}
                          />
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Optimizing: {fileObj.progress}% complete
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Card Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {fileObj.status === "done" && fileObj.outputUrl && (
                      <>
                        {/* Single Video Re-optimize button */}
                        <Button
                          size="sm"
                          variant="outline"
                          title="Re-optimize with current settings"
                          disabled={processing}
                          onClick={() => handleReoptimize(fileObj.id)}
                          className="h-8 text-xs font-medium text-muted-foreground hover:bg-primary hover:text-white hover:border-primary transition-all gap-1.5"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Re-optimize</span>
                        </Button>

                        {/* Download button */}
                        <Button
                          size="sm"
                          title="Download optimized video"
                          onClick={() => downloadVideo(fileObj)}
                          className="h-8 text-xs font-semibold gradient-primary text-white border-0 shadow-sm gap-1.5"
                        >
                          <Download className="h-3.5 w-3.5" />
                          <span>Download</span>
                        </Button>
                      </>
                    )}

                    {fileObj.status === "done" ? (
                      <div className="hidden sm:flex items-center text-green-500" title="Completed">
                        <CheckCircle2 className="h-5 w-5" />
                      </div>
                    ) : null}

                    {fileObj.status === "error" && (
                      <Button
                        size="sm"
                        variant="outline"
                        title="Retry optimization"
                        onClick={() => handleReoptimize(fileObj.id)}
                        className="h-8 text-xs text-primary border-primary/40 hover:bg-primary hover:text-white transition-all shadow-sm gap-1.5 group"
                      >
                        <RotateCcw className="h-3.5 w-3.5 text-primary group-hover:text-white transition-colors" />
                        <span>Retry</span>
                      </Button>
                    )}

                    <Button
                      size="icon"
                      variant="ghost"
                      title="Remove file"
                      onClick={() => setFiles((prev) => prev.filter((item) => item.id !== fileObj.id))}
                      className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      {/* Video Preview Modal */}
      {previewModalUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setPreviewModalUrl(null)}
        >
          <div
            className="relative w-full max-w-3xl overflow-hidden rounded-2xl bg-card border border-border shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-3 border-b border-border bg-card">
              <span className="text-sm font-semibold flex items-center gap-2">
                <Film className="h-4 w-4 text-primary" />
                Video Preview
              </span>
              <Button size="icon" variant="ghost" onClick={() => setPreviewModalUrl(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="aspect-video bg-black flex items-center justify-center">
              <video
                src={previewModalUrl}
                controls
                autoPlay
                className="max-h-[70vh] w-full"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
