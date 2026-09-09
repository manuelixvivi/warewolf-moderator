// ============================================================
// ASPIRE: WEREWOLF — Formal Contract Pack v1.0
// Single Source of Truth for Enterprise Server-Authoritative Architecture
// "Client requests action. Server resolves truth. Engine produces facts. AI crafts the lore."
// ============================================================

// ------------------------------------------------------------
// 01. GAME STATE CONTRACT
// ------------------------------------------------------------
export type GamePhase =
  | "LOBBY"
  | "ASSIGNING_ROLES"
  | "NIGHT_ACTIVE"
  | "NIGHT_RESOLVING"
  | "DAY_NARRATIVE"
  | "DAY_DISCUSSION"
  | "DAY_VOTING"
  | "DAY_RESOLVING"
  | "GAME_OVER";

export type GameMode =
  | "MODE_1_FIXED"
  | "MODE_2_POOL"
  | "MODE_3_RANDOM"
  | "MODERATOR_HELPER";

export type FactionAlignment =
  | "Village"
  | "Werewolf"
  | "Solo Werewolf"
  | "Werewolf-aligned"
  | "Neutral"
  | "Solo"
  | "Vampire"
  | "Dynamic"
  | "Special";

export interface CanonicalPlayer {
  id: string;
  name: string;
  isHost: boolean;
  connected: boolean;
  alive: boolean;
  
  // Secret Role Identity (Restricted by Fog-of-War)
  role_id: string;
  canonical_name: string;
  team: FactionAlignment;
  originalTeam?: FactionAlignment;
  
  // Dynamic Game State Flags
  protected: boolean;
  silenced: boolean;
  inCult: boolean;
  hasUsedAbility: boolean;
  isZombie?: boolean;
  isHypnotized?: boolean;
  isDrunkRevealed?: boolean;
  delayedDeathNight?: number | null;
  tannerWon?: boolean;
  
  // Cross-Role Relational Bindings
  linkedPartnerIds?: string[]; // Cupid (ROLE-030)
  markedTargetIds?: string[];  // Hoodlum (ROLE-036)
  companionId?: string;        // Dire Wolf (ROLE-060)
  fearTargetId?: string;       // Virginia Woolf (ROLE-063)
  predictedTeam?: string;      // Nostradamus (ROLE-080)
}

export interface CanonicalGameState {
  roomId: string;
  gameMode: GameMode;
  phase: GamePhase;
  dayCount: number;
  nightCount: number;
  sequenceNumber: number; // Monotonic event tick
  timeoutCount: number;
  players: CanonicalPlayer[];
  votes: Record<string, string>; // voterId -> targetId
  nightActions: CanonicalNightAction[];
  pendingRetaliations: CanonicalRetaliation[];
  activeWinResult: CanonicalWinResult | null;
  createdAt: number;
  updatedAt: number;
}

// ------------------------------------------------------------
// 02. COMMAND CONTRACT (Client Intent -> Server)
// ------------------------------------------------------------
export type CommandType =
  | "JOIN_ROOM"
  | "TOGGLE_READY"
  | "START_GAME"
  | "SUBMIT_NIGHT_ACTION"
  | "WEREWOLF_PACK_VOTE"
  | "SEER_CHECK"
  | "CAST_VOTE"
  | "START_DAY_VOTING"
  | "RESOLVE_NIGHT"
  | "RESOLVE_DAY_VOTES"
  | "RESTART_GAME"
  | "SEND_CHAT"
  | "REQUEST_SYNC"
  | "RECONNECT"
  | "UPDATE_ROOM_CONFIG";

export interface SelectedRole {
  role_id: string;
  canonical_name: string;
  count: number;
}

export interface UpdateRoomConfigCommandPayload {
  gameMode?: GameMode;
  targetPlayerCount?: number;
  selectedRoles?: SelectedRole[];
  selectedRolePool?: string[];
}

export interface RoomConfigUpdatedPayload {
  gameMode?: GameMode;
  targetPlayerCount?: number;
  selectedRoles?: SelectedRole[];
  selectedRolePool?: string[];
}

