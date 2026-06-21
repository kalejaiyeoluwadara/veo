import { NextRequest, NextResponse } from "next/server";

/**
 * Transcribes a recorded voice clip with ElevenLabs Scribe.
 *
 * The client records the user's utterance (push-to-talk) and POSTs it here as
 * multipart form-data under "file"; we forward it to Scribe and return the
 * plain text. Same vendor/key as Voice's voice (ELEVENLABS_API_KEY).
 */
export async function POST(request: NextRequest) {
  const key = process.env.ELEVENLABS_API_KEY;

  if (!key || key === "your_elevenlabs_key") {
    return NextResponse.json(
      { error: "ELEVENLABS_API_KEY is not configured. Add it to .env.local" },
      { status: 500 }
    );
  }

  let incoming: FormData;
  try {
    incoming = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = incoming.get("file");
  if (!(file instanceof Blob) || file.size === 0) {
    return NextResponse.json({ error: "No audio provided" }, { status: 400 });
  }

  const filename = file instanceof File ? file.name : "recording.webm";

  const form = new FormData();
  form.append("model_id", "scribe_v1");
  form.append("file", file, filename);
  // We only want clean speech text — no laughter/footstep event tags.
  form.append("tag_audio_events", "false");

  let res: Response;
  try {
    res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": key },
      body: form,
    });
  } catch (err) {
    console.error("Scribe request failed:", err);
    return NextResponse.json(
      { error: "Could not reach the transcription service" },
      { status: 502 }
    );
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error("Scribe error:", res.status, errText);
    return NextResponse.json(
      { error: "Transcription failed" },
      { status: 502 }
    );
  }

  const data = (await res.json()) as { text?: string };
  return NextResponse.json({ text: (data.text ?? "").trim() });
}
