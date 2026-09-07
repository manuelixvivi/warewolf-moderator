"use client";
import { useGameStore } from "@/store/gameStore";
import { useState } from "react";

export default function HomeScreen() {
  const { setPhase, setPlayerName, myPlayerName } = useGameStore();
  const [inputName, setInputName] = useState(myPlayerName || "");

  const handleCreate = () => {
    if (!inputName.trim()) {
      alert("Masukkan nama kamu terlebih dahulu!");
      return;
    }
    setPlayerName(inputName.trim());
    setPhase("CREATE_ROOM");
  };

  const handleJoin = () => {
    if (!inputName.trim()) {
      alert("Masukkan nama kamu terlebih dahulu!");
      return;
    }
    setPlayerName(inputName.trim());
    setPhase("JOIN_ROOM");
  };

  const handleSolo = () => {
    if (!inputName.trim()) {
      alert("Masukkan nama kamu terlebih dahulu!");
      return;
    }
    setPlayerName(inputName.trim());
    useGameStore.setState({ mode: "PASS_AND_PLAY" });
    setPhase("CREATE_ROOM");
  };

  return (
    <div className="min-h-[calc(100vh-65px)] flex flex-col items-center justify-center px-4 py-8 relative overflow-hidden bg-gradient-to-b from-gray-950 via-purple-950/20 to-gray-950">
      {/* Mystical Background Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-72 h-72 bg-red-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-xl w-full mx-auto text-center relative z-10 space-y-8">
        {/* Title & Tagline */}
        <div className="space-y-3">
          <div className="inline-block p-3 rounded-2xl bg-purple-950/60 border border-purple-600/40 shadow-xl shadow-purple-950/60 text-4xl mb-2 animate-pulse">
            🌕
          </div>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-purple-200 via-red-200 to-amber-100">
            ASPIRE: WEREWOLF
          </h1>
          <p className="text-sm sm:text-base font-semibold tracking-widest text-purple-300 uppercase">
            One Village. Many Lies. One Wolf.
          </p>
          <p className="text-xs sm:text-sm text-gray-400 max-w-md mx-auto leading-relaxed pt-2">
            Permainan deduksi sosial Werewolf tanpa login. AI & Game Engine bertindak otomatis sebagai moderator tanpa perlu moderator manusia!
          </p>
        </div>

        {/* Player Name Input */}
        <div className="bg-gray-900/90 border border-purple-900/50 rounded-2xl p-6 shadow-2xl backdrop-blur-sm space-y-4">
          <label className="block text-left text-xs font-bold text-gray-300 uppercase tracking-wider">
            Nama Pemain Kamu
          </label>
          <div className="flex items-center gap-2">
            <span className="text-xl">👤</span>
            <input
              type="text"
              value={inputName}
              onChange={(e) => setInputName(e.target.value)}
              placeholder="Masukkan nama panggilanmu..."
              maxLength={20}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 font-semibold focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/30 text-base"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Create Room Button */}
          <button
            type="button"
            onClick={handleCreate}
            className="group relative flex flex-col items-center justify-center p-5 rounded-2xl bg-gradient-to-b from-purple-900/80 to-purple-950 border border-purple-600/60 hover:border-purple-400 shadow-xl shadow-purple-950 hover:shadow-purple-900/60 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <span className="text-3xl mb-2 group-hover:scale-110 transition-transform">👑</span>
            <span className="font-bold text-white text-base">Buat Room Baru</span>
            <span className="text-xs text-purple-300 mt-1 font-normal">
              Atur kuota & role, room full → Start!
            </span>
          </button>

          {/* Join Room Button */}
          <button
            type="button"
            onClick={handleJoin}
            className="group relative flex flex-col items-center justify-center p-5 rounded-2xl bg-gradient-to-b from-gray-900 to-gray-950 border border-gray-700 hover:border-purple-500 shadow-xl shadow-black hover:shadow-purple-950/40 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <span className="text-3xl mb-2 group-hover:scale-110 transition-transform">🔗</span>
            <span className="font-bold text-white text-base">Gabung ke Room</span>
            <span className="text-xs text-gray-400 mt-1 font-normal">
              Masukkan kode room dari temanmu
            </span>
          </button>
        </div>

        {/* Pass and Play Option */}
        <div className="pt-2">
          <button
            type="button"
            onClick={handleSolo}
            className="text-xs text-gray-400 hover:text-purple-300 underline underline-offset-4 transition-colors font-medium flex items-center justify-center gap-1.5 mx-auto"
          >
            <span>📱</span> Ingin bermain di 1 perangkat bergantian? (Mode Pass & Play)
          </button>
        </div>
      </div>
    </div>
  );
}
