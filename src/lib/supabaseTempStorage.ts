import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const SUPABASE_CONFIG_KEY = "imgopt_supabase_config";

export interface SupabaseTempConfig {
  enabled: boolean;
  url: string;
  anonKey: string;
  bucket: string;
  retentionMinutes: number;
}

export interface UploadedTempFile {
  path: string;
  signedUrl: string;
}

const DEFAULT_SUPABASE_CONFIG: SupabaseTempConfig = {
  enabled: false,
  url: "",
  anonKey: "",
  bucket: "temp-uploads",
  retentionMinutes: 5,
};

const toNumber = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.floor(parsed));
};

export const getSupabaseTempConfig = (): SupabaseTempConfig => {
  if (typeof window === "undefined") return DEFAULT_SUPABASE_CONFIG;
  try {
    const raw = localStorage.getItem(SUPABASE_CONFIG_KEY);
    if (!raw) return DEFAULT_SUPABASE_CONFIG;
    const parsed = JSON.parse(raw) as Partial<SupabaseTempConfig>;
    return {
      enabled: Boolean(parsed.enabled),
      url: (parsed.url || "").trim(),
      anonKey: (parsed.anonKey || "").trim(),
      bucket: (parsed.bucket || "temp-uploads").trim(),
      retentionMinutes: toNumber(parsed.retentionMinutes, 5),
    };
  } catch {
    return DEFAULT_SUPABASE_CONFIG;
  }
};

export const saveSupabaseTempConfig = (config: SupabaseTempConfig) => {
  if (typeof window === "undefined") return;
  const sanitized: SupabaseTempConfig = {
    enabled: Boolean(config.enabled),
    url: (config.url || "").trim(),
    anonKey: (config.anonKey || "").trim(),
    bucket: (config.bucket || "temp-uploads").trim(),
    retentionMinutes: toNumber(config.retentionMinutes, 5),
  };
  localStorage.setItem(SUPABASE_CONFIG_KEY, JSON.stringify(sanitized));
};

export const isSupabaseTempReady = (config: SupabaseTempConfig) =>
  config.enabled && Boolean(config.url) && Boolean(config.anonKey) && Boolean(config.bucket);

export const isLocalDevelopmentHost = () => {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname.toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
};

export const shouldUseSupabaseTempUpload = (config: SupabaseTempConfig) =>
  isSupabaseTempReady(config) && !isLocalDevelopmentHost();

const getClient = (config: SupabaseTempConfig): SupabaseClient | null => {
  if (!isSupabaseTempReady(config)) return null;
  return createClient(config.url, config.anonKey, {
    auth: { persistSession: false },
  });
};

export const uploadTempFileToSupabase = async (
  file: File,
  userId = "guest"
): Promise<UploadedTempFile | null> => {
  const config = getSupabaseTempConfig();
  const client = getClient(config);
  if (!client) return null;

  const normalizedUser = userId.trim().toLowerCase() || "guest";
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `temp/${normalizedUser}/${Date.now()}_${crypto.randomUUID()}_${safeName}`;

  const uploadRes = await client.storage.from(config.bucket).upload(path, file, {
    upsert: false,
    cacheControl: "60",
    contentType: file.type || "application/octet-stream",
  });

  if (uploadRes.error) {
    throw new Error(uploadRes.error.message || "Supabase upload failed");
  }

  const signedRes = await client.storage
    .from(config.bucket)
    .createSignedUrl(path, Math.max(60, config.retentionMinutes * 60));

  if (signedRes.error || !signedRes.data?.signedUrl) {
    throw new Error(signedRes.error?.message || "Failed to generate signed URL");
  }

  return {
    path,
    signedUrl: signedRes.data.signedUrl,
  };
};

export const removeTempFileFromSupabase = async (path: string) => {
  if (!path) return;
  const config = getSupabaseTempConfig();
  const client = getClient(config);
  if (!client) return;
  await client.storage.from(config.bucket).remove([path]);
};
