// Throwaway: find a FREE OpenRouter model that actually streams right now.
// Reads .env.local directly. Never prints the API key.
import { readFile } from "node:fs/promises";

function parseEnv(t) {
  const e = {};
  for (const l of t.split("\n")) {
    const m = l.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) e[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
  return e;
}

const env = parseEnv(await readFile(new URL("../.env.local", import.meta.url), "utf8"));
const apiKey = env.OPENROUTER_API_KEY;
console.log("key present:", Boolean(apiKey));

const CANDIDATES = [
  "qwen/qwen3-next-80b-a3b-instruct:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "nousresearch/hermes-3-llama-3.1-405b:free",
  "cognitivecomputations/dolphin-mistral-24b-venice-edition:free",
  "google/gemma-4-31b-it:free",
  "openai/gpt-oss-120b:free",
];

async function tryModel(model) {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "Audrey",
      },
      body: JSON.stringify({
        model,
        stream: true,
        max_tokens: 80,
        messages: [
          { role: "system", content: "You are Audrey, a warm, playful, flirty Nigerian girlfriend. Reply in ONE short, natural spoken sentence." },
          { role: "user", content: "hey babe, I missed you today" },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      return { model, status: res.status, ok: false, note: body.slice(0, 140) };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "", full = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith("data:")) continue;
        const d = t.slice(5).trim();
        if (d === "[DONE]") continue;
        try {
          const delta = JSON.parse(d).choices?.[0]?.delta?.content;
          if (delta) full += delta;
        } catch {}
      }
    }
    return { model, status: 200, ok: true, reply: full.trim() };
  } catch (err) {
    return { model, status: "ERR", ok: false, note: String(err).slice(0, 140) };
  }
}

for (const m of CANDIDATES) {
  const r = await tryModel(m);
  if (r.ok) console.log(`✅ ${m}\n   → "${r.reply}"`);
  else console.log(`❌ ${m}  [${r.status}] ${r.note || ""}`);
}
