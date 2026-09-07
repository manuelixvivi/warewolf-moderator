// ============================================================
// ASPIRE: WEREWOLF - Unified Rules & Game Engine
// Driven by Role Database Blueprint
// "One Village. Many Lies. One Wolf."
// ============================================================

import {
  Player,
  NightAction,
  NightResult,
  TriggeredAction,
  WinResult,
  SelectedRole,
  RoleData,
} from "@/types/game";
import {
  GameMode,
  PlayerEngineState,
  EngineNightAction,
} from "./engine/types";
import {
  ALL_ROLES,
  ALL_ABILITIES,
  evaluateSeerResult,
  buildEngineNightActions,
  getRoleById,
  getRoleByName,
} from "./engine/abilityRegistry";
import { resolveNightActions } from "./engine/actionResolver";
import { resolveDeathChain } from "./engine/deathResolver";
import { resolveDayVotes as engineResolveDayVotes } from "./engine/voteResolver";
import { evaluateWinConditions } from "./engine/winEngine";
import {
  MINIMUM_PLAYERS,
  validateMode1Fixed,
  selectBalancedSubsetFromPool,
  generateBalancedRandomComposition,
  calculateCompositionBalance,
  shuffleRoles,
} from "./engine/balanceEngine";
import { generateFallbackNarrative } from "./narration/fallbackProvider";

export {
  ALL_ROLES,
  ALL_ABILITIES,
  MINIMUM_PLAYERS,
  evaluateSeerResult,
  calculateCompositionBalance,
  validateMode1Fixed,
  selectBalancedSubsetFromPool,
  generateBalancedRandomComposition,
  getRoleById,
  getRoleByName,
};

// ── 1. Role Randomizer & Allocator ──────────────────────────────────
export function randomizeRolesToPlayers(
  players: Player[],
  selectedRoles: SelectedRole[],
  mode: GameMode = "MODE_1_FIXED"
): Player[] {
  let roleList: RoleData[] = [];

  if (mode === "MODE_1_FIXED") {
    // Exact match enforcement. No silent Villager padding!
    const validation = validateMode1Fixed(players.length, selectedRoles);
    if (!validation.valid) {
      throw new Error(validation.error || "Komposisi Mode 1 tidak valid.");
    }
    for (const sr of selectedRoles) {
      const data = ALL_ROLES.find((r) => r.role_id === sr.role_id);
      if (data) {
        for (let i = 0; i < sr.count; i++) {
          roleList.push(data);
        }
      }
    }
  } else if (mode === "MODE_2_POOL") {
    // Balanced subset from host's selected pool
    roleList = selectBalancedSubsetFromPool(selectedRoles, players.length);
  } else if (mode === "MODE_3_RANDOM") {
    // Dynamic generated balanced set for actual player count
    roleList = generateBalancedRandomComposition(players.length);
  } else {
    // Moderator Helper / Custom
    for (const sr of selectedRoles) {
      const data = ALL_ROLES.find((r) => r.role_id === sr.role_id);
      if (data) {
        for (let i = 0; i < sr.count; i++) {
          roleList.push(data);
        }
      }
    }
    const villagerRole = ALL_ROLES.find((r) => r.canonical_name === "Villager") || ALL_ROLES[0];
    while (roleList.length < players.length) {
      roleList.push(villagerRole);
    }
  }

  // Shuffle roles
  const shuffled = shuffleRoles(roleList);

  return players.map((player, idx) => {
    const role = shuffled[idx];
    return {
      ...player,
      role_id: role.role_id,
      canonical_name: role.canonical_name,
      team: role.team,
      category: role.category,
      seer_result: role.seer_result,
      description_id: role.description_id || role.tooltip_id || role.description_en,
      description_en: role.description_en,
      tooltip_en: role.tooltip_en,
      tooltip_id: role.tooltip_id,
      active_phase: role.active_phase,
      action_type: role.action_type,
      target_type: role.target_type,
      usage_limit: role.usage_limit,
      night_priority: role.night_priority || 50,
      can_change_role: role.can_change_role,
      alive: true,
      protected: false,
      silenced: false,
      inCult: false,
      hasUsedAbility: false,
      votedForId: null,
      nightTargetId: null,
    };
  });
}

// ── 2. Build Night Actions ──────────────────────────────────────────
export function buildNightActions(
  players: Player[],
  nightCount: number = 1,
  wolfCubExtraKill: boolean = false
): NightAction[] {
  const enginePlayers: PlayerEngineState[] = players.map((p) => ({
    ...p,
    role_id: p.role_id || "ROLE-066",
    canonical_name: p.canonical_name || "Villager",
    team: p.team || "Village",
    originalTeam: p.team || "Village",
    category: p.category || "Village",
    seer_result: p.seer_result || "Villager",
    role_points: 1,
    balance_weight: 0,
    night_priority: p.night_priority || 50,
    active_phase: p.active_phase || "None",
    action_type: p.action_type || "None",
    trigger: "",
    target_type: p.target_type || "None",
    usage_limit: p.usage_limit || "Passive",
    can_change_role: p.can_change_role || false,
    isCursed: p.canonical_name === "Cursed",
    usedAbilityCount: 0,
  }));

  const engineActions = buildEngineNightActions(enginePlayers, nightCount, wolfCubExtraKill);

  return engineActions.map((ea) => ({
    id: ea.id,
    role_id: ea.role_id,
    role_name: ea.role_name,
    player_ids: ea.player_ids,
    action_type: ea.action_type,
    target_player_id: ea.target_player_id,
    target2_player_id: ea.secondary_target_id,
    completed: ea.completed,
    priority: ea.priority,
  }));
}

