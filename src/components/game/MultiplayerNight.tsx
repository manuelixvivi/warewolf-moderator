"use client";
import { useGameStore } from "@/store/gameStore";
import { useState } from "react";

export default function MultiplayerNight() {
  const {
    players,
    myPlayerId,
    nightCount,
    nightActions,
    room,
    submitNightAction,
    resolveNightPhase,
    seerResultHistory,
  } = useGameStore();

  const isHost = room?.hostId === myPlayerId;
  const me = players.find((p) => p.id === myPlayerId) || players[0];
  const isAlive = me?.alive ?? true;

  const roleName = me?.canonical_name || "Villager";
  const roleTeam = me?.team || "Village";
  const actionType = me?.action_type || "";
  const isWerewolf = roleTeam === "Werewolf" || roleTeam === "Werewolf-aligned";
  const isSeer = roleName.toLowerCase().includes("seer");
  const isBodyguard = roleName.toLowerCase().includes("bodyguard");

  const hasNightAction =
    isAlive &&
    (isWerewolf ||
      isSeer ||
      isBodyguard ||
      ["Protect", "Investigate", "Kill", "Silence", "Save / Kill"].some((a) =>
        actionType.includes(a)
      ));

  const alivePlayers = players.filter((p) => p.alive);

  // Targets eligible for this player
  const validTargets = alivePlayers.filter((p) => {
    if (isBodyguard && p.id === me.id) return false; // Bodyguard cannot protect self
    if (isWerewolf && (p.team === "Werewolf" || p.team === "Werewolf-aligned")) return false; // Wolves don't kill wolves
    return true;
  });

  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(me.nightTargetId || null);
  const [submitted, setSubmitted] = useState(false);

  const handleSelect = (targetId: string | null) => {
    setSelectedTargetId(targetId);
    submitNightAction(targetId);
  };

  const handleConfirmAction = () => {
    submitNightAction(selectedTargetId);
    setSubmitted(true);
  };

  // Seer immediate live calculation
  const targetPlayer = alivePlayers.find((p) => p.id === selectedTargetId);
  const seerResult = targetPlayer
    ? targetPlayer.seer_result === "Werewolf"
      ? "Werewolf"
      : "Villager"
    : null;

  const completedActionsCount = nightActions.filter((a) => a.completed).length;

  return (
    <div className="min-h-[calc(100vh-65px)] bg-gray-950 text-white px-4 py-8 pb-24 relative overflow-hidden">
      {/* Night Sky Atmosphere */}
      <div className="absolute top-10 right-10 w-80 h-80 bg-blue-900/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 left-10 w-96 h-96 bg-purple-900/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-2xl mx-auto space-y-6 relative z-10">
        {/* Night Header */}
        <div className="bg-gradient-to-r from-blue-950/70 via-gray-900 to-indigo-950/70 border border-blue-800/60 rounded-3xl p-6 shadow-2xl text-center space-y-2">
          <span className="text-xs font-bold text-blue-400 uppercase tracking-widest flex items-center justify-center gap-1.5">
            <span>🌙</span> FASE MALAM HARI
          </span>
          <h1 className="text-3xl font-black text-white">Malam ke-{nightCount}</h1>
          <p className="text-xs sm:text-sm text-gray-400 max-w-md mx-auto">
            Semua warga desa tertidur. Peran-peran malam bertindak secara rahasia melalui perangkat masing-masing.
          </p>
        </div>

        {/* ── CASE 1: PLAYER IS DEAD ────────────────────────── */}
        {!isAlive && (
          <div className="bg-gray-900/90 border border-gray-800 rounded-3xl p-8 text-center space-y-3">
            <div className="text-5xl">👻</div>
            <h2 className="text-xl font-bold text-gray-300">Kamu Telah Gugur</h2>
            <p className="text-xs text-gray-500 max-w-sm mx-auto">
              Kamu berada dalam Mode Roh (Spectator). Jangan membocorkan peranmu atau informasi apa pun kepada pemain yang masih hidup!
            </p>
          </div>
        )}

        {/* ── CASE 2: PLAYER SLEEPING (NO NIGHT ACTION) ─────── */}
        {isAlive && !hasNightAction && (
          <div className="bg-gradient-to-b from-blue-950/40 to-gray-900/90 border border-blue-900/40 rounded-3xl p-8 sm:p-12 text-center space-y-4 shadow-xl">
            <div className="w-24 h-24 rounded-full bg-blue-950/80 border border-blue-500/30 flex items-center justify-center text-5xl mx-auto shadow-2xl shadow-blue-950 animate-pulse">
              🌙
            </div>
            <div className="space-y-1">
              <h2 className="text-2xl font-black text-blue-200">Kamu Tertidur Pulas...</h2>
              <p className="text-xs text-gray-400">
                Peranmu: <span className="font-bold text-white">{roleName}</span>
              </p>
            </div>
            <p className="text-xs sm:text-sm text-gray-300 max-w-md mx-auto leading-relaxed pt-2">
              Tidak ada aksi malam untuk peranmu malam ini. Berpura-puralah tidur di depan teman-temanmu dan dengarkan suara AI Moderator hingga fajar tiba!
            </p>
          </div>
        )}

        {/* ── CASE 3: WEREWOLF NIGHT ACTION ─────────────────── */}
        {isAlive && isWerewolf && (
          <div className="bg-gradient-to-b from-red-950/70 to-gray-900 border border-red-700/60 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl shadow-red-950/40">
            <div className="flex items-center gap-3 border-b border-red-900/50 pb-4">
              <div className="text-4xl">🐺</div>
              <div>
                <h2 className="text-xl font-black text-red-200">Serigala Bangun!</h2>
                <p className="text-xs text-red-300 font-medium">
                  Pilih satu warga desa yang ingin kalian mangsa malam ini.
                </p>
              </div>
            </div>

            {/* Target Select */}
            <div className="space-y-3">
              <label className="text-xs font-bold text-gray-300 uppercase tracking-wider block">
                Pilih Korban Mangsa:
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {validTargets.map((p) => {
                  const isSelected = selectedTargetId === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleSelect(isSelected ? null : p.id)}
                      className={`p-3 rounded-xl border text-left font-semibold text-sm transition-all ${
                        isSelected
                          ? "bg-red-700 border-red-400 text-white shadow-lg shadow-red-950 scale-[1.02]"
                          : "bg-gray-800/80 border-gray-700 text-gray-300 hover:bg-gray-700"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="truncate">{p.name}</span>
                        {isSelected && <span>💀</span>}
                      </div>
                    </button>
                  );
                })}
              </div>

              {selectedTargetId && (
                <div className="p-3 bg-red-950/90 border border-red-600 rounded-xl text-xs text-red-200 text-center font-bold">
                  Target mangsa terpilih: {alivePlayers.find((p) => p.id === selectedTargetId)?.name}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── CASE 4: SEER NIGHT ACTION ─────────────────────── */}
        {isAlive && isSeer && (
          <div className="bg-gradient-to-b from-purple-950/70 to-gray-900 border border-purple-700/60 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl shadow-purple-950/40">
            <div className="flex items-center gap-3 border-b border-purple-900/50 pb-4">
              <div className="text-4xl">🔮</div>
              <div>
                <h2 className="text-xl font-black text-purple-200">Seer Bangun!</h2>
                <p className="text-xs text-purple-300 font-medium">
                  Pilih satu pemain untuk diterawang. Hasilnya langsung muncul seketika di layarmu!
                </p>
              </div>
            </div>

            {/* Target Select */}
            <div className="space-y-3">
              <label className="text-xs font-bold text-gray-300 uppercase tracking-wider block">
                Pilih Pemain yang Ingin Diterawang:
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {validTargets.map((p) => {
                  const isSelected = selectedTargetId === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleSelect(isSelected ? null : p.id)}
                      className={`p-3 rounded-xl border text-left font-semibold text-sm transition-all ${
                        isSelected
                          ? "bg-purple-700 border-purple-400 text-white shadow-lg shadow-purple-950 scale-[1.02]"
                          : "bg-gray-800/80 border-gray-700 text-gray-300 hover:bg-gray-700"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="truncate">{p.name}</span>
                        {isSelected && <span>🔮</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* IMMEDIATE SEER RESULT BOX (NO NEXT BUTTON REQUIRED!) */}
            {selectedTargetId && targetPlayer && seerResult && (
              <div
                className={`p-5 rounded-2xl border-2 shadow-2xl transition-all animate-fadeIn ${
                  seerResult === "Werewolf"
                    ? "bg-red-950 border-red-500 text-red-100 shadow-red-950/60"
                    : "bg-emerald-950 border-emerald-500 text-emerald-100 shadow-emerald-950/60"
                }`}
              >
                <div className="flex items-center justify-between text-xs font-bold mb-2">
                  <span className="uppercase tracking-widest flex items-center gap-1.5">
                    🔮 HASIL TERAWANGAN LANGSUNG
                  </span>
                  <span className="px-2 py-0.5 rounded bg-black/40 text-gray-300 text-[10px]">
                    REAL-TIME
                  </span>
                </div>

                <div className="text-sm font-semibold mb-2">
                  Pemain: <span className="text-white text-base font-bold underline underline-offset-2">{targetPlayer.name}</span>
                </div>

                <div
                  className={`py-3 px-4 rounded-xl font-black text-center text-xl tracking-wider flex items-center justify-center gap-2 shadow-lg ${
                    seerResult === "Werewolf"
                      ? "bg-red-600 text-white"
                      : "bg-emerald-600 text-white"
                  }`}
                >
                  {seerResult === "Werewolf" ? "🐺 WEREWOLF" : "🧑 VILLAGER (Bukan Werewolf)"}
                </div>

                <p className="text-xs text-center mt-3 font-medium opacity-90">
                  {seerResult === "Werewolf"
                    ? "Waspadalah! Pemain ini berpihak pada kawanan Serigala."
                    : "Pemain ini bukan serigala. Cari sekutu dan lindungi dia."}
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── CASE 5: BODYGUARD NIGHT ACTION ────────────────── */}
        {isAlive && isBodyguard && (
          <div className="bg-gradient-to-b from-amber-950/70 to-gray-900 border border-amber-700/60 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl shadow-amber-950/40">
            <div className="flex items-center gap-3 border-b border-amber-900/50 pb-4">
              <div className="text-4xl">🛡️</div>
              <div>
                <h2 className="text-xl font-black text-amber-200">Bodyguard Bangun!</h2>
                <p className="text-xs text-amber-300 font-medium">
                  Pilih satu warga untuk dilindungi dari serangan serigala.
                </p>
              </div>
            </div>

            <div className="text-xs text-amber-300/90 bg-amber-950/50 border border-amber-700/60 rounded-xl px-3 py-2 flex items-center gap-2">
              <span>🛡️</span>
              <span>Aturan Resmi: Bodyguard tidak dapat melindungi dirinya sendiri.</span>
            </div>

            {/* Target Select */}
            <div className="space-y-3">
              <label className="text-xs font-bold text-gray-300 uppercase tracking-wider block">
                Pilih Warga yang Ingin Dilindungi:
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {validTargets.map((p) => {
                  const isSelected = selectedTargetId === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleSelect(isSelected ? null : p.id)}
                      className={`p-3 rounded-xl border text-left font-semibold text-sm transition-all ${
                        isSelected
                          ? "bg-amber-700 border-amber-400 text-white shadow-lg shadow-amber-950 scale-[1.02]"
                          : "bg-gray-800/80 border-gray-700 text-gray-300 hover:bg-gray-700"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="truncate">{p.name}</span>
                        {isSelected && <span>🛡️</span>}
                      </div>
                    </button>
                  );
                })}
              </div>

              {selectedTargetId && (
                <div className="p-3 bg-amber-950/90 border border-amber-600 rounded-xl text-xs text-amber-200 text-center font-bold">
                  Warga terlindungi: {alivePlayers.find((p) => p.id === selectedTargetId)?.name}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── ACTION CONFIRM BUTTON (FOR ACTIVE PLAYERS) ───── */}
        {hasNightAction && (
          <button
            type="button"
            onClick={handleConfirmAction}
            className="w-full py-3.5 bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-600 hover:to-indigo-600 text-white font-bold rounded-2xl text-base shadow-xl transition-all"
          >
            {submitted ? "✓ Aksi Telah Disimpan (Bisa Diubah Kapan Saja)" : "✓ Simpan Pilihan Aksi"}
          </button>
        )}

        {/* ── HOST ONLY: RESOLVE NIGHT FOOTER ───────────────── */}
        {isHost && (
          <div className="bg-gray-900 border-2 border-amber-600/70 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-amber-400 uppercase tracking-wider block">
                  Panel Pemilik Room (Host)
                </span>
                <p className="text-xs text-gray-400">
                  Aksi pemain malam tercatat:{" "}
                  <span className="text-white font-bold">{completedActionsCount}</span> selesai.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={resolveNightPhase}
              className="w-full py-4 bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 hover:from-amber-500 hover:to-orange-500 text-white font-black text-lg sm:text-xl rounded-2xl shadow-xl shadow-amber-950 transition-all flex items-center justify-center gap-2 cursor-pointer hover:scale-[1.01] active:scale-[0.99]"
            >
              <span>☀️</span> SELESAIKAN MALAM & MASUK KE FAJAR
            </button>
            <p className="text-[11px] text-gray-500 text-center">
              *Host dapat menekan tombol ini setelah semua pemain menyelesaikan aksinya untuk mengumumkan hasil malam.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
