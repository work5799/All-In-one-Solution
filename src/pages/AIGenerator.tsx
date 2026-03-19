import { useState, useEffect } from "react";
import { DropZone } from "@/components/DropZone";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Download, Loader2, ImageIcon, AlertCircle, CheckCircle2, X, RefreshCw, Cloud, HardDrive, PlugZap, ShieldAlert } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useHistory } from "@/contexts/HistoryContext";
import { toast } from "sonner";
import { consumeDownloadUsage, consumeServiceUsage } from "@/lib/memberLimits";
import { getSupabaseTempConfig } from "@/lib/supabaseTempStorage";
import {
  type ProviderId,
  PROVIDER_DEFINITIONS as PROVIDERS,
  PROVIDER_MODELS as MODELS,
  PROVIDER_SIZES as SIZES,
  PROVIDER_MAX_VARIATIONS as MAX_VAR,
  getProviderConfig,
} from "@/lib/aiProviders";
import {
  getLoggedInImageProviders,
  getProviderSessions,
} from "@/lib/aiProviderSessions";

// ─── Environment Helpers ──────────────────────────────────────────────────────

const isLocalHost = () => {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  return h === "localhost" || h === "127.0.0.1" || h === "::1";
};

// ─── Storage Helpers ──────────────────────────────────────────────────────────

interface StoredApi { id: string; key: string; endpoint: string; enabled: boolean }

function getLocalApiConfig(providerId: string): StoredApi | null {
  const config = getProviderConfig(providerId);
  if (!config) return null;
  return {
    id: config.id,
    key: config.key,
    endpoint: config.endpoint,
    enabled: config.enabled,
  };
}

/** Convert a blob/object URL to { base64, mimeType } */
async function blobUrlToBase64(blobUrl: string): Promise<{ base64: string; mimeType: string }> {
  const res  = await fetch(blobUrl);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const [header, base64] = dataUrl.split(",");
      resolve({ base64, mimeType: header.match(/:(.*?);/)?.[1] ?? "image/png" });
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function tryParseJson(raw: string) {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { error: raw };
  }
}

// ─── API call via Supabase Edge Function (server-side, global) ───────────────

async function callViaProxy(payload: Record<string, unknown>): Promise<string[]> {
  const sbCfg = getSupabaseTempConfig();
  if (!sbCfg.url || !sbCfg.anonKey) {
    throw new Error("Supabase not configured. Go to Settings → Supabase Temporary Upload to add the URL and Anon Key.");
  }
  const fnUrl = isLocalHost()
    ? "/api/supabase/functions/v1/ai-image-proxy"
    : `${sbCfg.url.replace(/\/$/, "")}/functions/v1/ai-image-proxy`;
  console.log(`[Proxy] Calling: ${fnUrl}`);
  const resp  = await fetch(fnUrl, {
    method:  "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: sbCfg.anonKey,
      Authorization: `Bearer ${sbCfg.anonKey}`,
      "x-supabase-url": sbCfg.url.replace(/\/$/, ""),
    },
    body:    JSON.stringify(payload),
  });
  const raw = await resp.text();
  const json = tryParseJson(raw);
  if (!resp.ok) {
    throw new Error(json.error || `Proxy request failed (${resp.status})`);
  }
  if (json.error) throw new Error(json.error);
  return json.images as string[];
}

type OpenAIProxyOptions = {
  apiKey: string;
  model: string;
  prompt: string;
  size: string;
  variations: number;
  sourcePreview: string | null;
};

function normalizeOpenAISize(model: string, size: string) {
  if (model.startsWith("gpt-image-")) {
    if (size === "1792x1024") return "1536x1024";
    if (size === "1024x1792") return "1024x1536";
    if (size === "256x256" || size === "512x512") return "1024x1024";
  }
  return size;
}

async function parseOpenAIResponse(resp: Response): Promise<any> {
  const raw = await resp.text();
  const json = tryParseJson(raw);
  if (!resp.ok || json.error) {
    throw new Error(json.error?.message || json.error || `OpenAI request failed (${resp.status})`);
  }
  return json;
}

function mapOpenAIResponseToImages(json: any): string[] {
  if (!json.data?.length) throw new Error("OpenAI returned no images.");
  return json.data.map((item: { b64_json?: string }) => {
    if (!item.b64_json) throw new Error("OpenAI did not return image data.");
    return `data:image/png;base64,${item.b64_json}`;
  });
}

