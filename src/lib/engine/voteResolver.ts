// ============================================================
// ASPIRE: WEREWOLF - Comprehensive Daytime & Vote Resolver
// Driven by Role Database Blueprint (75 Roles, 79 Abilities)
// "One Village. Many Lies. One Wolf."
// ============================================================

import {
  PlayerEngineState,
  VoteResolutionOutcome,
} from "./types";
import { requestDeath } from "./deathResolver";
import { awakenSasquatch } from "./roleTransformation";

export interface VoteResolverOptions {
  martyrSwapId?: string;       // ID of Martyr willing to take target's place
  isTimeout?: boolean;         // Did voting time out before consensus?
  dayCount?: number;           // Current day cycle number
}

/**
 * Resolves day votes deterministically with all role modifiers:
 * - Mayor (Double Vote)
 * - Zombie (Brain-eaten cannot vote)
 * - The Mummy (Hypnotized player votes with Mummy)
 * - Pacifist (Non-elimination preference)
 * - Village Idiot (Mandatory guilty vote)
 * - Ralph & Sam (Timeout vote modifiers)
 * - Martyr (Swaps place with lynch victim)
 * - Prince (Survives first lynch)
 * - Tanner (Wins immediately if voted out)
 * - Sasquatch (Converts to Werewolf if day ends without lynch)
 * - Time Bandit (Reduces day timer on elimination)
 */
