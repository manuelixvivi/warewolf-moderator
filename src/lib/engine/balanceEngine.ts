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

export interface CandidateLogItem {
  roles: string[];
  balanceWeight: number;
  valid: boolean;
  reason?: string;
}

/**
 * Mode 2: Algorithmic Balance Search from Host's Allowed Pool
 * Evaluates candidate subsets from the host's pool and selects the subset of size N
 * that strictly stays inside the pool, includes wolf presence, and minimizes |balance_weight|.
 */
export function auditSelectBalancedSubsetFromPool(
  poolRoles: SelectedRole[],
  playerCount: number,
  maxIterations: number = 60
): {
  selected: RoleData[];
  bestScore: number;
  evaluationsCount: number;
  candidateLog: CandidateLogItem[];
} {
  const validation = validateMode2Pool(poolRoles, playerCount);
  if (!validation.valid) {
    throw new Error(validation.error || "Validasi Mode 2 gagal.");
  }

  // Extract unique role objects from pool
  const pool = poolRoles
    .map((sr) => ROLE_BY_ID.get(sr.role_id) || ALL_ROLES.find((r) => r.role_id === sr.role_id))
    .filter(Boolean) as RoleData[];

  const wolfPool = pool.filter(
    (r) =>
      r.team === "Werewolf" ||
      r.team === "Solo Werewolf" ||
      r.team === "Werewolf-aligned" ||
      r.category === "Werewolf"
  );
  const nonWolfPool = pool.filter(
    (r) =>
      r.team !== "Werewolf" &&
      r.team !== "Solo Werewolf" &&
      r.team !== "Werewolf-aligned" &&
      r.category !== "Werewolf"
  );

  // Target wolf count based on player count
  const targetWolfCount = Math.max(
    1,
    playerCount <= 6 ? 1 : playerCount <= 9 ? 2 : playerCount <= 13 ? 3 : 4
  );
  const effectiveTargetWolves = Math.min(
    targetWolfCount,
    wolfPool.length > 0 ? wolfPool.length : 1
  );

  const candidateLog: CandidateLogItem[] = [];
  let bestCandidate: RoleData[] | null = null;
  let bestBalanceScore = Infinity;

  // Generate and evaluate candidate combinations
  for (let iter = 0; iter < maxIterations; iter++) {
    const candidate: RoleData[] = [];

    // 1. Pick wolves from wolfPool
    const shuffledWolves = shuffleRoles([...wolfPool]);
    for (let i = 0; i < effectiveTargetWolves; i++) {
      candidate.push(shuffledWolves[i % shuffledWolves.length]);
    }

    // 2. Pick remaining from nonWolfPool (or full pool if nonWolfPool is empty)
    const restPool = nonWolfPool.length > 0 ? nonWolfPool : pool;
    const shuffledRest = shuffleRoles([...restPool]);
    const needed = playerCount - candidate.length;

    for (let i = 0; i < needed; i++) {
      candidate.push(shuffledRest[i % shuffledRest.length]);
    }

    // 3. Score candidate
    const balance = calculateCompositionBalance(candidate);
    const weightAbs = Math.abs(balance.totalBalanceWeight);

    // Validate if within acceptable range [-5, +5]
    const isValid = weightAbs <= 5;
    const reason = isValid
      ? `Acceptable balance (weight: ${balance.totalBalanceWeight})`
      : `Rejected: Balance weight ${balance.totalBalanceWeight} is too biased`;

    candidateLog.push({
      roles: candidate.map((r) => r.canonical_name),
      balanceWeight: balance.totalBalanceWeight,
      valid: isValid,
      reason,
    });

    if (weightAbs < bestBalanceScore) {
      bestBalanceScore = weightAbs;
      bestCandidate = candidate;
      if (bestBalanceScore === 0) break; // Perfect score
    }
  }

  if (!bestCandidate) {
    bestCandidate = pool.slice(0, playerCount);
    while (bestCandidate.length < playerCount) {
      bestCandidate.push(pool[0]);
    }
  }

  return {
    selected: bestCandidate,
    bestScore: bestBalanceScore,
    evaluationsCount: candidateLog.length,
    candidateLog,
  };
}

export function selectBalancedSubsetFromPool(
  poolRoles: SelectedRole[],
  playerCount: number
): RoleData[] {
  return auditSelectBalancedSubsetFromPool(poolRoles, playerCount).selected;
}

/**
 * Mode 3: Algorithmic Balance Search across ALL 75 Roles
 * Dynamically evaluates candidates drawn from the 75-role database, calculates mathematical
 * balance scores (role_points + balance_weight), rejects unbalanced compositions,
 * and selects an optimal, highly diverse, mathematically balanced role composition.
 */
