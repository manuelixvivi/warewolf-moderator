// ============================================================
// ASPIRE: WEREWOLF - Deterministic Night Action Resolver
// Driven by Role Database Blueprint
// "One Village. Many Lies. One Wolf."
// ============================================================

import { SeerResult } from "@/types/game";
import {
  PlayerEngineState,
  EngineNightAction,
  NightResolutionOutcome,
} from "./types";
import { evaluateSeerResult } from "./abilityRegistry";

export function resolveNightActions(
  players: PlayerEngineState[],
  actions: EngineNightAction[],
  nightCount: number
): {
  updatedPlayers: PlayerEngineState[];
  outcome: NightResolutionOutcome;
} {
  // Clone players to ensure state immutability
  const playerMap = new Map<string, PlayerEngineState>(
    players.map((p) => [
      p.id,
      {
        ...p,
        protected: false, // Reset protection at start of night resolution
        silenced: false,  // Reset silence (re-applied if spellcaster acts)
      },
    ])
  );

  const outcome: NightResolutionOutcome = {
    killedPlayerIds: [],
    savedPlayerIds: [],
    investigations: [],
    silencedPlayerIds: [],
    convertedPlayerIds: [],
    redirectedActions: [],
    triggeredActions: [],
    wolfCubExtraKillTriggered: false,
    deathChains: [],
  };

  const sortedActions = [...actions].sort((a, b) => a.priority - b.priority);

  // -----------------------------------------------------------------
  // Phase 1: Pre-actions (Links, Copies, Redirects)
  // -----------------------------------------------------------------
  let redirectedWolfTargetId: string | null = null;

  for (const action of sortedActions) {
    if (!action.completed || !action.target_player_id) continue;
    const actor = playerMap.get(action.player_ids[0]);
    if (!actor || !actor.alive) continue;

    // Doppelganger (Priority ~10)
    if (action.role_name === "Doppelgänger" && nightCount === 1) {
      const target = playerMap.get(action.target_player_id);
      if (target) {
        playerMap.set(actor.id, {
          ...actor,
          doppelganger: {
            targetPlayerId: target.id,
            targetRoleId: target.role_id,
            isActivated: false,
          },
          hasUsedAbility: true,
        });
      }
    }

    // Cupid (Priority ~20)
    if (action.role_name === "Cupid" && nightCount === 1 && action.secondary_target_id) {
      const target1 = playerMap.get(action.target_player_id);
      const target2 = playerMap.get(action.secondary_target_id);
      if (target1 && target2) {
        playerMap.set(target1.id, {
          ...target1,
          linkedPartnerIds: [target2.id],
        });
        playerMap.set(target2.id, {
          ...target2,
          linkedPartnerIds: [target1.id],
        });
        playerMap.set(actor.id, {
          ...actor,
          hasUsedAbility: true,
        });
      }
    }

    // Leprechaun (Priority ~28): Redirects Werewolf attack to another target
    if (action.role_name === "Leprechaun" && action.secondary_target_id) {
      redirectedWolfTargetId = action.secondary_target_id;
      outcome.redirectedActions.push({
        roleName: "Leprechaun",
        originalTargetId: action.target_player_id,
        newTargetId: action.secondary_target_id,
      });
    }
  }

  // -----------------------------------------------------------------
  // Phase 2: Protections (Bodyguard, Priest)
  // -----------------------------------------------------------------
  for (const action of sortedActions) {
    if (!action.completed || !action.target_player_id) continue;
    const actor = playerMap.get(action.player_ids[0]);
    if (!actor || !actor.alive) continue;

    const roleName = action.role_name.toLowerCase();

    // Bodyguard (cannot protect self)
    if (roleName.includes("bodyguard")) {
      if (action.target_player_id === actor.id) {
        continue; // Self-protection forbidden
      }
      const target = playerMap.get(action.target_player_id);
      if (target && target.alive) {
        playerMap.set(target.id, { ...target, protected: true });
      }
    }

    // Priest
    if (roleName.includes("priest")) {
      const target = playerMap.get(action.target_player_id);
      if (target && target.alive) {
        playerMap.set(target.id, { ...target, protected: true });
        playerMap.set(actor.id, { ...actor, hasUsedAbility: true });
      }
    }
  }

  // -----------------------------------------------------------------
  // Phase 3: Disruptions & Silence (Spellcaster)
  // -----------------------------------------------------------------
  for (const action of sortedActions) {
    if (!action.completed || !action.target_player_id) continue;
    const actor = playerMap.get(action.player_ids[0]);
    if (!actor || !actor.alive) continue;

    if (action.role_name.toLowerCase().includes("spellcaster")) {
      const target = playerMap.get(action.target_player_id);
      if (target && target.alive) {
        playerMap.set(target.id, { ...target, silenced: true });
        outcome.silencedPlayerIds.push(target.id);
      }
    }
  }

  // -----------------------------------------------------------------
  // Phase 4: Attacks & Kills (Werewolves, Vampire, Huntress, Chupacabra)
  // -----------------------------------------------------------------
  const pendingVictimIds = new Set<string>();

  for (const action of sortedActions) {
    if (!action.completed || !action.target_player_id) continue;

    // Werewolves Collective Action
    if (action.role_name.startsWith("Werewolves")) {
      let targetId = action.target_player_id;

      // Apply Leprechaun redirection if applicable
      if (redirectedWolfTargetId) {
        targetId = redirectedWolfTargetId;
      }

      const target = playerMap.get(targetId);
      if (target && target.alive) {
        // Check protection
        if (target.protected) {
          outcome.savedPlayerIds.push(targetId);
        } else if (target.canonical_name === "Cursed" || target.isCursed) {
          // Cursed converts to Werewolf instead of dying!
          const oldTeam = target.team;
          playerMap.set(targetId, {
            ...target,
            team: "Werewolf",
            category: "Werewolf",
            seer_result: "Werewolf",
            isCursed: false,
          });
          outcome.convertedPlayerIds.push({
            playerId: targetId,
            oldTeam,
            newTeam: "Werewolf",
          });
        } else if (target.canonical_name === "Tough Guy") {
          // Tough Guy survives tonight, dies end of next night
          outcome.triggeredActions.push({
            type: "TOUGH_GUY_DELAYED",
            playerId: targetId,
            roleName: "Tough Guy",
            description: "Tough Guy terserang namun bertahan hidup hingga malam berikutnya.",
          });
        } else {
          pendingVictimIds.add(targetId);
        }
      }
    }

    // Vampire Attack
    if (action.role_name === "Vampire") {
      const actor = playerMap.get(action.player_ids[0]);
      if (actor && actor.alive) {
        const target = playerMap.get(action.target_player_id);
        if (target && target.alive && !target.protected) {
          pendingVictimIds.add(target.id);
        }
      }
    }

    // Huntress Night Kill (once per game)
    if (action.role_name === "Huntress") {
      const actor = playerMap.get(action.player_ids[0]);
      if (actor && actor.alive && !actor.hasUsedAbility) {
        const target = playerMap.get(action.target_player_id);
        if (target && target.alive && !target.protected) {
          pendingVictimIds.add(target.id);
          playerMap.set(actor.id, { ...actor, hasUsedAbility: true });
        }
      }
    }

    // Chupacabra Kill
    if (action.role_name === "Chupacabra") {
      const actor = playerMap.get(action.player_ids[0]);
      if (actor && actor.alive) {
        const target = playerMap.get(action.target_player_id);
        if (target && target.alive && !target.protected) {
          // Chupacabra target killed
          pendingVictimIds.add(target.id);
        }
      }
    }
  }

  // -----------------------------------------------------------------
  // Phase 5: Saves & Witch Potions
  // -----------------------------------------------------------------
  for (const action of sortedActions) {
    if (!action.completed) continue;
    if (action.role_name === "Witch") {
      const actor = playerMap.get(action.player_ids[0]);
      if (!actor || !actor.alive) continue;

      // Witch Save (Heal)
      if (action.target_player_id && pendingVictimIds.has(action.target_player_id)) {
        pendingVictimIds.delete(action.target_player_id);
        outcome.savedPlayerIds.push(action.target_player_id);
        playerMap.set(actor.id, {
          ...actor,
          usedAbilityCount: (actor.usedAbilityCount || 0) + 1,
        });
      }

      // Witch Poison (Kill)
      if (action.secondary_target_id) {
        const poisonTarget = playerMap.get(action.secondary_target_id);
        if (poisonTarget && poisonTarget.alive && !poisonTarget.protected) {
          pendingVictimIds.add(poisonTarget.id);
          playerMap.set(actor.id, {
            ...actor,
            usedAbilityCount: (actor.usedAbilityCount || 0) + 1,
          });
        }
      }
    }
  }

  // Commit deaths from pending victims
  for (const victimId of pendingVictimIds) {
    const victim = playerMap.get(victimId);
    if (victim) {
      playerMap.set(victimId, {
        ...victim,
        alive: false,
        deathCause: "WEREWOLF",
        deathNightOrDay: { phase: "NIGHT", count: nightCount },
      });
      outcome.killedPlayerIds.push(victimId);
    }
  }

  // -----------------------------------------------------------------
  // Phase 6: Investigations (Seer, Aura Seer, Sorceress, Revealer)
  // -----------------------------------------------------------------
  for (const action of sortedActions) {
    if (!action.completed || !action.target_player_id) continue;
    const actor = playerMap.get(action.player_ids[0]);
    if (!actor || !actor.alive) continue;

    const target = playerMap.get(action.target_player_id);
    if (!target) continue;

    if (action.role_name === "Seer") {
      const result = evaluateSeerResult(target);
      outcome.investigations.push({
        investigatorId: actor.id,
        targetId: target.id,
        targetName: target.name,
        result,
      });
    } else if (action.role_name === "Sorceress") {
      const isSeer = target.canonical_name === "Seer";
      outcome.investigations.push({
        investigatorId: actor.id,
        targetId: target.id,
        targetName: target.name,
        result: isSeer ? "Werewolf" : "Villager", // Sorceress detects Seer
      });
    } else if (action.role_name === "Revealer") {
      const isWolf = target.team === "Werewolf" || target.seer_result === "Werewolf";
      if (!isWolf) {
        // Revealer fails and dies!
        playerMap.set(actor.id, {
          ...actor,
          alive: false,
          deathCause: "NIGHT_KILL",
        });
        outcome.killedPlayerIds.push(actor.id);
      }
    }
  }

  // -----------------------------------------------------------------
  // Phase 7: Recruits (Cult Leader)
  // -----------------------------------------------------------------
  for (const action of sortedActions) {
    if (!action.completed || !action.target_player_id) continue;
    const actor = playerMap.get(action.player_ids[0]);
    if (!actor || !actor.alive) continue;

    if (action.role_name === "Cult Leader") {
      const target = playerMap.get(action.target_player_id);
      if (target && target.alive) {
        playerMap.set(target.id, { ...target, inCult: true });
      }
    }
  }

  return {
    updatedPlayers: Array.from(playerMap.values()),
    outcome,
  };
}
