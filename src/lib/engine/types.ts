// ============================================================
// ASPIRE: WEREWOLF - Complete Engine Type Definitions
// Driven by Role Database Blueprint (75 Roles, 79 Abilities)
// "One Village. Many Lies. One Wolf."
// ============================================================

import { RoleData, SelectedRole, Team, Category, SeerResult } from "@/types/game";

export type GameMode =
  | "MODE_1_FIXED"       // Fixed composition, exact count, no silent padding
  | "MODE_2_POOL"        // Role pool, engine decides counts, no padding outside pool
  | "MODE_3_RANDOM"      // Full random open room, dynamic count upon start
  | "MODERATOR_HELPER";  // Single-device offline assistant on authoritative engine

export type EngineEventCode =
  | "GAME_STARTED"
  | "FIRST_NIGHT_STARTED"
  | "NIGHT_STARTED"
  | "ACTION_SUBMITTED"
  | "NIGHT_RESOLVED"
  | "DAY_STARTED"
  | "DISCUSSION_STARTED"
  | "DISCUSSION_TIMEOUT"
  | "VOTING_STARTED"
  | "VOTING_TIMEOUT"
  | "VOTE_SUBMITTED"
  | "VOTE_RESOLVED"
  | "PLAYER_ELIMINATED_BY_VOTE"
  | "PLAYER_DIED"
  | "ROLE_TRANSFORMATION_REQUESTED"
  | "ROLE_CHANGED"
  | "TIMER_STARTED"
  | "TIMER_EXPIRED"
  | "WIN_CONDITION_CHECKED"
  | "GAME_ENDED";

export type DeathCause =
  | "WEREWOLF"
  | "WEREWOLF_ATTACK"
  | "VOTE"
  | "HUNTER"
  | "ABILITY"
  | "CHAIN_REACTION"
  | "SELF"
  | "NIGHT_KILL"
  | "OTHER";

export interface DeathEvent {
  playerId: string;
  deathCause: DeathCause;
  killerId?: string;
  phase: "NIGHT" | "DAY";
  cycleCount: number;
}

export type AbilityTriggerType =
  | "NightStart"
  | "NightAction"
  | "FirstNight"
  | "DayElimination"
  | "VoteElimination"
  | "Death"
  | "Voting"
  | "Passive"
  | "EndGame"
  | "Custom"
  | "Timeout";

export type TargetType =
  | "Player"
  | "Self"
  | "Adjacent Player"
  | "2 Players"
  | "Team"
  | "Werewolves"
  | "Werewolves' target"
  | "Living Players"
  | "Game"
  | "None";

export type UsageLimit =
  | "Nightly"
  | "Once"
  | "Once/game"
  | "Passive"
  | "Every day"
  | "Special"
  | "Rule-dependent";

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

export interface DoppelgangerState {
  targetPlayerId: string | null;
  targetRoleId: string | null;
  isActivated: boolean;
}

export interface PlayerEngineState {
  id: string;
  name: string;
  isHost: boolean;
  isReady: boolean;
  role_id: string;
  canonical_name: string;
  team: Team;
  originalTeam: Team;
  category: Category;
  seer_result: SeerResult;
  role_points: number;
  balance_weight: number;
  night_priority: number;
  active_phase: string;
  action_type: string;
  trigger: string;
  target_type: string;
  usage_limit?: string;
  can_change_role?: boolean;
  reveal_on_death?: string;
  requires_engine_resolution?: boolean;
  description_en?: string;
  description_id?: string;
  tooltip_en?: string;
  tooltip_id?: string;

  // In-Game Dynamic Statuses
  alive: boolean;
  protected?: boolean;
  silenced?: boolean;
  inCult?: boolean;
  isCursed?: boolean;
  isDiseased?: boolean;
  isHypnotized?: boolean;
  isZombie?: boolean;
  isDrunkRevealed?: boolean;
  delayedDeathNight?: number;
  hasUsedAbility?: boolean;
  usedAbilityCount?: number;

