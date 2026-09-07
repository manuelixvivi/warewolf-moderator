"use client";
import { useState, useRef, useEffect } from "react";
import { useGameStore } from "@/store/gameStore";
import { ChatMessage } from "@/types/game";

interface ChatBoxProps {
  channel: "DAY_PUBLIC" | "WOLF_SECRET" | "LOBBY";
  title?: string;
  subtitle?: string;
  canChat?: boolean;
  placeholder?: string;
  quickPhrases?: string[];
  maxHeight?: string;
}

export default function ChatBox({
  channel,
  title,
  subtitle,
  canChat = true,
  placeholder,
  quickPhrases,
  maxHeight = "h-80 sm:h-96",
}: ChatBoxProps) {
  const { chatMessages, myPlayerId, myPlayerName, sendChatMessage, players } = useGameStore();
  const [inputText, setInputText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const me = players.find((p) => p.id === myPlayerId);
  const isDead = me && !me.alive;

  // Filter messages for this channel (or system messages)
  const channelMessages = chatMessages.filter(
    (m) => m.channel === channel || m.channel === "SYSTEM"
  );

  // Auto-scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [channelMessages.length]);

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || (!canChat && isDead)) return;

    sendChatMessage(inputText.trim(), channel);
    setInputText("");
  };

  const handleQuickPhrase = (phrase: string) => {
    if (!canChat && isDead) return;
    sendChatMessage(phrase, channel);
  };

  const defaultPhrases =
    channel === "WOLF_SECRET"
      ? ["Ayo mangsa dia!", "Simpan dia untuk malam nanti", "Saya sepakat!", "Hati-hati dengan Bodyguard"]
      : channel === "LOBBY"
      ? ["Halo semuanya!", "Ayo cepat join!", "Siap main!", "Semoga dapat peran serigala 🐺"]
      : [
          "Saya warga biasa!",
          "Siapa yang paling mencurigakan?",
          "Seer ada info malam ini?",
          "Jangan gantung saya, saya punya peran penting!",
          "Ayo vote dia!",
          "Saya setuju!",
        ];

  const phrases = quickPhrases || defaultPhrases;

  return (
    <div className="flex flex-col bg-gray-900/90 border border-gray-800 rounded-2xl shadow-xl overflow-hidden backdrop-blur-sm">
      {/* Chat Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-950/60 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <span className="text-base">
            {channel === "WOLF_SECRET" ? "🐺" : channel === "LOBBY" ? "💬" : "🗣️"}
          </span>
          <div>
            <h3 className="text-xs sm:text-sm font-black text-white leading-tight">
              {title || (channel === "WOLF_SECRET" ? "Obrolan Rahasia Serigala" : "Diskusi Warga")}
            </h3>
            {subtitle && <p className="text-[10px] text-gray-400">{subtitle}</p>}
          </div>
        </div>
        <span className="text-[10px] font-mono text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">
          {channelMessages.length} pesan
        </span>
      </div>

      {/* Messages Scroll Area */}
      <div className={`flex-1 ${maxHeight} overflow-y-auto p-4 space-y-3`}>
        {channelMessages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-gray-500 space-y-1">
            <span className="text-3xl opacity-60">
              {channel === "WOLF_SECRET" ? "🐺" : "💬"}
            </span>
            <p className="text-xs font-medium">Belum ada obrolan di sini.</p>
            <p className="text-[11px] text-gray-600">
              Mulai perdebatan dan ketik pesan pertamamu!
            </p>
          </div>
        ) : (
          channelMessages.map((msg) => {
            const isMe = msg.senderId === myPlayerId;
            const isSystem = msg.channel === "SYSTEM";

            if (isSystem) {
              return (
                <div key={msg.id} className="flex justify-center my-2">
                  <div className="bg-purple-950/60 border border-purple-800/40 text-purple-200 text-[11px] px-3 py-1 rounded-full text-center font-medium shadow-sm">
                    🤖 {msg.text}
                  </div>
                </div>
              );
            }

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isMe ? "items-end" : "items-start"} space-y-1`}
              >
                <div className="flex items-center gap-1.5 px-1">
                  <span
                    className={`text-[10px] font-bold ${
                      isMe ? "text-purple-300" : "text-gray-400"
                    }`}
                  >
                    {isMe ? "Kamu" : msg.senderName}
                  </span>
                  {msg.isDead && (
                    <span className="text-[9px] bg-gray-800 text-gray-400 px-1 py-0.2 rounded">
                      👻 Roh
                    </span>
                  )}
                  <span className="text-[9px] text-gray-600 font-mono">
                    {new Date(msg.timestamp).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>

                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed shadow-md break-words ${
                    isMe
                      ? "bg-purple-600 text-white rounded-tr-none shadow-purple-950"
                      : channel === "WOLF_SECRET"
                      ? "bg-red-950/80 border border-red-800/70 text-red-100 rounded-tl-none"
                      : "bg-gray-800 border border-gray-700 text-gray-200 rounded-tl-none"
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Reaction Chips */}
      {canChat && (!isDead || channel === "LOBBY") && (
        <div className="px-3 py-2 bg-gray-950/40 border-t border-gray-800 flex gap-1.5 overflow-x-auto no-scrollbar">
          {phrases.map((phrase, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleQuickPhrase(phrase)}
              className="text-[11px] px-2.5 py-1 rounded-full bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white border border-gray-700 shrink-0 transition-colors whitespace-nowrap"
            >
              {phrase}
            </button>
          ))}
        </div>
      )}

      {/* Chat Input Bar */}
      <div className="p-3 bg-gray-950/80 border-t border-gray-800">
        {canChat && (!isDead || channel === "LOBBY") ? (
          <form onSubmit={handleSend} className="flex items-center gap-2">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={placeholder || "Ketik argumen atau analisismu..."}
              maxLength={200}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
            />
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="px-4 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-800 disabled:text-gray-600 text-white font-bold text-xs rounded-xl transition-all shadow-md shrink-0 flex items-center gap-1 cursor-pointer"
            >
              <span>Kirim</span>
              <span>➤</span>
            </button>
          </form>
        ) : (
          <div className="text-center text-xs text-gray-500 py-1.5 flex items-center justify-center gap-1.5">
            <span>👻</span>
            <span>Kamu telah gugur. Mode Roh hanya bisa membaca agar tidak membocorkan rahasia.</span>
          </div>
        )}
      </div>
    </div>
  );
}
