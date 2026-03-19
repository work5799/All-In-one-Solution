export type ProviderId = "openai" | "gemini" | "qwen" | "groq";

export interface ProviderDefinition {
  id: ProviderId;
  label: string;
  settingsName: string;
  storageId: string;
  defaultEndpoint: string;
  imageGeneration: boolean;
  authMode: "api_key";
  note?: string;
  loginUrl: string;
  consoleUrl: string;
  setupRequirements: string[];
}

export interface ModelOption {
  value: string;
  label: string;
}

export interface SizeOption {
  value: string;
  label: string;
}

export interface StoredApiConfig {
  id: string;
  name: string;
  key: string;
  endpoint: string;
  enabled: boolean;
  isEditing?: boolean;
}

export const PROVIDER_DEFINITIONS: ProviderDefinition[] = [
  {
    id: "openai",
    label: "ChatGPT / OpenAI",
    settingsName: "OpenAI API",
    storageId: "openai",
    defaultEndpoint: "https://api.openai.com/v1",
    imageGeneration: true,
    authMode: "api_key",
    note: "Use an OpenAI API key. Consumer ChatGPT login is not a drop-in API auth method.",
    loginUrl: "https://chatgpt.com/",
    consoleUrl: "https://platform.openai.com/api-keys",
    setupRequirements: [
      "Sign in to your OpenAI or ChatGPT account.",
      "Open the OpenAI Platform API Keys page.",
      "Create an API key for your project or organization.",
      "If needed, verify billing or org access for image models.",
    ],
  },
  {
    id: "gemini",
    label: "Google AI Studio (Gemini)",
    settingsName: "Google AI Studio (Gemini API)",
    storageId: "gemini",
    defaultEndpoint: "https://generativelanguage.googleapis.com/v1beta",
    imageGeneration: true,
    authMode: "api_key",
    loginUrl: "https://aistudio.google.com/",
    consoleUrl: "https://aistudio.google.com/app/apikey",
    setupRequirements: [
      "Sign in with your Google account.",
      "Open Google AI Studio or the API keys page.",
      "Create or select a Gemini API key.",
      "If you need higher quota, connect a billed Google Cloud project.",
    ],
  },
  {
    id: "qwen",
    label: "Qwen / Model Studio",
    settingsName: "Alibaba Model Studio (Qwen / Wan)",
    storageId: "qwen",
    defaultEndpoint: "https://dashscope-intl.aliyuncs.com",
    imageGeneration: true,
    authMode: "api_key",
    note: "Uses an Alibaba Cloud Model Studio API key. Text-to-image uses Wan/Qwen image models.",
    loginUrl: "https://www.alibabacloud.com/product/model-studio",
    consoleUrl: "https://www.alibabacloud.com/help/en/model-studio/get-api-key",
    setupRequirements: [
      "Sign in to your Alibaba Cloud account.",
      "Open Model Studio key management.",
      "Create an API key in the correct workspace and region.",
      "Use the regional base URL that matches the created key.",
    ],
  },
  {
    id: "groq",
    label: "Groq",
    settingsName: "Groq API",
    storageId: "groq",
    defaultEndpoint: "https://api.groq.com/openai/v1",
    imageGeneration: false,
    authMode: "api_key",
    note: "Groq currently supports image understanding, not text-to-image output.",
    loginUrl: "https://console.groq.com/login",
    consoleUrl: "https://console.groq.com/keys",
    setupRequirements: [
      "Sign in to your Groq Console account.",
      "Open the API keys page.",
      "Create a Groq API key.",
      "Use Groq for supported multimodal or reasoning features, not text-to-image output.",
    ],
  },
];

export const DEFAULT_PROVIDER_APIS: StoredApiConfig[] = PROVIDER_DEFINITIONS.map((provider) => ({
  id: provider.storageId,
  name: provider.settingsName,
  key: "",
  endpoint: provider.defaultEndpoint,
  enabled: false,
  isEditing: false,
}));

