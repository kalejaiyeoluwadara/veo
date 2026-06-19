"use client";

import { useRef, useState } from "react";

interface TextChatInputProps {
  onSend: (text: string) => void;
  onCameraClick?: () => void;
  /** Start recording (when idle) or stop + send (when listening). */
  onMicToggle: () => void;
  /** Discard the current recording without sending. */
  onMicCancel: () => void;
  isListening: boolean;
  /** Clip captured — transcription in flight (shows the load state). */
  isTranscribing: boolean;
  isVoiceSupported: boolean;
  disabled: boolean;
}

// Staggered delays give the bars an organic, flowing motion.
const WAVE_DELAYS = [
  0, 0.18, 0.36, 0.12, 0.5, 0.28, 0.42, 0.08, 0.46, 0.22, 0.34, 0.16, 0.4, 0.26,
];

export default function TextChatInput({
  onSend,
  onCameraClick,
  onMicToggle,
  onMicCancel,
  isListening,
  isTranscribing,
  isVoiceSupported,
  disabled,
}: TextChatInputProps) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || disabled) return;
    onSend(text.trim());
    setText("");
    inputRef.current?.focus();
  };

  const hasText = text.trim().length > 0;

  return (
    <div className="flex items-center gap-3.5 w-full">
      {/* Left button — Cancel while recording, Camera otherwise */}
      {isListening ? (
        <button
          type="button"
          onClick={onMicCancel}
          disabled={isTranscribing}
          className="w-10 h-10 rounded-full flex items-center justify-center bg-zinc-800/60 hover:bg-zinc-800 border border-zinc-700/40 text-zinc-300 hover:text-white transition-all select-none cursor-pointer flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-zinc-800/60"
          aria-label="Cancel recording"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      ) : (
        <button
          type="button"
          onClick={onCameraClick}
          className="w-10 h-10 rounded-full flex items-center justify-center bg-zinc-800/60 hover:bg-zinc-800 border border-zinc-700/30 text-zinc-300 hover:text-white transition-all select-none cursor-pointer flex-shrink-0"
          aria-label="Snap camera"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
        </button>
      )}

      {/* Capsule — recording view vs. text-input view */}
      {isListening ? (
        <div className="relative flex-1 flex items-center justify-between gap-3 bg-zinc-800/70 border border-yellow-400/40 rounded-full pl-5 pr-1.5 py-1.5 transition-all shadow-[0_0_22px_rgba(255,252,0,0.14)]">
          {isTranscribing ? (
            /* Clip captured — transcribing in progress */
            <div className="flex-1 flex items-center justify-center gap-2.5 py-0.5">
              <span className="w-4 h-4 rounded-full border-2 border-yellow-400/25 border-t-yellow-400 animate-spin flex-shrink-0" />
              <span className="text-xs font-bold tracking-wide text-yellow-400/90 select-none">
                Got it — one sec…
              </span>
            </div>
          ) : (
            <>
              <div className="voice-wave flex-1 overflow-hidden">
                {WAVE_DELAYS.map((delay, i) => (
                  <span key={i} style={{ animationDelay: `${delay}s` }} />
                ))}
              </div>

              {/* Stop + send */}
              <button
                type="button"
                onClick={onMicToggle}
                className="w-9 h-9 rounded-full flex items-center justify-center bg-yellow-400 text-zinc-950 hover:bg-yellow-300 active:scale-90 transition-all select-none cursor-pointer flex-shrink-0 shadow-[0_0_14px_rgba(255,252,0,0.35)]"
                aria-label="Stop and send"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 4l-1.4 1.4 5.6 5.6H4v2h12.2l-5.6 5.6L12 20l8-8z" />
                </svg>
              </button>
            </>
          )}
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="relative flex-1 flex items-center bg-zinc-800/50 border border-zinc-700/30 rounded-full pl-4 pr-1.5 py-1 transition-all focus-within:border-yellow-400/50 focus-within:bg-zinc-800/80"
        >
          <input
            ref={inputRef}
            type="text"
            className="bg-transparent border-none outline-none text-sm text-zinc-100 placeholder-zinc-500 w-full py-2 pr-14 focus:ring-0"
            placeholder="Send a Chat"
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={disabled}
            id="chat-input"
          />

          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
            {hasText ? (
              <button
                type="submit"
                disabled={disabled}
                className="text-sm font-black tracking-wider text-sky-400 hover:text-sky-300 transition-colors uppercase px-3 py-1 cursor-pointer select-none disabled:opacity-40"
                id="send-btn"
              >
                Send
              </button>
            ) : isVoiceSupported ? (
              <button
                type="button"
                onClick={onMicToggle}
                disabled={disabled}
                className="w-9 h-9 rounded-full flex items-center justify-center text-zinc-300 hover:text-yellow-400 hover:bg-yellow-400/10 transition-all select-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Record voice message"
                id="mic-btn"
              >
                <svg
                  width="19"
                  height="19"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              </button>
            ) : null}
          </div>
        </form>
      )}
    </div>
  );
}
