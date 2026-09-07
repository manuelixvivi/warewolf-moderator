"use client";
import { useState, useEffect } from "react";
import { useGameStore } from "@/store/gameStore";
import TriggeredActionModal from "@/components/game/TriggeredActionModal";
import ChatBox from "@/components/chat/ChatBox";

export default function MultiplayerDay() {
  const {
    phase,
    players,
    myPlayerId,
    dayCount,
    currentNarrative,
    lastNightResult,
    votes,
    room,
    proceedToVoting,
    castVote,
    resolveDayVotingPhase,
    proceedToNight,
    activeTriggeredAction,
  } = useGameStore();

  const isHost = room?.hostId === myPlayerId;
  const me = players.find((p) => p.id === myPlayerId) || players[0];
  const isAlive = me?.alive ?? true;

  const alivePlayers = players.filter((p) => p.alive);
  const myVote = votes[myPlayerId] || null;

  // Active view tab during day: "CHAT" | "VOTING"
  const [activeTab, setActiveTab] = useState<"CHAT" | "VOTING">("CHAT");

  // Discussion countdown timer (120 seconds default)
  const [timeLeft, setTimeLeft] = useState(120);
  const [timerRunning, setTimerRunning] = useState(true);

  useEffect(() => {
    if (phase !== "DAY_VOTING" || !timerRunning) return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          if (isHost) {
            resolveDayVotingPhase(true);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [phase, timerRunning, isHost, resolveDayVotingPhase]);

  // Compute vote tallies
  const voteTallies: Record<string, number> = {};
  alivePlayers.forEach((p) => {
    voteTallies[p.id] = 0;
  });
  Object.entries(votes).forEach(([voterId, targetId]) => {
    const voter = players.find((p) => p.id === voterId);
    if (voter && voter.alive && targetId && voteTallies[targetId] !== undefined) {
      voteTallies[targetId] += 1;
    }
  });

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  return (
    <div className="min-h-[calc(100vh-65px)] bg-gray-950 text-white px-4 py-6 pb-24 relative overflow-hidden">
      {/* Daylight Atmosphere */}
      <div className="absolute top-10 left-10 w-96 h-96 bg-amber-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-80 h-80 bg-orange-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-3xl mx-auto space-y-6 relative z-10">
        {/* Day Header */}
        <div className="bg-gradient-to-r from-amber-950/70 via-gray-900 to-orange-950/70 border border-amber-800/60 rounded-3xl p-5 sm:p-6 shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
          <div>
            <span className="text-xs font-bold text-amber-400 uppercase tracking-widest flex items-center justify-center sm:justify-start gap-1.5">
              <span>☀️</span> FASE SIANG HARI
            </span>
            <h1 className="text-2xl sm:text-3xl font-black text-white">Hari ke-{dayCount || 1}</h1>
            <p className="text-xs text-gray-400">
              {alivePlayers.length} warga bertahan hidup di desa.
            </p>
          </div>

          {/* Discussion Timer */}
          {phase === "DAY_VOTING" && (
            <div className="flex items-center gap-2">
              <div className="px-3.5 py-1.5 rounded-xl bg-gray-800 border border-gray-700 text-xs font-mono font-bold flex items-center gap-1.5">
                <span>⏱️</span>
                <span className={timeLeft <= 30 ? "text-red-400 animate-pulse" : "text-amber-300"}>
                  {minutes}:{seconds < 10 ? `0${seconds}` : seconds}
                </span>
              </div>
              {isHost && (
                <button
                  type="button"
                  onClick={() => setTimerRunning(!timerRunning)}
                  className="text-xs text-gray-400 hover:text-white px-2 py-1 bg-gray-800 rounded-lg"
                >
                  {timerRunning ? "Pause" : "Resume"}
                </button>
              )}
            </div>
          )}
        </div>

        {/* AI Moderator Narrative Card */}
        <div className="bg-gray-900/90 border border-amber-900/50 rounded-3xl p-5 sm:p-6 shadow-xl space-y-3">
          <div className="flex items-center justify-between border-b border-gray-800 pb-2.5">
            <span className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
              <span>📖</span> Narasi AI Moderator
            </span>
            <span className="text-[10px] text-gray-500 font-mono">ASPIRE ENGINE</span>
          </div>

          <div className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap font-medium">
            {currentNarrative}
          </div>

          {/* Special Investigation Notice for Seer */}
          {me?.canonical_name === "Seer" && lastNightResult && lastNightResult.investigated.length > 0 && (
            <div className="pt-2">
              {lastNightResult.investigated
                .filter((inv) => inv.investigator === me.id)
                .map((inv, idx) => {
                  const target = players.find((p) => p.id === inv.target);
                  return (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-purple-950/80 border border-purple-600 text-xs text-purple-200 flex items-center justify-between"
                    >
                      <span>
                        🔮 <strong>Hasil Terawanganmu:</strong> {target?.name}
                      </span>
                      <span
                        className={`font-black px-2.5 py-0.5 rounded-full ${
                          inv.result === "Werewolf"
                            ? "bg-red-600 text-white"
                            : "bg-emerald-600 text-white"
                        }`}
                      >
                        {inv.result.toUpperCase()}
                      </span>
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        {/* ── INTERACTIVE TABS: CHAT DISKUSI vs MEJA VOTING ──── */}
        <div className="flex rounded-2xl bg-gray-900 p-1.5 border border-gray-800 gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTab("CHAT")}
            className={`flex-1 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all ${
              activeTab === "CHAT"
                ? "bg-purple-600 text-white shadow-lg shadow-purple-950"
                : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
            }`}
          >
            <span>💬</span>
            <span>Chat Diskusi Warga</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("VOTING")}
            className={`flex-1 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all ${
              activeTab === "VOTING"
                ? "bg-amber-600 text-white shadow-lg shadow-amber-950"
                : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
            }`}
          >
            <span>⚖️</span>
            <span>Meja Voting & Status ({Object.keys(votes).length} Suara Masuk)</span>
          </button>
        </div>

        {/* ── TAB 1: LIVE CHAT DISKUSI ──────────────────────── */}
        {activeTab === "CHAT" && (
          <div className="space-y-3 animate-fadeIn">
            <ChatBox
              channel="DAY_PUBLIC"
              title="Obrolan Diskusi Terbuka (Alun-Alun Desa)"
              subtitle="Debat, tuduh, atau bela dirimu melalui chat!"
              placeholder={isAlive ? "Ketik argumen atau kecurigaanmu..." : "Mode Roh (Hanya membaca)"}
              canChat={isAlive}
            />

            {/* Host button to transition to voting if in DAY_NARRATIVE */}
            {isHost && phase === "DAY_NARRATIVE" && (
              <button
                type="button"
                onClick={() => {
                  proceedToVoting();
                  setActiveTab("VOTING");
                }}
                className="w-full py-3.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold text-sm sm:text-base rounded-2xl shadow-xl shadow-amber-950 transition-all flex items-center justify-center gap-2"
              >
                <span>⚖️</span> Buka Meja Pemungutan Suara (Voting) →
              </button>
            )}
          </div>
        )}

        {/* ── TAB 2: MEJA VOTING & STATUS PEMAIN ─────────────── */}
        {activeTab === "VOTING" && (
          <div className="space-y-6 animate-fadeIn">
            {phase === "DAY_VOTING" ? (
              <div className="bg-gray-900/90 border border-gray-800 rounded-3xl p-6 space-y-6 shadow-2xl">
                <div className="space-y-1">
                  <h2 className="text-base font-black text-white flex items-center gap-2">
                    <span>⚖️</span> Pilih Siapa yang Dieliminasi:
                  </h2>
                  <p className="text-xs text-gray-400">
                    Pemain dengan suara terbanyak akan digantung oleh warga desa.
                  </p>
                </div>

                {isAlive ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {alivePlayers.map((p) => {
                        const isSelected = myVote === p.id;
                        const voteCount = voteTallies[p.id] || 0;
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => castVote(isSelected ? null : p.id)}
                            className={`p-3.5 rounded-xl border text-left font-semibold transition-all relative overflow-hidden ${
                              isSelected
                                ? "bg-red-900 border-red-500 text-white shadow-lg shadow-red-950 scale-[1.02]"
                                : "bg-gray-800/80 border-gray-700 text-gray-300 hover:bg-gray-700"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-bold truncate">{p.name}</span>
                              {isSelected && <span className="text-xs text-red-300">⚖️ Pilihanmu</span>}
                            </div>
                            {voteCount > 0 && (
                              <div className="mt-1.5 text-xs text-amber-300 font-mono font-bold">
                                {voteCount} Suara
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {myVote && (
                      <div className="p-3 bg-red-950/80 border border-red-600 rounded-xl text-xs text-red-200 text-center font-bold">
                        Pilihan suaramu: {alivePlayers.find((p) => p.id === myVote)?.name}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-6 rounded-2xl bg-gray-950 border border-gray-800 text-center text-xs text-gray-500">
                    👻 Kamu telah gugur dan tidak memiliki hak suara.
                  </div>
                )}

                {/* Host Finalize Voting */}
                {isHost && (
                  <div className="pt-4 border-t border-gray-800 space-y-3">
                    <button
                      type="button"
                      onClick={() => resolveDayVotingPhase(false)}
                      className="w-full py-4 bg-gradient-to-r from-red-700 via-red-600 to-rose-700 hover:from-red-600 hover:to-rose-600 text-white font-black text-lg rounded-2xl shadow-xl shadow-red-950 transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <span>⚖️</span> SELESAIKAN VOTING & EKSEKUSI HASIL
                    </button>
                    <p className="text-[11px] text-gray-500 text-center">
                      *Pemain dengan suara terbanyak akan dieliminasi oleh warga desa.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-gray-900/90 border border-gray-800 rounded-3xl p-6 text-center space-y-3">
                <span className="text-3xl">💬</span>
                <p className="text-sm font-bold text-gray-200">
                  Saat ini masih dalam waktu diskusi warga.
                </p>
                <p className="text-xs text-gray-400 max-w-sm mx-auto">
                  Gunakan tab Chat Diskusi untuk menganalisis dan berdebat sebelum pemungutan suara dibuka.
                </p>
                {isHost && (
                  <button
                    type="button"
                    onClick={proceedToVoting}
                    className="px-6 py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl text-xs transition-colors"
                  >
                    Buka Meja Voting Sekarang
                  </button>
                )}
              </div>
            )}

            {/* Living Players Roster */}
            <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-5 shadow-lg space-y-3">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                Status Seluruh Warga ({alivePlayers.length} Hidup, {players.length - alivePlayers.length} Gugur)
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {players.map((p) => (
                  <div
                    key={p.id}
                    className={`p-2.5 rounded-lg border text-xs flex items-center justify-between ${
                      p.alive
                        ? "bg-gray-800/80 border-gray-700 text-white"
                        : "bg-gray-950 border-gray-800 text-gray-600 line-through"
                    }`}
                  >
                    <span className="truncate font-medium">{p.name}</span>
                    <span>{p.alive ? "💚" : "💀"}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Host Proceed to Night (if voting done) */}
            {isHost && phase === "DAY_NARRATIVE" && dayCount > 0 && (
              <button
                type="button"
                onClick={proceedToNight}
                className="w-full py-4 bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-600 hover:to-indigo-600 text-white font-black text-lg rounded-2xl shadow-xl shadow-blue-950 transition-all flex items-center justify-center gap-2"
              >
                <span>🌙</span> Lanjut ke Malam Berikutnya →
              </button>
            )}
          </div>
        )}
      </div>

      {/* Triggered Action Modal (Hunter, Tanner, etc.) */}
      {activeTriggeredAction && !activeTriggeredAction.completed && (
        <TriggeredActionModal action={activeTriggeredAction} />
      )}
    </div>
  );
}
