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
  "Find Seer": "🔮",
};

function getActionEmoji(actionType: string): string {
  for (const [key, emoji] of Object.entries(ACTION_EMOJI)) {
    if (actionType.toLowerCase().includes(key.toLowerCase())) return emoji;
  }
  return "⚡";
}

const TEAM_COLOR: Record<string, string> = {
  Village: "border-green-600 bg-green-950/80",
  Werewolf: "border-red-700 bg-red-950/80",
  "Werewolf-aligned": "border-red-700 bg-red-950/80",
  "Solo Werewolf": "border-red-700 bg-red-950/80",
  Neutral: "border-yellow-600 bg-yellow-950/80",
  Independent: "border-blue-600 bg-blue-950/80",
  Special: "border-purple-600 bg-purple-950/80",
};

interface ActionCardProps {
  action: NightAction;
  alivePlayers: Player[];
  performers: Player[];
}

function ActionCard({ action, alivePlayers, performers }: ActionCardProps) {
  const { setNightActionTarget, completeNightAction } = useGameStore();
  const rep = performers[0];
  const teamColor = rep ? (TEAM_COLOR[rep.team] || "border-gray-600 bg-gray-900") : "border-gray-600 bg-gray-900";
  const emoji = getActionEmoji(action.action_type);

  const isSpecialNoTarget =
    action.action_type.toLowerCase().includes("passive") ||
    action.role_name === "Ghost" ||
    action.role_name === "Insomniac";

  const isBodyguard = action.role_name.toLowerCase().includes("bodyguard");
  const isSeerOrInvestigate =
    action.action_type.toLowerCase().includes("investigate") ||
    action.role_name.toLowerCase().includes("seer") ||
    action.role_name.toLowerCase().includes("sorceress") ||
    action.action_type.toLowerCase().includes("see");

  // Filter valid targets
  const validTargets = alivePlayers.filter((p) => {
    // Bodyguard cannot protect self
    if (isBodyguard && performers.some((pf) => pf.id === p.id)) {
      return false;
    }
    // Werewolves cannot kill fellow werewolves
    if (action.action_type.includes("Kill") && performers.some((pf) => pf.id === p.id)) {
      return false;
    }
    return true;
  });

  const targetPlayer = alivePlayers.find((p) => p.id === action.target_player_id);

  const handleSelectTarget = (targetId: string | null) => {
    setNightActionTarget(action.id, targetId);
  };

  return (
    <div
      className={`rounded-2xl border-2 p-4 transition-all ${teamColor} ${
        action.completed ? "ring-1 ring-green-500/50" : "shadow-lg shadow-black/40"
      }`}
    >
      {/* Role Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-2xl shrink-0">{emoji}</span>
          <div className="min-w-0">
            <h3 className="font-bold text-white text-base leading-tight truncate">
              {action.role_name}
            </h3>
            {performers.length > 0 && (
              <p className="text-xs text-purple-300 truncate font-medium">
                Pemain: {performers.map((p) => p.name).join(", ")}
              </p>
            )}
          </div>
        </div>
        <div
          className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors ${
            action.completed
              ? "bg-green-500 text-white shadow-md shadow-green-900"
              : "bg-gray-800 text-gray-400 border border-gray-600"
          }`}
        >
          {action.completed ? "✓" : "○"}
        </div>
      </div>

      {/* Action Type & Notice */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="bg-gray-900/90 border border-gray-700 px-2.5 py-0.5 rounded-full text-xs text-gray-300 font-medium">
          Aksi: {action.action_type}
        </span>
        {isBodyguard && (
          <span className="bg-amber-950/80 border border-amber-600/70 text-amber-200 text-xs px-2 py-0.5 rounded-full font-semibold">
            🛡️ Tidak bisa melindungi diri sendiri
          </span>
        )}
      </div>

      {/* Target Selection */}
      {!isSpecialNoTarget && (
        <div className="space-y-2">
          <label className="text-xs font-semibold text-gray-300 block">
            Pilih Target Pemain:
          </label>

          {/* Quick Select Chips */}
          <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-1">
            {validTargets.map((p) => {
              const isSelected = action.target_player_id === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleSelectTarget(isSelected ? null : p.id)}
                  className={`text-xs px-2.5 py-1.5 rounded-lg border font-medium transition-all ${
                    isSelected
                      ? "bg-purple-600 border-purple-400 text-white shadow-md shadow-purple-900 scale-105"
                      : "bg-gray-800/90 border-gray-700 text-gray-300 hover:bg-gray-700 hover:border-gray-600"
                  }`}
                >
                  {isSelected && <span className="mr-1">✓</span>}
                  {p.name}
                </button>
              );
            })}
          </div>

          {/* Dropdown fallback */}
          <select
            value={action.target_player_id || ""}
            onChange={(e) => handleSelectTarget(e.target.value || null)}
            className="w-full bg-gray-900/90 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
          >
            <option value="">— Atau pilih dari daftar —</option>
            {validTargets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* LIVE SEER / INVESTIGATION RESULT BOX (Shown immediately when target is picked!) */}
      {isSeerOrInvestigate && targetPlayer && (
        <div
          className={`mt-3 p-3.5 rounded-xl border-2 shadow-lg transition-all animate-fadeIn ${
            targetPlayer.seer_result === "Werewolf"
              ? "bg-red-950 border-red-500 shadow-red-950/50 text-red-100"
              : "bg-emerald-950 border-emerald-500 shadow-emerald-950/50 text-emerald-100"
          }`}
        >
          <div className="flex items-center justify-between text-xs mb-1.5 font-bold">
            <span className="flex items-center gap-1.5 text-purple-200">
              🔮 <span>HASIL TERAWANGAN LANGSUNG:</span>
            </span>
            <span className="px-2 py-0.5 rounded bg-black/50 text-gray-300 font-mono text-[10px]">
              TIDAK PERLU NEXT
            </span>
          </div>

          <div className="text-sm font-semibold mb-2">
            Target Diperiksa:{" "}
            <span className="font-bold text-white underline underline-offset-2">
              {targetPlayer.name}
            </span>{" "}
            <span className="text-xs text-gray-300">({targetPlayer.canonical_name})</span>
          </div>

          <div
            className={`py-2.5 px-3 rounded-lg font-black text-center text-base tracking-wider flex items-center justify-center gap-2 shadow-md ${
              targetPlayer.seer_result === "Werewolf"
                ? "bg-red-600 text-white shadow-red-950"
                : "bg-emerald-600 text-white shadow-emerald-950"
            }`}
          >
            {targetPlayer.seer_result === "Werewolf"
              ? "🐺 WEREWOLF"
              : "🧑 VILLAGER (Bukan Werewolf)"}
          </div>

          <p className="text-xs text-center mt-2 font-medium opacity-90">
            {targetPlayer.seer_result === "Werewolf"
              ? "👉 Beri isyarat ke Seer: JEMPOL KE ATAS (Werewolf!)"
              : "👉 Beri isyarat ke Seer: JEMPOL KE BAWAH (Bukan Werewolf)"}
          </p>
        </div>
      )}

      {/* Target Confirmation for other roles */}
      {!isSeerOrInvestigate && targetPlayer && (
        <div className="mt-2.5 px-3 py-1.5 rounded-lg bg-gray-900/80 border border-gray-700 text-xs flex items-center justify-between">
          <span className="text-gray-400">Target terpilih:</span>
          <span className="font-bold text-white">{targetPlayer.name}</span>
        </div>
      )}

      {/* Action Complete Buttons */}
      <div className="mt-3 flex gap-2">
        {!action.completed ? (
          <>
            <button
              type="button"
              onClick={() => completeNightAction(action.id)}
              className="flex-1 py-2 bg-purple-700 hover:bg-purple-600 text-white text-sm font-bold rounded-lg transition-colors shadow"
            >
              ✓ Selesai
            </button>
            <button
              type="button"
              onClick={() => {
                handleSelectTarget(null);
                completeNightAction(action.id);
              }}
              className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200 text-xs font-semibold rounded-lg transition-colors border border-gray-700"
              title="Lewati aksi ini jika tidak ingin menggunakan kekuatan"
            >
              Lewati
            </button>
          </>
        ) : (
          <div className="w-full flex items-center justify-between bg-green-950/60 border border-green-700/60 rounded-lg px-3 py-1.5">
            <span className="text-green-400 text-xs font-bold flex items-center gap-1.5">
              <span>✓</span> Aksi telah tercatat
            </span>
            <button
              type="button"
              onClick={() => {
                useGameStore.setState((state) => ({
                  nightActions: state.nightActions.map((a) =>
                    a.id === action.id ? { ...a, completed: false } : a
                  ),
                }));
              }}
              className="text-xs text-gray-400 hover:text-white underline"
            >
              Ubah
            </button>
          </div>
        )}
      </div>
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
              <h1 className="text-2xl font-bold text-blue-300 flex items-center gap-2">
                <span>🌙</span> MALAM {nightCount}
              </h1>
              <p className="text-gray-400 text-sm">
                Semua pemain menutup mata — Moderator memandu fase malam
              </p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-black text-white">
                {doneCount}/{nightActions.length}
              </div>
              <div className="text-xs text-gray-400">aksi selesai</div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mt-3 bg-gray-800 rounded-full h-2 overflow-hidden">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-500"
              style={{
                width: `${
                  nightActions.length ? (doneCount / nightActions.length) * 100 : 100
                }%`,
              }}
            />
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">
        {nightActions.length === 0 ? (
          <div className="text-center py-12 text-gray-400 bg-gray-900/50 border border-gray-800 rounded-2xl p-8">
            <p className="text-5xl mb-3">🌙</p>
            <p className="text-lg font-semibold text-white">
              Tidak ada aksi malam untuk role yang aktif saat ini.
            </p>
            <p className="text-sm text-gray-400 mt-1 mb-6">
              Semua role pasif atau hanya aktif saat siang / tereliminasi.
            </p>
            <button
              type="button"
              onClick={resolveNightPhase}
              className="px-8 py-3.5 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl transition-all shadow-lg text-base"
            >
              ☀️ SELESAIKAN MALAM & MASUK SIANG
            </button>
          </div>
        ) : (
          <>
            {/* Action Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
              {nightActions.map((action) => {
                const performers = players.filter(
                  (p) => action.player_ids.includes(p.id) && p.alive
                );
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

            {/* Resolve Button Footer */}
            <div className="flex flex-col items-center justify-center pt-2 pb-10">
              <button
                type="button"
                onClick={resolveNightPhase}
                disabled={!allDone}
                className="px-10 py-4 bg-amber-600 hover:bg-amber-500 disabled:bg-gray-800 disabled:text-gray-500 disabled:cursor-not-allowed text-white font-black text-xl rounded-2xl transition-all shadow-xl shadow-amber-950 hover:scale-105 active:scale-95 flex items-center gap-2"
              >
                <span>☀️</span> SELESAIKAN MALAM
              </button>
              {!allDone && (
                <p className="mt-3 text-xs text-yellow-400/90 text-center font-medium bg-yellow-950/40 border border-yellow-800/40 rounded-full px-4 py-1">
                  ⚠ Selesaikan atau lewati semua aksi malam di atas terlebih dahulu
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