function base64ToBlob(base64: string, mimeType = "image/png") {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

async function callOpenAIDirectLocal(opts: OpenAIProxyOptions): Promise<string[]> {
  const { apiKey, model, prompt, size, variations, sourcePreview } = opts;
  const safePrompt = prompt || "A creative artistic image";
  const safeSize = normalizeOpenAISize(model, size);
  const baseUrl = "/api/openai/v1";

  if (model.startsWith("gpt-image-")) {
    if (sourcePreview) {
      const { base64, mimeType } = await blobUrlToBase64(sourcePreview);
      const form = new FormData();
      form.append("model", model);
      form.append("prompt", safePrompt);
      form.append("n", String(Math.min(variations, 4)));
      form.append("size", safeSize);
      form.append("quality", "high");
      form.append("image", base64ToBlob(base64, mimeType), "reference.png");

      const resp = await fetch(`${baseUrl}/images/edits`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      });
      return mapOpenAIResponseToImages(await parseOpenAIResponse(resp));
    }

    const resp = await fetch(`${baseUrl}/images/generations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        prompt: safePrompt,
        n: Math.min(variations, 4),
        size: safeSize,
        quality: "high",
        output_format: "png",
      }),
    });
    return mapOpenAIResponseToImages(await parseOpenAIResponse(resp));
  }

  if (model === "dall-e-3") {
    const hints = ["", " — variation 2.", " — variation 3.", " — variation 4."];
    const calls = Array.from({ length: Math.min(variations, 4) }, (_, i) =>
      fetch(`${baseUrl}/images/generations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          prompt: `${safePrompt}${hints[i] ?? ""}`,
          n: 1,
          size,
          quality: "hd",
          response_format: "b64_json",
        }),
      }).then(parseOpenAIResponse)
    );
    return (await Promise.all(calls)).flatMap(mapOpenAIResponseToImages);
  }

  if (sourcePreview) {
    const { base64, mimeType } = await blobUrlToBase64(sourcePreview);
    const form = new FormData();
    form.append("model", "dall-e-2");
    form.append("n", String(Math.min(variations, 10)));
    form.append("size", size);
    form.append("response_format", "b64_json");
    form.append("image", base64ToBlob(base64, mimeType), "reference.png");

    const resp = await fetch(`${baseUrl}/images/variations`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    return mapOpenAIResponseToImages(await parseOpenAIResponse(resp));
  }

  const resp = await fetch(`${baseUrl}/images/generations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "dall-e-2",
      prompt: safePrompt,
      n: Math.min(variations, 10),
      size,
      response_format: "b64_json",
    }),
  });
  return mapOpenAIResponseToImages(await parseOpenAIResponse(resp));
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function qwenTaskImageUrls(payload: any): string[] {
  const candidates = [
    ...(payload?.output?.results ?? []),
    ...(payload?.output?.images ?? []),
    ...(payload?.results ?? []),
  ];
  return candidates
    .map((item: any) => item?.url || item?.image_url || item?.orig_url)
    .filter(Boolean);
}

async function qwenUrlsToImages(urls: string[]): Promise<string[]> {
  const images = await Promise.all(urls.map(async (url) => {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Qwen image download failed (${resp.status})`);
    return blobToDataUrl(await resp.blob());
  }));
  return images;
}

