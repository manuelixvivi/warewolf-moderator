"use client";
import { useState, useEffect } from "react";
import { useGameStore } from "@/store/gameStore";
import { network } from "@/lib/network";

export default function JoinRoomScreen() {
  const { joinRoom, setPhase, myPlayerName } = useGameStore();
  const [playerName, setPlayerName] = useState(myPlayerName || "");
  const [roomCode, setRoomCode] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Auto-fill room code from URL query parameter ?room=...
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const r = params.get("room");
      if (r) {
        setRoomCode(r.toUpperCase().trim());
      }
    }
  }, []);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim() || !roomCode.trim()) {
      setErrorMsg("Nama dan kode room wajib diisi!");
      return;
    }

    setIsJoining(true);
    setErrorMsg("");

    try {
      await joinRoom(roomCode.trim(), playerName.trim());
      // Send sync request to ensure immediate state acquisition from host
      setTimeout(() => {
        network.sendToHost({
          type: "REQUEST_SYNC",
          senderId: useGameStore.getState().myPlayerId,
        });
      }, 500);
      setTimeout(() => {
        network.sendToHost({
          type: "REQUEST_SYNC",
          senderId: useGameStore.getState().myPlayerId,
        });
      }, 1500);
    } catch (err) {
      console.error(err);
      setErrorMsg("Gagal terhubung ke room. Periksa kembali kode room.");
      setIsJoining(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-65px)] flex flex-col items-center justify-center px-4 py-8 bg-gradient-to-b from-gray-950 via-purple-950/20 to-gray-950">
      <div className="max-w-md w-full mx-auto space-y-6">
        {/* Back link */}
        <button
          type="button"
          onClick={() => setPhase("HOME")}
          className="text-xs text-gray-400 hover:text-white transition-colors flex items-center gap-1"
        >
          ← Kembali ke Menu
        </button>

        {/* Card Form */}
        <div className="bg-gray-900/90 border border-purple-900/50 rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur-sm space-y-6">
          <div className="text-center space-y-1">
            <div className="text-4xl mb-2">🔗</div>
            <h2 className="text-2xl font-black text-white">Gabung ke Room</h2>
            <p className="text-xs sm:text-sm text-gray-400">
              Masukkan nama kamu dan kode room yang dibagikan oleh pemilik room (host).
            </p>
          </div>

          {errorMsg && (
            <div className="bg-red-950/80 border border-red-500/60 text-red-200 text-xs px-3.5 py-2.5 rounded-xl text-center">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleJoin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-wider">
                Nama Kamu
              </label>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Contoh: Alex, Budi, Rina..."
                maxLength={20}
                required
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white font-medium focus:outline-none focus:border-purple-500 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-wider">
                Kode Room
              </label>
              <input
                type="text"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder="Contoh: WOLF-XXXX"
                required
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white font-mono font-bold tracking-wider focus:outline-none focus:border-purple-500 text-base uppercase placeholder:normal-case"
              />
            </div>

            <button
              type="submit"
              disabled={isJoining || !playerName.trim() || !roomCode.trim()}
              className="w-full py-3.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:from-gray-800 disabled:to-gray-800 disabled:text-gray-500 text-white font-bold rounded-xl text-base shadow-xl shadow-purple-950 transition-all flex items-center justify-center gap-2"
            >
              <span>{isJoining ? "⏳ Menghubungkan..." : "🚀 Masuk ke Room"}</span>
            </button>
          </form>

          <p className="text-center text-[11px] text-gray-500">
            Tidak perlu login atau akun. Cukup bergabung dengan kode room!
          </p>
        </div>
      </div>
    </div>
  );
}
