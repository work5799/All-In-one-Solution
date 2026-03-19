import { useState, useRef, useEffect } from "react";
import { DropZone } from "@/components/DropZone";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import {
    Eraser, Download, RotateCcw, Loader2, CheckCircle2,
    MousePointer2, ArrowRight, Eye, EyeOff, Upload, Wand2,
    ZoomIn, ZoomOut, Maximize2, Image as ImageIcon, AlertCircle,
    FileImage, Settings2, X
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useHistory } from "@/contexts/HistoryContext";
import { saveAs } from "file-saver";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { consumeDownloadUsage, consumeServiceUsage } from "@/lib/memberLimits";

interface Rect { x: number; y: number; w: number; h: number; }
type Mode = "manual" | "auto";
type ExportFormat = "png" | "jpg" | "webp";

// ─────────────────────────────────────────────────────────────────────────────
// WATERMARK REMOVAL - Improved Implementation
// Uses Telea inpainting algorithm with better quality
// ─────────────────────────────────────────────────────────────────────────────

// Telea inpainting algorithm (Fast Marching Method)
function inpaintImage(
    data: Uint8ClampedArray,
    width: number,
    height: number,
    mask: Uint8Array,
): Uint8ClampedArray {
    // Create a copy to work with
    const result = new Uint8ClampedArray(data);
    const inpaintMask = new Uint8Array(mask);

    // Priority queue for the fast marching method
    // Each element: { index, priority }
    const priorityQueue: { index: number; priority: number }[] = [];

    // Find the boundary (points in mask that have at least one neighbor not in mask)
    const boundary: number[] = [];
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            if (inpaintMask[idx] === 1) {
                // Check if this pixel has at least one neighbor not in mask
                let isBoundary = false;
                for (let dy = -1; dy <= 1 && !isBoundary; dy++) {
                    for (let dx = -1; dx <= 1 && !isBoundary; dx++) {
                        if (dx === 0 && dy === 0) continue;
                        const nx = x + dx;
                        const ny = y + dy;
                        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                            const nidx = ny * width + nx;
                            if (inpaintMask[nidx] === 0) {
                                isBoundary = true;
                            }
                        }
                    }
                }
                if (isBoundary) {
                    boundary.push(idx);
                }
            }
        }
    }

    // Initialize priority queue with boundary points
    for (const idx of boundary) {
        // Calculate priority based on gradient (isophotes)
        const priority = calculatePriority(idx, width, height, data, inpaintMask);
        priorityQueue.push({ index: idx, priority });
    }

    // Sort by priority (lower priority first)
    priorityQueue.sort((a, b) => a.priority - b.priority);

    // Process points in priority order
    while (priorityQueue.length > 0) {
        // Get the point with highest priority (lowest priority value)
        const { index } = priorityQueue.shift()!;

        // Skip if already processed
        if (inpaintMask[index] === 0) continue;

        // Find the best source point from the neighborhood
        const { sourceIndex, confidence } = findBestSource(index, width, height, data, inpaintMask);

        if (sourceIndex !== -1) {
            // Copy color from source to target
            const targetIdx4 = index * 4;
            const sourceIdx4 = sourceIndex * 4;

            result[targetIdx4] = result[sourceIdx4];
            result[targetIdx4 + 1] = result[sourceIdx4 + 1];
            result[targetIdx4 + 2] = result[sourceIdx4 + 2];
            // Alpha channel remains unchanged

            // Mark this point as processed (no longer needs inpainting)
            inpaintMask[index] = 0;

            // Add newly exposed boundary points to the queue
            const y = Math.floor(index / width);
            const x = index % width;
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx === 0 && dy === 0) continue;
                    const nx = x + dx;
                    const ny = y + dy;
                    if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                        const nidx = ny * width + nx;
                        if (inpaintMask[nidx] === 1) {
                            // Check if this neighbor is now a boundary point
                            let isBoundary = false;
                            for (let ddy = -1; ddy <= 1 && !isBoundary; ddy++) {
                                for (let ddx = -1; ddx <= 1 && !isBoundary; ddx++) {
                                    if (ddx === 0 && ddy === 0) continue;
                                    const nnx = nx + ddx;
                                    const nny = ny + ddy;
                                    if (nnx >= 0 && nnx < width && nny >= 0 && nny < height) {
                                        const nnidx = nny * width + nnx;
                                        if (inpaintMask[nnidx] === 0) {
                                            isBoundary = true;
                                        }
                                    }
                                }
                            }
                            if (isBoundary) {
                                // Calculate priority and insert in sorted order
                                const priority = calculatePriority(nidx, width, height, data, inpaintMask);
                                const newItem = { index: nidx, priority };

                                // Insert in sorted position (maintain ascending order)
                                let inserted = false;
                                for (let i = 0; i < priorityQueue.length; i++) {
                                    if (priorityQueue[i].priority > priority) {
                                        priorityQueue.splice(i, 0, newItem);
                                        inserted = true;
                                        break;
                                    }
                                }
                                if (!inserted) {
                                    priorityQueue.push(newItem);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    return result;
}

// Calculate priority for a point based on gradient (isophotes) and confidence
function calculatePriority(
    index: number,
    width: number,
    height: number,
    data: Uint8ClampedArray,
    mask: Uint8Array
): number {
    const y = Math.floor(index / width);
    const x = index % width;

    // Calculate gradient magnitude and direction
    let dx = 0, dy = 0;
    let count = 0;

    // Use Sobel operator for better gradient estimation
    for (let dyOffset = -1; dyOffset <= 1; dyOffset++) {
        for (let dxOffset = -1; dxOffset <= 1; dxOffset++) {
            if (dxOffset === 0 && dyOffset === 0) continue;

            const nx = x + dxOffset;
            const ny = y + dyOffset;

            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                const nidx = ny * width + nx;
                if (mask[nidx] === 0) { // Only consider known points
                    const weight = 1.0 / (Math.sqrt(dxOffset * dxOffset + dyOffset * dyOffset) + 0.001);
                    const nidx4 = nidx * 4;

                    // Convert to grayscale for gradient calculation
                    const gray = (data[nidx4] + data[nidx4 + 1] + data[nidx4 + 2]) / 3;

                    // Sobel-like weighting
                    if (Math.abs(dxOffset) === 1 && Math.abs(dyOffset) === 1) {
                        // Diagonal
                        dx += gray * weight * dxOffset * 0.5;
                        dy += gray * weight * dyOffset * 0.5;
                    } else {
                        // Cardinal
                        dx += gray * weight * dxOffset;
                        dy += gray * weight * dyOffset;
                    }
                    count += weight;
                }
            }
        }
    }

    if (count > 0) {
        dx /= count;
        dy /= count;
    }

    // Gradient magnitude
    const gradientMagnitude = Math.sqrt(dx * dx + dy * dy);

    // Confidence term (how many known neighbors)
    let confidence = 0;
    let totalKnown = 0;
    for (let dyOffset = -1; dyOffset <= 1; dyOffset++) {
        for (let dxOffset = -1; dxOffset <= 1; dxOffset++) {
            if (dxOffset === 0 && dyOffset === 0) continue;

            const nx = x + dxOffset;
            const ny = y + dyOffset;

            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                const nidx = ny * width + nx;
                if (mask[nidx] === 0) {
                    confidence++;
                }
                totalKnown++;
            }
        }
    }

    const confidenceTerm = totalKnown > 0 ? confidence / totalKnown : 0;

    // Combined priority: lower priority means higher urgency to process
    // We want to process points with high confidence and high gradient first
    return 1.0 - (confidenceTerm * 0.5 + Math.min(gradientMagnitude / 255.0, 0.5) * 0.5);
}

// Find the best source point from the neighborhood
function findBestSource(
    index: number,
    width: number,
    height: number,
    data: Uint8ClampedArray,
    mask: Uint8Array
): { sourceIndex: number; confidence: number } {
    const y = Math.floor(index / width);
    const x = index % width;

    let bestSourceIndex = -1;
    let bestConfidence = -1;

    // Look in a 3x3 neighborhood for known points
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;

            const nx = x + dx;
            const ny = y + dy;

            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                const nidx = ny * width + nx;
                if (mask[nidx] === 0) { // Known point
                    // Calculate confidence based on how many known neighbors this point has
                    let confidence = 0;
                    for (let ddy = -1; ddy <= 1; ddy++) {
                        for (let ddx = -1; ddx <= 1; ddx++) {
                            if (ddx === 0 && ddy === 0) continue;

                            const nnx = nx + ddx;
                            const nny = ny + ddy;

                            if (nnx >= 0 && nnx < width && nny >= 0 && nny < height) {
                                const nnidx = nny * width + nnx;
                                if (mask[nnidx] === 0) {
                                    confidence++;
                                }
                            }
                        }
                    }

                    if (confidence > bestConfidence) {
                        bestConfidence = confidence;
                        bestSourceIndex = nidx;
                    }
                }
            }
        }
    }

    return { sourceIndex: bestSourceIndex, confidence: bestConfidence };
}

