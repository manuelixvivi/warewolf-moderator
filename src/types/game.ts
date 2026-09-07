// ============================================================
// ASPIRE: WEREWOLF - Core Type Definitions
// "One Village. Many Lies. One Wolf."
// ============================================================

export type Phase =
  | "HOME"
  | "CREATE_ROOM"
  | "JOIN_ROOM"
  | "LOBBY"
  | "CARD_REVEAL"
  | "NIGHT"
  | "DAY_NARRATIVE"
  | "DAY_VOTING"
  | "GAME_OVER";

export type Team = string;
export type Category = string;
export type SeerResult = "Werewolf" | "Villager" | "Dynamic" | string;

export interface RoleData {
  role_id: string;
  source_name: string;
  canonical_name: string;
  entity_type: string;
  category: Category;
  team: Team;
  seer_result: SeerResult;
  description_en: string;
  role_points: number;
  balance_weight: number;
  active_phase: string;
  action_type: string;
  trigger: string;
  target_type: string;
  usage_limit: string;
  information_level: string;
  night_priority: number;
  can_change_role: boolean;
  reveal_on_death: string;
  requires_engine_resolution: boolean;
  tooltip_en: string;
  description_id?: string;
  tooltip_id?: string;
}

export interface SelectedRole {
  role_id: string;
  canonical_name: string;
  count: number;
}

export interface RoomInfo {
  code: string;
  hostId: string;
  hostName: string;
  targetPlayerCount: number;
  gameName: string;
  storyTheme: string;
  narrationStyle: string;
  selectedRoles: SelectedRole[];
  voiceEnabled: boolean;
  gameMode?: "MODE_1_FIXED" | "MODE_2_POOL" | "MODE_3_RANDOM" | "MODERATOR_HELPER";
}

export interface Player {
  id: string;
  name: string;
  isHost: boolean;
  isReady: boolean;
  // Role info (assigned when game starts)
  role_id?: string;
  canonical_name?: string;
  team?: Team;
  category?: Category;
  seer_result?: SeerResult;
  description_id?: string;
  description_en?: string;
  tooltip_en?: string;
  tooltip_id?: string;
  active_phase?: string;
  action_type?: string;
  target_type?: string;
  usage_limit?: string;
  night_priority?: number;
  can_change_role?: boolean;
  // In-game state
  alive: boolean;
  protected: boolean;
  silenced: boolean;
  inCult: boolean;
  hasUsedAbility: boolean;
  votedForId?: string | null;
  nightTargetId?: string | null;
}

export interface NightAction {
  id: string;
  role_id: string;
  role_name: string;
  player_ids: string[];
  action_type: string;
  target_player_id: string | null;
  target2_player_id?: string | null;
  completed: boolean;
  priority: number;
  result?: string;
}

export interface NightResult {
  killed: string[];
  protected: string[];
  investigated: Array<{ investigator: string; target: string; result: SeerResult }>;
  conversions: Array<{ player: string; newTeam: Team }>;
  silenced: string[];
  triggered: TriggeredAction[];
  narrative: string;
}

export interface TriggeredAction {
  type: string;
  player_id: string;
  role_name: string;
  completed: boolean;
  target_player_id?: string | null;
}

export interface LogEntry {
  day: number;
  phase: "NIGHT" | "DAY";
  type: "narrative" | "action" | "elimination" | "system";
  text: string;
  timestamp: number;
}

export interface WinResult {
  winner: string | null;
  reason: string;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  channel: "DAY_PUBLIC" | "WOLF_SECRET" | "LOBBY" | "SYSTEM";
  text: string;
  timestamp: number;
  isDead?: boolean;
}

export interface NetworkMessage {
  type:
    | "SYNC_STATE"
    | "JOIN_ROOM"
    | "REQUEST_SYNC"
    | "PLAYER_LEFT"
    | "TOGGLE_READY"
    | "START_GAME"
    | "ASSIGN_PRIVATE_ROLE"
    | "SUBMIT_NIGHT_ACTION"
    | "SUBMIT_VOTE"
    | "TRIGGERED_ACTION"
    | "RESTART_GAME"
    | "SEND_CHAT";
  senderId: string;
  senderName?: string;
  recipientId?: string;
  payload?: any;
}

export interface GameState {
  mode: "MULTIPLAYER" | "PASS_AND_PLAY";
  phase: Phase;
  room: RoomInfo | null;
  myPlayerId: string;
  myPlayerName: string;
  players: Player[];
  dayCount: number;
  nightCount: number;
  nightActions: NightAction[];
  triggeredActions: TriggeredAction[];
  activeTriggeredAction: TriggeredAction | null;
  lastNightResult: NightResult | null;
  currentNarrative: string;
  gameLog: LogEntry[];
  winResult: WinResult | null;
  votes: Record<string, string>; // voterPlayerId -> targetPlayerId
  seerResultHistory: Record<string, { targetName: string; result: string }>;
  chatMessages: ChatMessage[];
  timeoutCount: number;
}