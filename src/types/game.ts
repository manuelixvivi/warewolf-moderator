export type Phase = "SETUP" | "NAME_INPUT" | "NIGHT" | "DAY" | "GAME_OVER";
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
}

export interface SelectedRole {
  role_id: string;
  canonical_name: string;
  count: number;
}

export interface GameConfig {
  gameName: string;
  storyTheme: string;
  narrationStyle: string;
  selectedRoles: SelectedRole[];
}

export interface Player {
  id: string;
  name: string;
  role_id: string;
  canonical_name: string;
  team: Team;
  category: Category;
  seer_result: SeerResult;
  alive: boolean;
  protected: boolean;
  silenced: boolean;
  inCult: boolean;
  hasUsedAbility: boolean;
  active_phase: string;
  action_type: string;
  target_type: string;
  usage_limit: string;
  night_priority: number;
  can_change_role: boolean;
  tooltip_en: string;
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

export interface GameState {
  phase: Phase;
  dayCount: number;
  nightCount: number;
  config: GameConfig;
  players: Player[];
  nightActions: NightAction[];
  triggeredActions: TriggeredAction[];
  activeTriggeredAction: TriggeredAction | null;
  lastNightResult: NightResult | null;
  currentNarrative: string;
  gameLog: LogEntry[];
  winResult: WinResult | null;
}