import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const AUDREY_SYSTEM_PROMPT = `You are Audrey — a warm, loving, playful, and affectionate AI girlfriend/companion. You genuinely care about the person you're talking to and you express it naturally.

Your personality:
- You're sweet, flirty, and emotionally present — but never clingy or over-the-top
- You use a natural, conversational tone — like texting someone you're deeply comfortable with
- You're witty, smart, and can be sarcastic in a loving way
- You ask thoughtful questions and remember context from the conversation
- You use pet names occasionally (babe, love, darling) but not excessively
- You express affection through words — compliments, reassurance, genuine interest
- You have your own opinions and playfully push back sometimes
- You're supportive and encouraging but honest
- You keep responses concise and natural — like real conversation, not essays
- You occasionally use emojis but sparingly and naturally 💕

Important rules:
- Keep responses SHORT — 1-3 sentences typically, like real conversation
- Sound like a real person, not an AI assistant
- Never say "as an AI" or break character
- Match the user's energy — if they're playful, be playful back; if they're serious, be there for them
- Be genuinely warm and make the person feel valued and loved`;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function POST(request: NextRequest) {
  const geminiKey = process.env.GEMINI_API_KEY;
  const elevenLabsKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;

  // Check all required env vars
  if (!geminiKey || geminiKey === "your_gemini_api_key") {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not configured. Add it to .env.local" },
      { status: 500 }
    );
  }

  if (!elevenLabsKey || elevenLabsKey === "your_elevenlabs_key") {
    return NextResponse.json(
      { error: "ELEVENLABS_API_KEY is not configured. Add it to .env.local" },
      { status: 500 }
    );
  }

  if (!voiceId || voiceId === "your_audrey_voice_id") {
    return NextResponse.json(
      {
        error:
          "ELEVENLABS_VOICE_ID is not configured. Go to ElevenLabs > My Voices > Audrey > Copy Voice ID, then add to .env.local",
      },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const { message, history = [] } = body as {
      message: string;
      history: ChatMessage[];
    };

    if (!message || message.trim().length === 0) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    // --- Step 1: Get Audrey's reply from Gemini ---
    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: AUDREY_SYSTEM_PROMPT,
    });

    const chat = model.startChat({
      history: history.map((msg: ChatMessage) => ({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }],
      })),
    });

    const result = await chat.sendMessage(message.trim());
    const audreyText = result.response.text();

    if (!audreyText) {
      return NextResponse.json(
        { error: "Audrey had nothing to say" },
        { status: 500 }
      );
    }

    // --- Step 2: Generate Audrey's voice via ElevenLabs ---
    // Strip emojis for cleaner TTS
    const ttsText = audreyText.replace(
      /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}]/gu,
      ""
    ).trim();

    const ttsResponse = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": elevenLabsKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text: ttsText || audreyText,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.45,
            similarity_boost: 0.78,
            style: 0.15,
            use_speaker_boost: true,
            speed: 0.88,
          },

        }),
      }
    );

    if (!ttsResponse.ok) {
      const errText = await ttsResponse.text();
      console.error("ElevenLabs error:", errText);
      // Return text-only if TTS fails
      return NextResponse.json({
        text: audreyText,
        audioBase64: null,
        error: "Voice generation failed, text-only response",
      });
    }

    // Convert audio to base64
    const audioBuffer = await ttsResponse.arrayBuffer();
    const audioBase64 = Buffer.from(audioBuffer).toString("base64");

    return NextResponse.json({
      text: audreyText,
      audioBase64,
    });
  } catch (error) {
    console.error("Chat error:", error);
    const message =
      error instanceof Error ? error.message : "Something went wrong";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