export interface BaseCommand<T = any> {
  commandId: string;
  roomId: string;
  senderId: string;
  sessionToken: string; // JWT signed by server
  type: CommandType;
  payload: T;
  clientTimestamp: number;
}

export interface SubmitNightActionCommandPayload {
  actionId: string;
  targetPlayerId: string | null;
  secondaryTargetId?: string | null;
}

export interface WerewolfPackVoteCommandPayload {
  targetPlayerId: string;
}

export interface SeerCheckCommandPayload {
  targetPlayerId: string;
}

export interface CastVoteCommandPayload {
  targetPlayerId: string; // Player ID or "SKIP"
}

// ------------------------------------------------------------
// 03. EVENT CONTRACT (Immutable Append-Only Log)
// ------------------------------------------------------------
export type GameEventType =
  | "ROOM_INITIALIZED"
  | "PLAYER_JOINED"
  | "PLAYER_READY_CHANGED"
  | "PLAYER_DISCONNECTED"
  | "PLAYER_RECONNECTED"
  | "ROOM_CONFIG_UPDATED"
  | "GAME_STARTED"
  | "ROLES_ASSIGNED"
  | "PHASE_TRANSITIONED"
  | "NIGHT_ACTION_SUBMITTED"
  | "PACK_VOTE_STARTED"
  | "PACK_VOTE_UPDATED"
  | "PACK_REVOTE_STARTED"
  | "PACK_VOTE_CLOSED"
  | "PACK_TARGET_RESOLVED"
  | "SEER_WINDOW_STARTED"
  | "SEER_CHECK_RESOLVED"
  | "NIGHT_RESOLVED"
  | "DEATH_CASCADE_TRIGGERED"
  | "ROLE_TRANSFORMED"
  | "VOTE_CAST"
  | "VOTE_RESOLVED"
  | "TIMEOUT_OCCURRED"
  | "PLAYER_DISCONNECT_TIMEOUT"
  | "WIN_CONDITION_SATISFIED"
  | "MATCH_RESTARTED"
  | "NARRATIVE_LORE_EMITTED";

export interface PackVoteStartedPayload {
  startedAt: number;
  expiresAt: number;
  isRevote: boolean;
  allowedTargets?: string[];
}

export interface PackVoteUpdatedPayload {
  voterPlayerId: string;
  targetPlayerId: string;
  votes: Record<string, string>;
}

export interface PackRevoteStartedPayload {
  startedAt: number;
  expiresAt: number;
  allowedTargets: string[];
}

export interface PackVoteClosedPayload {
  tally: Record<string, number>;
  resolvedTargetId: string | null;
}

export interface PackTargetResolvedPayload {
  targetPlayerId: string | null;
  isTieBreakFailure?: boolean;
}

export interface SeerWindowStartedPayload {
  startedAt: number;
  expiresAt: number;
  seerPlayerId: string;
}

export interface SeerCheckResolvedPayload {
  seerPlayerId: string;
  targetPlayerId: string;
  result: "Werewolf" | "Villager";
}

export interface MatchRestartedPayload {
  phase: "LOBBY";
  dayCount: number;
  nightCount: number;
  resetPlayers: Array<{
    playerId: string;
    alive: boolean;
    isReady: boolean;
    silenced: boolean;
    protected: boolean;
    inCult: boolean;
    hasUsedAbility: boolean;
  }>;
}

export interface PlayerReadyChangedPayload {
  playerId: string;
  isReady: boolean;
}

export interface PlayerDisconnectTimeoutPayload {
  playerId: string;
  phase: CanonicalGameState["phase"];
  reason: string;
}

export interface GameEvent<T = any> {
  eventId: string;          // UUIDv7 (Time-ordered)
  roomId: string;
  sequence: number;         // Sequential tick (0, 1, 2, ...)
  timestamp: number;
  type: GameEventType;
  actorId?: string;
  payload: T;
  serverSignature: string;  // HMAC-SHA256 generated strictly on server
}

