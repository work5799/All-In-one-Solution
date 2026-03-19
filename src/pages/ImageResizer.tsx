import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, Trash2, ArrowRight, Package, Maximize2, CheckCircle2, Loader2, Link as LinkIcon, Unlink } from "lucide-react";
import { DropZone } from "@/components/DropZone";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { useHistory } from "@/contexts/HistoryContext";
import { consumeDownloadUsage, consumeServiceUsage } from "@/lib/memberLimits";

interface ImageFile {
    id: string;
    file: File;
    preview: string;
    originalWidth: number;
    originalHeight: number;
    resized?: string;
    resizedSize?: number;
    status: "pending" | "processing" | "done" | "error";
    errorMsg?: string;
}

export default function ImageResizer() {
    const { addHistoryItem } = useHistory();
    const [files, setFiles] = useState<ImageFile[]>([]);
    const [width, setWidth] = useState<number>(1080);
    const [height, setHeight] = useState<number>(1080);
    const [aspectRatio, setAspectRatio] = useState(true);
    const [scale, setScale] = useState(100);
    const [outputFormat, setOutputFormat] = useState("webp");
    const [processing, setProcessing] = useState(false);

    const handleFiles = useCallback((newFiles: File[]) => {
        const imageFiles = newFiles.filter((f) => f.type.startsWith("image/"));
        if (imageFiles.length < newFiles.length) {
            toast.warning("Some files skipped (non-image format)");
        }

        imageFiles.forEach(file => {
            const img = new Image();
            img.onload = () => {
                const newFile: ImageFile = {
                    id: crypto.randomUUID(),
                    file: file,
                    preview: URL.createObjectURL(file),
                    originalWidth: img.naturalWidth,
                    originalHeight: img.naturalHeight,
                    status: "pending",
                };
                setFiles((prev) => [...prev, newFile]);
                // Set initial width/height from the first image dropped
                if (files.length === 0) {
                    setWidth(img.naturalWidth);
                    setHeight(img.naturalHeight);
                }
            };
            img.src = URL.createObjectURL(file);
        });
    }, [files.length]);

    const handleWidthChange = (val: number) => {
        setWidth(val);
        if (aspectRatio && files.length > 0) {
            const ratio = files[0].originalHeight / files[0].originalWidth;
            setHeight(Math.round(val * ratio));
        }
    };

    const handleHeightChange = (val: number) => {
        setHeight(val);
        if (aspectRatio && files.length > 0) {
            const ratio = files[0].originalWidth / files[0].originalHeight;
            setWidth(Math.round(val * ratio));
        }
    };

    const handleScaleChange = (val: number) => {
        setScale(val);
        if (files.length > 0) {
            setWidth(Math.round(files[0].originalWidth * (val / 100)));
            setHeight(Math.round(files[0].originalHeight * (val / 100)));
        }
    };

    const resizeImage = (img: ImageFile): Promise<ImageFile> => {
        return new Promise((resolve) => {
            const image = new Image();
            image.onload = () => {
                const canvas = document.createElement("canvas");

                let targetWidth = width;
                let targetHeight = height;

                // If batch processing multiple images with different ratios, 
                // we might want to scale each relative to its own original
                if (files.length > 1) {
                    targetWidth = Math.round(img.originalWidth * (scale / 100));
                    targetHeight = Math.round(img.originalHeight * (scale / 100));
                }

                canvas.width = targetWidth;
                canvas.height = targetHeight;
                const ctx = canvas.getContext("2d")!;
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = "high";
                ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

                const mime = outputFormat === "webp" ? "image/webp" : outputFormat === "jpeg" ? "image/jpeg" : "image/png";

                canvas.toBlob((blob) => {
                    if (blob) {
                        const url = URL.createObjectURL(blob);
                        resolve({
                            ...img,
                            resized: url,
                            resizedSize: blob.size,
                            status: "done"
                        });
                    } else {
                        resolve({ ...img, status: "error", errorMsg: "Resize failed" });
                    }
                }, mime, 0.9);
            };
            image.onerror = () => resolve({ ...img, status: "error", errorMsg: "Failed to load image" });
            image.src = img.preview;
        });
    };

    const handleResizeAll = async () => {
        if (!files.length) return;
        const usage = consumeServiceUsage("image-resizer");
        if (!usage.ok) {
            toast.error(`Image Resizer limit reached (${usage.used}/${usage.limit})`);
            return;
        }
        setProcessing(true);

        setFiles(prev => prev.map(f => f.status === "done" ? f : { ...f, status: "processing" }));

        const updatedFiles = [...files];
        for (let i = 0; i < updatedFiles.length; i++) {
            if (updatedFiles[i].status === "done") continue;

            const result = await resizeImage(updatedFiles[i]);
            updatedFiles[i] = result;
            setFiles([...updatedFiles]);

            if (result.status === "done") {
                addHistoryItem({
                    name: result.file.name,
                    type: "image",
                    action: `Resized to ${width}x${height}`,
                    originalSize: result.file.size,
                    optimizedSize: result.resizedSize || 0,
                    saved: "—",
                    url: result.resized,
                });
            }
        }

        setProcessing(false);
        toast.success("All images resized successfully!");
    };

    const downloadAll = async () => {
        const done = files.filter((f) => f.resized);
        if (!done.length) return;
        const download = consumeDownloadUsage();
        if (!download.ok) {
            toast.error(`Download limit reached (${download.used}/${download.limit})`);
            return;
        }
        const zip = new JSZip();
        for (const f of done) {
            const resp = await fetch(f.resized!);
            const blob = await resp.blob();
            const ext = outputFormat === "jpeg" ? "jpg" : outputFormat;
            zip.file(`resized_${f.file.name.replace(/\.\w+$/, `.${ext}`)}`, blob);
        }
        const content = await zip.generateAsync({ type: "blob" });
        saveAs(content, "resized-images.zip");
    };

    const downloadSingle = (file: ImageFile) => {
        if (!file.resized) return;
        const download = consumeDownloadUsage();
        if (!download.ok) {
            toast.error(`Download limit reached (${download.used}/${download.limit})`);
            return;
        }
        const a = document.createElement("a");
        a.href = file.resized;
        const ext = outputFormat === "jpeg" ? "jpg" : outputFormat;
        a.download = `resized_${file.file.name.replace(/\.\w+$/, `.${ext}`)}`;
        a.click();
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-foreground">Image Resizer</h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Resize multiple images at once with precision
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="space-y-5 lg:col-span-1">
                    <div className="rounded-xl border border-border bg-card p-5 shadow-card space-y-5">
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <label className="text-sm font-medium text-card-foreground">Dimensions</label>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 text-xs gap-1.5"
                                    onClick={() => setAspectRatio(!aspectRatio)}
                                >
                                    {aspectRatio ? <LinkIcon className="h-3 w-3" /> : <Unlink className="h-3 w-3" />}
                                    {aspectRatio ? "Locked" : "Unlocked"}
                                </Button>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <span className="text-[10px] uppercase text-muted-foreground font-semibold">Width (px)</span>
                                    <input
                                        type="number"
                                        value={width}
                                        onChange={(e) => handleWidthChange(parseInt(e.target.value) || 0)}
                                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <span className="text-[10px] uppercase text-muted-foreground font-semibold">Height (px)</span>
                                    <input
                                        type="number"
                                        value={height}
                                        onChange={(e) => handleHeightChange(parseInt(e.target.value) || 0)}
                                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <label className="text-sm font-medium text-card-foreground">Scale</label>
                                <span className="text-xs font-mono text-primary">{scale}%</span>
                            </div>
                            <Slider
                                value={[scale]}
                                onValueChange={([v]) => handleScaleChange(v)}
                                min={1}
                                max={200}
                                step={1}
                            />
                        </div>

                        <div>
                            <label className="text-sm font-medium text-card-foreground">Output Format</label>
                            <Select value={outputFormat} onValueChange={setOutputFormat}>
                                <SelectTrigger className="mt-1.5">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="webp">WebP</SelectItem>
                                    <SelectItem value="jpeg">JPEG</SelectItem>
                                    <SelectItem value="png">PNG</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <Button
                            onClick={handleResizeAll}
                            disabled={!files.length || processing}
                            className="w-full gradient-primary text-primary-foreground border-0"
                        >
                            {processing ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Resizing...
                                </>
                            ) : (
                                <>
                                    Resize All
                                    <ArrowRight className="ml-2 h-4 w-4" />
                                </>
                            )}
                        </Button>

                        {files.filter(f => f.status === "done").length > 1 && (
                            <Button variant="outline" onClick={downloadAll} className="w-full">
                                <Package className="mr-2 h-4 w-4" />
                                Download ZIP
                            </Button>
                        )}
                    </div>
                </div>

                <div className="lg:col-span-2 space-y-4">
                    <DropZone
                        accept="image/*"
                        onFiles={handleFiles}
                        label="Drop images here to resize"
                        sublabel="JPG, PNG, WebP supported • Batch resizing"
                    />

                    <AnimatePresence>
                        <div className="space-y-3">
                            {files.map((f) => (
                                <motion.div
                                    key={f.id}
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    className="rounded-xl border border-border bg-card shadow-card overflow-hidden"
                                >
                                    <div className="flex items-center gap-4 p-4">
                                        <img
                                            src={f.resized || f.preview}
                                            alt={f.file.name}
                                            className="h-14 w-14 rounded-lg object-cover flex-shrink-0 bg-secondary"
                                        />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-card-foreground truncate">{f.file.name}</p>
                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                {f.originalWidth}x{f.originalHeight}
                                                {f.status === "done" && (
                                                    <>
                                                        {" → "}
                                                        <span className="text-primary font-semibold">
                                                            {files.length > 1 ? Math.round(f.originalWidth * (scale / 100)) : width}x{files.length > 1 ? Math.round(f.originalHeight * (scale / 100)) : height}
                                                        </span>
                                                    </>
                                                )}
                                            </p>
                                            {f.status === "processing" && (
                                                <div className="mt-2 h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                                                    <div className="h-full gradient-primary animate-progress rounded-full" />
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {f.status === "done" && f.resized && (
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    onClick={() => downloadSingle(f)}
                                                >
                                                    <Download className="h-4 w-4" />
                                                </Button>
                                            )}
                                            {f.status === "done" ? (
                                                <CheckCircle2 className="h-5 w-5 text-green-500" />
                                            ) : f.status === "error" ? (
                                                <span className="text-xs text-destructive">{f.errorMsg}</span>
                                            ) : null}
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                onClick={() => setFiles(prev => prev.filter(x => x.id !== f.id))}
                                            >
                                                <Trash2 className="h-4 w-4 text-destructive" />
                                            </Button>
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
}
