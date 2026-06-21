"use client";

import { useEffect, useRef } from "react";
import { Message } from "../hooks/use-chat";

interface ChatMessagesProps {
  messages: Message[];
  isThinking: boolean;
  isSpeaking: boolean;
}

export default function ChatMessages({
  messages,
  isThinking,
  isSpeaking,
}: ChatMessagesProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking, isSpeaking]);




  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
      {messages.map((msg) => {
        const isUser = msg.role === "user";
        return (
          <div key={msg.id} className="flex justify-start max-w-[90%]">
            {/* Snapchat "Saved in Chat" Style Left Bordered Card */}
            <div
              className={`border-l-[3.5px] pl-3.5 py-1.5 pr-4 rounded-r-xl transition-all duration-200 ${
                isUser
                  ? "border-sky-400 bg-sky-500/5 hover:bg-sky-500/10"
                  : "border-rose-400 bg-rose-500/5 hover:bg-rose-500/10"
              }`}
              style={{
                boxShadow: isUser
                  ? "inset 0 0 10px rgba(56, 189, 248, 0.02)"
                  : "inset 0 0 10px rgba(251, 113, 133, 0.02)",
              }}
            >
              {/* Sender name badge */}
              <span
                className={`text-xs font-black tracking-widest uppercase block mb-0.5 ${
                  isUser ? "text-sky-400" : "text-rose-400"
                }`}
              >
                {isUser ? "Me" : "Voice"}
              </span>

              {/* Message text */}
              <div
                className="text-sm leading-relaxed whitespace-pre-wrap break-words"
                style={{ color: "var(--au-text-primary)" }}
              >
                {formatMessageContent(msg.content)}
              </div>

            </div>
          </div>
        );
      })}

      {/* Snapchat Peeking Typing Indicator */}
      {isThinking && (
        <div className="flex items-end gap-2.5 pl-1.5 pb-0.5">
          {/* Peeking Bitmoji Avatar */}
          <div
            className="w-10 h-10 rounded-full overflow-hidden border border-yellow-400/50 bg-zinc-900 flex-shrink-0 animate-fade-in-up"
            style={{ boxShadow: "0 0 10px rgba(255, 252, 0, 0.15)" }}
          >
            <img
              src="/bitmoji_thinking.png"
              alt="Voice Typing"
              className="w-full h-full object-cover scale-110"
            />
          </div>
          {/* Typing speech bubble */}
          <div className="bg-zinc-900/90 border border-zinc-800/80 px-3.5 py-2 rounded-2xl rounded-bl-sm text-xs font-semibold text-zinc-300 flex items-center gap-1.5 shadow-md animate-fade-in-up">
            <span className="text-[10px] uppercase font-black text-rose-400 mr-0.5">
              Voice is typing
            </span>
            <div className="flex gap-[3px] py-1">
              <div className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-bounce" style={{ animationDelay: "0ms" }} />
              <div className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-bounce" style={{ animationDelay: "150ms" }} />
              <div className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        </div>
      )}

      {/* Snapchat Peeking Speaking Indicator */}
      {!isThinking && isSpeaking && (
        <div className="flex items-end gap-2.5 pl-1.5 pb-0.5">
          {/* Peeking Bitmoji Avatar */}
          <div
            className="w-10 h-10 rounded-full overflow-hidden border border-yellow-400/50 bg-zinc-900 flex-shrink-0 animate-fade-in-up"
            style={{ boxShadow: "0 0 10px rgba(255, 252, 0, 0.15)" }}
          >
            <img
              src="/bitmoji_speaking.png"
              alt="Voice Speaking"
              className="w-full h-full object-cover scale-110"
            />
          </div>
          {/* Speaking speech bubble */}
          <div className="bg-zinc-900/90 border border-zinc-800/80 px-3.5 py-2 rounded-2xl rounded-bl-sm text-xs font-semibold text-zinc-300 flex items-center gap-2 shadow-md animate-fade-in-up">
            <span className="text-[10px] uppercase font-black text-rose-400">
              Voice is speaking
            </span>
            {/* Tiny soundwave animation */}
            <div className="flex items-end gap-[2px] h-3 select-none">
              <div className="w-[2px] bg-rose-400 rounded-full animate-pulse h-2" style={{ animationDuration: "0.6s" }} />
              <div className="w-[2px] bg-rose-400 rounded-full animate-pulse h-3" style={{ animationDuration: "0.4s" }} />
              <div className="w-[2px] bg-rose-400 rounded-full animate-pulse h-1.5" style={{ animationDuration: "0.8s" }} />
            </div>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}

function formatMessageContent(content: string) {
  if (!content) return "";
  
  // Split on bold (**) and italic (*) syntax
  const parts = content.split(/(\*\*.*?\*\*|\*.*?\*)/g);
  
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={index} className="font-extrabold text-yellow-400">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return (
        <em key={index} className="italic text-zinc-300">
          {part.slice(1, -1)}
        </em>
      );
    }
    return part;
  });
}

