"use client";
import { useGameStore } from "@/store/gameStore";

const WIN_CONFIG: Record<string, { emoji: string; title: string; color: string; bg: string }> = {
  Village: {
    emoji: "🏘️",
    title: "WARGA DESA (VILLAGE) MENANG!",
    color: "text-emerald-400",
    bg: "from-emerald-950 via-gray-900 to-black border-emerald-500",
  },
  Werewolf: {
    emoji: "🐺",
    title: "KAWANAN SERIGALA (WEREWOLF) MENANG!",
    color: "text-red-400",
    bg: "from-red-950 via-gray-900 to-black border-red-600",
  },
  Tanner: {
    emoji: "🧶",
    title: "TANNER MENANG!",
    color: "text-amber-400",
    bg: "from-amber-950 via-gray-900 to-black border-amber-500",
  },
  Draw: {
    emoji: "⚖️",
    title: "PERMAINAN BERAKHIR SERI!",
    color: "text-gray-300",
    bg: "from-gray-900 via-gray-950 to-black border-gray-600",
  },
};

export default function MultiplayerGameOver() {
  const { winResult, players, restartGame, leaveRoom, room, myPlayerId } = useGameStore();
  const winner = winResult?.winner || "Draw";
  const config = WIN_CONFIG[winner] || WIN_CONFIG.Draw;
  const isHost = room?.hostId === myPlayerId;

  return (
    <div className="min-h-[calc(100vh-65px)] bg-gray-950 text-white flex flex-col items-center justify-center px-4 py-8 relative overflow-hidden">
      {/* Glow Effect */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-purple-900/15 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-3xl w-full mx-auto space-y-8 text-center relative z-10">
        {/* Winner Hero */}
        <div className={`p-8 sm:p-12 rounded-3xl bg-gradient-to-b ${config.bg} border-2 shadow-2xl space-y-4`}>
          <div className="text-7xl sm:text-8xl animate-bounce">{config.emoji}</div>
          <h1 className={`text-3xl sm:text-5xl font-black tracking-tight ${config.color}`}>
            {config.title}
          </h1>
          <p className="text-sm sm:text-base text-gray-300 max-w-lg mx-auto leading-relaxed">
            {winResult?.reason || "Pertarungan di desa telah mencapai akhir!"}
          </p>
        </div>

        {/* Full Role Reveal Grid */}
        <div className="bg-gray-900/90 border border-gray-800 rounded-3xl p-6 sm:p-8 shadow-xl space-y-4 text-left">
          <div className="flex items-center justify-between border-b border-gray-800 pb-3">
            <h2 className="text-sm font-bold text-gray-200 uppercase tracking-wider flex items-center gap-2">
              <span>📋</span> Seluruh Peran Terungkap
            </h2>
            <span className="text-xs text-purple-400 font-semibold font-mono">
              ASPIRE: WEREWOLF
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {players.map((p) => {
              const isWolf = p.team === "Werewolf" || p.team === "Werewolf-aligned";
              const isVillage = p.team === "Village" || p.team === "Village/Dynamic";
              return (
                <div
                  key={p.id}
                  className={`p-4 rounded-2xl border transition-all ${
                    !p.alive
                      ? "bg-gray-950/80 border-gray-800 opacity-60 line-through"
                      : isWolf
                      ? "bg-red-950/50 border-red-800/70"
                      : isVillage
                      ? "bg-emerald-950/50 border-emerald-800/70"
                      : "bg-amber-950/50 border-amber-800/70"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-base truncate">{p.name}</span>
                    <span className="text-xs">{p.alive ? "💚 Hidup" : "💀 Gugur"}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-300">
                      {p.canonical_name || "Villager"}
                    </span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                        isWolf
                          ? "bg-red-900 text-red-200"
                          : isVillage
                          ? "bg-emerald-900 text-emerald-200"
                          : "bg-amber-900 text-amber-200"
                      }`}
                    >
                      {p.team}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          {isHost ? (
            <button
              type="button"
              onClick={restartGame}
              className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-lg rounded-2xl shadow-xl shadow-purple-950 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>🔄</span> Main Lagi (Ronde Baru di Room Ini)
            </button>
          ) : (
            <div className="text-xs text-gray-400">
              Menunggu pemilik room untuk memulai ronde baru...
            </div>
          )}

          <button
            type="button"
            onClick={leaveRoom}
            className="w-full sm:w-auto px-8 py-4 bg-gray-900 hover:bg-gray-800 border border-gray-700 text-gray-300 hover:text-white font-bold text-base rounded-2xl transition-colors"
          >
            Kembali ke Menu Utama
          </button>
        </div>
      </div>
    </div>
  );
}
