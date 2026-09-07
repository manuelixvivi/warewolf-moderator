// ============================================================
// ASPIRE: WEREWOLF - Chain Reaction & Death Resolver
// Driven by Role Database Blueprint
// "One Village. Many Lies. One Wolf."
// ============================================================

import {
  PlayerEngineState,
  TriggeredAction,
} from "./types";
import { getRoleById } from "./abilityRegistry";

export interface DeathChainOutcome {
  updatedPlayers: PlayerEngineState[];
  chainCasualties: Array<{ playerId: string; reason: string }>;
  pendingTriggeredActions: Array<{
    type: "HUNTER" | "WOLVERINE";
    playerId: string;
    roleName: string;
  }>;
  wolfCubExtraKillActive: boolean;
  doppelgangerActivated: boolean;
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

  // Left neighbor
  const left = alivePlayers[(targetIndex - 1 + n) % n];
  if (left.id !== targetPlayerId && left.alive) neighbors.push(left);

  // Right neighbor
  const right = alivePlayers[(targetIndex + 1) % n];
  if (right.id !== targetPlayerId && right.alive && right.id !== left.id) {
    neighbors.push(right);
  }

  return neighbors;
}

/**
 * Resolves all cascading death effects, chain reactions, and role activations.
 */
export function resolveDeathChain(
  initialPlayers: PlayerEngineState[],
  newlyDeadPlayerIds: string[],
  deathCause: "WEREWOLF" | "VOTE" | "HUNTER" | "CHAIN_BOMB" | "LOVERS" | "VAMPIRE" | "NIGHT_KILL" | "UNKNOWN"
): DeathChainOutcome {
  let playerMap = new Map<string, PlayerEngineState>(
    initialPlayers.map((p) => [p.id, { ...p }])
  );

  const chainCasualties: Array<{ playerId: string; reason: string }> = [];
  const pendingTriggeredActions: Array<{
    type: "HUNTER" | "WOLVERINE";
    playerId: string;
    roleName: string;
  }> = [];
  let wolfCubExtraKillActive = false;
  let doppelgangerActivated = false;

  const queue = [...newlyDeadPlayerIds];
  const processed = new Set<string>();

  while (queue.length > 0) {
    const deadId = queue.shift()!;
    if (processed.has(deadId)) continue;
    processed.add(deadId);

    const deadPlayer = playerMap.get(deadId);
    if (!deadPlayer) continue;

    // 1. Doppelgänger Lifecycle Check:
    // If a living Doppelganger copied this dead player, Doppelganger takes over their role!
    for (const [pId, p] of playerMap.entries()) {
      if (
        p.alive &&
        p.canonical_name === "Doppelgänger" &&
        p.doppelganger &&
        !p.doppelganger.isActivated &&
        p.doppelganger.targetPlayerId === deadId
      ) {
        const inheritedRole = getRoleById(deadPlayer.role_id);
        if (inheritedRole) {
          playerMap.set(pId, {
            ...p,
            role_id: inheritedRole.role_id,
            canonical_name: inheritedRole.canonical_name,
            team: inheritedRole.team,
            category: inheritedRole.category,
            seer_result: inheritedRole.seer_result,
            description_en: inheritedRole.description_en,
            description_id: inheritedRole.description_id || inheritedRole.tooltip_id,
            tooltip_en: inheritedRole.tooltip_en,
            tooltip_id: inheritedRole.tooltip_id,
            active_phase: inheritedRole.active_phase,
            action_type: inheritedRole.action_type,
            target_type: inheritedRole.target_type,
            usage_limit: inheritedRole.usage_limit,
            night_priority: inheritedRole.night_priority || 50,
            can_change_role: inheritedRole.can_change_role,
            doppelganger: {
              ...p.doppelganger,
              isActivated: true,
            },
          });
          doppelgangerActivated = true;
        }
      }
    }

    // 2. Hunter Retaliation Check:
    // HUNTER ONLY SHOOTS WHEN ELIMINATED BY VOTE! (Scenario 1 & 3 requirement)
    if (deadPlayer.canonical_name === "Hunter") {
      if (deadPlayer.deathCause === "VOTE" || deathCause === "VOTE") {
        pendingTriggeredActions.push({
          type: "HUNTER",
          playerId: deadId,
          roleName: "Hunter",
        });
      }
    }

    // 3. Dr. Boom Explosion:
    // Only triggers on VOTE elimination
    if (
      deadPlayer.canonical_name === "Dr. Boom" &&
      (deadPlayer.deathCause === "VOTE" || deathCause === "VOTE")
    ) {
      const neighbors = getAliveAdjacentNeighbors(
        Array.from(playerMap.values()),
        deadId
      );
      for (const neighbor of neighbors) {
        if (neighbor.alive && !processed.has(neighbor.id)) {
          playerMap.set(neighbor.id, {
            ...neighbor,
            alive: false,
            deathCause: "CHAIN_BOMB",
          });
          chainCasualties.push({
            playerId: neighbor.id,
            reason: "Ledakan bom drastis dari Dr. Boom",
          });
          queue.push(neighbor.id);
        }
      }
    }

    // 4. Mad Bomber Explosion:
    // Triggers on any elimination
    if (deadPlayer.canonical_name === "Mad Bomber") {
      const neighbors = getAliveAdjacentNeighbors(
        Array.from(playerMap.values()),
        deadId
      );
      for (const neighbor of neighbors) {
        if (neighbor.alive && !processed.has(neighbor.id)) {
          playerMap.set(neighbor.id, {
            ...neighbor,
            alive: false,
            deathCause: "CHAIN_BOMB",
          });
          chainCasualties.push({
            playerId: neighbor.id,
            reason: "Ledakan bunuh diri Mad Bomber",
          });
          queue.push(neighbor.id);
        }
      }
    }

    // 5. Lovers (Cupid Link Heartbreak):
    if (deadPlayer.linkedPartnerIds && deadPlayer.linkedPartnerIds.length > 0) {
      for (const partnerId of deadPlayer.linkedPartnerIds) {
        const partner = playerMap.get(partnerId);
        if (partner && partner.alive && !processed.has(partnerId)) {
          playerMap.set(partnerId, {
            ...partner,
            alive: false,
            deathCause: "LOVERS",
          });
          chainCasualties.push({
            playerId: partnerId,
            reason: "Mati patah hati karena pasangannya telah tiada (Kutukan Cupid)",
          });
          queue.push(partnerId);
        }
      }
    }

    // 6. Wolf Cub Extra Kill Flag:
    if (deadPlayer.canonical_name === "Wolf Cub") {
      wolfCubExtraKillActive = true;
    }
  }

  return {
    updatedPlayers: Array.from(playerMap.values()),
    chainCasualties,
    pendingTriggeredActions,
    wolfCubExtraKillActive,
    doppelgangerActivated,
  };
}
