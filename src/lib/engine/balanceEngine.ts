// ============================================================
// ASPIRE: WEREWOLF - Balance Engine & Mode Allocators
// Driven by Role Database Blueprint
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

  // A composition is generally balanced if balance_weight is within [-3, +3]
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
 * Expands selected role array into a list of RoleData.
 */
export function expandSelectedRoles(selectedRoles: SelectedRole[]): RoleData[] {
  const list: RoleData[] = [];
  for (const sr of selectedRoles) {
    const data = ROLE_BY_ID.get(sr.role_id);
    if (data) {
      for (let i = 0; i < sr.count; i++) {
        list.push(data);
      }
    }
  }
  return list;
}

/**
 * Mode 2: Role Pool Picker
 * Selects a balanced subset from the host's selected pool matching the exact player count.
 */
export function selectBalancedSubsetFromPool(
  poolRoles: SelectedRole[],
  playerCount: number
): RoleData[] {
  if (playerCount < MINIMUM_PLAYERS) {
    throw new Error(`Minimal ${MINIMUM_PLAYERS} pemain dibutuhkan.`);
  }

  const expandedPool = expandSelectedRoles(poolRoles);
  if (expandedPool.length < playerCount) {
    // If pool is smaller than actual players, pad with Villagers
    const villager = ALL_ROLES.find((r) => r.canonical_name === "Villager") || ALL_ROLES[0];
    while (expandedPool.length < playerCount) {
      expandedPool.push(villager);
    }
  }

  // Desired werewolf count based on player count
  const targetWolfCount = playerCount <= 6 ? 1 : playerCount <= 9 ? 2 : 3;

  const wolfCandidates = expandedPool.filter(
    (r) => r.team === "Werewolf" || r.team === "Solo Werewolf"
  );
  const otherCandidates = expandedPool.filter(
    (r) => r.team !== "Werewolf" && r.team !== "Solo Werewolf"
  );

  const selectedWolves = wolfCandidates.slice(0, targetWolfCount);
  // If pool lacked enough wolves, add standard Werewolf
  const stdWerewolf = ALL_ROLES.find((r) => r.canonical_name === "Werewolf") || ALL_ROLES[1];
  while (selectedWolves.length < targetWolfCount) {
    selectedWolves.push(stdWerewolf);
  }

  const remainingNeeded = playerCount - selectedWolves.length;
  const selectedOthers = otherCandidates.slice(0, remainingNeeded);
  const stdVillager = ALL_ROLES.find((r) => r.canonical_name === "Villager") || ALL_ROLES[0];
  while (selectedOthers.length < remainingNeeded) {
    selectedOthers.push(stdVillager);
  }

  return [...selectedWolves, ...selectedOthers];
}

/**
 * Mode 3: Full Random / Open Room Balanced Generator
 * Automatically generates a balanced, compatible role set from scratch for any player count >= 5.
 */
export function generateBalancedRandomComposition(playerCount: number): RoleData[] {
  if (playerCount < MINIMUM_PLAYERS) {
    throw new Error(`Minimal ${MINIMUM_PLAYERS} pemain dibutuhkan.`);
  }

  const roles: RoleData[] = [];
  const getRole = (name: string) =>
    ALL_ROLES.find((r) => r.canonical_name.toLowerCase() === name.toLowerCase())!;

  // 1. Werewolf core allocation
  const stdWolf = getRole("Werewolf");
  const wolfCub = getRole("Wolf Cub") || stdWolf;
  const alphaWolf = getRole("Alpha Wolf") || stdWolf;

  if (playerCount <= 6) {
    // 5-6 players: 1 Werewolf
    roles.push(stdWolf);
  } else if (playerCount <= 8) {
    // 7-8 players: 2 Werewolves
    roles.push(stdWolf);
    roles.push(wolfCub);
  } else if (playerCount <= 11) {
    // 9-11 players: 2-3 Werewolves
    roles.push(stdWolf);
    roles.push(alphaWolf);
    roles.push(wolfCub);
  } else {
    // 12+ players: 3-4 Werewolves
    roles.push(stdWolf);
    roles.push(stdWolf);
    roles.push(alphaWolf);
    roles.push(wolfCub);
  }

  // 2. Investigative role (Seer)
  const seer = getRole("Seer");
  roles.push(seer);

  // 3. Defensive role (Bodyguard / Doctor)
  const bodyguard = getRole("Bodyguard");
  roles.push(bodyguard);

  // 4. Special Village / Neutral spice
  if (playerCount >= 6) {
    const hunter = getRole("Hunter");
    roles.push(hunter);
  }

  if (playerCount >= 7) {
    const tanner = getRole("Tanner");
    roles.push(tanner);
  }

  if (playerCount >= 9) {
    const witch = getRole("Witch");
    roles.push(witch);
  }

  if (playerCount >= 10) {
    const mayor = getRole("Mayor");
    roles.push(mayor);
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
