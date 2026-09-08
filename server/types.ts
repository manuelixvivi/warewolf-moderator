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
  selectedRolePool?: string[]; // For Mode 2 pool
  fixedRoles?: string[]; // For Mode 1
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
  errorCode?: "AUTH_FAILED" | "INVALID_SCHEMA" | "INVALID_PHASE" | "PLAYER_DEAD" | "NOT_PERMITTED";
  command?: BaseCommand<T>;
  player?: PlayerEngineState;
}
