// ============================================================
// ASPIRE: WEREWOLF - Comprehensive Win Condition Engine
// Driven by Role Database Blueprint
// "One Village. Many Lies. One Wolf."
// ============================================================

import {
  PlayerEngineState,
  WinEvaluationResult,
} from "./types";

export function evaluateWinConditions(
  players: PlayerEngineState[]
): WinEvaluationResult {
  const alivePlayers = players.filter((p) => p.alive);

  // 1. Tanner Individual Win Check
  // If Tanner was eliminated by vote, Tanner wins!
  const tannerWinner = players.find(
    (p) => p.canonical_name === "Tanner" && p.tannerWon
  );
  if (tannerWinner) {
    return {
      hasWon: true,
      winner: "Tanner",
      reason: `Tanner (${tannerWinner.name}) berhasil memancing warga desa untuk mengeksekusinya! Tanner memenangkan permainan seorang diri.`,
      winningPlayerIds: [tannerWinner.id],
    };
  }

  // 2. All Players Dead -> Draw
  if (alivePlayers.length === 0) {
    return {
      hasWon: true,
      winner: "Draw",
      reason: "Semua warga dan makhluk buas telah gugur. Tidak ada yang selamat di desa Aspire.",
      winningPlayerIds: [],
    };
  }

  // 3. Cult Leader Victory Check
  // If Cult Leader is alive and ALL living players are in the Cult
  const cultLeader = alivePlayers.find((p) => p.canonical_name === "Cult Leader");
  if (cultLeader) {
    const nonCultAlive = alivePlayers.filter((p) => !p.inCult && p.id !== cultLeader.id);
    if (nonCultAlive.length === 0) {
      return {
        hasWon: true,
        winner: "Cult Leader",
        reason: `Sang Cult Leader (${cultLeader.name}) telah berhasil mencuci otak seluruh warga yang masih hidup ke dalam sektenya!`,
        winningPlayerIds: alivePlayers.map((p) => p.id),
      };
    }
  }

  // Count teams among alive players
  const aliveWerewolves = alivePlayers.filter(
    (p) =>
      p.team === "Werewolf" ||
      p.team === "Solo Werewolf" ||
      p.team === "Werewolf-aligned"
  );

  const aliveVillage = alivePlayers.filter(
    (p) =>
      p.team === "Village" ||
      p.team === "Village/Dynamic" ||
      p.team === "Village/Unknown"
  );

  const aliveIndependent = alivePlayers.filter(
    (p) =>
      p.team !== "Werewolf" &&
      p.team !== "Solo Werewolf" &&
      p.team !== "Werewolf-aligned" &&
      p.team !== "Village" &&
      p.team !== "Village/Dynamic" &&
      p.team !== "Village/Unknown"
  );

  // 4. Village Victory Check
  // All Werewolves eliminated and at least 1 Villager alive
  if (aliveWerewolves.length === 0 && aliveVillage.length > 0) {
    return {
      hasWon: true,
      winner: "Village",
      reason: "Seluruh kawanan Werewolf telah berhasil dimusnahkan! Desa Aspire kembali damai dan aman.",
      winningPlayerIds: alivePlayers
        .filter((p) => p.team === "Village" || p.team === "Village/Dynamic")
        .map((p) => p.id),
    };
  }

  // 5. Werewolf Victory Check
  // Alive Werewolves reach parity with or outnumber all other living players
  const livingNonWolves = alivePlayers.filter(
    (p) =>
      p.team !== "Werewolf" &&
      p.team !== "Solo Werewolf" &&
      p.team !== "Werewolf-aligned"
  );

  if (aliveWerewolves.length >= livingNonWolves.length && aliveWerewolves.length > 0) {
    return {
      hasWon: true,
      winner: "Werewolf",
      reason: "Kawanan Werewolf telah mencapai paritas atau melampaui jumlah warga yang tersisa! Kegelapan menguasai desa Aspire.",
      winningPlayerIds: aliveWerewolves.map((p) => p.id),
    };
  }

  // Game continues
  return {
    hasWon: false,
    winner: null,
    reason: "",
    winningPlayerIds: [],
  };
}
