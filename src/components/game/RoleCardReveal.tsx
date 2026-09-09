"use client";
import { useState } from "react";
import { useGameStore } from "@/store/gameStore";
import Tooltip from "@/components/ui/Tooltip";

const ROLE_ICONS: Record<string, string> = {
  Werewolf: "🐺",
  "Alpha Wolf": "🐺",
  "Wolf Cub": "🐺",
  "Big Bad Wolf": "🐺",
  "Lone Wolf": "🐺",
  "Wolf Man": "🐺",
  Seer: "🔮",
  "Aura Seer": "✨",
  "Apprentice Seer": "🔮",
  Bodyguard: "🛡️",
  Doctor: "💉",
  Priest: "✝️",
  Hunter: "🏹",
  Witch: "🧙‍♀️",
  Villager: "🧑",
  Mayor: "🎖️",
  Pacifist: "🕊️",
  Tanner: "🧶",
  Cupid: "💘",
  Doppelganger: "🎭",
  Spellcaster: "🤫",
  Lycan: "🐾",
  Cursed: "🩸",
  Diseased: "🤢",
  Mason: "🧱",
  Vampire: "🧛",
  "Cult Leader": "🕯️",
};

const TEAM_GLOW: Record<string, { border: string; bg: string; text: string; badge: string }> = {
  Village: {
    border: "border-emerald-500 shadow-emerald-950/80",
    bg: "from-emerald-950/80 via-gray-900 to-black",
    text: "text-emerald-300",
    badge: "bg-emerald-950 border-emerald-600 text-emerald-200",
  },
  Werewolf: {
    border: "border-red-600 shadow-red-950/80",
    bg: "from-red-950/80 via-gray-900 to-black",
    text: "text-red-300",
    badge: "bg-red-950 border-red-600 text-red-200",
  },
  "Werewolf-aligned": {
    border: "border-red-600 shadow-red-950/80",
    bg: "from-red-950/80 via-gray-900 to-black",
    text: "text-red-300",
    badge: "bg-red-950 border-red-600 text-red-200",
  },
  Neutral: {
    border: "border-amber-500 shadow-amber-950/80",
    bg: "from-amber-950/80 via-gray-900 to-black",
    text: "text-amber-300",
    badge: "bg-amber-950 border-amber-600 text-amber-200",
  },
};

