"use client";
import { useGameStore } from "@/store/gameStore";
import { NightAction, Player } from "@/types/game";

const ACTION_EMOJI: Record<string, string> = {
  Kill: "💀",
  Protect: "🛡️",
  "Protect/Heal": "🛡️",
  Investigate: "🔮",
  Silence: "🤫",
  Redirect: "↩️",
  Recruit: "🔄",
  "Copy Role": "📋",
  "Convert/Override": "🔀",
  "Switch Team": "🔀",
  "Steal Role": "🃏",
  "Choose Player": "👆",
  "Tap Neighbor": "👋",
};

function getActionEmoji(actionType: string): string {
  for (const [key, emoji] of Object.entries(ACTION_EMOJI)) {
    if (actionType.toLowerCase().includes(key.toLowerCase())) return emoji;
  }
  return "⚡";
}

const TEAM_COLOR: Record<string, string> = {
  Village: "border-green-600 bg-green-950",
  Werewolf: "border-red-700 bg-red-950",
  "Werewolf-aligned": "border-red-700 bg-red-950",
  "Solo Werewolf": "border-red-700 bg-red-950",
  Neutral: "border-yellow-600 bg-yellow-950",
  Independent: "border-blue-600 bg-blue-950",
  Special: "border-purple-600 bg-purple-950",
};

interface ActionCardProps {
  action: NightAction;
  alivePlayers: Player[];
  performers: Player[];
}

function ActionCard({ action, alivePlayers, performers }: ActionCardProps) {
  const { setNightActionTarget, setNightActionTarget2, completeNightAction } = useGameStore();
  const rep = performers[0];
  const teamColor = rep ? (TEAM_COLOR[rep.team] || "border-gray-600 bg-gray-900") : "border-gray-600 bg-gray-900";
  const emoji = getActionEmoji(action.action_type);
  const needsTarget = !["Passive", "None"].some(p => (action.action_type || "").toLowerCase().includes(p.toLowerCase()));
  const isSpecialNoTarget = action.action_type.toLowerCase().includes("passive") ||
    action.role_name === "Ghost" ||
    action.role_name === "Insomniac";

  return (
    <div className={`rounded-xl border-2 p-4 ${teamColor} ${action.completed ? "opacity-60" : ""}`}>
      {/* Role Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">{emoji}</span>
          <div>
            <h3 className="font-bold text-white text-sm">{action.role_name}</h3>
            {performers.length > 0 && (
              <p className="text-xs text-gray-400">
                {performers.map((p) => p.name).join(", ")}
              </p>
            )}
          </div>
        </div>
        <div
          className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
            action.completed ? "bg-green-500" : "bg-gray-700 border border-gray-500"
          }`}
        >
          {action.completed ? "✓" : "○"}
        </div>
      </div>

      {/* Action Info */}
      <div className="text-xs text-gray-400 mb-3">
        <span className="bg-gray-800 px-2 py-0.5 rounded text-gray-300">{action.action_type}</span>
      </div>

      {/* Target Select */}
      {!isSpecialNoTarget && !action.completed && (
        <div className="space-y-2">
          <label className="text-xs text-gray-400">Target:</label>
          <select
            value={action.target_player_id || ""}
            onChange={(e) => setNightActionTarget(action.id, e.target.value || null)}
            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
          >
            <option value="">— Pilih target —</option>
            {alivePlayers
              .filter((p) => {
                // Werewolves can't target each other for kill
                if (action.action_type.includes("Kill") || action.action_type.includes("Protect")) {
                  return !performers.find((pf) => pf.id === p.id);
                }
                return true;
              })
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </div>
      )}

      {/* Action Button */}
      {!action.completed ? (
        <button
          onClick={() => completeNightAction(action.id)}
          disabled={needsTarget && !action.target_player_id && !isSpecialNoTarget}
          className="mt-3 w-full py-2 bg-purple-700 hover:bg-purple-600 disabled:bg-gray-700 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
        >
          ✓ Selesai
        </button>
      ) : (
        <div className="mt-3 text-center text-green-400 text-sm font-medium">
          ✓ Aksi selesai
        </div>
      )}
    </div>
  );
}

export default function NightDashboard() {
  const { players, nightActions, nightCount, resolveNightPhase } = useGameStore();
  const alivePlayers = players.filter((p) => p.alive);

  const allDone = nightActions.length === 0 || nightActions.every((a) => a.completed);
  const doneCount = nightActions.filter((a) => a.completed).length;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Night Header */}
      <div className="bg-gradient-to-b from-blue-950 to-gray-950 border-b border-blue-900/50 px-4 py-5">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-blue-300">🌙 MALAM {nightCount}</h1>
              <p className="text-gray-400 text-sm">Semua pemain tutup mata</p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-white">
                {doneCount}/{nightActions.length}
              </div>
              <div className="text-xs text-gray-400">aksi selesai</div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mt-3 bg-gray-800 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${nightActions.length ? (doneCount / nightActions.length) * 100 : 100}%` }}
            />
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">
        {nightActions.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p className="text-4xl mb-3">🌙</p>
            <p className="text-lg">Tidak ada aksi malam untuk role yang dipilih.</p>
            <button
              onClick={resolveNightPhase}
              className="mt-4 px-6 py-3 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl transition-colors"
            >
              ☀️ SELESAIKAN MALAM
            </button>
          </div>
        ) : (
          <>
            {/* Action Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
              {nightActions.map((action) => {
                const performers = players.filter((p) => action.player_ids.includes(p.id) && p.alive);
                return (
                  <ActionCard
                    key={action.id}
                    action={action}
                    alivePlayers={alivePlayers}
                    performers={performers}
                  />
                );
              })}
            </div>

            {/* Resolve Button */}
            <div className="flex justify-center">
              <button
                onClick={resolveNightPhase}
                disabled={!allDone}
                className="px-10 py-4 bg-amber-600 hover:bg-amber-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-bold text-xl rounded-2xl transition-all shadow-lg shadow-amber-900/30 hover:shadow-amber-900/50"
              >
                ☀️ SELESAIKAN MALAM
              </button>
              {!allDone && (
                <p className="mt-2 text-xs text-gray-400 text-center block w-full">
                  Selesaikan semua aksi terlebih dahulu
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}