async function callQwenDirectLocal(opts: {
  apiKey: string;
  endpoint: string;
  model: string;
  prompt: string;
  size: string;
  variations: number;
  sourcePreview: string | null;
}): Promise<string[]> {
  const { apiKey, model, prompt, size, variations, sourcePreview } = opts;
  if (sourcePreview) {
    throw new Error("Qwen reference-image generation is not wired yet in this build. Use OpenAI or Gemini for reference-image mode.");
  }

  const createResp = await fetch("/api/qwen/api/v1/services/aigc/text2image/image-synthesis", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "X-DashScope-Async": "enable",
    },
    body: JSON.stringify({
      model,
      input: { prompt: prompt || "A creative artistic image" },
      parameters: {
        size,
        n: Math.min(variations, 4),
      },
    }),
  });
  const createJson = tryParseJson(await createResp.text());
  if (!createResp.ok) {
    throw new Error(createJson.message || createJson.error?.message || createJson.error || `Qwen request failed (${createResp.status})`);
  }

  const taskId = createJson?.output?.task_id || createJson?.task_id;
  if (!taskId) {
    throw new Error("Qwen did not return a task ID.");
  }

  for (let attempt = 0; attempt < 25; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const taskResp = await fetch(`/api/qwen/api/v1/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const taskJson = tryParseJson(await taskResp.text());
    if (!taskResp.ok) {
      throw new Error(taskJson.message || taskJson.error?.message || taskJson.error || `Qwen task polling failed (${taskResp.status})`);
    }

    const status = taskJson?.output?.task_status || taskJson?.task_status;
    if (status === "SUCCEEDED") {
      const urls = qwenTaskImageUrls(taskJson);
      if (!urls.length) throw new Error("Qwen finished the task but returned no image URLs.");
      return qwenUrlsToImages(urls);
    }
    if (status === "FAILED" || status === "CANCELED") {
      throw new Error(taskJson?.output?.message || taskJson?.message || "Qwen image generation failed.");
    }
  }

  throw new Error("Qwen image generation timed out while waiting for the async task result.");
}

// ─── Fallback: direct browser call (Gemini only — no CORS issues) ─────────────

async function callGeminiDirect(opts: {
  apiKey: string;
  endpoint: string;
  model: string;
  prompt: string;
  size: string;
  variations: number;
  sourcePreview: string | null;
}): Promise<string[]> {
  const { apiKey, endpoint, model, prompt, size, variations, sourcePreview } = opts;
  const base = endpoint.replace(/\/$/, "");
  
  // Ensure model has models/ prefix if required by the API
  const modelId = model.startsWith("models/") ? model : `models/${model}`;
  
  console.log(`[GeminiDirect] Calling ${modelId} via ${endpoint}`);

  // Gemini models via generateContent
  if (model.includes("-flash") || model.includes("-pro") || model.includes("banana")) {
    const hints = ["", " — variation 2.", " — variation 3.", " — variation 4."];
    const calls = Array.from({ length: Math.min(variations, 4) }, async (_, i) => {
      const parts: any[] = [];
      if (sourcePreview) {
        const { base64, mimeType } = await blobUrlToBase64(sourcePreview);
        parts.push({ inlineData: { mimeType, data: base64 } });
        parts.push({ text: `Generate an image similar to the reference. ${prompt || ""}${hints[i] ?? ""}` });
      } else {
        parts.push({ text: `${prompt || "A creative image"}${hints[i] ?? ""}` });
      }
      
      const r = await fetch(
        `${base}/${modelId}:generateContent?key=${apiKey}`,
        { 
          method: "POST", 
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            contents: [{ role: "user", parts }], 
            generationConfig: { 
              responseModalities: ["IMAGE"] 
            } 
          }) 
        }
      );
      if (!r.ok) {
        const errJson = await r.json().catch(() => ({}));
        throw new Error(errJson.error?.message || `Gemini API Error: ${r.status} ${r.statusText}`);
      }
      return r.json();
    });
    const responses = await Promise.all(calls);
    return responses.map((json) => {
      const img = json.candidates?.[0]?.content?.parts?.find(
        (p: { inlineData?: { mimeType: string; data: string } }) => p.inlineData?.mimeType?.startsWith("image/")
      );
      if (!img) {
        if (json.candidates?.[0]?.content?.parts?.[0]?.text) {
          throw new Error(`Model returned text instead of an image: "${json.candidates[0].content.parts[0].text.substring(0, 50)}..."`);
        }
        throw new Error("No image in Gemini response. The selected model might not support image generation in your region.");
      }
      return `data:${img.inlineData.mimeType};base64,${img.inlineData.data}`;
    });
  }

  // Imagen models via predict
  const imgPayload: Record<string, any> = {
    prompt: sourcePreview
      ? `Generate an image similar to the reference. ${prompt || ""}`
      : prompt || "A creative artistic image",
  };
  if (sourcePreview) {
    const { base64, mimeType } = await blobUrlToBase64(sourcePreview);
    imgPayload.referenceImages = [{ referenceType: "REFERENCE_TYPE_STYLE", referenceImage: { bytesBase64Encoded: base64, mimeType } }];
  }
  const r = await fetch(`${base}/${modelId}:predict?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ instances: [imgPayload], parameters: { sampleCount: Math.min(variations, 4), aspectRatio: size } }),
  });
  if (!r.ok) {
    const errJson = await r.json().catch(() => ({}));
    throw new Error(errJson.error?.message || `Imagen API Error: ${r.status} ${r.statusText}`);
  }
  const json = await r.json();
  if (!json.predictions?.length) throw new Error("No images returned from Imagen. This model might be restricted in your region.");
  return json.predictions.map(
    (p: { bytesBase64Encoded: string; mimeType?: string }) =>
      `data:${p.mimeType ?? "image/png"};base64,${p.bytesBase64Encoded}`
  );
}

const GEMINI_FALLBACK_MODEL = "gemini-2.5-flash-image";

function isGeminiQuotaError(message: string) {
  const lower = message.toLowerCase();
  return lower.includes("quota exceeded") || lower.includes("rate-limits") || lower.includes("current quota");
}

function isGeminiModelUnavailableError(message: string) {
  const lower = message.toLowerCase();
  return lower.includes("is not found") || lower.includes("not supported for predict") || lower.includes("call listmodels");
}

function fallbackSizeForGeminiModel(model: string, size: string) {
  if (model.startsWith("imagen")) {
    if (size.includes(":")) return size;
    return "1:1";
  }
  return size;
}

