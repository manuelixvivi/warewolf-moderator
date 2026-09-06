"use client";
import { useGameStore } from "@/store/gameStore";
import { Player } from "@/types/game";

const WIN_CONFIG: Record<string, { emoji: string; title: string; color: string }> = {
  Village: { emoji: "🏘️", title: "VILLAGE MENANG!", color: "text-green-400" },
  Werewolf: { emoji: "🐺", title: "WEREWOLF MENANG!", color: "text-red-400" },
  Tanner: { emoji: "🧶", title: "TANNER MENANG!", color: "text-yellow-400" },
  Draw: { emoji: "⚖️", title: "SERI!", color: "text-gray-400" },
};

export default function GameOverScreen() {
  const { winResult, players, resetGame } = useGameStore();
  const winner = winResult?.winner || "Unknown";
  const config = WIN_CONFIG[winner] || { emoji: "🏆", title: `${winner} MENANG!`, color: "text-purple-400" };

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6 text-white">
      <div className="text-8xl mb-4">{config.emoji}</div>
      <h1 className={`text-4xl font-black mb-2 ${config.color}`}>{config.title}</h1>
      <p className="text-gray-400 text-center mb-8 max-w-md">{winResult?.reason}</p>

      {/* Role Reveal */}
      <div className="w-full max-w-2xl bg-gray-900 rounded-2xl border border-gray-700 p-5 mb-6">
        <h2 className="text-lg font-bold text-white mb-4 text-center">📋 Semua Role Terungkap</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {players.map((p: Player) => (
            <div
              key={p.id}
              className={`rounded-xl border p-3 text-center ${
                p.alive ? "border-gray-600 bg-gray-800" : "border-gray-700 bg-gray-900 opacity-60"
              }`}
            >
              <div className="font-bold text-white text-sm">{p.name}</div>
              <div className="text-xs text-gray-400 mt-0.5">{p.canonical_name}</div>
              <div
                className={`text-xs mt-1 font-medium ${
                  p.team === "Village" ? "text-green-400" :
                  p.team === "Werewolf" || p.team === "Werewolf-aligned" ? "text-red-400" :
                  "text-yellow-400"
                }`}
              >
                {p.team}
              </div>
              {!p.alive && <div className="text-xs text-gray-600 mt-1">✕ Dieliminasi</div>}
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={resetGame}
        className="px-10 py-4 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xl rounded-2xl transition-all shadow-lg"
      >
        🔄 Main Lagi
      </button>
    </div>
  );
}