export default function RoleCardReveal() {
  const { players, myPlayerId, room, proceedToNight, setPlayerReady, myPrivateRole } = useGameStore();
  const [isRevealed, setIsRevealed] = useState(false);

  const me = players.find((p) => p.id === myPlayerId) || players[0];
  const isHost = room?.hostId === myPlayerId;
  const readyCount = players.filter((p) => p.isReady).length;

  const roleName = myPrivateRole?.canonical_name || me?.canonical_name || "Villager";
  const roleTeam = myPrivateRole?.team || me?.team || "Village";
  const roleIcon = ROLE_ICONS[roleName] || "🎭";
  const teamStyle = TEAM_GLOW[roleTeam] || TEAM_GLOW.Village;

  // Authoritative Fog-of-War: Fellow werewolves delivered strictly via private player state
  const isWerewolf = roleTeam === "Werewolf" || roleTeam === "Werewolf-aligned";
  const fellowWerewolves = isWerewolf ? (myPrivateRole?.fellowTeamMembers || []) : [];

  return (
    <div className="min-h-[calc(100vh-65px)] bg-gray-950 text-white flex flex-col items-center justify-center px-4 py-8 relative overflow-hidden">
      {/* Mystical Background Glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-purple-900/15 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-md w-full mx-auto space-y-6 relative z-10">
        {/* Title Header */}
        <div className="text-center space-y-1">
          <span className="text-[11px] font-bold text-purple-400 uppercase tracking-widest">
            ASPIRE: WEREWOLF • PEMBAGIAN PERAN
          </span>
          <h1 className="text-2xl font-black text-white">Kartu Peran Rahasiamu</h1>
          <p className="text-xs text-gray-400">
            Jaga kerahasiaan layarmu. Ketuk kartu untuk membuka atau menyembunyikan.
          </p>
        </div>

        {/* 3D Interactive Tarot Card */}
        <div
          onClick={() => setIsRevealed(!isRevealed)}
          className="cursor-pointer select-none group perspective-1000"
        >
          {!isRevealed ? (
            // ── CARD BACK (HIDDEN) ─────────────────────────
            <div className="w-full aspect-[3/4.6] rounded-3xl p-6 bg-gradient-to-b from-gray-900 via-purple-950/40 to-gray-950 border-2 border-purple-500/50 shadow-2xl shadow-purple-950 flex flex-col items-center justify-between text-center relative overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:border-purple-400">
              {/* Card Back Corner Runes */}
              <div className="absolute top-3 left-3 text-purple-500/40 text-xs font-mono">✦ 1888</div>
              <div className="absolute top-3 right-3 text-purple-500/40 text-xs font-mono">✦</div>
              <div className="absolute bottom-3 left-3 text-purple-500/40 text-xs font-mono">✦</div>
              <div className="absolute bottom-3 right-3 text-purple-500/40 text-xs font-mono">✦</div>

              {/* Decorative Frame */}
              <div className="w-full h-full border border-purple-800/40 rounded-2xl flex flex-col items-center justify-between p-6">
                <div className="space-y-1 pt-2">
                  <span className="text-xs font-bold text-purple-400 tracking-widest uppercase">
                    ASPIRE: WEREWOLF
                  </span>
                  <p className="text-[10px] text-gray-400 italic">
                    One Village. Many Lies. One Wolf.
                  </p>
                </div>

                <div className="flex flex-col items-center space-y-3">
                  <div className="w-24 h-24 rounded-full bg-gradient-to-br from-purple-800/60 to-indigo-950 flex items-center justify-center text-5xl shadow-2xl shadow-purple-900/80 border-2 border-purple-400/40 animate-pulse">
                    🌕
                  </div>
                  <span className="font-bold text-sm text-purple-200">
                    Peran Terenkripsi
                  </span>
                </div>

                <div className="space-y-2 pb-2">
                  <div className="px-5 py-2.5 rounded-full bg-purple-900/80 hover:bg-purple-800 text-white font-bold text-xs tracking-wider uppercase border border-purple-500/60 shadow-lg">
                    🔮 KETUK UNTUK MEMBUKA KARTU
                  </div>
                  <p className="text-[10px] text-gray-400">
                    Pastikan tidak ada orang lain yang melihat layarmu
                  </p>
                </div>
              </div>
            </div>
          ) : (
            // ── CARD FRONT (REVEALED) ──────────────────────
            <div
              className={`w-full aspect-[3/4.6] rounded-3xl p-6 bg-gradient-to-b ${teamStyle.bg} border-2 ${teamStyle.border} shadow-2xl flex flex-col justify-between text-center relative overflow-hidden transition-all duration-300`}
            >
              {/* Top Bar: Team Badge */}
              <div className="flex items-center justify-between gap-2 border-b border-gray-800/80 pb-3">
                <span className={`text-[11px] px-3 py-1 rounded-full font-bold border ${teamStyle.badge}`}>
                  TIM {roleTeam.toUpperCase()}
                </span>
                <Tooltip
                  roleName={roleName}
                  contentId={me?.description_id || me?.tooltip_id}
                  contentEn={me?.description_en || me?.tooltip_en}
                >
                  <button
                    type="button"
                    onClick={(e) => e.stopPropagation()}
                    className="w-6 h-6 rounded-full bg-gray-800 hover:bg-purple-700 text-gray-300 text-xs font-bold flex items-center justify-center border border-gray-700 transition-colors"
                  >
                    ?
                  </button>
                </Tooltip>
              </div>

              {/* Role Artwork & Name */}
              <div className="flex flex-col items-center space-y-2 py-2">
                <div className="w-24 h-24 rounded-2xl bg-black/40 border border-white/10 flex items-center justify-center text-6xl shadow-xl">
                  {roleIcon}
                </div>
                <div>
                  <h2 className="text-2xl sm:text-3xl font-black text-white tracking-wide">
                    {roleName}
                  </h2>
                  <p className={`text-xs font-bold uppercase tracking-widest ${teamStyle.text}`}>
                    {me?.category || roleTeam}
                  </p>
                </div>
              </div>

              {/* Description & Objective */}
              <div className="space-y-3 bg-black/40 border border-white/10 rounded-2xl p-3.5 text-left">
                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">
                    Kemampuan Peran:
                  </span>
                  <p className="text-xs text-gray-200 leading-relaxed">
                    {me?.description_id || me?.tooltip_id || me?.description_en || "Anggota desa biasa."}
                  </p>
                </div>

                {/* Fellow Werewolves list (if Werewolf) */}
                {isWerewolf && (
                  <div className="pt-1.5 border-t border-red-900/50">
                    <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider block mb-0.5">
                      🐺 Kawan Serigalamu:
                    </span>
                    {fellowWerewolves.length > 0 ? (
                      <p className="text-xs text-red-200 font-semibold">
                        {fellowWerewolves.map((w) => w.name).join(", ")}
                      </p>
                    ) : (
                      <p className="text-xs text-gray-400 italic">
                        Kamu adalah satu-satunya serigala di malam ini.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Tap to hide hint */}
              <div className="pt-2">
                <span className="text-[11px] text-gray-400 hover:text-white underline transition-colors">
                  🙈 Ketuk kartu untuk menyembunyikan kembali
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Action Controls & Readiness */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-gray-400 px-1">
            <span>Pemain Siap:</span>
            <span className="font-bold text-purple-300">
              {readyCount} / {players.length} Pemain
            </span>
          </div>

          {!me.isReady ? (
            <button
              type="button"
              onClick={setPlayerReady}
              className="w-full py-3.5 bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-600 hover:to-indigo-600 text-white font-bold rounded-xl text-base shadow-xl transition-all"
            >
              ✓ Saya Mengerti Peran Saya
            </button>
          ) : (
            <div className="w-full py-3 bg-green-950/80 border border-green-600 text-green-300 text-center font-bold text-sm rounded-xl">
              ✓ Kamu sudah siap! Menunggu malam pertama...
            </div>
          )}

          {/* Host proceeds to Night Phase */}
          {isHost && (
            <button
              type="button"
              onClick={proceedToNight}
              className="w-full py-3.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-black rounded-xl text-base shadow-xl shadow-amber-950 transition-all flex items-center justify-center gap-2"
            >
              <span>🌙</span> Mulai Malam Pertama (AI Moderator) →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