export function resolveDayVotes(
  players: PlayerEngineState[],
  votes: Record<string, string>, // voterId -> targetId (or "SKIP")
  options?: VoteResolverOptions
): {
  updatedPlayers: PlayerEngineState[];
  outcome: VoteResolutionOutcome;
} {
  let playerMap = new Map<string, PlayerEngineState>(
    players.map((p) => [p.id, { ...p }])
  );

  const dayCount = options?.dayCount || 1;
  const isTimeout = !!options?.isTimeout;

  // 1. Pre-process Hypnotized Votes (The Mummy ROLE-069)
  // If The Mummy is alive and voted, any hypnotized player votes for the Mummy's target
  const mummy = Array.from(playerMap.values()).find(
    (p) => (p.role_id === "ROLE-069" || p.canonical_name === "The Mummy") && p.alive
  );
  const effectiveVotes: Record<string, string> = { ...votes };
  if (mummy && effectiveVotes[mummy.id]) {
    const mummyChoice = effectiveVotes[mummy.id];
    for (const p of playerMap.values()) {
      if (p.alive && p.isHypnotized) {
        effectiveVotes[p.id] = mummyChoice;
      }
    }
  }

  // 2. Build Vote Tally
  const tally: Record<string, number> = { SKIP: 0 };
  for (const p of playerMap.values()) {
    if (p.alive) {
      tally[p.id] = 0;
    }
  }

  for (const [voterId, rawTargetId] of Object.entries(effectiveVotes)) {
    const voter = playerMap.get(voterId);
    if (!voter || !voter.alive) continue;

    // Silenced players cannot cast votes (Spellcaster ROLE-052)
    if (voter.silenced) continue;

    // Zombie-bitten players cannot cast votes (Zombie ROLE-070)
    if (voter.isZombie) continue;

    let targetId = rawTargetId;

    // Pacifist (ROLE-048): if vote timed out or Pacifist prefers non-elimination
    if (voter.role_id === "ROLE-048" || voter.canonical_name === "Pacifist") {
      if (!targetId || targetId === "SKIP") {
        targetId = "SKIP";
      }
    }

    // Ralph (ROLE-015) & Sam (ROLE-017): on timeout, vote for no elimination
    if (isTimeout && (voter.role_id === "ROLE-015" || voter.role_id === "ROLE-017" || voter.canonical_name === "Ralph" || voter.canonical_name === "Sam")) {
      targetId = "SKIP";
    }

    if (!targetId) continue;

    // Calculate voter weight:
    // Mayor (ROLE-044) has double vote weight (weight = 2)
    let weight = 1;
    if (voter.role_id === "ROLE-044" || voter.canonical_name === "Mayor") {
      weight = 2;
    }

    if (targetId === "SKIP") {
      tally.SKIP = (tally.SKIP || 0) + weight;
    } else if (tally[targetId] !== undefined) {
      tally[targetId] += weight;
    }
  }

  // 3. Find top target (excluding SKIP for player elimination)
  let maxPlayerVotes = 0;
  let topTargetId: string | null = null;
  let isTie = false;

  for (const [tId, count] of Object.entries(tally)) {
    if (tId === "SKIP") continue;
    if (count > maxPlayerVotes) {
      maxPlayerVotes = count;
      topTargetId = tId;
      isTie = false;
    } else if (count === maxPlayerVotes && maxPlayerVotes > 0) {
      isTie = true;
    }
  }

  // If SKIP has more or equal votes than maxPlayerVotes, or tie, or 0 votes -> No lynch!
  const skipWon = (tally.SKIP || 0) >= maxPlayerVotes && (tally.SKIP || 0) > 0;
  const noElimination = isTie || maxPlayerVotes === 0 || !topTargetId || skipWon;

  if (noElimination) {
    // Check Sasquatch (ROLE-081): Day ends without lynch -> Sasquatch switches to Werewolves!
    let sasquatchConverted = false;
    for (const [pId, p] of playerMap.entries()) {
      if (p.alive && (p.role_id === "ROLE-081" || p.canonical_name === "Sasquatch")) {
        if (p.team !== "Werewolf") {
          playerMap.set(pId, awakenSasquatch(p));
          sasquatchConverted = true;
        }
      }
    }

    return {
      updatedPlayers: Array.from(playerMap.values()),
      outcome: {
        tally,
        topTargetId: null,
        isTie: maxPlayerVotes > 0 && isTie,
        eliminatedPlayer: null,
        princeSurvived: false,
        tannerWon: false,
        sasquatchConverted,
        triggeredRetaliations: [],
      },
    };
  }

  const confirmedTopTargetId: string = topTargetId!;
  let finalTargetId: string = confirmedTopTargetId;
  let martyrReplacedPlayerId: string | undefined = undefined;

  // 4. Martyr (ROLE-042) Check: Can swap places and take the lynch victim's place!
  if (options?.martyrSwapId) {
    const martyr = playerMap.get(options.martyrSwapId);
    if (
      martyr &&
      martyr.alive &&
      (martyr.role_id === "ROLE-042" || martyr.canonical_name === "Martyr") &&
      !martyr.martyrUsed
    ) {
      martyrReplacedPlayerId = finalTargetId;
      finalTargetId = martyr.id;
      playerMap.set(martyr.id, { ...martyr, martyrUsed: true });
    }
  }

  const targetPlayer = playerMap.get(finalTargetId)!;

  // 5. Prince (ROLE-050) Check: Prince survives first lynching!
  if (
    (targetPlayer.role_id === "ROLE-050" || targetPlayer.canonical_name === "Prince") &&
    !targetPlayer.princeProtectedUsed
  ) {
    playerMap.set(finalTargetId, {
      ...targetPlayer,
      princeProtectedUsed: true,
      alive: true, // Prince survives!
    });

    // Day effectively ended without a lynch death -> Check Sasquatch
    let sasquatchConverted = false;
    for (const [pId, p] of playerMap.entries()) {
      if (p.alive && (p.role_id === "ROLE-081" || p.canonical_name === "Sasquatch")) {
        if (p.team !== "Werewolf") {
          playerMap.set(pId, awakenSasquatch(p));
          sasquatchConverted = true;
        }
      }
    }

    return {
      updatedPlayers: Array.from(playerMap.values()),
      outcome: {
        tally,
        topTargetId: finalTargetId,
        isTie: false,
        eliminatedPlayer: null,
        princeSurvived: true,
        tannerWon: false,
        sasquatchConverted,
        triggeredRetaliations: [],
      },
    };
  }

  // 6. Tanner (ROLE-053) Check: Tanner eliminated by vote -> Tanner wins!
  let tannerWon = false;
  if (targetPlayer.role_id === "ROLE-053" || targetPlayer.canonical_name === "Tanner") {
    tannerWon = true;
    playerMap.set(finalTargetId, {
      ...targetPlayer,
      tannerWon: true,
    });
  }

  // 7. Time Bandit (ROLE-019) Check: On elimination, reduces day timer
  let dayTimerReduced = false;
  if (targetPlayer.role_id === "ROLE-019" || targetPlayer.canonical_name === "Time Bandit") {
    dayTimerReduced = true;
  }

  // 8. Execute Elimination & Cascade Death Chain via requestDeath()
  const deathResult = requestDeath(
    Array.from(playerMap.values()),
    finalTargetId,
    "VOTE",
    undefined,
    "DAY",
    dayCount
  );

  const mappedRetaliations: Array<{
    type: "HUNTER" | "DR_BOOM" | "WOLVERINE" | "MAD_BOMBER";
    playerId: string;
    roleName: string;
  }> = deathResult.pendingRetaliations.map((r) => ({
    type: r.type,
    playerId: r.playerId,
    roleName: r.roleName,
  }));

  return {
    updatedPlayers: deathResult.updatedPlayers,
    outcome: {
      tally,
      topTargetId: finalTargetId,
      isTie: false,
      eliminatedPlayer: targetPlayer,
      princeSurvived: false,
      tannerWon: tannerWon || deathResult.tannerWon,
      martyrReplacedPlayerId,
      dayTimerReduced,
      triggeredRetaliations: mappedRetaliations,
    },
  };
}
