// ============================================================
// ASPIRE: WEREWOLF - Generic Investigation Engine
// Driven by Role Database Blueprint
// "One Village. Many Lies. One Wolf."
// ============================================================

import { PlayerEngineState } from "./types";
import { getAliveAdjacentNeighbors } from "./deathResolver";

export interface InvestigationReport {
  investigatorId: string;
  roleName: string;
  targetId: string;
  targetName: string;
  resultString: string;
  isThreat: boolean;
  backfiredOnInvestigator: boolean;
  notes?: string;
}

/**
 * Resolves standard Seer binary investigation according to database rules.
 * Wolf Man -> Villager
 * Lycan -> Werewolf
 * Werewolves -> Werewolf
 * All other villagers/neutrals -> Villager
 */
export function evaluateSeerResult(target: PlayerEngineState): "Werewolf" | "Villager" {
  if (target.canonical_name === "Wolf Man") {
    return "Villager";
  }
  if (target.canonical_name === "Lycan") {
    return "Werewolf";
  }
  if (target.seer_result === "Werewolf" || target.team === "Werewolf") {
    return "Werewolf";
  }
  return "Villager";
}

/**
 * Universal investigation resolver supporting all investigative roles in the database.
 */
export function resolveInvestigation(
  investigator: PlayerEngineState,
  target: PlayerEngineState,
  allPlayers: PlayerEngineState[],
  secondaryTarget?: PlayerEngineState | null
): InvestigationReport {
  const role = investigator.canonical_name;

  // 1. Standard Seer
  if (role === "Seer" || role === "Apprentice Seer") {
    const res = evaluateSeerResult(target);
    return {
      investigatorId: investigator.id,
      roleName: role,
      targetId: target.id,
      targetName: target.name,
      resultString: res,
      isThreat: res === "Werewolf",
      backfiredOnInvestigator: false,
      notes: `Seer menerawang ${target.name} dan melihat aura ${res}.`,
    };
  }

  // 2. Aura Seer: Detects if player has special powers
  if (role === "Aura Seer") {
    const isSpecial =
      target.canonical_name !== "Villager" &&
      target.canonical_name !== "Werewolf";
    return {
      investigatorId: investigator.id,
      roleName: role,
      targetId: target.id,
      targetName: target.name,
      resultString: isSpecial ? "Kekuatan Khusus" : "Biasa",
      isThreat: isSpecial,
      backfiredOnInvestigator: false,
      notes: `${target.name} memiliki ${isSpecial ? "aura berkekuatan khusus" : "aura biasa"}.`,
    };
  }

  // 3. Sorceress: Searches for the Seer
  if (role === "Sorceress") {
    const isSeer = target.canonical_name === "Seer" || target.canonical_name === "Apprentice Seer";
    return {
      investigatorId: investigator.id,
      roleName: role,
      targetId: target.id,
      targetName: target.name,
      resultString: isSeer ? "Seer Ditemukan" : "Bukan Seer",
      isThreat: isSeer,
      backfiredOnInvestigator: false,
      notes: `${target.name} ${isSeer ? "adalah sang Seer!" : "bukan Seer."}`,
    };
  }

  // 4. Revealer: Inspects target; if not Werewolf, Revealer dies!
  if (role === "Revealer") {
    const isWolf = target.team === "Werewolf" || target.seer_result === "Werewolf";
    return {
      investigatorId: investigator.id,
      roleName: role,
      targetId: target.id,
      targetName: target.name,
      resultString: isWolf ? "Werewolf (Terungkap)" : "Warga (Kegagalan)",
      isThreat: isWolf,
      backfiredOnInvestigator: !isWolf,
      notes: isWolf
        ? `${target.name} terbukti adalah Werewolf!`
        : `Penerawangan gagal! ${target.name} bukan serigala. Revealer gugur karena kutukan!`,
    };
  }

  // 5. P.I. (Paranormal Investigator): Inspects target and both alive neighbors
  if (role.startsWith("P.I.")) {
    const neighbors = getAliveAdjacentNeighbors(allPlayers, target.id);
    const trio = [target, ...neighbors];
    const hasWolf = trio.some(
      (p) => p.team === "Werewolf" || p.seer_result === "Werewolf"
    );
    return {
      investigatorId: investigator.id,
      roleName: role,
      targetId: target.id,
      targetName: target.name,
      resultString: hasWolf ? "Ada Serigala di Antara Mereka" : "Aman / Tidak Ada Serigala",
      isThreat: hasWolf,
      backfiredOnInvestigator: false,
      notes: `P.I. memeriksa ${target.name} dan tetangganya. ${
        hasWolf ? "Setidaknya ada satu Werewolf!" : "Ketiganya bersih dari serigala."
      }`,
    };
  }

  // 6. The Count: Tells current living Werewolf count
  if (role === "The Count") {
    const livingWolves = allPlayers.filter(
      (p) => p.alive && (p.team === "Werewolf" || p.team === "Solo Werewolf")
    ).length;
    return {
      investigatorId: investigator.id,
      roleName: role,
      targetId: investigator.id,
      targetName: "Desa",
      resultString: `${livingWolves} Werewolf Hidup`,
      isThreat: livingWolves > 0,
      backfiredOnInvestigator: false,
      notes: `The Count menghitung ada ${livingWolves} serigala yang masih hidup di desa.`,
    };
  }

  // 7. Mentalist: Compares two players' teams
  if (role === "Mentalist" && secondaryTarget) {
    const sameTeam = target.team === secondaryTarget.team;
    return {
      investigatorId: investigator.id,
      roleName: role,
      targetId: target.id,
      targetName: `${target.name} & ${secondaryTarget.name}`,
      resultString: sameTeam ? "Tim Sama" : "Tim Berbeda",
      isThreat: false,
      backfiredOnInvestigator: false,
      notes: `Mentalist merasakan bahwa ${target.name} dan ${secondaryTarget.name} ${
        sameTeam ? "berada di tim yang sama." : "berada di tim yang berbeda."
      }`,
    };
  }

  // Default fallback
  const binaryRes = evaluateSeerResult(target);
  return {
    investigatorId: investigator.id,
    roleName: role,
    targetId: target.id,
    targetName: target.name,
    resultString: binaryRes,
    isThreat: binaryRes === "Werewolf",
    backfiredOnInvestigator: false,
  };
}
