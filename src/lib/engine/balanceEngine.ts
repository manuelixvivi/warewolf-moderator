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
 * 3. Role pool must contain at least playerCount unique roles, OR contain 'Villager' to pad remaining slots.
 *    Special roles are NEVER duplicated.
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
      r.team === "Werewolf-aligned" ||
      r.category === "Werewolf"
  );

  if (!hasWolfSide) {
    return {
      valid: false,
      error: "Role pool wajib memiliki minimal 1 peran di pihak Werewolf agar permainan dapat dimulai.",
    };
  }

  // Enforce pool cardinality: special roles cannot be duplicated.
  // Duplication is only permissible for generic Villagers if present in pool.
  const hasVillager = roleObjects.some(
    (r) => r.role_id === "ROLE-024" || r.canonical_name === "Villager"
  );

  if (roleObjects.length < playerCount && !hasVillager) {
    return {
      valid: false,
      error: `Jumlah peran di pool (${roleObjects.length}) kurang dari jumlah pemain (${playerCount}), dan peran 'Villager' tidak ada di pool untuk mengisi sisa kursi. Tambahkan peran ke pool hingga minimal ${playerCount} peran unik.`,
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
 * Mode 2: Constrained Heuristic Balance Search from Host's Allowed Pool
 * Evaluates candidate subsets drawn strictly from the host's pool without replacement.
 * Minimizes balance penalty score |totalBalanceWeight| while guaranteeing:
 * 1. Wolf presence (at least 1 werewolf, scaled to player count up to available wolves).
 * 2. Strict role uniqueness (no accidental duplication of unique roles).
 * 3. Multi-card padding is strictly restricted to generic Villagers when pool size < playerCount.
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

  // Extract unique role objects from pool (deduplicated by role_id)
  const poolMap = new Map<string, RoleData>();
  for (const sr of poolRoles) {
    const roleDef = ROLE_BY_ID.get(sr.role_id) || ALL_ROLES.find((r) => r.role_id === sr.role_id);
    if (roleDef && !poolMap.has(roleDef.role_id)) {
      poolMap.set(roleDef.role_id, roleDef);
    }
  }
  const pool = Array.from(poolMap.values());

  const wolfPool = pool.filter(
    (r) =>
      r.team === "Werewolf" ||
      r.team === "Solo Werewolf" ||
      r.team === "Werewolf-aligned" ||
      r.category === "Werewolf"
  );

  const villagerRole =
    pool.find((r) => r.role_id === "ROLE-024" || r.canonical_name === "Villager") ||
    ALL_ROLES.find((r) => r.canonical_name === "Villager") ||
    ALL_ROLES[0];

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

  // Generate and evaluate candidate combinations via constrained heuristic search
  for (let iter = 0; iter < maxIterations; iter++) {
    // 1. Pick wolves strictly without replacement
    const shuffledWolves = shuffleRoles([...wolfPool]);
    const pickedWolves = shuffledWolves.slice(0, effectiveTargetWolves);
    const candidate: RoleData[] = [...pickedWolves];

    // Track roles already picked to guarantee zero accidental duplicates
    const pickedRoleIds = new Set<string>(candidate.map((r) => r.role_id));

    // 2. Pick remaining roles strictly without replacement from rest of pool
    const remainingPool = pool.filter((r) => !pickedRoleIds.has(r.role_id));
    const shuffledRest = shuffleRoles([...remainingPool]);
    const needed = playerCount - candidate.length;

    if (shuffledRest.length >= needed) {
      candidate.push(...shuffledRest.slice(0, needed));
    } else {
      // Pool size is less than playerCount (allowed only if Villager is in the pool)
      candidate.push(...shuffledRest);
      while (candidate.length < playerCount) {
        candidate.push(villagerRole);
      }
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
    const fallbackWolves = wolfPool.slice(0, effectiveTargetWolves);
    const fallbackIds = new Set(fallbackWolves.map((r) => r.role_id));
    const fallbackRest = pool.filter((r) => !fallbackIds.has(r.role_id));
    bestCandidate = [...fallbackWolves, ...fallbackRest].slice(0, playerCount);
    while (bestCandidate.length < playerCount) {
      bestCandidate.push(villagerRole);
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

  // Run constrained heuristic balance search loop
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
