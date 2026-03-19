// Supabase Edge Function — AI Image Proxy
// Proxies image generation requests to OpenAI and Gemini APIs
// API keys are stored as Supabase secrets (OPENAI_API_KEY, GEMINI_API_KEY, QWEN_API_KEY)
// Deploy: supabase functions deploy ai-image-proxy

// No import needed for Deno.serve in Supabase Edge Functions

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, prefer, x-supabase-auth, range",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "content-range, content-length, etag",
  "Access-Control-Max-Age": "86400",
};

// ── OpenAI ──────────────────────────────────────────────────────────────────

const OPENAI_BASE = "https://api.openai.com/v1";
const OPENAI_CURRENT_MODEL = "gpt-image-1.5";
const OPENAI_COMPAT_MODEL = "gpt-image-1";

type OpenAIImageResponse = {
  data?: Array<{ b64_json?: string }>;
  error?: { message?: string };
};

const isGptImageModel = (model: string) => model.startsWith("gpt-image-");

const normalizeSizeForGptImage = (size: string) => {
  if (size === "1792x1024") return "1536x1024";
  if (size === "1024x1792") return "1024x1536";
  if (size === "256x256" || size === "512x512") return "1024x1024";
  return size || "1024x1024";
};

const base64ToBlob = (base64: string, mimeType = "image/png") => {
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
};

const blobFileName = (mimeType = "image/png") => {
  if (mimeType === "image/jpeg") return "image.jpg";
  if (mimeType === "image/webp") return "image.webp";
  return "image.png";
};

const formatOpenAIError = (status: number, statusText: string, message: string, model: string) => {
  const raw = message || `${status} ${statusText}`;
  const lower = raw.toLowerCase();

  if (lower.includes("free tier")) {
    return `OpenAI rejected ${model}: ${raw}. Free tier is not supported for this image model.`;
  }
  if (lower.includes("verified") && lower.includes("organization")) {
    return `OpenAI rejected ${model}: ${raw}. Your API org likely needs verification before image generation is enabled.`;
  }
  if (lower.includes("billing")) {
    return `OpenAI rejected ${model}: ${raw}. Check whether billing is enabled for your API project.`;
  }
  return `OpenAI rejected ${model}: ${raw}`;
};

async function readOpenAIResponse(resp: Response, model: string): Promise<OpenAIImageResponse> {
  const json = await resp.json().catch(() => ({}));
  const message = json?.error?.message || "";
  if (!resp.ok || json?.error) {
    throw new Error(formatOpenAIError(resp.status, resp.statusText, message, model));
  }
  return json;
}

const mapOpenAIImages = (json: OpenAIImageResponse) => {
  if (!json.data?.length) throw new Error("OpenAI returned no images.");
  return json.data.map((item) => {
    if (!item.b64_json) throw new Error("OpenAI did not return image bytes.");
    return `data:image/png;base64,${item.b64_json}`;
  });
};

