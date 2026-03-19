import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  Upload,
  Download,
  RotateCcw,
  RotateCw,
  ZoomIn,
  ZoomOut,
  Move,
  Crop,
  Grid3X3,
  Maximize,
  RefreshCw,
  Image as ImageIcon,
} from "lucide-react";
import { consumeDownloadUsage, consumeServiceUsage } from "@/lib/memberLimits";

type AspectRatio = "free" | "1:1" | "4:3" | "16:9" | "3:2" | "custom";

interface CropBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export default function ImageCropper() {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [imageSrc, setImageSrc] = useState<string>("");
  const [cropBox, setCropBox] = useState<CropBox>({ x: 50, y: 50, width: 200, height: 200 });
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("free");
  const [customWidth, setCustomWidth] = useState(200);
  const [customHeight, setCustomHeight] = useState(200);
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [showGrid, setShowGrid] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHandle, setResizeHandle] = useState<string>("");
  const [imagePosition, setImagePosition] = useState({ x: 0, y: 0 });
  const [isMovingImage, setIsMovingImage] = useState(false);
  const [imageDragStart, setImageDragStart] = useState({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);

  // Handle file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.match(/image\/(jpeg|jpg|png|webp)/)) {
      toast.error("Please upload a valid image (JPG, PNG, WebP)");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        setImage(img);
        setImageSrc(event.target?.result as string);
        resetCropSettings(img.width, img.height);
        toast.success("Image loaded successfully");
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Reset crop settings
  const resetCropSettings = (imgWidth: number, imgHeight: number) => {
    const size = Math.min(imgWidth, imgHeight) * 0.8;
    setCropBox({
      x: (imgWidth - size) / 2,
      y: (imgHeight - size) / 2,
      width: size,
      height: size,
    });
    setZoom(100);
    setRotation(0);
    setImagePosition({ x: 0, y: 0 });
    setAspectRatio("1:1");
    setCustomWidth(Math.round(size));
    setCustomHeight(Math.round(size));
  };

  // Get aspect ratio values
  const getAspectRatioValue = (): { width: number; height: number } | null => {
    switch (aspectRatio) {
      case "1:1":
        return { width: 1, height: 1 };
      case "4:3":
        return { width: 4, height: 3 };
      case "16:9":
        return { width: 16, height: 9 };
      case "3:2":
        return { width: 3, height: 2 };
      case "custom":
        return { width: customWidth, height: customHeight };
      default:
        return null;
    }
  };

  // Update crop box when aspect ratio changes
  useEffect(() => {
    if (!image) return;

    const ratio = getAspectRatioValue();
    if (!ratio) return;

    const centerX = cropBox.x + cropBox.width / 2;
    const centerY = cropBox.y + cropBox.height / 2;
    const imgWidth = image.width;
    const imgHeight = image.height;

    let newWidth: number;
    let newHeight: number;

    if (aspectRatio === "custom") {
      newWidth = customWidth;
      newHeight = customHeight;
    } else if (aspectRatio === "free") {
      return;
    } else {
      const aspect = ratio.width / ratio.height;
      if (imgWidth / imgHeight > aspect) {
        newHeight = imgHeight * 0.8;
        newWidth = newHeight * aspect;
      } else {
        newWidth = imgWidth * 0.8;
        newHeight = newWidth / aspect;
      }
    }

    setCropBox({
      x: centerX - newWidth / 2,
      y: centerY - newHeight / 2,
      width: newWidth,
      height: newHeight,
    });
  }, [aspectRatio, customWidth, customHeight, image]);

  // Draw canvas with image, crop box, and grid
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const overlayCanvas = overlayCanvasRef.current;
    if (!canvas || !overlayCanvas || !image) return;

    const ctx = canvas.getContext("2d");
    const overlayCtx = overlayCanvas.getContext("2d");
    if (!ctx || !overlayCtx) return;

    // Set canvas size to container size
    const container = containerRef.current;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const canvasWidth = containerRect.width;
    const canvasHeight = containerRect.height;
    
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    overlayCanvas.width = canvasWidth;
    overlayCanvas.height = canvasHeight;

    // Calculate scaled image dimensions
    const scale = zoom / 100;
    const rotated = Math.abs(rotation) === 90 || Math.abs(rotation) === 270;
    const imgWidth = rotated ? image.height : image.width;
    const imgHeight = rotated ? image.width : image.height;
    
    const scaledWidth = imgWidth * scale;
    const scaledHeight = imgHeight * scale;

    // Center the image
    const imgX = (canvasWidth - scaledWidth) / 2 + imagePosition.x;
    const imgY = (canvasHeight - scaledHeight) / 2 + imagePosition.y;

    // Clear canvas
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Save context and apply rotation
    ctx.save();
    
    // Translate to center for rotation
    ctx.translate(canvasWidth / 2, canvasHeight / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.translate(-canvasWidth / 2, -canvasHeight / 2);

    // Draw image centered
    const drawX = (canvasWidth - scaledWidth) / 2 + imagePosition.x;
    const drawY = (canvasHeight - scaledHeight) / 2 + imagePosition.y;
    
    // Clip to visible area
    ctx.beginPath();
    ctx.rect(0, 0, canvasWidth, canvasHeight);
    ctx.clip();
    
    // Draw the image
    if (rotation === 0) {
      ctx.drawImage(image, drawX, drawY, scaledWidth, scaledHeight);
    } else {
      // Handle rotation by drawing rotated
      ctx.translate(canvasWidth / 2, canvasHeight / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.translate(-canvasWidth / 2, -canvasHeight / 2);
      ctx.drawImage(image, -scaledWidth / 2 + imagePosition.x, -scaledHeight / 2 + imagePosition.y, scaledWidth, scaledHeight);
    }
    
    ctx.restore();

    // Draw overlay (darkened area outside crop)
    overlayCtx.clearRect(0, 0, canvasWidth, canvasHeight);
    
    // Calculate crop box screen position
    const cropScreenX = (cropBox.x / imgWidth) * scaledWidth + imgX;
    const cropScreenY = (cropBox.y / imgHeight) * scaledHeight + imgY;
    const cropScreenWidth = (cropBox.width / imgWidth) * scaledWidth;
    const cropScreenHeight = (cropBox.height / imgHeight) * scaledHeight;

    // Draw darkened overlay
    overlayCtx.fillStyle = "rgba(0, 0, 0, 0.6)";
    
    // Top
    overlayCtx.fillRect(0, 0, canvasWidth, cropScreenY);
    // Bottom
    overlayCtx.fillRect(0, cropScreenY + cropScreenHeight, canvasWidth, canvasHeight - cropScreenY - cropScreenHeight);
    // Left
    overlayCtx.fillRect(0, cropScreenY, cropScreenX, cropScreenHeight);
    // Right
    overlayCtx.fillRect(cropScreenX + cropScreenWidth, cropScreenY, canvasWidth - cropScreenX - cropScreenWidth, cropScreenHeight);

    // Draw crop border
    overlayCtx.strokeStyle = "#fff";
    overlayCtx.lineWidth = 2;
    overlayCtx.strokeRect(cropScreenX, cropScreenY, cropScreenWidth, cropScreenHeight);

    // Draw grid (rule of thirds)
    if (showGrid) {
      overlayCtx.strokeStyle = "rgba(255, 255, 255, 0.5)";
      overlayCtx.lineWidth = 1;
      
      // Vertical lines
      overlayCtx.beginPath();
      overlayCtx.moveTo(cropScreenX + cropScreenWidth / 3, cropScreenY);
      overlayCtx.lineTo(cropScreenX + cropScreenWidth / 3, cropScreenY + cropScreenHeight);
      overlayCtx.moveTo(cropScreenX + (cropScreenWidth * 2) / 3, cropScreenY);
      overlayCtx.lineTo(cropScreenX + (cropScreenWidth * 2) / 3, cropScreenY + cropScreenHeight);
      
      // Horizontal lines
      overlayCtx.moveTo(cropScreenX, cropScreenY + cropScreenHeight / 3);
      overlayCtx.lineTo(cropScreenX + cropScreenWidth, cropScreenY + cropScreenHeight / 3);
      overlayCtx.moveTo(cropScreenX, cropScreenY + (cropScreenHeight * 2) / 3);
      overlayCtx.lineTo(cropScreenX + cropScreenWidth, cropScreenY + (cropScreenHeight * 2) / 3);
      overlayCtx.stroke();
    }

    // Draw resize handles
    const handleSize = 10;
    overlayCtx.fillStyle = "#fff";
    overlayCtx.strokeStyle = "#000";
    overlayCtx.lineWidth = 1;
    
    const handles = [
      { x: cropScreenX - handleSize / 2, y: cropScreenY - handleSize / 2, cursor: "nw-resize" },
      { x: cropScreenX + cropScreenWidth / 2 - handleSize / 2, y: cropScreenY - handleSize / 2, cursor: "n-resize" },
      { x: cropScreenX + cropScreenWidth - handleSize / 2, y: cropScreenY - handleSize / 2, cursor: "ne-resize" },
      { x: cropScreenX + cropScreenWidth - handleSize / 2, y: cropScreenY + cropScreenHeight / 2 - handleSize / 2, cursor: "e-resize" },
      { x: cropScreenX + cropScreenWidth - handleSize / 2, y: cropScreenY + cropScreenHeight - handleSize / 2, cursor: "se-resize" },
      { x: cropScreenX + cropScreenWidth / 2 - handleSize / 2, y: cropScreenY + cropScreenHeight - handleSize / 2, cursor: "s-resize" },
      { x: cropScreenX - handleSize / 2, y: cropScreenY + cropScreenHeight - handleSize / 2, cursor: "sw-resize" },
      { x: cropScreenX - handleSize / 2, y: cropScreenY + cropScreenHeight / 2 - handleSize / 2, cursor: "w-resize" },
    ];

    handles.forEach((handle) => {
      overlayCtx.fillRect(handle.x, handle.y, handleSize, handleSize);
      overlayCtx.strokeRect(handle.x, handle.y, handleSize, handleSize);
    });

  }, [image, cropBox, zoom, rotation, showGrid, imagePosition]);

  // Redraw on changes
  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  // Handle mouse events for crop box dragging
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!image || !overlayCanvasRef.current) return;

    const canvas = overlayCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const scale = zoom / 100;
    const rotated = Math.abs(rotation) === 90 || Math.abs(rotation) === 270;
    const imgWidth = rotated ? image.height : image.width;
    const imgHeight = rotated ? image.width : image.height;
    const scaledWidth = imgWidth * scale;
    const scaledHeight = imgHeight * scale;
    const imgX = (canvas.width - scaledWidth) / 2 + imagePosition.x;
    const imgY = (canvas.height - scaledHeight) / 2 + imagePosition.y;

    const cropScreenX = (cropBox.x / imgWidth) * scaledWidth + imgX;
    const cropScreenY = (cropBox.y / imgHeight) * scaledHeight + imgY;
    const cropScreenWidth = (cropBox.width / imgWidth) * scaledWidth;
    const cropScreenHeight = (cropBox.height / imgHeight) * scaledHeight;

    // Check if clicking on resize handles
    const handleSize = 15;
    const handles = [
      { name: "nw", x: cropScreenX, y: cropScreenY },
      { name: "n", x: cropScreenX + cropScreenWidth / 2, y: cropScreenY },
      { name: "ne", x: cropScreenX + cropScreenWidth, y: cropScreenY },
      { name: "e", x: cropScreenX + cropScreenWidth, y: cropScreenY + cropScreenHeight / 2 },
      { name: "se", x: cropScreenX + cropScreenWidth, y: cropScreenY + cropScreenHeight },
      { name: "s", x: cropScreenX + cropScreenWidth / 2, y: cropScreenY + cropScreenHeight },
      { name: "sw", x: cropScreenX, y: cropScreenY + cropScreenHeight },
      { name: "w", x: cropScreenX, y: cropScreenY + cropScreenHeight / 2 },
    ];

    for (const handle of handles) {
      if (Math.abs(x - handle.x) < handleSize && Math.abs(y - handle.y) < handleSize) {
        setIsResizing(true);
        setResizeHandle(handle.name);
        setDragStart({ x, y });
        return;
      }
    }

    // Check if clicking inside crop box for dragging
    if (x >= cropScreenX && x <= cropScreenX + cropScreenWidth &&
        y >= cropScreenY && y <= cropScreenY + cropScreenHeight) {
      setIsDragging(true);
      setDragStart({ x: x - cropScreenX, y: y - cropScreenY });
    } else if (x >= imgX && x <= imgX + scaledWidth &&
               y >= imgY && y <= imgY + scaledHeight) {
      // Click on image to move it
      setIsMovingImage(true);
      setImageDragStart({ x: x - imagePosition.x, y: y - imagePosition.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!image || (!isDragging && !isResizing && !isMovingImage)) return;

    const canvas = overlayCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const scale = zoom / 100;
    const rotated = Math.abs(rotation) === 90 || Math.abs(rotation) === 270;
    const imgWidth = rotated ? image.height : image.width;
    const imgHeight = rotated ? image.width : image.height;
    const scaledWidth = imgWidth * scale;
    const scaledHeight = imgHeight * scale;
    const imgX = (canvas.width - scaledWidth) / 2 + imagePosition.x;
    const imgY = (canvas.height - scaledHeight) / 2 + imagePosition.y;

    if (isDragging) {
      const newCropX = (x - dragStart.x - imgX) / scale * imgWidth / scaledWidth;
      const newCropY = (y - dragStart.y - imgY) / scale * imgHeight / scaledHeight;

      let newX = newCropX;
      let newY = newCropY;

      // Constrain to image bounds
      newX = Math.max(0, Math.min(newX, imgWidth - cropBox.width));
      newY = Math.max(0, Math.min(newY, imgHeight - cropBox.height));

      setCropBox((prev) => ({ ...prev, x: newX, y: newY }));
    }

    if (isResizing) {
      const deltaX = (x - dragStart.x) / scale * imgWidth / scaledWidth;
      const deltaY = (y - dragStart.y) / scale * imgHeight / scaledHeight;

      let newCropBox = { ...cropBox };

      switch (resizeHandle) {
        case "nw":
          newCropBox.width -= deltaX;
          newCropBox.height -= deltaY;
          newCropBox.x += deltaX;
          newCropBox.y += deltaY;
          break;
        case "n":
          newCropBox.height -= deltaY;
          newCropBox.y += deltaY;
          break;
        case "ne":
          newCropBox.width += deltaX;
          newCropBox.height -= deltaY;
          newCropBox.y += deltaY;
          break;
        case "e":
          newCropBox.width += deltaX;
          break;
        case "se":
          newCropBox.width += deltaX;
          newCropBox.height += deltaY;
          break;
        case "s":
          newCropBox.height += deltaY;
          break;
        case "sw":
          newCropBox.width -= deltaX;
          newCropBox.height += deltaY;
          newCropBox.x += deltaX;
          break;
        case "w":
          newCropBox.width -= deltaX;
          newCropBox.x += deltaX;
          break;
      }

      // Apply aspect ratio constraint
      if (aspectRatio !== "free" && aspectRatio !== "custom") {
        const ratio = getAspectRatioValue();
        if (ratio) {
          const aspect = ratio.width / ratio.height;
          if (["n", "s"].includes(resizeHandle)) {
            newCropBox.width = newCropBox.height * aspect;
            newCropBox.x = cropBox.x + (cropBox.width - newCropBox.width) / 2;
          } else if (["e", "w"].includes(resizeHandle)) {
            newCropBox.height = newCropBox.width / aspect;
            newCropBox.y = cropBox.y + (cropBox.height - newCropBox.height) / 2;
          } else {
            newCropBox.height = newCropBox.width / aspect;
          }
        }
      }

      // Constrain minimum size
      newCropBox.width = Math.max(50, newCropBox.width);
      newCropBox.height = Math.max(50, newCropBox.height);

      // Constrain to image bounds
      newCropBox.x = Math.max(0, Math.min(newCropBox.x, imgWidth - newCropBox.width));
      newCropBox.y = Math.max(0, Math.min(newCropBox.y, imgHeight - newCropBox.height));

      // Update custom dimensions
      if (aspectRatio === "custom") {
        setCustomWidth(Math.round(newCropBox.width));
        setCustomHeight(Math.round(newCropBox.height));
      }

      setCropBox(newCropBox);
      setDragStart({ x, y });
    }

    if (isMovingImage) {
      const newPosX = x - imageDragStart.x - (canvas.width - scaledWidth) / 2;
      const newPosY = y - imageDragStart.y - (canvas.height - scaledHeight) / 2;
      setImagePosition({ x: newPosX, y: newPosY });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setIsResizing(false);
    setIsMovingImage(false);
    setResizeHandle("");
  };

  // Crop and download
  const handleCrop = useCallback((format: "png" | "jpeg" | "webp") => {
    if (!image) return;

    // Check usage limit
    const usage = consumeServiceUsage("image-cropper");
    if (!usage.ok) {
      toast.error(`Image Cropper limit reached (${usage.used}/${usage.limit})`);
      return;
    }

    // Check download limit
    const download = consumeDownloadUsage();
    if (!download.ok) {
      toast.error(`Download limit reached (${download.used}/${download.limit})`);
      return;
    }

    const cropCanvas = document.createElement("canvas");
    const ctx = cropCanvas.getContext("2d");
    if (!ctx) return;

    // Set output size
    cropCanvas.width = cropBox.width;
    cropCanvas.height = cropBox.height;

    // Apply rotation if needed
    ctx.save();

    if (rotation !== 0) {
      ctx.translate(cropCanvas.width / 2, cropCanvas.height / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.translate(-cropCanvas.width / 2, -cropCanvas.height / 2);
    }

    // Draw cropped portion
    ctx.drawImage(
      image,
      cropBox.x,
      cropBox.y,
      cropBox.width,
      cropBox.height,
      0,
      0,
      cropBox.width,
      cropBox.height
    );

    ctx.restore();

    // Download
    const link = document.createElement("a");
    link.download = `cropped-image.${format}`;

    if (format === "jpeg") {
      link.href = cropCanvas.toDataURL("image/jpeg", 0.92);
    } else if (format === "webp") {
      link.href = cropCanvas.toDataURL("image/webp", 0.92);
    } else {
      link.href = cropCanvas.toDataURL("image/png");
    }

    link.click();
    toast.success(`Image cropped and downloaded as ${format.toUpperCase()}`);
  }, [image, cropBox, rotation]);

  // Handle rotation
  const rotateLeft = () => {
    setRotation((prev) => (prev - 90) % 360);
  };

  const rotateRight = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  // Handle zoom
  const handleZoomChange = (value: number[]) => {
    setZoom(value[0]);
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-7xl mx-auto"
      >
        <div className="mb-6">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Crop className="w-8 h-8" />
            Image Cropper
          </h1>
          <p className="text-muted-foreground mt-1">
            Upload an image and crop it with precise control
          </p>
        </div>

        {!image ? (
          <Card className="max-w-2xl mx-auto">
            <CardContent className="pt-6">
              <div
                className="border-2 border-dashed border-border rounded-lg p-12 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => document.getElementById("crop-upload")?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files[0];
                  if (file) {
                    const input = document.createElement("input");
                    input.type = "file";
                    const dt = new DataTransfer();
                    dt.items.add(file);
                    input.files = dt.files;
                    handleFileUpload({ target: { files: dt.files } } as React.ChangeEvent<HTMLInputElement>);
                  }
                }}
              >
                <Upload className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                <p className="text-lg font-medium mb-2">Click to upload or drag and drop</p>
                <p className="text-sm text-muted-foreground mb-4">Supports JPG, PNG, WebP</p>
                <Input
                  id="crop-upload"
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 lg:grid-cols-4">
            {/* Canvas Area */}
            <div className="lg:col-span-3">
              <Card className="overflow-hidden h-full">
                <CardContent className="p-0 h-full">
                  <div
                    ref={containerRef}
                    className="relative bg-neutral-900 flex items-center justify-center overflow-hidden"
                    style={{ minHeight: "600px", height: "75vh" }}
                  >
                    <canvas
                      ref={canvasRef}
                      className="absolute top-0 left-0"
                      style={{ cursor: isDragging ? "move" : isResizing ? `${resizeHandle}-resize` : isMovingImage ? "move" : "default" }}
                      onMouseDown={handleMouseDown}
                      onMouseMove={handleMouseMove}
                      onMouseUp={handleMouseUp}
                      onMouseLeave={handleMouseUp}
                    />
                    <canvas
                      ref={overlayCanvasRef}
                      className="absolute top-0 left-0 pointer-events-none"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Download Buttons */}
              <div className="flex items-center gap-2 mt-4">
                <Button onClick={() => handleCrop("png")} className="gap-2">
                  <Download className="w-4 h-4" />
                  Download PNG
                </Button>
                <Button variant="outline" onClick={() => handleCrop("jpeg")} className="gap-2">
                  <Download className="w-4 h-4" />
                  Download JPG
                </Button>
                <Button variant="outline" onClick={() => handleCrop("webp")} className="gap-2">
                  <Download className="w-4 h-4" />
                  Download WebP
                </Button>
              </div>
            </div>

            {/* Controls Sidebar */}
            <div className="space-y-4">
              {/* Aspect Ratio */}
              <Card>
                <CardHeader className="py-4">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Maximize className="w-4 h-4" />
                    Aspect Ratio
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    {(["free", "1:1", "4:3", "16:9", "3:2", "custom"] as AspectRatio[]).map((ratio) => (
                      <Button
                        key={ratio}
                        variant={aspectRatio === ratio ? "default" : "outline"}
                        size="sm"
                        onClick={() => setAspectRatio(ratio)}
                        className="text-xs"
                      >
                        {ratio === "free" ? "Free" : ratio}
                      </Button>
                    ))}
                  </div>
                  
                  {aspectRatio === "custom" && (
                    <div className="grid grid-cols-2 gap-2 pt-2">
                      <div>
                        <Label className="text-xs">Width (px)</Label>
                        <Input
                          type="number"
                          value={customWidth}
                          onChange={(e) => {
                            setCustomWidth(Number(e.target.value));
                            setAspectRatio("custom");
                          }}
                          className="h-8 text-sm"
                          min={50}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Height (px)</Label>
                        <Input
                          type="number"
                          value={customHeight}
                          onChange={(e) => {
                            setCustomHeight(Number(e.target.value));
                            setAspectRatio("custom");
                          }}
                          className="h-8 text-sm"
                          min={50}
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Zoom */}
              <Card>
                <CardHeader className="py-4">
                  <CardTitle className="text-base flex items-center gap-2">
                    <ZoomIn className="w-4 h-4" />
                    Zoom
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setZoom((prev) => Math.max(25, prev - 25))}
                    >
                      <ZoomOut className="w-4 h-4" />
                    </Button>
                    <Slider
                      value={[zoom]}
                      onValueChange={handleZoomChange}
                      min={25}
                      max={200}
                      step={5}
                      className="flex-1"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setZoom((prev) => Math.min(200, prev + 25))}
                    >
                      <ZoomIn className="w-4 h-4" />
                    </Button>
                  </div>
                  <p className="text-center text-sm text-muted-foreground">{zoom}%</p>
                </CardContent>
              </Card>

              {/* Rotation */}
              <Card>
                <CardHeader className="py-4">
                  <CardTitle className="text-base flex items-center gap-2">
                    <RotateCcw className="w-4 h-4" />
                    Rotation
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-center gap-2">
                    <Button variant="outline" onClick={rotateLeft} className="gap-2">
                      <RotateCcw className="w-4 h-4" />
                      -90°
                    </Button>
                    <Button variant="outline" onClick={rotateRight} className="gap-2">
                      <RotateCw className="w-4 h-4" />
                      +90°
                    </Button>
                  </div>
                  <p className="text-center text-sm text-muted-foreground">{rotation}°</p>
                </CardContent>
              </Card>

              {/* Grid Toggle */}
              <Card>
                <CardHeader className="py-4">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Grid3X3 className="w-4 h-4" />
                    Grid Overlay
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Button
                    variant={showGrid ? "default" : "outline"}
                    onClick={() => setShowGrid(!showGrid)}
                    className="w-full gap-2"
                  >
                    <Grid3X3 className="w-4 h-4" />
                    {showGrid ? "Hide Grid" : "Show Grid"}
                  </Button>
                </CardContent>
              </Card>

              {/* Reset */}
              <Card>
                <CardContent className="pt-4">
                  <Button
                    variant="outline"
                    onClick={() => resetCropSettings(image.width, image.height)}
                    className="w-full gap-2"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Reset All
                  </Button>
                </CardContent>
              </Card>

              {/* Crop Info */}
              <Card>
                <CardHeader className="py-4">
                  <CardTitle className="text-base">Crop Info</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Width:</span>
                    <Badge variant="outline">{Math.round(cropBox.width)}px</Badge>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Height:</span>
                    <Badge variant="outline">{Math.round(cropBox.height)}px</Badge>
                  </div>
                  <Separator className="my-2" />
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Original:</span>
                    <Badge variant="outline">{image.width} × {image.height}</Badge>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
