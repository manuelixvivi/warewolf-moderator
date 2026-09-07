// ============================================================
// ASPIRE: WEREWOLF - Generic Protection & Defensive Engine
// Driven by Role Database Blueprint
// "One Village. Many Lies. One Wolf."
// ============================================================

import { PlayerEngineState, DeathCause } from "./types";

export interface DefenseEvaluationResult {
  deathPrevented: boolean;
  delayedDeath: boolean;
  convertedInstead: boolean;
  newRoleOrTeam?: string;
  defenseType?: "PROTECTION" | "CURSED_CONVERSION" | "TOUGH_GUY_DELAY" | "PRINCE_SURVIVAL";
  reason: string;
}

/**
 * Evaluates whether a player targeted for death has protection, immunity,
 * conversion defense (Cursed), or delayed death (Tough Guy).
 */
export function evaluateDefense(
  target: PlayerEngineState,
  deathCause: DeathCause,
  currentNight: number = 1
): DefenseEvaluationResult {
  // 1. Holy Protection (Bodyguard, Priest) against nighttime attacks
  if (target.protected && (deathCause === "WEREWOLF_ATTACK" || deathCause === "ABILITY" || deathCause === "WEREWOLF")) {
    return {
      deathPrevented: true,
      delayedDeath: false,
      convertedInstead: false,
      defenseType: "PROTECTION",
      reason: "Serangan digagalkan oleh perlindungan suci!",
    };
  }

  // 2. Cursed defense against Werewolves
  if (
    (target.role_id === "ROLE-031" || target.canonical_name === "Cursed" || target.isCursed) &&
    (deathCause === "WEREWOLF_ATTACK" || deathCause === "WEREWOLF")
  ) {
    return {
      deathPrevented: true,
      delayedDeath: false,
      convertedInstead: true,
      defenseType: "CURSED_CONVERSION",
      newRoleOrTeam: "Werewolf",
      reason: "Kutukan darah bangkit! Target berubah menjadi Werewolf alih-alih mati.",
    };
  }

  // 3. Tough Guy delayed death
  if (
    (target.role_id === "ROLE-054" || target.canonical_name === "Tough Guy") &&
    (deathCause === "WEREWOLF_ATTACK" || deathCause === "WEREWOLF") &&
    !target.delayedDeathNight
  ) {
    return {
      deathPrevented: true,
      delayedDeath: true,
      convertedInstead: false,
      defenseType: "TOUGH_GUY_DELAY",
      reason: "Tough Guy terlalu tangguh untuk mati malam ini. Ia bertahan hidup hingga malam berikutnya.",
    };
  }

  // 4. Prince Lynch Survival (Daytime Vote only)
  if (
    (target.role_id === "ROLE-050" || target.canonical_name === "Prince") &&
    deathCause === "VOTE" &&
    !target.princeProtectedUsed
  ) {
    return {
      deathPrevented: true,
      delayedDeath: false,
      convertedInstead: false,
      defenseType: "PRINCE_SURVIVAL",
      reason: "Sang Pangeran memperlihatkan garis keturunan bangsawan dan selamat dari tiang gantungan!",
    };
  }

  // 5. Idiot Lynch Survival (Daytime Vote only)
  if (
    (target.canonical_name === "Idiot" || target.canonical_name === "Village Idiot") &&
    deathCause === "VOTE" &&
    !target.idiotSurvivesUsed
  ) {
    return {
      deathPrevented: true,
      delayedDeath: false,
      convertedInstead: false,
      reason: "Warga menyadari kemalangan sang Idiot dan mengampuninya, namun ia kehilangan hak suara!",
    };
  }

  // Standard death proceeds
  return {
    deathPrevented: false,
    delayedDeath: false,
    convertedInstead: false,
    reason: "",
  };
}