async function generateWithGptImage(body: {
  apiKey: string;
  model: string;
  prompt: string;
  size: string;
  variations: number;
  sourceImageBase64?: string;
  sourceImageMimeType?: string;
}): Promise<string[]> {
  const { apiKey, model, prompt, size, variations, sourceImageBase64, sourceImageMimeType } = body;
  const safePrompt = prompt || "A creative artistic image";
  const safeSize = normalizeSizeForGptImage(size);

  if (sourceImageBase64) {
    const form = new FormData();
    form.append("image", base64ToBlob(sourceImageBase64, sourceImageMimeType), blobFileName(sourceImageMimeType));
    form.append("model", model);
    form.append("prompt", safePrompt);
    form.append("n", String(Math.min(variations, 4)));
    form.append("size", safeSize);
    form.append("quality", "high");

    const resp = await fetch(`${OPENAI_BASE}/images/edits`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    return mapOpenAIImages(await readOpenAIResponse(resp, model));
  }

  const resp = await fetch(`${OPENAI_BASE}/images/generations`, {
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
  return mapOpenAIImages(await readOpenAIResponse(resp, model));
}

const shouldFallbackFromLegacyDalle = (message: string) => {
  const lower = message.toLowerCase();
  return lower.includes("deprecated") || lower.includes("does not exist") || lower.includes("not found");
};

async function generateWithLegacyDalle3(body: {
  apiKey: string;
  prompt: string;
  size: string;
  variations: number;
}): Promise<string[]> {
  const { apiKey, prompt, size, variations } = body;
  const hints = [
    "",
    " — create a second distinct variation with different composition.",
    " — create a third variation with alternative perspective and lighting.",
    " — create a fourth variation from a fresh creative angle.",
  ];

  const calls = Array.from({ length: Math.min(variations, 4) }, (_, i) => {
    const fullPrompt = `${prompt || "A creative artistic image"}${hints[i] ?? ""}`;
    return fetch(`${OPENAI_BASE}/images/generations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: fullPrompt,
        n: 1,
        size,
        quality: "hd",
        response_format: "b64_json",
      }),
    }).then((resp) => readOpenAIResponse(resp, "dall-e-3"));
  });

  const responses = await Promise.all(calls);
  return responses.flatMap((json) => mapOpenAIImages(json));
}

async function generateWithLegacyDalle2(body: {
  apiKey: string;
  prompt: string;
  size: string;
  variations: number;
  sourceImageBase64?: string;
  sourceImageMimeType?: string;
}): Promise<string[]> {
  const { apiKey, prompt, size, variations, sourceImageBase64, sourceImageMimeType } = body;

  if (sourceImageBase64) {
    const form = new FormData();
    form.append("image", base64ToBlob(sourceImageBase64, sourceImageMimeType), blobFileName(sourceImageMimeType));
    form.append("n", String(Math.min(variations, 10)));
    form.append("size", size);
    form.append("response_format", "b64_json");
    form.append("model", "dall-e-2");

    const resp = await fetch(`${OPENAI_BASE}/images/variations`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    return mapOpenAIImages(await readOpenAIResponse(resp, "dall-e-2"));
  }

  const resp = await fetch(`${OPENAI_BASE}/images/generations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "dall-e-2",
      prompt: prompt || "A creative artistic image",
      n: Math.min(variations, 10),
      size,
      response_format: "b64_json",
    }),
  });
  return mapOpenAIImages(await readOpenAIResponse(resp, "dall-e-2"));
}

async function generateWithCurrentOpenAIModel(body: {
  apiKey: string;
  prompt: string;
  size: string;
  variations: number;
  sourceImageBase64?: string;
  sourceImageMimeType?: string;
}): Promise<string[]> {
  try {
    return await generateWithGptImage({ ...body, model: OPENAI_CURRENT_MODEL });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!message.toLowerCase().includes("not found")) throw err;
    return generateWithGptImage({ ...body, model: OPENAI_COMPAT_MODEL });
  }
}

async function openAIGenerate(body: {
  model: string;
  prompt: string;
  size: string;
  variations: number;
  sourceImageBase64?: string;
  sourceImageMimeType?: string;
}): Promise<string[]> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OpenAI API key not configured on server. Add OPENAI_API_KEY secret.");

  const { model, prompt, size, variations, sourceImageBase64, sourceImageMimeType } = body;

  if (isGptImageModel(model)) {
    return generateWithGptImage({ apiKey, model, prompt, size, variations, sourceImageBase64, sourceImageMimeType });
  }

  if (model === "dall-e-3") {
    if (sourceImageBase64) {
      return generateWithCurrentOpenAIModel({ apiKey, prompt, size, variations, sourceImageBase64, sourceImageMimeType });
    }

    try {
      return await generateWithLegacyDalle3({ apiKey, prompt, size, variations });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!shouldFallbackFromLegacyDalle(message)) throw err;
      return generateWithCurrentOpenAIModel({ apiKey, prompt, size, variations, sourceImageBase64, sourceImageMimeType });
    }
  }

  return generateWithLegacyDalle2({ apiKey, prompt, size, variations, sourceImageBase64, sourceImageMimeType });
}

// ── Gemini Imagen 3 ──────────────────────────────────────────────────────────

