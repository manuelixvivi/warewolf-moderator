"use client";
import { useGameStore } from "@/store/gameStore";
import { useState } from "react";

export default function Navbar() {
  const { room, phase, leaveRoom, toggleVoice } = useGameStore();
  const [copied, setCopied] = useState(false);
  const voiceEnabled = room?.voiceEnabled ?? true;

  const handleCopyCode = () => {
    if (!room?.code) return;
    navigator.clipboard.writeText(room.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyLink = () => {
    if (!room?.code || typeof window === "undefined") return;
    const url = `${window.location.origin}/?room=${encodeURIComponent(room.code)}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <header className="sticky top-0 z-40 bg-gray-950/90 backdrop-blur-md border-b border-purple-900/40 px-4 py-3">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-600 via-purple-700 to-indigo-950 flex items-center justify-center text-xl shadow-md shadow-purple-950 border border-purple-500/30">
            🐺
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-black text-lg sm:text-xl tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-purple-300 via-red-300 to-amber-200">
                ASPIRE: WEREWOLF
              </span>
            </div>
            <p className="text-[10px] sm:text-xs text-gray-400 tracking-widest uppercase font-medium">
              One Village. Many Lies. One Wolf.
            </p>
          </div>
        </div>

        {/* Room Info & Controls */}
        <div className="flex items-center gap-2">
          {room && room.code && (
            <div className="flex items-center gap-1 bg-gray-900 border border-purple-800/60 rounded-xl px-2.5 py-1 text-xs">
              <span className="text-gray-400 font-mono hidden sm:inline">Room:</span>
              <span className="font-mono font-bold text-purple-300">{room.code}</span>
              <button
                type="button"
                onClick={handleCopyLink}
                className="ml-1.5 px-2 py-0.5 bg-purple-800/80 hover:bg-purple-700 text-white rounded text-[11px] font-semibold transition-colors"
                title="Salin Link Undangan Room"
              >
                {copied ? "✓ Tersalin!" : "🔗 Bagikan"}
              </button>
            </div>
          )}

          {/* Audio Voice Toggle */}
          <button
            type="button"
            onClick={toggleVoice}
            className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm border transition-colors ${
              voiceEnabled
                ? "bg-purple-950/80 border-purple-600 text-purple-200"
                : "bg-gray-900 border-gray-700 text-gray-500"
            }`}
            title={voiceEnabled ? "Suara AI Moderator Aktif" : "Suara AI Moderator Dimatikan"}
          >
            {voiceEnabled ? "🔊" : "🔇"}
          </button>

          {/* Leave Room Button */}
          {phase !== "HOME" && (
            <button
              type="button"
              onClick={() => {
                if (confirm("Apakah kamu yakin ingin keluar dari room?")) {
                  leaveRoom();
                }
              }}
              className="text-xs px-2.5 py-1.5 rounded-lg bg-gray-900 hover:bg-red-950 border border-gray-700 hover:border-red-600 text-gray-400 hover:text-red-200 transition-colors"
            >
              Keluar
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
