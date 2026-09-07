// ============================================================
// ASPIRE: WEREWOLF - Universal Win Condition Engine
// Driven by Role Database Blueprint (75 Roles, 79 Abilities)
// "One Village. Many Lies. One Wolf."
// ============================================================

import {
  PlayerEngineState,
  WinEvaluationResult,
} from "./types";

export interface WinEngineOptions {
  timeoutCount?: number; // Total timeouts occurred (for Father Time)
}

/**
 * Universal evaluation of win conditions across all 75 roles and factions:
 * 1. Tanner (Solo Win on vote elimination)
 * 2. Father Time (Neutral Win on 3 timeouts)
 * 3. Cult Leader (Cult Win if all living players are in Cult)
 * 4. Lone Wolf (Solo Werewolf Win if sole survivor)
 * 5. Hoodlum (Solo Win if both marked targets are dead)
 * 6. The Blob (Blob Win if absorbs or outnumbers town)
 * 7. The Mummy (Mummy Win if sole faction alive)
 * 8. Zombie (Zombie Win if sole faction alive or village brain-dead)
 * 9. Vampire / Count Dracula (Vampire Win on parity over village & wolves dead)
 * 10. Chupacabra (Chupacabra Win if wolves dead and village decimated)
 * 11. Werewolf Faction (Parity with remaining living players)
 * 12. Village Faction (All wolves and evil factions eliminated)
 * 13. Draw (All players dead)
 *
 * Also checks auxiliary winners:
 * - Nostradamus (ROLE-080): wins alongside predicted winning team!
 * - Mo T. Le'Sav / Tom Vasel (ROLE-014): survives till end game!
 * - Alexander / Kimb / Blockchain (ROLE-002): dynamic alignment!
 */
