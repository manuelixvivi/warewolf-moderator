// ============================================================
// ASPIRE: WEREWOLF — Authoritative Server Internal Types
// Bridges Canonical Contracts to Fastify/WebSocket Runtime
// ============================================================

import { WebSocket } from "ws";
import {
  CanonicalGameState,
  CanonicalPlayer,
  GameEvent,
  BaseCommand,
  SanitizedPublicGameState,
  SanitizedPrivatePlayerState,
  CanonicalWinResult,
  SelectedRole,
} from "../src/contracts";
import { PlayerEngineState, EngineNightAction } from "../src/lib/engine/types";

export interface ConnectedClient {
  socketId: string;
  socket: WebSocket;
  playerId: string;
  roomId: string;
  isAlive: boolean;
  lastPingAt: number;
}

export interface AuthoritativeRoomState {
  roomId: string;
  hostPlayerId: string;
  gameMode: "MODE_1_FIXED" | "MODE_2_POOL" | "MODE_3_RANDOM" | "MODERATOR_HELPER";
  phase: CanonicalGameState["phase"];
  dayCount: number;
  nightCount: number;
  sequenceNumber: number;
  timeoutCount: number;
  players: PlayerEngineState[]; // Internal authoritative players (with full secret attributes)
  votes: Record<string, string>; // voterId -> targetId
  nightActions: EngineNightAction[];
  eventLog: GameEvent[]; // In-memory append-only event store
  clients: Map<string, ConnectedClient>; // playerId -> ConnectedClient
  disconnectTimers: Map<string, NodeJS.Timeout>; // playerId -> grace period timer
  activeWinResult?: CanonicalWinResult | null;
  lastNightResult?: {
    killed: string[];
    protected: string[];
    silenced: string[];
  } | null;
  targetPlayerCount?: number;
  selectedRoles?: SelectedRole[];
  selectedRolePool?: string[]; // For Mode 2 pool
  fixedRoles?: string[]; // For Mode 1
  packVotes?: Record<string, string>; // wolfPlayerId -> targetPlayerId
  packVoteWindow?: {
    startedAt: number;
    expiresAt: number;
    isRevote: boolean;
    allowedTargets?: string[];
    eligibleWolfIds: string[];
    timer?: NodeJS.Timeout;
  };
  seerActionState?: {
    startedAt: number;
    expiresAt: number;
    checked: boolean;
    targetPlayerId?: string;
    result?: "Werewolf" | "Villager";
    timer?: NodeJS.Timeout;
  };
  processedCommandIds?: Set<string>; // Idempotency tracking: prevents duplicate execution of retransmitted commands
  createdAt: number;
  updatedAt: number;
}

export interface SessionTokenPayload {
  playerId: string;
  playerName: string;
  roomId: string;
  isHost: boolean;
  issuedAt: number;
}

export interface CommandValidationResult<T = any> {
  isValid: boolean;
  error?: string;
  errorCode?:
    | "AUTH_FAILED"
    | "INVALID_SCHEMA"
    | "INVALID_PHASE"
    | "PLAYER_DEAD"
    | "NOT_PERMITTED"
    | "DUPLICATE_COMMAND"
    | "INVALID_TARGET"
    | "INVALID_ROLE_COMPOSITION"
    | "ACTION_EXPIRED"
    | "ALREADY_CHECKED";
  isDuplicate?: boolean;
  command?: BaseCommand<T>;
  player?: PlayerEngineState;
}
