import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, Trash2, ArrowRight, Package, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { DropZone } from "@/components/DropZone";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { useHistory } from "@/contexts/HistoryContext";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { consumeDownloadUsage, consumeServiceUsage, getCurrentUserId } from "@/lib/memberLimits";
import {
  getSupabaseTempConfig,
  removeTempFileFromSupabase,
  shouldUseSupabaseTempUpload,
  uploadTempFileToSupabase,
} from "@/lib/supabaseTempStorage";

interface ImageFile {
  id: string;
  file: File;
  preview: string;
  supabasePath?: string;
  supabaseSignedUrl?: string;
  optimized?: string;
  optimizedSize?: number;
  status: "pending" | "processing" | "done" | "error";
  errorMsg?: string;
}

const formatSize = (bytes: number) => {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(2) + " MB";
};

const FFMPEG_CORE_BASE = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
const FFMPEG_REQUIRED_EXTENSIONS = [".psd", ".tiff", ".tif", ".heic", ".heif"];

const looksLikeHeifFamily = async (file: File) => {
  try {
    const headerBuffer = await file.slice(0, 12).arrayBuffer();
    const bytes = new Uint8Array(headerBuffer);
    if (bytes.length < 12) return false;

    // Explicitly exclude common non-HEIF formats by their magic numbers
    // JPEG: FF D8
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return false;
    // PNG: 89 50
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return false;
    // GIF: 47 49 ("GI")
    if (bytes[0] === 0x47 && bytes[1] === 0x49) return false;
    // RIFF (WebP): 52 49
    if (bytes[0] === 0x52 && bytes[1] === 0x49) return false;

    // HEIF/AVIF: bytes 4-7 must be exactly "ftyp" (0x66 0x74 0x79 0x70)
    if (bytes[4] !== 0x66 || bytes[5] !== 0x74 || bytes[6] !== 0x79 || bytes[7] !== 0x70) return false;
    
    // Brand check
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]).toLowerCase();
    const isHeifBrand = ["heic", "heix", "hevc", "heif", "mif1", "msf1", "avif", "avis"].some((b) => brand.startsWith(b));

    if (!isHeifBrand) return false;

    // If it has a common extension but looks like HEIF, be cautious. 
    // Renaissance of HEIC files as renamed JPEGs is real, but let's be sure.
    const ext = file.name.toLowerCase().split('.').pop();
    if (["jpg", "jpeg", "png", "webp", "gif"].includes(ext || "")) {
      // It has a standard extension but HEIF signature. We'll return true to try HEIF decoders,
      // but only if nothing else has worked.
    }
    
    return true;
  } catch {
    return false;
  }
};

const canBrowserDecodeImage = async (file: File) => {
  // Fast path: createImageBitmap
  try {
    const bitmap = await createImageBitmap(file);
    const valid = bitmap.width > 0 && bitmap.height > 0;
    bitmap.close();
    if (valid) return true;
  } catch {
    // Fall through to HTMLImageElement (handles CMYK, progressive JPEG, special ICC profiles)
  }
  // Slower fallback: HTMLImageElement supports more JPEG variants
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<boolean>((resolve) => {
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img.naturalWidth > 0 && img.naturalHeight > 0); };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(false); };
      img.src = url;
    });
  } catch {
    URL.revokeObjectURL(url);
    return false;
  }
};

const convertHeifWithHeic2Any = async (file: File): Promise<Blob> => {
  const mod = await import("heic2any");
  const convertFn = (mod.default || mod) as unknown as (options: {
    blob: Blob;
    toType: string;
    quality?: number;
    multiple?: boolean;
  }) => Promise<Blob | Blob[]>;

  const unwrap = (output: Blob | Blob[]): Blob => {
    if (Array.isArray(output)) {
      if (!output.length) throw new Error("HEIC conversion returned empty output");
      return output[0];
    }
    return output;
  };

  // Try all combinations: PNG/JPEG × single/multiple frame
  const attempts = [
    { toType: "image/png",  multiple: false },
    { toType: "image/png",  multiple: true  },
    { toType: "image/jpeg", quality: 0.95, multiple: false },
    { toType: "image/jpeg", quality: 0.95, multiple: true  },
  ];
  for (const opts of attempts) {
    try {
      return unwrap(await convertFn({ blob: file, ...opts }));
    } catch { /* try next */ }
  }
  throw new Error("heic2any: all decode attempts failed");
};