  // Specific Role Connections & States
  linkedPartnerIds?: string[];      // Cupid / Virginia Woolf lovers
  markedTargetIds?: string[];       // Hoodlum targets
  direWolfCompanionId?: string;     // Dire Wolf companion
  fearTargetId?: string;            // Virginia Woolf target
  predictedWinningTeam?: string;    // Nostradamus prediction
  doppelganger?: DoppelgangerState; // Doppelganger lifecycle
  witchPotions?: { healUsed: boolean; poisonUsed: boolean };
  huntressUsed?: boolean;
  tannerWon?: boolean;
  princeProtectedUsed?: boolean;
  idiotSurvivesUsed?: boolean;
  martyrUsed?: boolean;
  troublemakerUsed?: boolean;
  piUsed?: boolean;
  drHelgoStolenRoleId?: string;
  hackmasterStolenRoleId?: string;
  customPowerChoice?: string;       // Magician
  ghostCluesGiven?: string[];       // Ghost
  deathCause?: DeathCause;
  deathNightOrDay?: { phase: "NIGHT" | "DAY"; count: number };
}

export interface PublicPlayerInfo {
  id: string;
  name: string;
  alive: boolean;
  isHost: boolean;
  silenced: boolean;
  // NOTE: role_id, canonical_name, and team are STRIPPED to maintain zero info leak
}

export interface PublicGameState {
  gameMode: GameMode;
  phase: string;
  dayCount: number;
  nightCount: number;
  players: PublicPlayerInfo[];
  narrativeText: string;
  gameEnded: boolean;
  winner: string | null;
  winningPlayerIds: string[];
  winningTeams: string[];
  winReason: string | null;
  voteTally?: Record<string, number>;
  eliminatedPlayerId?: string | null;
  nightVictimIds?: string[];
  princeSurvived?: boolean;
  tannerWon?: boolean;
  wolfCubExtraKillActive?: boolean;
}

export interface PrivatePlayerState {
  player: PlayerEngineState;
  roleData: RoleData;
  teammateIds?: string[];           // Fellow werewolves or masons
  partnerIds?: string[];            // Lovers
  seerHistory?: Array<{ night: number; targetId: string; targetName: string; result: string }>;
  activeAction?: EngineNightAction | null;
  availableActions?: EngineNightAction[];
}

export interface ModeratorState {
  players: PlayerEngineState[];
  phase: string;
  dayCount: number;
  nightCount: number;
  activeActions: EngineNightAction[];
  logs: string[];
  winResult: WinEvaluationResult | null;
}

export interface EngineNightAction {
  id: string;
  role_id: string;
  role_name: string;
  player_ids: string[];
  action_type: string;
  target_player_id: string | null;
  secondary_target_id?: string | null;
  priority: number;
  completed: boolean;
}

export interface NightResolutionOutcome {
  killedPlayerIds: string[];
  savedPlayerIds: string[];
  investigations: Array<{
    investigatorId: string;
    targetId: string;
    targetName: string;
    result: string;
  }>;
  silencedPlayerIds: string[];
  convertedPlayerIds: Array<{ playerId: string; oldTeam: Team; newTeam: Team; newRoleId?: string }>;
  redirectedActions: Array<{ roleName: string; originalTargetId: string; newTargetId: string }>;
  triggeredActions: Array<{
    type: string;
    playerId: string;
    roleName: string;
    description: string;
  }>;
  deathEvents: DeathEvent[];
  wolfCubExtraKillTriggered: boolean;
  wolvesSkippingNextKill: boolean;
}

export interface VoteResolutionOutcome {
  tally: Record<string, number>;
  topTargetId: string | null;
  isTie: boolean;
  eliminatedPlayer: PlayerEngineState | null;
  princeSurvived: boolean;
  tannerWon: boolean;
  martyrReplacedPlayerId?: string;
  sasquatchConverted?: boolean;
  dayTimerReduced?: boolean;
  triggeredRetaliations: Array<{
    type: "HUNTER" | "DR_BOOM" | "WOLVERINE" | "MAD_BOMBER";
    playerId: string;
    roleName: string;
  }>;
}

export interface WinEvaluationResult {
  gameEnded: boolean;
  hasWon?: boolean;
  winner: string | null;
  winningPlayerIds: string[];
  winningTeams: string[];
  reason: string;
}

export interface CompositionBalance {
  villageScore: number;
  werewolfScore: number;
  neutralScore: number;
  totalBalanceWeight: number;
  isBalanced: boolean;
  recommendation?: string;
}
