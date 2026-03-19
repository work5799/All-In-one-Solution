import { useState, useRef, useCallback } from "react";
import { DropZone } from "@/components/DropZone";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    Stamp,
    Download,
    Trash2,
    ArrowRight,
    ImageIcon,
    Video,
    Type,
    CheckCircle2,
    Loader2,
    AlertCircle,
    Upload,
    LayoutGrid,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { useHistory } from "@/contexts/HistoryContext";
import { consumeDownloadUsage, consumeServiceUsage } from "@/lib/memberLimits";

type MediaType = "image" | "video";
type WatermarkType = "text" | "image";
type Position =
    | "top-left" | "top-center" | "top-right"
    | "center"
    | "bottom-left" | "bottom-center" | "bottom-right"
    | "full-image";

interface MediaFile {
    id: string;
    file: File;
    mediaType: MediaType;
    preview?: string;
    status: "pending" | "processing" | "done" | "error";
    outputUrl?: string;
    outputSize?: number;
    errorMsg?: string;
    progress?: number;
}

const formatSize = (bytes: number) => {
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1048576).toFixed(2) + " MB";
};

const POSITIONS: { label: string; value: Position }[] = [
    { label: "Top Left", value: "top-left" },
    { label: "Top Center", value: "top-center" },
    { label: "Top Right", value: "top-right" },
    { label: "Center", value: "center" },
    { label: "Bottom Left", value: "bottom-left" },
    { label: "Bottom Center", value: "bottom-center" },
    { label: "Bottom Right", value: "bottom-right" },
    { label: "Full Image (Tiled)", value: "full-image" },
];

// Build canvas overlay position for images
function getCanvasPosition(
    pos: Position,
    canvasW: number,
    canvasH: number,
    wmW: number,
    wmH: number,
    margin = 20
): { x: number; y: number } {
    const map: Record<Position, { x: number; y: number }> = {
        "top-left": { x: margin, y: margin },
        "top-center": { x: (canvasW - wmW) / 2, y: margin },
        "top-right": { x: canvasW - wmW - margin, y: margin },
        "center": { x: (canvasW - wmW) / 2, y: (canvasH - wmH) / 2 },
        "bottom-left": { x: margin, y: canvasH - wmH - margin },
        "bottom-center": { x: (canvasW - wmW) / 2, y: canvasH - wmH - margin },
        "bottom-right": { x: canvasW - wmW - margin, y: canvasH - wmH - margin },
        "full-image": { x: 0, y: 0 },
    };
    return map[pos];
}

// Build FFmpeg overlay filter expression
function getFFmpegOverlayExpr(pos: Position, margin = 20): string {
    const map: Record<Position, string> = {
        "top-left": `${margin}:${margin}`,
        "top-center": `(W-w)/2:${margin}`,
        "top-right": `W-w-${margin}:${margin}`,
        "center": `(W-w)/2:(H-h)/2`,
        "bottom-left": `${margin}:H-h-${margin}`,
        "bottom-center": `(W-w)/2:H-h-${margin}`,
        "bottom-right": `W-w-${margin}:H-h-${margin}`,
        "full-image": `0:0`,
    };
    return map[pos];
}

// Build FFmpeg drawtext position
function getFFmpegDrawtextPos(pos: Position, margin = 20): { x: string; y: string } {
    const map: Record<Position, { x: string; y: string }> = {
        "top-left": { x: `${margin}`, y: `${margin}` },
        "top-center": { x: "(w-tw)/2", y: `${margin}` },
        "top-right": { x: `w-tw-${margin}`, y: `${margin}` },
        "center": { x: "(w-tw)/2", y: "(h-th)/2" },
        "bottom-left": { x: `${margin}`, y: `h-th-${margin}` },
        "bottom-center": { x: "(w-tw)/2", y: `h-th-${margin}` },
        "bottom-right": { x: `w-tw-${margin}`, y: `h-th-${margin}` },
        "full-image": { x: "0", y: "0" },
    };
    return map[pos];
}

const FFMPEG_CORE_MT = "https://unpkg.com/@ffmpeg/core-mt@0.12.6/dist/esm";
const FFMPEG_CORE_ST = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";

