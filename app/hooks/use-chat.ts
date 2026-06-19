"use client";

import { useState, useRef, useCallback, useEffect } from "react";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);

  // Setup Web Audio API analyser for visualization
  const setupAnalyser = useCallback((audioElement: HTMLAudioElement) => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }

    const ctx = audioContextRef.current;

    if (!analyserRef.current) {
      analyserRef.current = ctx.createAnalyser();
      analyserRef.current.fftSize = 256;
      analyserRef.current.smoothingTimeConstant = 0.8;
    }

    // Disconnect old source if exists
    if (sourceRef.current) {
      try {
        sourceRef.current.disconnect();
      } catch {
        // already disconnected
      }
      sourceRef.current = null;
    }

    try {
      sourceRef.current = ctx.createMediaElementSource(audioElement);
      sourceRef.current.connect(analyserRef.current);
      analyserRef.current.connect(ctx.destination);
    } catch {
      // Source may already be created for this element
    }

    if (ctx.state === "suspended") {
      ctx.resume();
    }
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isThinking) return;

      setError(null);

      // Add user message
      const userMessage: Message = {
        id: `user-${Date.now()}`,
        role: "user",
        content: text.trim(),
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsThinking(true);

      try {
        // Build history for Gemini (last 20 messages for context)
        const history = [...messages, userMessage]
          .slice(-20)
          .map((msg) => ({
            role: msg.role,
            content: msg.content,
          }));

        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text.trim(),
            history: history.slice(0, -1), // Don't include current message in history
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to get response");
        }

        // Add Audrey's reply
        const audreyMessage: Message = {
          id: `audrey-${Date.now()}`,
          role: "assistant",
          content: data.text,
          timestamp: new Date(),
        };

        setMessages((prev) => [...prev, audreyMessage]);
        setIsThinking(false);

        // Play audio if available
        if (data.audioBase64) {
          const audioBlob = base64ToBlob(data.audioBase64, "audio/mpeg");
          const audioUrl = URL.createObjectURL(audioBlob);

          // Stop any current audio
          if (audioRef.current) {
            audioRef.current.pause();
            URL.revokeObjectURL(audioRef.current.src);
          }

          const audio = new Audio(audioUrl);
          audioRef.current = audio;
          setupAnalyser(audio);

          setIsSpeaking(true);

          audio.addEventListener("ended", () => {
            setIsSpeaking(false);
            URL.revokeObjectURL(audioUrl);
          });

          audio.addEventListener("error", () => {
            setIsSpeaking(false);
            URL.revokeObjectURL(audioUrl);
          });

          await audio.play();
        }
      } catch (err) {
        setIsThinking(false);
        setError(
          err instanceof Error ? err.message : "Something went wrong"
        );
      }
    },
    [isThinking, messages, setupAnalyser]
  );

  const stopSpeaking = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsSpeaking(false);
  }, []);

  const getAnalyserNode = useCallback(() => {
    return analyserRef.current;
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  return {
    messages,
    isThinking,
    isSpeaking,
    error,
    sendMessage,
    stopSpeaking,
    getAnalyserNode,
  };
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteChars = atob(base64);
  const byteArrays: Uint8Array[] = [];

  for (let offset = 0; offset < byteChars.length; offset += 512) {
    const slice = byteChars.slice(offset, offset + 512);
    const byteNumbers = new Array(slice.length);
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }
    byteArrays.push(new Uint8Array(byteNumbers));
  }

  return new Blob(byteArrays as unknown as BlobPart[], { type: mimeType });
}
