"use client";
import { useState } from "react";
import { useGameStore } from "@/store/gameStore";
import { TriggeredAction } from "@/types/game";

interface Props {
  action: TriggeredAction;
}

const ACTION_INFO: Record<string, { title: string; desc: string; emoji: string }> = {
  HUNTER: {
    title: "🏹 HUNTER",
    desc: "Hunter telah dieliminasi! Hunter dapat membawa satu pemain lain bersamanya.",
    emoji: "🏹",
  },
  DOPPELGANGER: {
    title: "🔄 DOPPELGANGER",
    desc: "Pemain yang disalin Doppelganger telah mati. Doppelganger mengambil role tersebut.",
    emoji: "🔄",
  },
  WOLF_CUB_EXTRA: {
    title: "🐺 WOLF CUB",
    desc: "Wolf Cub telah mati! Werewolf mendapatkan dua eliminasi malam berikutnya.",
    emoji: "🐺",
  },
  TANNER_WIN: {
    title: "🧶 TANNER MENANG!",
    desc: "Tanner berhasil divote eliminasi. Tanner menang!",
    emoji: "🧶",
  },
};

export default function TriggeredActionModal({ action }: Props) {
  const { players, resolveTriggeredAction } = useGameStore();
  const [selectedTarget, setSelectedTarget] = useState<string>("");
  const alivePlayers = players.filter((p) => p.alive && p.id !== action.player_id);
  const info = ACTION_INFO[action.type] || {
    title: `⚡ ${action.role_name}`,
    desc: "Aksi terpicu!",
    emoji: "⚡",
  };
  const needsTarget = action.type === "HUNTER";

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border-2 border-yellow-600 rounded-2xl p-6 w-full max-w-md shadow-2xl shadow-yellow-900/30">
        <div className="text-center mb-4">
          <div className="text-5xl mb-2">{info.emoji}</div>
          <h2 className="text-xl font-bold text-yellow-400">{info.title}</h2>
          <p className="text-gray-300 text-sm mt-2">{info.desc}</p>
        </div>

        {action.player_id && (() => {
          const player = players.find(p => p.id === action.player_id);
          return player && (
            <div className="bg-gray-800 rounded-lg p-3 text-center mb-4">
              <p className="text-white font-bold">{player.name}</p>
            </div>
          );
        })()}

        {needsTarget && (
          <div className="mb-4">
            <label className="block text-sm text-gray-400 mb-2">Pilih target:</label>
            <select
              value={selectedTarget}
              onChange={(e) => setSelectedTarget(e.target.value)}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-yellow-500"
            >
              <option value="">— Pilih pemain —</option>
              {alivePlayers.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        )}

        <div className="flex gap-3">
          {!needsTarget || action.type === "TANNER_WIN" ? (
            <button
              onClick={() => resolveTriggeredAction(action.type)}
              className="flex-1 py-3 bg-yellow-600 hover:bg-yellow-500 text-white font-bold rounded-xl transition-colors"
            >
              ✓ Lanjutkan
            </button>
          ) : (
            <>
              <button
                onClick={() => resolveTriggeredAction(action.type)}
                className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-xl transition-colors text-sm"
              >
                Lewati
              </button>
              <button
                onClick={() => resolveTriggeredAction(action.type, selectedTarget)}
                disabled={!selectedTarget}
                className="flex-1 py-3 bg-red-700 hover:bg-red-600 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-colors"
              >
                🏹 Eliminasi
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}