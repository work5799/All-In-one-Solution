import { useState, useCallback } from "react";
import { DropZone } from "@/components/DropZone";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Palette, 
  Download, 
  Trash2, 
  Upload, 
  ImageIcon,
  CheckCircle2,
  RotateCcw,
  Eye,
  EyeOff,
  Layers,
  Droplet,
} from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { consumeServiceUsage, consumeDownloadUsage } from "@/lib/memberLimits";

interface LogoFile {
  id: string;
  file: File;
  preview: string;
  processedPreview?: string;
  status: "pending" | "processed" | "error";
  errorMsg?: string;
}

const PRESET_COLORS = [
  { name: "Black", value: "#000000" },
  { name: "White", value: "#ffffff" },
  { name: "Red", value: "#ff0000" },
  { name: "Blue", value: "#0066ff" },
  { name: "Green", value: "#00cc66" },
  { name: "Yellow", value: "#ffcc00" },
  { name: "Orange", value: "#ff6600" },
  { name: "Purple", value: "#9933ff" },
  { name: "Pink", value: "#ff66b2" },
  { name: "Cyan", value: "#00cccc" },
  { name: "Gold", value: "#ffd700" },
  { name: "Silver", value: "#c0c0c0" },
];

export default function LogoColorChanger() {
  const [logos, setLogos] = useState<LogoFile[]>([]);
  const [selectedColor, setSelectedColor] = useState("#000000");
  const [customColor, setCustomColor] = useState("#000000");
  const [opacity, setOpacity] = useState(100);
  const [showOriginal, setShowOriginal] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [outputFormat, setOutputFormat] = useState<"png" | "jpg" | "webp">("png");

  // Handle logo upload
  const handleLogoUpload = useCallback((newFiles: File[]) => {
    const imageFiles = newFiles.filter((f) => f.type.startsWith("image/"));
    
    if (imageFiles.length === 0) {
      toast.error("Please upload image files only");
      return;
    }

    const newLogos: LogoFile[] = imageFiles.map((file) => ({
      id: crypto.randomUUID(),
      file,
      preview: URL.createObjectURL(file),
      status: "pending" as const,
    }));

    setLogos((prev) => [...prev, ...newLogos]);
    toast.success(`${imageFiles.length} logo(s) uploaded`);
  }, []);

  // Remove logo
  const removeLogo = (id: string) => {
    setLogos((prev) => {
      const logo = prev.find((l) => l.id === id);
      if (logo?.preview) URL.revokeObjectURL(logo.preview);
      if (logo?.processedPreview) URL.revokeObjectURL(logo.processedPreview);
      return prev.filter((l) => l.id !== id);
    });
  };

  // Clear all logos
  const clearAllLogos = () => {
    logos.forEach((logo) => {
      if (logo.preview) URL.revokeObjectURL(logo.preview);
      if (logo.processedPreview) URL.revokeObjectURL(logo.processedPreview);
    });
    setLogos([]);
  };

  // Convert color to solid color with opacity
  const applySolidColor = async (logo: LogoFile, format: string = outputFormat): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext("2d");
          
          if (!ctx) {
            reject("Canvas context not available");
            return;
          }

          // For JPG, fill background with white (no transparency support)
          if (format === "jpg") {
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          }

          // Clear canvas
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          // Parse the selected color
          const hex = selectedColor.replace("#", "");
          const r = parseInt(hex.substring(0, 2), 16);
          const g = parseInt(hex.substring(2, 4), 16);
          const b = parseInt(hex.substring(4, 6), 16);

          // Create image data
          const imageData = ctx.createImageData(canvas.width, canvas.height);
          const data = imageData.data;

          // Draw original image to get alpha channel
          ctx.drawImage(img, 0, 0);
          const originalData = ctx.getImageData(0, 0, canvas.width, canvas.height);

          // Apply solid color while preserving alpha channel
          for (let i = 0; i < data.length; i += 4) {
            const alpha = originalData.data[i + 3] / 255; // Get original alpha
            
            // Apply solid color with opacity
            data[i] = r;     // Red
            data[i + 1] = g; // Green
            data[i + 2] = b; // Blue
            data[i + 3] = alpha * (opacity / 100) * 255; // Apply opacity
          }

          ctx.putImageData(imageData, 0, 0);

          // Convert to blob URL based on format
          const mimeType = format === "jpg" ? "image/jpeg" : format === "webp" ? "image/webp" : "image/png";
          const extension = format === "jpg" ? "jpg" : format === "webp" ? "webp" : "png";
          
          canvas.toBlob((blob) => {
            if (blob) {
              resolve(URL.createObjectURL(blob));
            } else {
              reject("Failed to create blob");
            }
          }, mimeType, 0.95);
        } catch (error) {
          reject(error);
        }
      };
      
      img.onerror = () => reject("Failed to load image");
      img.src = logo.preview;
    });
  };

  // Process all logos
  const handleProcessAll = async () => {
    if (logos.length === 0) {
      toast.warning("Please upload a logo first");
      return;
    }

    const usage = consumeServiceUsage("image-optimizer");
    if (!usage.ok) {
      toast.error(`Limit reached (${usage.used}/${usage.limit})`);
      return;
    }

    setProcessing(true);

    try {
      const updatedLogos = await Promise.all(
        logos.map(async (logo) => {
          try {
            const processedPreview = await applySolidColor(logo);
            return { ...logo, processedPreview, status: "processed" as const };
          } catch (error: any) {
            toast.error(`Failed to process ${logo.file.name}`);
            return { ...logo, status: "error" as const, errorMsg: error.message };
          }
        })
      );

      setLogos(updatedLogos);
      toast.success("All logos processed!");
    } catch (error) {
      toast.error("Processing failed");
    } finally {
      setProcessing(false);
    }
  };

  // Download processed logo
  const downloadLogo = (logo: LogoFile, format?: string) => {
    if (!logo.processedPreview) return;

    const download = consumeDownloadUsage();
    if (!download.ok) {
      toast.error(`Download limit reached (${download.used}/${download.limit})`);
      return;
    }

    const a = document.createElement("a");
    a.href = logo.processedPreview;
    const downloadFormat = format || outputFormat;
    const baseName = logo.file.name.replace(/\.\w+$/, "");
    a.download = `colored_${baseName}.${downloadFormat}`;
    a.click();
  };

  // Download all logos
  const downloadAll = async () => {
    const processed = logos.filter((l) => l.status === "processed");
    if (processed.length === 0) {
      toast.warning("No processed logos to download");
      return;
    }

    for (const logo of processed) {
      downloadLogo(logo);
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  };

  // Update color from preset or custom
  const handleColorSelect = (color: string) => {
    setSelectedColor(color);
    setCustomColor(color);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <Palette className="h-6 w-6 text-primary" />
          </div>
          Logo Color Changer
        </h1>
        <p className="text-muted-foreground mt-1">
          Convert any logo to a solid color with adjustable opacity
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Settings Panel */}
        <div className="space-y-4 lg:col-span-1">
          {/* Color Selection */}
          <Card className="border-2 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Droplet className="h-4 w-4" />
                Select Color
              </CardTitle>
              <CardDescription>Choose a solid color for your logo</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Preset Colors */}
              <div>
                <Label className="text-sm font-medium mb-2 block">Preset Colors</Label>
                <div className="grid grid-cols-6 gap-2">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color.value}
                      onClick={() => handleColorSelect(color.value)}
                      className={`aspect-square rounded-lg border-2 transition-all hover:scale-110 ${
                        selectedColor === color.value
                          ? "border-primary ring-2 ring-primary/30"
                          : "border-border"
                      }`}
                      style={{ backgroundColor: color.value }}
                      title={color.name}
                    />
                  ))}
                </div>
              </div>

              {/* Custom Color */}
              <div>
                <Label className="text-sm font-medium mb-2 block">Custom Color</Label>
                <div className="flex items-center gap-3">
                  <Input
                    type="color"
                    value={customColor}
                    onChange={(e) => handleColorSelect(e.target.value)}
                    className="w-16 h-10 rounded-md border border-border"
                  />
                  <Input
                    type="text"
                    value={customColor}
                    onChange={(e) => handleColorSelect(e.target.value)}
                    placeholder="#000000"
                    className="flex-1 font-mono"
                  />
                </div>
              </div>

              <Separator />

              {/* Opacity Control */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium flex items-center gap-2">
                    <Layers className="h-4 w-4" />
                    Opacity
                  </Label>
                  <Badge variant="outline" className="font-mono">
                    {opacity}%
                  </Badge>
                </div>
                <Slider
                  value={[opacity]}
                  onValueChange={([v]) => setOpacity(v)}
                  min={0}
                  max={100}
                  step={1}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Transparent</span>
                  <span>Solid</span>
                </div>
              </div>

              <Separator />

              {/* Output Format */}
              <div className="space-y-3">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Download className="h-4 w-4" />
                  Output Format
                </Label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setOutputFormat("png")}
                    className={`py-2.5 rounded-lg text-sm font-medium border transition-all ${
                      outputFormat === "png"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-secondary text-secondary-foreground hover:bg-secondary/80"
                    }`}
                  >
                    PNG
                  </button>
                  <button
                    onClick={() => setOutputFormat("jpg")}
                    className={`py-2.5 rounded-lg text-sm font-medium border transition-all ${
                      outputFormat === "jpg"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-secondary text-secondary-foreground hover:bg-secondary/80"
                    }`}
                  >
                    JPG
                  </button>
                  <button
                    onClick={() => setOutputFormat("webp")}
                    className={`py-2.5 rounded-lg text-sm font-medium border transition-all ${
                      outputFormat === "webp"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-secondary text-secondary-foreground hover:bg-secondary/80"
                    }`}
                  >
                    WebP
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {outputFormat === "jpg" 
                    ? "JPG: No transparency, white background" 
                    : outputFormat === "png"
                    ? "PNG: Supports transparency (recommended)"
                    : "WebP: Modern format, smaller file size"
                  }
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <Card className="border-2 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                onClick={handleProcessAll}
                disabled={logos.length === 0 || processing}
                className="w-full gap-2"
                size="lg"
              >
                {processing ? (
                  <>
                    <RotateCcw className="h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Palette className="h-4 w-4" />
                    Apply Color to All Logos
                  </>
                )}
              </Button>

              <Button
                onClick={downloadAll}
                disabled={!logos.some((l) => l.status === "processed")}
                variant="outline"
                className="w-full gap-2"
              >
                <Download className="h-4 w-4" />
                Download All
              </Button>

              <Button
                onClick={clearAllLogos}
                disabled={logos.length === 0}
                variant="destructive"
                className="w-full gap-2"
              >
                <Trash2 className="h-4 w-4" />
                Clear All
              </Button>
            </CardContent>
          </Card>

          {/* Preview Toggle */}
          <Card className="border-2 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Eye className="h-4 w-4" />
                Preview Mode
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Button
                onClick={() => setShowOriginal(!showOriginal)}
                variant={showOriginal ? "default" : "outline"}
                className="w-full gap-2"
              >
                {showOriginal ? (
                  <>
                    <EyeOff className="h-4 w-4" />
                    Show Processed
                  </>
                ) : (
                  <>
                    <Eye className="h-4 w-4" />
                    Show Original
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Logo Grid */}
        <div className="lg:col-span-2">
          <Card className="border-2 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <ImageIcon className="h-4 w-4" />
                    Logos
                  </CardTitle>
                  <CardDescription>
                    Upload logos to convert to solid color
                    {logos.length > 0 && ` (${logos.length} uploaded)`}
                  </CardDescription>
                </div>
                <Badge variant="outline">
                  Color: <span className="ml-1 font-mono">{selectedColor}</span>
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* DropZone */}
              <DropZone
                onFiles={handleLogoUpload}
                accept="image/*"
                multiple
              >
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm font-medium">Drop logos here or click to upload</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Supports: PNG, JPG, JPEG, WebP, GIF
                  </p>
                </div>
              </DropZone>

              {/* Logo Grid */}
              {logos.length > 0 ? (
                <div className="pt-2">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 max-h-[400px] overflow-y-auto pr-2">
                    {logos.map((logo) => (
                      <motion.div
                        key={logo.id}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="relative group rounded-xl border bg-card overflow-hidden"
                      >
                        {/* Preview */}
                        <div className="aspect-square relative bg-[url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAHUlEQVQ4jWNgYGAQIYAJglEDoAwG1gFwGgwwGjAw0A8AAwBZ7wWbQd3gOAAAAABJRU5ErkJggg==')] bg-repeat">
                          <img
                            src={showOriginal ? logo.preview : logo.processedPreview || logo.preview}
                            alt={logo.file.name}
                            className="w-full h-full object-contain p-4"
                          />
                          
                          {/* Status Badge */}
                          {logo.status === "processed" && (
                            <Badge className="absolute top-2 right-2 bg-green-500 text-xs">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Processed
                            </Badge>
                          )}
                          {logo.status === "error" && (
                            <Badge variant="destructive" className="absolute top-2 right-2 text-xs">
                              Error
                            </Badge>
                          )}
                        </div>

                        {/* Info */}
                        <div className="p-3 border-t">
                          <p className="text-xs font-medium truncate" title={logo.file.name}>
                            {logo.file.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {logo.status === "processed" ? "Ready to download" : logo.status}
                          </p>
                        </div>

                        {/* Actions */}
                        <div className="absolute top-2 left-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => removeLogo(logo.id)}
                            className="h-7 w-7 p-0"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>

                        {/* Download Button */}
                        {logo.status === "processed" && (
                          <div className="absolute bottom-14 right-2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              size="sm"
                              onClick={() => downloadLogo(logo, "png")}
                              className="h-7 w-7 p-0"
                              title="Download as PNG"
                            >
                              <span className="text-xs font-bold">P</span>
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => downloadLogo(logo, "jpg")}
                              className="h-7 w-7 p-0"
                              title="Download as JPG"
                            >
                              <span className="text-xs font-bold">J</span>
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => downloadLogo(logo, "webp")}
                              className="h-7 w-7 p-0"
                              title="Download as WebP"
                            >
                              <span className="text-xs font-bold">W</span>
                            </Button>
                          </div>
                        )}
                      </motion.div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="rounded-full bg-muted p-5 mb-3">
                    <ImageIcon className="h-10 w-10 text-muted-foreground" />
                  </div>
                  <p className="font-medium">No logos uploaded yet</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Upload a logo to get started
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Info Card */}
      <Card className="border-2 shadow-sm bg-muted/30 mt-6">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <Palette className="h-5 w-5 text-primary mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium">How it works</p>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• Upload any logo (PNG with transparency works best)</li>
                <li>• Select a solid color from presets or custom color</li>
                <li>• Adjust opacity to make it more transparent</li>
                <li>• Click "Apply Color" to process all logos</li>
                <li>• Download the colorized logos</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Separator component
const Separator = ({ className }: { className?: string }) => (
  <div className={`border-t border-border my-4 ${className || ""}`} />
);
