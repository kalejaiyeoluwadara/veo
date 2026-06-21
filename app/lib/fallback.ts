/**
 * Fallback chat provider used when Gemini is unavailable (most often a free-tier
 * rate limit / 429). It speaks the OpenAI-compatible Chat Completions protocol.
 *
 * Default setup is OpenRouter using FREE models (no credit required). Free
 * models are individually rate-limited, so we try a small list in order and use
 * the first that responds — that redundancy is what keeps a no-cost fallback
 * reliable. Switch/extend the list via FALLBACK_MODEL (comma-separated).
 *
 * Required env:
 *   OPENROUTER_API_KEY  – your OpenRouter key (FALLBACK_API_KEY also accepted)
 *
 * Optional env:
 *   FALLBACK_BASE_URL   – default "https://openrouter.ai/api/v1"
 *   FALLBACK_MODEL      – comma-separated model list, tried in order.
 *                         Default is free models. For best quality (needs
 *                         OpenRouter credits) use e.g. "qwen/qwen3.7-plus".
 *   OPENROUTER_SITE_URL / OPENROUTER_APP_NAME – for OpenRouter attribution
 */

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

// Free, non-reasoning, persona-friendly models — tried top to bottom until one
// isn't rate-limited. (Verified streaming warm, in-character replies.)
const DEFAULT_MODELS = [
  "google/gemma-4-31b-it:free",
  "openai/gpt-oss-120b:free",
  "qwen/qwen3-next-80b-a3b-instruct:free",
  "meta-llama/llama-3.3-70b-instruct:free",
];

export interface FallbackConfig {
  apiKey: string;
  baseUrl: string;
  models: string[];
}

export interface FallbackMessage {
  role: "user" | "assistant";
  content: string;
}

/** Returns the configured fallback provider, or null if no key is set. */
export function getFallbackConfig(): FallbackConfig | null {
  const apiKey =
    process.env.OPENROUTER_API_KEY ||
    process.env.FALLBACK_API_KEY ||
    process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return null;

  const baseUrl = (process.env.FALLBACK_BASE_URL || DEFAULT_BASE_URL).replace(
    /\/+$/,
    ""
  );

  const models = process.env.FALLBACK_MODEL
    ? process.env.FALLBACK_MODEL.split(",").map((m) => m.trim()).filter(Boolean)
    : DEFAULT_MODELS;

  return { apiKey, baseUrl, models };
}

/**
 * Streams a reply from the fallback provider, yielding text deltas as they
 * arrive (same shape the Gemini path produces, so the route can treat both
 * identically). Tries each configured model in order; if one is rate-limited
 * before producing any text, it moves on to the next.
 */
export async function* streamFallbackReply(params: {
  config: FallbackConfig;
  system: string;
  history: FallbackMessage[];
  prompt: string;
  temperature?: number;
  maxTokens?: number;
}): AsyncGenerator<string> {
  const { config } = params;
  let lastError: unknown;

  for (const model of config.models) {
    let yielded = 0;
    try {
      for await (const text of streamOneModel({ ...params, model })) {
        yielded += 1;
        yield text;
      }
      return; // model finished successfully
    } catch (err) {
      // If it already started streaming, don't retry (avoids duplicate text).
      if (yielded > 0) throw err;
      lastError = err;
      console.warn(`Fallback model ${model} failed, trying next:`, err);
    }
  }

  throw lastError ?? new Error("No fallback models configured");
}

/** Streams a single model; throws (before any yield) if it can't be reached. */
async function* streamOneModel(params: {
  config: FallbackConfig;
  model: string;
  system: string;
  history: FallbackMessage[];
  prompt: string;
  temperature?: number;
  maxTokens?: number;
}): AsyncGenerator<string> {
  const { config, model, system, history, prompt } = params;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.apiKey}`,
  };
  // Optional OpenRouter attribution (ignored by other providers).
  if (config.baseUrl.includes("openrouter.ai")) {
    headers["HTTP-Referer"] =
      process.env.OPENROUTER_SITE_URL || "http://localhost:3000";
    headers["X-Title"] = process.env.OPENROUTER_APP_NAME || "Voice";
  }

  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      stream: true,
      temperature: params.temperature ?? 1.0,
      max_tokens: params.maxTokens ?? 400,
      messages: [
        { role: "system", content: system },
        ...history.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new Error(`${model} → ${res.status}: ${detail.slice(0, 160)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") return;
      try {
        const json = JSON.parse(data);
        const delta: unknown = json?.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta) yield delta;
      } catch {
        // Ignore keep-alive comments / partial frames.
      }
    }
  }
}
