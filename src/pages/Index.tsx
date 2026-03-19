import { FileImage, HardDrive, TrendingDown, Clock, Video, Sparkles } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { motion } from "framer-motion";
import { useHistory } from "@/contexts/HistoryContext";

const formatSize = (bytes: number) => {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(2) + " MB";
  return (bytes / 1073741824).toFixed(2) + " GB";
};

const iconMap = { image: FileImage, video: Video, ai: Sparkles };

const Index = () => {
  const { history, stats } = useHistory();
  const recentHistory = history.slice(0, 5);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Overview of your media optimization activity
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Processed"
          value={stats.totalOptimized.toString()}
          icon={FileImage}
        />
        <StatCard
          title="Storage Used"
          value={formatSize(stats.storageUsed)}
          subtitle="processed files"
          icon={HardDrive}
        />
        <StatCard
          title="Total Saved"
          value={formatSize(stats.totalSaved)}
          icon={TrendingDown}
        />
        <StatCard
          title="Avg Time"
          value={stats.avgTime}
          subtitle="per file"
          icon={Clock}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="rounded-xl border border-border bg-card shadow-card"
      >
        <div className="p-5 border-b border-border">
          <h2 className="text-base font-semibold text-card-foreground">Recent Activity</h2>
        </div>
        <div className="divide-y divide-border">
          {recentHistory.length === 0 ? (
            <div className="p-5 text-center text-sm text-muted-foreground">
              No recent activity. Try optimizing some files!
            </div>
          ) : (
            recentHistory.map((item, i) => {
              const Icon = iconMap[item.type as keyof typeof iconMap] || FileImage;
              return (
                <div key={i} className="flex items-center justify-between px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-card-foreground">{item.name}</p>
                      <p className="text-xs text-muted-foreground">{item.action}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-success">
                      {item.saved !== "—" ? `−${item.saved}` : item.saved}
                    </p>
                    <p className="text-xs text-muted-foreground">{item.date}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default Index;
