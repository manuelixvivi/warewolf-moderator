// ============================================================
// ASPIRE: WEREWOLF - Vote & Daytime Lynch Resolver
// Driven by Role Database Blueprint
// "One Village. Many Lies. One Wolf."
// ============================================================

import {
  PlayerEngineState,
  VoteResolutionOutcome,
} from "./types";
import { resolveDeathChain } from "./deathResolver";

export function resolveDayVotes(
  players: PlayerEngineState[],
  votes: Record<string, string> // voterId -> targetId
): {
  updatedPlayers: PlayerEngineState[];
  outcome: VoteResolutionOutcome;
} {
  const playerMap = new Map<string, PlayerEngineState>(
    players.map((p) => [p.id, { ...p }])
  );
  const tally: Record<string, number> = {};

  // Initialize tally for all alive players
  for (const p of playerMap.values()) {
    if (p.alive) {
      tally[p.id] = 0;
    }
  }

  // Count weighted votes
  for (const [voterId, targetId] of Object.entries(votes)) {
    const voter = playerMap.get(voterId);
    if (!voter || !voter.alive) continue;

    // Silenced players cannot cast votes
    if (voter.silenced) continue;

    if (targetId && tally[targetId] !== undefined) {
      // Mayor has double vote weight (weight = 2)
      const voteWeight = voter.canonical_name === "Mayor" ? 2 : 1;
      tally[targetId] += voteWeight;
    }
  }

  // Find top target and check for ties
  let maxVotes = 0;
  let topTargetId: string | null = null;
  let isTie = false;

  for (const [targetId, count] of Object.entries(tally)) {
    if (count > maxVotes) {
      maxVotes = count;
      topTargetId = targetId;
      isTie = false;
    } else if (count === maxVotes && maxVotes > 0) {
      isTie = true;
    }
  }

  // Tie or zero votes -> No elimination
  if (isTie || maxVotes === 0 || !topTargetId) {
    return {
      updatedPlayers: Array.from(playerMap.values()),
      outcome: {
        tally,
        topTargetId: null,
        isTie: maxVotes > 0 && isTie,
        eliminatedPlayer: null,
        princeSurvived: false,
        tannerWon: false,
        triggeredRetaliations: [],
      },
    };
  }

  const targetPlayer = playerMap.get(topTargetId);
  if (!targetPlayer) {
    return {
      updatedPlayers: Array.from(playerMap.values()),
      outcome: {
        tally,
        topTargetId: null,
        isTie: false,
        eliminatedPlayer: null,
        princeSurvived: false,
        tannerWon: false,
        triggeredRetaliations: [],
      },
    };
  }

  // 1. Prince Check: Prince survives first lynching!
  if (targetPlayer.canonical_name === "Prince" && !targetPlayer.princeProtectedUsed) {
    playerMap.set(topTargetId, {
      ...targetPlayer,
      princeProtectedUsed: true,
      alive: true, // Survives!
    });

    return {
      updatedPlayers: Array.from(playerMap.values()),
      outcome: {
        tally,
        topTargetId,
        isTie: false,
        eliminatedPlayer: null,
        princeSurvived: true,
        tannerWon: false,
        triggeredRetaliations: [],
      },
    };
  }

  // 2. Tanner Check: Tanner voted out -> Tanner wins!
  let tannerWon = false;
  if (targetPlayer.canonical_name === "Tanner") {
    tannerWon = true;
  }

  // Eliminate player
  playerMap.set(topTargetId, {
    ...targetPlayer,
    alive: false,
    deathCause: "VOTE",
    tannerWon,
  });

  // 3. Cascading death chain (Hunter vote retaliate, Dr. Boom explosion, Lovers, etc.)
  const deathChainResult = resolveDeathChain(
    Array.from(playerMap.values()),
    [topTargetId],
    "VOTE"
  );

  return {
    updatedPlayers: deathChainResult.updatedPlayers,
    outcome: {
      tally,
      topTargetId,
      isTie: false,
      eliminatedPlayer: targetPlayer,
      princeSurvived: false,
      tannerWon,
      triggeredRetaliations: deathChainResult.pendingTriggeredActions,
    },
  };
}