export function evaluateWinConditions(
  players: PlayerEngineState[],
  options?: WinEngineOptions
): WinEvaluationResult {
  const alivePlayers = players.filter((p) => p.alive);
  const timeoutCount = options?.timeoutCount || 0;

  // Helper to append auxiliary winners (Nostradamus, Mo T. Le'Sav, Alexander/Kimb)
  const enrichWinners = (
    baseWinner: string,
    baseTeams: string[],
    basePlayerIds: string[],
    reason: string
  ): WinEvaluationResult => {
    const winningPlayerIds = new Set<string>(basePlayerIds);
    const winningTeams = new Set<string>(baseTeams);

    // Nostradamus (ROLE-080) check
    for (const p of players) {
      if (
        (p.role_id === "ROLE-080" || p.canonical_name === "Nostradamus") &&
        p.predictedWinningTeam
      ) {
        if (
          winningTeams.has(p.predictedWinningTeam) ||
          baseWinner.toLowerCase().includes(p.predictedWinningTeam.toLowerCase())
        ) {
          winningPlayerIds.add(p.id);
          winningTeams.add("Prediction");
        }
      }
    }

    // Mo T. Le'Sav / Tom Vasel (ROLE-014) check: wins if alive when game ends
    for (const p of alivePlayers) {
      if (
        p.role_id === "ROLE-014" ||
        p.canonical_name === "Mo T. Le'Sav / Tom Vasel" ||
        p.canonical_name?.toLowerCase().includes("tom vasel")
      ) {
        winningPlayerIds.add(p.id);
        winningTeams.add("Solo");
      }
    }

    // Alexander / Kimb / Blockchain (ROLE-002): if aligned with winning team
    for (const p of alivePlayers) {
      if (
        p.role_id === "ROLE-002" ||
        p.canonical_name?.toLowerCase().includes("alexander")
      ) {
        if (winningTeams.has(p.team)) {
          winningPlayerIds.add(p.id);
        }
      }
    }

    return {
      gameEnded: true,
      hasWon: true,
      winner: baseWinner,
      winningPlayerIds: Array.from(winningPlayerIds),
      winningTeams: Array.from(winningTeams),
      reason,
    };
  };

  // 1. Tanner Individual Win Check
  const tannerWinner = players.find(
    (p) => (p.role_id === "ROLE-053" || p.canonical_name === "Tanner") && p.tannerWon
  );
  if (tannerWinner) {
    return enrichWinners(
      "Tanner",
      ["Solo"],
      [tannerWinner.id],
      `Tanner (${tannerWinner.name}) berhasil memancing warga desa untuk mengeksekusinya! Tanner memenangkan permainan seorang diri.`
    );
  }

  // 2. Father Time (ROLE-007) Check: 3 timeouts
  if (timeoutCount >= 3) {
    const fatherTime = players.find(
      (p) => (p.role_id === "ROLE-007" || p.canonical_name === "Father Time") && p.alive
    );
    if (fatherTime) {
      return enrichWinners(
        "Father Time",
        ["Neutral"],
        [fatherTime.id],
        `Father Time (${fatherTime.name}) menang karena waktu telah habis sebanyak 3 kali!`
      );
    }
  }

  // 3. All Players Dead -> Draw
  if (alivePlayers.length === 0) {
    return {
      gameEnded: true,
      hasWon: true,
      winner: "Draw",
      reason: "Semua warga dan makhluk buas telah gugur. Tidak ada yang selamat di desa Aspire.",
      winningPlayerIds: [],
      winningTeams: [],
    };
  }

  // 4. Cult Leader (ROLE-029) Victory Check
  // Cult Leader is alive and ALL other living players are in the Cult
  const cultLeader = alivePlayers.find(
    (p) => p.role_id === "ROLE-029" || p.canonical_name === "Cult Leader"
  );
  if (cultLeader) {
    const nonCultAlive = alivePlayers.filter(
      (p) => !p.inCult && p.id !== cultLeader.id
    );
    if (nonCultAlive.length === 0) {
      return enrichWinners(
        "Cult Leader",
        ["Cult"],
        alivePlayers.map((p) => p.id),
        `Sang Cult Leader (${cultLeader.name}) telah berhasil merekrut seluruh warga yang masih hidup ke dalam sektenya!`
      );
    }
  }

  // 5. Lone Wolf (ROLE-040) Victory Check
  // If Lone Wolf is the ONLY living player
  const loneWolf = alivePlayers.find(
    (p) => p.role_id === "ROLE-040" || p.canonical_name === "Lone Wolf"
  );
  if (loneWolf && alivePlayers.length === 1) {
    return enrichWinners(
      "Lone Wolf",
      ["Solo Werewolf"],
      [loneWolf.id],
      `Lone Wolf (${loneWolf.name}) adalah satu-satunya yang bertahan hidup dan memenangkan permainan seorang diri!`
    );
  }

  // 6. Hoodlum (ROLE-036) Solo Victory Check
  // If Hoodlum is alive, both marked targets are dead, and all others dead or Hoodlum survives
  const hoodlum = alivePlayers.find(
    (p) => p.role_id === "ROLE-036" || p.canonical_name === "Hoodlum"
  );
  if (hoodlum && hoodlum.markedTargetIds && hoodlum.markedTargetIds.length === 2) {
    const target1 = players.find((p) => p.id === hoodlum.markedTargetIds![0]);
    const target2 = players.find((p) => p.id === hoodlum.markedTargetIds![1]);
    const bothTargetsDead = target1 && !target1.alive && target2 && !target2.alive;

    // If Hoodlum is sole survivor or targets dead with few survivors
    if (bothTargetsDead && alivePlayers.length === 1) {
      return enrichWinners(
        "Hoodlum",
        ["Solo"],
        [hoodlum.id],
        `Hoodlum (${hoodlum.name}) berhasil menyaksikan kedua targetnya tewas dan menjadi pemenang tunggal!`
      );
    }
  }

  // 7. The Blob (ROLE-068) Victory Check
  const blobAlive = alivePlayers.filter(
    (p) => p.role_id === "ROLE-068" || p.team === "Blob"
  );
  const nonBlobAlive = alivePlayers.filter(
    (p) => p.role_id !== "ROLE-068" && p.team !== "Blob"
  );
  if (blobAlive.length > 0 && nonBlobAlive.length === 0) {
    return enrichWinners(
      "The Blob",
      ["Blob"],
      blobAlive.map((p) => p.id),
      "The Blob telah menyerap seluruh makhluk di desa Aspire!"
    );
  }

  // 8. The Mummy (ROLE-069) Victory Check
  const mummyAlive = alivePlayers.filter(
    (p) => p.role_id === "ROLE-069" || p.team === "Mummy"
  );
  const nonMummyAlive = alivePlayers.filter(
    (p) => p.role_id !== "ROLE-069" && p.team !== "Mummy"
  );
  if (mummyAlive.length > 0 && nonMummyAlive.length === 0) {
    return enrichWinners(
      "The Mummy",
      ["Mummy"],
      mummyAlive.map((p) => p.id),
      "The Mummy telah menghipnotis dan menguasai seluruh desa!"
    );
  }

  // 9. Zombie (ROLE-070) Victory Check
  const zombieAlive = alivePlayers.filter(
    (p) => p.role_id === "ROLE-070" || p.team === "Zombie" || p.isZombie
  );
  const nonZombieAlive = alivePlayers.filter(
    (p) => p.role_id !== "ROLE-070" && p.team !== "Zombie" && !p.isZombie
  );
  if (zombieAlive.length > 0 && nonZombieAlive.length === 0) {
    return enrichWinners(
      "Zombie",
      ["Zombie"],
      zombieAlive.map((p) => p.id),
      "Wabah Zombie telah menginfeksi dan memakan otak seluruh warga desa!"
    );
  }

  // 10. Vampire (ROLE-025, ROLE-065) Victory Check
  const vampireAlive = alivePlayers.filter(
    (p) =>
      p.role_id === "ROLE-025" ||
      p.role_id === "ROLE-065" ||
      p.team === "Vampire"
  );
  const werewolfAlive = alivePlayers.filter(
    (p) =>
      p.team === "Werewolf" ||
      p.team === "Solo Werewolf" ||
      p.team === "Werewolf-aligned"
  );
  const nonVampireAlive = alivePlayers.filter(
    (p) =>
      p.role_id !== "ROLE-025" &&
      p.role_id !== "ROLE-065" &&
      p.team !== "Vampire"
  );

  if (
    vampireAlive.length > 0 &&
    werewolfAlive.length === 0 &&
    vampireAlive.length >= nonVampireAlive.length
  ) {
    return enrichWinners(
      "Vampire",
      ["Vampire"],
      vampireAlive.map((p) => p.id),
      "Klan Vampire telah melenyapkan Werewolf dan menguasai warga desa!"
    );
  }

  // 11. Chupacabra (ROLE-078) Victory Check
  const chupacabraAlive = alivePlayers.filter(
    (p) => p.role_id === "ROLE-078" || p.canonical_name === "Chupacabra"
  );
  if (
    chupacabraAlive.length > 0 &&
    werewolfAlive.length === 0 &&
    alivePlayers.length <= 2
  ) {
    return enrichWinners(
      "Chupacabra",
      ["Chupacabra"],
      chupacabraAlive.map((p) => p.id),
      "Chupacabra telah memburu seluruh Werewolf dan menjadi predator puncak di desa Aspire!"
    );
  }

  // 12. Werewolf Victory Check
  // Werewolves reach parity with or outnumber all other living players,
  // provided no hostile special factions outpower them
  const livingNonWolves = alivePlayers.filter(
    (p) =>
      p.team !== "Werewolf" &&
      p.team !== "Solo Werewolf" &&
      p.team !== "Werewolf-aligned"
  );

  if (werewolfAlive.length >= livingNonWolves.length && werewolfAlive.length > 0) {
    return enrichWinners(
      "Werewolf",
      ["Werewolf", "Werewolf-aligned"],
      werewolfAlive.map((p) => p.id),
      "Kawanan Werewolf telah mencapai paritas atau melampaui jumlah warga yang tersisa! Kegelapan menguasai desa Aspire."
    );
  }

  // 13. Village Victory Check
  // All Werewolves and hostile factions eliminated, and at least 1 Village player alive
  const aliveVillage = alivePlayers.filter(
    (p) =>
      p.team === "Village" ||
      p.team === "Village/Dynamic" ||
      p.team === "Village/Unknown"
  );

  const hostileFactionsAlive =
    werewolfAlive.length +
    vampireAlive.length +
    blobAlive.length +
    mummyAlive.length;

  if (hostileFactionsAlive === 0 && aliveVillage.length > 0) {
    return enrichWinners(
      "Village",
      ["Village", "Village/Dynamic"],
      aliveVillage.map((p) => p.id),
      "Seluruh ancaman Werewolf dan makhluk jahat telah berhasil dimusnahkan! Desa Aspire kembali damai dan aman."
    );
  }

  // Game continues
  return {
    gameEnded: false,
    hasWon: false,
    winner: null,
    winningPlayerIds: [],
    winningTeams: [],
    reason: "",
  };
}
