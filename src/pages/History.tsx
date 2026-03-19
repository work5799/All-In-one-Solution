import { FileImage, Video, Sparkles, Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { useHistory } from "@/contexts/HistoryContext";
import { toast } from "sonner";
import { consumeDownloadUsage } from "@/lib/memberLimits";

const formatSize = (bytes: number) => {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(2) + " MB";
};

const iconMap = { image: FileImage, video: Video, ai: Sparkles };

export default function History() {
  const { history, clearHistory } = useHistory();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Processing History</h1>
          <p className="text-sm text-muted-foreground mt-1">Your recent file optimization activity</p>
        </div>
        {history.length > 0 && (
          <Button variant="outline" size="sm" onClick={clearHistory}>
            <Trash2 className="h-4 w-4 mr-2" /> Clear History
          </Button>
        )}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-border bg-card shadow-card overflow-hidden"
      >
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">File</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Action</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Size</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Saved</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Date</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {history.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-sm text-muted-foreground">
                    No history found. Try processing some files.
                  </td>
                </tr>
              ) : (
                history.map((item) => {
                  const Icon = iconMap[item.type as keyof typeof iconMap] || FileImage;
                  return (
                    <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                            <Icon className="h-4 w-4 text-primary" />
                          </div>
                          <span className="text-sm font-medium text-card-foreground">{item.name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-muted-foreground">{item.action}</td>
                      <td className="px-5 py-3.5 text-sm text-muted-foreground font-mono">
                        {item.originalSize ? formatSize(item.originalSize) : ""} 
                        {item.optimizedSize ? ` → ${formatSize(item.optimizedSize)}` : ""}
                        {!item.originalSize && !item.optimizedSize ? "—" : ""}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`text-sm font-medium ${item.saved !== "—" ? "text-success" : "text-muted-foreground"}`}>
                          {item.saved !== "—" ? `−${item.saved}` : item.saved}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-muted-foreground">{item.date}</td>
                      <td className="px-5 py-3.5">
                        {(item.url || item.previewUrl) && (
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            onClick={() => {
                              const download = consumeDownloadUsage();
                              if (!download.ok) {
                                toast.error(`Download limit reached (${download.used}/${download.limit})`);
                                return;
                              }
                              const a = document.createElement("a");
                              a.href = item.url || item.previewUrl || "";
                              a.download = item.name;
                              a.click();
                            }}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
}
