"use client";
import { useState } from "react";
import { useGameStore } from "@/store/gameStore";
import { Player } from "@/types/game";
import TriggeredActionModal from "./TriggeredActionModal";

const TEAM_COLORS: Record<string, string> = {
  Village: "bg-green-900 border-green-700",
  Werewolf: "bg-red-900 border-red-700",
  "Werewolf-aligned": "bg-red-900 border-red-700",
  Neutral: "bg-yellow-900 border-yellow-700",
  Independent: "bg-blue-900 border-blue-700",
};

interface PlayerChipProps {
  player: Player;
  selected: boolean;
  onClick: () => void;
}

function PlayerChip({ player, selected, onClick }: PlayerChipProps) {
  return (
    <button
      onClick={onClick}
      disabled={!player.alive}
      className={`relative px-4 py-3 rounded-xl border-2 transition-all text-left ${
        !player.alive
          ? "opacity-40 cursor-not-allowed bg-gray-900 border-gray-700 line-through text-gray-500"
          : selected
          ? "bg-red-900 border-red-500 shadow-lg shadow-red-900/30 scale-105"
          : "bg-gray-800 border-gray-600 hover:border-gray-500 hover:bg-gray-700"
      }`}
    >
      {!player.alive && (
        <div className="absolute -top-1 -right-1 bg-gray-700 text-gray-400 text-xs rounded-full w-5 h-5 flex items-center justify-center">
          ✕
        </div>
      )}
      <div className="font-medium text-white text-sm">{player.name}</div>
      <div className="text-xs text-gray-400 mt-0.5">
        {player.canonical_name}
      </div>
    </button>
  );
}

