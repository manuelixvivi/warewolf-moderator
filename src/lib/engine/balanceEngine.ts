// ============================================================
// ASPIRE: WEREWOLF - Balance Engine & Mode Allocators
// Driven by Role Database Blueprint (75 Roles, 79 Abilities)
// "One Village. Many Lies. One Wolf."
// ============================================================

import { RoleData, SelectedRole } from "@/types/game";
import { ALL_ROLES, ROLE_BY_ID } from "./abilityRegistry";
import { CompositionBalance } from "./types";

export const MINIMUM_PLAYERS = 5;

/**
 * Computes balance metrics for a set of roles.
 */
export function calculateCompositionBalance(roles: RoleData[]): CompositionBalance {
  let villageScore = 0;
  let werewolfScore = 0;
  let neutralScore = 0;
  let totalBalanceWeight = 0;

  for (const r of roles) {
    totalBalanceWeight += r.balance_weight || 0;
    const points = r.role_points || 1;

    if (r.team === "Village" || r.team === "Village/Dynamic" || r.team === "Village/Unknown") {
      villageScore += points;
    } else if (
      r.team === "Werewolf" ||
      r.team === "Solo Werewolf" ||
      r.team === "Werewolf-aligned"
    ) {
      werewolfScore += points;
    } else {
      neutralScore += points;
    }
  }

  // A composition is generally balanced if balance_weight is within [-4, +4]
  const isBalanced = Math.abs(totalBalanceWeight) <= 4;
  let recommendation = "Komposisi seimbang.";
  if (totalBalanceWeight > 4) {
    recommendation = "Komposisi terlalu menguntungkan warga desa. Tambahkan peran serigala atau netral.";
  } else if (totalBalanceWeight < -4) {
    recommendation = "Komposisi terlalu berat untuk serigala. Tambahkan peran pelindung desa.";
  }

  return {
    villageScore,
    werewolfScore,
    neutralScore,
    totalBalanceWeight,
    isBalanced,
    recommendation,
  };
}

/**
 * Mode 1: Fixed Composition Validator
 * Enforces strict exact-match. No silent Villager padding.
 */
export function validateMode1Fixed(
  playerCount: number,
  selectedRoles: SelectedRole[]
): { valid: boolean; error?: string; totalSelectedCount: number } {
  if (playerCount < MINIMUM_PLAYERS) {
    return {
      valid: false,
      error: `Minimal pemain adalah ${MINIMUM_PLAYERS} orang. Saat ini hanya ada ${playerCount} pemain.`,
      totalSelectedCount: 0,
    };
  }

  const totalSelectedCount = selectedRoles.reduce((acc, r) => acc + r.count, 0);

  if (totalSelectedCount !== playerCount) {
    return {
      valid: false,
      error: `Jumlah role terpilih (${totalSelectedCount}) tidak sama dengan jumlah pemain (${playerCount}). Mode 1 mengharuskan jumlah role persis sama tanpa penambahan otomatis.`,
      totalSelectedCount,
    };
  }

  return { valid: true, totalSelectedCount };
}

/**
 * Mode 2: Role Pool Validator
 * Enforces:
 * 1. Minimum 5 players
 * 2. At least one wolf-side role in the pool
 * 3. At least one village/other role in the pool
 */
export function validateMode2Pool(
  poolRoles: SelectedRole[],
  playerCount: number
): { valid: boolean; error?: string } {
  if (playerCount < MINIMUM_PLAYERS) {
    return {
      valid: false,
      error: `Minimal pemain adalah ${MINIMUM_PLAYERS} orang. Saat ini ada ${playerCount} pemain.`,
    };
  }

  const roleObjects = poolRoles
    .map((sr) => ROLE_BY_ID.get(sr.role_id) || ALL_ROLES.find((r) => r.role_id === sr.role_id))
    .filter(Boolean) as RoleData[];

  if (roleObjects.length === 0) {
    return {
      valid: false,
      error: "Pool peran kosong. Silakan tentukan peran yang diperbolehkan di pool.",
    };
  }

  const hasWolfSide = roleObjects.some(
    (r) =>
      r.team === "Werewolf" ||
      r.team === "Solo Werewolf" ||
      r.team === "Werewolf-aligned"
  );

  if (!hasWolfSide) {
    return {
      valid: false,
      error: "Role pool wajib memiliki minimal 1 peran di pihak Werewolf agar permainan dapat dimulai.",
    };
  }

  return { valid: true };
}

