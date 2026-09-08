// ============================================================
// ASPIRE: WEREWOLF - Ability Registry & Declarative Handlers
// Driven by Role Database Blueprint
// "One Village. Many Lies. One Wolf."
// ============================================================

import rolesJson from "@/data/roles.json";
import abilitiesJson from "@/data/abilities.json";
import { RoleData, SeerResult } from "@/types/game";
import {
  PlayerEngineState,
  EngineNightAction,
  DoppelgangerState,
} from "./types";

export interface AbilityDefinition {
  ability_id: string;
  role_id: string;
  canonical_name: string;
  phase: string;
  trigger_type: string;
  action_type: string;
  target_type: string;
  usage_limit: string;
  priority: number;
  condition_notes: string;
  effect_notes: string;
}

export const ALL_ROLES: RoleData[] = rolesJson as RoleData[];
export const ALL_ABILITIES: AbilityDefinition[] = abilitiesJson as AbilityDefinition[];

// Role index maps for fast lookup
export const ROLE_BY_ID = new Map<string, RoleData>(
  ALL_ROLES.map((r) => [r.role_id, r])
);

export const ROLE_BY_NAME = new Map<string, RoleData>(
  ALL_ROLES.map((r) => [r.canonical_name.toLowerCase(), r])
);

export function getRoleById(roleId: string): RoleData | undefined {
  return ROLE_BY_ID.get(roleId);
}

export function getRoleByName(name: string): RoleData | undefined {
  return ROLE_BY_NAME.get(name.toLowerCase());
}

/**
 * Calculates the exact binary Seer result for any player according to DB specifications.
 * Purely driven by database seer_result attribute (Lycan has "Werewolf", Wolf Man has "Villager", etc.)
 * Dynamically updates if player role or team changes (e.g. Cursed conversion).
 */
export function evaluateSeerResult(player: PlayerEngineState): "Werewolf" | "Villager" {
  const dbSeerResult = player.seer_result || ROLE_BY_ID.get(player.role_id)?.seer_result;
  if (dbSeerResult === "Werewolf") {
    return "Werewolf";
  }
  if (dbSeerResult === "Villager") {
    return "Villager";
  }
  return player.team === "Werewolf" ? "Werewolf" : "Villager";
}

/**
 * Determine if a player is eligible to act in a given night.
 */
export function canPlayerActInNight(
  player: PlayerEngineState,
  nightCount: number
): boolean {
  if (!player.alive) return false;

  const phase = (player.active_phase || "").toLowerCase();

  // First-night-only roles
  const isFirstNightOnly =
    (phase.includes("night 1") || phase.includes("first night")) &&
    !phase.includes("/ night");

  if (nightCount > 1 && isFirstNightOnly) {
    return false;
  }

  // Roles that only activate upon condition
  if (player.canonical_name === "Doppelgänger" && nightCount > 1) {
    return false; // Doppelganger only selects target on Night 1
  }

  // Witch potions
  if (player.canonical_name === "Witch" && (player.usedAbilityCount || 0) >= 2) {
    return false;
  }

  // Once-per-game night abilities
  if (player.usage_limit === "Once/game" && player.hasUsedAbility) {
    return false;
  }

  // Must contain "night" in active_phase
  if (!phase.includes("night")) {
    return false;
  }

  // Must have an actionable type
  const actionType = (player.action_type || "").toLowerCase();
  if (
    !actionType ||
    actionType === "passive" ||
    actionType === "none" ||
    actionType === "vote"
  ) {
    return false;
  }

  return true;
}

/**
 * Builds the prioritized queue of night actions for all alive players.
 */