export default function DayDashboard() {
  const {
    players,
    dayCount,
    currentNarrative,
    lastNightResult,
    voteEliminate,
    startNight,
    activeTriggeredAction,
    winResult,
  } = useGameStore();

  const [selectedVote, setSelectedVote] = useState<string | null>(null);
  const [voteConfirmed, setVoteConfirmed] = useState(false);
  const [showReveal, setShowReveal] = useState<Record<string, boolean>>({});

  const alivePlayers = players.filter((p) => p.alive);
  const deadPlayers = players.filter((p) => !p.alive);

  const handleVote = () => {
    if (!selectedVote) return;
    voteEliminate(selectedVote);
    setVoteConfirmed(true);
  };

  const handleToggleReveal = (playerId: string) => {
    setShowReveal((prev) => ({ ...prev, [playerId]: !prev[playerId] }));
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Day Header */}
      <div className="bg-gradient-to-b from-amber-950 to-gray-950 border-b border-amber-900/50 px-4 py-5">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-amber-300">☀️ HARI {dayCount}</h1>
            <p className="text-gray-400 text-sm">
              {alivePlayers.length} pemain tersisa
            </p>
          </div>
          <div className="text-right text-xs text-gray-500">
            <div>💚 {alivePlayers.filter(p => p.team === "Village" || p.team === "Village/Dynamic").length} Village</div>
            <div>❤️ {alivePlayers.filter(p => p.team === "Werewolf" || p.team === "Werewolf-aligned").length} Werewolf</div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Narrative */}
        <div className="bg-gray-900 rounded-2xl border border-amber-900/50 p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-amber-400 font-semibold text-sm">📖 NARASI</span>
          </div>
          <div className="text-gray-200 leading-relaxed whitespace-pre-wrap prose prose-invert">
            {currentNarrative}
          </div>
          {lastNightResult && lastNightResult.investigated.length > 0 && (
            <div className="mt-4 space-y-2">
              {lastNightResult.investigated.map((inv, i) => {
                const investigator = players.find(p => p.id === inv.investigator);
                const target = players.find(p => p.id === inv.target);
                return (
                  <div key={i} className="bg-purple-900/30 border border-purple-700/50 rounded-lg p-3 text-sm">
                    🔮 <strong>{investigator?.name || "Seer"}</strong> menyelidiki{" "}
                    <strong>{target?.name}</strong> → Hasil:{" "}
                    <span className={inv.result === "Werewolf" ? "text-red-400 font-bold" : "text-green-400 font-bold"}>
                      {inv.result}
                    </span>
                    <span className="text-xs text-gray-500 ml-2">(hanya diketahui moderator)</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Voting Section */}
        {!voteConfirmed && (
          <div className="bg-gray-900 rounded-2xl border border-gray-700 p-5">
            <h2 className="text-lg font-bold text-white mb-4">⚖️ Voting — Siapa yang Dieliminasi?</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-4">
              {alivePlayers.map((p) => (
                <PlayerChip
                  key={p.id}
                  player={p}
                  selected={selectedVote === p.id}
                  onClick={() => setSelectedVote(selectedVote === p.id ? null : p.id)}
                />
              ))}
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setVoteConfirmed(true)}
                className="px-4 py-2 text-gray-400 hover:text-white text-sm transition-colors"
              >
                Lewati (tidak ada yang dieliminasi)
              </button>
              <button
                onClick={handleVote}
                disabled={!selectedVote}
                className="px-6 py-2 bg-red-700 hover:bg-red-600 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-colors"
              >
                ⚖️ ELIMINASI
              </button>
            </div>
          </div>
        )}

        {voteConfirmed && (
          <div className="bg-gray-900 rounded-2xl border border-gray-700 p-5">
            <div className="text-center text-green-400 text-sm mb-3">✓ Voting selesai</div>
            {selectedVote && (() => {
              const eliminated = players.find(p => p.id === selectedVote);
              return eliminated && (
                <div className="mb-4 p-3 bg-red-900/30 border border-red-700/50 rounded-lg text-center">
                  <p className="text-white font-bold">{eliminated.name}</p>
                  {showReveal[selectedVote] ? (
                    <p className="text-gray-300 text-sm mt-1">Role: {eliminated.canonical_name} ({eliminated.team})</p>
                  ) : (
                    <button
                      onClick={() => handleToggleReveal(selectedVote)}
                      className="mt-2 text-xs text-gray-400 hover:text-white underline"
                    >
                      Ungkap role?
                    </button>
                  )}
                </div>
              );
            })()}
            <div className="flex justify-end">
              <button
                onClick={startNight}
                className="px-8 py-3 bg-blue-800 hover:bg-blue-700 text-white font-bold text-lg rounded-xl transition-all shadow-lg"
              >
                🌙 MULAI MALAM BERIKUTNYA
              </button>
            </div>
          </div>
        )}

        {/* Player List */}
        <div className="bg-gray-900 rounded-2xl border border-gray-700 p-5">
          <h2 className="text-lg font-bold text-white mb-4">👥 Status Pemain</h2>
          <div className="space-y-2">
            {players.map((p) => (
              <div
                key={p.id}
                className={`flex items-center justify-between px-4 py-2 rounded-lg border ${
                  p.alive ? "bg-gray-800 border-gray-700" : "bg-gray-900 border-gray-800 opacity-50"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={p.alive ? "text-green-400" : "text-gray-600"}>
                    {p.alive ? "●" : "✕"}
                  </span>
                  <span className={`font-medium ${p.alive ? "text-white" : "text-gray-500 line-through"}`}>
                    {p.name}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {!p.alive && (
                    <>
                      {showReveal[p.id] ? (
                        <span className="text-xs text-gray-400">{p.canonical_name}</span>
                      ) : (
                        <button
                          onClick={() => handleToggleReveal(p.id)}
                          className="text-xs text-gray-500 hover:text-gray-300 underline"
                        >
                          Ungkap
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Triggered Action Modal */}
      {activeTriggeredAction && !activeTriggeredAction.completed && (
        <TriggeredActionModal action={activeTriggeredAction} />
      )}
    </div>
  );
}