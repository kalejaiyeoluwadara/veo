import { NextRequest, NextResponse } from "next/server";
import { detectEmotion, stripForSpeech, voiceSettingsFor } from "../../lib/voice";

/**
 * Renders a single chunk of Audrey's reply to speech. The client calls this
 * once per sentence as the text streams in, so audio for the first sentence
 * can start playing while later sentences are still being generated.
 *
 * Voice settings are chosen per chunk from its emotional tone (see voice.ts),
 * so delivery tracks what she's actually saying.
 */
export async function POST(request: NextRequest) {
  const elevenLabsKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;

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

  let rawText: string;
  try {
    const body = (await request.json()) as { text: string };
    rawText = body.text;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const text = stripForSpeech(rawText ?? "");
  if (!text) {
    return NextResponse.json({ error: "No speakable text" }, { status: 400 });
  }

  const emotion = detectEmotion(rawText);

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
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: voiceSettingsFor(emotion),
      }),
    }
  );

  if (!ttsResponse.ok || !ttsResponse.body) {
    const errText = await ttsResponse.text().catch(() => "");
    console.error("ElevenLabs error:", ttsResponse.status, errText);
    return NextResponse.json(
      { error: "Voice generation failed" },
      { status: 502 }
    );
  }

  // Pipe the audio straight back to the client.
  return new Response(ttsResponse.body, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
      "X-Audrey-Emotion": emotion,
    },
  });
}
