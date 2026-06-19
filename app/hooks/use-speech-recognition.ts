"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Push-to-talk voice input backed by ElevenLabs Scribe.
 *
 * We record the user's utterance with MediaRecorder and, on stop, send the clip
 * to `/api/stt` for transcription. This replaces the browser's Web Speech API
 * (which streamed audio to Google, was Chrome-only, and handled accents poorly)
 * with one consistent, higher-quality transcriber on the same vendor as the TTS.
 *
 * The public API is intentionally unchanged from the old hook so the page wiring
 * stays the same: `isListening` stays true through both recording AND
 * transcription, then flips to false once the final `transcript` is set — which
 * is the signal the page waits on to send the message. While transcribing,
 * `interimTranscript` shows a status string.
 */

const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const type of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

function extensionFor(mime: string): string {
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("ogg")) return "ogg";
  return "webm";
}

/** Soft rising "ping" the instant recording begins (Gemini-style feedback). */
function playStartChime(): void {
  try {
    const ctx = new AudioContext();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(660, now);
    osc.frequency.exponentialRampToValueAtTime(1040, now + 0.1);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.14, now + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.24);
    osc.onended = () => ctx.close();
  } catch {
    // Audio not available — silent is fine.
  }
}

export function useSpeechRecognition() {
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [isSupported, setIsSupported] = useState(true);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeRef = useRef("audio/webm");
  const cancelledRef = useRef(false);

  // Client-only feature detection (default true to avoid a hydration flip on
  // the common case where it's supported).
  useEffect(() => {
    const supported =
      typeof navigator !== "undefined" &&
      typeof navigator.mediaDevices?.getUserMedia === "function" &&
      typeof window !== "undefined" &&
      "MediaRecorder" in window;
    // Intentional: SSR can't detect browser APIs, so we start optimistic
    // (true) and demote to false only on the client when unsupported. This
    // one-time post-mount update avoids a hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!supported) setIsSupported(false);
  }, []);

  const releaseMic = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const transcribe = useCallback(async (blob: Blob) => {
    setIsTranscribing(true);
    try {
      const form = new FormData();
      form.append("file", blob, `recording.${extensionFor(mimeRef.current)}`);

      const res = await fetch("/api/stt", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Transcription failed");

      // Publish the text first, then end the session in the same batch so the
      // consumer reads the final transcript when `isListening` goes false.
      setInterimTranscript("");
      setTranscript((data.text || "").trim());
    } catch (err) {
      console.error("Transcription error:", err);
      setInterimTranscript("");
      setTranscript("");
    } finally {
      setIsTranscribing(false);
      setIsListening(false);
    }
  }, []);

  const startListening = useCallback(async () => {
    if (isListening || recorderRef.current) return;

    setTranscript("");
    setInterimTranscript("");
    cancelledRef.current = false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = pickMimeType();
      mimeRef.current = mimeType || "audio/webm";
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        recorderRef.current = null;
        releaseMic();
        const blob = new Blob(chunksRef.current, { type: mimeRef.current });
        chunksRef.current = [];

        // Discarded via cancel — drop the clip, don't transcribe or send.
        if (cancelledRef.current) {
          cancelledRef.current = false;
          setIsListening(false);
          return;
        }

        // Too short to contain real speech — bail without a server round-trip.
        if (blob.size < 1500) {
          setIsListening(false);
          return;
        }
        transcribe(blob);
      };

      recorderRef.current = recorder;
      recorder.start();
      playStartChime();
      setIsListening(true);
    } catch (err) {
      console.error("Microphone access error:", err);
      releaseMic();
      recorderRef.current = null;
      setIsListening(false);
    }
  }, [isListening, releaseMic, transcribe]);

  const stopListening = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop(); // → onstop → transcribe()
    }
  }, []);

  /** Stop recording and throw the clip away (no transcription, no send). */
  const cancelListening = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      cancelledRef.current = true;
      recorder.stop(); // → onstop sees the cancel flag and discards
    }
  }, []);

  // Tear down the mic on unmount.
  useEffect(() => {
    return () => {
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") recorder.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return {
    isListening,
    isTranscribing,
    isSupported,
    transcript,
    interimTranscript,
    startListening,
    stopListening,
    cancelListening,
    setTranscript,
    setInterimTranscript,
  };
}
