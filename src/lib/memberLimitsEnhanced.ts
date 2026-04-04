/**
 * Enhanced Member Limits System with Daily Tracking and Automatic Reset
 */

export const MEMBER_LIMITS_KEY = "imgopt_member_limits";
const MEMBER_USAGE_KEY_PREFIX = "imgopt_member_usage_";
const USER_KEY = "imgopt_user";
const MEMBER_LIMITS_CONFIG_KEY = "imgopt_member_limits_config";
const ALL_USERS_USAGE_KEY = "imgopt_all_users_usage";

export const SERVICE_KEYS = [
  "image-optimizer",
  "video-optimizer",
  "image-resizer",
  "watermark",
  "image-cropper",
] as const;

export type ServiceKey = (typeof SERVICE_KEYS)[number];

export const SERVICE_LABELS: Record<ServiceKey, string> = {
  "image-optimizer": "Image Optimizer",
  "video-optimizer": "Video Optimizer",
  "image-resizer": "Image Resizer",
  watermark: "Watermark",
  "image-cropper": "Image Cropper",
};

export interface MemberLimits {
  serviceLimits: Record<ServiceKey, number>;
  downloadLimit: number;
}

export interface MemberUsage {
  serviceUsage: Record<ServiceKey, number>;
  downloads: number;
  lastResetDate: string; // ISO date string for tracking daily reset
  usageHistory: UsageHistoryEntry[];
}

export interface UsageHistoryEntry {
  date: string; // YYYY-MM-DD
  serviceUsage: Record<ServiceKey, number>;
  downloads: number;
}

export interface MemberLimitsConfig {
  enabled: boolean;
  dailyResetEnabled: boolean;
  resetHour: number; // Hour (0-23) when reset occurs
  perServiceLimits: boolean; // Enable separate limits for different tools
}

export interface LimitResult {
  ok: boolean;
  used: number;
  limit: number;
  remaining: number;
  limitReached: boolean;
}

export interface UserUsageStats {
  userId: string;
  serviceUsage: Record<ServiceKey, number>;
  serviceLimits: Record<ServiceKey, number>;
  remaining: Record<ServiceKey, number>;
  downloads: number;
  downloadLimit: number;
  downloadRemaining: number;
  lastResetDate: string;
  percentageUsed: Record<ServiceKey, number>;
}

const makeDefaultServiceLimits = (): Record<ServiceKey, number> => ({
  "image-optimizer": 50,
  "video-optimizer": 25,
  "image-resizer": 50,
  watermark: 40,
  "image-cropper": 30,
});

const makeDefaultServiceUsage = (): Record<ServiceKey, number> => ({
  "image-optimizer": 0,
  "video-optimizer": 0,
  "image-resizer": 0,
  watermark: 0,
  "image-cropper": 0,
});

const makeDefaultLimitsConfig = (): MemberLimitsConfig => ({
  enabled: false, // Disabled by default - unlimited usage for all users
  dailyResetEnabled: true,
  resetHour: 0, // Midnight
  perServiceLimits: true,
});

const makeDefaultDownloadLimit = (): number => 500;

const sanitizeCount = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.floor(parsed));
};

const mergeServiceRecord = (
  base: Record<ServiceKey, number>,
  incoming: unknown
): Record<ServiceKey, number> => {
  const source = incoming && typeof incoming === "object" ? (incoming as Record<string, unknown>) : {};
  const merged = { ...base };
  for (const key of SERVICE_KEYS) {
    merged[key] = sanitizeCount(source[key], base[key]);
  }
  return merged;
};

const readJson = <T>(key: string, defaultValue: T): T => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaultValue;
    return JSON.parse(raw) as T;
  } catch {
    return defaultValue;
  }
};

const writeJson = <T>(key: string, value: T) => {
  localStorage.setItem(key, JSON.stringify(value));
};

const usageStorageKey = (userId: string) =>
  `${MEMBER_USAGE_KEY_PREFIX}${userId.trim().toLowerCase() || "guest"}`;

export const getCurrentUserId = () => {
  const user = localStorage.getItem(USER_KEY)?.trim();
  return user || "guest";
};

// Get today's date as YYYY-MM-DD string
export const getTodayDateKey = (): string => {
  const now = new Date();
  return now.toISOString().split('T')[0];
};

// Get timestamp for 24-hour reset (milliseconds)
export const getResetTimestamp = (): number => {
  const now = new Date();
  return now.getTime();
};

// Check if usage should be reset based on 24 hours
export const shouldResetUsage = (lastResetDate: string): boolean => {
  try {
    const lastReset = new Date(lastResetDate).getTime();
    const now = getResetTimestamp();
    const hoursSinceReset = (now - lastReset) / (1000 * 60 * 60);
    
    // Reset if more than 24 hours have passed
    return hoursSinceReset >= 24;
  } catch {
    // If there's an error, check by date
    const today = getTodayDateKey();
    return lastResetDate !== today;
  }
};

