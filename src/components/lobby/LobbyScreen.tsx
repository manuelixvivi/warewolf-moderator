"use client";
import { useGameStore } from "@/store/gameStore";
import { useState } from "react";
import rolesJson from "@/data/roles.json";
import { RoleData } from "@/types/game";

const ALL_ROLES = rolesJson as RoleData[];

export default function LobbyScreen() {
  const { room, players, myPlayerId, startGame } = useGameStore();
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const isHost = room?.hostId === myPlayerId;
  const targetCount = room?.targetPlayerCount || 8;
  const joinedCount = players.length;
  const isFull = joinedCount >= targetCount;

  const handleCopyCode = () => {
    if (!room?.code) return;
    navigator.clipboard.writeText(room.code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyLink = () => {
    if (!room?.code || typeof window === "undefined") return;
    const url = `${window.location.origin}/?room=${encodeURIComponent(room.code)}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="min-h-[calc(100vh-65px)] bg-gray-950 text-white px-4 py-8">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Room Header & Invitation */}
        <div className="bg-gradient-to-r from-purple-950/70 via-gray-900 to-indigo-950/70 border border-purple-800/60 rounded-3xl p-6 sm:p-8 shadow-2xl text-center space-y-4 relative overflow-hidden">
          <div className="space-y-1">
            <span className="text-xs font-bold text-purple-400 uppercase tracking-widest">
              Lobby Ruang Tunggu Permainan
            </span>
            <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
              {room?.code}
            </h1>
            <p className="text-xs text-gray-400">
              Tema Cerita: <span className="text-purple-300 font-semibold">{room?.storyTheme || "Dark Fantasy"}</span> • Moderator: <span className="text-amber-300 font-semibold">AI & Game Engine</span>
            </p>
          </div>

          {/* Quick Copy Buttons */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
            <button
              type="button"
              onClick={handleCopyCode}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-xl text-xs font-bold transition-all flex items-center gap-2"
            >
              <span>📋</span> {copiedCode ? "Kode Tersalin!" : "Salin Kode Room"}
            </button>
            <button
              type="button"
              onClick={handleCopyLink}
              className="px-4 py-2 bg-purple-800 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-purple-950 flex items-center gap-2"
            >
              <span>🔗</span> {copiedLink ? "Link Tersalin!" : "Salin Link Undangan"}
            </button>
          </div>

          {/* Capacity Meter */}
          <div className="pt-3 max-w-md mx-auto space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-gray-300">
                Pemain Bergabung:{" "}
                <span className="text-purple-300 font-bold">{joinedCount}</span> /{" "}
                <span className="text-white font-bold">{targetCount}</span>
              </span>
              <span
                className={`px-2 py-0.5 rounded-full font-bold text-[11px] ${
                  isFull
                    ? "bg-green-950 border border-green-500 text-green-300 animate-pulse"
                    : "bg-yellow-950 border border-yellow-600 text-yellow-300"
                }`}
              >
                {isFull ? "ROOM FULL!" : `Kurang ${targetCount - joinedCount} Pemain`}
              </span>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-gray-800 rounded-full h-3 overflow-hidden border border-gray-700">
              <div
                className={`h-3 rounded-full transition-all duration-500 ${
                  isFull
                    ? "bg-gradient-to-r from-emerald-500 to-green-400"
                    : "bg-gradient-to-r from-purple-600 to-indigo-500"
                }`}
                style={{ width: `${Math.min(100, (joinedCount / targetCount) * 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Players List Grid */}
        <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-gray-800 pb-3">
            <h2 className="text-sm font-bold text-gray-200 uppercase tracking-wider flex items-center gap-2">
              <span>👥</span> Daftar Pemain di Room ({joinedCount})
            </h2>
            <span className="text-xs text-gray-500">
              {isFull ? "Semua kursi terisi" : "Menunggu pemain lain masuk..."}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {players.map((p, idx) => {
              const isMe = p.id === myPlayerId;
              return (
                <div
                  key={p.id}
                  className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                    isMe
                      ? "bg-purple-950/60 border-purple-500/80 shadow-md shadow-purple-950/40"
                      : "bg-gray-800/80 border-gray-700"
                  }`}
                >
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-600 to-indigo-900 flex items-center justify-center font-bold text-sm text-white shrink-0 border border-purple-400/40">
                    {p.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="font-bold text-white text-sm truncate">{p.name}</span>
                      {p.isHost && (
                        <span className="text-xs shrink-0" title="Pemilik Room (Host)">👑</span>
                      )}
                    </div>
                    <span className="text-[11px] text-gray-400 block truncate">
                      {isMe ? "Kamu" : `Pemain #${idx + 1}`}
                    </span>
                  </div>
                </div>
              );
            })}

            {/* Empty slots placeholders */}
            {Array.from({ length: Math.max(0, targetCount - joinedCount) }).map((_, i) => (
              <div
                key={`empty-${i}`}
                className="flex items-center gap-3 p-3 rounded-xl border border-dashed border-gray-800 bg-gray-950/40 text-gray-600"
              >
                <div className="w-9 h-9 rounded-full border border-dashed border-gray-800 flex items-center justify-center text-xs shrink-0 font-mono">
                  {joinedCount + i + 1}
                </div>
                <span className="text-xs italic">Menunggu pemain...</span>
              </div>
            ))}
          </div>
        </div>

        {/* Roles in Play Preview */}
        {room?.selectedRoles && room.selectedRoles.length > 0 && (
          <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-5 shadow-lg space-y-3">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
              <span>🎭</span> Peran yang Tersedia di Room Ini ({targetCount} Kartu)
            </h3>
            <div className="flex flex-wrap gap-2">
              {room.selectedRoles.map((sr) => {
                const roleData = ALL_ROLES.find((r) => r.role_id === sr.role_id);
                return (
                  <div
                    key={sr.role_id}
                    className="flex items-center gap-1.5 bg-gray-800/90 border border-gray-700 rounded-lg px-2.5 py-1 text-xs"
                  >
                    <span className="text-white font-medium">{sr.canonical_name}</span>
                    <span className="bg-purple-700 text-purple-100 text-[10px] rounded-full px-1.5 py-0.2 font-bold">
                      ×{sr.count}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-gray-500 italic">
              *Setiap pemain akan mendapatkan salah satu peran di atas secara acak ketika permainan dimulai.
            </p>
          </div>
        )}

        {/* Start Game Footer Action */}
        <div className="pt-2">
          {isHost ? (
            <div className="space-y-3">
              <button
                type="button"
                onClick={startGame}
                disabled={!isFull}
                className={`w-full py-4 rounded-2xl font-black text-lg sm:text-xl shadow-2xl transition-all flex items-center justify-center gap-3 ${
                  isFull
                    ? "bg-gradient-to-r from-emerald-600 via-green-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-emerald-950 hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
                    : "bg-gray-800 border border-gray-700 text-gray-500 cursor-not-allowed"
                }`}
              >
                <span>{isFull ? "🚀" : "🔒"}</span>
                <span>
                  {isFull
                    ? "START GAME (ROOM SUDAH PENUH!)"
                    : `Menunggu Room Penuh (${joinedCount}/${targetCount})`}
                </span>
              </button>

              {!isFull && (
                <p className="text-center text-xs text-yellow-400 font-medium">
                  ⚠ Pemilik room hanya bisa memulai saat semua {targetCount} kursi pemain telah terisi. Bagikan link atau kode room ke teman-temanmu!
                </p>
              )}
            </div>
          ) : (
            <div className="text-center p-4 rounded-2xl bg-gray-900 border border-gray-800 space-y-1">
              <p className="text-sm font-bold text-purple-300">
                {isFull
                  ? "Room sudah penuh! Menunggu Host menekan Start Game..."
                  : `Menunggu ${targetCount - joinedCount} pemain lagi untuk bergabung...`}
              </p>
              <p className="text-xs text-gray-500">
                Hanya pemilik room (👑 {room?.hostName}) yang dapat memulai permainan.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
