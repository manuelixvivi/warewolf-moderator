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
 * Wolf Man -> Villager (Seer sees Wolf Man as Villager)
 * Lycan -> Werewolf (Seer sees Lycan as Werewolf)
 * Werewolves -> Werewolf
 * All normal villagers/neutrals -> Villager
 */
export function evaluateSeerResult(player: PlayerEngineState): "Werewolf" | "Villager" {
  if (player.canonical_name === "Wolf Man") {
    return "Villager";
  }
  if (player.canonical_name === "Lycan") {
    return "Werewolf";
  }
  if (player.seer_result === "Werewolf") {
    return "Werewolf";
  }
  return "Villager";
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
  if (player.canonical_name === "Witch" && player.usedAbilityCount >= 2) {
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
  const aliveWerewolves = alivePlayers.filter(
    (p) =>
      p.team === "Werewolf" ||
      p.team === "Solo Werewolf" ||
      p.canonical_name === "Werewolf" ||
      p.canonical_name === "Alpha Wolf" ||
      p.canonical_name === "Wolf Cub" ||
      p.canonical_name === "Wolf Man" ||
      p.canonical_name === "Big Bad Wolf"
  );

  if (aliveWerewolves.length > 0) {
    // Standard Werewolf pack attack
    actions.push({
      id: `night-${nightCount}-werewolves-primary`,
      role_id: "ROLE-068",
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
        role_id: "ROLE-022",
        role_name: "Werewolves (Wolf Cub Rage)",
        player_ids: aliveWerewolves.map((w) => w.id),
        action_type: "Extra Kill",
        target_player_id: null,
        priority: 52,
        completed: false,
      });
    }
  }

  // 2. Individual Roles Actions
  for (const player of alivePlayers) {
    // Skip collective wolves because they are grouped in Werewolves action above
    if (
      (player.canonical_name === "Werewolf" ||
        player.canonical_name === "Wolf Cub" ||
        player.canonical_name === "Wolf Man") &&
      player.team === "Werewolf"
    ) {
      continue;
    }

    if (!canPlayerActInNight(player, nightCount)) {
      continue;
    }

    let priority = player.night_priority || 50;
    // Normalized night priority ordering based on database
    if (player.canonical_name === "Doppelgänger") priority = 10;
    else if (player.canonical_name === "Nostradamus") priority = 12;
    else if (player.canonical_name === "Cupid") priority = 20;
    else if (player.canonical_name === "Virginia Woolf") priority = 22;
    else if (player.canonical_name === "Leprechaun") priority = 28;
    else if (player.canonical_name === "Bodyguard") priority = 30;
    else if (player.canonical_name === "Priest") priority = 32;
    else if (player.canonical_name === "Spellcaster") priority = 38;
    else if (player.canonical_name === "Vampire") priority = 46;
    else if (player.canonical_name === "Chupacabra") priority = 47;
    else if (player.canonical_name === "Huntress") priority = 48;
    else if (player.canonical_name === "Witch") priority = 58;
    else if (player.canonical_name === "Seer") priority = 60;
    else if (player.canonical_name === "Aura Seer") priority = 60;
    else if (player.canonical_name === "Revealer") priority = 60;
    else if (player.canonical_name === "P.I.") priority = 60;
    else if (player.canonical_name === "Sorceress") priority = 65;
    else if (player.canonical_name === "Cult Leader") priority = 75;

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
