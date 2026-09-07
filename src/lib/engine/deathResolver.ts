// ============================================================
// ASPIRE: WEREWOLF - Universal Event-Driven Death & Chain Resolver
// Driven by Role Database Blueprint
// "One Village. Many Lies. One Wolf."
// ============================================================

import {
  PlayerEngineState,
  DeathCause,
  DeathEvent,
} from "./types";
import { evaluateDefense } from "./protectionEngine";
import {
  activateDoppelganger,
  convertCursedToWerewolf,
  awakenApprenticeSeer,
} from "./roleTransformation";

export interface DeathChainResolution {
  updatedPlayers: PlayerEngineState[];
  deathEvents: DeathEvent[];
  pendingRetaliations: Array<{
    type: "HUNTER" | "WOLVERINE";
    playerId: string;
    roleName: string;
  }>;
  wolfCubExtraKillTriggered: boolean;
  wolvesSkippingNextKill: boolean;
  tannerWon: boolean;
  transformationsOccurred: Array<{ playerId: string; newRoleName: string }>;
  chainCasualties?: string[];
  pendingTriggeredActions?: Array<{
    type: string;
    playerId: string;
    roleName: string;
  }>;
}

/**
 * Finds alive adjacent neighbors in circular seat order.
 */
export function getAliveAdjacentNeighbors(
  players: PlayerEngineState[],
  targetPlayerId: string
): PlayerEngineState[] {
  const alivePlayers = players.filter((p) => p.alive || p.id === targetPlayerId);
  const targetIndex = alivePlayers.findIndex((p) => p.id === targetPlayerId);
  if (targetIndex === -1 || alivePlayers.length <= 1) return [];

  const neighbors: PlayerEngineState[] = [];
  const n = alivePlayers.length;

  const left = alivePlayers[(targetIndex - 1 + n) % n];
  if (left.id !== targetPlayerId && left.alive) neighbors.push(left);

  const right = alivePlayers[(targetIndex + 1) % n];
  if (right.id !== targetPlayerId && right.alive && right.id !== left.id) {
    neighbors.push(right);
  }

  return neighbors;
}

/**
 * Requests death for a target player. Evaluates all defenses, immunities, conversions,
 * and if death proceeds, emits PLAYER_DIED and cascades all chain reactions deterministically.
 */