export const PROVIDER_MODELS: Record<ProviderId, ModelOption[]> = {
  openai: [
    { value: "gpt-image-1.5", label: "GPT Image 1.5 (Recommended)" },
    { value: "gpt-image-1", label: "GPT Image 1" },
    { value: "dall-e-3", label: "DALL-E 3 (Legacy HD)" },
    { value: "dall-e-2", label: "DALL-E 2 (Legacy Variations)" },
  ],
  gemini: [
    { value: "gemini-2.5-flash-image", label: "Gemini 2.5 Flash Image (Recommended)" },
    { value: "gemini-3-pro-image-preview", label: "Gemini 3 Pro Image Preview" },
    { value: "imagen-4.0-generate-001", label: "Imagen 4" },
  ],
  qwen: [
    { value: "wan2.6-t2i", label: "Wan 2.6 Text-to-Image (Recommended)" },
    { value: "wan2.1-t2i-plus", label: "Wan 2.1 Plus" },
  ],
  groq: [
    { value: "groq-vision-only", label: "Vision Only (No Image Output)" },
  ],
};

export const PROVIDER_SIZES: Record<string, SizeOption[]> = {
  "gpt-image-1.5": [
    { value: "1024x1024", label: "1024 x 1024 (Square)" },
    { value: "1536x1024", label: "1536 x 1024 (Landscape)" },
    { value: "1024x1536", label: "1024 x 1536 (Portrait)" },
  ],
  "gpt-image-1": [
    { value: "1024x1024", label: "1024 x 1024 (Square)" },
    { value: "1536x1024", label: "1536 x 1024 (Landscape)" },
    { value: "1024x1536", label: "1024 x 1536 (Portrait)" },
  ],
  "dall-e-3": [
    { value: "1024x1024", label: "1024 x 1024 (Square)" },
    { value: "1792x1024", label: "1792 x 1024 (Landscape)" },
    { value: "1024x1792", label: "1024 x 1792 (Portrait)" },
  ],
  "dall-e-2": [
    { value: "256x256", label: "256 x 256 (Small)" },
    { value: "512x512", label: "512 x 512 (Medium)" },
    { value: "1024x1024", label: "1024 x 1024 (Large)" },
  ],
  "imagen-4.0-generate-001": [
    { value: "1:1", label: "1:1 Square" },
    { value: "3:4", label: "3:4 Portrait" },
    { value: "4:3", label: "4:3 Landscape" },
    { value: "9:16", label: "9:16 Vertical" },
    { value: "16:9", label: "16:9 Widescreen" },
  ],
  "gemini-2.5-flash-image": [
    { value: "1024x1024", label: "Auto (1024 x 1024)" },
  ],
  "gemini-3-pro-image-preview": [
    { value: "1024x1024", label: "Auto (1024 x 1024)" },
  ],
  "wan2.6-t2i": [
    { value: "1024x1024", label: "1024 x 1024 (Square)" },
    { value: "1328x1328", label: "1328 x 1328 (Large Square)" },
    { value: "1024x1536", label: "1024 x 1536 (Portrait)" },
    { value: "1536x1024", label: "1536 x 1024 (Landscape)" },
  ],
  "wan2.1-t2i-plus": [
    { value: "1024x1024", label: "1024 x 1024 (Square)" },
    { value: "1024x1536", label: "1024 x 1536 (Portrait)" },
    { value: "1536x1024", label: "1536 x 1024 (Landscape)" },
  ],
  "groq-vision-only": [
    { value: "1024x1024", label: "Not available" },
  ],
};

export const PROVIDER_MAX_VARIATIONS: Record<string, number> = {
  "gpt-image-1.5": 4,
  "gpt-image-1": 4,
  "dall-e-3": 4,
  "dall-e-2": 10,
  "imagen-4.0-generate-001": 4,
  "gemini-2.5-flash-image": 4,
  "gemini-3-pro-image-preview": 4,
  "wan2.6-t2i": 4,
  "wan2.1-t2i-plus": 4,
  "groq-vision-only": 1,
};

export const PROVIDER_STORAGE_KEY = "imgopt_api_configs";

export const getProviderDefinition = (providerId: ProviderId) =>
  PROVIDER_DEFINITIONS.find((provider) => provider.id === providerId);

export const getProviderConfig = (providerId: string): StoredApiConfig | null => {
  try {
    const list: StoredApiConfig[] = JSON.parse(localStorage.getItem(PROVIDER_STORAGE_KEY) ?? "[]");
    return list.find((api) => api.id === providerId) ?? null;
  } catch {
    return null;
  }
};

export const getConnectedImageProviders = () =>
  PROVIDER_DEFINITIONS.filter((provider) => {
    if (!provider.imageGeneration) return false;
    const config = getProviderConfig(provider.storageId);
    return Boolean(config?.enabled && config?.key?.trim());
  });
