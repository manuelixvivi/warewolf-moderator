// ============================================================
// ASPIRE: WEREWOLF — Command Dispatcher & Runtime Validation Pipeline
// Validates schema, authentication, authorization, and game phase
// before delegating to the Golden Engine.
// ============================================================

import {
  BaseCommand,
  CommandType,
  SubmitNightActionCommandPayload,
  WerewolfPackVoteCommandPayload,
  SeerCheckCommandPayload,
  CastVoteCommandPayload,
  ReconnectRequestPayload,
  UpdateRoomConfigCommandPayload,
} from "../../src/contracts";
import { CommandValidationResult, AuthoritativeRoomState } from "../types";
import { SessionManager } from "../auth/sessionManager";
import { RoomManager } from "../rooms/roomManager";
import { FogOfWarDispatcher } from "./fogOfWarDispatcher";
import { defaultEventStore, CommandRecord } from "../persistence";
import { validateAbilityTarget, ROLE_BY_ID, canAccessWolfChat, canParticipateInWerewolfPackVote } from "../../src/lib/engine/abilityRegistry";
import { validateMode2Pool } from "../../src/lib/engine/balanceEngine";
import { randomUUID } from "node:crypto";

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

    // All WSS commands require a sessionToken — JOIN_ROOM is handled over REST only.
    if (!command.sessionToken) {
      return {
        isValid: false,
        error: "Invalid schema: sessionToken is required for all WebSocket commands.",
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

    // JOIN_ROOM is intentionally blocked on WSS — use REST POST /api/rooms/:roomId/join instead.
    // WSS is gameplay-only; bootstrap/session establishment happens over REST.
    if (command.type === "JOIN_ROOM") {
      return {
        isValid: false,
        error: "JOIN_ROOM is not permitted over WebSocket. Use POST /api/rooms/:roomId/join.",
        errorCode: "NOT_PERMITTED",
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
    if (command.type === "START_GAME") {
      if (room.hostPlayerId !== command.senderId) {
        return { isValid: false, error: "Only the host can start the game.", errorCode: "NOT_PERMITTED" };
      }
      if (room.phase !== "LOBBY") {
        return { isValid: false, error: `Cannot start game from phase ${room.phase}, expected LOBBY.`, errorCode: "INVALID_PHASE" };
      }
      if (room.players.length < 5) {
        return { isValid: false, error: "Minimum 5 players required to start.", errorCode: "NOT_PERMITTED" };
      }
      const payload = command.payload as {
        fixedRoles?: Array<{ role_id: string; count: number }>;
        selectedRolePool?: string[];
      } | undefined;
      if (payload?.fixedRoles && payload.fixedRoles.length > 0) {
        for (const sel of payload.fixedRoles) {
          if (!Number.isInteger(sel.count) || sel.count <= 0) {
            return {
              isValid: false,
              error: `Invalid role count for ${sel.role_id}: must be a positive integer.`,
              errorCode: "INVALID_ROLE_COMPOSITION",
            };
          }
          if (!ROLE_BY_ID.has(sel.role_id)) {
            return {
              isValid: false,
              error: `Role definition not found for role_id: ${sel.role_id}.`,
              errorCode: "INVALID_ROLE_COMPOSITION",
            };
          }
        }
        const totalFixedCount = payload.fixedRoles.reduce((sum, sel) => sum + sel.count, 0);
        if (totalFixedCount !== room.players.length) {
          return {
            isValid: false,
            error: `Total fixed role count (${totalFixedCount}) must exactly match player count (${room.players.length}).`,
            errorCode: "INVALID_ROLE_COMPOSITION",
          };
        }
      }
      if (payload?.selectedRolePool && payload.selectedRolePool.length > 0) {
        for (const id of payload.selectedRolePool) {
          if (!ROLE_BY_ID.has(id)) {
            return {
              isValid: false,
              error: `Invalid role pool: unknown role ID ${id}.`,
              errorCode: "INVALID_SCHEMA",
            };
          }
        }
      }
    }

    if (command.type === "UPDATE_ROOM_CONFIG") {
      if (room.hostPlayerId !== command.senderId) {
        return { isValid: false, error: "Only the host can update room configuration.", errorCode: "NOT_PERMITTED" };
      }
      if (room.phase !== "LOBBY") {
        return { isValid: false, error: `Cannot update room configuration from phase ${room.phase}, expected LOBBY.`, errorCode: "INVALID_PHASE" };
      }
      const payload = command.payload as UpdateRoomConfigCommandPayload | undefined;
      if (!payload || typeof payload !== "object") {
        return { isValid: false, error: "Invalid schema: payload must be an object.", errorCode: "INVALID_SCHEMA" };
      }
      if (payload.targetPlayerCount !== undefined) {
        if (!Number.isInteger(payload.targetPlayerCount) || payload.targetPlayerCount < 5) {
          return { isValid: false, error: "targetPlayerCount must be an integer >= 5.", errorCode: "INVALID_SCHEMA" };
        }
        if (payload.targetPlayerCount < room.players.length) {
          return {
            isValid: false,
            error: `Jumlah pemain target (${payload.targetPlayerCount}) tidak boleh lebih kecil dari jumlah pemain yang sudah bergabung (${room.players.length}).`,
            errorCode: "NOT_PERMITTED",
          };
        }
      }
      if (payload.selectedRoles !== undefined) {
        if (!Array.isArray(payload.selectedRoles)) {
          return { isValid: false, error: "selectedRoles must be an array.", errorCode: "INVALID_SCHEMA" };
        }
        for (const sel of payload.selectedRoles) {
          if (!sel.role_id || !ROLE_BY_ID.has(sel.role_id)) {
            return { isValid: false, error: `Unknown role ID in selectedRoles: ${sel.role_id}`, errorCode: "INVALID_SCHEMA" };
          }
          if (!Number.isInteger(sel.count) || sel.count <= 0) {
            return { isValid: false, error: `Invalid role count for ${sel.role_id}: must be a positive integer.`, errorCode: "INVALID_ROLE_COMPOSITION" };
          }
        }
      }
      if (payload.selectedRolePool !== undefined) {
        if (!Array.isArray(payload.selectedRolePool) || payload.selectedRolePool.length === 0) {
          return { isValid: false, error: "selectedRolePool must be a non-empty array of role IDs.", errorCode: "INVALID_SCHEMA" };
        }
        const seen = new Set<string>();
        for (const id of payload.selectedRolePool) {
          if (!ROLE_BY_ID.has(id)) {
            return { isValid: false, error: `Unknown role ID in pool: ${id}`, errorCode: "INVALID_SCHEMA" };
          }
          if (seen.has(id)) {
            return { isValid: false, error: `Duplicate role ID in pool: ${id}`, errorCode: "INVALID_SCHEMA" };
          }
          seen.add(id);
        }
        const poolRoles = payload.selectedRolePool.map((id) => ({
          role_id: id,
          canonical_name: ROLE_BY_ID.get(id)!.canonical_name,
          count: 1,
        }));
        const val = validateMode2Pool(poolRoles);
        if (!val.valid) {
          return { isValid: false, error: val.error || "Role pool requires at least 1 werewolf-side role.", errorCode: "INVALID_SCHEMA" };
        }
      }
    }

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

      const payload = command.payload as SubmitNightActionCommandPayload | undefined;
      const targetId = payload?.targetPlayerId;
      const secondaryTargetId = payload?.secondaryTargetId;

      const action = room.nightActions.find(
        (a) => (a.id === payload?.actionId || !payload?.actionId) && a.player_ids.includes(command.senderId)
      );
      if (!action) {
        return {
          isValid: false,
          error: `No pending night action found for player ${command.senderId}.`,
          errorCode: "NOT_PERMITTED",
        };
      }

      if (targetId) {
        const targetPlayer = room.players.find((p) => p.id === targetId);
        if (!targetPlayer) {
          return {
            isValid: false,
            error: `Target player ${targetId} not found in room.`,
            errorCode: "INVALID_TARGET",
          };
        }
        if (!targetPlayer.alive) {
          return {
            isValid: false,
            error: `Target player ${targetId} is dead.`,
            errorCode: "INVALID_TARGET",
          };
        }
      }

      if (secondaryTargetId) {
        const secTargetPlayer = room.players.find((p) => p.id === secondaryTargetId);
        if (!secTargetPlayer) {
          return {
            isValid: false,
            error: `Secondary target player ${secondaryTargetId} not found in room.`,
            errorCode: "INVALID_TARGET",
          };
        }
        if (!secTargetPlayer.alive) {
          return {
            isValid: false,
            error: `Secondary target player ${secondaryTargetId} is dead.`,
            errorCode: "INVALID_TARGET",
          };
        }
      }

      if (targetId) {
        const check = validateAbilityTarget(action, player, targetId, secondaryTargetId);
        if (!check.valid) {
          return {
            isValid: false,
            error: check.reason || "Invalid ability target.",
            errorCode: "INVALID_TARGET",
          };
        }
      }
    }

    if (command.type === "WEREWOLF_PACK_VOTE") {
      if (room.phase !== "NIGHT_ACTIVE") {
        return {
          isValid: false,
          error: `Cannot vote in pack: Room phase is ${room.phase}, expected NIGHT_ACTIVE.`,
          errorCode: "INVALID_PHASE",
        };
      }
      if (!player.alive) {
        return {
          isValid: false,
          error: "Dead players cannot participate in pack voting.",
          errorCode: "PLAYER_DEAD",
        };
      }
      if (!canParticipateInWerewolfPackVote(player, room.players, room.nightCount)) {
        return {
          isValid: false,
          error: "Only alive eligible werewolves can participate in pack voting.",
          errorCode: "NOT_PERMITTED",
        };
      }
      if (!room.packVoteWindow) {
        return {
          isValid: false,
          error: "Pack voting window is not active.",
          errorCode: "NOT_PERMITTED",
        };
      }
      if (Date.now() > room.packVoteWindow.expiresAt) {
        return {
          isValid: false,
          error: "Pack voting window has expired.",
          errorCode: "ACTION_EXPIRED",
        };
      }

      const payload = command.payload as WerewolfPackVoteCommandPayload | undefined;
      const targetId = payload?.targetPlayerId;
      if (!targetId || typeof targetId !== "string") {
        return {
          isValid: false,
          error: "targetPlayerId is required.",
          errorCode: "INVALID_SCHEMA",
        };
      }

      const targetPlayer = room.players.find((p) => p.id === targetId);
      if (!targetPlayer) {
        return {
          isValid: false,
          error: `Target player ${targetId} not found in room.`,
          errorCode: "INVALID_TARGET",
        };
      }
      if (!targetPlayer.alive) {
        return {
          isValid: false,
          error: `Target player ${targetId} is dead.`,
          errorCode: "INVALID_TARGET",
        };
      }
      if (room.packVoteWindow.allowedTargets && room.packVoteWindow.allowedTargets.length > 0) {
        if (!room.packVoteWindow.allowedTargets.includes(targetId)) {
          return {
            isValid: false,
            error: `Target player ${targetId} is not in the tied revote candidates: ${room.packVoteWindow.allowedTargets.join(", ")}.`,
            errorCode: "INVALID_TARGET",
          };
        }
      }
    }

    if (command.type === "SEER_CHECK") {
      if (room.phase !== "NIGHT_ACTIVE") {
        return {
          isValid: false,
          error: `Cannot perform seer check: Room phase is ${room.phase}, expected NIGHT_ACTIVE.`,
          errorCode: "INVALID_PHASE",
        };
      }
      if (!player.alive) {
        return {
          isValid: false,
          error: "Dead players cannot perform seer check.",
          errorCode: "PLAYER_DEAD",
        };
      }
      const isSeerRole =
        player.role_id === "ROLE-002" ||
        player.role_id === "ROLE-022" ||
        player.canonical_name?.toLowerCase().includes("seer") ||
        player.action_type === "Investigate";
      if (!isSeerRole) {
        return {
          isValid: false,
          error: "Only the Seer can perform a seer check.",
          errorCode: "NOT_PERMITTED",
        };
      }
      if (!room.seerActionState) {
        return {
          isValid: false,
          error: "Seer check window is not active.",
          errorCode: "NOT_PERMITTED",
        };
      }
      if (room.seerActionState.checked) {
        return {
          isValid: false,
          error: "Seer has already performed their check for tonight.",
          errorCode: "ALREADY_CHECKED",
        };
      }
      if (Date.now() > room.seerActionState.expiresAt) {
        return {
          isValid: false,
          error: "Seer check window has expired.",
          errorCode: "ACTION_EXPIRED",
        };
      }

      const payload = command.payload as SeerCheckCommandPayload | undefined;
      const targetId = payload?.targetPlayerId;
      if (!targetId || typeof targetId !== "string") {
        return {
          isValid: false,
          error: "targetPlayerId is required.",
          errorCode: "INVALID_SCHEMA",
        };
      }
      if (targetId === command.senderId) {
        return {
          isValid: false,
          error: "Seer cannot check themselves.",
          errorCode: "INVALID_TARGET",
        };
      }

      const targetPlayer = room.players.find((p) => p.id === targetId);
      if (!targetPlayer) {
        return {
          isValid: false,
          error: `Target player ${targetId} not found in room.`,
          errorCode: "INVALID_TARGET",
        };
      }
      if (!targetPlayer.alive) {
        return {
          isValid: false,
          error: `Target player ${targetId} is dead.`,
          errorCode: "INVALID_TARGET",
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
      const payload = command.payload as CastVoteCommandPayload | undefined;
      if (payload?.targetPlayerId && payload.targetPlayerId !== "SKIP") {
        const targetPlayer = room.players.find((p) => p.id === payload.targetPlayerId);
        if (!targetPlayer) {
          return {
            isValid: false,
            error: `Vote target ${payload.targetPlayerId} not found in room.`,
            errorCode: "INVALID_TARGET",
          };
        }
        if (!targetPlayer.alive) {
          return {
            isValid: false,
            error: `Cannot vote for dead player ${payload.targetPlayerId}.`,
            errorCode: "INVALID_TARGET",
          };
        }
      }
    }

    if (command.type === "START_DAY_VOTING") {
      if (room.hostPlayerId !== command.senderId) {
        return { isValid: false, error: "Only the host can open voting.", errorCode: "NOT_PERMITTED" };
      }
      if (room.phase !== "DAY_DISCUSSION") {
        return { isValid: false, error: `Cannot start voting from phase ${room.phase}.`, errorCode: "INVALID_PHASE" };
      }
    }

    if (command.type === "RESOLVE_NIGHT") {
      if (room.hostPlayerId !== command.senderId) {
        return { isValid: false, error: "Only the host can resolve night.", errorCode: "NOT_PERMITTED" };
      }
      if (room.phase !== "NIGHT_ACTIVE") {
        return { isValid: false, error: `Cannot resolve night from phase ${room.phase}.`, errorCode: "INVALID_PHASE" };
      }
    }

    if (command.type === "RESOLVE_DAY_VOTES") {
      if (room.hostPlayerId !== command.senderId) {
        return { isValid: false, error: "Only the host can resolve day votes.", errorCode: "NOT_PERMITTED" };
      }
      if (room.phase !== "DAY_VOTING") {
        return { isValid: false, error: `Cannot resolve day votes from phase ${room.phase}.`, errorCode: "INVALID_PHASE" };
      }
    }

    if (command.type === "RESTART_GAME") {
      if (room.hostPlayerId !== command.senderId) {
        return { isValid: false, error: "Only the host can restart the game.", errorCode: "NOT_PERMITTED" };
      }
      if (room.phase !== "GAME_OVER") {
        return { isValid: false, error: `Cannot restart game from phase ${room.phase}.`, errorCode: "INVALID_PHASE" };
      }
    }

    if (command.type === "SEND_CHAT") {
      if (!player) {
        return { isValid: false, error: "Player not found.", errorCode: "NOT_PERMITTED" };
      }
      if (!player.alive) {
        return { isValid: false, error: "Dead players cannot chat.", errorCode: "PLAYER_DEAD" };
      }
      const payload = command.payload as { text?: string; channel?: string } | undefined;
      if (!payload || typeof payload !== "object") {
        return { isValid: false, error: "Invalid schema: payload must be an object.", errorCode: "INVALID_SCHEMA" };
      }
      if (!payload.text || typeof payload.text !== "string" || payload.text.trim().length === 0) {
        return { isValid: false, error: "Chat text cannot be empty.", errorCode: "INVALID_SCHEMA" };
      }
      if (payload.text.length > 500) {
        return { isValid: false, error: "Chat text exceeds maximum length of 500 characters.", errorCode: "INVALID_SCHEMA" };
      }
      if (payload.channel === "WOLF_SECRET") {
        if (!canAccessWolfChat(player)) {
          return {
            isValid: false,
            error: "Only alive werewolves can access the wolf chat channel.",
            errorCode: "NOT_PERMITTED",
          };
        }
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

      const { command, player } = validation;

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
          case "TOGGLE_READY": {
            await RoomManager.toggleReady(command.roomId, command.senderId, commandContext);
            break;
          }

          case "START_GAME": {
            await RoomManager.startGame(command.roomId, command.senderId, command.payload, commandContext);
            break;
          }

          case "UPDATE_ROOM_CONFIG": {
            const payload = command.payload as UpdateRoomConfigCommandPayload;
            await RoomManager.updateRoomConfig(
              command.roomId,
              command.senderId,
              payload,
              commandContext
            );
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

          case "WEREWOLF_PACK_VOTE": {
            const payload = command.payload as WerewolfPackVoteCommandPayload;
            await RoomManager.submitPackVote(
              command.roomId,
              command.senderId,
              payload.targetPlayerId,
              commandContext
            );
            break;
          }

          case "SEER_CHECK": {
            const payload = command.payload as SeerCheckCommandPayload;
            await RoomManager.submitSeerCheck(
              command.roomId,
              command.senderId,
              payload.targetPlayerId,
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

          case "START_DAY_VOTING": {
            await RoomManager.startDayVoting(command.roomId, commandContext);
            break;
          }

          case "RESOLVE_NIGHT": {
            await RoomManager.resolveNightPhase(room, commandContext);
            break;
          }

          case "RESOLVE_DAY_VOTES": {
            const isTimeout = Boolean(command.payload?.isTimeout);
            await RoomManager.resolveDayVotePhase(room, isTimeout, commandContext);
            break;
          }

          case "RESTART_GAME": {
            await RoomManager.restartGame(command.roomId, command.senderId, commandContext);
            break;
          }

          case "SEND_CHAT": {
            const { text, channel } = command.payload || {};
            if (!text || typeof text !== "string") break;

            // Enforce persistent command idempotency for chat messages
            await defaultEventStore.recordCommand(commandContext);
            if (!room.processedCommandIds) room.processedCommandIds = new Set();
            room.processedCommandIds.add(command.commandId);

            const chatMsg = {
              id: `msg_${Date.now()}_${randomUUID().substring(0, 8)}`,
              senderId: command.senderId,
              senderName: player?.name || "Pemain",
              channel: channel || "DAY_PUBLIC",
              text: text.trim(),
              timestamp: Date.now(),
              isDead: !player?.alive,
            };

            const isWolfChat = channel === "WOLF_SECRET";
            const chatPayload = JSON.stringify({
              type: "CHAT_MESSAGE",
              message: chatMsg,
            });

            for (const [pId, client] of room.clients.entries()) {
              if (client.socket && client.socket.readyState === 1 /* OPEN */) {
                if (isWolfChat) {
                  const targetP = room.players.find((p) => p.id === pId);
                  if (targetP && canAccessWolfChat(targetP)) {
                    client.socket.send(chatPayload);
                  }
                } else {
                  client.socket.send(chatPayload);
                }
              }
            }
            return { success: true };
          }

          case "RECONNECT": {
            const lastSeq = typeof command.payload?.lastKnownSequence === "number" ? command.payload.lastKnownSequence : 0;
            const rawMissedEvents = await defaultEventStore.getEvents(command.roomId, lastSeq + 1);
            const isGameOver = room.phase === "GAME_OVER";
            const missedEvents = FogOfWarDispatcher.sanitizeEventsForPlayer(
              rawMissedEvents,
              command.senderId,
              isGameOver
            );
            const publicState = FogOfWarDispatcher.buildPublicState(room);
            const privateState = FogOfWarDispatcher.buildPrivateState(room, command.senderId);
            const client = room.clients.get(command.senderId);
            if (client?.socket && client.socket.readyState === 1 /* OPEN */) {
              client.socket.send(
                JSON.stringify({
                  type: "RECONNECT_SYNC",
                  sync: {
                    publicState,
                    privateState,
                    missedEvents,
                    serverTimestamp: Date.now(),
                  },
                })
              );
            }
            return { success: true };
          }

          case "REQUEST_SYNC": {
            const publicState = FogOfWarDispatcher.buildPublicState(room);
            const privateState = FogOfWarDispatcher.buildPrivateState(room, command.senderId);
            const client = room.clients.get(command.senderId);
            if (client?.socket && client.socket.readyState === 1 /* OPEN */) {
              client.socket.send(
                JSON.stringify({
                  type: "PUBLIC_STATE_UPDATE",
                  state: publicState,
                })
              );
              if (privateState) {
                client.socket.send(
                  JSON.stringify({
                    type: "PRIVATE_STATE_UPDATE",
                    state: privateState,
                  })
                );
              }
            }
            return { success: true };
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