async function geminiImagenGenerate(body: {
  model: string;
  prompt: string;
  aspectRatio: string;
  variations: number;
  sourceImageBase64?: string;
  sourceImageMimeType?: string;
}): Promise<string[]> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("Gemini API key not configured on server. Add GEMINI_API_KEY secret.");

  const { model, prompt, aspectRatio, variations, sourceImageBase64, sourceImageMimeType } = body;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${apiKey}`;

  const instance: Record<string, unknown> = {
    prompt: sourceImageBase64
      ? `Generate an image similar to the reference image. ${prompt || "Match the style and composition."}`
      : prompt || "A creative artistic image",
  };

  if (sourceImageBase64 && sourceImageMimeType) {
    instance.referenceImages = [{
      referenceType: "REFERENCE_TYPE_STYLE",
      referenceImage: { bytesBase64Encoded: sourceImageBase64, mimeType: sourceImageMimeType },
    }];
  }

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      instances: [instance],
      parameters: { sampleCount: Math.min(variations, 4), aspectRatio },
    }),
  });
  const json = await resp.json();
  if (json.error) throw new Error(json.error.message || JSON.stringify(json.error));
  if (!json.predictions?.length) throw new Error("No images returned from Imagen");
  return json.predictions.map(
    (p: { bytesBase64Encoded: string; mimeType?: string }) =>
      `data:${p.mimeType ?? "image/png"};base64,${p.bytesBase64Encoded}`
  );
}

// ── Gemini Flash Image Generation ────────────────────────────────────────────

async function geminiFlashGenerate(body: {
  model: string;
  prompt: string;
  variations: number;
  sourceImageBase64?: string;
  sourceImageMimeType?: string;
}): Promise<string[]> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("Gemini API key not configured on server. Add GEMINI_API_KEY secret.");

  const { model, prompt, variations, sourceImageBase64, sourceImageMimeType } = body;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const hints = [
    "",
    " Create a second distinct variation.",
    " Create a third unique variation with different details.",
    " Create a fourth variation with a fresh perspective.",
  ];

  const calls = Array.from({ length: Math.min(variations, 4) }, async (_, i) => {
    const parts: unknown[] = [];
    if (sourceImageBase64 && sourceImageMimeType) {
      parts.push({ inlineData: { mimeType: sourceImageMimeType, data: sourceImageBase64 } });
      parts.push({
        text: `Generate an image similar in style and content to the uploaded reference image. ${prompt || ""}${hints[i] ?? ""}`,
      });
    } else {
      parts.push({ text: `${prompt || "A creative artistic image"}${hints[i] ?? ""}` });
    }

    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
      }),
    });
    return resp.json();
  });

  const responses = await Promise.all(calls);
  const results: string[] = [];

  for (const json of responses) {
    if (json.error) throw new Error(json.error.message || JSON.stringify(json.error));
    const imagePart = json.candidates?.[0]?.content?.parts?.find(
      (p: { inlineData?: { mimeType: string; data: string } }) =>
        p.inlineData?.mimeType?.startsWith("image/")
    );
    if (!imagePart) throw new Error("No image in Gemini Flash response");
    results.push(`data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`);
  }
  return results;
}

// ── Qwen / Wan Image Generation ──────────────────────────────────────────────

const QWEN_BASE = "https://dashscope-intl.aliyuncs.com";

const qwenTaskImageUrls = (payload: any): string[] => {
  const candidates = [
    ...(payload?.output?.results ?? []),
    ...(payload?.output?.images ?? []),
    ...(payload?.results ?? []),
  ];
  return candidates
    .map((item: any) => item?.url || item?.image_url || item?.orig_url)
    .filter(Boolean);
};

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
};

async function qwenUrlsToImages(urls: string[]): Promise<string[]> {
  const downloads = await Promise.all(urls.map(async (url) => {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Qwen image download failed (${resp.status})`);
    const mimeType = resp.headers.get("content-type") || "image/png";
    const bytes = new Uint8Array(await resp.arrayBuffer());
    return `data:${mimeType};base64,${bytesToBase64(bytes)}`;
  }));
  return downloads;
}

async function qwenGenerate(body: {
  model: string;
  prompt: string;
  size: string;
  variations: number;
  sourceImageBase64?: string;
}): Promise<string[]> {
  const apiKey = Deno.env.get("QWEN_API_KEY");
  if (!apiKey) throw new Error("Qwen API key not configured on server. Add QWEN_API_KEY secret.");
  if (body.sourceImageBase64) {
    throw new Error("Qwen reference-image generation is not enabled in this proxy yet.");
  }

  const createResp = await fetch(`${QWEN_BASE}/api/v1/services/aigc/text2image/image-synthesis`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "X-DashScope-Async": "enable",
    },
    body: JSON.stringify({
      model: body.model,
      input: { prompt: body.prompt || "A creative artistic image" },
      parameters: {
        size: body.size,
        n: Math.min(body.variations, 4),
      },
    }),
  });
  const createJson = await createResp.json().catch(() => ({}));
  if (!createResp.ok) {
    throw new Error(createJson?.message || createJson?.error?.message || `Qwen request failed (${createResp.status})`);
  }

  const taskId = createJson?.output?.task_id || createJson?.task_id;
  if (!taskId) throw new Error("Qwen did not return a task ID.");

  for (let attempt = 0; attempt < 25; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const taskResp = await fetch(`${QWEN_BASE}/api/v1/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const taskJson = await taskResp.json().catch(() => ({}));
    if (!taskResp.ok) {
      throw new Error(taskJson?.message || taskJson?.error?.message || `Qwen task polling failed (${taskResp.status})`);
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

// ── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  try {
    const {
      provider,
      model,
      prompt,
      size,            // OpenAI size or Gemini aspectRatio
      variations,
      sourceImageBase64,
      sourceImageMimeType,
    } = await req.json();

    let images: string[] = [];

    if (provider === "openai") {
      images = await openAIGenerate({ model, prompt, size, variations, sourceImageBase64, sourceImageMimeType });
    } else if (provider === "gemini") {
      if (model.startsWith("gemini-")) {
        images = await geminiFlashGenerate({ model, prompt, variations, sourceImageBase64, sourceImageMimeType });
      } else {
        images = await geminiImagenGenerate({ model, prompt, aspectRatio: size, variations, sourceImageBase64, sourceImageMimeType });
      }
    } else if (provider === "qwen") {
      images = await qwenGenerate({ model, prompt, size, variations, sourceImageBase64 });
    } else if (provider === "groq") {
      throw new Error("Groq does not currently support text-to-image generation in this proxy.");
    } else {
      throw new Error(`Unknown provider: ${provider}`);
    }

    return new Response(JSON.stringify({ images }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