// ------------------------------------------------------------
// 04. ROLE CONTRACT (Canonical 75-Role Matrix)
// ------------------------------------------------------------
export interface RoleContractDefinition {
  role_id: string;
  source_name: string;
  canonical_name: string;
  entity_type: "Role";
  category: "Village" | "Werewolf" | "Neutral" | "Special" | "Timer" | "Independent";
  team: FactionAlignment;
  seer_result: "Werewolf" | "Villager";
  role_points: number;
  balance_weight: number;
  active_phase: "Night" | "Day" | "Triggered" | "Passive" | "First Night";
  action_type: string;
  trigger: string;
  target_type: string;
  usage_limit: string;
  information_level: "Public" | "Private" | "Secret";
  night_priority: number;
  can_change_role: boolean;
  reveal_on_death: "Yes" | "No";
  requires_engine_resolution: boolean;
  description_id: string;
  tooltip_id: string;
}

// ------------------------------------------------------------
// 05. ACTION CONTRACT (Execution & Priority Resolution)
// ------------------------------------------------------------
export interface CanonicalNightAction {
  id: string;
  role_id: string;
  role_name: string;
  player_ids: string[];
  action_type: string;
  target_player_id: string | null;
  secondary_target_id?: string | null;
  priority: number; // Low number executes first (e.g., 10 Witch Save, 50 Werewolf Attack)
  completed: boolean;
}

export interface CanonicalNightResolutionOutcome {
  killedPlayerIds: string[];
  savedPlayerIds: string[];
  investigations: Array<{
    actorId: string;
    targetId: string;
    result: string;
    description: string;
  }>;
  silencedPlayerIds: string[];
  convertedPlayerIds: Array<{
    playerId: string;
    oldTeam: string;
    newTeam: string;
  }>;
  redirectedActions: Array<{
    fromTargetId: string;
    toTargetId: string;
    roleName: string;
  }>;
  triggeredActions: Array<{
    type: string;
    playerId: string;
    roleName: string;
    description: string;
  }>;
  deathEvents: Array<{
    playerId: string;
    victimRole: string;
    reason: string;
    killedByRole?: string;
  }>;
  wolfCubExtraKillTriggered: boolean;
  wolvesSkippingNextKill: boolean;
}

// ------------------------------------------------------------
// 06. DEATH CONTRACT (Cascades, Heartbreak & Retaliation)
// ------------------------------------------------------------
export type DeathCause =
  | "WEREWOLF_ATTACK"
  | "VOTE"
  | "POISON"
  | "HUNTER_RETALIATION"
  | "DR_BOOM_BLAST"
  | "WOLVERINE_RETALIATION"
  | "MAD_BOMBER_BLAST"
  | "CUPID_HEARTBREAK"
  | "DIRE_WOLF_GRIEF"
  | "VIRGINIA_WOOLF_FEAR"
  | "OLD_MAN_OLD_AGE"
  | "TOUGH_GUY_DELAYED"
  | "THE_BLOB_ABSORPTION"
  | "CHUPACABRA_ATTACK"
  | "UNKNOWN";

export interface CanonicalRetaliation {
  type: "HUNTER" | "DR_BOOM" | "WOLVERINE" | "MAD_BOMBER";
  playerId: string;
  roleName: string;
  validTargetIds?: string[];
  completed: boolean;
}

export interface CanonicalDeathResolutionResult {
  updatedPlayers: CanonicalPlayer[];
  pendingRetaliations: CanonicalRetaliation[];
  cascadeDeaths: Array<{
    victimId: string;
    roleName: string;
    cause: DeathCause;
  }>;
  tannerWon: boolean;
  wolfCubDied: boolean;
  diseasedInfectedWolves: boolean;
}

// ------------------------------------------------------------
// 07. VOTE CONTRACT (Daytime Lynch & Modifiers)
// ------------------------------------------------------------
export interface CanonicalVoteOutcome {
  tally: Record<string, number>;
  topTargetId: string | null;
  isTie: boolean;
  eliminatedPlayer: CanonicalPlayer | null;
  princeSurvived: boolean;
  tannerWon: boolean;
  martyrReplacedPlayerId?: string;
  dayTimerReduced: boolean; // Time Bandit (ROLE-019)
  triggeredRetaliations: CanonicalRetaliation[];
}