export default function ImageOptimizer() {
  const { addHistoryItem } = useHistory();
  const [files, setFiles] = useState<ImageFile[]>([]);
  const [quality, setQuality] = useState(80);
  const [outputFormat, setOutputFormat] = useState("webp");
  const [processing, setProcessing] = useState(false);
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const cleanupTimeoutsRef = useRef<Record<string, number>>({});

  const loadFFmpeg = async () => {
    if (ffmpegRef.current) return ffmpegRef.current;
    const ffmpeg = new FFmpeg();
    const baseURL = FFMPEG_CORE_BASE;
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
    });
    ffmpegRef.current = ffmpeg;
    return ffmpeg;
  };

  const handleFiles = useCallback(async (newFiles: File[]) => {
    // Extensive list of image formats including PSD
    const supportedExts = ['.jpg', '.jpeg', '.png', '.webp', '.psd', '.tiff', '.tif', '.heic', '.heif', '.bmp', '.gif', '.svg', '.avif'];
    const imageFiles = newFiles.filter((f) => {
      const ext = `.${f.name.split('.').pop()?.toLowerCase()}`;
      return f.type.startsWith("image/") || supportedExts.includes(ext) || f.name.toLowerCase().endsWith('.psd');
    });

    if (imageFiles.length < newFiles.length) {
      toast.warning(`${newFiles.length - imageFiles.length} file(s) skipped (unsupported format)`);
    }

    const supabaseConfig = getSupabaseTempConfig();
    const shouldUseSupabase = shouldUseSupabaseTempUpload(supabaseConfig);
    const userId = getCurrentUserId();
    let supabaseUploadFailedCount = 0;

    const mapped: ImageFile[] = await Promise.all(imageFiles.map(async (f) => {
      const fileId = crypto.randomUUID();
      const lowerName = f.name.toLowerCase();
      const ext = `.${lowerName.split(".").pop() || ""}`;
      const isPsdOrTiff = [".psd", ".tiff", ".tif"].includes(ext);
      const isFfmpegExt = FFMPEG_REQUIRED_EXTENSIONS.includes(ext);
      const isHeifSignature = await looksLikeHeifFamily(f);
      // Try browser decode for everything EXCEPT PSD/TIFF which usually require FFmpeg
      const browserDecodable = !isPsdOrTiff ? await canBrowserDecodeImage(f) : false;
      let preview = browserDecodable ? URL.createObjectURL(f) : "";

      let supabasePath: string | undefined;
      let supabaseSignedUrl: string | undefined;

      if (shouldUseSupabase) {
        try {
          const uploaded = await uploadTempFileToSupabase(f, userId);
          if (uploaded) {
            supabasePath = uploaded.path;
            supabaseSignedUrl = uploaded.signedUrl;
            if (!preview) preview = uploaded.signedUrl;
          }
        } catch {
          supabaseUploadFailedCount += 1;
        }
      }

      return {
        id: fileId,
        file: f,
        preview,
        supabasePath,
        supabaseSignedUrl,
        status: "pending",
      };
    }));

    if (shouldUseSupabase && supabaseUploadFailedCount > 0) {
      toast.warning(`${supabaseUploadFailedCount} file(s) could not be uploaded to Supabase, local fallback used`);
    }

    setFiles((prev) => [...prev, ...mapped]);
  }, []);

  const removeFile = (id: string) => {
    const target = files.find((x) => x.id === id);
    if (target?.supabasePath) {
      void removeTempFileFromSupabase(target.supabasePath);
    }
    const timeoutId = cleanupTimeoutsRef.current[id];
    if (timeoutId) {
      clearTimeout(timeoutId);
      delete cleanupTimeoutsRef.current[id];
    }
    setFiles((prev) => {
      const f = prev.find((x) => x.id === id);
      if (f && f.preview && f.preview.startsWith('blob:')) URL.revokeObjectURL(f.preview);
      if (f && f.optimized && f.optimized.startsWith('blob:')) URL.revokeObjectURL(f.optimized);
      return prev.filter((x) => x.id !== id);
    });
  };

  useEffect(() => {
    return () => {
      Object.values(cleanupTimeoutsRef.current).forEach((timeoutId) => clearTimeout(timeoutId));
      cleanupTimeoutsRef.current = {};
    };
  }, []);

  const cleanupSupabaseSource = async (img: ImageFile) => {
    if (!img.supabasePath) return;
    try {
      await removeTempFileFromSupabase(img.supabasePath);
    } catch {
      // Ignore immediate cleanup failure and retry in delayed cleanup below.
    }

    const retentionMinutes = Math.max(1, getSupabaseTempConfig().retentionMinutes || 5);
    const delayMs = retentionMinutes * 60 * 1000;
    const existingTimeout = cleanupTimeoutsRef.current[img.id];
    if (existingTimeout) clearTimeout(existingTimeout);
    cleanupTimeoutsRef.current[img.id] = window.setTimeout(async () => {
      try {
        await removeTempFileFromSupabase(img.supabasePath!);
      } finally {
        delete cleanupTimeoutsRef.current[img.id];
      }
    }, delayMs);
  };

  const optimizeImage = async (img: ImageFile): Promise<ImageFile> => {
    const outputMime =
      outputFormat === "webp"
        ? "image/webp"
        : outputFormat === "jpeg"
          ? "image/jpeg"
          : "image/png";

    // Normalize .jpeg to .jpg for consistent handling
    const normalizeExt = (ext: string) => ext === ".jpeg" ? ".jpg" : ext;

    const toPngWithFfmpeg = async (heifHint = false): Promise<Blob> => {
      const ffmpeg = await loadFFmpeg();
      const lowerName = img.file.name.toLowerCase();
      let inputExt = normalizeExt(lowerName.split(".").pop() || "bin");

      // Use a safe input extension for FFmpeg
      // If heifHint is true AND the extension isn't already a known HEIF one, use .heic
      // Otherwise use the original extension to avoid confusing FFmpeg's format auto-detection
      if (heifHint && !["heic", "heif", "avif"].includes(inputExt)) {
        inputExt = "heic";
      }

      const inputName = `input_${img.id.substring(0, 8)}.${inputExt}`;
      const outputName = `output_${img.id.substring(0, 8)}.png`;

      try {
        console.log(`[Optimizer] FFmpeg: Reading file data for ${img.file.name}`);
        const fileData = await img.file.arrayBuffer();
        console.log(`[Optimizer] FFmpeg: Writing ${inputName} (${fileData.byteLength} bytes)`);
        await ffmpeg.writeFile(inputName, new Uint8Array(fileData));
      } catch (e: any) {
        console.error(`[Optimizer] FFmpeg: Failed to write input file`, e);
        throw new Error(`FFmpeg filesystem error (write): ${e.message || e}`);
      }

      // Try multiple command variants for maximum compatibility
      let decoded = false;
      const commands = [
        ["-i", inputName, "-frames:v", "1", outputName],
        ["-i", inputName, outputName],
        // Explicit HEIF container format (helps when auto-detect fails)
        ...(inputExt === "heic" ? [
          ["-f", "heif", "-i", inputName, outputName],
          ["-f", "heif", "-i", inputName, "-frames:v", "1", outputName],
        ] : []),
      ];
      for (const args of commands) {
        try {
          await ffmpeg.exec(args);
          decoded = true;
          break;
        } catch { /* try next variant */ }
      }

      try { await ffmpeg.deleteFile(inputName); } catch { /* ignore */ }

      if (!decoded) {
        try { await ffmpeg.deleteFile(inputName); } catch { /* ignore */ }
        try { await ffmpeg.deleteFile(outputName); } catch { /* ignore */ }
        throw new Error(`FFmpeg could not decode ${inputExt.toUpperCase()} source`);
      }

      console.log(`[Optimizer] FFmpeg: Reading output ${outputName}`);
      let data;
      try {
        data = await ffmpeg.readFile(outputName);
      } catch (e: any) {
        console.error(`[Optimizer] FFmpeg: Failed to read output file`, e);
        throw new Error(`FFmpeg filesystem error (read): ${e.message || e}`);
      }

      const blob = new Blob([data as any], { type: "image/png" });

      try { await ffmpeg.deleteFile(outputName); } catch { /* ignore */ }

      return blob;
    };

    // PNG preserves transparency; JPEG/WebP use opaque canvas (no alpha = smaller files)
    const isPng = outputMime === "image/png";
    const isJpeg = outputMime === "image/jpeg";

    const blobToOptimized = (sourceBlob: Blob, previewUrl: string): Promise<ImageFile | null> =>
      new Promise(async (resolve) => {
        const canvas = document.createElement("canvas");
        // For JPEG, we must use opaque canvas; for PNG/WebP keep alpha support
        const ctx = canvas.getContext("2d", { alpha: !isJpeg });
        if (!ctx) {
          resolve(null);
          return;
        }

        const drawToCanvas = (w: number, h: number, drawFn: () => void) => {
          canvas.width = w;
          canvas.height = h;
          if (isJpeg) {
            // Fill white so transparent areas don't become black in JPEG
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, w, h);
          }
          drawFn();
        };

        try {
          const bitmap = await createImageBitmap(sourceBlob);
          if (!bitmap.width || !bitmap.height) {
            bitmap.close();
            resolve(null);
            return;
          }
          drawToCanvas(bitmap.width, bitmap.height, () => ctx.drawImage(bitmap, 0, 0));
          bitmap.close();
        } catch {
          // Fallback to HTMLImageElement for better format support
          const localUrl = URL.createObjectURL(sourceBlob);
          const loaded = await new Promise<boolean>((resolveLoad) => {
            const image = new Image();
            image.onload = () => {
              if (!image.naturalWidth || !image.naturalHeight) {
                resolveLoad(false);
                return;
              }
              drawToCanvas(image.naturalWidth, image.naturalHeight, () => ctx.drawImage(image, 0, 0));
              resolveLoad(true);
            };
            image.onerror = () => {
              URL.revokeObjectURL(localUrl);
              resolveLoad(false);
            };
            image.src = localUrl;
          });
          if (!loaded) {
            resolve(null);
            return;
          }
        }

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(null);
              return;
            }
            resolve({
              ...img,
              preview: previewUrl || img.preview,
              optimized: URL.createObjectURL(blob),
              optimizedSize: blob.size,
              status: "done",
            });
          },
          outputMime,
          isJpeg ? Math.max(0.1, quality / 100) : quality / 100
        );
      });

    try {
      const fileName = img.file.name.toLowerCase();
      const rawExt = `.${fileName.split(".").pop() || ""}`;
      const ext = normalizeExt(rawExt);
      const isHeifLike = await looksLikeHeifFamily(img.file);
      const isPsdOrTiff = [".psd", ".tiff", ".tif"].includes(rawExt);
      const isSvg = rawExt === ".svg";
      const needsFfmpegExt = FFMPEG_REQUIRED_EXTENSIONS.includes(rawExt);
      let previewUrl = img.preview || URL.createObjectURL(img.file);

      console.log(`[Optimizer] Starting: ${img.file.name} (ext: ${ext}, heif: ${isHeifLike}, psd/tiff: ${isPsdOrTiff}, svg: ${isSvg})`);

      // Step 1: Try Supabase remote blob if available (browser-decodable formats only)
      if (!isPsdOrTiff && !isHeifLike && img.supabaseSignedUrl) {
        try {
          console.log(`[Optimizer] Trying Supabase remote blob for ${img.file.name}`);
          const response = await fetch(img.supabaseSignedUrl);
          if (response.ok) {
            const remoteBlob = await response.blob();
            const remoteResult = await blobToOptimized(remoteBlob, previewUrl);
            if (remoteResult) {
              console.log(`[Optimizer] Success: Supabase remote blob for ${img.file.name}`);
              return remoteResult;
            }
          }
        } catch (e) {
          console.warn(`[Optimizer] Supabase fetch failed:`, e);
        }
      }

      // Step 2: Try browser canvas decode directly (works for JPEG/PNG/WebP/AVIF/SVG and modern HEIF)
      if (!isPsdOrTiff) {
        console.log(`[Optimizer] Trying native browser decode for ${img.file.name}`);
        const directResult = await blobToOptimized(img.file, previewUrl);
        if (directResult) {
          console.log(`[Optimizer] Success: Native browser decode for ${img.file.name}`);
          return directResult;
        }
      }

      // Step 2.5: Handle HEIC files with wrong extension or missing browser support
      if (isHeifLike) {
        console.log(`[Optimizer] Detected HEIF-like signature for ${img.file.name}, trying specific HEIF decoders`);
        const rawBytes = await img.file.arrayBuffer();
        
        // Try Web Codecs ImageDecoder API (Chrome 94+) — uses OS-level HEVC codec if installed
        if (typeof (window as any).ImageDecoder !== "undefined") {
          for (const mime of ["image/heic", "image/heif", "image/avif"]) {
            try {
              const supported = await (window as any).ImageDecoder.isTypeSupported(mime);
              if (!supported) continue;
              console.log(`[Optimizer] Trying ImageDecoder with ${mime} for ${img.file.name}`);
              const decoder = new (window as any).ImageDecoder({
                data: new Blob([rawBytes], { type: mime }).stream(),
                type: mime,
              });
              const { image } = await decoder.decode();
              const w = image.displayWidth as number;
              const h = image.displayHeight as number;
              const cvs = document.createElement("canvas");
              cvs.width = w; cvs.height = h;
              const cx = cvs.getContext("2d", { alpha: isPng }) as CanvasRenderingContext2D;
              if (cx) {
                if (!isPng) { cx.fillStyle = "#ffffff"; cx.fillRect(0, 0, w, h); }
                cx.drawImage(image as any, 0, 0);
                image.close?.();
                const optimized = await new Promise<Blob | null>(r => cvs.toBlob(r, outputMime, quality / 100));
                if (optimized) {
                  console.log(`[Optimizer] Success: ImageDecoder (${mime}) for ${img.file.name}`);
                  return {
                    ...img, preview: previewUrl || img.preview,
                    optimized: URL.createObjectURL(optimized),
                    optimizedSize: optimized.size, status: "done",
                  };
                }
              }
            } catch (e) {
              console.warn(`[Optimizer] ImageDecoder (${mime}) failed for ${img.file.name}:`, e);
            }
          }
        }

        // Try heic2any for confirmed HEIF files
        try {
          console.log(`[Optimizer] Trying heic2any for ${img.file.name}`);
          const heifBlob = await convertHeifWithHeic2Any(img.file);
          const heifPreviewUrl = URL.createObjectURL(heifBlob);
          const heifResult = await blobToOptimized(heifBlob, heifPreviewUrl);
          if (heifResult) {
            console.log(`[Optimizer] Success: heic2any for ${img.file.name}`);
            return heifResult;
          }
        } catch (e) {
          console.warn(`[Optimizer] heic2any failed for ${img.file.name}:`, e);
        }
      }

      // Step 3: FFmpeg fallback (PSD, TIFF, and anything else that failed)
      try {
        console.log(`[Optimizer] Trying FFmpeg fallback for ${img.file.name}`);
        const fallbackBlob = await toPngWithFfmpeg(isHeifLike);
        const fallbackPreviewUrl = URL.createObjectURL(fallbackBlob);
        const fallbackResult = await blobToOptimized(fallbackBlob, fallbackPreviewUrl);
        if (fallbackResult) {
          console.log(`[Optimizer] Success: FFmpeg fallback for ${img.file.name}`);
          return fallbackResult;
        }
        
        const errorMsg = (isHeifLike && !["jpg", "jpeg"].includes(rawExt.replace('.', '')))
          ? "HEIC/HEIF file could not be decoded. Re-export as JPEG or PNG from the Photos app."
          : isPsdOrTiff
            ? "PSD/TIFF file could not be decoded. Try a simpler image format."
            : "Failed to decode image for optimization. Re-export as JPG/PNG and try again.";

        return { ...img, status: "error", errorMsg };
      } catch (fallbackErr: any) {
        console.error(`[Optimizer] FFmpeg failed for ${img.file.name}:`, fallbackErr);
        // FFmpeg may reject with a non-Error (integer exit code), so build a specific message
        let specificMsg = (fallbackErr?.message || String(fallbackErr) || "Failed to decode image.");

        if (isHeifLike && !["jpg", "jpeg"].includes(rawExt.replace('.', ''))) {
          specificMsg = "HEIC/HEIF file could not be decoded. Open in the Photos app and re-export as JPEG or PNG.";
        } else if (specificMsg.includes("FS error") || specificMsg.includes("filesystem error")) {
          specificMsg = "Processing engine error. Please try refreshing the page or using a different browser.";
        }

        return {
          ...img,
          status: "error",
          errorMsg: specificMsg,
        };
      }
    } catch (err: any) {
      console.error(err);
      return {
        ...img,
        status: "error",
        errorMsg: err?.message || "Optimization failed for this file",
      };
    }
  };

  const handleOptimize = async () => {
    if (!files.length) return;
    const usage = consumeServiceUsage("image-optimizer");
    if (!usage.ok) {
      toast.error(`Image Optimizer limit reached (${usage.used}/${usage.limit})`);
      return;
    }
    setProcessing(true);

    // Check if any non-native formats are present and load FFmpeg if needed
    const needsFFmpeg = files.some(f => {
      const name = f.file.name.toLowerCase();
      return FFMPEG_REQUIRED_EXTENSIONS.some((ext) => name.endsWith(ext));
    });

    if (needsFFmpeg) {
      toast.info("Loading conversion engine for advanced formats...");
      try {
        await loadFFmpeg();
      } catch {
        toast.error("Failed to initialize conversion engine");
      }
    }

    const currentFiles = [...files];
    for (let i = 0; i < currentFiles.length; i++) {
      const f = currentFiles[i];
      if (f.status === "done" || f.status === "error") continue;

      setFiles(prev => prev.map(item => item.id === f.id ? { ...item, status: "processing" } : item));

      const result = await optimizeImage(f);

      setFiles(prev => prev.map(item => item.id === f.id ? result : item));
      currentFiles[i] = result;
      await cleanupSupabaseSource(f);

      if (result.status === "done" && result.optimizedSize) {
        let saved = "—";
        if (f.file.size > result.optimizedSize) {
          saved = Math.round((1 - result.optimizedSize / f.file.size) * 100) + "%";
        }
        addHistoryItem({
          name: f.file.name,
          type: "image",
          action: `Converted to ${outputFormat.toUpperCase()}`,
          originalSize: f.file.size,
          optimizedSize: result.optimizedSize,
          saved,
          url: result.optimized,
        });
      }
    }
    setProcessing(false);
    const successCount = currentFiles.filter(f => f.status === "done").length;
    if (successCount > 0) {
      toast.success(`Optimized ${successCount} image(s)`);
    }
  };

  const downloadSingle = (f: ImageFile) => {
    if (!f.optimized) return;
    const download = consumeDownloadUsage();
    if (!download.ok) {
      toast.error(`Download limit reached (${download.used}/${download.limit})`);
      return;
    }
    const a = document.createElement("a");
    a.href = f.optimized;
    const ext = outputFormat === "jpeg" ? "jpg" : outputFormat;
    a.download = f.file.name.replace(/\.\w+$/, `.${ext}`);
    a.click();
  };

  const downloadAll = async () => {
    const done = files.filter((f) => f.optimized);
    if (!done.length) return;
    const download = consumeDownloadUsage();
    if (!download.ok) {
      toast.error(`Download limit reached (${download.used}/${download.limit})`);
      return;
    }
    const zip = new JSZip();
    for (const f of done) {
      const resp = await fetch(f.optimized!);
      const blob = await resp.blob();
      const ext = outputFormat === "jpeg" ? "jpg" : outputFormat;
      zip.file(f.file.name.replace(/\.\w+$/, `.${ext}`), blob);
    }
    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, "optimized-images.zip");
  };

  const doneFiles = files.filter((f) => f.status === "done");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Image Optimizer</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Compress and convert images — Supports PSD, JPG, PNG, WebP, HEIC & more
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Controls */}
        <div className="space-y-5 lg:col-span-1">
          <div className="rounded-xl border border-border bg-card p-5 shadow-card space-y-5">
            <div>
              <label className="text-sm font-medium text-card-foreground">Output Format</label>
              <Select value={outputFormat} onValueChange={setOutputFormat}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="webp">WebP (Optimized)</SelectItem>
                  <SelectItem value="jpeg">JPEG (Universal)</SelectItem>
                  <SelectItem value="png">PNG (Lossless)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium text-card-foreground">
                Quality: {quality}%
              </label>
              <Slider
                value={[quality]}
                onValueChange={([v]) => setQuality(v)}
                min={10}
                max={100}
                step={1}
                className="mt-2"
              />
              <div className="flex gap-1.5 mt-2 flex-wrap">
                {[50, 60, 70, 80, 90].map((q) => (
                  <button
                    key={q}
                    onClick={() => setQuality(q)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${quality === q
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                      }`}
                  >
                    {q}%
                  </button>
                ))}
              </div>
            </div>

            <Button
              onClick={handleOptimize}
              disabled={!files.some(f => f.status === "pending") || processing}
              className="w-full gradient-primary text-primary-foreground border-0"
            >
              {processing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing…
                </>
              ) : (
                <>
                  Optimize All
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>

            {doneFiles.length > 1 && (
              <Button variant="outline" onClick={downloadAll} className="w-full">
                <Package className="mr-2 h-4 w-4" />
                Download ZIP
              </Button>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-4 shadow-card">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Supported Formats</h3>
            <div className="flex flex-wrap gap-1.5">
              {['PSD', 'JPG', 'PNG', 'WebP', 'TIFF', 'HEIC', 'SVG', 'AVIF'].map((f) => (
                <span key={f} className="px-2 py-0.5 rounded-md bg-secondary text-xs font-medium text-secondary-foreground">{f}</span>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
              PSD and HEIC files are automatically converted to your chosen output format during optimization.
            </p>
          </div>
        </div>

        {/* Upload + Results */}
        <div className="lg:col-span-2 space-y-4">
          <DropZone
            accept="image/*,.psd,.tiff,.tif,.heic,.heif,.avif"
            onFiles={handleFiles}
            label="Drop images or PSD files here"
            sublabel="Batch upload supported • Supports almost all image formats"
          />

          <AnimatePresence>
            {files.map((f) => (
              <motion.div
                key={f.id}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="rounded-xl border border-border bg-card shadow-card overflow-hidden"
              >
                <div className="flex items-center gap-4 p-4">
                  <div className="h-16 w-16 rounded-lg bg-secondary flex items-center justify-center overflow-hidden flex-shrink-0">
                    {f.preview ? (
                      <img
                        src={f.optimized || f.preview}
                        alt={f.file.name}
                        className="h-full w-full object-cover"
                        onError={() =>
                          setFiles((prev) =>
                            prev.map((item) => (item.id === f.id ? { ...item, preview: "" } : item))
                          )
                        }
                      />
                    ) : (
                      <div className="text-[10px] font-bold text-muted-foreground uppercase">
                        {f.file.name.split('.').pop()}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-card-foreground truncate">
                      {f.file.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {f.status === "error" ? (
                        <span className="text-destructive flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          {f.errorMsg || "Error"}
                        </span>
                      ) : (
                        <>
                          Original: {formatSize(f.file.size)}
                          {f.optimizedSize != null && (
                            <>
                              {" → "}
                              <span className="text-green-500 font-medium">
                                {formatSize(f.optimizedSize)}
                              </span>
                              {" "}
                              <span className="text-green-500">
                                (−{Math.round((1 - f.optimizedSize / f.file.size) * 100)}%)
                              </span>
                            </>
                          )}
                        </>
                      )}
                    </p>
                    {f.status === "processing" && (
                      <div className="mt-2 h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                        <div className="h-full gradient-primary animate-pulse w-2/3 rounded-full" />
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {f.status === "done" && f.optimized && (
                      <Button size="icon" variant="ghost" onClick={() => downloadSingle(f)}>
                        <Download className="h-4 w-4" />
                      </Button>
                    )}
                    {f.status === "done" ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : null}
                    <Button size="icon" variant="ghost" onClick={() => removeFile(f.id)}>
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
