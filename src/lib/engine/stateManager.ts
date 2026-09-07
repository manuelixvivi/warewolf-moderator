// ============================================================
// ASPIRE: WEREWOLF - Public vs Private State Manager
// Driven by Role Database Blueprint
// "One Village. Many Lies. One Wolf."
// ============================================================

import { RoleData, SeerResult } from "@/types/game";
import {
  PlayerEngineState,
  PublicGameState,
  PublicPlayerInfo,
  PrivatePlayerState,
  GameMode,
} from "./types";
import { ROLE_BY_ID } from "./abilityRegistry";

/**
 * Creates the public game state broadcasted to all connected players.
 * CRITICAL RULE: Dead player roles are NOT revealed publicly to preserve mystery and deduction!
 */
export function buildPublicGameState(
  players: PlayerEngineState[],
  gameMode: GameMode,
  phase: string,
  dayCount: number,
  nightCount: number,
  narrativeText: string,
  winner: string | null = null,
  winReason: string | null = null,
  voteTally?: Record<string, number>,
  eliminatedPlayerId?: string | null,
  nightVictimIds?: string[],
  wolfCubExtraKillActive?: boolean
): PublicGameState {
  const publicPlayers: PublicPlayerInfo[] = players.map((p) => ({
    id: p.id,
    name: p.name,
    alive: p.alive,
    isHost: p.isHost,
    silenced: p.silenced,
    // Note: role_id, canonical_name, and team are deliberately excluded!
  }));

  return {
    gameMode,
    phase,
    dayCount,
    nightCount,
    players: publicPlayers,
    narrativeText,
    winner,
    winReason,
    voteTally,
    eliminatedPlayerId,
    nightVictimIds,
    wolfCubExtraKillActive,
  };
}

/**
 * Builds the confidential private state intended strictly for a specific player.
 */
export function buildPrivatePlayerState(
  targetPlayerId: string,
  allPlayers: PlayerEngineState[],
  seerHistory: Array<{ night: number; targetId: string; targetName: string; result: SeerResult }> = []
): PrivatePlayerState | null {
  const player = allPlayers.find((p) => p.id === targetPlayerId);
  if (!player) return null;

  const roleData = ROLE_BY_ID.get(player.role_id) || {
    role_id: player.role_id,
    source_name: player.canonical_name,
    canonical_name: player.canonical_name,
    entity_type: "Role",
    category: player.category,
    team: player.team,
    seer_result: player.seer_result,
    description_en: "",
    role_points: player.role_points,
    balance_weight: player.balance_weight,
    active_phase: player.active_phase,
    action_type: player.action_type,
    trigger: player.trigger,
    target_type: player.target_type,
    usage_limit: player.usage_limit,
    information_level: "Private",
    night_priority: player.night_priority,
    can_change_role: player.can_change_role,
    reveal_on_death: "No",
    requires_engine_resolution: true,
    tooltip_en: "",
  };

  // Teammates discovery
  const teammateIds: string[] = [];

  // Werewolves see each other
  if (player.team === "Werewolf") {
    for (const other of allPlayers) {
      if (other.id !== player.id && other.team === "Werewolf") {
        teammateIds.push(other.id);
      }
    }
  }

  // Masons see each other
  if (player.canonical_name === "Mason") {
    for (const other of allPlayers) {
      if (other.id !== player.id && other.canonical_name === "Mason") {
        teammateIds.push(other.id);
      }
    }
  }

  // Minion sees Werewolves (one-way awareness)
  if (player.canonical_name === "Minion") {
    for (const other of allPlayers) {
      if (other.team === "Werewolf") {
        teammateIds.push(other.id);
      }
    }
  }

  // Lovers see each other
  if (player.linkedPartnerIds) {
    for (const partnerId of player.linkedPartnerIds) {
      if (!teammateIds.includes(partnerId)) {
        teammateIds.push(partnerId);
      }
    }
  }

  return {
    player,
    roleData,
    teammateIds,
    seerHistory: player.canonical_name === "Seer" ? seerHistory : undefined,
  };
}