// Improved watermark detection using edge detection and texture analysis
function buildAutoMask(
    canvas: HTMLCanvasElement,
    data: Uint8ClampedArray,
    width: number,
    height: number,
    sensitivity: number,
): Uint8Array {
    const mask = new Uint8Array(width * height);

    // Convert sensitivity (5-40) to a more usable range (0.1-1.0)
    const sensFactor = (sensitivity - 5) / 35; // 0 to 1

    // Step 1: Detect edges using Sobel operator
    const edgeStrength = new Float32Array(width * height);
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const idx = y * width + x;
            const i4 = idx * 4;

            // Sobel operator for edge detection
            let gxR = 0, gxG = 0, gxB = 0;
            let gyR = 0, gyG = 0, gyB = 0;

            // Sobel kernels
            const gx = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
            const gy = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

            let kernelIdx = 0;
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const nidx = (y + dy) * width + (x + dx);
                    const ni4 = nidx * 4;

                    const r = data[ni4];
                    const g = data[ni4 + 1];
                    const b = data[ni4 + 2];

                    gxR += r * gx[kernelIdx];
                    gxG += g * gx[kernelIdx];
                    gxB += b * gx[kernelIdx];

                    gyR += r * gy[kernelIdx];
                    gyG += g * gy[kernelIdx];
                    gyB += b * gy[kernelIdx];

                    kernelIdx++;
                }
            }

            // Gradient magnitude
            const gxMag = Math.sqrt(gxR * gxR + gxG * gxG + gxB * gxB) / 3;
            const gyMag = Math.sqrt(gyR * gyR + gyG * gyG + gyB * gyB) / 3;
            edgeStrength[idx] = Math.sqrt(gxMag * gxMag + gyMag * gyMag);
        }
    }

    // Step 2: Apply adaptive threshold based on local statistics
    const threshold = new Float32Array(width * height);
    const windowSize = 15; // Local window size for statistics
    const halfWindow = Math.floor(windowSize / 2);

    for (let y = halfWindow; y < height - halfWindow; y++) {
        for (let x = halfWindow; x < width - halfWindow; x++) {
            const idx = y * width + x;

            // Calculate mean and standard deviation in local window
            let sum = 0;
            let sumSq = 0;
            let count = 0;

            for (let dy = -halfWindow; dy <= halfWindow; dy++) {
                for (let dx = -halfWindow; dx <= halfWindow; dx++) {
                    const nidx = (y + dy) * width + (x + dx);
                    sum += edgeStrength[nidx];
                    sumSq += edgeStrength[nidx] * edgeStrength[nidx];
                    count++;
                }
            }

            const mean = sum / count;
            const variance = (sumSq / count) - (mean * mean);
            const stdDev = Math.sqrt(Math.max(0, variance));

            // Adaptive threshold: mean + k * stdDev
            // k decreases with sensitivity (more sensitive = lower threshold)
            const k = 2.5 - (sensFactor * 2.0); // Range: 2.5 to 0.5
            threshold[idx] = mean + k * stdDev;
        }
    }

    // Step 3: Create initial mask based on adaptive threshold
    for (let y = halfWindow; y < height - halfWindow; y++) {
        for (let x = halfWindow; x < width - halfWindow; x++) {
            const idx = y * width + x;
            if (edgeStrength[idx] > threshold[idx]) {
                mask[idx] = 1;
            }
        }
    }

    // Step 4: Remove small isolated points (noise)
    const filtered = new Uint8Array(width * height);
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const idx = y * width + x;
            if (mask[idx] === 1) {
                // Count neighbors that are also marked
                let neighborCount = 0;
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        if (dx === 0 && dy === 0) continue;
                        const nidx = (y + dy) * width + (x + dx);
                        if (mask[nidx] === 1) {
                            neighborCount++;
                        }
                    }
                }
                // Keep if it has enough neighbors (not isolated)
                if (neighborCount >= 2) {
                    filtered[idx] = 1;
                }
            }
        }
    }

    // Step 5: Dilate to connect nearby components
    const dilated = new Uint8Array(width * height);
    const dilateRadius = 2 + Math.floor(sensFactor * 3); // 2 to 5 based on sensitivity
    for (let y = dilateRadius; y < height - dilateRadius; y++) {
        for (let x = dilateRadius; x < width - dilateRadius; x++) {
            if (filtered[y * width + x]) {
                for (let dy = -dilateRadius; dy <= dilateRadius; dy++) {
                    for (let dx = -dilateRadius; dx <= dilateRadius; dx++) {
                        dilated[(y + dy) * width + (x + dx)] = 1;
                    }
                }
            }
        }
    }

    // Step 6: Fill small holes
    const filled = new Uint8Array(width * height);
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const idx = y * width + x;
            if (dilated[idx] === 0) {
                // Check if surrounded by watermark pixels
                let wallCount = 0;
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        if (dx === 0 && dy === 0) continue;
                        const nidx = (y + dy) * width + (x + dx);
                        if (dilated[nidx] === 1) {
                            wallCount++;
                        }
                    }
                }
                // If mostly surrounded, consider it part of watermark
                if (wallCount >= 6) {
                    filled[idx] = 1;
                } else {
                    filled[idx] = 0;
                }
            } else {
                filled[idx] = dilated[idx];
            }
        }
    }

    console.log("Detected pixels:", filled.reduce((a, b) => a + b, 0));
    return filled;
}

