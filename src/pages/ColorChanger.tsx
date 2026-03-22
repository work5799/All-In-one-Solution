import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  Upload,
  Download,
  Undo2,
  Redo2,
  RotateCcw,
  Palette,
  Brush,
  Eraser,
  ImageIcon,
  Check,
  X,
} from "lucide-react";

interface HistoryState {
  imageData: ImageData;
}

export default function ColorChanger() {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [originalImageData, setOriginalImageData] = useState<ImageData | null>(null);
  const [editedImageData, setEditedImageData] = useState<ImageData | null>(null);
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [brushSize, setBrushSize] = useState(30);
  const [opacity, setOpacity] = useState(50);
  const defaultColor = "#ff0000";
  const [selectedColor, setSelectedColor] = useState(defaultColor);
  const [hexInput, setHexInput] = useState(defaultColor);
  const [mode, setMode] = useState<"full" | "brush">("full");
  const [brushMode, setBrushMode] = useState<"color" | "eraser">("color");
  const [isDrawing, setIsDrawing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Initialize canvas when image loads
  useEffect(() => {
    if (image && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      canvas.width = image.width;
      canvas.height = image.height;
      ctx.drawImage(image, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      setOriginalImageData(imageData);
      setEditedImageData(imageData);
      
      // Save initial state to history
      const initialState: HistoryState = { imageData: imageData };
      setHistory([initialState]);
      setHistoryIndex(0);
    }
  }, [image]);

  // Draw image when editedImageData changes
  useEffect(() => {
    if (editedImageData && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.putImageData(editedImageData, 0, 0);
      }
    }
  }, [editedImageData]);

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
        setHistory([]);
        setHistoryIndex(-1);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Save to history
  const saveToHistory = useCallback((imageData: ImageData) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push({ imageData: imageData });
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [history, historyIndex]);

  // Apply color to entire image (simple color replacement)
  const applyFullImageColor = useCallback(() => {
    if (!originalImageData || !canvasRef.current) {
      toast.error("No image loaded");
      return;
    }
    
    setIsProcessing(true);
    
    try {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        toast.error("Canvas not available");
        setIsProcessing(false);
        return;
      }

      console.log("Original image data:", originalImageData);
      console.log("Selected color:", selectedColor);

      const activeColor = selectedColor || defaultColor;
      const color = hexToRgb(activeColor);
      console.log("Parsed color:", color);

      const newImageData = new ImageData(
        new Uint8ClampedArray(originalImageData.data),
        originalImageData.width,
        originalImageData.height
      );

      console.log("Created new image data, processing pixels...");

      let processedPixels = 0;
      for (let i = 0; i < newImageData.data.length; i += 4) {
        const alpha = newImageData.data[i + 3];
        
        if (alpha > 0) {
          // Simply replace with selected color
          newImageData.data[i] = color.r;
          newImageData.data[i + 1] = color.g;
          newImageData.data[i + 2] = color.b;
          // Keep original alpha (shape preserved)
          processedPixels++;
        }
        // Transparent pixels remain unchanged
      }

      console.log("Processed", processedPixels, "pixels");

      setEditedImageData(newImageData);
      saveToHistory(newImageData);
      toast.success("Color applied to logo");
    } catch (error) {
      console.error("Error applying color:", error);
      toast.error(`Failed to apply color: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  }, [originalImageData, selectedColor, saveToHistory]);

  // Apply color at position (brush mode)
  const applyColorAtPosition = useCallback((x: number, y: number) => {
    if (!editedImageData || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx || !originalImageData) return;

    // Create a new ImageData from the current state
    const newImageData = new ImageData(
      new Uint8ClampedArray(editedImageData.data),
      editedImageData.width,
      editedImageData.height
    );

    const activeColor = selectedColor || defaultColor;
    const color = hexToRgb(activeColor);
    const intensity = opacity / 100;
    const radius = brushSize;

    // Get original pixel data for eraser
    const originalData = originalImageData.data;

    for (let py = y - radius; py <= y + radius; py++) {
      for (let px = x - radius; px <= x + radius; px++) {
        if (px < 0 || px >= canvas.width || py < 0 || py >= canvas.height) continue;
        
        const distance = Math.sqrt((px - x) ** 2 + (py - y) ** 2);
        if (distance > radius) continue;

        const alpha = 1 - (distance / radius);
        const idx = (py * canvas.width + px) * 4;

        if (brushMode === "eraser") {
          // Restore original pixel
          newImageData.data[idx] = originalData[idx];
          newImageData.data[idx + 1] = originalData[idx + 1];
          newImageData.data[idx + 2] = originalData[idx + 2];
          newImageData.data[idx + 3] = originalData[idx + 3];
        } else {
          const r = newImageData.data[idx];
          const g = newImageData.data[idx + 1];
          const b = newImageData.data[idx + 2];
          const blend = intensity * alpha;

          newImageData.data[idx] = Math.round(r * (1 - blend) + color.r * blend);
          newImageData.data[idx + 1] = Math.round(g * (1 - blend) + color.g * blend);
          newImageData.data[idx + 2] = Math.round(b * (1 - blend) + color.b * blend);
          // alpha unchanged to preserve transparency
        }
      }
    }

    setEditedImageData(newImageData);
  }, [editedImageData, originalImageData, selectedColor, opacity, brushSize, brushMode]);

  // Handle mouse events for brush
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (mode !== "brush" || !canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;
    const x = Math.floor((e.clientX - rect.left) * scaleX);
    const y = Math.floor((e.clientY - rect.top) * scaleY);
    
    setIsDrawing(true);
    applyColorAtPosition(x, y);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || mode !== "brush" || !canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;
    const x = Math.floor((e.clientX - rect.left) * scaleX);
    const y = Math.floor((e.clientY - rect.top) * scaleY);
    
    applyColorAtPosition(x, y);
  };

  const handleMouseUp = () => {
    if (isDrawing && mode === "brush" && editedImageData) {
      saveToHistory(editedImageData);
    }
    setIsDrawing(false);
  };

  // Undo
  const handleUndo = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setEditedImageData(history[newIndex].imageData);
    }
  };

  // Redo
  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setEditedImageData(history[newIndex].imageData);
    }
  };

  // Reset
  const handleReset = () => {
    if (originalImageData) {
      setEditedImageData(originalImageData);
      saveToHistory(originalImageData);
      toast.success("Image reset to original");
    }
  };

  // Download
  const handleDownload = (format: "png" | "jpeg" | "webp") => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const link = document.createElement("a");
    link.download = `color-changed-image.${format}`;
    
    if (format === "jpeg") {
      link.href = canvas.toDataURL("image/jpeg", 0.9);
    } else if (format === "webp") {
      link.href = canvas.toDataURL("image/webp", 0.9);
    } else {
      link.href = canvas.toDataURL("image/png");
    }
    
    link.click();
    toast.success(`Image downloaded as ${format.toUpperCase()}`);
  };

  // Convert hex to RGB
  function hexToRgb(hex: string) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 255, g: 0, b: 0 };
  }

  // Sync color picker and hex input
  const handleColorChange = (color: string) => {
    setSelectedColor(color);
    setHexInput(color);
  };

  const handleHexChange = (hex: string) => {
    if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
      setSelectedColor(hex);
      setHexInput(hex);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-2.5">
            <Palette className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Color Changer</h1>
            <p className="text-sm text-muted-foreground">Change colors in your images</p>
          </div>
        </div>
        
        {image && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleUndo}
              disabled={historyIndex <= 0}
            >
              <Undo2 className="w-4 h-4 mr-1" />
              Undo
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRedo}
              disabled={historyIndex >= history.length - 1}
            >
              <Redo2 className="w-4 h-4 mr-1" />
              Redo
            </Button>
            <Button variant="outline" size="sm" onClick={handleReset}>
              <RotateCcw className="w-4 h-4 mr-1" />
              Reset
            </Button>
          </div>
        )}
      </div>

      {!image ? (
        // Upload State
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-20"
        >
          <div className="rounded-full bg-primary/10 p-8 mb-6">
            <ImageIcon className="h-16 w-16 text-primary" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Upload an Image</h2>
          <p className="text-muted-foreground mb-6 text-center max-w-md">
            Upload a JPG, PNG, or WebP image to start changing colors
          </p>
          <Button onClick={() => fileInputRef.current?.click()} className="gap-2">
            <Upload className="w-4 h-4" />
            Choose Image
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileUpload}
            className="hidden"
          />
          
        </motion.div>
      ) : (
        // Editor State
        <div className="grid gap-6 lg:grid-cols-4">
          {/* Canvas Area */}
          <div className="lg:col-span-3">
            <Card className="overflow-hidden">
              <CardContent className="p-0">
                <div 
                  ref={containerRef}
                  className="relative bg-muted/30 flex items-center justify-center overflow-auto"
                  style={{ minHeight: "500px", maxHeight: "70vh" }}
                >
                  <canvas
                    ref={canvasRef}
                    className={`max-w-full max-h-[70vh] object-contain cursor-${mode === "brush" ? (brushMode === "eraser" ? "crosshair" : "crosshair") : "default"}`}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Download Buttons */}
            <div className="flex items-center gap-2 mt-4">
              <Button onClick={() => handleDownload("png")} className="gap-2">
                <Download className="w-4 h-4" />
                Download PNG
              </Button>
              <Button variant="outline" onClick={() => handleDownload("jpeg")} className="gap-2">
                <Download className="w-4 h-4" />
                Download JPG
              </Button>
              <Button variant="outline" onClick={() => handleDownload("webp")} className="gap-2">
                <Download className="w-4 h-4" />
                Download WebP
              </Button>
            </div>
          </div>

          {/* Controls Sidebar */}
          <div className="space-y-4">
            {/* Mode Selection */}
            <Card>
              <CardHeader className="py-4">
                <CardTitle className="text-base">Editing Mode</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  variant={mode === "full" ? "default" : "outline"}
                  className="w-full justify-start gap-2"
                  onClick={() => setMode("full")}
                >
                  <Palette className="w-4 h-4" />
                  Full Image
                </Button>
                <Button
                  variant={mode === "brush" ? "default" : "outline"}
                  className="w-full justify-start gap-2"
                  onClick={() => setMode("brush")}
                >
                  <Brush className="w-4 h-4" />
                  Brush Mode
                </Button>
              </CardContent>
            </Card>

            {/* Color Selection */}
            <Card>
              <CardHeader className="py-4">
                <CardTitle className="text-base">Color</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <Input
                    type="color"
                    value={selectedColor}
                    onChange={(e) => handleColorChange(e.target.value)}
                    className="w-12 h-12 p-1 cursor-pointer"
                  />
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs">HEX Code</Label>
                    <Input
                      value={hexInput}
                      onChange={(e) => setHexInput(e.target.value)}
                      onBlur={(e) => handleHexChange(e.target.value)}
                      placeholder="#FF0000"
                      className="font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-5 gap-2">
                  {["#ff0000", "#00bcd4", "#4caf50", "#ff9800", "#9c27b0"].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => handleColorChange(preset)}
                      className={`h-10 rounded-lg border-2 ${selectedColor === preset ? "border-black" : "border-transparent"}`}
                      style={{ backgroundColor: preset }}
                      aria-label={`Select ${preset}`}
                    />
                  ))}
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      setSelectedColor(defaultColor);
                      setHexInput(defaultColor);
                    }}
                  >
                    Reset to default color
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Brush Controls (only show in brush mode) */}
            {mode === "brush" && (
              <Card>
                <CardHeader className="py-4">
                  <CardTitle className="text-base">Brush Tools</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <Button
                      variant={brushMode === "color" ? "default" : "outline"}
                      size="sm"
                      className="flex-1 gap-2"
                      onClick={() => setBrushMode("color")}
                    >
                      <Brush className="w-4 h-4" />
                      Color
                    </Button>
                    <Button
                      variant={brushMode === "eraser" ? "default" : "outline"}
                      size="sm"
                      className="flex-1 gap-2"
                      onClick={() => setBrushMode("eraser")}
                    >
                      <Eraser className="w-4 h-4" />
                      Eraser
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <Label className="text-xs">Brush Size</Label>
                      <span className="text-xs text-muted-foreground">{brushSize}px</span>
                    </div>
                    <Slider
                      value={[brushSize]}
                      onValueChange={([v]) => setBrushSize(v)}
                      min={5}
                      max={100}
                      step={1}
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Intensity/Opacity */}
            <Card>
              <CardHeader className="py-4">
                <CardTitle className="text-base">
                  {mode === "brush" ? "Brush Intensity" : "Color Intensity"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between">
                  <Label className="text-xs">Opacity</Label>
                  <span className="text-xs text-muted-foreground">{opacity}%</span>
                </div>
                <Slider
                  value={[opacity]}
                  onValueChange={([v]) => setOpacity(v)}
                  min={0}
                  max={100}
                  step={1}
                />
              </CardContent>
            </Card>

            {/* Apply Button (for full image mode) */}
            {mode === "full" && (
              <Button 
                className="w-full gap-2" 
                onClick={applyFullImageColor}
                disabled={isProcessing}
              >
                {isProcessing ? "Processing..." : "Apply Color"}
              </Button>
            )}

            {/* Upload New Image */}
            <Button 
              variant="outline" 
              className="w-full gap-2"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-4 h-4" />
              Upload New Image
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>
        </div>
      )}
    </div>
  );
}