// Get member limits configuration
export const getMemberLimitsConfig = (): MemberLimitsConfig => {
  return readJson(MEMBER_LIMITS_CONFIG_KEY, makeDefaultLimitsConfig());
};

export const saveMemberLimitsConfig = (config: MemberLimitsConfig) => {
  writeJson(MEMBER_LIMITS_CONFIG_KEY, config);
};

export const getMemberLimits = (): MemberLimits => {
  const defaults: MemberLimits = {
    serviceLimits: makeDefaultServiceLimits(),
    downloadLimit: makeDefaultDownloadLimit(),
  };
  const stored = readJson<Partial<MemberLimits>>(MEMBER_LIMITS_KEY, {});
  if (!stored || Object.keys(stored).length === 0) return defaults;

  return {
    serviceLimits: mergeServiceRecord(defaults.serviceLimits, stored.serviceLimits),
    downloadLimit: sanitizeCount(stored.downloadLimit, defaults.downloadLimit),
  };
};

export const saveMemberLimits = (limits: MemberLimits) => {
  const sanitized: MemberLimits = {
    serviceLimits: mergeServiceRecord(makeDefaultServiceLimits(), limits.serviceLimits),
    downloadLimit: sanitizeCount(limits.downloadLimit, makeDefaultDownloadLimit()),
  };
  writeJson(MEMBER_LIMITS_KEY, sanitized);
};

// Initialize or get member usage with automatic daily reset check
export const getMemberUsage = (userId = getCurrentUserId()): MemberUsage => {
  const defaults: MemberUsage = {
    serviceUsage: makeDefaultServiceUsage(),
    downloads: 0,
    lastResetDate: new Date().toISOString(), // Store full timestamp
    usageHistory: [],
  };

  const stored = readJson<Partial<MemberUsage>>(usageStorageKey(userId), {});
  if (!stored || Object.keys(stored).length === 0) return defaults;

  // Check if daily reset is enabled and should reset
  const config = getMemberLimitsConfig();
  let usageData = {
    serviceUsage: mergeServiceRecord(defaults.serviceUsage, stored.serviceUsage),
    downloads: sanitizeCount(stored.downloads, 0),
    lastResetDate: stored.lastResetDate || new Date().toISOString(),
    usageHistory: stored.usageHistory || [],
  };

  // Auto-reset if 24 hours have passed
  if (config.dailyResetEnabled && shouldResetUsage(usageData.lastResetDate)) {
    // Save previous day's usage to history
    const historyEntry: UsageHistoryEntry = {
      date: usageData.lastResetDate,
      serviceUsage: { ...usageData.serviceUsage },
      downloads: usageData.downloads,
    };
    
    // Keep only last 30 days of history
    const updatedHistory = [historyEntry, ...usageData.usageHistory].slice(0, 30);
    
    // Reset usage to zero
    usageData = {
      serviceUsage: makeDefaultServiceUsage(),
      downloads: 0,
      lastResetDate: new Date().toISOString(),
      usageHistory: updatedHistory,
    };
    
    // Save reset data
    saveMemberUsage(usageData, userId);
  }

  return usageData;
};

export const saveMemberUsage = (usage: MemberUsage, userId = getCurrentUserId()) => {
  const sanitized: MemberUsage = {
    serviceUsage: mergeServiceRecord(makeDefaultServiceUsage(), usage.serviceUsage),
    downloads: sanitizeCount(usage.downloads, 0),
    lastResetDate: usage.lastResetDate || getTodayDateKey(),
    usageHistory: usage.usageHistory || [],
  };
  writeJson(usageStorageKey(userId), sanitized);
};

export const resetMemberUsage = (userId = getCurrentUserId()): MemberUsage => {
  const resetData: MemberUsage = {
    serviceUsage: makeDefaultServiceUsage(),
    downloads: 0,
    lastResetDate: new Date().toISOString(),
    usageHistory: [],
  };
  saveMemberUsage(resetData, userId);
  return resetData;
};

// Manual reset for specific service
export const resetServiceUsage = (service: ServiceKey, userId = getCurrentUserId()): MemberUsage => {
  const usage = getMemberUsage(userId);
  usage.serviceUsage[service] = 0;
  saveMemberUsage(usage, userId);
  return usage;
};

const computeResult = (used: number, limit: number): LimitResult => {
  const remaining = Math.max(0, limit - used);
  return {
    ok: used < limit,
    used,
    limit,
    remaining,
    limitReached: used >= limit,
  };
};

export const consumeServiceUsage = (
  service: ServiceKey,
  amount = 1,
  userId = getCurrentUserId()
): LimitResult => {
  // Check if limits are enabled
  const config = getMemberLimitsConfig();
  if (!config.enabled) {
    return { ok: true, used: 0, limit: 0, remaining: 0, limitReached: false };
  }

  const limits = getMemberLimits();
  const usage = getMemberUsage(userId);
  const limit = limits.serviceLimits[service];
  const used = usage.serviceUsage[service];
  const nextUsed = used + Math.max(1, amount);

  if (nextUsed > limit) {
    return computeResult(used, limit);
  }

  usage.serviceUsage[service] = nextUsed;
  saveMemberUsage(usage, userId);
  return computeResult(nextUsed, limit);
};

