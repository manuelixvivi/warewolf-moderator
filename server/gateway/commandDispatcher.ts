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
import { defaultEventStore, CommandRecord } from "../persistence";

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
      !command.type
    ) {
      return {
        isValid: false,
        error: "Invalid schema: Missing required BaseCommand fields (commandId, roomId, senderId, type).",
        errorCode: "INVALID_SCHEMA",
      };
    }

    // For in-room commands, sessionToken is mandatory.
    if (command.type !== "JOIN_ROOM" && !command.sessionToken) {
      return {
        isValid: false,
        error: "Invalid schema: Missing required BaseCommand fields (commandId, roomId, senderId, type, sessionToken).",
        errorCode: "INVALID_SCHEMA",
      };
    }

    // Tier 2: Authentication (Cryptographic JWT Token Check if provided)
    if (command.sessionToken) {
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
    }

    if (!room) {
      return {
        isValid: false,
        error: `Room ${command.roomId} not found.`,
        errorCode: "NOT_PERMITTED",
      };
    }

    // Special authorization path: JOIN_ROOM
    // Allows new players who are not yet members of the room to join
    if (command.type === "JOIN_ROOM") {
      if (room.phase !== "LOBBY") {
        return {
          isValid: false,
          error: `Cannot join room: Room ${command.roomId} is in phase ${room.phase}, expected LOBBY.`,
          errorCode: "INVALID_PHASE",
        };
      }

      if (room.players.length >= 16) {
        return {
          isValid: false,
          error: `Cannot join room: Room ${command.roomId} is full (max 16 players).`,
          errorCode: "NOT_PERMITTED",
        };
      }

      if (room.processedCommandIds && room.processedCommandIds.has(command.commandId)) {
        return {
          isValid: false,
          error: `Duplicate command: commandId ${command.commandId} has already been processed.`,
          errorCode: "DUPLICATE_COMMAND",
          isDuplicate: true,
          command,
        };
      }

      return {
        isValid: true,
        command,
      };
    }

    // For all other command types: player MUST already be a member of the room!
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
   * STRICT PERSISTENCE INVARIANT:
   * Awaits database persistence before confirming state mutation and dispatching to clients.
   * Persistent idempotency store ensures duplicate commands are rejected even after server restart.
   */
  public static async handleCommand(rawMessage: string): Promise<{
    success: boolean;
    error?: string;
    errorCode?: string;
    isDuplicate?: boolean;
    sessionToken?: string;
  }> {
    let rawParsed: any;
    try {
      rawParsed = JSON.parse(rawMessage);
    } catch {
      return { success: false, error: "Invalid JSON", errorCode: "INVALID_SCHEMA" };
    }

    const roomId = rawParsed?.roomId;
    if (!roomId || typeof roomId !== "string") {
      return { success: false, error: "Missing or invalid roomId", errorCode: "INVALID_SCHEMA" };
    }

    // STRICT FIFO PER-ROOM SERIALIZATION:
    // All command validation, sequence generation, persistence, and state mutation
    // are serialized per room to eliminate concurrent sequence collisions and race conditions.
    return await RoomManager.enqueueRoomOperation(roomId, async () => {
      const room = RoomManager.getRoom(roomId);

      const validation = this.validateCommand(rawMessage, room);
      if (validation.isDuplicate) {
        // Fast-path in-memory idempotency check
        return { success: true, isDuplicate: true };
      }

      if (!validation.isValid || !validation.command || !room) {
        return { success: false, error: validation.error, errorCode: validation.errorCode };
      }

      const { command } = validation;

      // Crash-safe persistent idempotency check
      const isPersistentDuplicate = await defaultEventStore.isCommandProcessed(command.roomId, command.commandId);
      if (isPersistentDuplicate) {
        if (!room.processedCommandIds) room.processedCommandIds = new Set();
        room.processedCommandIds.add(command.commandId);
        return { success: true, isDuplicate: true };
      }

      const commandContext: CommandRecord = {
        commandId: command.commandId,
        roomId: command.roomId,
        senderId: command.senderId,
        commandType: command.type,
        processedAt: Date.now(),
      };

      try {
        switch (command.type) {
          case "JOIN_ROOM": {
            const { playerName } = command.payload || {};
            const joinResult = await RoomManager.joinRoom(
              command.roomId,
              command.senderId,
              playerName || "Player",
              commandContext
            );
            FogOfWarDispatcher.dispatchRoomSync(joinResult.room);
            return {
              success: true,
              sessionToken: joinResult.sessionToken,
            };
          }

          case "TOGGLE_READY": {
            await RoomManager.toggleReady(command.roomId, command.senderId, commandContext);
            break;
          }

          case "START_GAME": {
            await RoomManager.startGame(command.roomId, command.senderId, command.payload, commandContext);
            break;
          }

          case "SUBMIT_NIGHT_ACTION": {
            const payload = command.payload as SubmitNightActionCommandPayload;
            await RoomManager.submitNightAction(
              command.roomId,
              command.senderId,
              payload.actionId,
              payload.targetPlayerId,
              payload.secondaryTargetId,
              commandContext
            );
            break;
          }

          case "CAST_VOTE": {
            const payload = command.payload as CastVoteCommandPayload;
            await RoomManager.submitVote(
              command.roomId,
              command.senderId,
              payload.targetPlayerId,
              commandContext
            );
            break;
          }

          default:
            return { success: false, error: `Unsupported command type: ${command.type}`, errorCode: "INVALID_SCHEMA" };
        }

        // After state mutation, dispatch synchronized Fog-of-War updates
        FogOfWarDispatcher.dispatchRoomSync(room);
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    });
  }
}
