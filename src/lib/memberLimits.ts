export const MEMBER_LIMITS_KEY = "imgopt_member_limits";
const MEMBER_USAGE_KEY_PREFIX = "imgopt_member_usage_";
const USER_KEY = "imgopt_user";

export const SERVICE_KEYS = [
  "image-optimizer",
  "video-optimizer",
  "image-resizer",
  "watermark",
] as const;

export type ServiceKey = (typeof SERVICE_KEYS)[number];

export const SERVICE_LABELS: Record<ServiceKey, string> = {
  "image-optimizer": "Image Optimizer",
  "video-optimizer": "Video Optimizer",
  "image-resizer": "Image Resizer",
  watermark: "Watermark",
};

export interface MemberLimits {
  serviceLimits: Record<ServiceKey, number>;
  downloadLimit: number;
}

export interface MemberUsage {
  serviceUsage: Record<ServiceKey, number>;
  downloads: number;
}

export interface LimitResult {
  ok: boolean;
  used: number;
  limit: number;
  remaining: number;
}

const makeDefaultServiceLimits = (): Record<ServiceKey, number> => ({
  "image-optimizer": 999999, // Unlimited usage
  "video-optimizer": 999999, // Unlimited usage
  "image-resizer": 999999,   // Unlimited usage
  watermark: 999999,         // Unlimited usage
});

const makeDefaultServiceUsage = (): Record<ServiceKey, number> => ({
  "image-optimizer": 0,
  "video-optimizer": 0,
  "image-resizer": 0,
  watermark: 0,
});

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

const readJson = <T>(key: string): T | null => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

const usageStorageKey = (userId: string) =>
  `${MEMBER_USAGE_KEY_PREFIX}${userId.trim().toLowerCase() || "guest"}`;

export const getCurrentUserId = () => {
  const user = localStorage.getItem(USER_KEY)?.trim();
  return user || "guest";
};

export const getMemberLimits = (): MemberLimits => {
  const defaults: MemberLimits = {
    serviceLimits: makeDefaultServiceLimits(),
    downloadLimit: 999999, // Unlimited downloads
  };
  const stored = readJson<Partial<MemberLimits>>(MEMBER_LIMITS_KEY);
  if (!stored) return defaults;

  return {
    serviceLimits: mergeServiceRecord(defaults.serviceLimits, stored.serviceLimits),
    downloadLimit: sanitizeCount(stored.downloadLimit, defaults.downloadLimit),
  };
};

export const saveMemberLimits = (limits: MemberLimits) => {
  const sanitized: MemberLimits = {
    serviceLimits: mergeServiceRecord(makeDefaultServiceLimits(), limits.serviceLimits),
    downloadLimit: sanitizeCount(limits.downloadLimit, 999999), // Unlimited downloads
  };
  localStorage.setItem(MEMBER_LIMITS_KEY, JSON.stringify(sanitized));
};

export const getMemberUsage = (userId = getCurrentUserId()): MemberUsage => {
  const defaults: MemberUsage = {
    serviceUsage: makeDefaultServiceUsage(),
    downloads: 0,
  };
  const stored = readJson<Partial<MemberUsage>>(usageStorageKey(userId));
  if (!stored) return defaults;

  return {
    serviceUsage: mergeServiceRecord(defaults.serviceUsage, stored.serviceUsage),
    downloads: sanitizeCount(stored.downloads, 0),
  };
};

export const saveMemberUsage = (usage: MemberUsage, userId = getCurrentUserId()) => {
  const sanitized: MemberUsage = {
    serviceUsage: mergeServiceRecord(makeDefaultServiceUsage(), usage.serviceUsage),
    downloads: sanitizeCount(usage.downloads, 0),
  };
  localStorage.setItem(usageStorageKey(userId), JSON.stringify(sanitized));
};

export const resetMemberUsage = (userId = getCurrentUserId()) => {
  const resetData: MemberUsage = {
    serviceUsage: makeDefaultServiceUsage(),
    downloads: 0,
  };
  saveMemberUsage(resetData, userId);
  return resetData;
};

const computeResult = (used: number, limit: number): LimitResult => {
  const remaining = Math.max(0, limit - used);
  return {
    ok: used <= limit,
    used,
    limit,
    remaining,
  };
};

export const consumeServiceUsage = (
  service: ServiceKey,
  amount = 1,
  userId = getCurrentUserId()
): LimitResult => {
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
