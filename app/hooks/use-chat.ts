"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Pull complete sentences out of a growing text buffer so each can be sent to
 * TTS as soon as it's finished, while the rest of the reply is still streaming.
 * Returns the leftover (incomplete) tail as `remainder`.
 */
function splitSentences(buffer: string): {
  sentences: string[];
  remainder: string;
} {
  const sentences: string[] = [];
  let start = 0;

  for (let i = 0; i < buffer.length; i++) {
    const ch = buffer[i];
    const isTerminator =
      ch === "." || ch === "!" || ch === "?" || ch === "…" || ch === "\n";
    if (!isTerminator) continue;

    // Swallow a run of terminators ("?!", "...").
    let j = i;
    while (j + 1 < buffer.length && ".!?…".includes(buffer[j + 1])) j++;

    const next = buffer[j + 1];
    if (next === undefined) break; // tail may still be growing — keep buffering

    if (ch === "\n" || /\s/.test(next)) {
      const sentence = buffer.slice(start, j + 1).trim();
      if (sentence) sentences.push(sentence);
      start = j + 1;
    }
    i = j; // skip past the terminator run (also handles "3.5")
  }

  return { sentences, remainder: buffer.slice(start) };
}

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mirror of messages so the latest history is readable without re-creating
  // sendMessage on every keystroke of streamed text.
  const messagesRef = useRef<Message[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // --- Generation token: bumped on every interrupt so stale async work
  //     (in-flight TTS, queued audio) is dropped instead of played. ---
  const genRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  // --- Audio playback queue (single reusable element + analyser) ---
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const playQueueRef = useRef<{ url: string; gen: number }[]>([]);
  const currentUrlRef = useRef<string | null>(null);
  const playingRef = useRef(false);
  const drainRef = useRef<() => void>(() => {});

  // --- Text → TTS pipeline ---
  const pendingTtsRef = useRef<string[]>([]);

  const hasInitialized = useRef(false);

  // One reusable <audio> element drives the whole queue, so a single Web Audio
  // source/analyser stays valid across every clip (the visualizer reads it).
  useEffect(() => {
    const el = new Audio();
    audioElRef.current = el;

    try {
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      const source = ctx.createMediaElementSource(el);
      source.connect(analyser);
      analyser.connect(ctx.destination);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
    } catch {
      // Web Audio unavailable — audio still plays, just no visualizer.
    }

    const drain = () => {
      // Skip past any clips left over from an interrupted turn.
      let item = playQueueRef.current.shift();
      while (item && item.gen !== genRef.current) {
        URL.revokeObjectURL(item.url);
        item = playQueueRef.current.shift();
      }
      if (!item) {
        playingRef.current = false;
        setIsSpeaking(false);
        return;
      }
      playingRef.current = true;
      setIsSpeaking(true);
      currentUrlRef.current = item.url;
      el.src = item.url;
      const ctx = audioCtxRef.current;
      if (ctx && ctx.state === "suspended") ctx.resume();
      el.play().catch(() => advance());
    };

    const advance = () => {
      if (currentUrlRef.current) {
        URL.revokeObjectURL(currentUrlRef.current);
        currentUrlRef.current = null;
      }
      drain();
    };

    drainRef.current = drain;
    el.addEventListener("ended", advance);
    el.addEventListener("error", advance);

    return () => {
      genRef.current += 1;
      abortRef.current?.abort();
      el.removeEventListener("ended", advance);
      el.removeEventListener("error", advance);
      el.pause();
      audioCtxRef.current?.close();
    };
  }, []);

  const enqueueAudio = useCallback((url: string, gen: number) => {
    if (gen !== genRef.current) {
      URL.revokeObjectURL(url);
      return;
    }
    playQueueRef.current.push({ url, gen });
    if (!playingRef.current) drainRef.current();
  }, []);

  /** Hard-stop: abort generation, drop pending TTS, flush the audio queue. */
  const stopAll = useCallback(() => {
    genRef.current += 1;

    abortRef.current?.abort();
    abortRef.current = null;

    pendingTtsRef.current = [];

    for (const item of playQueueRef.current) URL.revokeObjectURL(item.url);
    playQueueRef.current = [];

    if (audioElRef.current) {
      audioElRef.current.pause();
      audioElRef.current.removeAttribute("src");
    }
    if (currentUrlRef.current) {
      URL.revokeObjectURL(currentUrlRef.current);
      currentUrlRef.current = null;
    }
    playingRef.current = false;
    setIsSpeaking(false);
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      const isInit = text.trim() === "INIT_CONVERSATION";
      if (!isInit && !text.trim()) return;

      // Barge-in: starting a new turn cuts off whatever she was saying.
      stopAll();
      const gen = genRef.current;

      setError(null);

      const prior = messagesRef.current;
      let historySource = prior;

      if (!isInit) {
        const userMessage: Message = {
          id: `user-${Date.now()}`,
          role: "user",
          content: text.trim(),
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, userMessage]);
        historySource = [...prior, userMessage];
      }

      setIsThinking(true);

      const history = historySource.slice(-20).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const controller = new AbortController();
      abortRef.current = controller;

      // The assistant bubble is created on the first token and filled live.
      const assistantId = `audrey-${Date.now()}`;
      let started = false;
      const ensureAssistantBubble = () => {
        if (started) return;
        started = true;
        setIsThinking(false);
        setMessages((prev) => [
          ...prev,
          {
            id: assistantId,
            role: "assistant",
            content: "",
            timestamp: new Date(),
          },
        ]);
      };

      // TTS worker: drains queued sentences in order while text keeps arriving.
      let streamEnded = false;
      const ttsWorker = (async () => {
        while (true) {
          if (gen !== genRef.current) return;
          if (pendingTtsRef.current.length === 0) {
            if (streamEnded) return;
            await sleep(15);
            continue;
          }
          const chunk = pendingTtsRef.current.shift() as string;
          try {
            const res = await fetch("/api/tts", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ text: chunk }),
              signal: controller.signal,
            });
            if (gen !== genRef.current) return;
            if (!res.ok) continue; // text already shown; just skip its audio
            const blob = await res.blob();
            if (gen !== genRef.current) return;
            enqueueAudio(URL.createObjectURL(blob), gen);
          } catch {
            if (controller.signal.aborted) return;
            // Ignore a single chunk's failure and keep going.
          }
        }
      })();

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text.trim(), history }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || "Failed to get response");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let sseBuffer = "";
        let full = "";
        let ttsBuffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (gen !== genRef.current) break;

          sseBuffer += decoder.decode(value, { stream: true });
          const events = sseBuffer.split("\n\n");
          sseBuffer = events.pop() ?? "";

          for (const evt of events) {
            const line = evt.split("\n").find((l) => l.startsWith("data:"));
            if (!line) continue;
            const payload = JSON.parse(line.slice(5).trim());

            if (payload.type === "delta") {
              ensureAssistantBubble();
              full += payload.text;
              ttsBuffer += payload.text;

              const liveText = full;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, content: liveText } : m
                )
              );

              const { sentences, remainder } = splitSentences(ttsBuffer);
              ttsBuffer = remainder;
              for (const s of sentences) pendingTtsRef.current.push(s);
            } else if (payload.type === "error") {
              throw new Error(payload.error);
            }
          }
        }

        // Speak whatever sentence was left without terminal punctuation.
        if (gen === genRef.current && ttsBuffer.trim()) {
          pendingTtsRef.current.push(ttsBuffer.trim());
        }
      } catch (err) {
        if (gen === genRef.current && !controller.signal.aborted) {
          setIsThinking(false);
          setError(err instanceof Error ? err.message : "Something went wrong");
        }
      } finally {
        streamEnded = true;
        await ttsWorker;
        if (gen === genRef.current) setIsThinking(false);
      }
    },
    [stopAll, enqueueAudio]
  );

  const interrupt = useCallback(() => {
    stopAll();
    setIsThinking(false);
  }, [stopAll]);

  // Audrey opens the conversation on first load.
  useEffect(() => {
    if (!hasInitialized.current) {
      hasInitialized.current = true;
      sendMessage("INIT_CONVERSATION");
    }
  }, [sendMessage]);

  const getAnalyserNode = useCallback(() => analyserRef.current, []);

  return {
    messages,
    isThinking,
    isSpeaking,
    error,
    sendMessage,
    interrupt,
    stopSpeaking: interrupt,
    getAnalyserNode,
  };
}
