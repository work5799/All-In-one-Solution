import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  checkServiceUsageAllowed,
  consumeServiceUsage,
  getMemberLimitsConfig,
  getMemberLimits,
  getMemberUsage,
  getCurrentUserId,
  type ServiceKey,
  type LimitResult,
} from "@/lib/memberLimitsEnhanced";

interface UseUsageLimitOptions {
  service: ServiceKey;
  onLimitReached?: () => void;
  showToast?: boolean;
}

interface UseUsageLimitReturn {
  checkUsage: () => LimitResult;
  consumeUsage: (amount?: number) => LimitResult;
  isLimitReached: boolean;
  usage: number;
  limit: number;
  remaining: number;
  percentageUsed: number;
  isLoading: boolean;
  refreshUsage: () => void;
}

/**
 * Hook to check and consume usage limits for a service
 * Automatically shows toast when limit is reached
 */
export function useUsageLimit({
  service,
  onLimitReached,
  showToast = true,
}: UseUsageLimitOptions): UseUsageLimitReturn {
  const [usage, setUsage] = useState(0);
  const [limit, setLimit] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [percentageUsed, setPercentageUsed] = useState(0);
  const [isLimitReached, setIsLimitReached] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const loadUsage = useCallback(() => {
    const config = getMemberLimitsConfig();
    
    // If limits are disabled, return unlimited
    if (!config.enabled) {
      setUsage(0);
      setLimit(0);
      setRemaining(0);
      setPercentageUsed(0);
      setIsLimitReached(false);
      setIsLoading(false);
      return;
    }

    const limits = getMemberLimits();
    const memberUsage = getMemberUsage();
    
    const currentLimit = limits.serviceLimits[service];
    const currentUsage = memberUsage.serviceUsage[service];
    const currentRemaining = Math.max(0, currentLimit - currentUsage);
    const currentPercentage = currentLimit > 0
      ? Math.round((currentUsage / currentLimit) * 100)
      : 0;

    setUsage(currentUsage);
    setLimit(currentLimit);
    setRemaining(currentRemaining);
    setPercentageUsed(currentPercentage);
    setIsLimitReached(currentUsage >= currentLimit);
    setIsLoading(false);
  }, [service]);

  useEffect(() => {
    loadUsage();
  }, [loadUsage]);

  const checkUsage = useCallback((): LimitResult => {
    const result = checkServiceUsageAllowed(service);
    return result;
  }, [service]);

  const consumeUsage = useCallback((amount = 1): LimitResult => {
    const result = consumeServiceUsage(service, amount);
    
    // Reload usage after consuming
    loadUsage();

    // Show toast if limit reached
    if (!result.ok && showToast) {
      toast.error(
        "Daily Limit Reached",
        {
          description: "You have reached your daily limit. Please try again tomorrow.",
        }
      );
      onLimitReached?.();
    }

    return result;
  }, [service, showToast, onLimitReached, loadUsage]);

  return {
    checkUsage,
    consumeUsage,
    isLimitReached,
    usage,
    limit,
    remaining,
    percentageUsed,
    isLoading,
    refreshUsage: loadUsage,
  };
}

/**
 * Hook to check download limits
 */
export function useDownloadLimit(options?: { showToast?: boolean }) {
  const showToast = options?.showToast ?? true;
  const [usage, setUsage] = useState(0);
  const [limit, setLimit] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [isLimitReached, setIsLimitReached] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const loadUsage = useCallback(() => {
    const config = getMemberLimitsConfig();
    
    if (!config.enabled) {
      setUsage(0);
      setLimit(0);
      setRemaining(0);
      setIsLimitReached(false);
      setIsLoading(false);
      return;
    }

    const limits = getMemberLimits();
    const memberUsage = getMemberUsage();
    
    setUsage(memberUsage.downloads);
    setLimit(limits.downloadLimit);
    setRemaining(Math.max(0, limits.downloadLimit - memberUsage.downloads));
    setIsLimitReached(memberUsage.downloads >= limits.downloadLimit);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadUsage();
  }, [loadUsage]);

  const consumeDownload = useCallback((amount = 1): boolean => {
    const limits = getMemberLimits();
    const memberUsage = getMemberUsage();
    
    if (memberUsage.downloads + amount > limits.downloadLimit) {
      if (showToast) {
        toast.error("Download Limit Reached", {
          description: "You have reached your daily download limit.",
        });
      }
      return false;
    }

    // Update usage
    memberUsage.downloads += amount;
    localStorage.setItem(
      `imgopt_member_usage_${getCurrentUserId()}`,
      JSON.stringify(memberUsage)
    );
    
    loadUsage();
    return true;
  }, [showToast, loadUsage]);

  return {
    isLimitReached,
    usage,
    limit,
    remaining,
    isLoading,
    consumeDownload,
    refreshUsage: loadUsage,
  };
}