// ------------------------------------------------------------
// 08. WIN CONTRACT (Faction & Solo Win Conditions)
// ------------------------------------------------------------
export interface CanonicalWinResult {
  winner: string; // e.g., "Village", "Werewolf", "Tanner", "Cult Leader"
  reason: string;
  winningPlayerIds?: string[];
  winningTeams?: string[];
}

// ------------------------------------------------------------
// 09. TRANSFORMATION CONTRACT (Role Mutation Protocol)
// ------------------------------------------------------------
export interface CanonicalRoleTransformationResult {
  player: CanonicalPlayer;
  previousRoleId: string;
  newRoleId: string;
  reason: string;
}

// ------------------------------------------------------------
// 10. INFORMATION / FOG-OF-WAR CONTRACT
// ------------------------------------------------------------
export interface SanitizedPublicPlayer {
  id: string;
  name: string;
  isHost: boolean;
  isReady?: boolean;
  alive: boolean;
  silenced: boolean;
  // Zero role_id, team, or abilities leaked to public during active game
  role_id?: string;
  canonical_name?: string;
  team?: FactionAlignment;
}

export interface SanitizedPublicGameState {
  roomId: string;
  gameMode: GameMode;
  phase: GamePhase;
  dayCount: number;
  nightCount: number;
  sequenceNumber: number;
  players: SanitizedPublicPlayer[];
  currentNarrative: string;
  winResult: CanonicalWinResult | null;
  targetPlayerCount?: number;
  selectedRoles?: SelectedRole[];
  selectedRolePool?: string[];
  votes?: Record<string, string>; // Revealed only during/after voting
  nightActionProgress?: {
    totalEligible: number;
    completedCount: number;
  };
  packVoteProgress?: {
    startedAt: number;
    expiresAt: number;
    isRevote: boolean;
    isClosed: boolean;
  };
  publicNightResult?: {
    killed: string[];
    protected: string[];
    silenced: string[];
  } | null;
}

export interface SanitizedPrivatePlayerState {
  playerId: string;
  role_id: string;
  canonical_name: string;
  team: FactionAlignment;
  abilities: string[];
  night_priority: number;
  seer_result: "Werewolf" | "Villager";
  fellowTeamMembers?: Array<{ id: string; name: string; role: string }>; // Wolf pack or Masons
  privilegedKnowledge?: Record<string, any>; // Doppelganger target, Seer history
  packVotes?: Record<string, string>; // Wolf pack votes: voterId -> targetPlayerId (visible strictly to alive wolves)
  packVoteWindow?: {
    startedAt: number;
    expiresAt: number;
    isRevote: boolean;
    allowedTargets?: string[];
  };
  seerWindow?: {
    startedAt: number;
    expiresAt: number;
    checked: boolean;
    result?: "Werewolf" | "Villager";
    targetPlayerId?: string;
  };
}

// ------------------------------------------------------------
// 11. RECONNECTION CONTRACT (State Catch-up Protocol)
// ------------------------------------------------------------
export interface ReconnectRequestPayload {
  roomId: string;
  playerId: string;
  sessionToken: string;
  lastKnownSequence: number;
}

export interface ReconnectSyncResponse {
  publicState: SanitizedPublicGameState;
  privateState: SanitizedPrivatePlayerState;
  missedEvents: GameEvent[]; // Replay delta from lastKnownSequence + 1 to current
  serverTimestamp: number;
}

// ------------------------------------------------------------
// 12. AI NARRATIVE CONTRACT (Facts-In / Lore-Out)
// ------------------------------------------------------------
export interface StoryFactsPayload {
  roomId: string;
  dayNumber: number;
  nightNumber: number;
  phase: "NIGHT_SUMMARY" | "DAY_LYNCH_SUMMARY";
  theme: string;
  eliminatedVictims: Array<{
    name: string;
    publicCause: string;
    roleRevealed: boolean;
    revealedRoleName?: string;
  }>;
  sparedVictims: Array<{
    name: string;
    reason: "BODYGUARD_PROTECTED" | "WITCH_HEALED" | "TOUGH_GUY_ENDURED";
  }>;
  publicEvents: string[];
}

export interface StoryProseResponse {
  markdownStory: string;
  audioVoiceHint?: string;
  generatedAt: number;
  modelUsed: string;
  isFallbackTemplate: boolean;
}