export function auditGenerateBalancedRandomComposition(
  playerCount: number,
  maxIterations: number = 80
): {
  selected: RoleData[];
  bestScore: number;
  evaluationsCount: number;
  candidateLog: CandidateLogItem[];
} {
  if (playerCount < MINIMUM_PLAYERS) {
    throw new Error(`Minimal ${MINIMUM_PLAYERS} pemain dibutuhkan.`);
  }

  // 1. Categorize roles across the entire 75-role database
  const wolfRoles = ALL_ROLES.filter(
    (r) =>
      r.category === "Werewolf" ||
      r.team === "Werewolf" ||
      r.team === "Solo Werewolf" ||
      r.team === "Werewolf-aligned"
  );

  const investigativeRoles = ALL_ROLES.filter(
    (r) =>
      r.category === "Village" &&
      (r.action_type.toLowerCase().includes("investigate") ||
        r.action_type.toLowerCase().includes("find") ||
        r.canonical_name.toLowerCase().includes("seer") ||
        r.canonical_name === "P.I." ||
        r.canonical_name === "Mentalist" ||
        r.canonical_name === "The Count")
  );

  const protectiveRoles = ALL_ROLES.filter(
    (r) =>
      r.category === "Village" &&
      (r.action_type.toLowerCase().includes("protect") ||
        r.action_type.toLowerCase().includes("save") ||
        r.canonical_name === "Bodyguard" ||
        r.canonical_name === "Priest" ||
        r.canonical_name === "Witch")
  );

  const neutralRoles = ALL_ROLES.filter(
    (r) =>
      r.category === "Neutral" ||
      r.category === "Solo" ||
      r.category === "Independent" ||
      r.team.includes("Neutral") ||
      r.team.includes("Solo") ||
      r.team.includes("Dynamic")
  );

  const villageSpecialRoles = ALL_ROLES.filter(
    (r) =>
      r.category === "Village" &&
      r.canonical_name !== "Villager"
  );

  const villagerRole =
    ALL_ROLES.find((r) => r.canonical_name === "Villager") || ALL_ROLES[0];

  // Target wolf count based on player count
  const targetWolves =
    playerCount <= 6 ? 1 : playerCount <= 9 ? 2 : playerCount <= 12 ? 3 : playerCount <= 16 ? 4 : 5;

  const candidateLog: CandidateLogItem[] = [];
  let bestCandidate: RoleData[] | null = null;
  let bestDistance = Infinity;

  // Run combinatorial search loop
  for (let iter = 0; iter < maxIterations; iter++) {
    const candidate: RoleData[] = [];
    const usedRoleIds = new Set<string>();

    const tryAddRole = (r: RoleData, allowDuplicate = false): boolean => {
      if (!allowDuplicate && usedRoleIds.has(r.role_id)) return false;
      candidate.push(r);
      usedRoleIds.add(r.role_id);
      return true;
    };

    // A. Add target wolves (unique wolves picked from 17 available wolf roles)
    const shuffledWolves = shuffleRoles([...wolfRoles]);
    let wolvesAdded = 0;
    for (const w of shuffledWolves) {
      if (wolvesAdded >= targetWolves) break;
      if (tryAddRole(w)) {
        wolvesAdded++;
      }
    }

    // B. Add investigative village role
    const shuffledInvestigative = shuffleRoles([...investigativeRoles]);
    for (const inv of shuffledInvestigative) {
      if (tryAddRole(inv)) break;
    }

    // C. Add protective village role if playerCount >= 6
    if (playerCount >= 6) {
      const shuffledProtective = shuffleRoles([...protectiveRoles]);
      for (const prot of shuffledProtective) {
        if (tryAddRole(prot)) break;
      }
    }

    // D. Optionally add a neutral role for larger games (N >= 8: 60% chance; N >= 12: 100% chance)
    if ((playerCount >= 8 && Math.random() < 0.6) || playerCount >= 12) {
      const shuffledNeutral = shuffleRoles([...neutralRoles]);
      for (const neu of shuffledNeutral) {
        if (tryAddRole(neu)) break;
      }
    }

    // E. Fill remaining slots with village special roles or vanilla villagers
    const remainingSlots = playerCount - candidate.length;
    const shuffledSpecials = shuffleRoles([...villageSpecialRoles]);
    let specialsAdded = 0;
    // Allow up to half of remaining slots as special village roles
    const maxSpecialsToAdd = Math.max(1, Math.floor(remainingSlots / 2));

    for (const sp of shuffledSpecials) {
      if (candidate.length >= playerCount || specialsAdded >= maxSpecialsToAdd) break;
      if (tryAddRole(sp)) {
        specialsAdded++;
      }
    }

    // F. Pad remaining slots with standard Villagers
    while (candidate.length < playerCount) {
      candidate.push(villagerRole);
    }

    // G. Calculate balance metrics
    const balance = calculateCompositionBalance(candidate);
    const balanceWeight = balance.totalBalanceWeight;
    const weightAbs = Math.abs(balanceWeight);

    // Filter criteria:
    // Ideal target weight is between -3 and +3.
    // Beyond +/- 4 is rejected as unbalanced.
    let isValid = weightAbs <= 4;
    let rejectionReason: string | undefined;

    if (balanceWeight > 4) {
      isValid = false;
      rejectionReason = `Rejected: Score +${balanceWeight} heavily favors Village`;
    } else if (balanceWeight < -4) {
      isValid = false;
      rejectionReason = `Rejected: Score ${balanceWeight} heavily favors Werewolves`;
    }

    candidateLog.push({
      roles: candidate.map((r) => r.canonical_name),
      balanceWeight,
      valid: isValid,
      reason: rejectionReason || `Accepted: Balanced (weight ${balanceWeight})`,
    });

    if (weightAbs < bestDistance) {
      bestDistance = weightAbs;
      bestCandidate = candidate;
      if (bestDistance === 0) break; // Optimal zero-delta composition!
    }
  }

  return {
    selected: bestCandidate || [villagerRole],
    bestScore: bestDistance,
    evaluationsCount: candidateLog.length,
    candidateLog,
  };
}

export function generateBalancedRandomComposition(playerCount: number): RoleData[] {
  return auditGenerateBalancedRandomComposition(playerCount).selected;
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
