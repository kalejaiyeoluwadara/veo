"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useChat } from "./hooks/use-chat";
import { useSpeechRecognition } from "./hooks/use-speech-recognition";
import ChatMessages from "./components/chat-messages";
import MicButton from "./components/mic-button";
import TextChatInput from "./components/text-chat-input";
import AudioVisualizer from "./components/audio-visualizer";

export default function Home() {
  const chat = useChat();
  const speech = useSpeechRecognition();
  const pendingSendRef = useRef(false);
  const [toast, setToast] = useState<string | null>(null);

  // Auto-dismiss toast
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Handle mic press — toggle listening
  const handleMicPress = useCallback(() => {
    if (speech.isListening) {
      speech.stopListening();
      pendingSendRef.current = true;
    } else {
      // Stop Audrey if she's speaking
      if (chat.isSpeaking) {
        chat.interrupt();
      }

      speech.startListening();
      pendingSendRef.current = false;
    }
  }, [speech, chat]);

  // When listening stops and we have a transcript, send it
  useEffect(() => {
    if (!speech.isListening && pendingSendRef.current) {
      const finalText = speech.transcript || speech.interimTranscript;
      if (finalText.trim()) {
        chat.sendMessage(finalText.trim());
        speech.setTranscript("");
        speech.setInterimTranscript("");
      }
      pendingSendRef.current = false;
    }
  }, [speech.isListening, speech.transcript, speech.interimTranscript, chat, speech]);

  // Handle text send
  const handleTextSend = useCallback(
    (text: string) => {
      if (chat.isSpeaking) {
        chat.interrupt();
      }

      chat.sendMessage(text);
    },
    [chat]
  );

  const handleCameraClick = useCallback(() => {
    const messages = [
      "Audrey is on summer break, she hasn't done her hair yet, no snaps abeg! 💇‍♀️",
      "Ah! Audrey is back in Lagos heat, she is not ready for snaps now! 🥵",
      "Snapchat camera? Audrey says: 'Abeg let me rest, my face is not set for snaps!' 😂"
    ];
    const randomMsg = messages[Math.floor(Math.random() * messages.length)];
    setToast(randomMsg);
  }, []);

  const handleAudioCallClick = useCallback(() => {
    setToast("Audrey is currently resting in Lagos. Call lines are muted, chat with her here! 📱");
  }, []);

  const handleVideoCallClick = useCallback(() => {
    setToast("You want to video call Babcock senator? She hasn't worn her senator dress, try later! 🏛️");
  }, []);

  return (
    <div className="relative flex flex-col h-screen z-[1] bg-black select-none">
      {/* Toast popup alerts */}
      {toast && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 animate-fade-in-up">
          <div className="px-5 py-3 rounded-2xl bg-zinc-900 border border-yellow-400/30 text-yellow-400 text-xs font-semibold shadow-xl flex items-center gap-2 max-w-[90vw] text-center">
            <span>{toast}</span>
          </div>
        </div>
      )}

      {/* Header — Snapchat Styled */}
      <header className="flex-shrink-0 px-4 pt-4 pb-3 border-b border-zinc-900/50 bg-black/80 backdrop-blur-md">
        <div className="flex items-center justify-between max-w-lg mx-auto w-full">
          
          {/* Profile & Info block */}
          <div className="flex items-center gap-3">
            {/* Bitmoji Avatar */}
            <div className="relative">
              <div
                className="w-11 h-11 rounded-full overflow-hidden flex items-center justify-center border-2 border-yellow-400 bg-zinc-800"
                style={{
                  boxShadow: "0 0 10px rgba(255, 252, 0, 0.2)",
                }}
              >
                <img
                  src={
                    chat.isSpeaking
                      ? "/bitmoji_speaking.png"
                      : chat.isThinking
                      ? "/bitmoji_thinking.png"
                      : "/bitmoji_happy.png"
                  }
                  alt="Audrey Bitmoji"
                  className="w-full h-full object-cover scale-110"
                />
              </div>
              {/* Online status dot */}
              <div
                className="status-dot absolute -bottom-0.5 -right-0.5"
                style={{ border: "2px solid var(--au-bg-primary)" }}
              />
            </div>

            <div>
              <h1 className="text-sm font-black tracking-wide" style={{ color: "var(--au-text-primary)" }}>
                Audrey
              </h1>
              <p className="text-[10px] uppercase tracking-wider font-extrabold" style={{ color: "var(--au-text-muted)" }}>
                {chat.isSpeaking
                  ? "Speaking..."
                  : chat.isThinking
                  ? "Typing..."
                  : "Online"}
              </p>
            </div>
          </div>

          {/* Right Area: Call buttons and Visualizer */}
          <div className="flex items-center gap-3">
            {/* Call Actions */}
            <div className="flex items-center gap-1.5 border-r border-zinc-800/80 pr-3">
              <button
                onClick={handleAudioCallClick}
                className="text-zinc-400 hover:text-white p-2 rounded-full cursor-pointer transition-colors"
                aria-label="Audio call"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
              </button>
              <button
                onClick={handleVideoCallClick}
                className="text-zinc-400 hover:text-white p-2 rounded-full cursor-pointer transition-colors"
                aria-label="Video call"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M23 7l-7 5 7 5V7z" />
                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                </svg>
              </button>
            </div>

            {/* Speaking visualizer */}
            <div className="w-16 flex items-center justify-center">
              <AudioVisualizer
                getAnalyserNode={chat.getAnalyserNode}
                isActive={chat.isSpeaking}
              />
            </div>
          </div>

        </div>
      </header>

      {/* Chat Feed */}
      <div className="flex-1 overflow-hidden flex flex-col max-w-lg mx-auto w-full">
        <ChatMessages
          messages={chat.messages}
          isThinking={chat.isThinking}
          isSpeaking={chat.isSpeaking}
        />

      </div>

      {/* Error alert banner */}
      {chat.error && (
        <div className="px-4 pb-2 max-w-lg mx-auto w-full">
          <div
            className="text-xs p-3 rounded-xl text-center"
            style={{
              background: "rgba(239, 68, 68, 0.08)",
              color: "#f87171",
              border: "1px solid rgba(239, 68, 68, 0.12)",
            }}
          >
            {chat.error}
          </div>
        </div>
      )}

      {/* Bottom control pad */}
      <div className="flex-shrink-0 px-4 pb-6 pt-3 border-t border-zinc-900/40 bg-black/80 backdrop-blur-md">
        <div className="max-w-lg mx-auto space-y-4">
          {/* Shutter Button Mic */}
          <div className="flex justify-center select-none">
            <MicButton
              isListening={speech.isListening}
              isSupported={speech.isSupported}
              isDisabled={chat.isThinking}
              interimTranscript={speech.interimTranscript}
              onPress={handleMicPress}
            />
          </div>

          {/* Capsule Text input */}
          <TextChatInput
            onSend={handleTextSend}
            onCameraClick={handleCameraClick}
            disabled={chat.isThinking || speech.isListening}
          />
        </div>
      </div>
    </div>
  );
}
