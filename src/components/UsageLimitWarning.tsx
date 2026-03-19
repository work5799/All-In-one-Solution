import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import type { ServiceKey } from "@/lib/memberLimitsEnhanced";

interface UsageLimitWarningProps {
  service: ServiceKey;
  usage: number;
  limit: number;
  remaining: number;
  percentageUsed: number;
  isLimitReached: boolean;
  compact?: boolean;
}

export function UsageLimitWarning({
  service,
  usage,
  limit,
  remaining,
  percentageUsed,
  isLimitReached,
  compact = false,
}: UsageLimitWarningProps) {
  if (limit === 0) {
    // Limits disabled
    return null;
  }

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <Badge variant={isLimitReached ? "destructive" : "outline"}>
          {usage}/{limit}
        </Badge>
        <span className="text-muted-foreground">{remaining} remaining</span>
      </div>
    );
  }

  return (
    <Alert className={isLimitReached ? "border-red-500/50 bg-red-500/10" : "border-blue-500/20 bg-blue-500/5"}>
      {isLimitReached ? (
        <AlertCircle className="h-4 w-4 text-red-500" />
      ) : (
        <CheckCircle2 className="h-4 w-4 text-blue-500" />
      )}
      <AlertDescription className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-medium">
            {isLimitReached ? "Daily Limit Reached" : "Daily Usage"}
          </span>
          <Badge variant={isLimitReached ? "destructive" : "secondary"}>
            {usage}/{limit}
          </Badge>
        </div>
        <Progress value={percentageUsed} className="h-2" />
        <p className="text-xs text-muted-foreground">
          {remaining} {remaining === 1 ? "use" : "uses"} remaining today
        </p>
      </AlertDescription>
    </Alert>
  );
}

export default UsageLimitWarning;