// ── 3. Resolve Night Phase ──────────────────────────────────────────
export function resolveNight(
  players: Player[],
  actions: NightAction[],
  nightCount: number = 1
): {
  updatedPlayers: Player[];
  result: NightResult;
  triggered: TriggeredAction[];
} {
  const enginePlayers: PlayerEngineState[] = players.map((p) => ({
    ...p,
    role_id: p.role_id || "ROLE-066",
    canonical_name: p.canonical_name || "Villager",
    team: p.team || "Village",
    originalTeam: p.team || "Village",
    category: p.category || "Village",
    seer_result: p.seer_result || "Villager",
    role_points: 1,
    balance_weight: 0,
    night_priority: p.night_priority || 50,
    active_phase: p.active_phase || "None",
    action_type: p.action_type || "None",
    trigger: "",
    target_type: p.target_type || "None",
    usage_limit: p.usage_limit || "Passive",
    can_change_role: p.can_change_role || false,
    isCursed: p.canonical_name === "Cursed",
    usedAbilityCount: 0,
  }));

  const engineActions: EngineNightAction[] = actions.map((a) => ({
    id: a.id,
    role_id: a.role_id,
    role_name: a.role_name,
    player_ids: a.player_ids,
    action_type: a.action_type,
    target_player_id: a.target_player_id,
    secondary_target_id: a.target2_player_id,
    priority: a.priority,
    completed: a.completed,
  }));

  const { updatedPlayers: resolvedPlayers, outcome } = resolveNightActions(
    enginePlayers,
    engineActions,
    nightCount
  );

  // Process any secondary death chain reactions
  const deathChain = resolveDeathChain(
    resolvedPlayers,
    outcome.killedPlayerIds,
    "WEREWOLF"
  );

  const finalPlayers: Player[] = deathChain.updatedPlayers.map((ep) => {
    const original = players.find((p) => p.id === ep.id);
    return {
      ...(original || {}),
      id: ep.id,
      name: ep.name,
      isHost: ep.isHost,
      isReady: ep.isReady,
      role_id: ep.role_id,
      canonical_name: ep.canonical_name,
      team: ep.team,
      category: ep.category,
      seer_result: ep.seer_result,
      alive: ep.alive,
      protected: !!ep.protected,
      silenced: !!ep.silenced,
      inCult: !!ep.inCult,
      hasUsedAbility: !!ep.hasUsedAbility,
    };
  });

  const allKilled = Array.from(
    new Set([
      ...outcome.killedPlayerIds,
      ...(deathChain.chainCasualties || []),
    ])
  );

  const triggeredList: TriggeredAction[] = (deathChain.pendingTriggeredActions || []).map((t) => ({
    type: t.type,
    player_id: t.playerId,
    role_name: t.roleName,
    completed: false,
  }));

  const playerMap = new Map<string, Player>(finalPlayers.map((p) => [p.id, p]));
  const killedNames = allKilled.map((id) => playerMap.get(id)?.name || "").filter(Boolean);
  const savedNames = outcome.savedPlayerIds.map((id) => playerMap.get(id)?.name || "").filter(Boolean);

  const narrative = generateFallbackNarrative({
    phase: "MORNING",
    theme: "CLASSIC_MEDIEVAL",
    style: "DRAMATIC",
    dayCount: nightCount,
    nightCount: nightCount,
    facts: {
      killedPlayerNames: killedNames,
      savedPlayerNames: savedNames,
    },
  });

  const result: NightResult = {
    killed: allKilled,
    protected: outcome.savedPlayerIds,
    investigated: outcome.investigations.map((inv) => ({
      investigator: inv.investigatorId,
      target: inv.targetId,
      result: inv.result,
    })),
    conversions: outcome.convertedPlayerIds.map((c) => ({
      player: c.playerId,
      newTeam: c.newTeam,
    })),
    silenced: outcome.silencedPlayerIds,
    triggered: triggeredList,
    narrative,
  };

  return {
    updatedPlayers: finalPlayers,
    result,
    triggered: triggeredList,
  };
}

// ── 4. Seer Calculation ─────────────────────────────────────────────
export function getSeerResult(player: Player): "Werewolf" | "Villager" {
  if (player.seer_result === "Werewolf") return "Werewolf";
  return "Villager";
}