/**
 * Mode 2: Role Pool Picker
 * Selects a balanced subset strictly from the host's allowed pool.
 * NO PADDING OUTSIDE POOL: Under no circumstance does this add roles not in the pool.
 */
export function selectBalancedSubsetFromPool(
  poolRoles: SelectedRole[],
  playerCount: number
): RoleData[] {
  const validation = validateMode2Pool(poolRoles, playerCount);
  if (!validation.valid) {
    throw new Error(validation.error || "Validasi Mode 2 gagal.");
  }

  // Extract unique role objects from pool
  const allowedRoles = poolRoles
    .map((sr) => ROLE_BY_ID.get(sr.role_id) || ALL_ROLES.find((r) => r.role_id === sr.role_id))
    .filter(Boolean) as RoleData[];

  const wolfCandidates = allowedRoles.filter(
    (r) =>
      r.team === "Werewolf" ||
      r.team === "Solo Werewolf" ||
      r.team === "Werewolf-aligned"
  );
  const otherCandidates = allowedRoles.filter(
    (r) =>
      r.team !== "Werewolf" &&
      r.team !== "Solo Werewolf" &&
      r.team !== "Werewolf-aligned"
  );

  // Target wolf count based on player count (~20-25%)
  const targetWolfCount = playerCount <= 6 ? 1 : playerCount <= 9 ? 2 : 3;

  const selectedRoles: RoleData[] = [];

  // Pick wolves strictly from wolf pool candidates
  for (let i = 0; i < targetWolfCount; i++) {
    const wolf = wolfCandidates[i % wolfCandidates.length];
    selectedRoles.push(wolf);
  }

  // Pick remaining roles strictly from other candidates (or pool if no other candidates)
  const remainingNeeded = playerCount - selectedRoles.length;
  const poolForRest = otherCandidates.length > 0 ? otherCandidates : allowedRoles;

  for (let i = 0; i < remainingNeeded; i++) {
    const candidate = poolForRest[i % poolForRest.length];
    selectedRoles.push(candidate);
  }

  return selectedRoles;
}

/**
 * Mode 3: Dynamic Full Random / Open Room Balanced Generator
 * Generates a balanced, rich role set from all 75 roles for any player count >= 5.
 */
export function generateBalancedRandomComposition(playerCount: number): RoleData[] {
  if (playerCount < MINIMUM_PLAYERS) {
    throw new Error(`Minimal ${MINIMUM_PLAYERS} pemain dibutuhkan.`);
  }

  const getRole = (name: string): RoleData => {
    const found = ALL_ROLES.find((r) => r.canonical_name.toLowerCase() === name.toLowerCase());
    if (!found) {
      return ALL_ROLES[0];
    }
    return found;
  };

  const roles: RoleData[] = [];

  // 1. Werewolf allocation
  const wolfRoles = [
    getRole("Werewolf"),
    getRole("Wolf Cub"),
    getRole("Alpha Wolf"),
    getRole("Dire Wolf"),
    getRole("Big Bad Wolf"),
    getRole("Wolf Man"),
    getRole("Fruit Brute"),
  ].filter(Boolean);

  const targetWolves = playerCount <= 6 ? 1 : playerCount <= 9 ? 2 : playerCount <= 11 ? 3 : 4;
  for (let i = 0; i < targetWolves; i++) {
    roles.push(wolfRoles[i % wolfRoles.length]);
  }

  // 2. Core Village Investigation
  const seer = getRole("Seer");
  roles.push(seer);

  // 3. Core Village Protection (only for 6+ players to keep small games balanced)
  if (playerCount >= 6) {
    const bodyguard = getRole("Bodyguard");
    roles.push(bodyguard);
  }

  // 4. Special Roles scaled to player count
  if (playerCount >= 7) {
    roles.push(getRole("Tanner"));
  }
  if (playerCount >= 9) {
    roles.push(getRole("Hunter"));
  }
  if (playerCount >= 11) {
    roles.push(getRole("Witch"));
  }
  if (playerCount >= 13) {
    roles.push(getRole("Mayor"));
  }

  // 5. Fill remaining slots with standard Villagers
  const villager = getRole("Villager");
  while (roles.length < playerCount) {
    roles.push(villager);
  }

  return roles;
}

/**
 * Shuffles an array cryptographically / securely.
 */
export function shuffleRoles<T>(array: T[]): T[] {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
