// ============================================================
// ASPIRE: WEREWOLF - Universal Deterministic Night Action Resolver
// Driven by Role Database Blueprint (75 Roles, 79 Abilities)
// "One Village. Many Lies. One Wolf."
// ============================================================

import {
  PlayerEngineState,
  EngineNightAction,
  NightResolutionOutcome,
} from "./types";
import { resolveInvestigation } from "./investigationEngine";
import { resolveDeathChain } from "./deathResolver";
import { revealDrunkRole, transformPlayerRole } from "./roleTransformation";

export interface NightResolutionContext {
  wolvesSkippingTonight?: boolean; // From Diseased infection on previous night
  wolfCubRageActive?: boolean;     // From Wolf Cub elimination on previous cycle
  initialWolfCount?: number;       // Initial werewolves count for Old Man
}

/**
 * Resolves all night actions deterministically according to database definitions:
 * - Pre-actions (Doppelganger, Cupid, Hoodlum, Virginia Woolf, Dire Wolf, Nostradamus, Leprechaun)
 * - Protections (Bodyguard, Priest)
 * - Disruptions & Statuses (Spellcaster, Old Hag, The Mummy, Zombie, The Thing, Insomniac)
 * - Attacks (Werewolves, Big Bad Wolf, Vampire, Dracula, Huntress, Chupacabra, The Blob, Wolverine, Bloody Mary)
 * - Saves (Witch Heal & Poison)
 * - Investigations (Seer, Aura Seer, Sorceress, Revealer, P.I., Mentalist, Beholder, The Count)
 * - Recruits (Cult Leader)
 * - Cycle Triggers (Drunk Night 3 reveal, Tough Guy delayed death, Old Man timed death)
 * - Cascading Death Resolution (Lovers, Dire Wolf, Wolf Cub rage, Diseased skip, Doppelganger/Apprentice activation)
 */