// ── 5. Voting Resolution ────────────────────────────────────────────
export function resolveDayVotes(
  players: Player[],
  votes: Record<string, string> // voterId -> targetId
): {
  updatedPlayers: Player[];
  eliminatedPlayer: Player | null;
  tally: Record<string, number>;
  triggered: TriggeredAction[];
} {
  const enginePlayers: PlayerEngineState[] = players.map((p) => ({
    ...p,
    role_id: p.role_id || "ROLE-066",
    canonical_name: p.canonical_name || "Villager",
    team: p.team || "Village",
    originalTeam: p.team || "Village",
    category: p.category || "Village",
    seer_result: p.seer_result || "Villager",
    role_points: 1,
    balance_weight: 0,
    night_priority: p.night_priority || 50,
    active_phase: p.active_phase || "None",
    action_type: p.action_type || "None",
    trigger: "",
    target_type: p.target_type || "None",
    usage_limit: p.usage_limit || "Passive",
    can_change_role: p.can_change_role || false,
    isCursed: p.canonical_name === "Cursed",
    usedAbilityCount: 0,
    tannerWon: false,
    princeProtectedUsed: false,
  }));

  const { updatedPlayers: engineUpdated, outcome } = engineResolveDayVotes(
    enginePlayers,
    votes
  );

  const updatedPlayers: Player[] = engineUpdated.map((ep) => {
    const original = players.find((p) => p.id === ep.id);
    return {
      ...(original || {}),
      id: ep.id,
      name: ep.name,
      isHost: ep.isHost,
      isReady: ep.isReady,
      alive: ep.alive,
      silenced: !!ep.silenced,
      protected: !!ep.protected,
      inCult: !!ep.inCult,
      hasUsedAbility: !!ep.hasUsedAbility,
    };
  });

  const eliminated = outcome.eliminatedPlayer
    ? players.find((p) => p.id === outcome.eliminatedPlayer!.id) || null
    : null;

  const triggered: TriggeredAction[] = outcome.triggeredRetaliations.map((tr) => ({
    type: tr.type,
    player_id: tr.playerId,
    role_name: tr.roleName,
    completed: false,
  }));

  if (outcome.tannerWon && outcome.eliminatedPlayer) {
    triggered.push({
      type: "TANNER_WIN",
      player_id: outcome.eliminatedPlayer.id,
      role_name: "Tanner",
      completed: true,
    });
  }

  return {
    updatedPlayers,
    eliminatedPlayer: eliminated,
    tally: outcome.tally,
    triggered,
  };
}

// ── 6. Check Win Condition ──────────────────────────────────────────
export function checkWinCondition(players: Player[]): WinResult | null {
  const enginePlayers: PlayerEngineState[] = players.map((p) => ({
    ...p,
    role_id: p.role_id || "ROLE-066",
    canonical_name: p.canonical_name || "Villager",
    team: p.team || "Village",
    originalTeam: p.team || "Village",
    category: p.category || "Village",
    seer_result: p.seer_result || "Villager",
    role_points: 1,
    balance_weight: 0,
    night_priority: p.night_priority || 50,
    active_phase: p.active_phase || "None",
    action_type: p.action_type || "None",
    trigger: "",
    target_type: p.target_type || "None",
    usage_limit: p.usage_limit || "Passive",
    can_change_role: p.can_change_role || false,
    isCursed: false,
    usedAbilityCount: 0,
  }));

  const res = evaluateWinConditions(enginePlayers);
  if (res.hasWon && res.winner) {
    return {
      winner: res.winner,
      reason: res.reason,
    };
  }
  return null;
}

// ── 7. Atmospheric Narratives ───────────────────────────────────────
export function generateNightNarrative(
  result: NightResult,
  playerMap: Map<string, Player>
): string {
  const killedNames = result.killed
    .map((id) => playerMap.get(id)?.name || "seseorang")
    .filter(Boolean);
  const savedNames = result.protected
    .map((id) => playerMap.get(id)?.name || "seorang warga")
    .filter(Boolean);

  return generateFallbackNarrative({
    phase: "MORNING",
    theme: "CLASSIC_MEDIEVAL",
    style: "DRAMATIC",
    dayCount: 1,
    nightCount: 1,
    facts: {
      killedPlayerNames: killedNames,
      savedPlayerNames: savedNames,
    },
  });
}

export function generateDayNarrative(
  killedPlayers: Player[],
  theme: string = "Dark Fantasy"
): string {
  const names = killedPlayers.map((p) => p.name).join(" dan ");
  if (killedPlayers.length === 0) {
    return (
      "☀️ **FAJAR TELAH TIBA DI DESA ASPIRE**\n\n" +
      "Matahari terbit menembus kabut dingin. Seluruh warga berkumpul di alun-alun dengan selamat. Namun kecurigaan terus menyelimuti setiap pasang mata..."
    );
  }

  return (
    "☀️ **DUKA MENYELIMUTI DESA ASPIRE**\n\n" +
    `Lonceng kematian berdentang memecah sunyi. Warga desa menemukan **${names}** terbujur kaku tanpa nyawa.\n\n` +
    `Waktu berdiskusi dimulai — temukan sang pengkhianat sebelum malam berikutnya tiba!`
  );
}
