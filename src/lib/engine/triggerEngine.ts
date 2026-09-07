// ============================================================
// ASPIRE: WEREWOLF - Universal Trigger & Event Lifecycle Engine
// Driven by Role Database Blueprint (75 Roles, 79 Abilities)
// "One Village. Many Lies. One Wolf."
// ============================================================

import {
  PlayerEngineState,
  EngineEventCode,
  EngineNightAction,
  NightResolutionOutcome,
  VoteResolutionOutcome,
  WinEvaluationResult,
} from "./types";
import { resolveNightActions, NightResolutionContext } from "./actionResolver";
import { resolveDayVotes, VoteResolverOptions } from "./voteResolver";
import { evaluateWinConditions } from "./winEngine";
import { requestDeath } from "./deathResolver";

export interface TriggerEngineContext {
  cycleCount: number;
  wolvesSkippingTonight?: boolean;
  wolfCubRageActive?: boolean;
  timeoutCount?: number;
}

export class TriggerEngine {
  /**
   * Generates night action slots based on alive players and database role definitions.
   */
  public static getNightActions(
    players: PlayerEngineState[],
    nightCount: number
  ): EngineNightAction[] {
    const actions: EngineNightAction[] = [];
    const alivePlayers = players.filter((p) => p.alive);

    // 1. Werewolves Collective Night Action
    const aliveWolves = alivePlayers.filter(
      (p) =>
        p.team === "Werewolf" ||
        (p.team === "Solo Werewolf" && p.canonical_name !== "Lone Wolf")
    );
    if (aliveWolves.length > 0) {
      actions.push({
        id: `action-werewolves-n${nightCount}`,
        role_id: "ROLE-023",
        role_name: "Werewolves",
        player_ids: aliveWolves.map((w) => w.id),
        action_type: "Kill",
        target_player_id: null,
        priority: 50,
        completed: false,
      });
    }

    // 2. Individual Player Night Actions
    for (const p of alivePlayers) {
      const role = p.canonical_name;
      const rid = p.role_id;

      // First Night Only roles
      if (nightCount === 1) {
        if (role === "Doppelgänger" || role === "Doppelganger") {
          actions.push({
            id: `action-${p.id}-doppel`,
            role_id: rid,
            role_name: role,
            player_ids: [p.id],
            action_type: "Copy Role",
            target_player_id: null,
            priority: 10,
            completed: false,
          });
        } else if (role === "Cupid") {
          actions.push({
            id: `action-${p.id}-cupid`,
            role_id: rid,
            role_name: role,
            player_ids: [p.id],
            action_type: "Link Players",
            target_player_id: null,
            secondary_target_id: null,
            priority: 20,
            completed: false,
          });
        } else if (role === "Hoodlum") {
          actions.push({
            id: `action-${p.id}-hoodlum`,
            role_id: rid,
            role_name: role,
            player_ids: [p.id],
            action_type: "Mark Targets",
            target_player_id: null,
            secondary_target_id: null,
            priority: 22,
            completed: false,
          });
        } else if (role === "Virginia Woolf") {
          actions.push({
            id: `action-${p.id}-vw`,
            role_id: rid,
            role_name: role,
            player_ids: [p.id],
            action_type: "Mark Fear Target",
            target_player_id: null,
            priority: 24,
            completed: false,
          });
        } else if (role === "Dire Wolf") {
          actions.push({
            id: `action-${p.id}-direwolf`,
            role_id: rid,
            role_name: role,
            player_ids: [p.id],
            action_type: "Mark Companion",
            target_player_id: null,
            priority: 25,
            completed: false,
          });
        } else if (role === "Nostradamus") {
          actions.push({
            id: `action-${p.id}-nostradamus`,
            role_id: rid,
            role_name: role,
            player_ids: [p.id],
            action_type: "Predict Winner",
            target_player_id: null,
            priority: 26,
            completed: false,
          });
        }
      }

      // Recurring nightly roles
      if (role === "Leprechaun") {
        actions.push({
          id: `action-${p.id}-leprechaun`,
          role_id: rid,
          role_name: role,
          player_ids: [p.id],
          action_type: "Redirect",
          target_player_id: null,
          secondary_target_id: null,
          priority: 28,
          completed: false,
        });
      } else if (role === "Bodyguard") {
        actions.push({
          id: `action-${p.id}-bodyguard`,
          role_id: rid,
          role_name: role,
          player_ids: [p.id],
          action_type: "Protect",
          target_player_id: null,
          priority: 30,
          completed: false,
        });
      } else if (role === "Priest" && !p.hasUsedAbility) {
        actions.push({
          id: `action-${p.id}-priest`,
          role_id: rid,
          role_name: role,
          player_ids: [p.id],
          action_type: "Protect",
          target_player_id: null,
          priority: 32,
          completed: false,
        });
      } else if (role === "Spellcaster") {
        actions.push({
          id: `action-${p.id}-spellcaster`,
          role_id: rid,
          role_name: role,
          player_ids: [p.id],
          action_type: "Silence",
          target_player_id: null,
          priority: 35,
          completed: false,
        });
      } else if (role === "Old Hag") {
        actions.push({
          id: `action-${p.id}-oldhag`,
          role_id: rid,
          role_name: role,
          player_ids: [p.id],
          action_type: "Remove from Day",
          target_player_id: null,
          priority: 36,
          completed: false,
        });
      } else if (role === "The Mummy") {
        actions.push({
          id: `action-${p.id}-mummy`,
          role_id: rid,
          role_name: role,
          player_ids: [p.id],
          action_type: "Hypnotize",
          target_player_id: null,
          priority: 40,
          completed: false,
        });
      } else if (role === "Zombie") {
        actions.push({
          id: `action-${p.id}-zombie`,
          role_id: rid,
          role_name: role,
          player_ids: [p.id],
          action_type: "Disable Vote",
          target_player_id: null,
          priority: 42,
          completed: false,
        });
      } else if (role === "The Blob") {
        actions.push({
          id: `action-${p.id}-blob`,
          role_id: rid,
          role_name: role,
          player_ids: [p.id],
          action_type: "Absorb",
          target_player_id: null,
          priority: 45,
          completed: false,
        });
      } else if (role === "Seer" || (role === "Apprentice Seer" && p.can_change_role)) {
        actions.push({
          id: `action-${p.id}-seer`,
          role_id: rid,
          role_name: role,
          player_ids: [p.id],
          action_type: "Investigate",
          target_player_id: null,
          priority: 60,
          completed: false,
        });
      } else if (role === "Aura Seer") {
        actions.push({
          id: `action-${p.id}-auraseer`,
          role_id: rid,
          role_name: role,
          player_ids: [p.id],
          action_type: "Investigate",
          target_player_id: null,
          priority: 62,
          completed: false,
        });
      } else if (role === "Sorceress") {
        actions.push({
          id: `action-${p.id}-sorceress`,
          role_id: rid,
          role_name: role,
          player_ids: [p.id],
          action_type: "Find Seer",
          target_player_id: null,
          priority: 65,
          completed: false,
        });
      } else if (role === "Revealer") {
        actions.push({
          id: `action-${p.id}-revealer`,
          role_id: rid,
          role_name: role,
          player_ids: [p.id],
          action_type: "Investigate/Eliminate",
          target_player_id: null,
          priority: 68,
          completed: false,
        });
      } else if (role.includes("P.I.")) {
        actions.push({
          id: `action-${p.id}-pi`,
          role_id: rid,
          role_name: role,
          player_ids: [p.id],
          action_type: "Investigate",
          target_player_id: null,
          priority: 70,
          completed: false,
        });
      } else if (role === "Cult Leader") {
        actions.push({
          id: `action-${p.id}-cult`,
          role_id: rid,
          role_name: role,
          player_ids: [p.id],
          action_type: "Recruit",
          target_player_id: null,
          priority: 80,
          completed: false,
        });
      } else if (role === "Witch" && (p.usedAbilityCount || 0) < 2) {
        actions.push({
          id: `action-${p.id}-witch`,
          role_id: rid,
          role_name: role,
          player_ids: [p.id],
          action_type: "Save / Kill",
          target_player_id: null,
          secondary_target_id: null,
          priority: 90,
          completed: false,
        });
      }
    }

    return actions.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Dispatches night resolution.
   */
  public static resolveNight(
    players: PlayerEngineState[],
    actions: EngineNightAction[],
    nightCount: number,
    context?: NightResolutionContext
  ): {
    updatedPlayers: PlayerEngineState[];
    outcome: NightResolutionOutcome;
  } {
    return resolveNightActions(players, actions, nightCount, context);
  }

  /**
   * Dispatches day vote resolution.
   */
  public static resolveDay(
    players: PlayerEngineState[],
    votes: Record<string, string>,
    options?: VoteResolverOptions
  ): {
    updatedPlayers: PlayerEngineState[];
    outcome: VoteResolutionOutcome;
  } {
    return resolveDayVotes(players, votes, options);
  }

  /**
   * Dispatches universal win evaluation.
   */
  public static checkWin(
    players: PlayerEngineState[],
    context?: TriggerEngineContext
  ): WinEvaluationResult {
    return evaluateWinConditions(players, {
      timeoutCount: context?.timeoutCount || 0,
    });
  }

  /**
   * Dispatches explicit player death.
   */
  public static triggerPlayerDeath(
    players: PlayerEngineState[],
    targetPlayerId: string,
    cause: "WEREWOLF_ATTACK" | "VOTE" | "HUNTER" | "ABILITY" | "CHAIN_REACTION",
    phase: "NIGHT" | "DAY" = "NIGHT",
    cycleCount: number = 1
  ) {
    return requestDeath(players, targetPlayerId, cause, undefined, phase, cycleCount);
  }
}