export function requestDeath(
  initialPlayers: PlayerEngineState[],
  targetPlayerId: string,
  deathCause: DeathCause,
  killerId?: string,
  phase: "NIGHT" | "DAY" = "NIGHT",
  cycleCount: number = 1
): DeathChainResolution {
  const playerMap = new Map<string, PlayerEngineState>(
    initialPlayers.map((p) => [p.id, { ...p }])
  );

  const deathEvents: DeathEvent[] = [];
  const pendingRetaliations: Array<{
    type: "HUNTER" | "WOLVERINE";
    playerId: string;
    roleName: string;
  }> = [];
  const transformationsOccurred: Array<{ playerId: string; newRoleName: string }> = [];

  let wolfCubExtraKillTriggered = false;
  let wolvesSkippingNextKill = false;
  let tannerWon = false;

  // Queue of pending deaths to resolve in order
  interface PendingDeath {
    targetId: string;
    cause: DeathCause;
    killerId?: string;
  }

  const deathQueue: PendingDeath[] = [
    { targetId: targetPlayerId, cause: deathCause, killerId },
  ];
  const processedDeaths = new Set<string>();

  while (deathQueue.length > 0) {
    const item = deathQueue.shift()!;
    if (processedDeaths.has(item.targetId)) continue;

    const victim = playerMap.get(item.targetId);
    if (!victim || !victim.alive) continue;

    // 1. Evaluate Defenses & Immunities
    const defense = evaluateDefense(victim, item.cause, cycleCount);

    if (defense.deathPrevented) {
      if (defense.convertedInstead && defense.newRoleOrTeam === "Werewolf") {
        // Cursed turns into Werewolf!
        const converted = convertCursedToWerewolf(victim);
        playerMap.set(victim.id, converted);
        transformationsOccurred.push({ playerId: victim.id, newRoleName: "Werewolf" });
      } else if (defense.delayedDeath) {
        // Tough Guy survives tonight, scheduled to die next night
        playerMap.set(victim.id, {
          ...victim,
          delayedDeathNight: cycleCount + 1,
        });
      }
      // Death was successfully averted or converted!
      continue;
    }

    // 2. Commit Death
    processedDeaths.add(victim.id);

    const committedVictim: PlayerEngineState = {
      ...victim,
      alive: false,
      deathCause: item.cause,
      deathNightOrDay: { phase, count: cycleCount },
    };
    playerMap.set(victim.id, committedVictim);

    deathEvents.push({
      playerId: victim.id,
      deathCause: item.cause,
      killerId: item.killerId,
      phase,
      cycleCount,
    });

    // 3. Trigger Death Abilities & Chain Reactions

    // Hunter: Retaliate ONLY if eliminated by Vote!
    if (victim.canonical_name === "Hunter") {
      if (item.cause === "VOTE") {
        pendingRetaliations.push({
          type: "HUNTER",
          playerId: victim.id,
          roleName: "Hunter",
        });
      }
    }

    // Tanner: Instant Win if eliminated by Vote!
    if (victim.canonical_name === "Tanner") {
      if (item.cause === "VOTE") {
        tannerWon = true;
        playerMap.set(victim.id, { ...committedVictim, tannerWon: true });
      }
    }

    // Dr. Boom: Explodes on Vote elimination -> kills alive neighbors
    if (victim.canonical_name === "Dr. Boom" && item.cause === "VOTE") {
      const neighbors = getAliveAdjacentNeighbors(Array.from(playerMap.values()), victim.id);
      for (const n of neighbors) {
        if (n.alive && !processedDeaths.has(n.id)) {
          deathQueue.push({
            targetId: n.id,
            cause: "CHAIN_REACTION",
            killerId: victim.id,
          });
        }
      }
    }

    // Mad Bomber: Explodes on any elimination -> kills alive neighbors
    if (victim.canonical_name === "Mad Bomber") {
      const neighbors = getAliveAdjacentNeighbors(Array.from(playerMap.values()), victim.id);
      for (const n of neighbors) {
        if (n.alive && !processedDeaths.has(n.id)) {
          deathQueue.push({
            targetId: n.id,
            cause: "CHAIN_REACTION",
            killerId: victim.id,
          });
        }
      }
    }

    // Wolverine: Attacks adjacent player on vote elimination
    if (victim.canonical_name === "Wolverine" && item.cause === "VOTE") {
      pendingRetaliations.push({
        type: "WOLVERINE",
        playerId: victim.id,
        roleName: "Wolverine",
      });
    }

    // Lovers (Cupid / Virginia Woolf): Partner dies of heartbreak!
    if (victim.linkedPartnerIds && victim.linkedPartnerIds.length > 0) {
      for (const partnerId of victim.linkedPartnerIds) {
        const partner = playerMap.get(partnerId);
        if (partner && partner.alive && !processedDeaths.has(partner.id)) {
          deathQueue.push({
            targetId: partner.id,
            cause: "CHAIN_REACTION",
            killerId: victim.id,
          });
        }
      }
    }

    // Dire Wolf: Companion dies -> Dire Wolf dies
    for (const [pId, p] of playerMap.entries()) {
      if (
        p.alive &&
        p.canonical_name === "Dire Wolf" &&
        p.direWolfCompanionId === victim.id &&
        !processedDeaths.has(pId)
      ) {
        deathQueue.push({
          targetId: pId,
          cause: "CHAIN_REACTION",
          killerId: victim.id,
        });
      }
    }

    // Wolf Cub: When killed, Werewolves get extra kill next night
    if (victim.canonical_name === "Wolf Cub") {
      wolfCubExtraKillTriggered = true;
    }

    // Diseased: When killed by Werewolves, wolves skip their next night kill!
    if (victim.canonical_name === "Diseased" && item.cause === "WEREWOLF_ATTACK") {
      wolvesSkippingNextKill = true;
    }

    // Doppelganger Activation: If a living Doppelganger copied this dead player
    for (const [pId, p] of playerMap.entries()) {
      if (
        p.alive &&
        (p.role_id === "ROLE-033" || p.canonical_name.toLowerCase().includes("doppelg")) &&
        p.doppelganger &&
        !p.doppelganger.isActivated &&
        p.doppelganger.targetPlayerId === victim.id
      ) {
        const activatedDoppel = activateDoppelganger(p, victim);
        playerMap.set(pId, activatedDoppel);
        transformationsOccurred.push({
          playerId: pId,
          newRoleName: activatedDoppel.canonical_name,
        });
      }
    }

    // Apprentice Seer: If Seer dies, Apprentice Seer becomes Seer
    if (victim.canonical_name === "Seer") {
      for (const [pId, p] of playerMap.entries()) {
        if (p.alive && p.canonical_name === "Apprentice Seer") {
          const awakened = awakenApprenticeSeer(p);
          playerMap.set(pId, awakened);
          transformationsOccurred.push({
            playerId: pId,
            newRoleName: "Seer",
          });
        }
      }
    }
  }

  return {
    updatedPlayers: Array.from(playerMap.values()),
    deathEvents,
    pendingRetaliations,
    wolfCubExtraKillTriggered,
    wolvesSkippingNextKill,
    tannerWon,
    transformationsOccurred,
    chainCasualties: deathEvents.map((e) => e.playerId),
    pendingTriggeredActions: pendingRetaliations,
  };
}

/**
 * Universal resolution wrapper for multiple deaths.
 */
export function resolveDeathChain(
  initialPlayers: PlayerEngineState[],
  deadPlayerIds: string[],
  deathCause: DeathCause,
  phase: "NIGHT" | "DAY" = "NIGHT",
  cycleCount: number = 1
): DeathChainResolution {
  let currentPlayers = [...initialPlayers];
  const allEvents: DeathEvent[] = [];
  const allRetaliations: Array<{
    type: "HUNTER" | "WOLVERINE";
    playerId: string;
    roleName: string;
  }> = [];
  const allTransformations: Array<{ playerId: string; newRoleName: string }> = [];

  let wolfCubExtraKill = false;
  let wolvesSkipKill = false;
  let tannerWon = false;

  for (const id of deadPlayerIds) {
    const res = requestDeath(currentPlayers, id, deathCause, undefined, phase, cycleCount);
    currentPlayers = res.updatedPlayers;
    allEvents.push(...res.deathEvents);
    allRetaliations.push(...res.pendingRetaliations);
    allTransformations.push(...res.transformationsOccurred);
    if (res.wolfCubExtraKillTriggered) wolfCubExtraKill = true;
    if (res.wolvesSkippingNextKill) wolvesSkipKill = true;
    if (res.tannerWon) tannerWon = true;
  }

  return {
    updatedPlayers: currentPlayers,
    deathEvents: allEvents,
    pendingRetaliations: allRetaliations,
    wolfCubExtraKillTriggered: wolfCubExtraKill,
    wolvesSkippingNextKill: wolvesSkipKill,
    tannerWon,
    transformationsOccurred: allTransformations,
    chainCasualties: allEvents.map((e) => e.playerId),
    pendingTriggeredActions: allRetaliations,
  };
}
