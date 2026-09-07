// ============================================================
// ASPIRE: WEREWOLF - Core Engine Type Definitions
// Driven by Role Database Blueprint
// "One Village. Many Lies. One Wolf."
// ============================================================

import { RoleData, SelectedRole, Team, Category, SeerResult, TriggeredAction } from "@/types/game";

export type { TriggeredAction };

export type GameMode =
  | "MODE_1_FIXED"       // Fixed composition, exact count, no padding
  | "MODE_2_POOL"        // Dynamic count from role pool, balanced subset
  | "MODE_3_RANDOM"      // Full random open room, balanced generated set
  | "MODERATOR_HELPER";  // Single device offline assistant on same engine

export type EngineEventCode =
  | "GAME_STARTED"
  | "NIGHT_STARTED"
  | "ACTION_SUBMITTED"
  | "NIGHT_RESOLVED"
  | "PLAYER_DIED"
  | "DAY_STARTED"
  | "DISCUSSION_STARTED"
  | "VOTING_STARTED"
  | "VOTE_RESOLVED"
  | "PLAYER_ELIMINATED_BY_VOTE"
  | "WIN_CONDITION_CHECKED"
  | "GAME_ENDED";

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
  | "Custom";

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
  usage_limit: string;
  can_change_role: boolean;
  description_en?: string;
  description_id?: string;
  tooltip_en?: string;
  tooltip_id?: string;
  alive: boolean;
  protected: boolean;
  silenced: boolean;
  inCult: boolean;
  isCursed: boolean;
  hasUsedAbility: boolean;
  usedAbilityCount: number;
  // Specific role attributes
  linkedPartnerIds?: string[];     // Cupid / Virginia Woolf lovers
  markedTargetIds?: string[];      // Hoodlum targets
  doppelganger?: DoppelgangerState; // Doppelganger lifecycle
  tannerWon?: boolean;
  princeProtectedUsed?: boolean;
  deathCause?: "WEREWOLF" | "VOTE" | "HUNTER" | "CHAIN_BOMB" | "LOVERS" | "VAMPIRE" | "NIGHT_KILL" | "UNKNOWN";
  deathNightOrDay?: { phase: "NIGHT" | "DAY"; count: number };
}

export interface PublicPlayerInfo {
  id: string;
  name: string;
  alive: boolean;
  isHost: boolean;
  silenced: boolean;
  // NOTE: role_id, canonical_name, and team are STRIPPED from public info to prevent meta-gaming
}

export interface PublicGameState {
  gameMode: GameMode;
  phase: string;
  dayCount: number;
  nightCount: number;
  players: PublicPlayerInfo[];
  narrativeText: string;
  winner: string | null;
  winReason: string | null;
  voteTally?: Record<string, number>;
  eliminatedPlayerId?: string | null;
  nightVictimIds?: string[];
  wolfCubExtraKillActive?: boolean;
}

export interface PrivatePlayerState {
  player: PlayerEngineState;
  roleData: RoleData;
  teammateIds?: string[]; // e.g. fellow werewolves or masons
  seerHistory?: Array<{ night: number; targetId: string; targetName: string; result: SeerResult }>;
  activeAction?: EngineNightAction | null;
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
    result: SeerResult;
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
  wolfCubExtraKillTriggered: boolean;
  deathChains: Array<{ playerId: string; reason: string }>;
}

export interface VoteResolutionOutcome {
  tally: Record<string, number>;
  topTargetId: string | null;
  isTie: boolean;
  eliminatedPlayer: PlayerEngineState | null;
  princeSurvived: boolean;
  tannerWon: boolean;
  triggeredRetaliations: Array<{
    type: "HUNTER" | "DR_BOOM" | "WOLVERINE" | "MAD_BOMBER";
    playerId: string;
    roleName: string;
  }>;
}

export interface WinEvaluationResult {
  hasWon: boolean;
  winner: string | null;
  reason: string;
  winningPlayerIds?: string[];
}

export interface CompositionBalance {
  villageScore: number;
  werewolfScore: number;
  neutralScore: number;
  totalBalanceWeight: number; // positive = village favored, negative = wolf favored
  isBalanced: boolean;
  recommendation?: string;
}
