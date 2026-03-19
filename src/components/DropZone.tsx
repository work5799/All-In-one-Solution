import { useCallback, useState } from "react";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";

interface DropZoneProps {
  accept: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  label?: string;
  sublabel?: string;
}

export function DropZone({ accept, multiple = true, onFiles, label, sublabel }: DropZoneProps) {
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length) onFiles(files);
    },
    [onFiles]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length) onFiles(files);
      e.target.value = "";
    },
    [onFiles]
  );

  return (
    <label
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 transition-colors",
        dragOver
          ? "border-primary bg-primary/5"
          : "border-border hover:border-primary/50 hover:bg-muted/50"
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 mb-3">
        <Upload className="h-5 w-5 text-primary" />
      </div>
      <p className="text-sm font-medium text-foreground">
        {label || "Drag & drop files here"}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {sublabel || "or click to browse"}
      </p>
      <input
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleChange}
        className="hidden"
      />
    </label>
  );
}
