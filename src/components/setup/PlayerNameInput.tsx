"use client";
import { useState } from "react";
import { useGameStore } from "@/store/gameStore";
import { Player } from "@/types/game";
import rolesJson from "@/data/roles.json";

const ALL_ROLES_DATA = rolesJson as any[];

const TEAM_EMOJI: Record<string, string> = {
  Village: "🏘️",
  Werewolf: "🐺",
  "Werewolf-aligned": "🐺",
  Neutral: "⚖️",
  "Dynamic Neutral": "⚖️",
  Independent: "🔮",
  Special: "✨",
};

export default function PlayerNameInput() {
  const { config, startGame } = useGameStore();
  const store = useGameStore();

  // Build name map: role_id -> array of names
  const [nameMap, setNameMap] = useState<Record<string, string[]>>(() => {
    const map: Record<string, string[]> = {};
    for (const sr of config.selectedRoles) {
      map[sr.role_id] = Array(sr.count).fill("");
    }
    return map;
  });

  const handleNameChange = (role_id: string, idx: number, value: string) => {
    setNameMap((prev) => {
      const arr = [...(prev[role_id] || [])];
      arr[idx] = value;
      return { ...prev, [role_id]: arr };
    });
  };

  const allFilled = config.selectedRoles.every((sr) => {
    const names = nameMap[sr.role_id] || [];
    return names.every((n) => n.trim().length > 0);
  });

  const handleStartGame = () => {
    const players: Player[] = [];
    let idx = 0;

    for (const sr of config.selectedRoles) {
      const roleData = ALL_ROLES_DATA.find((r) => r.role_id === sr.role_id);
      const names = nameMap[sr.role_id] || [];
      for (const name of names) {
        players.push({
          id: `player-${idx++}`,
          name: name.trim(),
          role_id: sr.role_id,
          canonical_name: sr.canonical_name,
          team: roleData?.team || "Unknown",
          category: roleData?.category || "Unknown",
          seer_result: roleData?.seer_result || "Villager",
          alive: true,
          protected: false,
          silenced: false,
          inCult: false,
          hasUsedAbility: false,
          active_phase: roleData?.active_phase || "",
          action_type: roleData?.action_type || "",
          target_type: roleData?.target_type || "",
          usage_limit: roleData?.usage_limit || "",
          night_priority: roleData?.night_priority || 99,
          can_change_role: roleData?.can_change_role || false,
          tooltip_en: roleData?.tooltip_en || "",
        });
      }
    }

    store.initPlayers(players);
    store.startGame();
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="bg-gradient-to-b from-purple-950 to-gray-950 border-b border-purple-900/50 px-4 py-5">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3">
            <button
              onClick={() => useGameStore.getState().resetGame()}
              className="text-gray-400 hover:text-white transition-colors text-sm"
            >
              ← Kembali
            </button>
          </div>
          <h1 className="text-2xl font-bold text-white mt-2">👥 Nama Pemain</h1>
          <p className="text-gray-400 text-sm">{config.gameName}</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {config.selectedRoles.map((sr) => {
          const roleData = ALL_ROLES_DATA.find((r) => r.role_id === sr.role_id);
          const teamEmoji = TEAM_EMOJI[roleData?.team || ""] || "❓";
          const names = nameMap[sr.role_id] || [];

          return (
            <div
              key={sr.role_id}
              className="bg-gray-900 border border-gray-700 rounded-xl p-4"
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xl">{teamEmoji}</span>
                <h3 className="font-bold text-white">{sr.canonical_name}</h3>
                <span className="text-xs text-gray-400 bg-gray-800 px-2 py-0.5 rounded-full">
                  {sr.count} pemain
                </span>
              </div>

              <div className="space-y-2">
                {names.map((name, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-gray-500 text-sm w-6 text-right">{i + 1}.</span>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => handleNameChange(sr.role_id, i, e.target.value)}
                      placeholder={`Nama pemain ${i + 1}`}
                      className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        <div className="flex justify-end pt-4">
          <button
            onClick={handleStartGame}
            disabled={!allFilled}
            className="px-8 py-3 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all text-lg shadow-lg"
          >
            🎮 MULAI PERMAINAN
          </button>
        </div>
      </div>
    </div>
  );
}