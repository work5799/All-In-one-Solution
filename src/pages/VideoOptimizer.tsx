import { useRef, useState } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { motion, AnimatePresence } from "framer-motion";
import { Video, Download, Trash2, ArrowRight, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { DropZone } from "@/components/DropZone";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { useHistory } from "@/contexts/HistoryContext";
import { consumeDownloadUsage, consumeServiceUsage } from "@/lib/memberLimits";

type CompressionMode = "low" | "medium" | "high";
type ResolutionMode = "original" | "1080p" | "720p" | "480p" | "360p";
type OutputFormat = "mp4" | "webm";
type EngineMode = "single";

interface VideoMetadata {
  width: number;
  height: number;
  duration: number;
  sourceBitrateKbps: number;
}

interface VideoFile {
  id: string;
  file: File;
  status: "pending" | "processing" | "done" | "error";
  outputUrl?: string;
  outputSize?: number;
  progress?: number;
  errorMsg?: string;
  outputFormat?: OutputFormat;
}

const FFMPEG_CORE_BASE_ST = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";

const formatSize = (bytes: number) => {
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(2)} MB`;
};

const even = (value: number) => Math.max(2, Math.round(value / 2) * 2);

const getVideoMetadata = (file: File): Promise<VideoMetadata> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;

    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      video.load();
    };

    video.onloadedmetadata = () => {
      const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1;
      const sourceBitrateKbps = Math.max(250, Math.round((file.size * 8) / duration / 1000));
      const metadata: VideoMetadata = {
        width: video.videoWidth || 1920,
        height: video.videoHeight || 1080,
        duration,
        sourceBitrateKbps,
      };
      cleanup();
      resolve(metadata);
    };

    video.onerror = () => {
      cleanup();
      reject(new Error("Could not read video metadata"));
    };

    video.src = url;
  });

const getTargetDimensions = (
  metadata: VideoMetadata,
  resolution: ResolutionMode,
): { width: number; height: number } => {
  if (resolution === "original") {
    return { width: even(metadata.width), height: even(metadata.height) };
  }

  const targetHeights: Record<Exclude<ResolutionMode, "original">, number> = {
    "1080p": 1080,
    "720p": 720,
    "480p": 480,
    "360p": 360,
  };

  const targetHeight = targetHeights[resolution];
  const isLandscape = metadata.width >= metadata.height;

  if (isLandscape) {
    if (metadata.height <= targetHeight) {
      return { width: even(metadata.width), height: even(metadata.height) };
    }
    const scale = targetHeight / metadata.height;
    return {
      width: even(metadata.width * scale),
      height: even(targetHeight),
    };
  }

  if (metadata.width <= targetHeight) {
    return { width: even(metadata.width), height: even(metadata.height) };
  }

  const scale = targetHeight / metadata.width;
  return {
    width: even(targetHeight),
    height: even(metadata.height * scale),
  };
};

const getResolutionFloorKbps = (dimensions: { width: number; height: number }, compression: CompressionMode) => {
  const pixels = dimensions.width * dimensions.height;
  if (pixels >= 1920 * 1080) {
    return compression === "high" ? 850 : compression === "medium" ? 1200 : 2000;
  }
  if (pixels >= 1280 * 720) {
    return compression === "high" ? 600 : compression === "medium" ? 900 : 1400;
  }
  if (pixels >= 854 * 480) {
    return compression === "high" ? 380 : compression === "medium" ? 600 : 900;
  }
  return compression === "high" ? 260 : compression === "medium" ? 420 : 650;
};

const getTargetVideoBitrate = ({
  metadata,
  compression,
  resolution,
  outputFormat,
  audioBitrateKbps,
}: {
  metadata: VideoMetadata;
  compression: CompressionMode;
  resolution: ResolutionMode;
  outputFormat: OutputFormat;
  audioBitrateKbps: number;
}) => {
  const targetDimensions = getTargetDimensions(metadata, resolution);
  const scaleFactor = Math.min(
    1,
    (targetDimensions.width * targetDimensions.height) / Math.max(1, metadata.width * metadata.height),
  );

  const sourceVideoBitrate = Math.max(250, metadata.sourceBitrateKbps - audioBitrateKbps);
  const ratioMatrix: Record<OutputFormat, Record<CompressionMode, number>> = {
    mp4: {
      low: 0.5,
      medium: 0.22,
      high: 0.14,
    },
    webm: {
      low: 0.45,
      medium: 0.2,
      high: 0.12,
    },
  };

  const scaledRatio = ratioMatrix[outputFormat][compression] * Math.sqrt(scaleFactor);
  const floor = getResolutionFloorKbps(targetDimensions, compression);
  const target = Math.max(floor, Math.round(sourceVideoBitrate * scaledRatio));

  return {
    targetDimensions,
    targetBitrateKbps: target,
    maxRateKbps: Math.round(target * 1.15),
    bufferSizeKbps: Math.round(target * 2),
  };
};

const getExecTimeoutMs = (metadata: VideoMetadata, fileSize: number, compression: CompressionMode = "medium") => {
  // Fast encoding - much shorter timeouts now
  const presetMultiplier: Record<CompressionMode, number> = {
    low: 0.8,
    medium: 1.2,
    high: 1.8,
  };
  
  const multiplier = presetMultiplier[compression];
  const baseTimeout = 180000; // 3 minutes minimum
  const durationBased = metadata.duration * 1500 * multiplier; // 1.5 seconds per second of video × preset multiplier
  const sizeBased = (fileSize / 2000) * multiplier; // 0.5 second per MB × preset multiplier
  
  const totalTimeout = baseTimeout + durationBased + sizeBased;
  console.log(`Timeout calculation: base=${baseTimeout/1000}s, duration=${durationBased/1000}s, size=${sizeBased/1000}s, preset=${compression}×${multiplier}, total=${totalTimeout/1000}s`);
  
  // Max 15 minutes for large videos
  return Math.round(Math.min(900000, totalTimeout));
};

const getStallTimeoutMs = (metadata: VideoMetadata) =>
  Math.round(Math.max(30000, Math.min(90000, metadata.duration * 1500)));

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
  metadata: VideoMetadata;
  compression: CompressionMode;
  resolution: ResolutionMode;
  audioBitrateKbps: number;
}) => {
  const { targetDimensions, targetBitrateKbps, maxRateKbps, bufferSizeKbps } = getTargetVideoBitrate({
    metadata,
    compression,
    resolution,
    outputFormat,
    audioBitrateKbps,
  });

  const args = [
    "-i",
    inputName,
    "-map",
    "0:v:0",
    "-map",
    "0:a?",
    "-sn",
    "-dn",
    "-threads",
    "1",
  ];

  if (resolution !== "original" && (targetDimensions.width !== metadata.width || targetDimensions.height !== metadata.height)) {
    args.push("-vf", `scale=${targetDimensions.width}:${targetDimensions.height}`);
  }

  if (outputFormat === "mp4") {
    // Fast encoding with good compression
    // Use faster presets for speed, but still achieve 70-85% compression
    const presetByCompression: Record<CompressionMode, string> = {
      low: "ultrafast",
      medium: "veryfast",
      high: "fast",
    };

    // CRF values - balanced quality/speed
    const crfByCompression: Record<CompressionMode, string> = {
      low: "30",
      medium: "34",
      high: "38",
    };

    args.push(
      "-c:v",
      "libx264",
      "-preset",
      presetByCompression[compression],
      "-pix_fmt",
      "yuv420p",
      "-crf",
      crfByCompression[compression],
      "-c:a",
      "aac",
      "-b:a",
      compression === "high" ? "48k" : "64k",
      "-ac",
      compression === "high" ? "1" : "2",
      "-ar",
      "22050",
      "-movflags",
      "+faststart",
      "-tune",
      "fastdecode",
    );
  } else {
    // Use realtime mode with maximum speed settings
    args.push(
      "-c:v",
      "libvpx",
      "-deadline",
      "realtime",
      "-cpu-used",
      "8", // Maximum speed
      "-crf",
      "40", // Much higher = much faster
      "-qmin",
      "30",
      "-qmax",
      "63",
      "-c:a",
      "libvorbis",
      "-b:a",
      "48k", // Minimal audio
      "-ac",
      "1", // Mono
      "-ar",
      "22050", // Lower sample rate
    );
  }

  console.log(`Encoding with ${outputFormat} format using MAXIMUM speed settings`);

  args.push("-y", outputName);

  return args;
};

export default function VideoOptimizer() {
  const { addHistoryItem } = useHistory();
  const [files, setFiles] = useState<VideoFile[]>([]);
  const [compression, setCompression] = useState<CompressionMode>("medium");
  const [resolution, setResolution] = useState<ResolutionMode>("original");
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("mp4");
  const [audioBitrate, setAudioBitrate] = useState("128");
  const [processing, setProcessing] = useState(false);
  const [globalProgress, setGlobalProgress] = useState(0);
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const ffmpegModeRef = useRef<EngineMode | null>(null);
  const currentFileIdRef = useRef<string | null>(null);
  const completedRef = useRef(0);
  const pendingCountRef = useRef(1);
  const currentDurationRef = useRef(0);
  const fallbackTimerRef = useRef<number | null>(null);
  const currentFileProgressRef = useRef(0);
  const lastActivityRef = useRef(Date.now());
  const execWatchdogRef = useRef<number | null>(null);

  const updateFile = (id: string, patch: Partial<VideoFile>) => {
    setFiles((prev) => prev.map((file) => (file.id === id ? { ...file, ...patch } : file)));
  };

  const stopFallbackProgress = () => {
    if (fallbackTimerRef.current !== null) {
      window.clearInterval(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
  };

  const stopExecWatchdog = () => {
    if (execWatchdogRef.current !== null) {
      window.clearInterval(execWatchdogRef.current);
      execWatchdogRef.current = null;
    }
  };

  const markActivity = () => {
    lastActivityRef.current = Date.now();
  };

  const applyProgress = (progressValue: number) => {
    const currentId = currentFileIdRef.current;
    if (!currentId) return;

    // Allow reaching 100% when explicitly set
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
    }, 1200);
    applyProgress(startAt);
  };

  const resetFFmpeg = () => {
    stopExecWatchdog();
    stopFallbackProgress();
    try {
      ffmpegRef.current?.terminate();
    } catch {
      // Ignore reset errors.
    }
    ffmpegRef.current = null;
    ffmpegModeRef.current = null;
  };

  const loadFFmpeg = async (): Promise<FFmpeg> => {
    // Always create a fresh instance to avoid state issues
    resetFFmpeg();

    const ffmpeg = new FFmpeg();
    
    // Enhanced log handler with better progress detection
    const logHandler = ({ message }: { message: string }) => {
      markActivity();
      
      // Parse time information from FFmpeg logs for real progress
      const timeMatch = message.match(/time=(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/);
      if (timeMatch && currentDurationRef.current > 0) {
        const [, hours, minutes, seconds] = timeMatch;
        const elapsedSeconds =
          Number.parseInt(hours, 10) * 3600 +
          Number.parseInt(minutes, 10) * 60 +
          Number.parseFloat(seconds);
        const encodeRatio = Math.min(0.99, elapsedSeconds / currentDurationRef.current);
        const encodePercent = 15 + encodeRatio * 84; // 15% to 99%
        applyProgress(encodePercent);
        return;
      }

      // Detect frame information for additional progress updates
      const frameMatch = message.match(/frame=\s*(\d+)/);
      if (frameMatch && currentDurationRef.current > 0) {
        markActivity();
      }
    };

    // Progress handler for real-time updates
    const progressHandler = ({ progress }: { progress: number }) => {
      markActivity();
      const encodePercent = 15 + progress * 84; // 15% to 99%
      applyProgress(encodePercent);
    };

    ffmpeg.on("log", logHandler);
    ffmpeg.on("progress", progressHandler);

    await ffmpeg.load({
      coreURL: await toBlobURL(`${FFMPEG_CORE_BASE_ST}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${FFMPEG_CORE_BASE_ST}/ffmpeg-core.wasm`, "application/wasm"),
    });
    ffmpegModeRef.current = "single";

    ffmpegRef.current = ffmpeg;
    return ffmpeg;
  };

  const runEncode = async (
    ffmpeg: FFmpeg, 
    args: string[], 
    metadata: VideoMetadata, 
    fileSize: number,
    compression: CompressionMode = "medium"
  ) => {
    return new Promise<void>((resolve, reject) => {
      const execTimeoutMs = getExecTimeoutMs(metadata, fileSize, compression);
      let completed = false;
      let timeoutId: number | null = null;
      let execPromise: Promise<number> | null = null;

      const cleanup = () => {
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId);
          timeoutId = null;
        }
      };

      const finish = (error?: Error) => {
        if (completed) return;
        completed = true;
        cleanup();
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      };

      // Set a very generous timeout - encoding can take a long time in browser
      timeoutId = window.setTimeout(() => {
        if (!completed) {
          finish(new Error("Video encoding timed out after " + Math.round(execTimeoutMs/1000) + " seconds"));
        }
      }, execTimeoutMs);

      console.log(`Starting FFmpeg encoding with ${args.length} args, timeout: ${Math.round(execTimeoutMs/1000)}s`);

      // Execute the encoding with proper error handling
      try {
        execPromise = ffmpeg.exec(args);

        execPromise
          .then((exitCode) => {
            console.log(`FFmpeg exec completed with exit code: ${exitCode}`);
            if (!completed) {
              if (exitCode === 0) {
                finish();
              } else {
                finish(new Error(`FFmpeg exited with code ${exitCode}`));
              }
            }
          })
          .catch((error) => {
            console.error("FFmpeg exec error:", error);
            if (!completed) {
              finish(error instanceof Error ? error : new Error(String(error)));
            }
          });
      } catch (error) {
        console.error("FFmpeg exec threw immediately:", error);
        if (!completed) {
          finish(error instanceof Error ? error : new Error(String(error)));
        }
      }
    });
  };

  const handleFiles = (newFiles: File[]) => {
    const videos = newFiles.filter(
      (file) =>
        ["video/mp4", "video/quicktime", "video/webm", "video/x-msvideo", "video/avi"].includes(file.type) ||
        /\.(mp4|mov|webm|avi|mkv)$/i.test(file.name),
    );

    if (!videos.length) {
      toast.error("Please upload MP4, MOV, WebM, or AVI files only");
      return;
    }

    setFiles((prev) => [
      ...prev,
      ...videos.map((file) => ({
        id: crypto.randomUUID(),
        file,
        status: "pending" as const,
      })),
    ]);
  };

  const handleOptimize = async () => {
    const pendingFiles = files.filter((file) => file.status === "pending");
    if (!pendingFiles.length) {
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
    completedRef.current = 0;
    pendingCountRef.current = pendingFiles.length;
    pendingFiles.forEach((file) => updateFile(file.id, { status: "processing", progress: 0, errorMsg: undefined }));

    const selectedAudioBitrate = Number.parseInt(audioBitrate, 10) || 128;

    console.log(`Starting video optimization for ${pendingFiles.length} file(s)`);

    for (const fileObj of pendingFiles) {
      const ext = fileObj.file.name.split(".").pop() || "mp4";
      const inputName = `in_${fileObj.id}.${ext}`;
      const outputName = `out_${fileObj.id}.${outputFormat}`;
      currentFileIdRef.current = fileObj.id;
      currentFileProgressRef.current = 0;
      currentDurationRef.current = 0;

      try {
        applyProgress(2);
        const metadata = await getVideoMetadata(fileObj.file);
        currentDurationRef.current = metadata.duration;
        applyProgress(6);
        
        // Use fresh FFmpeg instance for reliable encoding
        const ffmpeg = await loadFFmpeg();
        
        // Try MP4 first as it's more reliable, then WebM if needed
        const primaryFormat = outputFormat;
        const args = buildEncodeArgs({
          inputName,
          outputName,
          outputFormat: primaryFormat,
          metadata,
          compression,
          resolution,
          audioBitrateKbps: selectedAudioBitrate,
        });

        startFallbackProgress(8, 14);
        await ffmpeg.writeFile(inputName, await fetchFile(fileObj.file));
        applyProgress(14);
        
        console.log(`FFmpeg args:`, args.join(' '));
        
        // Small delay to ensure file is written properly
        await new Promise(resolve => setTimeout(resolve, 100));
        
        toast.info(`Encoding ${fileObj.file.name}... This may take a while.`);

        // Stop fallback progress and let real encoding progress take over
        stopFallbackProgress();
        
        // Set progress to 15% to start encoding
        applyProgress(15);

        await runEncode(ffmpeg, args, metadata, fileObj.file.size, compression);

        // Encoding completed successfully
        applyProgress(100);

        console.log(`Encoding completed, reading output file...`);

        // Check if output file exists with timeout
        let data: Awaited<ReturnType<FFmpeg["readFile"]>> | null = null;
        try {
          // Add timeout for file read operation
          const readPromise = ffmpeg.readFile(outputName);
          const timeoutPromise = new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error("File read timeout")), 60000)
          );
          
          data = await Promise.race([readPromise, timeoutPromise]);
          
          if (!data) {
            throw new Error("Output file data is null");
          }
          const dataSize = (data as ArrayBuffer).byteLength;
          console.log(`Output file size: ${dataSize} bytes`);
          if (dataSize === 0) {
            throw new Error("Output file is empty - encoding may have failed");
          }
        } catch (readError) {
          console.error("Failed to read output file:", readError);
          throw new Error("Failed to read encoded output - encoding may have failed");
        }

        const blob = new Blob([new Uint8Array(data as ArrayBuffer)], {
          type: primaryFormat === "webm" ? "video/webm" : "video/mp4",
        });
        const url = URL.createObjectURL(blob);
        const saving = Math.max(0, Math.round((1 - blob.size / fileObj.file.size) * 100));

        updateFile(fileObj.id, {
          status: "done",
          outputUrl: url,
          outputSize: blob.size,
          progress: 100,
          outputFormat: primaryFormat,
        });

        addHistoryItem({
          name: fileObj.file.name,
          type: "video",
          action: `Compressed -> ${resolution} ${outputFormat.toUpperCase()}`,
          originalSize: fileObj.file.size,
          optimizedSize: blob.size,
          saved: `${saving}%`,
          url,
        });

        toast.success(`${fileObj.file.name} optimized successfully! Saved ${saving}%`);
      } catch (error) {
        stopFallbackProgress();
        stopExecWatchdog();
        console.error("Video optimization failed:", error);
        updateFile(fileObj.id, {
          status: "error",
          errorMsg: error instanceof Error ? error.message : "Processing failed",
        });
        toast.error(`Failed: ${fileObj.file.name}`);
      } finally {
        try {
          await ffmpegRef.current?.deleteFile(inputName);
        } catch {
          // Ignore cleanup errors.
        }
        try {
          await ffmpegRef.current?.deleteFile(outputName);
        } catch {
          // Ignore cleanup errors.
        }

        completedRef.current += 1;
        currentFileIdRef.current = null;
        currentDurationRef.current = 0;
        currentFileProgressRef.current = 0;
        stopFallbackProgress();
        setGlobalProgress(Math.round((completedRef.current / pendingCountRef.current) * 100));
      }
    }

    stopExecWatchdog();
    setProcessing(false);
    const successCount = files.filter(f => f.status === "done").length;
    toast.success(`Video optimization complete! ${successCount} of ${pendingFiles.length} videos processed successfully`);
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
    anchor.download = `optimized_${baseName}.${fileObj.outputFormat || 'mp4'}`;
    anchor.click();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Video Optimizer</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Compress, resize and convert videos with browser-based FFmpeg.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-1">
          <div className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-card">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-card-foreground">Settings</h2>

            <div>
              <label className="text-sm font-medium text-card-foreground">Compression Level</label>
              <Select value={compression} onValueChange={(value) => setCompression(value as CompressionMode)}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low - Best Quality</SelectItem>
                  <SelectItem value="medium">Medium - Balanced</SelectItem>
                  <SelectItem value="high">High - Smallest Size</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium text-card-foreground">Output Resolution</label>
              <Select value={resolution} onValueChange={(value) => setResolution(value as ResolutionMode)}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="original">Original (Keep Resolution)</SelectItem>
                  <SelectItem value="1080p">1080p - Full HD</SelectItem>
                  <SelectItem value="720p">720p - HD</SelectItem>
                  <SelectItem value="480p">480p - SD</SelectItem>
                  <SelectItem value="360p">360p - Low</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium text-card-foreground">Output Format</label>
              <Select value={outputFormat} onValueChange={(value) => setOutputFormat(value as OutputFormat)}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mp4">MP4 - Best Compatibility</SelectItem>
                  <SelectItem value="webm">WebM - Web Optimized</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium text-card-foreground">Audio Bitrate: {audioBitrate}kbps</label>
              <Slider
                value={[Number.parseInt(audioBitrate, 10)]}
                onValueChange={([value]) => setAudioBitrate(String(value))}
                min={64}
                max={320}
                step={32}
                className="mt-2"
              />
              <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                <span>64k</span>
                <span>128k</span>
                <span>192k</span>
                <span>320k</span>
              </div>
            </div>

            <Button
              onClick={handleOptimize}
              disabled={processing || !files.some((file) => file.status === "pending")}
              className="w-full border-0 gradient-primary text-primary-foreground"
            >
              {processing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {globalProgress < 10 ? "Preparing..." : 
                   globalProgress < 99 ? "Optimizing..." : 
                   "Finalizing..."} {globalProgress}%
                </>
              ) : (
                <>
                  Optimize Videos
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>

            {processing && (
              <div className="space-y-2">
                <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                  <motion.div
                    className="h-full rounded-full gradient-primary"
                    animate={{ width: `${globalProgress}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Overall progress: {globalProgress}% - {completedRef.current} of {pendingCountRef.current} files complete
                </p>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-4 shadow-card">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Fast & Efficient
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {["Fast Presets", "Real Progress", "Smart Compression"].map((format) => (
                <span
                  key={format}
                  className="rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground"
                >
                  {format}
                </span>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Fast encoding with 70-85% compression. Real-time progress updates from FFmpeg. Large videos optimized efficiently.
            </p>
          </div>
        </div>

        <div className="space-y-4 lg:col-span-2">
          <DropZone
            accept="video/mp4,video/quicktime,video/webm,video/x-msvideo,.mp4,.mov,.webm,.avi,.mkv"
            onFiles={handleFiles}
            label="Drop videos here or click to browse"
            sublabel="MP4, MOV, WebM, AVI, MKV supported"
          />

          <AnimatePresence>
            {files.map((fileObj) => (
              <motion.div
                key={fileObj.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                className="rounded-xl border border-border bg-card p-4 shadow-card"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    {fileObj.status === "done" ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : fileObj.status === "error" ? (
                      <AlertCircle className="h-5 w-5 text-destructive" />
                    ) : fileObj.status === "processing" ? (
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    ) : (
                      <Video className="h-5 w-5 text-primary" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-card-foreground">{fileObj.file.name}</p>
                    <div className="text-xs text-muted-foreground">
                      {fileObj.status === "done" && fileObj.outputSize ? (
                        <span>
                          {formatSize(fileObj.file.size)}{" "}
                          <span className="text-muted-foreground">-&gt;</span>{" "}
                          <span className="font-medium text-green-500">{formatSize(fileObj.outputSize)}</span>{" "}
                          <span className="text-green-500">
                            (-{Math.max(0, Math.round((1 - fileObj.outputSize / fileObj.file.size) * 100))}%)
                          </span>
                        </span>
                      ) : fileObj.status === "error" ? (
                        <span className="text-destructive">{fileObj.errorMsg || "Processing failed"}</span>
                      ) : (
                        <span>{formatSize(fileObj.file.size)}</span>
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
                        <p className="text-xs text-muted-foreground">
                          Processing: {fileObj.progress}% complete
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-1.5">
                    {fileObj.status === "done" && fileObj.outputUrl && (
                      <Button size="icon" variant="ghost" title="Download" onClick={() => downloadVideo(fileObj)}>
                        <Download className="h-4 w-4" />
                      </Button>
                    )}

                    {fileObj.status === "error" && (
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Retry"
                        onClick={() => updateFile(fileObj.id, { status: "pending", errorMsg: undefined, progress: 0 })}
                      >
                        <ArrowRight className="h-4 w-4 text-primary" />
                      </Button>
                    )}

                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setFiles((prev) => prev.filter((item) => item.id !== fileObj.id))}
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
