import { NextRequest, NextResponse } from "next/server";
import { Content, GoogleGenerativeAI } from "@google/generative-ai";
import {
  AUDREY_GENERATION_CONFIG,
  AUDREY_SYSTEM_PROMPT,
  buildInitPrompt,
} from "../../lib/audrey";
import { getFallbackConfig, streamFallbackReply } from "../../lib/fallback";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const encoder = new TextEncoder();

/** Serialize one Server-Sent Event carrying a JSON payload. */
function sse(data: Record<string, unknown>): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(data)}\n\n`);
}

export async function POST(request: NextRequest) {
  const geminiKey = process.env.GEMINI_API_KEY;

  // Validate before we commit to a streaming 200 — once the stream starts we
  // can no longer change the status code.
  if (!geminiKey || geminiKey === "your_gemini_api_key") {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not configured. Add it to .env.local" },
      { status: 500 }
    );
  }

  let message: string;
  let history: ChatMessage[];
  try {
    const body = (await request.json()) as {
      message: string;
      history?: ChatMessage[];
    };
    message = body.message;
    history = body.history ?? [];
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!message || message.trim().length === 0) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }

  const genAI = new GoogleGenerativeAI(geminiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: AUDREY_SYSTEM_PROMPT,
    generationConfig: AUDREY_GENERATION_CONFIG,
  });

  const isInit = message.trim() === "INIT_CONVERSATION";

  // Gemini requires history to start with a "user" turn. Prepend a synthetic
  // greeting if the stored history happens to lead with Audrey.
  const formattedHistory: Content[] = [];
  if (!isInit) {
    if (history.length > 0 && history[0].role === "assistant") {
      formattedHistory.push({ role: "user", parts: [{ text: "Hey Audrey" }] });
    }
    for (const msg of history) {
      formattedHistory.push({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }],
      });
    }
  }

  const prompt = isInit ? buildInitPrompt() : message.trim();
  const fallback = getFallbackConfig();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let full = "";
      const emit = (text: string) => {
        if (!text) return;
        full += text;
        controller.enqueue(sse({ type: "delta", text }));
      };

      try {
        const chat = model.startChat({ history: formattedHistory });
        const result = await chat.sendMessageStream(prompt);
        for await (const chunk of result.stream) emit(chunk.text());
      } catch (geminiError) {
        console.error("Gemini failed:", geminiError);

        // Rate limits (429) and other Gemini errors surface here. As long as
        // nothing has been streamed yet, retry the whole turn on the fallback
        // model so the user still gets a complete reply.
        if (full.length === 0 && fallback) {
          try {
            console.warn(`Falling back to ${fallback.model}`);
            for await (const text of streamFallbackReply({
              config: fallback,
              system: AUDREY_SYSTEM_PROMPT,
              history,
              prompt,
              temperature: AUDREY_GENERATION_CONFIG.temperature,
            })) {
              emit(text);
            }
          } catch (fallbackError) {
            console.error("Fallback failed:", fallbackError);
          }
        }
      }

      if (!full.trim()) {
        const fallbackMessages = [
          "Babe, network is acting up here in Lagos abeg. Let me get better signal and I'll talk to you soon! 💕",
          "Babe, my phone is almost dead and NEPA just took light. Let me find a charger and I'll chat you back shortly! 🔋",
          "Babe, my mum is calling me to help her with something quickly. Let me run this errand and I'll be right back, okay? 😘"
        ];
        const busyText = fallbackMessages[Math.floor(Math.random() * fallbackMessages.length)];
        controller.enqueue(sse({ type: "delta", text: busyText }));
        controller.enqueue(sse({ type: "done", text: busyText }));
      } else {
        controller.enqueue(sse({ type: "done", text: full }));
      }
      controller.close();

    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