// ─────────────────────────────────────────────────────────────────────────────
function buildManualMask(width: number, height: number, r: Rect): Uint8Array {
    const mask = new Uint8Array(width * height);
    const x0 = Math.max(0, Math.round(r.x));
    const y0 = Math.max(0, Math.round(r.y));
    const x1 = Math.min(width, Math.round(r.x + r.w));
    const y1 = Math.min(height, Math.round(r.y + r.h));
    for (let y = y0; y < y1; y++) mask.fill(1, y * width + x0, y * width + x1);
    return mask;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const SUPPORTED_FORMATS = ["image/jpeg", "image/png", "image/webp"];

const STEPS = [
    { n: 1, label: "Upload" },
    { n: 2, label: "Select / Auto" },
    { n: 3, label: "Remove" },
    { n: 4, label: "Download" },
];

export default function WatermarkRemover() {
    const { addHistoryItem } = useHistory();

    const [file, setFile] = useState<File | null>(null);
    const [originalUrl, setOriginalUrl] = useState<string | null>(null);
    const [beforeSnapshot, setBeforeSnapshot] = useState<string | null>(null);
    const [hasEdits, setHasEdits] = useState(false);
    const [showBefore, setShowBefore] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [mode, setMode] = useState<Mode>("manual");
    const [sensitivity, setSensitivity] = useState(35);
    const [selection, setSelection] = useState<Rect | null>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
    const [zoom, setZoom] = useState(100);
    const [comparisonPosition, setComparisonPosition] = useState(50);
    const [exportFormat, setExportFormat] = useState<ExportFormat>("png");
    const [showExportOptions, setShowExportOptions] = useState(false);
    const [detectedMaskUrl, setDetectedMaskUrl] = useState<string | null>(null);
    const [showMask, setShowMask] = useState(false);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const overlayRef = useRef<HTMLCanvasElement>(null);
    const imgRef = useRef<HTMLImageElement | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const comparisonSliderRef = useRef<HTMLDivElement>(null);

    const selReady = !!selection && selection.w > 4 && selection.h > 4;
    const currentStep = !file ? 1 : !hasEdits && !selReady ? 2 : !hasEdits ? 3 : 4;

    // Load image onto canvas
    useEffect(() => {
        if (!originalUrl || !canvasRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d")!;
        const img = new Image();
        img.onload = () => {
            imgRef.current = img;
            const maxW = 1100;
            const scale = img.naturalWidth > maxW ? maxW / img.naturalWidth : 1;
            canvas.width = Math.round(img.naturalWidth * scale);
            canvas.height = Math.round(img.naturalHeight * scale);
            if (overlayRef.current) {
                overlayRef.current.width = canvas.width;
                overlayRef.current.height = canvas.height;
            }
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        };
        img.src = originalUrl;
    }, [originalUrl]);

    // Draw selection overlay
    useEffect(() => {
        const ov = overlayRef.current;
        if (!ov?.width) return;
        const ctx = ov.getContext("2d")!;
        ctx.clearRect(0, 0, ov.width, ov.height);
        if (!selection || selection.w < 3 || selection.h < 3) return;
        const { x, y, w, h } = selection;
        ctx.fillStyle = "rgba(239,68,68,0.12)";
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = "#ef4444";
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 3]);
        ctx.strokeRect(x, y, w, h);
        ctx.setLineDash([]);
        ctx.fillStyle = "#ef4444";
        [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].forEach(([cx, cy]) => {
            ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.fill();
        });
    }, [selection]);

    const getCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const c = overlayRef.current!;
        const r = c.getBoundingClientRect();
        return {
            x: Math.round((e.clientX - r.left) * (c.width / r.width)),
            y: Math.round((e.clientY - r.top) * (c.height / r.height)),
        };
    };

    const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (mode !== "manual") return;
        const p = getCoords(e);
        setDragStart(p); setIsDrawing(true);
        setSelection({ x: p.x, y: p.y, w: 0, h: 0 });
    };
    const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isDrawing || !dragStart) return;
        const p = getCoords(e);
        setSelection({
            x: Math.min(dragStart.x, p.x), y: Math.min(dragStart.y, p.y),
            w: Math.abs(p.x - dragStart.x), h: Math.abs(p.y - dragStart.y),
        });
    };
    const onMouseUp = () => { setIsDrawing(false); setDragStart(null); };

    const applyFill = (mask: Uint8Array) => {
        const canvas = canvasRef.current!;
        const ctx = canvas.getContext("2d")!;
        if (!beforeSnapshot) setBeforeSnapshot(canvas.toDataURL("image/png"));
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        // Use Telea inpainting algorithm
        const result = inpaintImage(imageData.data, canvas.width, canvas.height, mask);

        // Create ImageData properly
        const imageDataObj = new ImageData(canvas.width, canvas.height);
        imageDataObj.data.set(result);
        ctx.putImageData(imageDataObj, 0, 0);
        setHasEdits(true);
        canvasRef.current!.toBlob((blob) => {
            if (!blob || !file) return;
            addHistoryItem({
                name: file.name, type: "image", action: "Removed Watermark",
                originalSize: file.size, optimizedSize: blob.size,
                saved: "—", url: URL.createObjectURL(blob),
            });
        }, "image/png");
    };

    const handleManualRemove = async () => {
        if (!canvasRef.current || !selReady) {
            toast.error("Draw a selection over the watermark first");
            return;
        }
        const usage = consumeServiceUsage("watermark-remover");
        if (!usage.ok) {
            toast.error(`Watermark Remover limit reached (${usage.used}/${usage.limit})`);
            return;
        }
        setProcessing(true);
        setProgress(0);

        const progressInterval = setInterval(() => {
            setProgress(prev => Math.min(prev + 15, 90));
        }, 100);

        await new Promise(r => setTimeout(r, 100));
        try {
            const canvas = canvasRef.current;
            const mask = buildManualMask(canvas.width, canvas.height, selection!);
            applyFill(mask);
            overlayRef.current?.getContext("2d")?.clearRect(0, 0, overlayRef.current.width, overlayRef.current.height);
            setSelection(null);
            setProgress(100);
            setTimeout(() => setProgress(0), 500);
            toast.success("Watermark removed! Draw another selection for more watermarks.");
        } catch {
            toast.error("Failed to remove watermark. Try again.");
            setProgress(0);
        }
        clearInterval(progressInterval);
        setProcessing(false);
    };

    const handleAutoRemove = async () => {
        if (!canvasRef.current || !file) return;
        const usage = consumeServiceUsage("watermark-remover");
        if (!usage.ok) {
            toast.error(`Watermark Remover limit reached (${usage.used}/${usage.limit})`);
            return;
        }
        setProcessing(true);
        setProgress(0);

        const progressInterval = setInterval(() => {
            setProgress(prev => Math.min(prev + 10, 85));
        }, 150);

        await new Promise(r => setTimeout(r, 100));
        try {
            const canvas = canvasRef.current;
            const ctx = canvas.getContext("2d")!;
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

            console.log("🔍 Detecting watermarks... Sensitivity:", sensitivity);

            const mask = buildAutoMask(canvas, imageData.data, canvas.width, canvas.height, sensitivity);
            const detected = mask.reduce((s, v) => s + v, 0);

            const totalPixels = canvas.width * canvas.height;
            const percentage = ((detected / totalPixels) * 100).toFixed(2);

            clearInterval(progressInterval);
            setProgress(95);

            console.log("✅ Detected:", detected.toLocaleString(), `pixels (${percentage}%)`);

            // Visualize the detected mask
            const maskCanvas = document.createElement("canvas");
            maskCanvas.width = canvas.width;
            maskCanvas.height = canvas.height;
            const maskCtx = maskCanvas.getContext("2d")!;
            const maskImageData = maskCtx.createImageData(canvas.width, canvas.height);
            for (let i = 0; i < mask.length; i++) {
                const val = mask[i] * 255;
                maskImageData.data[i * 4] = val;
                maskImageData.data[i * 4 + 1] = val;
                maskImageData.data[i * 4 + 2] = val;
                maskImageData.data[i * 4 + 3] = 255;
            }
            maskCtx.putImageData(maskImageData, 0, 0);
            setDetectedMaskUrl(maskCanvas.toDataURL("image/png"));

            if (detected === 0) {
                toast.warning("No watermark detected. Try lowering sensitivity or use manual selection.");
                setProgress(0);
                setProcessing(false);
                return;
            }

            console.log("🎨 Removing watermark...");
            applyFill(mask);
            setProgress(100);
            setTimeout(() => setProgress(0), 500);
            toast.success(`Watermark removed! Check the result.`);
        } catch (error) {
            clearInterval(progressInterval);
            setProgress(0);
            console.error("❌ Error:", error);
            toast.error("Auto removal failed. Try manual selection.");
        }
        setProcessing(false);
    };

    const handleReset = () => {
        if (!imgRef.current || !canvasRef.current) return;
        const c = canvasRef.current;
        c.getContext("2d")!.drawImage(imgRef.current, 0, 0, c.width, c.height);
        overlayRef.current?.getContext("2d")?.clearRect(0, 0, overlayRef.current.width, overlayRef.current.height);
        setSelection(null); setHasEdits(false); setShowBefore(false); setBeforeSnapshot(null);
        setDetectedMaskUrl(null); setShowMask(false);
        setProgress(0);
        toast.info("Reset to original image");
    };

    const handleDownload = () => {
        if (!canvasRef.current || !file) return;
        const download = consumeDownloadUsage();
        if (!download.ok) {
            toast.error(`Download limit reached (${download.used}/${download.limit})`);
            return;
        }

        canvasRef.current.toBlob((blob) => {
            if (!blob) return;
            const ext = exportFormat;
            const name = `cleaned_${file.name.replace(/\.\w+$/, "")}.${ext}`;
            saveAs(blob, name);
            toast.success(`Image downloaded as ${ext.toUpperCase()}`);
        }, `image/${exportFormat}`);
    };

    const validateFile = (img: File): boolean => {
        if (!SUPPORTED_FORMATS.includes(img.type)) {
            toast.error(
                <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    <span>Unsupported file type. Please upload JPG, PNG, or WebP.</span>
                </div>
            );
            return false;
        }
        if (img.size > MAX_FILE_SIZE) {
            toast.error(
                <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    <span>File too large. Maximum size is 10MB.</span>
                </div>
            );
            return false;
        }
        return true;
    };

    const handleFiles = (newFiles: File[]) => {
        const img = newFiles.find(f => f.type.startsWith("image/"));
        if (!img) {
            toast.error("Please upload an image file");
            return;
        }
        if (!validateFile(img)) return;

        if (originalUrl) URL.revokeObjectURL(originalUrl);
        setFile(img); setOriginalUrl(URL.createObjectURL(img));
        setBeforeSnapshot(null); setHasEdits(false); setShowBefore(false);
        setSelection(null); setZoom(100); setProgress(0);
        toast.success("Image uploaded successfully!");
    };

    const handleNewImage = () => {
        if (originalUrl) URL.revokeObjectURL(originalUrl);
        setFile(null); setOriginalUrl(null);
        setBeforeSnapshot(null); setHasEdits(false); setShowBefore(false);
        setSelection(null); setZoom(100); setProgress(0);
        setShowExportOptions(false);
        setDetectedMaskUrl(null); setShowMask(false);
    };

    const handleZoomIn = () => setZoom(prev => Math.min(prev + 25, 200));
    const handleZoomOut = () => setZoom(prev => Math.max(prev - 25, 50));
    const handleZoomReset = () => setZoom(100);

    const handleComparisonSlider = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!comparisonSliderRef.current) return;
        const rect = comparisonSliderRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
        setComparisonPosition(percentage);
    };

    return (
        <div className="space-y-6">
            {/* Header Section */}
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center space-y-2"
            >
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-2">
                    <Wand2 className="h-4 w-4" />
                    AI-Powered
                </div>
                <h1 className="text-3xl font-bold text-foreground tracking-tight">Watermark Remover</h1>
                <p className="text-muted-foreground max-w-2xl mx-auto">
                    Auto-detect and remove watermarks, or manually select any area.
                    Preserve image quality while removing unwanted overlays.
                </p>
            </motion.div>

            {!file ? (
                /* Upload Section */
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="max-w-3xl mx-auto space-y-6"
                >
                    {/* Upload Area */}
                    <Card className="overflow-hidden border-2 border-dashed">
                        <CardContent className="p-0">
                            <DropZone
                                accept="image/*"
                                onFiles={handleFiles}
                                label="Drop your image here to get started"
                                sublabel="Supports JPG, PNG, WebP • Max 10MB"
                            />
                        </CardContent>
                    </Card>

                    {/* Feature Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <motion.div
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.1 }}
                        >
                            <Card className="h-full hover:shadow-lg transition-shadow duration-300 border-border/50">
                                <CardHeader className="pb-3">
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-10 w-10 rounded-lg bg-gradient-to-br from-purple-500/20 to-purple-600/20 items-center justify-center">
                                            <Wand2 className="h-5 w-5 text-purple-600" />
                                        </div>
                                        <div>
                                            <CardTitle className="text-lg">Auto Remove</CardTitle>
                                            <CardDescription>AI-powered detection</CardDescription>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-sm text-muted-foreground leading-relaxed">
                                        One-click removal for semi-transparent text & logo watermarks
                                        (Shutterstock, Freepik, etc.). Automatically scans the entire image
                                        and reconstructs the background naturally.
                                    </p>
                                    <div className="flex flex-wrap gap-2 mt-3">
                                        <Badge variant="secondary" className="text-xs">Auto-detect</Badge>
                                        <Badge variant="secondary" className="text-xs">Smart fill</Badge>
                                        <Badge variant="secondary" className="text-xs">Preserves quality</Badge>
                                    </div>
                                </CardContent>
                            </Card>
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.2 }}
                        >
                            <Card className="h-full hover:shadow-lg transition-shadow duration-300 border-border/50">
                                <CardHeader className="pb-3">
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-10 w-10 rounded-lg bg-gradient-to-br from-blue-500/20 to-blue-600/20 items-center justify-center">
                                            <MousePointer2 className="h-5 w-5 text-blue-600" />
                                        </div>
                                        <div>
                                            <CardTitle className="text-lg">Manual Select</CardTitle>
                                            <CardDescription>Precision control</CardDescription>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-sm text-muted-foreground leading-relaxed">
                                        Draw a rectangle over any watermark — corner stamp, logo, or
                                        solid text overlay. Only modifies the selected area while
                                        preserving surrounding image quality.
                                    </p>
                                    <div className="flex flex-wrap gap-2 mt-3">
                                        <Badge variant="secondary" className="text-xs">Precise</Badge>
                                        <Badge variant="secondary" className="text-xs">Manual control</Badge>
                                        <Badge variant="secondary" className="text-xs">Targeted</Badge>
                                    </div>
                                </CardContent>
                            </Card>
                        </motion.div>
                    </div>

                    {/* Additional Info */}
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="flex justify-center gap-6 text-xs text-muted-foreground"
                    >
                        <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                            <span>No quality loss</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                            <span>Fast processing</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                            <span>Secure & private</span>
                        </div>
                    </motion.div>
                </motion.div>
            ) : (
                /* Editor Section */
                <div className="space-y-4">
                    {/* Step Progress */}
                    <AnimatePresence>
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            className="flex items-center justify-center gap-2 flex-wrap"
                        >
                            {STEPS.map((s, i) => (
                                <div key={s.n} className="flex items-center gap-2">
                                    <motion.div
                                        className={cn(
                                            "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all",
                                            currentStep > s.n
                                                ? "bg-green-500/15 text-green-500"
                                                : currentStep === s.n
                                                    ? "bg-primary/15 text-primary border border-primary/30 shadow-sm"
                                                    : "bg-secondary text-muted-foreground"
                                        )}
                                        whileHover={{ scale: 1.05 }}
                                    >
                                        {currentStep > s.n
                                            ? <CheckCircle2 className="h-3.5 w-3.5" />
                                            : <span className="w-4 h-4 rounded-full border border-current flex items-center justify-center text-[10px] font-bold">{s.n}</span>}
                                        <span>{s.label}</span>
                                    </motion.div>
                                    {i < STEPS.length - 1 && (
                                        <ArrowRight className="h-3 w-3 text-muted-foreground/50" />
                                    )}
                                </div>
                            ))}
                        </motion.div>
                    </AnimatePresence>

                    {/* Progress Bar */}
                    <AnimatePresence>
                        {processing && progress > 0 && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                className="space-y-2"
                            >
                                <div className="flex justify-between text-xs text-muted-foreground">
                                    <span className="flex items-center gap-2">
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                        Processing...
                                    </span>
                                    <span>{progress}%</span>
                                </div>
                                <Progress value={progress} className="h-2" />
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                        {/* Left Panel - Controls */}
                        <div className="lg:col-span-1 space-y-4">
                            {/* Mode Toggle */}
                            <Card className="shadow-md">
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-sm">Removal Mode</CardTitle>
                                    <CardDescription>Choose your approach</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)} className="w-full">
                                        <TabsList className="grid w-full grid-cols-2">
                                            <TabsTrigger value="auto" className="text-xs">
                                                <Wand2 className="h-3.5 w-3.5 mr-1.5" />
                                                Auto
                                            </TabsTrigger>
                                            <TabsTrigger value="manual" className="text-xs">
                                                <MousePointer2 className="h-3.5 w-3.5 mr-1.5" />
                                                Manual
                                            </TabsTrigger>
                                        </TabsList>
                                    </Tabs>
                                </CardContent>
                            </Card>

                            {/* Mode-Specific Controls */}
                            <AnimatePresence mode="wait">
                                {mode === "auto" ? (
                                    <motion.div
                                        key="auto"
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: 20 }}
                                    >
                                        <Card className="shadow-md">
                                            <CardHeader className="pb-3">
                                                <div className="flex items-center gap-2">
                                                    <Settings2 className="h-4 w-4 text-muted-foreground" />
                                                    <CardTitle className="text-sm">Auto Settings</CardTitle>
                                                </div>
                                            </CardHeader>
                                            <CardContent className="space-y-4">
                                                <div className="space-y-3">
                                                    <div className="space-y-2">
                                                        <div className="flex justify-between items-center">
                                                            <label className="text-xs font-medium">Sensitivity</label>
                                                            <Badge variant="outline" className="text-xs font-mono">{sensitivity}</Badge>
                                                        </div>
                                                        <Slider
                                                            value={[sensitivity]}
                                                            onValueChange={([v]) => setSensitivity(v)}
                                                            min={5}
                                                            max={40}
                                                            step={1}
                                                            className="py-2"
                                                        />
                                                        <div className="flex justify-between text-[10px] text-muted-foreground">
                                                            <span>Conservative</span>
                                                            <span>Aggressive</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="rounded-lg bg-muted/50 p-3 space-y-2">
                                                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                                                        <strong className="text-foreground">Best for:</strong> Semi-transparent
                                                        grey/white text watermarks (Shutterstock, Freepik style).
                                                    </p>
                                                    <p className="text-[11px] text-muted-foreground">
                                                        <strong className="text-foreground">Tip:</strong> Start low and
                                                        increase if watermark persists.
                                                    </p>
                                                </div>

                                                <Button
                                                    onClick={handleAutoRemove}
                                                    disabled={processing}
                                                    className="w-full"
                                                    size="sm"
                                                >
                                                    {processing ? (
                                                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processing...</>
                                                    ) : (
                                                        <><Wand2 className="mr-2 h-4 w-4" />Auto Remove</>
                                                    )}
                                                </Button>
                                            </CardContent>
                                        </Card>
                                    </motion.div>
                                ) : (
                                    <motion.div
                                        key="manual"
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -20 }}
                                    >
                                        <Card className="shadow-md">
                                            <CardHeader className="pb-3">
                                                <CardTitle className="text-sm">Manual Selection</CardTitle>
                                                <CardDescription>Draw to select area</CardDescription>
                                            </CardHeader>
                                            <CardContent className="space-y-3">
                                                <ol className="space-y-2">
                                                    {[
                                                        "Click and drag on the image to draw a rectangle",
                                                        "Position over the watermark area",
                                                        "Click Remove to erase it",
                                                        "Repeat for additional watermarks",
                                                    ].map((text, i) => (
                                                        <li key={i} className="flex gap-2 text-xs text-muted-foreground">
                                                            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/15 text-primary flex items-center justify-center text-[10px] font-bold">
                                                                {i + 1}
                                                            </span>
                                                            {text}
                                                        </li>
                                                    ))}
                                                </ol>

                                                <AnimatePresence>
                                                    {selReady && (
                                                        <motion.div
                                                            initial={{ opacity: 0, scale: 0.95 }}
                                                            animate={{ opacity: 1, scale: 1 }}
                                                            exit={{ opacity: 0, scale: 0.95 }}
                                                            className="rounded-lg border border-primary/30 bg-primary/5 p-3"
                                                        >
                                                            <div className="flex items-center gap-2 text-primary text-xs font-semibold">
                                                                <CheckCircle2 className="h-3.5 w-3.5" />
                                                                Area Selected
                                                            </div>
                                                            <p className="text-[11px] text-muted-foreground mt-1 font-mono">
                                                                {selection!.w} × {selection!.h} px
                                                            </p>
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>

                                                <Button
                                                    onClick={handleManualRemove}
                                                    disabled={!selReady || processing}
                                                    className="w-full"
                                                    size="sm"
                                                >
                                                    {processing ? (
                                                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Removing...</>
                                                    ) : (
                                                        <><Eraser className="mr-2 h-4 w-4" />Remove Watermark</>
                                                    )}
                                                </Button>
                                            </CardContent>
                                        </Card>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Zoom Controls */}
                            <Card className="shadow-md">
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-sm flex items-center gap-2">
                                        <Maximize2 className="h-4 w-4" />
                                        View Controls
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    <div className="flex items-center justify-between gap-2">
                                        <Button
                                            onClick={handleZoomOut}
                                            variant="outline"
                                            size="sm"
                                            disabled={zoom <= 50}
                                        >
                                            <ZoomOut className="h-4 w-4" />
                                        </Button>
                                        <span className="text-xs font-mono w-12 text-center">{zoom}%</span>
                                        <Button
                                            onClick={handleZoomIn}
                                            variant="outline"
                                            size="sm"
                                            disabled={zoom >= 200}
                                        >
                                            <ZoomIn className="h-4 w-4" />
                                        </Button>
                                    </div>
                                    <Button
                                        onClick={handleZoomReset}
                                        variant="ghost"
                                        size="sm"
                                        className="w-full text-xs"
                                        disabled={zoom === 100}
                                    >
                                        Reset Zoom
                                    </Button>
                                </CardContent>
                            </Card>

                            {/* Result Actions */}
                            <AnimatePresence>
                                {hasEdits && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="space-y-2"
                                    >
                                        <Card className="shadow-md border-green-500/30">
                                            <CardContent className="p-4 space-y-3">
                                                <div className="flex items-center gap-2 text-green-600 text-sm font-medium">
                                                    <CheckCircle2 className="h-4 w-4" />
                                                    Ready to download
                                                </div>

                                                {/* Export Format Selection */}
                                                <div className="space-y-2">
                                                    <label className="text-xs text-muted-foreground">Export Format</label>
                                                    <div className="grid grid-cols-3 gap-2">
                                                        {(["png", "jpg", "webp"] as ExportFormat[]).map((fmt) => (
                                                            <button
                                                                key={fmt}
                                                                onClick={() => { setExportFormat(fmt); setShowExportOptions(true); }}
                                                                className={cn(
                                                                    "px-2 py-1.5 rounded-md text-xs font-medium border transition-all",
                                                                    exportFormat === fmt
                                                                        ? "bg-primary text-primary-foreground border-primary"
                                                                        : "bg-secondary text-secondary-foreground border-border hover:bg-secondary/80"
                                                                )}
                                                            >
                                                                {fmt.toUpperCase()}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>

                                                <Button
                                                    onClick={handleDownload}
                                                    className="w-full"
                                                    size="sm"
                                                >
                                                    <Download className="mr-2 h-4 w-4" />
                                                    Download {exportFormat.toUpperCase()}
                                                </Button>

                                                {beforeSnapshot && (
                                                    <Button
                                                        onClick={() => setShowBefore(v => !v)}
                                                        variant="ghost"
                                                        size="sm"
                                                        className="w-full text-xs"
                                                    >
                                                        {showBefore ? (
                                                            <><EyeOff className="mr-1.5 h-3.5 w-3.5" />Show Cleaned</>
                                                        ) : (
                                                            <><Eye className="mr-1.5 h-3.5 w-3.5" />Compare Original</>
                                                        )}
                                                    </Button>
                                                )}

                                                {detectedMaskUrl && (
                                                    <Button
                                                        onClick={() => setShowMask(v => !v)}
                                                        variant="ghost"
                                                        size="sm"
                                                        className="w-full text-xs"
                                                    >
                                                        {showMask ? (
                                                            <><EyeOff className="mr-1.5 h-3.5 w-3.5" />Hide Detection Map</>
                                                        ) : (
                                                            <><Eye className="mr-1.5 h-3.5 w-3.5" />View Detection Map</>
                                                        )}
                                                    </Button>
                                                )}
                                            </CardContent>
                                        </Card>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Reset & New Image */}
                            <div className="flex gap-2">
                                <Button
                                    onClick={handleReset}
                                    variant="outline"
                                    size="sm"
                                    className="flex-1 text-xs"
                                    disabled={!hasEdits && !showBefore}
                                >
                                    <RotateCcw className="mr-1 h-3.5 w-3.5" />
                                    Reset
                                </Button>
                                <Button
                                    onClick={handleNewImage}
                                    variant="ghost"
                                    size="sm"
                                    className="flex-1 text-xs"
                                >
                                    <Upload className="mr-1 h-3.5 w-3.5" />
                                    New Image
                                </Button>
                            </div>
                        </div>

                        {/* Canvas Area */}
                        <div className="lg:col-span-3">
                            <Card className="shadow-lg overflow-hidden">
                                {/* Toolbar */}
                                <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                        {mode === "manual" ? (
                                            <MousePointer2 className="h-4 w-4 text-primary" />
                                        ) : (
                                            <Wand2 className="h-4 w-4 text-primary" />
                                        )}
                                        <span>
                                            {showBefore
                                                ? "Viewing original image"
                                                : mode === "auto"
                                                    ? "Click Auto Remove to scan & remove watermarks"
                                                    : selReady
                                                        ? `Selected ${selection!.w}×${selection!.h}px — ready to remove`
                                                        : "Click and drag to select watermark area"}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {hasEdits && !showBefore && (
                                            <Badge className="bg-green-500/15 text-green-600 border-green-500/30">
                                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                                Cleaned
                                            </Badge>
                                        )}
                                        {showBefore && (
                                            <Badge variant="outline" className="text-xs">
                                                Original
                                            </Badge>
                                        )}
                                    </div>
                                </div>

                                {/* Canvas Container */}
                                <div
                                    ref={containerRef}
                                    className="overflow-auto p-4 bg-[repeating-conic-gradient(hsl(var(--border))_0%_25%,transparent_0%_50%)_0_0/16px_16px] min-h-[400px]"
                                >
                                    <div
                                        className="relative inline-block transition-transform duration-200"
                                        style={{ transform: `scale(${zoom / 100})`, transformOrigin: "top left" }}
                                    >
                                        {/* Before/After Comparison Slider */}
                                        {showBefore && beforeSnapshot && (
                                            <div
                                                ref={comparisonSliderRef}
                                                className="relative overflow-hidden rounded-lg cursor-ew-resize"
                                                onMouseMove={handleComparisonSlider}
                                                style={{ width: canvasRef.current?.width, height: canvasRef.current?.height }}
                                            >
                                                {/* After Image (Cleaned) */}
                                                <canvas
                                                    ref={canvasRef}
                                                    className="absolute top-0 left-0"
                                                />

                                                {/* Before Image (Original) - Clipped */}
                                                <div
                                                    className="absolute top-0 left-0 overflow-hidden"
                                                    style={{ width: `${comparisonPosition}%`, height: "100%" }}
                                                >
                                                    <img
                                                        src={beforeSnapshot}
                                                        alt="Original"
                                                        className="absolute top-0 left-0"
                                                        style={{
                                                            width: canvasRef.current?.width,
                                                            height: canvasRef.current?.height
                                                        }}
                                                    />
                                                </div>

                                                {/* Slider Handle */}
                                                <div
                                                    className="absolute top-0 bottom-0 w-1 bg-white cursor-ew-resize shadow-lg"
                                                    style={{ left: `${comparisonPosition}%` }}
                                                >
                                                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white shadow-lg flex items-center justify-center">
                                                        <div className="flex items-center gap-1">
                                                            <ArrowRight className="h-4 w-4 rotate-180 text-muted-foreground" />
                                                            <ArrowRight className="h-4 w-4 text-muted-foreground" />
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Labels */}
                                                <div className="absolute top-3 left-3 px-2 py-1 rounded bg-black/50 text-white text-xs">
                                                    Original
                                                </div>
                                                <div className="absolute top-3 right-3 px-2 py-1 rounded bg-black/50 text-white text-xs">
                                                    Cleaned
                                                </div>
                                            </div>
                                        )}

                                        {/* Normal Canvas View */}
                                        <canvas
                                            ref={canvasRef}
                                            className={cn(
                                                "block rounded-lg shadow-lg",
                                                showBefore || showMask ? "hidden" : "block"
                                            )}
                                        />

                                        {/* Original Image when showing before */}
                                        {showBefore && beforeSnapshot && (
                                            <img
                                                src={beforeSnapshot}
                                                alt="Original"
                                                className={cn(
                                                    "block rounded-lg shadow-lg",
                                                    showBefore ? "block" : "hidden"
                                                )}
                                            />
                                        )}

                                        {/* Detection Mask when showing mask */}
                                        {showMask && detectedMaskUrl && (
                                            <img
                                                src={detectedMaskUrl}
                                                alt="Detection Mask"
                                                className="block rounded-lg shadow-lg"
                                            />
                                        )}

                                        {/* Selection Overlay */}
                                        <canvas
                                            ref={overlayRef}
                                            className={cn(
                                                "absolute top-0 left-0 rounded-lg",
                                                showBefore || showMask ? "hidden" : "block"
                                            )}
                                            style={{
                                                cursor: showBefore || showMask || mode === "auto" ? "default" : "crosshair",
                                                pointerEvents: mode === "auto" || showBefore || showMask ? "none" : "auto",
                                            }}
                                            onMouseDown={onMouseDown}
                                            onMouseMove={onMouseMove}
                                            onMouseUp={onMouseUp}
                                            onMouseLeave={onMouseUp}
                                        />
                                    </div>
                                </div>

                                {/* Footer */}
                                <div className="px-4 py-2 border-t bg-muted/30">
                                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                                        <div className="flex items-center gap-2">
                                            <FileImage className="h-3.5 w-3.5" />
                                            <span className="truncate max-w-md">{file.name}</span>
                                        </div>
                                        {imgRef.current && (
                                            <span className="font-mono">
                                                {imgRef.current.naturalWidth} × {imgRef.current.naturalHeight} px
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </Card>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
