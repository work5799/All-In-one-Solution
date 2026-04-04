/**
 * Page Lock System - Controls access to pages via password protection
 * Supports both localStorage and Supabase for cross-device sync
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseTempConfig } from "@/lib/supabaseTempStorage";

export const PAGE_LOCK_KEY = "imgopt_page_lock";
export const PAGE_PASSWORD_KEY = "imgopt_page_password";
export const UNLOCKED_PAGES_KEY = "imgopt_unlocked_pages";
export const SUPABASE_CONFIG_KEY = "imgopt_supabase_config";

export interface PageLockConfig {
  enabled: boolean;
  lockedPages: string[];
}

export interface PagePasswordConfig {
  masterPassword: string;
  pagePasswords: Record<string, string>;
}

export interface SupabaseConfig {
  enabled: boolean;
  url: string;
  anonKey: string;
}

export type PageLockSyncStatus = "supabase-env" | "supabase-local" | "local";

interface RemotePageLockPayload extends PageLockConfig {
  masterPassword: string;
  pagePasswords: Record<string, string>;
}

export const LOCKABLE_PAGES = [
  { id: "dashboard", label: "Dashboard", path: "/" },
  { id: "image-optimizer", label: "Image Optimizer", path: "/image-optimizer" },
  { id: "video-optimizer", label: "Video Optimizer", path: "/video-optimizer" },
  { id: "image-resizer", label: "Image Resizer", path: "/image-resizer" },
  { id: "watermark", label: "Watermark Adder", path: "/watermark" },
  { id: "color-changer", label: "Color Changer", path: "/color-changer" },
  { id: "image-cropper", label: "Image Cropper", path: "/image-cropper" },
  { id: "text-transformer", label: "Text Transformer", path: "/text-transformer" },
  { id: "history", label: "History", path: "/history" },
] as const;

const LOCKABLE_PAGE_IDS = new Set<string>(LOCKABLE_PAGES.map((page) => page.id));

export type LockablePageId = (typeof LOCKABLE_PAGES)[number]["id"];

export const DEFAULT_PAGE_LOCK_CONFIG: PageLockConfig = {
  enabled: true,
  lockedPages: [],
};

export const DEFAULT_PAGE_PASSWORDS: PagePasswordConfig = {
  masterPassword: "admin123",
  pagePasswords: {},
};

const createSnapshotId = () => {
  const randomPart =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `page-lock-${Date.now()}-${randomPart}`;
};

const sanitizePageLockConfig = (value: unknown): PageLockConfig => {
  const candidate = value && typeof value === "object" ? (value as Partial<PageLockConfig>) : {};
  const lockedPages = Array.isArray(candidate.lockedPages)
    ? Array.from(
        new Set(
          candidate.lockedPages
            .filter((pageId): pageId is string => typeof pageId === "string")
            .map((pageId) => pageId.trim())
            .filter((pageId) => LOCKABLE_PAGE_IDS.has(pageId))
        )
      )
    : [];

  return {
    enabled: Boolean(candidate.enabled),
    lockedPages,
  };
};

const sanitizePagePasswords = (value: unknown): PagePasswordConfig => {
  const candidate = value && typeof value === "object" ? (value as Partial<PagePasswordConfig>) : {};
  const pagePasswords =
    candidate.pagePasswords && typeof candidate.pagePasswords === "object"
      ? Object.fromEntries(
          Object.entries(candidate.pagePasswords).filter(
            ([pageId, password]) => typeof pageId === "string" && typeof password === "string"
          )
        )
      : {};

  return {
    masterPassword:
      typeof candidate.masterPassword === "string" && candidate.masterPassword.length >= 4
        ? candidate.masterPassword
        : DEFAULT_PAGE_PASSWORDS.masterPassword,
    pagePasswords,
  };
};

const sanitizeRemotePayload = (value: unknown): RemotePageLockPayload => {
  const lockConfig = sanitizePageLockConfig(value);
  const passwordConfig = sanitizePagePasswords(value);

  return {
    ...lockConfig,
    ...passwordConfig,
  };
};

const getEnvSupabaseConfig = (): SupabaseConfig | null => {
  const url = (import.meta.env.VITE_SUPABASE_URL || "").trim();
  const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();
  const pageLockEnabled = (import.meta.env.VITE_SUPABASE_PAGE_LOCK_ENABLED || "true").trim().toLowerCase();

  if (!url || !anonKey || pageLockEnabled === "false") {
    return null;
  }

  return {
    enabled: true,
    url,
    anonKey,
  };
};

const getLocalSupabaseConfig = (): SupabaseConfig | null => {
  try {
    const config = getSupabaseTempConfig();
    if (config.enabled && config.url && config.anonKey) {
      return {
        enabled: true,
        url: config.url,
        anonKey: config.anonKey,
      };
    }
  } catch {
    // Fall through to legacy localStorage read below.
  }

  try {
    const raw = localStorage.getItem(SUPABASE_CONFIG_KEY);
    if (!raw) return null;
    const config = JSON.parse(raw);
    if (config.enabled && config.url && config.anonKey) {
      return { enabled: true, url: config.url, anonKey: config.anonKey };
    }
  } catch {
    return null;
  }

  return null;
};

const getSupabaseConfigInfo = (): { config: SupabaseConfig | null; status: PageLockSyncStatus } => {
  const envConfig = getEnvSupabaseConfig();
  if (envConfig) {
    return { config: envConfig, status: "supabase-env" };
  }

  const localConfig = getLocalSupabaseConfig();
  if (localConfig) {
    return { config: localConfig, status: "supabase-local" };
  }

  return { config: null, status: "local" };
};

export const getPageLockSyncStatus = (): PageLockSyncStatus => getSupabaseConfigInfo().status;
export const isPageLockSyncGlobal = (): boolean => getPageLockSyncStatus() !== "local";

// Get config from URL parameter (for sharing config without backend)
const getConfigFromUrl = (): PageLockConfig | null => {
  try {
    const params = new URLSearchParams(window.location.search);
    const configParam = params.get("pageLockConfig");
    if (configParam) {
      const decoded = atob(configParam);
      return JSON.parse(decoded) as PageLockConfig;
    }
    return null;
  } catch {
    return null;
  }
};

// Generate config URL for sharing
export const generateConfigUrl = (config: PageLockConfig): string => {
  const encoded = btoa(JSON.stringify(config));
  const baseUrl = window.location.origin + window.location.pathname;
  return `${baseUrl}?pageLockConfig=${encoded}`;
};

// Get Supabase client
const getSupabaseClient = (): SupabaseClient | null => {
  const { config } = getSupabaseConfigInfo();
  if (!config) return null;
  try {
    return createClient(config.url, config.anonKey, { auth: { persistSession: false } });
  } catch {
    return null;
  }
};

// Storage helpers
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

const cacheRemotePayload = (payload: RemotePageLockPayload) => {
  writeJson(PAGE_LOCK_KEY, sanitizePageLockConfig(payload));
  writeJson(PAGE_PASSWORD_KEY, sanitizePagePasswords(payload));
};

const getCachedRemotePayload = (): RemotePageLockPayload => {
  const config = readJson(PAGE_LOCK_KEY, DEFAULT_PAGE_LOCK_CONFIG);
  const passwords = readJson(PAGE_PASSWORD_KEY, DEFAULT_PAGE_PASSWORDS);

  return sanitizeRemotePayload({
    ...config,
    ...passwords,
  });
};

const readRemotePayload = async (): Promise<RemotePageLockPayload | null> => {
  const client = getSupabaseClient();
  if (!client) return null;

  const { data, error } = await client
    .from("page_lock_config")
    .select("config, updated_at")
    .order("updated_at", { ascending: false })
    .limit(1);

  if (error) {
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : null;
  if (!row?.config) {
    return null;
  }

  const payload = sanitizeRemotePayload(row.config);
  cacheRemotePayload(payload);
  return payload;
};

const writeRemotePayload = async (payload: RemotePageLockPayload) => {
  const client = getSupabaseClient();
  if (!client) return false;

  const sanitizedPayload = sanitizeRemotePayload(payload);

  const { error } = await client.from("page_lock_config").insert(
    {
      id: createSnapshotId(),
      config: sanitizedPayload,
      updated_at: new Date().toISOString(),
    }
  );

  if (error) {
    throw error;
  }

  cacheRemotePayload(sanitizedPayload);
  return true;
};

const getEffectiveRemotePayload = async (): Promise<RemotePageLockPayload> => {
  try {
    const remotePayload = await readRemotePayload();
    if (remotePayload) {
      return remotePayload;
    }
  } catch (error) {
    console.log("Using cached page lock config", error);
  }

  return getCachedRemotePayload();
};

// Page Lock Configuration - with optional Supabase sync and URL config
export const getPageLockConfig = async (): Promise<PageLockConfig> => {
  // First check URL parameter (for sharing config without backend)
  const urlConfig = getConfigFromUrl();
  if (urlConfig) {
    return sanitizePageLockConfig(urlConfig);
  }

  // Then try Supabase (for cross-device sync)
  try {
    const remotePayload = await readRemotePayload();
    if (remotePayload) {
      return sanitizePageLockConfig(remotePayload);
    }
  } catch (e) {
    console.log("Using localStorage for page lock config");
  }
  
  // Fallback to localStorage
  return sanitizePageLockConfig(readJson(PAGE_LOCK_KEY, DEFAULT_PAGE_LOCK_CONFIG));
};

export const savePageLockConfig = async (config: PageLockConfig) => {
  const sanitizedConfig = sanitizePageLockConfig(config);

  // Always save to localStorage first
  writeJson(PAGE_LOCK_KEY, sanitizedConfig);
  
  // Try to sync to Supabase
  try {
    if (getSupabaseClient()) {
      const payload = await getEffectiveRemotePayload();
      await writeRemotePayload({
        ...payload,
        ...sanitizedConfig,
      });
    }
  } catch (e) {
    console.log("Failed to sync to Supabase, using localStorage only");
  }
};

export const isPageLocked = async (pageId: string): Promise<boolean> => {
  const config = await getPageLockConfig();
  return config.enabled && config.lockedPages.includes(pageId);
};

export const togglePageLock = async (pageId: string, locked: boolean) => {
  const config = await getPageLockConfig();
  if (locked) {
    if (!config.lockedPages.includes(pageId)) {
      config.lockedPages.push(pageId);
    }
  } else {
    config.lockedPages = config.lockedPages.filter((id) => id !== pageId);
  }
  await savePageLockConfig(config);
};

export const setPageLockEnabled = async (enabled: boolean) => {
  const config = await getPageLockConfig();
  config.enabled = enabled;
  await savePageLockConfig(config);
};

// Page Password Management
export const getPagePasswords = async (): Promise<PagePasswordConfig> => {
  try {
    const payload = await readRemotePayload();
    if (payload) {
      return sanitizePagePasswords(payload);
    }
  } catch (error) {
    console.log("Using localStorage for page passwords", error);
  }

  return sanitizePagePasswords(readJson(PAGE_PASSWORD_KEY, DEFAULT_PAGE_PASSWORDS));
};

export const savePagePasswords = async (config: PagePasswordConfig) => {
  const sanitizedPasswords = sanitizePagePasswords(config);
  writeJson(PAGE_PASSWORD_KEY, sanitizedPasswords);

  try {
    if (getSupabaseClient()) {
      const payload = await getEffectiveRemotePayload();
      await writeRemotePayload({
        ...payload,
        ...sanitizedPasswords,
      });
    }
  } catch (error) {
    console.log("Failed to sync page passwords to Supabase, using localStorage only", error);
  }
};

export const getMasterPassword = async (): Promise<string> => {
  const config = await getPagePasswords();
  return config.masterPassword;
};

export const setMasterPassword = async (password: string) => {
  const config = await getPagePasswords();
  config.masterPassword = password;
  await savePagePasswords(config);
};

export const getPagePassword = async (pageId: string): Promise<string> => {
  const config = await getPagePasswords();
  return config.pagePasswords[pageId] || config.masterPassword;
};

export const setPagePassword = async (pageId: string, password: string) => {
  const config = await getPagePasswords();
  config.pagePasswords[pageId] = password;
  await savePagePasswords(config);
};

export const removePagePassword = async (pageId: string) => {
  const config = await getPagePasswords();
  delete config.pagePasswords[pageId];
  await savePagePasswords(config);
};

// Verify password for a page
export const verifyPagePassword = async (pageId: string, password: string): Promise<boolean> => {
  const pagePassword = await getPagePassword(pageId);
  return password === pagePassword;
};

// Session-based unlock tracking (pages unlocked during current session)
export const isPageUnlockedInSession = (pageId: string): boolean => {
  try {
    const raw = sessionStorage.getItem(UNLOCKED_PAGES_KEY);
    if (!raw) return false;
    const unlocked: string[] = JSON.parse(raw);
    return unlocked.includes(pageId);
  } catch {
    return false;
  }
};

export const unlockPageInSession = (pageId: string) => {
  try {
    const raw = sessionStorage.getItem(UNLOCKED_PAGES_KEY);
    const unlocked: string[] = raw ? JSON.parse(raw) : [];
    if (!unlocked.includes(pageId)) {
      unlocked.push(pageId);
      sessionStorage.setItem(UNLOCKED_PAGES_KEY, JSON.stringify(unlocked));
    }
  } catch (e) {
    console.error("Failed to unlock page in session", e);
  }
};

export const clearUnlockedPages = () => {
  sessionStorage.removeItem(UNLOCKED_PAGES_KEY);
};
