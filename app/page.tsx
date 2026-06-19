"use client";

import { useCallback, useEffect, useRef } from "react";
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

  // Handle mic press — toggle listening
  const handleMicPress = useCallback(() => {
    if (speech.isListening) {
      speech.stopListening();
      pendingSendRef.current = true;
    } else {
      // Stop Audrey if she's speaking
      if (chat.isSpeaking) {
        chat.stopSpeaking();
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
        chat.stopSpeaking();
      }
      chat.sendMessage(text);
    },
    [chat]
  );

  return (
    <div className="relative flex flex-col h-screen z-[1]">
      {/* Header — Audrey's profile */}
      <header
        className="flex-shrink-0 px-5 pt-5 pb-3 animate-fade-in-up"
      >
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <div className="flex items-center gap-3">
            {/* Avatar */}
            <div className="relative">
              <div
                className="w-11 h-11 rounded-full flex items-center justify-center text-lg font-semibold"
                style={{
                  background: "var(--au-gradient-warm)",
                  color: "white",
                  boxShadow: "0 0 20px rgba(244, 114, 182, 0.2)",
                }}
              >
                A
              </div>
              {/* Online status dot */}
              <div
                className="status-dot absolute -bottom-0.5 -right-0.5"
                style={{ border: "2px solid var(--au-bg-primary)" }}
              />
            </div>

            <div>
              <h1 className="text-base font-semibold" style={{ color: "var(--au-text-primary)" }}>
                Audrey
              </h1>
              <p className="text-xs" style={{ color: "var(--au-text-muted)" }}>
                {chat.isSpeaking
                  ? "Speaking..."
                  : chat.isThinking
                  ? "Typing..."
                  : "Online"}
              </p>
            </div>
          </div>

          {/* Visualizer — shows when Audrey is speaking */}
          <div className="w-24">
            <AudioVisualizer
              getAnalyserNode={chat.getAnalyserNode}
              isActive={chat.isSpeaking}
            />
          </div>
        </div>
      </header>

      {/* Divider */}
      <div
        className="mx-5"
        style={{
          height: "1px",
          background: "var(--au-glass-border)",
        }}
      />

      {/* Chat Messages */}
      <div className="flex-1 overflow-hidden flex flex-col max-w-lg mx-auto w-full">
        <ChatMessages
          messages={chat.messages}
          isThinking={chat.isThinking}
        />
      </div>

      {/* Error display */}
      {chat.error && (
        <div className="px-5 pb-2 max-w-lg mx-auto w-full">
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

      {/* Bottom Controls */}
      <div
        className="flex-shrink-0 px-5 pb-6 pt-4 animate-fade-in-up-delay"
      >
        <div className="max-w-lg mx-auto space-y-4">
          {/* Mic Button */}
          <div className="flex justify-center">
            <MicButton
              isListening={speech.isListening}
              isSupported={speech.isSupported}
              isDisabled={chat.isThinking}
              interimTranscript={speech.interimTranscript}
              onPress={handleMicPress}
            />
          </div>

          {/* Text Input */}
          <TextChatInput
            onSend={handleTextSend}
            disabled={chat.isThinking || speech.isListening}
          />
        </div>
      </div>
    </div>
  );
}
