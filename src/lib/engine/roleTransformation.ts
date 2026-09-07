// ============================================================
// ASPIRE: WEREWOLF - Generic Role Transformation Engine
// Driven by Role Database Blueprint
// "One Village. Many Lies. One Wolf."
// ============================================================

import { RoleData } from "@/types/game";
import { PlayerEngineState } from "./types";
import rolesJson from "@/data/roles.json";

export const ALL_ROLES: RoleData[] = rolesJson as RoleData[];
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
 * Transforms a player into a new role, completely updating role metadata,
 * team alignment, active phase, and resetting or reinitializing ability states.
 */
export function transformPlayerRole(
  player: PlayerEngineState,
  newRoleOrId: string | RoleData,
  reason: string
): { updatedPlayer: PlayerEngineState; previousRole: string } {
  let targetRole: RoleData | undefined;

  if (typeof newRoleOrId === "string") {
    targetRole = getRoleById(newRoleOrId) || getRoleByName(newRoleOrId);
  } else {
    targetRole = newRoleOrId;
  }

  if (!targetRole) {
    console.warn(`Cannot transform player ${player.name}: role not found (${newRoleOrId})`);
    return { updatedPlayer: player, previousRole: player.canonical_name };
  }

  const previousRole = player.canonical_name;

  const updatedPlayer: PlayerEngineState = {
    ...player,
    role_id: targetRole.role_id,
    canonical_name: targetRole.canonical_name,
    team: targetRole.team,
    category: targetRole.category,
    seer_result: targetRole.seer_result,
    role_points: targetRole.role_points,
    balance_weight: targetRole.balance_weight,
    night_priority: targetRole.night_priority || 50,
    active_phase: targetRole.active_phase,
    action_type: targetRole.action_type,
    trigger: targetRole.trigger,
    target_type: targetRole.target_type,
    usage_limit: targetRole.usage_limit,
    can_change_role: targetRole.can_change_role,
    reveal_on_death: targetRole.reveal_on_death,
    requires_engine_resolution: targetRole.requires_engine_resolution,
    description_en: targetRole.description_en,
    description_id: targetRole.description_id || targetRole.tooltip_id,
    tooltip_en: targetRole.tooltip_en,
    tooltip_id: targetRole.tooltip_id,

    // Reset abilities for the new role
    hasUsedAbility: false,
    usedAbilityCount: 0,
  };

  return { updatedPlayer, previousRole };
}

/**
 * Handles Doppelganger adoption lifecycle.
 * Activates when the chosen target dies.
 */
export function activateDoppelganger(
  doppelgangerPlayer: PlayerEngineState,
  deadTargetPlayer: PlayerEngineState
): PlayerEngineState {
  const isDoppel =
    doppelgangerPlayer.canonical_name.toLowerCase().includes("doppelg") ||
    doppelgangerPlayer.role_id === "ROLE-033";

  if (
    !isDoppel ||
    !doppelgangerPlayer.doppelganger ||
    doppelgangerPlayer.doppelganger.isActivated
  ) {
    return doppelgangerPlayer;
  }

  const targetIdentifier =
    getRoleById(deadTargetPlayer.role_id) ||
    getRoleByName(deadTargetPlayer.canonical_name) ||
    deadTargetPlayer.canonical_name;

  const { updatedPlayer } = transformPlayerRole(
    doppelgangerPlayer,
    targetIdentifier,
    "Doppelganger target died"
  );

  return {
    ...updatedPlayer,
    doppelganger: {
      ...doppelgangerPlayer.doppelganger,
      isActivated: true,
    },
  };
}

/**
 * Handles Cursed conversion when attacked by Werewolves.
 */
export function convertCursedToWerewolf(player: PlayerEngineState): PlayerEngineState {
  return {
    ...player,
    team: "Werewolf",
    category: "Werewolf",
    seer_result: "Werewolf",
    isCursed: false,
  };
}

/**
 * Handles Apprentice Seer awakening when Seer dies.
 */
export function awakenApprenticeSeer(player: PlayerEngineState): PlayerEngineState {
  const seerRole = getRoleByName("Seer");
  if (!seerRole) return player;
  const { updatedPlayer } = transformPlayerRole(player, seerRole, "Seer has died");
  return updatedPlayer;
}

/**
 * Handles Sasquatch turning into Werewolf when day ends without a lynch.
 */
export function awakenSasquatch(player: PlayerEngineState): PlayerEngineState {
  const werewolfRole = getRoleByName("Werewolf");
  if (!werewolfRole) return player;
  const { updatedPlayer } = transformPlayerRole(player, werewolfRole, "Day ended without lynch");
  return updatedPlayer;
}

/**
 * Handles Drunk awakening on Night 3.
 */
export function awakenDrunk(player: PlayerEngineState, assignedRoleId?: string): PlayerEngineState {
  const realRole = assignedRoleId
    ? getRoleById(assignedRoleId) || getRoleByName("Villager")
    : getRoleByName("Villager");

  if (!realRole) return player;
  const { updatedPlayer } = transformPlayerRole(player, realRole, "Drunk sobers up on Night 3");
  return {
    ...updatedPlayer,
    isDrunkRevealed: true,
  };
}

export const revealDrunkRole = awakenDrunk;

/**
 * Handles Alexander / Kimb / Blockchain switching sides to prolong the game.
 */
export function switchAlexanderTeam(
  player: PlayerEngineState,
  losingTeam: "Village" | "Werewolf"
): PlayerEngineState {
  return {
    ...player,
    team: losingTeam,
    category: losingTeam === "Werewolf" ? "Werewolf" : "Neutral",
    seer_result: losingTeam === "Werewolf" ? "Werewolf" : "Villager",
  };
}
