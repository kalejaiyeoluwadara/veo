/**
 * Fallback chat provider used when Gemini is unavailable (most often a free-tier
 * rate limit / 429). It speaks the OpenAI-compatible Chat Completions protocol.
 *
 * Default setup is OpenRouter, which gives one key + access to every strong
 * model, so you can switch models by changing only FALLBACK_MODEL.
 *
 * Required env:
 *   OPENROUTER_API_KEY  – your OpenRouter key (FALLBACK_API_KEY also accepted)
 *
 * Optional env (sensible OpenRouter defaults):
 *   FALLBACK_BASE_URL   – default "https://openrouter.ai/api/v1"
 *   FALLBACK_MODEL      – default "qwen/qwen3.7-plus"
 *                         cheaper/faster: "qwen/qwen3.6-flash"
 *   OPENROUTER_SITE_URL / OPENROUTER_APP_NAME – for OpenRouter attribution
 *
 * Want a different provider? Point it straight at them, e.g.:
 *   Qwen (DashScope): FALLBACK_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1  FALLBACK_MODEL=qwen-plus
 *   Zhipu GLM:        FALLBACK_BASE_URL=https://open.bigmodel.cn/api/paas/v4  FALLBACK_MODEL=glm-4-flash
 */

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_MODEL = "qwen/qwen3.7-plus";

export interface FallbackConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
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
  const model = process.env.FALLBACK_MODEL || DEFAULT_MODEL;

  return { apiKey, baseUrl, model };
}

/**
 * Streams a reply from the fallback provider, yielding text deltas as they
 * arrive (same shape the Gemini path produces, so the route can treat both
 * identically).
 */
export async function* streamFallbackReply(params: {
  config: FallbackConfig;
  system: string;
  history: FallbackMessage[];
  prompt: string;
  temperature?: number;
  maxTokens?: number;
}): AsyncGenerator<string> {
  const { config, system, history, prompt } = params;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.apiKey}`,
  };
  // Optional OpenRouter attribution (ignored by other providers).
  if (config.baseUrl.includes("openrouter.ai")) {
    headers["HTTP-Referer"] =
      process.env.OPENROUTER_SITE_URL || "http://localhost:3000";
    headers["X-Title"] = process.env.OPENROUTER_APP_NAME || "Audrey";
  }

  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: config.model,
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
    throw new Error(`Fallback provider error ${res.status}: ${detail.slice(0, 200)}`);
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
