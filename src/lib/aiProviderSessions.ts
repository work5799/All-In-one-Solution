import {
  type ProviderId,
  PROVIDER_DEFINITIONS,
  PROVIDER_MODELS,
  getProviderConfig,
} from "@/lib/aiProviders";

export interface ProviderSession {
  providerId: ProviderId;
  accountLabel: string;
  accountEmail: string;
  connected: boolean;
  preferredModel: string;
  lastLoginAt: string | null;
}

export const PROVIDER_SESSION_STORAGE_KEY = "imgopt_provider_sessions";

export const DEFAULT_PROVIDER_SESSIONS: ProviderSession[] = PROVIDER_DEFINITIONS.map((provider) => ({
  providerId: provider.id,
  accountLabel: provider.label,
  accountEmail: "",
  connected: false,
  preferredModel: PROVIDER_MODELS[provider.id][0]?.value ?? "",
  lastLoginAt: null,
}));

const isProviderId = (value: string): value is ProviderId =>
  PROVIDER_DEFINITIONS.some((provider) => provider.id === value);

export const normalizeProviderSessions = (incoming: unknown): ProviderSession[] => {
  const parsed = Array.isArray(incoming)
    ? incoming
      .filter((item) => item && typeof item === "object")
      .map((item) => {
        const entry = item as Partial<ProviderSession>;
        const providerId = typeof entry.providerId === "string" && isProviderId(entry.providerId)
          ? entry.providerId
          : null;
        if (!providerId) return null;
        return {
          providerId,
          accountLabel: String(entry.accountLabel || ""),
          accountEmail: String(entry.accountEmail || ""),
          connected: Boolean(entry.connected),
          preferredModel: String(entry.preferredModel || ""),
          lastLoginAt: entry.lastLoginAt ? String(entry.lastLoginAt) : null,
        };
      })
      .filter(Boolean) as ProviderSession[]
    : [];

  const byId = new Map(parsed.map((session) => [session.providerId, session]));

  return DEFAULT_PROVIDER_SESSIONS.map((base) => {
    const saved = byId.get(base.providerId);
    const availableModels = PROVIDER_MODELS[base.providerId].map((model) => model.value);
    const preferredModel = saved?.preferredModel && availableModels.includes(saved.preferredModel)
      ? saved.preferredModel
      : base.preferredModel;

    return {
      ...base,
      ...saved,
      preferredModel,
    };
  });
};

export const getProviderSessions = (): ProviderSession[] => {
  if (typeof window === "undefined") return DEFAULT_PROVIDER_SESSIONS;
  try {
    const raw = localStorage.getItem(PROVIDER_SESSION_STORAGE_KEY);
    if (!raw) return DEFAULT_PROVIDER_SESSIONS;
    return normalizeProviderSessions(JSON.parse(raw));
  } catch {
    return DEFAULT_PROVIDER_SESSIONS;
  }
};

export const saveProviderSessions = (sessions: ProviderSession[]) => {
  if (typeof window === "undefined") return;
  const normalized = normalizeProviderSessions(sessions);
  localStorage.setItem(PROVIDER_SESSION_STORAGE_KEY, JSON.stringify(normalized));
};

export const canLoginProviderSession = (providerId: ProviderId) => {
  const provider = PROVIDER_DEFINITIONS.find((entry) => entry.id === providerId);
  if (!provider) return false;
  const config = getProviderConfig(provider.storageId);
  return Boolean(config?.enabled && config?.key?.trim());
};

export const getLoggedInImageProviders = () =>
  getProviderSessions().filter((session) => {
    const provider = PROVIDER_DEFINITIONS.find((entry) => entry.id === session.providerId);
    return Boolean(provider?.imageGeneration && session.connected && canLoginProviderSession(session.providerId));
  });
