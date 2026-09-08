// ============================================================
// ASPIRE: WEREWOLF — Command Dispatcher & Runtime Validation Pipeline
// Validates schema, authentication, authorization, and game phase
// before delegating to the Golden Engine.
// ============================================================

import {
  BaseCommand,
  CommandType,
  SubmitNightActionCommandPayload,
  CastVoteCommandPayload,
  ReconnectRequestPayload,
} from "../../src/contracts";
import { CommandValidationResult, AuthoritativeRoomState } from "../types";
import { SessionManager } from "../auth/sessionManager";
import { RoomManager } from "../rooms/roomManager";
import { FogOfWarDispatcher } from "./fogOfWarDispatcher";

export class CommandDispatcher {
  /**
   * Validates an incoming client command through the multi-tier security pipeline.
   */
  public static validateCommand<T = any>(
    rawMessage: string,
    room: AuthoritativeRoomState | undefined
  ): CommandValidationResult<T> {
    // Tier 1: Schema & JSON Parsing Validation
    let parsed: any;
    try {
      parsed = JSON.parse(rawMessage);
    } catch {
      return {
        isValid: false,
        error: "Malformed frame: Payload must be valid JSON.",
        errorCode: "INVALID_SCHEMA",
      };
    }

    if (!parsed || typeof parsed !== "object") {
      return {
        isValid: false,
        error: "Invalid frame: Command root must be an object.",
        errorCode: "INVALID_SCHEMA",
      };
    }

    const command = parsed as BaseCommand<T>;
    if (
      !command.commandId ||
      !command.roomId ||
      !command.senderId ||
      !command.type ||
      !command.sessionToken
    ) {
      return {
        isValid: false,
        error: "Invalid schema: Missing required BaseCommand fields (commandId, roomId, senderId, type, sessionToken).",
        errorCode: "INVALID_SCHEMA",
      };
    }

    // Tier 2: Authentication (Cryptographic JWT Token Check)
    const tokenPayload = SessionManager.verifySessionToken(command.sessionToken);
    if (!tokenPayload) {
      return {
        isValid: false,
        error: "Authentication failed: Invalid or expired sessionToken.",
        errorCode: "AUTH_FAILED",
      };
    }

    // Tier 3: Authorization (Sender & Room Matching)
    if (tokenPayload.playerId !== command.senderId) {
      return {
        isValid: false,
        error: "Authorization failed: senderId does not match authenticated token identity.",
        errorCode: "NOT_PERMITTED",
      };
    }

    if (tokenPayload.roomId !== command.roomId) {
      return {
        isValid: false,
        error: "Authorization failed: roomId does not match authenticated token room.",
        errorCode: "NOT_PERMITTED",
      };
    }

    if (!room) {
      return {
        isValid: false,
        error: `Room ${command.roomId} not found.`,
        errorCode: "NOT_PERMITTED",
      };
    }

    const player = room.players.find((p) => p.id === command.senderId);
    if (!player) {
      return {
        isValid: false,
        error: `Player ${command.senderId} is not a member of room ${command.roomId}.`,
        errorCode: "NOT_PERMITTED",
      };
    }

    // Tier 4: Idempotency Check (Duplicate command retransmission deduplication)
    if (room.processedCommandIds && room.processedCommandIds.has(command.commandId)) {
      return {
        isValid: false,
        error: `Duplicate command: commandId ${command.commandId} has already been processed.`,
        errorCode: "DUPLICATE_COMMAND",
        isDuplicate: true,
        command,
        player,
      };
    }

    // Tier 5: Phase & Status Validation for In-Game Commands
    if (command.type === "SUBMIT_NIGHT_ACTION") {
      if (room.phase !== "NIGHT_ACTIVE") {
        return {
          isValid: false,
          error: `Cannot submit night action: Room phase is ${room.phase}, expected NIGHT_ACTIVE.`,
          errorCode: "INVALID_PHASE",
        };
      }
      if (!player.alive) {
        return {
          isValid: false,
          error: "Dead players cannot submit night actions.",
          errorCode: "PLAYER_DEAD",
        };
      }
    }

    if (command.type === "CAST_VOTE") {
      if (room.phase !== "DAY_VOTING") {
        return {
          isValid: false,
          error: `Cannot cast vote: Room phase is ${room.phase}, expected DAY_VOTING.`,
          errorCode: "INVALID_PHASE",
        };
      }
      if (!player.alive) {
        return {
          isValid: false,
          error: "Dead players cannot vote.",
          errorCode: "PLAYER_DEAD",
        };
      }
      if (player.silenced) {
        return {
          isValid: false,
          error: "Silenced players cannot cast votes.",
          errorCode: "NOT_PERMITTED",
        };
      }
    }

    return {
      isValid: true,
      command,
      player,
    };
  }

  /**
   * Executes a validated command and dispatches state updates.
   */
  public static handleCommand(rawMessage: string): {
    success: boolean;
    error?: string;
    errorCode?: string;
    isDuplicate?: boolean;
  } {
    let rawParsed: any;
    try {
      rawParsed = JSON.parse(rawMessage);
    } catch {
      return { success: false, error: "Invalid JSON", errorCode: "INVALID_SCHEMA" };
    }

    const roomId = rawParsed?.roomId;
    const room = roomId ? RoomManager.getRoom(roomId) : undefined;

    const validation = this.validateCommand(rawMessage, room);
    if (validation.isDuplicate) {
      // Idempotency guarantee: command was already successfully processed.
      // Acknowledge without re-executing state mutation or emitting duplicate events.
      return { success: true, isDuplicate: true };
    }

    if (!validation.isValid || !validation.command || !room) {
      return { success: false, error: validation.error, errorCode: validation.errorCode };
    }

    const { command } = validation;

    try {
      switch (command.type) {
        case "TOGGLE_READY": {
          RoomManager.toggleReady(command.roomId, command.senderId);
          break;
        }

        case "START_GAME": {
          RoomManager.startGame(command.roomId, command.senderId, command.payload);
          break;
        }

        case "SUBMIT_NIGHT_ACTION": {
          const payload = command.payload as SubmitNightActionCommandPayload;
          RoomManager.submitNightAction(
            command.roomId,
            command.senderId,
            payload.actionId,
            payload.targetPlayerId,
            payload.secondaryTargetId
          );
          break;
        }

        case "CAST_VOTE": {
          const payload = command.payload as CastVoteCommandPayload;
          RoomManager.submitVote(
            command.roomId,
            command.senderId,
            payload.targetPlayerId
          );
          break;
        }

        default:
          return { success: false, error: `Unsupported command type: ${command.type}`, errorCode: "INVALID_SCHEMA" };
      }

      // Idempotency: Register commandId as successfully processed
      if (!room.processedCommandIds) {
        room.processedCommandIds = new Set<string>();
      }
      room.processedCommandIds.add(command.commandId);

      // After state mutation, dispatch synchronized Fog-of-War updates
      FogOfWarDispatcher.dispatchRoomSync(room);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