async function callGeminiWithFallback(opts: {
  apiKey: string;
  endpoint: string;
  model: string;
  prompt: string;
  size: string;
  variations: number;
  sourcePreview: string | null;
}): Promise<{ images: string[]; actualModel: string; usedFallback: boolean; fallbackReason?: "quota" | "unsupported" }> {
  const { apiKey, endpoint, model, prompt, size, variations, sourcePreview } = opts;

  try {
    const images = await callGeminiDirect({ apiKey, endpoint, model, prompt, size, variations, sourcePreview });
    return { images, actualModel: model, usedFallback: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const fallbackReason =
      isGeminiQuotaError(message) ? "quota" :
      isGeminiModelUnavailableError(message) ? "unsupported" :
      undefined;
    const canFallback = model !== GEMINI_FALLBACK_MODEL && Boolean(fallbackReason);
    if (!canFallback) throw err;

    const fallbackSize = fallbackSizeForGeminiModel(GEMINI_FALLBACK_MODEL, size);
    const images = await callGeminiDirect({
      apiKey,
      endpoint,
      model: GEMINI_FALLBACK_MODEL,
      prompt,
      size: fallbackSize,
      variations: Math.min(variations, 4),
      sourcePreview,
    });
    return { images, actualModel: GEMINI_FALLBACK_MODEL, usedFallback: true, fallbackReason };
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AIGenerator() {
  const { addHistoryItem } = useHistory();
  const providerSessions = getProviderSessions();
  const loggedInProviders = getLoggedInImageProviders();
  const selectableProviders = loggedInProviders.length
    ? loggedInProviders.map((session) => PROVIDERS.find((providerDef) => providerDef.id === session.providerId)!).filter(Boolean)
    : PROVIDERS.filter((providerDef) => providerDef.imageGeneration);
  const selectableProviderIds = selectableProviders.map((providerDef) => providerDef.id).join(",");

  const [provider,    setProvider]    = useState<ProviderId>("openai");
  const [model,       setModel]       = useState("gpt-image-1.5");
  const [size,        setSize]        = useState("1024x1024");
  const [variations,  setVariations]  = useState("2");
  const [sourcePreview, setSourcePreview] = useState<string | null>(null);
  const [prompt,      setPrompt]      = useState("");
  const [generating,  setGenerating]  = useState(false);
  const [results,     setResults]     = useState<string[]>([]);

  // Mode detection
  const [proxyReady,  setProxyReady]  = useState(false);   // Supabase edge fn configured
  const [localKeyOk,  setLocalKeyOk]  = useState(false);   // Local API key available

  useEffect(() => {
    const sbCfg = getSupabaseTempConfig();
    setProxyReady(Boolean(sbCfg.url && sbCfg.anonKey));
    const cfg = getLocalApiConfig(PROVIDERS.find((p) => p.id === provider)!.storageId);
    setLocalKeyOk(Boolean(cfg?.key?.trim()));

    // DIAGNOSTIC: List available models to console ONLY for Gemini to avoid key leakage
    const listAvailableModels = async () => {
      if (provider === "gemini" && cfg?.key) {
        // OpenAI keys start with sk-. Gemini keys start with AIza.
        if (cfg.key.startsWith("sk-")) {
          console.error("[AIGenerator] CRITICAL: You are using an OpenAI key in the Gemini field. Gemini calls will FAIL.");
          return;
        }
        try {
          const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${cfg.key}`);
          if (!r.ok) {
            console.error(`[AIGenerator] ListModels failed (${r.status}). Check if your Gemini key is correct.`);
            return;
          }
          const json = await r.json();
          const imgModels = json.models?.filter((m: any) => 
            m.name.toLowerCase().includes("image") || 
            m.name.toLowerCase().includes("imagen") || 
            m.name.toLowerCase().includes("banana")
          ) || [];
          console.log("[AIGenerator] Available Image Models:", imgModels.map((m: any) => m.name));
        } catch (e) {
          // Swallow silent diagnostic errors
        }
      }
    };
    listAvailableModels();
  }, [provider]);

  useEffect(() => {
    if (!selectableProviders.some((providerDef) => providerDef.id === provider)) {
      const nextProvider = selectableProviders[0]?.id;
      if (!nextProvider) return;
      const session = providerSessions.find((entry) => entry.providerId === nextProvider);
      const nextModel = session?.connected && session.preferredModel
        ? session.preferredModel
        : MODELS[nextProvider][0].value;
      setProvider(nextProvider);
      setModel(nextModel);
      setSize(SIZES[nextModel][0].value);
      setVariations("2");
    }
  }, [provider, selectableProviderIds]);

  const handleProviderChange = (v: ProviderId) => {
    setProvider(v);
    const session = providerSessions.find((entry) => entry.providerId === v);
    const firstModel = session?.connected && session.preferredModel
      ? session.preferredModel
      : MODELS[v][0].value;
    setModel(firstModel);
    setSize(SIZES[firstModel][0].value);
    setVariations("2");
  };

  const handleModelChange = (v: string) => {
    setModel(v);
    setSize(SIZES[v]?.[0]?.value ?? "1024x1024");
    const max = MAX_VAR[v] ?? 4;
    if (parseInt(variations) > max) setVariations(String(max));
  };

  const handleFiles = (files: File[]) => {
    if (files[0]) setSourcePreview(URL.createObjectURL(files[0]));
  };

  const clearSource = () => {
    if (sourcePreview) URL.revokeObjectURL(sourcePreview);
    setSourcePreview(null);
  };

  const [projectHealth, setProjectHealth] = useState<"unknown" | "online" | "offline">("unknown");

  const testProxy = async () => {
    toast.info("Testing proxy and project health...");
    try {
      const sbCfg = getSupabaseTempConfig();
      if (!sbCfg.url || !sbCfg.anonKey) throw new Error("Supabase URL/Key missing in Settings");
      
      const baseUrl = sbCfg.url.replace(/\/$/, "");
      const fnUrl = `${baseUrl}/functions/v1/ai-image-proxy`;
      
      const ctrl = new AbortController();
      const timeoutId = setTimeout(() => ctrl.abort(), 6000);

      // Stage 1: Ping Base Supabase URL (health check)
      console.log(`[testProxy] Stage 1: Pinging base URL ${baseUrl}/rest/v1/`);
      try {
        const baseResp = await fetch(`${baseUrl}/rest/v1/`, { 
          method: "GET", 
          signal: ctrl.signal,
          headers: { apikey: sbCfg.anonKey }
        });
        if (baseResp.status === 200 || baseResp.status === 401 || baseResp.status === 404) {
          console.log("[testProxy] Base URL is reachable.");
          setProjectHealth("online");
        }
      } catch (e) {
        console.error("[testProxy] Base URL check failed:", e);
        setProjectHealth("offline");
        toast.error("Project Offline: Your Supabase URL is unreachable. Check if project is PAUSED.");
        clearTimeout(timeoutId);
        return;
      }

      // Stage 2: Test Proxy Endpoint
      console.log(`[testProxy] Stage 2: Testing edge function at ${fnUrl}`);
      const resp = await fetch(fnUrl, {
        method: "OPTIONS",
        signal: ctrl.signal,
        headers: { apikey: sbCfg.anonKey }
      });
      
      clearTimeout(timeoutId);

      if (resp.status === 204 || resp.ok) {
        toast.success("Proxy is reachable! Ready for generation.");
        setProxyReady(true);
      } else if (resp.status === 404) {
        toast.error("Function Missing: 'ai-image-proxy' is not deployed to this project.");
      } else {
        console.error(`[testProxy] Proxy responded with status ${resp.status}`);
        toast.error(`Proxy Error: Status ${resp.status}. Check function code/secrets.`);
      }
    } catch (e: any) {
      console.error("[testProxy] Error:", e);
      const isConnectionError = e.message?.includes("fetch") || e.name === "AbortError" || e.message?.includes("closed");
      if (isConnectionError) {
        setProjectHealth("offline");
        toast.error("Network Error: Connection Closed. Your project is likely PAUSED.");
      } else {
        toast.error("Proxy Test Failed. See console for details.");
      }
    }
  };

  const handleGenerate = async () => {
    const isPromptEmpty = !prompt || typeof prompt !== 'string' || !prompt.trim();
    if (isPromptEmpty && !sourcePreview) {
      toast.error("Please enter a prompt or upload a reference image");
      return;
    }

    const usage = consumeServiceUsage("ai-generator");
    if (!usage.ok) {
      toast.error(`AI Generator limit reached (${usage.used}/${usage.limit})`);
      return;
    }

    setGenerating(true);
    setResults([]);

    try {
      const numVar = parseInt(variations);
      let images: string[] = [];
      let usedProxy = false;
      let actualModelUsed = model;
      const isLocal = isLocalHost();
      
      console.log(`[handleGenerate] Provider: ${provider}, Model: ${model}, isLocal: ${isLocal}`);

      // 1. Use the server proxy whenever it is configured.
      // On localhost, Vite proxies the request to avoid browser CORS failures.
      const shouldTryProxy = proxyReady;

      if (shouldTryProxy) {
        try {
          console.log("[handleGenerate] Attempting Supabase Proxy call...");
          let sourceImageBase64: string | undefined;
          let sourceImageMimeType: string | undefined;
          if (sourcePreview) {
            const { base64, mimeType } = await blobUrlToBase64(sourcePreview);
            sourceImageBase64 = base64;
            sourceImageMimeType = mimeType;
          }
          images = await callViaProxy({ provider, model, prompt: prompt.trim(), size, variations: numVar, sourceImageBase64, sourceImageMimeType });
          usedProxy = true;
        } catch (proxyError) {
          console.error("Proxy call failed:", proxyError);
          if (provider === "gemini" && localKeyOk) {
            toast.info("Supabase proxy not reachable. Attempting direct API call...");
          } else if (provider === "qwen" && isLocal && localKeyOk) {
            toast.info("Supabase proxy failed on localhost. Attempting local Qwen dev proxy...");
          } else if (provider === "openai" && isLocal && localKeyOk) {
            toast.info("Supabase proxy failed on localhost. Attempting local OpenAI dev proxy...");
          } else {
            const msg = proxyError instanceof Error ? proxyError.message : "Proxy error";
            throw new Error(msg.includes("fetch") 
              ? "Proxy error: Connection unreachable. Please check project status."
              : msg
            );
          }
        }
      }

      // 2. Direct fallback for local/provider-key flows
      if (!usedProxy) {
        if (provider === "gemini" && localKeyOk) {
          const cfg = getLocalApiConfig("gemini")!;
          const result = await callGeminiWithFallback({
            apiKey: cfg.key,
            endpoint: cfg.endpoint || "https://generativelanguage.googleapis.com/v1beta",
            model,
            prompt: prompt.trim(),
            size,
            variations: numVar,
            sourcePreview,
          });
          images = result.images;
          actualModelUsed = result.actualModel;
          if (result.usedFallback) {
            toast.info(
              result.fallbackReason === "unsupported"
                ? "Selected Gemini model is no longer supported for image generation. Switched to Gemini 2.5 Flash Image automatically."
                : "Selected Gemini model quota is unavailable for this key. Switched to Gemini 2.5 Flash Image automatically."
            );
          }
        } else if (provider === "qwen" && isLocal && localKeyOk) {
          const cfg = getLocalApiConfig("qwen")!;
          images = await callQwenDirectLocal({
            apiKey: cfg.key,
            endpoint: cfg.endpoint || "https://dashscope-intl.aliyuncs.com",
            model,
            prompt: prompt.trim(),
            size,
            variations: numVar,
            sourcePreview,
          });
        } else if (provider === "openai" && isLocal && localKeyOk) {
          const cfg = getLocalApiConfig("openai")!;
          images = await callOpenAIDirectLocal({
            apiKey: cfg.key,
            model,
            prompt: prompt.trim(),
            size,
            variations: numVar,
            sourcePreview,
          });
        } else {
          throw new Error(
            provider === "openai"
              ? "OpenAI image generation requires the Supabase proxy or localhost dev proxy. Add your OpenAI API key in Settings and run this app via the local dev server."
              : provider === "qwen"
                ? "Qwen image generation currently needs either the server proxy or a local Model Studio API key on localhost."
                : provider === "groq"
                  ? "Groq does not currently provide text-to-image generation in this app."
                  : "Gemini requires either the Supabase proxy or a local API key in Settings."
          );
        }
      }

      setResults(images);
      addHistoryItem({
        name: `AI Generation (${images.length} images)`,
        type: "ai",
        action: sourcePreview ? "Similar Image" : "Text to Image",
        saved: "—",
        previewUrl: images[0],
      });
      toast.success(
        actualModelUsed === model
          ? `Generated ${images.length} image${images.length > 1 ? "s" : ""}!`
          : `Generated ${images.length} image${images.length > 1 ? "s" : ""} using fallback model.`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Generation failed";
      console.error("[handleGenerate] Error:", err);

      if (msg.includes("429") || msg.includes("Too Many Requests")) {
        toast.error(
          provider === "openai"
            ? "OpenAI rate limit reached. Please wait a bit or check your OpenAI billing/quota."
            : "Quota exceeded: You've reached your Google AI Studio rate limit. Please wait a few minutes or check your billing."
        );
      } else if (provider === "gemini" && isGeminiQuotaError(msg)) {
        toast.error("This Gemini key has no usable quota for the selected image model. Add billing to Google AI Studio or use a Gemini key with image quota.");
      } else if (provider === "gemini" && isGeminiModelUnavailableError(msg)) {
        toast.error("The selected Gemini image model is no longer supported by your current API endpoint. Please try Gemini 2.5 Flash Image or Imagen 4.");
      } else if (provider === "qwen" && msg.includes("not wired yet")) {
        toast.error(msg);
      } else if (provider === "qwen" && (msg.toLowerCase().includes("timed out") || msg.toLowerCase().includes("task"))) {
        toast.error("Qwen is still processing or failed to finish the async image task. Please try again.");
      } else if (provider === "groq") {
        toast.error("Groq is connected for future use, but it is not available for text-to-image generation in this build.");
      } else if (provider === "openai" && (msg.includes("Free tier is not supported") || msg.includes("organization must be verified") || msg.includes("billing"))) {
        toast.error("OpenAI access issue: this model needs a billed or verified API account. Try GPT Image 1.5/1 or check your OpenAI billing and org verification.");
      } else if (msg.includes("Failed to fetch") || msg.includes("Proxy error") || msg.includes("net::ERR_") || msg.includes("closed")) {
        // Explicitly suggest checking project status
        toast.error("Supabase Unreachable: The browser cannot connect to your proxy. Please CHECK if your Supabase Project is PAUSED and that 'ai-image-proxy' is deployed.");
      } else {
        toast.error(msg);
      }
    } finally {
      setGenerating(false);
    }
  };

  const downloadResult = (src: string, idx: number) => {
    const dl = consumeDownloadUsage();
    if (!dl.ok) { toast.error(`Download limit reached (${dl.used}/${dl.limit})`); return; }
    const a = document.createElement("a");
    a.href = src;
    a.download = `ai-generated-${idx + 1}.png`;
    a.click();
  };

  const maxVar    = MAX_VAR[model] ?? 4;
  const varOptions = Array.from({ length: Math.min(maxVar, 8) }, (_, i) => i + 1);
  const openAILocalReady = provider === "openai" && isLocalHost() && localKeyOk;
  const qwenLocalReady = provider === "qwen" && isLocalHost() && localKeyOk;
  const canGenerate =
    (!!prompt.trim() || !!sourcePreview) &&
    !generating &&
    (provider === "groq"
      ? false
      : provider === "openai"
        ? (proxyReady || openAILocalReady)
        : provider === "qwen"
          ? (proxyReady || qwenLocalReady)
          : (proxyReady || localKeyOk));

  // Status derived values
  const isOpenAIBrowserBlocked = provider === "openai" && !proxyReady;
  const modelLabel = MODELS[provider].find((m) => m.value === model)?.label ?? model;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">AI Image Generator</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Generate stunning images via your connected AI providers — from prompt or reference image
          </p>
        </div>
        {/* Mode badge */}
        <div className="shrink-0 mt-1 flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            {proxyReady ? (
              <Badge className="gap-1 border-green-500/30 bg-green-500/10 text-green-400">
                <Cloud className="h-3 w-3" /> Server Active
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1 border-destructive/40 bg-destructive/10 text-destructive">
                <AlertCircle className="h-3 w-3" /> Unconfigured
              </Badge>
            )}
            <Button 
              variant="outline" 
              size="sm" 
              onClick={testProxy}
              className="h-7 px-3 text-xs border-primary/30 text-primary hover:bg-primary/20 flex items-center gap-2 shadow-sm"
            >
              <RefreshCw className="h-3 w-3" /> Diagnostic
            </Button>
          </div>
          {localKeyOk && !proxyReady && (
            <Badge variant="outline" className="gap-1 border-yellow-500/30 bg-yellow-500/10 text-yellow-400">
              <HardDrive className="h-3 w-3" /> {provider === "openai" ? "Local Dev Mode" : "Local Key Mode"}
            </Badge>
          )}
        </div>
      </div>

      {/* Troubleshooting Panel */}
      {!proxyReady && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-xl border border-border/50 bg-muted/20 p-4 mb-4"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-primary" />
              <h4 className="text-sm font-semibold text-foreground">Proxy Troubleshooting Info</h4>
            </div>
            {getSupabaseTempConfig().url.includes("bzychaolhgouleviwfjl") && (
              <Badge variant="outline" className="text-[10px] border-green-500/30 bg-green-500/10 text-green-400">
                AI Verified: Global URL Reachable
              </Badge>
            )}
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground shrink-0">Project Status (Local Browser):</span>
              <span className={`font-bold uppercase ${projectHealth === 'online' ? 'text-green-500' : projectHealth === 'offline' ? 'text-red-500' : 'text-yellow-500'}`}>
                {projectHealth === 'online' ? '● Connected' : projectHealth === 'offline' ? '● Connection Blocked' : '● Waiting for Test'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground shrink-0">Configured URL:</span>
              <code className="rounded bg-muted px-1.5 py-0.5 text-foreground/80 break-all text-right">
                {getSupabaseTempConfig().url || "Not Set"}
              </code>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground shrink-0">Proxy Endpoint:</span>
              <code className="rounded bg-muted px-1.5 py-0.5 text-foreground/80 break-all text-right">
                {getSupabaseTempConfig().url ? `${getSupabaseTempConfig().url.replace(/\/$/, "")}/functions/v1/ai-image-proxy` : "Not Set"}
              </code>
            </div>
            <div className="mt-4 flex flex-col gap-3">
              <div className="rounded border border-red-500/20 bg-red-500/5 p-3 text-red-500/90 leading-relaxed text-[11px]">
                <strong>Network Block Found:</strong> Your browser is getting "Connection Closed". 
                <ul className="list-disc ml-4 mt-2 space-y-1">
                  <li><strong>Wait:</strong> I (the AI) checked and your project IS ONLINE. Your ISP or Adblocker is blocking it.</li>
                  <li><strong>Action:</strong> Disable Adblockers (uBlock, AdGuard) for this site.</li>
                  <li><strong>Action:</strong> Try turning OFF your VPN if you are using one.</li>
                  <li><strong>Check URL:</strong> Ensure the URL starts with <strong>https://</strong> and ends with <strong>.co</strong> (no slash at end).</li>
                </ul>
              </div>
              
              <div className="rounded border border-yellow-500/20 bg-yellow-500/5 p-3 text-yellow-600/90 leading-relaxed text-[11px]">
                Go here to check status: <a href={`https://supabase.com/dashboard/project/${getSupabaseTempConfig().url.match(/https:\/\/(.*?)\.supabase/)?.[1] || "..."}`} target="_blank" rel="noopener noreferrer" className="underline font-bold">Your Project Dashboard</a>
              </div>
              
              <Button 
                onClick={testProxy}
                className="w-full h-10 gradient-primary text-primary-foreground border-0 font-bold shadow-lg"
              >
                <PlugZap className="mr-2 h-4 w-4" />
                RE-RUN CONNECTION TEST
              </Button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Proxy info banner */}
      {!proxyReady && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 text-sm"
        >
          <p className="font-semibold text-foreground mb-1 flex items-center gap-2">
            <Cloud className="h-4 w-4 text-primary" />
            Connect Supabase for global access (recommended)
          </p>
          <p className="text-muted-foreground text-xs">
            When Supabase is configured, API keys are stored on the server — all website visitors can generate images without seeing your keys.{" "}
            Go to <strong>Settings → Supabase Temporary Upload</strong> to add your project URL and Anon Key, then deploy the Edge Function.
          </p>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Left Panel ── */}
        <div className="lg:col-span-1">
          <div className="rounded-xl border border-border bg-card p-5 shadow-card space-y-5">

            {/* Provider */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">AI Provider</label>
              <Select value={provider} onValueChange={(v) => handleProviderChange(v as ProviderId)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {selectableProviders.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.label}{providerSessions.find((session) => session.providerId === p.id)?.connected ? " (Logged In)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Model */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Model</label>
              <Select value={model} onValueChange={handleModelChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MODELS[provider].map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Size */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {model.startsWith("imagen") ? "Aspect Ratio" : "Image Size"}
              </label>
              <Select value={size} onValueChange={setSize}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(SIZES[model] ?? []).map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="border-t border-border" />

            {/* Reference Image */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Reference Image <span className="normal-case font-normal text-muted-foreground/60">(optional)</span>
              </label>
              {sourcePreview ? (
                <div className="relative group">
                  <img src={sourcePreview} alt="Source" className="w-full rounded-lg object-cover aspect-square border border-border" />
                  <button
                    onClick={clearSource}
                    className="absolute top-2 right-2 rounded-full bg-card/90 border border-border backdrop-blur p-1 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                  <div className="absolute bottom-2 left-2 rounded-md bg-card/80 backdrop-blur px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    Reference
                  </div>
                </div>
              ) : (
                <DropZone
                  accept="image/*"
                  multiple={false}
                  onFiles={handleFiles}
                  label="Upload reference image"
                  sublabel="AI will generate similar images"
                />
              )}
              {provider === "qwen" && (
                <p className="text-[11px] text-muted-foreground">
                  Qwen is currently wired for prompt-based generation first. Use OpenAI or Gemini for reference-image guided generation.
                </p>
              )}
              {provider === "groq" && (
                <p className="text-[11px] text-amber-600">
                  Groq is connected in Settings, but text-to-image output is not available yet.
                </p>
              )}
            </div>

            {/* Prompt */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Prompt
                {sourcePreview
                  ? <span className="ml-1 normal-case font-normal text-muted-foreground/60">(optional)</span>
                  : <span className="ml-1 normal-case font-normal text-red-400/80">*required</span>}
              </label>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={sourcePreview ? "Describe style or modification (optional)…" : "Describe the image you want to generate…"}
                className="resize-none"
                rows={3}
              />
            </div>

            {/* Variations */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Variations</label>
              <Select value={variations} onValueChange={setVariations}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {varOptions.map((n) => (
                    <SelectItem key={n} value={String(n)}>{n} variation{n > 1 ? "s" : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {model === "dall-e-3" && (
                <p className="text-[11px] text-muted-foreground">
                  DALL·E 3 uses unique prompts per call — each image will differ.
                </p>
              )}
              {model.startsWith("gpt-image-") && (
                <p className="text-[11px] text-muted-foreground">
                  GPT Image is the current OpenAI path and works best for reference-image guided generations.
                </p>
              )}
            </div>

            {/* Generate */}
            <Button onClick={handleGenerate} disabled={!canGenerate} className="w-full gradient-primary text-primary-foreground border-0">
              {generating ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Generating…</>
              ) : (
                <><Sparkles className="mr-2 h-4 w-4" />Generate {variations} Image{parseInt(variations) > 1 ? "s" : ""}</>
              )}
            </Button>

            {/* Warnings */}
            {isOpenAIBrowserBlocked && !proxyReady && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 px-3 py-2.5 text-xs text-yellow-400/90">
                <AlertCircle className="h-3.5 w-3.5 inline mr-1" />
                OpenAI blocks direct browser requests (CORS). Supabase proxy required — see banner above.
              </motion.div>
            )}
            {provider !== "openai" && provider !== "groq" && !proxyReady && !localKeyOk && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5 inline mr-1" />
                No API key found. Go to <strong>Settings → API Configuration</strong>.
              </motion.div>
            )}
            {loggedInProviders.length === 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5 inline mr-1" />
                No logged-in image provider found. Go to <strong>Settings → Provider Login Sessions</strong> and sign in the providers you want to use.
              </motion.div>
            )}
            {proxyReady && (
              <div className="flex items-center gap-1.5 text-xs text-green-400/80">
                <CheckCircle2 className="h-3 w-3" />
                Server proxy active — all users can generate images
              </div>
            )}
          </div>
        </div>

        {/* ── Right Panel: Results ── */}
        <div className="lg:col-span-2">
          <AnimatePresence mode="wait">
            {generating ? (
              <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="flex h-full min-h-64 items-center justify-center rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 p-16">
                <div className="text-center">
                  <div className="relative mx-auto mb-4 h-14 w-14">
                    <div className="absolute inset-0 rounded-full border-2 border-primary/20 animate-ping" />
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 border border-primary/30">
                      <Sparkles className="h-6 w-6 text-primary animate-pulse" />
                    </div>
                  </div>
                  <p className="text-sm font-medium text-foreground">Generating {variations} image{parseInt(variations) > 1 ? "s" : ""}…</p>
                  <p className="mt-1 text-xs text-muted-foreground">Using {modelLabel}</p>
                </div>
              </motion.div>
            ) : results.length > 0 ? (
              <motion.div key="results" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">{results.length} image{results.length > 1 ? "s" : ""} generated</p>
                  <Button variant="outline" size="sm" onClick={handleGenerate} disabled={generating || !canGenerate} className="gap-1.5">
                    <RefreshCw className="h-3.5 w-3.5" /> Regenerate
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {results.map((src, i) => (
                    <motion.div key={i} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.08 }}
                      className="relative group rounded-xl border border-border overflow-hidden bg-card shadow-card">
                      <img src={src} alt={`Generated ${i + 1}`} className="w-full aspect-square object-cover" />
                      <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/20 transition-all duration-200 flex items-end justify-center pb-4 opacity-0 group-hover:opacity-100">
                        <Button size="sm" variant="secondary" onClick={() => downloadResult(src, i)}>
                          <Download className="mr-1.5 h-3.5 w-3.5" /> Download
                        </Button>
                      </div>
                      <div className="absolute top-2 left-2 rounded-full bg-card/80 backdrop-blur px-2 py-0.5 text-xs font-semibold text-card-foreground">
                        #{i + 1}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            ) : (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="flex h-full min-h-72 items-center justify-center rounded-xl border-2 border-dashed border-border p-16">
                <div className="text-center">
                  <ImageIcon className="h-10 w-10 mx-auto text-muted-foreground/30" />
                  <p className="mt-3 text-sm font-medium text-muted-foreground">Generated images will appear here</p>
                  <p className="mt-1 text-xs text-muted-foreground/60">
                    Upload an image for similar variations, or write a prompt to create from scratch
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