export function resolveNightActions(
  players: PlayerEngineState[],
  actions: EngineNightAction[],
  nightCount: number,
  context?: NightResolutionContext
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
        protected: false, // Reset holy protection at start of night resolution
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
    deathEvents: [],
    wolfCubExtraKillTriggered: false,
    wolvesSkippingNextKill: false,
  };

  const sortedActions = [...actions].sort((a, b) => a.priority - b.priority);

  // -----------------------------------------------------------------
  // Phase 1: Pre-actions (Links, Marks, Copies, Predictions, Redirects)
  // -----------------------------------------------------------------
  let redirectedWolfTargetId: string | null = null;

  for (const action of sortedActions) {
    if (!action.completed || !action.target_player_id) continue;
    const actor = playerMap.get(action.player_ids[0]);
    if (!actor || !actor.alive) continue;

    const roleName = (actor.canonical_name || action.role_name).toLowerCase();
    const target = playerMap.get(action.target_player_id);

    // Doppelganger (ROLE-033) Night 1
    if (roleName.includes("doppelg") && nightCount === 1 && target) {
      playerMap.set(actor.id, {
        ...actor,
        doppelganger: {
          targetPlayerId: target.id,
          targetRoleId: target.role_id,
          isActivated: false,
        },
        hasUsedAbility: true,
      });
      outcome.triggeredActions.push({
        type: "DOPPELGANGER_MARKED",
        playerId: actor.id,
        roleName: actor.canonical_name,
        description: `Doppelganger memilih ${target.name} untuk diduplikasi saat tewas.`,
      });
    }

    // Cupid (ROLE-030) Night 1
    if (roleName.includes("cupid") && nightCount === 1 && action.secondary_target_id) {
      const target2 = playerMap.get(action.secondary_target_id);
      if (target && target2) {
        playerMap.set(target.id, {
          ...target,
          linkedPartnerIds: Array.from(new Set([...(target.linkedPartnerIds || []), target2.id])),
        });
        playerMap.set(target2.id, {
          ...target2,
          linkedPartnerIds: Array.from(new Set([...(target2.linkedPartnerIds || []), target.id])),
        });
        playerMap.set(actor.id, { ...actor, hasUsedAbility: true });
        outcome.triggeredActions.push({
          type: "CUPID_LINKED",
          playerId: actor.id,
          roleName: actor.canonical_name,
          description: `Cupid telah menyatukan ${target.name} dan ${target2.name} sebagai pasangan kekasih sehidup semati.`,
        });
      }
    }

    // Hoodlum (ROLE-036) Night 1
    if (roleName.includes("hoodlum") && nightCount === 1 && action.secondary_target_id) {
      const target2 = playerMap.get(action.secondary_target_id);
      if (target && target2) {
        playerMap.set(actor.id, {
          ...actor,
          markedTargetIds: [target.id, target2.id],
          hasUsedAbility: true,
        });
      }
    }

    // Virginia Woolf (ROLE-063) Night 1
    if (roleName.includes("virginia woolf") && nightCount === 1 && target) {
      playerMap.set(actor.id, {
        ...actor,
        fearTargetId: target.id,
        hasUsedAbility: true,
      });
    }

    // Dire Wolf (ROLE-060) Night 1
    if (roleName.includes("dire wolf") && nightCount === 1 && target) {
      playerMap.set(actor.id, {
        ...actor,
        direWolfCompanionId: target.id,
        hasUsedAbility: true,
      });
    }

    // Nostradamus (ROLE-080) Night 1
    if (roleName.includes("nostradamus") && nightCount === 1) {
      const predictedTeam = action.action_type || (target ? target.team : "Village");
      playerMap.set(actor.id, {
        ...actor,
        predictedWinningTeam: predictedTeam,
        hasUsedAbility: true,
      });
    }

    // Leprechaun (ROLE-079): Redirects werewolf attack
    if (roleName.includes("leprechaun") && action.secondary_target_id) {
      redirectedWolfTargetId = action.secondary_target_id;
      outcome.redirectedActions.push({
        roleName: "Leprechaun",
        originalTargetId: action.target_player_id,
        newTargetId: action.secondary_target_id,
      });
    }

    // Dr Helgo (ROLE-005) & Hackmaster (ROLE-008): Steal / duplicate card on Night 1
    if (
      (roleName.includes("helgo") || action.role_id === "ROLE-005" ||
        roleName.includes("hackmaster") || action.role_id === "ROLE-008") &&
      nightCount === 1 &&
      target
    ) {
      const { updatedPlayer } = transformPlayerRole(
        actor,
        target.role_id,
        "Stole card on Night 1"
      );
      playerMap.set(actor.id, { ...updatedPlayer, hasUsedAbility: true });
      outcome.triggeredActions.push({
        type: "ROLE_STOLEN",
        playerId: actor.id,
        roleName: actor.canonical_name,
        description: `${actor.name} mengambil peran milik ${target.name} dan kini menjadi ${updatedPlayer.canonical_name}!`,
      });
    }

    // The Thing (ROLE-076): Taps neighbor
    if ((roleName.includes("the thing") || action.role_id === "ROLE-076") && target) {
      outcome.triggeredActions.push({
        type: "THING_TAPPED",
        playerId: target.id,
        roleName: "The Thing",
        description: `The Thing mengetuk pundak ${target.name}!`,
      });
    }

    // Ghost (ROLE-035): Gives clue on Night 1
    if ((roleName.includes("ghost") || action.role_id === "ROLE-035") && nightCount === 1) {
      outcome.triggeredActions.push({
        type: "GHOST_CLUE",
        playerId: actor.id,
        roleName: "Ghost",
        description: `Ghost memberikan petunjuk misterius dari alam baka!`,
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

    const roleName = (actor.canonical_name || action.role_name).toLowerCase();

    // Bodyguard (ROLE-028): cannot protect self
    if (roleName.includes("bodyguard")) {
      if (action.target_player_id === actor.id) continue;
      const target = playerMap.get(action.target_player_id);
      if (target && target.alive) {
        playerMap.set(target.id, { ...target, protected: true });
      }
    }

    // Priest (ROLE-038): once per game
    if (roleName.includes("priest") && !actor.hasUsedAbility) {
      const target = playerMap.get(action.target_player_id);
      if (target && target.alive) {
        playerMap.set(target.id, { ...target, protected: true });
        playerMap.set(actor.id, { ...actor, hasUsedAbility: true });
      }
    }
  }

  // -----------------------------------------------------------------
  // Phase 3: Disruptions & Statuses (Spellcaster, Old Hag, Mummy, Zombie)
  // -----------------------------------------------------------------
  for (const action of sortedActions) {
    if (!action.completed || !action.target_player_id) continue;
    const actor = playerMap.get(action.player_ids[0]);
    if (!actor || !actor.alive) continue;

    const roleName = (actor.canonical_name || action.role_name).toLowerCase();
    const target = playerMap.get(action.target_player_id);
    if (!target || !target.alive) continue;

    // Spellcaster (ROLE-052): Silences target
    if (roleName.includes("spellcaster")) {
      playerMap.set(target.id, { ...target, silenced: true });
      outcome.silencedPlayerIds.push(target.id);
    }

    // Old Hag (ROLE-046): Banishes target from village next day
    if (roleName.includes("old hag")) {
      playerMap.set(target.id, { ...target, silenced: true });
      outcome.triggeredActions.push({
        type: "OLD_HAG_BANISH",
        playerId: target.id,
        roleName: "Old Hag",
        description: `Old Hag mengusir ${target.name} keluar desa untuk esok hari!`,
      });
    }

    // The Mummy (ROLE-069): Hypnotizes target
    if (roleName.includes("the mummy") || roleName.includes("mummy")) {
      playerMap.set(target.id, { ...target, isHypnotized: true });
      outcome.triggeredActions.push({
        type: "MUMMY_HYPNOTIZE",
        playerId: target.id,
        roleName: "The Mummy",
        description: `The Mummy telah menghipnotis ${target.name}!`,
      });
    }

    // Zombie (ROLE-070): Bites target, disables vote
    if (roleName.includes("zombie")) {
      playerMap.set(target.id, { ...target, isZombie: true });
      outcome.triggeredActions.push({
        type: "ZOMBIE_BITE",
        playerId: target.id,
        roleName: "Zombie",
        description: `Zombie memakan otak ${target.name}! Ia kehilangan hak suaranya.`,
      });
    }
  }

  // -----------------------------------------------------------------
  // Phase 4: Attacks & Kills
  // -----------------------------------------------------------------
  const pendingVictimIds = new Set<string>();

  for (const action of sortedActions) {
    if (!action.completed || !action.target_player_id) continue;
    const actor = playerMap.get(action.player_ids[0]);
    const roleName = (action.role_name || actor?.canonical_name || "").toLowerCase();

    // Werewolves Collective Action
    if (roleName.startsWith("werewolf") || roleName.startsWith("werewolves")) {
      // Check if wolves are skipping kill tonight (e.g. infected by Diseased)
      if (context?.wolvesSkippingTonight) {
        outcome.triggeredActions.push({
          type: "WOLVES_SKIPPED_KILL",
          playerId: "",
          roleName: "Werewolves",
          description: "Kawanan Werewolf masih sakit akibat terinfeksi Diseased dan tidak bisa menyerang malam ini.",
        });
        continue;
      }

      let targetId = action.target_player_id;
      if (redirectedWolfTargetId) {
        targetId = redirectedWolfTargetId;
      }

      const target = playerMap.get(targetId);
      if (target && target.alive) {
        if (target.protected) {
          outcome.savedPlayerIds.push(targetId);
        } else if (target.canonical_name === "Cursed" || target.isCursed || target.role_id === "ROLE-031") {
          // Cursed converts to Werewolf!
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
        } else if (target.canonical_name === "Tough Guy" || target.role_id === "ROLE-054") {
          // Tough Guy survives tonight, scheduled to die next night
          playerMap.set(targetId, {
            ...target,
            delayedDeathNight: nightCount + 1,
          });
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

    // Big Bad Wolf (ROLE-059): Extra kill while other wolves live
    if (roleName.includes("big bad wolf") && actor && actor.alive) {
      const target = playerMap.get(action.target_player_id);
      if (target && target.alive && !target.protected) {
        pendingVictimIds.add(target.id);
      }
    }

    // Vampire (ROLE-025) & Count Dracula (ROLE-065)
    if ((roleName.includes("vampire") || roleName.includes("dracula")) && actor && actor.alive) {
      const target = playerMap.get(action.target_player_id);
      if (target && target.alive && !target.protected) {
        pendingVictimIds.add(target.id);
      }
    }

    // Huntress (ROLE-009): One kill per game
    if (roleName.includes("huntress") && actor && actor.alive && !actor.hasUsedAbility) {
      const target = playerMap.get(action.target_player_id);
      if (target && target.alive && !target.protected) {
        pendingVictimIds.add(target.id);
        playerMap.set(actor.id, { ...actor, hasUsedAbility: true });
      }
    }

    // Chupacabra (ROLE-078)
    if (roleName.includes("chupacabra") && actor && actor.alive) {
      const target = playerMap.get(action.target_player_id);
      if (target && target.alive && !target.protected) {
        pendingVictimIds.add(target.id);
      }
    }

    // The Blob (ROLE-068): Absorbs target
    if (roleName.includes("blob") && actor && actor.alive) {
      const target = playerMap.get(action.target_player_id);
      if (target && target.alive && !target.protected) {
        pendingVictimIds.add(target.id);
      }
    }

    // Wolverine (ROLE-064)
    if (roleName.includes("wolverine") && actor && actor.alive) {
      const target = playerMap.get(action.target_player_id);
      if (target && target.alive && !target.protected) {
        pendingVictimIds.add(target.id);
      }
    }

    // Alpha Wolf (ROLE-003): Convert/Override
    if (
      (roleName.includes("alpha wolf") || action.role_id === "ROLE-003") &&
      actor &&
      actor.alive &&
      (action.action_type === "Convert/Override" || action.action_type?.includes("Convert"))
    ) {
      const target = playerMap.get(action.target_player_id);
      if (target && target.alive && !target.protected) {
        pendingVictimIds.delete(target.id);
        const { updatedPlayer } = transformPlayerRole(target, "ROLE-023", "Alpha Wolf conversion");
        playerMap.set(target.id, updatedPlayer);
        outcome.convertedPlayerIds.push({
          playerId: target.id,
          oldTeam: target.team,
          newTeam: "Werewolf",
        });
        playerMap.set(actor.id, { ...actor, hasUsedAbility: true });
        outcome.triggeredActions.push({
          type: "ALPHA_WOLF_CONVERT",
          playerId: target.id,
          roleName: "Alpha Wolf",
          description: `Alpha Wolf mengubah ${target.name} menjadi Werewolf baru!`,
        });
      }
    }

    // Bloody Mary (ROLE-077): Revenge strike
    if ((roleName.includes("bloody mary") || action.role_id === "ROLE-077") && action.target_player_id) {
      const target = playerMap.get(action.target_player_id);
      if (target && target.alive && !target.protected) {
        pendingVictimIds.add(target.id);
      }
    }

    // Frankenstein's Monster (ROLE-066): Copies power
    if (
      (roleName.includes("frankenstein") || action.role_id === "ROLE-066") &&
      actor &&
      actor.alive &&
      action.target_player_id
    ) {
      const target = playerMap.get(action.target_player_id);
      if (target) {
        outcome.triggeredActions.push({
          type: "FRANKENSTEIN_ACQUIRED",
          playerId: actor.id,
          roleName: "Frankenstein's Monster",
          description: `Frankenstein menyerap kemampuan dari ${target.name}!`,
        });
      }
    }
  }

  // -----------------------------------------------------------------
  // Phase 5: Saves & Witch Potions (ROLE-057)
  // -----------------------------------------------------------------
  for (const action of sortedActions) {
    if (!action.completed) continue;
    const roleName = action.role_name.toLowerCase();
    if (roleName.includes("witch")) {
      const actor = playerMap.get(action.player_ids[0]);
      if (!actor || !actor.alive) continue;

      // Witch Heal: saves pending victim
      if (action.target_player_id && pendingVictimIds.has(action.target_player_id)) {
        pendingVictimIds.delete(action.target_player_id);
        outcome.savedPlayerIds.push(action.target_player_id);
        playerMap.set(actor.id, {
          ...actor,
          usedAbilityCount: (actor.usedAbilityCount || 0) + 1,
        });
      }

      // Witch Poison: kills target
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

  // -----------------------------------------------------------------
  // Phase 6: Investigations (Seer, Aura Seer, Sorceress, Revealer, P.I., Mentalist, etc.)
  // -----------------------------------------------------------------
  for (const action of sortedActions) {
    if (!action.completed || !action.target_player_id) continue;
    const actor = playerMap.get(action.player_ids[0]);
    if (!actor || !actor.alive) continue;

    const target = playerMap.get(action.target_player_id);
    if (!target) continue;

    const secondaryTarget = action.secondary_target_id
      ? playerMap.get(action.secondary_target_id)
      : null;

    const report = resolveInvestigation(
      actor,
      target,
      Array.from(playerMap.values()),
      secondaryTarget
    );

    outcome.investigations.push({
      investigatorId: actor.id,
      targetId: target.id,
      targetName: target.name,
      result: report.resultString,
    });

    // Revealer (ROLE-016): If investigated villager, Revealer dies!
    if (report.backfiredOnInvestigator) {
      pendingVictimIds.add(actor.id);
      outcome.triggeredActions.push({
        type: "REVEALER_BACKFIRE",
        playerId: actor.id,
        roleName: actor.canonical_name,
        description: `Revealer salah mengungkap warga desa (${target.name}) dan gugur karena rasa bersalah!`,
      });
    }
  }

  // -----------------------------------------------------------------
  // Phase 7: Recruits (Cult Leader ROLE-029)
  // -----------------------------------------------------------------
  for (const action of sortedActions) {
    if (!action.completed || !action.target_player_id) continue;
    const actor = playerMap.get(action.player_ids[0]);
    if (!actor || !actor.alive) continue;

    const roleName = action.role_name.toLowerCase();
    if (roleName.includes("cult leader")) {
      const target = playerMap.get(action.target_player_id);
      if (target && target.alive) {
        playerMap.set(target.id, { ...target, inCult: true });
        outcome.triggeredActions.push({
          type: "CULT_RECRUIT",
          playerId: target.id,
          roleName: "Cult Leader",
          description: `Cult Leader merekrut ${target.name} ke dalam kelompok sekte!`,
        });
      }
    }
  }

  // -----------------------------------------------------------------
  // Phase 8: End-of-Night Scheduled Triggers (Drunk, Tough Guy, Old Man)
  // -----------------------------------------------------------------
  // Drunk (ROLE-034): Night 3 reveals real role
  if (nightCount >= 3) {
    for (const [pId, p] of playerMap.entries()) {
      if (
        p.alive &&
        (p.role_id === "ROLE-034" || p.canonical_name === "Drunk") &&
        !p.isDrunkRevealed
      ) {
        const revealed = revealDrunkRole(p, "ROLE-024"); // reveals as Villager or assigned role
        playerMap.set(pId, revealed);
        outcome.triggeredActions.push({
          type: "DRUNK_REVEALED",
          playerId: pId,
          roleName: "Drunk",
          description: `Drunk (${p.name}) telah sadar pada malam ke-3 dan mengetahui peran aslinya!`,
        });
      }
    }
  }

  // Tough Guy (ROLE-054): Delayed death triggered
  for (const [pId, p] of playerMap.entries()) {
    if (p.alive && p.delayedDeathNight && p.delayedDeathNight <= nightCount) {
      pendingVictimIds.add(pId);
      outcome.triggeredActions.push({
        type: "TOUGH_GUY_DIED",
        playerId: pId,
        roleName: "Tough Guy",
        description: `Luka Tough Guy (${p.name}) tak lagi tertolong. Ia gugur di penghujung malam.`,
      });
    }
  }

  // Old Man (ROLE-047): Timed death (Night X = werewolfCount + 1)
  const initialWolves = context?.initialWolfCount || 1;
  const oldManDeathNight = initialWolves + 1;
  if (nightCount >= oldManDeathNight) {
    for (const [pId, p] of playerMap.entries()) {
      if (
        p.alive &&
        (p.role_id === "ROLE-047" || p.canonical_name === "Old Man")
      ) {
        pendingVictimIds.add(pId);
        outcome.triggeredActions.push({
          type: "OLD_MAN_TIMED_DEATH",
          playerId: pId,
          roleName: "Old Man",
          description: `Old Man (${p.name}) wafat dengan damai karena usia tuanya di malam ke-${nightCount}.`,
        });
      }
    }
  }

  // -----------------------------------------------------------------
  // Phase 9: Cascading Death Resolution via resolveDeathChain()
  // -----------------------------------------------------------------
  const deathResolution = resolveDeathChain(
    Array.from(playerMap.values()),
    Array.from(pendingVictimIds),
    "WEREWOLF_ATTACK",
    "NIGHT",
    nightCount
  );

  outcome.killedPlayerIds = Array.from(pendingVictimIds);
  outcome.deathEvents = deathResolution.deathEvents;
  outcome.wolfCubExtraKillTriggered = deathResolution.wolfCubExtraKillTriggered;
  outcome.wolvesSkippingNextKill = deathResolution.wolvesSkippingNextKill;

  return {
    updatedPlayers: deathResolution.updatedPlayers,
    outcome,
  };
}