export default function WatermarkPage() {
    const { addHistoryItem } = useHistory();

    // Media files
    const [files, setFiles] = useState<MediaFile[]>([]);

    // Watermark settings
    const [wmType, setWmType] = useState<WatermarkType>("text");
    const [wmText, setWmText] = useState("© Your Brand");
    const [wmFontSize, setWmFontSize] = useState(36);
    const [wmOpacity, setWmOpacity] = useState(70);
    const [wmColor, setWmColor] = useState("#ffffff");
    const [wmPosition, setWmPosition] = useState<Position>("bottom-right");
    const [wmImageFile, setWmImageFile] = useState<File | null>(null);
    const [wmImagePreview, setWmImagePreview] = useState<string | null>(null);
    const [wmImageSize, setWmImageSize] = useState(20); // % of video/image width
    const [outputFormat, setOutputFormat] = useState("mp4"); // for video output

    const [processing, setProcessing] = useState(false);
    const ffmpegRef = useRef<FFmpeg | null>(null);
    const wmImageInputRef = useRef<HTMLInputElement>(null);

    const updateFile = (id: string, patch: Partial<MediaFile>) =>
        setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));

    // Handle wm image logo upload
    const handleWmImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith("image/")) {
            toast.error("Please select an image file for the watermark logo");
            return;
        }
        setWmImageFile(file);
        setWmImagePreview(URL.createObjectURL(file));
    };

    // Handle media file drop
    const handleFiles = useCallback((newFiles: File[]) => {
        const allowed = newFiles.filter((f) =>
            f.type.startsWith("image/") || f.type.startsWith("video/")
            || /\.(mp4|mov|webm|avi|mkv|jpg|jpeg|png|webp|gif)$/i.test(f.name)
        );
        if (!allowed.length) {
            toast.error("Please upload image or video files");
            return;
        }
        setFiles((prev) => [
            ...prev,
            ...allowed.map((f) => ({
                id: crypto.randomUUID(),
                file: f,
                mediaType: (f.type.startsWith("video/") || /\.(mp4|mov|webm|avi|mkv)$/i.test(f.name)
                    ? "video"
                    : "image") as MediaType,
                preview: f.type.startsWith("image/") ? URL.createObjectURL(f) : undefined,
                status: "pending" as const,
            })),
        ]);
    }, []);

    // ----- Image watermark via Canvas -----
    const applyImageWatermark = async (fileObj: MediaFile): Promise<MediaFile> => {
        return new Promise(async (resolve) => {
            const img = new Image();
            img.onload = async () => {
                const canvas = document.createElement("canvas");
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                const ctx = canvas.getContext("2d")!;
                ctx.drawImage(img, 0, 0);

                const alpha = wmOpacity / 100;

                // Helper: draw tiled pattern across the canvas at -30° angle
                const drawTiled = (drawFn: (ctx: CanvasRenderingContext2D, x: number, y: number) => void, itemW: number, itemH: number) => {
                    const spacingX = itemW + Math.max(40, itemW * 0.6);
                    const spacingY = itemH * 3;
                    const angle = -Math.PI / 6;
                    ctx.save();
                    ctx.translate(canvas.width / 2, canvas.height / 2);
                    ctx.rotate(angle);
                    const diagonal = Math.sqrt(canvas.width * canvas.width + canvas.height * canvas.height);
                    const cols = Math.ceil(diagonal / spacingX) + 2;
                    const rows = Math.ceil(diagonal / spacingY) + 2;
                    for (let row = -rows; row <= rows; row++) {
                        for (let col = -cols; col <= cols; col++) {
                            drawFn(ctx, col * spacingX - itemW / 2, row * spacingY);
                        }
                    }
                    ctx.restore();
                };

                const finalize = () => {
                    ctx.globalAlpha = 1;
                    canvas.toBlob((blob) => {
                        if (!blob) { resolve({ ...fileObj, status: "error", errorMsg: "Canvas to blob failed" }); return; }
                        const url = URL.createObjectURL(blob);
                        resolve({ ...fileObj, status: "done", outputUrl: url, outputSize: blob.size });
                    }, "image/png");
                };

                if (wmType === "text") {
                    ctx.globalAlpha = alpha;
                    ctx.font = `bold ${wmFontSize}px sans-serif`;
                    ctx.fillStyle = wmColor;
                    ctx.shadowColor = "rgba(0,0,0,0.5)";
                    ctx.shadowBlur = 4;
                    const metrics = ctx.measureText(wmText);
                    const textW = metrics.width;
                    const textH = wmFontSize;

                    if (wmPosition === "full-image") {
                        drawTiled((c, x, y) => c.fillText(wmText, x, y + textH), textW, textH);
                    } else {
                        const pos = getCanvasPosition(wmPosition, canvas.width, canvas.height, textW, textH);
                        ctx.fillText(wmText, pos.x, pos.y + textH);
                    }
                    finalize();
                } else {
                    // Image watermark
                    if (!wmImageFile) {
                        resolve({ ...fileObj, status: "error", errorMsg: "No watermark image selected" });
                        return;
                    }
                    const wmImg = new Image();
                    wmImg.onload = () => {
                        const wmW = Math.round(canvas.width * (wmImageSize / 100));
                        const wmH = Math.round((wmImg.naturalHeight / wmImg.naturalWidth) * wmW);
                        ctx.globalAlpha = alpha;

                        if (wmPosition === "full-image") {
                            drawTiled((c, x, y) => c.drawImage(wmImg, x, y, wmW, wmH), wmW, wmH);
                        } else {
                            const pos = getCanvasPosition(wmPosition, canvas.width, canvas.height, wmW, wmH);
                            ctx.drawImage(wmImg, pos.x, pos.y, wmW, wmH);
                        }
                        finalize();
                    };
                    wmImg.onerror = () => resolve({ ...fileObj, status: "error", errorMsg: "Failed to load watermark image" });
                    wmImg.src = URL.createObjectURL(wmImageFile);
                }
            };
            img.onerror = () => resolve({ ...fileObj, status: "error", errorMsg: "Failed to load image" });
            img.src = fileObj.preview || URL.createObjectURL(fileObj.file);
        });
    };

    // ----- Video watermark via FFmpeg -----
    const loadFFmpeg = async (): Promise<FFmpeg> => {
        if (ffmpegRef.current) return ffmpegRef.current;
        const ff = new FFmpeg();
        try {
            await ff.load({
                coreURL: await toBlobURL(`${FFMPEG_CORE_MT}/ffmpeg-core.js`, "text/javascript"),
                wasmURL: await toBlobURL(`${FFMPEG_CORE_MT}/ffmpeg-core.wasm`, "application/wasm"),
                workerURL: await toBlobURL(`${FFMPEG_CORE_MT}/ffmpeg-core.worker.js`, "text/javascript"),
            });
        } catch {
            await ff.load({
                coreURL: await toBlobURL(`${FFMPEG_CORE_ST}/ffmpeg-core.js`, "text/javascript"),
                wasmURL: await toBlobURL(`${FFMPEG_CORE_ST}/ffmpeg-core.wasm`, "application/wasm"),
            });
        }
        ffmpegRef.current = ff;
        return ff;
    };

    const applyVideoWatermark = async (fileObj: MediaFile, ff: FFmpeg): Promise<MediaFile> => {
        const ext = fileObj.file.name.split(".").pop() || "mp4";
        const inputName = `wm_in_${fileObj.id}.${ext}`;
        const outputName = `wm_out_${fileObj.id}.${outputFormat}`;

        await ff.writeFile(inputName, await fetchFile(fileObj.file));

        const alphaHex = Math.round(wmOpacity / 100 * 255).toString(16).padStart(2, "0");
        const colorWithAlpha = wmColor.replace("#", "") + alphaHex;
        const overlayPos = getFFmpegOverlayExpr(wmPosition);

        let filterComplex: string;
        let args: string[];

        // Helper: build a 4096×4096 tiled PNG blob for full-image mode
        const buildFullImageTileBlob = (): Promise<Blob> => new Promise(async (resBlob, rejBlob) => {
            const SIZE = 4096;
            const tc = document.createElement("canvas");
            tc.width = SIZE; tc.height = SIZE;
            const tcx = tc.getContext("2d")!;
            const alpha = wmOpacity / 100;

            const tile = (drawFn: (c: CanvasRenderingContext2D, x: number, y: number) => void, iW: number, iH: number) => {
                const spX = iW + Math.max(40, iW * 0.6);
                const spY = iH * 3;
                const diag = Math.sqrt(SIZE * SIZE * 2);
                tcx.save();
                tcx.translate(SIZE / 2, SIZE / 2);
                tcx.rotate(-Math.PI / 6);
                const cols = Math.ceil(diag / spX) + 2;
                const rows = Math.ceil(diag / spY) + 2;
                for (let r = -rows; r <= rows; r++)
                    for (let c = -cols; c <= cols; c++)
                        drawFn(tcx, c * spX - iW / 2, r * spY);
                tcx.restore();
            };

            if (wmType === "text") {
                tcx.globalAlpha = alpha;
                tcx.font = `bold ${wmFontSize}px sans-serif`;
                tcx.fillStyle = wmColor;
                tcx.shadowColor = "rgba(0,0,0,0.5)";
                tcx.shadowBlur = 4;
                const tw = tcx.measureText(wmText).width;
                const th = wmFontSize;
                tile((c, x, y) => c.fillText(wmText, x, y + th), tw, th);
                tc.toBlob((b) => b ? resBlob(b) : rejBlob(new Error("toBlob failed")), "image/png");
            } else {
                if (!wmImageFile) { rejBlob(new Error("No watermark image")); return; }
                const wImg = new Image();
                wImg.onload = () => {
                    const wmW = Math.round(SIZE * (wmImageSize / 100));
                    const wmH = Math.round((wImg.naturalHeight / wImg.naturalWidth) * wmW);
                    tcx.globalAlpha = alpha;
                    tile((c, x, y) => c.drawImage(wImg, x, y, wmW, wmH), wmW, wmH);
                    tc.toBlob((b) => b ? resBlob(b) : rejBlob(new Error("toBlob failed")), "image/png");
                };
                wImg.onerror = () => rejBlob(new Error("Failed to load watermark image"));
                wImg.src = URL.createObjectURL(wmImageFile);
            }
        });

        if (wmPosition === "full-image") {
            // Create tiled overlay PNG and use it as full-frame overlay
            const tileBlob = await buildFullImageTileBlob();
            const tileName = `wm_tile_${fileObj.id}.png`;
            await ff.writeFile(tileName, new Uint8Array(await tileBlob.arrayBuffer()));

            // overlay=0:0 — the 4096×4096 PNG covers any video size; alpha is baked in
            filterComplex = `[0:v][1:v]overlay=0:0:format=auto`;
            args = [
                "-i", inputName,
                "-i", tileName,
                "-filter_complex", filterComplex,
                "-c:v", "libx264", "-crf", "23", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
                "-c:a", "copy",
                "-y", outputName,
            ];
        } else if (wmType === "text") {
            const drawtextPos = getFFmpegDrawtextPos(wmPosition);
            const escapedText = wmText.replace(/:/g, "\\:").replace(/'/g, "\\'");
            filterComplex = `drawtext=text='${escapedText}':fontsize=${wmFontSize}:fontcolor=0x${colorWithAlpha}:x=${drawtextPos.x}:y=${drawtextPos.y}:shadowcolor=black:shadowx=2:shadowy=2`;
            args = [
                "-i", inputName,
                "-vf", filterComplex,
                "-c:v", "libx264", "-crf", "23", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
                "-c:a", "copy",
                "-y", outputName,
            ];
        } else {
            if (!wmImageFile) throw new Error("No watermark image selected");
            const wmExt = wmImageFile.name.split(".").pop() || "png";
            const wmName = `wm_logo_${fileObj.id}.${wmExt}`;
            await ff.writeFile(wmName, await fetchFile(wmImageFile));

            filterComplex = `[1:v]scale=iw*${wmImageSize / 100}:-1,format=rgba,colorchannelmixer=aa=${wmOpacity / 100}[wm];[0:v][wm]overlay=${overlayPos}`;
            args = [
                "-i", inputName,
                "-i", wmName,
                "-filter_complex", filterComplex,
                "-c:v", "libx264", "-crf", "23", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
                "-c:a", "copy",
                "-y", outputName,
            ];
        }

        ff.on("progress", ({ progress }) => {
            updateFile(fileObj.id, { progress: Math.min(99, Math.round(progress * 100)) });
        });

        await ff.exec(args);

        const data = await ff.readFile(outputName);
        const blob = new Blob([data as any], {
            type: outputFormat === "webm" ? "video/webm" : "video/mp4",
        });
        const url = URL.createObjectURL(blob);

        try { await ff.deleteFile(inputName); } catch { /* ignore */ }
        try { await ff.deleteFile(outputName); } catch { /* ignore */ }

        return { ...fileObj, status: "done", outputUrl: url, outputSize: blob.size, progress: 100 };
    };

    const handleApply = async () => {
        const pending = files.filter((f) => f.status === "pending");
        if (!pending.length) { toast.warning("No pending files"); return; }
        if (wmType === "text" && !wmText.trim()) { toast.error("Please enter watermark text"); return; }
        if (wmType === "image" && !wmImageFile) { toast.error("Please select a watermark logo image"); return; }
        const usage = consumeServiceUsage("watermark");
        if (!usage.ok) {
            toast.error(`Watermark limit reached (${usage.used}/${usage.limit})`);
            return;
        }

        setProcessing(true);
        pending.forEach((f) => updateFile(f.id, { status: "processing", progress: 0 }));

        const hasVideos = pending.some((f) => f.mediaType === "video");
        let ff: FFmpeg | null = null;
        if (hasVideos) {
            try {
                toast.info("Loading video engine… (may take 30-60 seconds on first use)");
                ff = await loadFFmpeg();
            } catch {
                toast.error("Failed to load video engine. Videos will be skipped.");
            }
        }

        for (const fileObj of pending) {
            try {
                let result: MediaFile;
                if (fileObj.mediaType === "image") {
                    result = await applyImageWatermark(fileObj);
                } else {
                    if (!ff) {
                        result = { ...fileObj, status: "error", errorMsg: "Video engine unavailable" };
                    } else {
                        result = await applyVideoWatermark(fileObj, ff);
                    }
                }
                setFiles((prev) => prev.map((f) => (f.id === fileObj.id ? result : f)));
                if (result.status === "done" && result.outputSize) {
                    addHistoryItem({
                        name: fileObj.file.name,
                        type: fileObj.mediaType,
                        action: `Watermarked (${wmType === "text" ? wmText : "logo"})`,
                        originalSize: fileObj.file.size,
                        optimizedSize: result.outputSize,
                        saved: "—",
                        url: result.outputUrl,
                    });
                }
            } catch (err: any) {
                setFiles((prev) =>
                    prev.map((f) =>
                        f.id === fileObj.id ? { ...f, status: "error", errorMsg: String(err?.message || err) } : f
                    )
                );
                toast.error(`Failed: ${fileObj.file.name}`);
            }
        }

        setProcessing(false);
        toast.success("Watermark applied!");
    };

    const downloadWatermarkedFile = (fileObj: MediaFile) => {
        if (!fileObj.outputUrl) return;
        const download = consumeDownloadUsage();
        if (!download.ok) {
            toast.error(`Download limit reached (${download.used}/${download.limit})`);
            return;
        }
        const a = document.createElement("a");
        a.href = fileObj.outputUrl;
        const base = fileObj.file.name.replace(/\.\w+$/, "");
        const ext = fileObj.mediaType === "video" ? outputFormat : "png";
        a.download = `watermarked_${base}.${ext}`;
        a.click();
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-foreground">Watermark</h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Add text or logo watermarks to images and videos
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Settings Panel */}
                <div className="space-y-4 lg:col-span-1">
                    {/* Watermark Type */}
                    <div className="rounded-xl border border-border bg-card p-5 shadow-card space-y-4">
                        <h2 className="text-sm font-semibold text-card-foreground uppercase tracking-wider">Watermark Type</h2>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setWmType("text")}
                                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium border transition-all ${wmType === "text"
                                    ? "border-primary bg-primary/10 text-primary"
                                    : "border-border bg-secondary text-secondary-foreground hover:bg-secondary/80"
                                    }`}
                            >
                                <Type className="h-4 w-4" /> Text
                            </button>
                            <button
                                onClick={() => setWmType("image")}
                                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium border transition-all ${wmType === "image"
                                    ? "border-primary bg-primary/10 text-primary"
                                    : "border-border bg-secondary text-secondary-foreground hover:bg-secondary/80"
                                    }`}
                            >
                                <ImageIcon className="h-4 w-4" /> Logo / Image
                            </button>
                        </div>

                        {wmType === "text" ? (
                            <>
                                <div>
                                    <label className="text-sm font-medium text-card-foreground">Watermark Text</label>
                                    <input
                                        value={wmText}
                                        onChange={(e) => setWmText(e.target.value)}
                                        placeholder="© Your Brand"
                                        className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                                    />
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-card-foreground">Font Size: {wmFontSize}px</label>
                                    <Slider value={[wmFontSize]} onValueChange={([v]) => setWmFontSize(v)} min={12} max={120} step={2} className="mt-2" />
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-card-foreground">Text Color</label>
                                    <div className="mt-1.5 flex items-center gap-3">
                                        <input
                                            type="color"
                                            value={wmColor}
                                            onChange={(e) => setWmColor(e.target.value)}
                                            className="h-9 w-14 rounded-md border border-border cursor-pointer bg-transparent"
                                        />
                                        <span className="text-sm text-muted-foreground font-mono">{wmColor}</span>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <>
                                <div>
                                    <label className="text-sm font-medium text-card-foreground">Logo Image</label>
                                    <input
                                        ref={wmImageInputRef}
                                        type="file"
                                        accept="image/*"
                                        onChange={handleWmImageUpload}
                                        className="hidden"
                                    />
                                    <button
                                        onClick={() => wmImageInputRef.current?.click()}
                                        className="mt-1.5 w-full flex items-center gap-2 justify-center py-2.5 rounded-lg border border-dashed border-border bg-secondary text-sm text-muted-foreground hover:bg-secondary/80 transition-colors"
                                    >
                                        <Upload className="h-4 w-4" />
                                        {wmImageFile ? wmImageFile.name : "Click to upload logo"}
                                    </button>
                                    {wmImagePreview && (
                                        <img src={wmImagePreview} alt="Logo preview" className="mt-2 h-16 object-contain rounded-lg border border-border" />
                                    )}
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-card-foreground">Logo Size: {wmImageSize}% of media width</label>
                                    <Slider value={[wmImageSize]} onValueChange={([v]) => setWmImageSize(v)} min={5} max={60} step={1} className="mt-2" />
                                </div>
                            </>
                        )}

                        <div>
                            <label className="text-sm font-medium text-card-foreground">Opacity: {wmOpacity}%</label>
                            <Slider value={[wmOpacity]} onValueChange={([v]) => setWmOpacity(v)} min={10} max={100} step={5} className="mt-2" />
                        </div>

                        <div>
                            <label className="text-sm font-medium text-card-foreground">Position</label>
                            <Select value={wmPosition} onValueChange={(v) => setWmPosition(v as Position)}>
                                <SelectTrigger className="mt-1.5">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {POSITIONS.map((p) => (
                                        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Only show video output format if there are videos */}
                        {files.some((f) => f.mediaType === "video") && (
                            <div>
                                <label className="text-sm font-medium text-card-foreground">Video Output Format</label>
                                <Select value={outputFormat} onValueChange={setOutputFormat}>
                                    <SelectTrigger className="mt-1.5">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="mp4">MP4</SelectItem>
                                        <SelectItem value="webm">WebM</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        <Button
                            onClick={handleApply}
                            disabled={!files.filter((f) => f.status === "pending").length || processing}
                            className="w-full gradient-primary text-primary-foreground border-0"
                        >
                            {processing ? (
                                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Applying…</>
                            ) : (
                                <><Stamp className="mr-2 h-4 w-4" /> Apply Watermark</>
                            )}
                        </Button>
                    </div>

                    {/* Position Visualizer */}
                    <div className="rounded-xl border border-border bg-card p-4 shadow-card">
                        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Position Preview</h3>
                        <div className="relative w-full aspect-video bg-secondary rounded-lg overflow-hidden border border-border mb-2">
                            {/* Full Image tiled pattern overlay */}
                            {wmPosition === "full-image" && (
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                    <svg className="absolute inset-0 w-full h-full opacity-25" xmlns="http://www.w3.org/2000/svg">
                                        <defs>
                                            <pattern id="wm-pattern" x="0" y="0" width="70" height="45" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)">
                                                <text x="4" y="16" fontSize="9" fill="hsl(var(--primary))" fontWeight="bold" fontFamily="sans-serif">© WATERMARK</text>
                                            </pattern>
                                        </defs>
                                        <rect width="100%" height="100%" fill="url(#wm-pattern)" />
                                    </svg>
                                    <span className="relative z-10 text-[10px] font-bold text-primary bg-primary/15 border border-primary/30 px-2 py-0.5 rounded">
                                        FULL IMAGE
                                    </span>
                                </div>
                            )}
                            {/* Regular 7-position dots */}
                            {POSITIONS.filter((p) => p.value !== "full-image").map((p) => {
                                const isSelected = wmPosition === p.value;
                                const classes: Record<string, string> = {
                                    "top-left": "top-2 left-2",
                                    "top-center": "top-2 left-1/2 -translate-x-1/2",
                                    "top-right": "top-2 right-2",
                                    "center": "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
                                    "bottom-left": "bottom-2 left-2",
                                    "bottom-center": "bottom-2 left-1/2 -translate-x-1/2",
                                    "bottom-right": "bottom-2 right-2",
                                };
                                return (
                                    <button
                                        key={p.value}
                                        onClick={() => setWmPosition(p.value)}
                                        title={p.label}
                                        className={`absolute w-5 h-5 rounded flex items-center justify-center transition-all ${classes[p.value]} ${isSelected ? "bg-primary text-primary-foreground scale-125 shadow-lg" : "bg-border text-muted-foreground hover:bg-primary/30"
                                            }`}
                                    >
                                        {isSelected ? <Stamp className="h-3 w-3" /> : <span className="text-[8px]">•</span>}
                                    </button>
                                );
                            })}
                        </div>
                        {/* Full Image (Tiled) button */}
                        <button
                            onClick={() => setWmPosition("full-image")}
                            className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold border transition-all ${
                                wmPosition === "full-image"
                                    ? "border-primary bg-primary/10 text-primary shadow-sm"
                                    : "border-border bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
                            }`}
                        >
                            <LayoutGrid className="h-3.5 w-3.5" />
                            Full Image (Tiled Watermark)
                        </button>
                    </div>
                </div>

                {/* Upload + Results */}
                <div className="lg:col-span-2 space-y-4">
                    <DropZone
                        accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm,.jpg,.jpeg,.png,.webp,.mp4,.mov,.webm,.avi"
                        onFiles={handleFiles}
                        label="Drop images or videos here"
                        sublabel="JPG, PNG, WebP images • MP4, MOV, WebM videos"
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
                                    <div className="flex-shrink-0">
                                        {f.mediaType === "image" && (f.outputUrl || f.preview) ? (
                                            <img
                                                src={f.outputUrl || f.preview}
                                                alt={f.file.name}
                                                className="h-14 w-14 rounded-lg object-cover border border-border"
                                            />
                                        ) : (
                                            <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-primary/10">
                                                {f.mediaType === "video" ? (
                                                    <Video className="h-6 w-6 text-primary" />
                                                ) : (
                                                    <ImageIcon className="h-6 w-6 text-primary" />
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <p className="text-sm font-medium text-card-foreground truncate">{f.file.name}</p>
                                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${f.mediaType === "video" ? "bg-blue-500/20 text-blue-400" : "bg-purple-500/20 text-purple-400"
                                                }`}>
                                                {f.mediaType}
                                            </span>
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            {f.status === "done" && f.outputSize ? (
                                                <span>
                                                    {formatSize(f.file.size)} → <span className="text-green-500 font-medium">{formatSize(f.outputSize)}</span>
                                                    {" "}✓ Watermarked
                                                </span>
                                            ) : f.status === "error" ? (
                                                <span className="text-destructive">{f.errorMsg || "Processing failed"}</span>
                                            ) : (
                                                formatSize(f.file.size)
                                            )}
                                        </p>
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

                                    <div className="flex items-center gap-1.5">
                                        {f.status === "done" ? (
                                            <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />
                                        ) : f.status === "processing" ? (
                                            <Loader2 className="h-5 w-5 text-primary animate-spin flex-shrink-0" />
                                        ) : f.status === "error" ? (
                                            <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0" />
                                        ) : null}
                                        {f.status === "done" && f.outputUrl && (
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                onClick={() => downloadWatermarkedFile(f)}
                                            >
                                                <Download className="h-4 w-4" />
                                            </Button>
                                        )}
                                        {f.status === "error" && (
                                            <Button
                                                size="icon"
                                                variant="ghost"
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

                    {files.length === 0 && (
                        <div className="rounded-xl border border-border bg-card p-8 text-center">
                            <Stamp className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
                            <p className="text-sm text-muted-foreground">Upload images or videos to add watermarks</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