export function buildEngineNightActions(
  players: PlayerEngineState[],
  nightCount: number,
  wolfCubExtraKillActive: boolean = false
): EngineNightAction[] {
  const actions: EngineNightAction[] = [];
  const alivePlayers = players.filter((p) => p.alive);

  // 1. Werewolf Group Action (Collective Kill)
  // Driven by DB category or team "Werewolf", excluding auxiliary roles that don't participate in pack kill
  const aliveWerewolves = alivePlayers.filter((p) => {
    const roleDef = ROLE_BY_ID.get(p.role_id);
    const isWolfTeam =
      p.team === "Werewolf" ||
      p.team === "Solo Werewolf" ||
      roleDef?.category === "Werewolf" ||
      roleDef?.team === "Werewolf";
    const actionType = p.action_type || roleDef?.action_type || "";
    if (!isWolfTeam || actionType === "Find Seer" || actionType === "Support Werewolves") {
      return false;
    }

    // Fang Face (ROLE-061): Wakes with pack on Night 1; on subsequent nights, only wakes if sole surviving werewolf
    if (p.role_id === "ROLE-061" || roleDef?.canonical_name === "Fang Face") {
      if (nightCount > 1) {
        const otherAliveWolves = alivePlayers.some(
          (other) =>
            other.id !== p.id &&
            (other.team === "Werewolf" ||
              other.team === "Solo Werewolf" ||
              ROLE_BY_ID.get(other.role_id)?.category === "Werewolf" ||
              ROLE_BY_ID.get(other.role_id)?.team === "Werewolf") &&
            (other.action_type || ROLE_BY_ID.get(other.role_id)?.action_type) !== "Find Seer" &&
            (other.action_type || ROLE_BY_ID.get(other.role_id)?.action_type) !== "Support Werewolves"
        );
        if (otherAliveWolves) return false;
      }
    }

    return true;
  });

  if (aliveWerewolves.length > 0) {
    // Standard Werewolf pack attack
    actions.push({
      id: `night-${nightCount}-werewolves-primary`,
      role_id: "SYSTEM-WEREWOLF-PACK",
      role_name: "Werewolves",
      player_ids: aliveWerewolves.map((w) => w.id),
      action_type: "Werewolf Action",
      target_player_id: null,
      priority: 50,
      completed: false,
    });

    // If Wolf Cub died previous day/night, Werewolves get an extra kill!
    if (wolfCubExtraKillActive) {
      actions.push({
        id: `night-${nightCount}-werewolves-extra-cub`,
        role_id: "SYSTEM-WEREWOLF-PACK-RAGE",
        role_name: "Werewolves (Wolf Cub Rage)",
        player_ids: aliveWerewolves.map((w) => w.id),
        action_type: "Extra Kill",
        target_player_id: null,
        priority: 51,
        completed: false,
      });
    }
  }

  // 2. Individual Roles Actions
  for (const player of alivePlayers) {
    const roleDef = ROLE_BY_ID.get(player.role_id);

    // Skip collective wolf pack members who already participate in the group action above
    if (
      aliveWerewolves.some((w) => w.id === player.id) &&
      (player.action_type === "Werewolf Action" || player.action_type === "Kill")
    ) {
      continue;
    }

    if (!canPlayerActInNight(player, nightCount)) {
      continue;
    }

    // Directly driven by database night_priority attribute
    const priority = player.night_priority ?? roleDef?.night_priority ?? 50;

    actions.push({
      id: `night-${nightCount}-${player.canonical_name}-${player.id}`,
      role_id: player.role_id,
      role_name: player.canonical_name,
      player_ids: [player.id],
      action_type: player.action_type,
      target_player_id: null,
      priority,
      completed: false,
    });
  }

  return actions.sort((a, b) => a.priority - b.priority);
}

/**
 * Validates if an action's target is legally permissible for the specific role.
 */
export function validateAbilityTarget(
  action: EngineNightAction,
  actor: PlayerEngineState,
  targetId: string,
  secondaryTargetId?: string | null
): { valid: boolean; reason?: string } {
  // Bodyguard cannot protect self
  if (actor.canonical_name.toLowerCase().includes("bodyguard") && targetId === actor.id) {
    return { valid: false, reason: "Bodyguard tidak dapat melindungi diri sendiri." };
  }

  // Cupid requires 2 distinct targets
  if (actor.canonical_name === "Cupid") {
    if (!targetId || !secondaryTargetId) {
      return { valid: false, reason: "Cupid harus memilih 2 pemain yang berbeda." };
    }
    if (targetId === secondaryTargetId) {
      return { valid: false, reason: "Cupid harus memilih dua pemain yang berbeda." };
    }
  }

  // Doppelganger cannot target self
  if (actor.canonical_name === "Doppelgänger" && targetId === actor.id) {
    return { valid: false, reason: "Doppelgänger tidak dapat meniru dirinya sendiri." };
  }

  return { valid: true };
}