export const consumeDownloadUsage = (amount = 1, userId = getCurrentUserId()): LimitResult => {
  const config = getMemberLimitsConfig();
  if (!config.enabled) {
    return { ok: true, used: 0, limit: 0, remaining: 0, limitReached: false };
  }

  const limits = getMemberLimits();
  const usage = getMemberUsage(userId);
  const limit = limits.downloadLimit;
  const used = usage.downloads;
  const nextUsed = used + Math.max(1, amount);

  if (nextUsed > limit) {
    return computeResult(used, limit);
  }

  usage.downloads = nextUsed;
  saveMemberUsage(usage, userId);
  return computeResult(nextUsed, limit);
};

// Check if service usage is allowed without consuming
export const checkServiceUsageAllowed = (
  service: ServiceKey,
  userId = getCurrentUserId()
): LimitResult => {
  const config = getMemberLimitsConfig();
  if (!config.enabled) {
    return { ok: true, used: 0, limit: 0, remaining: 0, limitReached: false };
  }

  const limits = getMemberLimits();
  const usage = getMemberUsage(userId);
  const limit = limits.serviceLimits[service];
  const used = usage.serviceUsage[service];
  return computeResult(used, limit);
};

// Get all users' usage statistics (for admin management)
export const getAllUsersUsage = (): UserUsageStats[] => {
  const allUsersRaw = readJson<Record<string, MemberUsage>>(ALL_USERS_USAGE_KEY, {});
  const limits = getMemberLimits();
  const stats: UserUsageStats[] = [];

  // Also check for individual user storage
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(MEMBER_USAGE_KEY_PREFIX)) {
      const userId = key.replace(MEMBER_USAGE_KEY_PREFIX, "");
      const usage = getMemberUsage(userId);
      
      const serviceRemaining: Record<ServiceKey, number> = {} as Record<ServiceKey, number>;
      const percentageUsed: Record<ServiceKey, number> = {} as Record<ServiceKey, number>;
      
      for (const service of SERVICE_KEYS) {
        serviceRemaining[service] = Math.max(0, limits.serviceLimits[service] - usage.serviceUsage[service]);
        percentageUsed[service] = limits.serviceLimits[service] > 0
          ? Math.round((usage.serviceUsage[service] / limits.serviceLimits[service]) * 100)
          : 0;
      }

      stats.push({
        userId,
        serviceUsage: usage.serviceUsage,
        serviceLimits: limits.serviceLimits,
        remaining: serviceRemaining,
        downloads: usage.downloads,
        downloadLimit: limits.downloadLimit,
        downloadRemaining: Math.max(0, limits.downloadLimit - usage.downloads),
        lastResetDate: usage.lastResetDate,
        percentageUsed,
      });
    }
  }

  return stats;
};

// Reset usage for a specific user (admin function)
export const adminResetUserUsage = (userId: string): MemberUsage => {
  return resetMemberUsage(userId);
};

// Reset usage for all users (admin function)
export const adminResetAllUsage = () => {
  const allUsers = getAllUsersUsage();
  for (const user of allUsers) {
    resetMemberUsage(user.userId);
  }
  return allUsers.length;
};

// Update limits for a specific user (admin function)
export const adminUpdateUserLimits = (userId: string, newLimits: Partial<MemberLimits>) => {
  // For now, we use global limits. This function is here for future per-user limits
  const currentLimits = getMemberLimits();
  const updatedLimits: MemberLimits = {
    serviceLimits: {
      ...currentLimits.serviceLimits,
      ...(newLimits.serviceLimits || {}),
    },
    downloadLimit: newLimits.downloadLimit ?? currentLimits.downloadLimit,
  };
  saveMemberLimits(updatedLimits);
  return updatedLimits;
};

// Get usage analytics
export const getUsageAnalytics = () => {
  const allUsers = getAllUsersUsage();
  const limits = getMemberLimits();
  
  const totalUsers = allUsers.length;
  const activeUsers = allUsers.filter(u => 
    Object.values(u.serviceUsage).some(usage => usage > 0)
  ).length;
  
  const averageUsage: Record<ServiceKey, number> = {} as Record<ServiceKey, number>;
  const maxUsage: Record<ServiceKey, number> = {} as Record<ServiceKey, number>;
  
  for (const service of SERVICE_KEYS) {
    const usages = allUsers.map(u => u.serviceUsage[service]);
    const total = usages.reduce((sum, val) => sum + val, 0);
    averageUsage[service] = totalUsers > 0 ? Math.round(total / totalUsers) : 0;
    maxUsage[service] = Math.max(...usages, 0);
  }

  return {
    totalUsers,
    activeUsers,
    inactiveUsers: totalUsers - activeUsers,
    averageUsage,
    maxUsage,
    limits,
  };
};
