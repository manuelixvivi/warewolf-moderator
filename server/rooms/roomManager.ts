// ============================================================
// ASPIRE: WEREWOLF — Authoritative Room Manager
// State Machine & Lifecycle Authority
// "Server owns the state. Engine resolves truth.
//  PostgreSQL = Canonical Historical Truth. State = Projection(Event[1..N])."
// ============================================================

import { AsyncLocalStorage } from "async_hooks";
import { randomBytes } from "node:crypto";
import { v7 as uuidv7 } from "uuid";
import {
  AuthoritativeRoomState,
  ConnectedClient,
  SessionTokenPayload,
} from "../types";
import {
  GameEvent,
  GameEventType,
  CanonicalGameState,
  CanonicalPlayer,
} from "../../src/contracts";
import { config, signGameEvent } from "../config";
import { SessionManager } from "../auth/sessionManager";
import { PlayerEngineState, EngineNightAction } from "../../src/lib/engine/types";
import { ROLE_BY_ID, ALL_ROLES, buildEngineNightActions, validateAbilityTarget, canParticipateInWerewolfPackVote } from "../../src/lib/engine/abilityRegistry";
import { resolveNightActions } from "../../src/lib/engine/actionResolver";
import { resolveDeathChain } from "../../src/lib/engine/deathResolver";
import { resolveDayVotes } from "../../src/lib/engine/voteResolver";
import { evaluateWinConditions } from "../../src/lib/engine/winEngine";
import {
  selectBalancedSubsetFromPool,
  validateMode2Pool,
  generateBalancedRandomComposition,
  shuffleRoles,
  MINIMUM_PLAYERS,
} from "../../src/lib/engine/balanceEngine";
import { SelectedRole } from "../../src/types/game";
import { defaultEventStore, ReplayEngine, CommandRecord } from "../persistence";
import { FogOfWarDispatcher } from "../gateway/fogOfWarDispatcher";

export class RoomManager {
  public static rooms = new Map<string, AuthoritativeRoomState>();
  private static roomQueueStorage = new AsyncLocalStorage<Set<string>>();
  private static roomQueues = new Map<string, Promise<any>>();

  /**
   * Serializes operations per room using a strict FIFO promise chain.
   * Ensures contiguous sequence allocation and zero concurrent sequence collisions in database.
   * Deadlock-free: detects re-entrancy via AsyncLocalStorage and allows nested execution.
   */
  public static async enqueueRoomOperation<T>(
    roomId: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const activeRooms = this.roomQueueStorage.getStore();
    if (activeRooms && activeRooms.has(roomId)) {
      // Re-entrant call from within the same room's enqueued context: execute immediately
      return await operation();
    }

    const currentQueue = this.roomQueues.get(roomId) || Promise.resolve();

    let result: T;
    let operationError: any = null;
    let didFail = false;

    const nextQueue = currentQueue
      .then(async () => {
        const nextSet = new Set(activeRooms || []);
        nextSet.add(roomId);
        await this.roomQueueStorage.run(nextSet, async () => {
          try {
            result = await operation();
          } catch (err) {
            operationError = err;
            didFail = true;
          }
        });
      })
      .catch(() => {
        // Prevent prior failure from breaking future queue chain
      });

    this.roomQueues.set(roomId, nextQueue);

    await nextQueue;

    // Clean up queue entry if this is the end of the chain
    if (this.roomQueues.get(roomId) === nextQueue) {
      this.roomQueues.delete(roomId);
    }

    if (didFail) {
      throw operationError;
    }
    return result!;
  }

  public static getRoom(roomId: string): AuthoritativeRoomState | undefined {
    return this.rooms.get(roomId);
  }

  public static getAllRooms(): AuthoritativeRoomState[] {
    return Array.from(this.rooms.values());
  }

  /**
   * Recovers room state from the canonical EventStore after crash or eviction.
   */
  public static async recoverRoom(roomId: string): Promise<AuthoritativeRoomState | null> {
    const recovered = await ReplayEngine.reconstructState(roomId, defaultEventStore, undefined, {
      rearmTimers: true,
    });
    if (recovered) {
      this.rooms.set(roomId, recovered);
    }
    return recovered;
  }

  /**
   * Appends an immutable GameEvent to the room's event store.
   * STRICT PERSISTENCE INVARIANT:
   * Awaits PostgreSQL event store commit BEFORE updating authoritative state in RAM.
   * If database persistence fails, state is NOT updated and error is thrown.
   */
  public static async appendEvent<T = any>(
    room: AuthoritativeRoomState,
    type: GameEventType,
    actorId: string | undefined,
    payload: T,
    commandContext?: CommandRecord
  ): Promise<{ isDuplicate: boolean; event: GameEvent<T> }> {
    const candidateSequence = room.sequenceNumber + 1;
    const eventId = uuidv7();
    const timestamp = Date.now();
    const signature = signGameEvent(room.roomId, candidateSequence, type, payload, eventId, timestamp, actorId);

    const event: GameEvent<T> = {
      eventId,
      roomId: room.roomId,
      sequence: candidateSequence,
      timestamp,
      type,
      actorId,
      payload,
      serverSignature: signature,
    };

    // 1. AWAIT database append first (strict historical truth before RAM commit)
    if (commandContext) {
      const { isDuplicate } = await defaultEventStore.appendEventWithCommand(event, commandContext);
      if (isDuplicate) {
        return { isDuplicate: true, event };
      }
      if (!room.processedCommandIds) room.processedCommandIds = new Set();
      room.processedCommandIds.add(commandContext.commandId);
    } else {
      await defaultEventStore.appendEvent(event);
    }

    // 2. Only upon successful persistence commit, update authoritative state in RAM
    room.sequenceNumber = candidateSequence;
    room.eventLog.push(event);
    room.updatedAt = event.timestamp;

    return { isDuplicate: false, event };
  }

  /**
   * Appends a batch of immutable GameEvents atomically.
   * All events are committed in a single database transaction.
   * Authoritative state in RAM is only updated if the entire batch succeeds.
   */
  public static async appendBatch(
    room: AuthoritativeRoomState,
    eventsToCommit: Array<{ type: GameEventType; actorId?: string; payload: any }>,
    commandContext?: CommandRecord
  ): Promise<{ isDuplicate: boolean; events: GameEvent[] }> {
    if (eventsToCommit.length === 0) return { isDuplicate: false, events: [] };

    let currentSeq = room.sequenceNumber;
    const preparedEvents: GameEvent[] = eventsToCommit.map((item) => {
      currentSeq++;
      const eventId = uuidv7();
      const timestamp = Date.now();
      return {
        eventId,
        roomId: room.roomId,
        sequence: currentSeq,
        timestamp,
        type: item.type,
        actorId: item.actorId,
        payload: item.payload,
        serverSignature: signGameEvent(room.roomId, currentSeq, item.type, item.payload, eventId, timestamp, item.actorId),
      };
    });

    // 1. AWAIT atomic batch persistence (transactional BEGIN ... COMMIT)
    if (commandContext) {
      const { isDuplicate } = await defaultEventStore.appendBatchWithCommand(preparedEvents, commandContext);
      if (isDuplicate) {
        return { isDuplicate: true, events: preparedEvents };
      }
      if (!room.processedCommandIds) room.processedCommandIds = new Set();
      room.processedCommandIds.add(commandContext.commandId);
    } else {
      await defaultEventStore.appendBatch(preparedEvents);
    }

    // 2. Commit to RAM state only after database transaction succeeds
    room.sequenceNumber = currentSeq;
    for (const event of preparedEvents) {
      room.eventLog.push(event);
    }
    room.updatedAt = Date.now();

    return { isDuplicate: false, events: preparedEvents };
  }

  /**
   * Creates a new authoritative room.
   */
  public static async createRoom(
    hostPlayerId: string,
    hostPlayerName: string,
    gameMode: AuthoritativeRoomState["gameMode"] = "MODE_1_FIXED",
    customRoomId?: string,
    config?: {
      targetPlayerCount?: number;
      selectedRoles?: SelectedRole[];
      selectedRolePool?: string[];
    }
  ): Promise<{ room: AuthoritativeRoomState; sessionToken: string }> {
    let roomId = customRoomId ? customRoomId.trim().toUpperCase() : "";

    if (roomId) {
      if (this.rooms.has(roomId) || (await defaultEventStore.hasMatch(roomId))) {
        throw new Error(`Room collision: Room ${roomId} already exists.`);
      }
    } else {
      // Generate a unique 5-char code with collision check
      let attempts = 0;
      while (attempts < 10) {
        const candidate = `WOLF-${randomBytes(3).toString("hex").toUpperCase()}`;
        if (!this.rooms.has(candidate) && !(await defaultEventStore.hasMatch(candidate))) {
          roomId = candidate;
          break;
        }
        attempts++;
      }
      if (!roomId) {
        roomId = `WOLF-${uuidv7().substring(0, 8).toUpperCase()}`;
      }
    }

    const hostPlayer: PlayerEngineState = {
      id: hostPlayerId,
      name: hostPlayerName,
      isHost: true,
      isReady: true,
      alive: true,
      role_id: "ROLE-024", // Default Villager placeholder until game start
      canonical_name: "Villager",
      team: "Village",
      originalTeam: "Village",
      category: "Village",
      seer_result: "Villager",
      role_points: 1,
      balance_weight: 1,
      night_priority: 99,
      active_phase: "Day",
      action_type: "None",
      trigger: "None",
      target_type: "None",
      protected: false,
      silenced: false,
      inCult: false,
      hasUsedAbility: false,
    };

    const initEventPayload = {
      roomId,
      gameMode,
      hostPlayerId,
      hostPlayerName,
      targetPlayerCount: config?.targetPlayerCount,
      selectedRoles: config?.selectedRoles,
      selectedRolePool: config?.selectedRolePool,
    };
    const eventId = uuidv7();
    const timestamp = Date.now();
    const initEventSignature = signGameEvent(roomId, 1, "ROOM_INITIALIZED", initEventPayload, eventId, timestamp, hostPlayerId);
    const initEvent: GameEvent = {
      eventId,
      roomId,
      sequence: 1,
      timestamp,
      type: "ROOM_INITIALIZED",
      actorId: hostPlayerId,
      payload: initEventPayload,
      serverSignature: initEventSignature,
    };

    // 1. ATOMIC ROOM CREATION: Match projection + Host participant + ROOM_INITIALIZED event
    // All committed in a single atomic database transaction (BEGIN ... COMMIT).
    await defaultEventStore.createRoomAtomic(
      {
        roomId,
        gameMode,
        hostPlayerId,
        hostPlayerName,
        status: "ACTIVE",
      },
      {
        roomId,
        playerId: hostPlayerId,
        playerName: hostPlayerName,
        isHost: true,
        roleId: hostPlayer.role_id,
        canonicalName: hostPlayer.canonical_name,
        team: hostPlayer.team,
        alive: true,
      },
      initEvent
    );

    // 2. ONLY upon successful database persistence commit, register in-memory room
    const room: AuthoritativeRoomState = {
      roomId,
      hostPlayerId,
      gameMode,
      phase: "LOBBY",
      dayCount: 0,
      nightCount: 0,
      sequenceNumber: 1,
      timeoutCount: 0,
      players: [hostPlayer],
      votes: {},
      nightActions: [],
      eventLog: [initEvent],
      clients: new Map(),
      disconnectTimers: new Map(),
      processedCommandIds: new Set(),
      targetPlayerCount: config?.targetPlayerCount,
      selectedRoles: config?.selectedRoles,
      selectedRolePool: config?.selectedRolePool,
      createdAt: initEvent.timestamp,
      updatedAt: initEvent.timestamp,
    };

    this.rooms.set(roomId, room);

    const sessionToken = SessionManager.createSessionToken(
      hostPlayerId,
      hostPlayerName,
      roomId,
      true
    );

    return { room, sessionToken };
  }

  /**
   * Joins an existing room in LOBBY phase.
   */
  public static async joinRoom(
    roomId: string,
    playerId: string,
    playerName: string,
    commandContext?: CommandRecord,
    clientSessionToken?: string
  ): Promise<{ room: AuthoritativeRoomState; sessionToken: string }> {
    return this.enqueueRoomOperation(roomId, async () => {
      let room = this.rooms.get(roomId);
      if (!room) {
        room = (await this.recoverRoom(roomId)) || undefined;
      }
      if (!room) {
        throw new Error(`Room ${roomId} not found.`);
      }

      if (room.phase !== "LOBBY") {
        throw new Error(`Cannot join room ${roomId}; game is already in phase ${room.phase}.`);
      }

      let existingPlayer = room.players.find((p) => p.id === playerId);
      if (existingPlayer) {
        // SECURITY GATE: Prevent anonymous account/player takeover!
        // If player already exists in the room, caller MUST provide valid matching session token to re-authenticate.
        let isAuthorized = false;
        if (clientSessionToken) {
          const verified = SessionManager.verifySessionToken(clientSessionToken);
          if (verified && verified.playerId === playerId && verified.roomId === roomId) {
            isAuthorized = true;
          }
        }
        // Also allow idempotent retransmissions of the same commandId
        if (commandContext && room.processedCommandIds?.has(commandContext.commandId)) {
          isAuthorized = true;
        }

        if (!isAuthorized) {
          throw new Error(`Player ID '${playerId}' is already claimed in room ${roomId}. Valid session token required.`);
        }
      } else {
        const candidatePlayer: PlayerEngineState = {
          id: playerId,
          name: playerName,
          isHost: false,
          isReady: false,
          alive: true,
          role_id: "ROLE-024",
          canonical_name: "Villager",
          team: "Village",
          originalTeam: "Village",
          category: "Village",
          seer_result: "Villager",
          role_points: 1,
          balance_weight: 1,
          night_priority: 99,
          active_phase: "Day",
          action_type: "None",
          trigger: "None",
          target_type: "None",
          protected: false,
          silenced: false,
          inCult: false,
          hasUsedAbility: false,
        };

        const candidateSequence = room.sequenceNumber + 1;
        const joinPayload = { playerId, playerName };
        const eventId = uuidv7();
        const timestamp = Date.now();
        const signature = signGameEvent(room.roomId, candidateSequence, "PLAYER_JOINED", joinPayload, eventId, timestamp, playerId);
        const joinEvent: GameEvent = {
          eventId,
          roomId: room.roomId,
          sequence: candidateSequence,
          timestamp,
          type: "PLAYER_JOINED",
          actorId: playerId,
          payload: joinPayload,
          serverSignature: signature,
        };

        // 1. ATOMIC TRANSACTION: participant projection + PLAYER_JOINED event + command idempotency
        // All committed in a single atomic SQL transaction (BEGIN ... COMMIT).
        const { isDuplicate } = await defaultEventStore.joinRoomAtomic(
          {
            roomId,
            playerId,
            playerName,
            isHost: false,
            roleId: candidatePlayer.role_id,
            canonicalName: candidatePlayer.canonical_name,
            team: candidatePlayer.team,
            alive: true,
            joinedAt: joinEvent.timestamp,
          },
          joinEvent,
          commandContext
        );

        if (isDuplicate) {
          const sessionToken = SessionManager.createSessionToken(
            playerId,
            playerName,
            roomId,
            false
          );
          return { room, sessionToken };
        }

        // 2. Commit candidate player and event to RAM ONLY after database confirms atomic persistence
        room.sequenceNumber = candidateSequence;
        room.eventLog.push(joinEvent);
        room.updatedAt = joinEvent.timestamp;
        existingPlayer = candidatePlayer;
        room.players.push(existingPlayer);

        if (commandContext) {
          if (!room.processedCommandIds) room.processedCommandIds = new Set();
          room.processedCommandIds.add(commandContext.commandId);
        }
      }

      const sessionToken = SessionManager.createSessionToken(
        playerId,
        playerName,
        roomId,
        existingPlayer.isHost
      );

      return { room, sessionToken };
    });
  }

  /**
   * Toggles ready state in lobby.
   * STRICT PERSISTENCE INVARIANT:
   * Commits PLAYER_READY_CHANGED event to PostgreSQL before mutating RAM player state.
   */
  public static async toggleReady(
    roomId: string,
    playerId: string,
    commandContext?: CommandRecord
  ): Promise<AuthoritativeRoomState> {
    return this.enqueueRoomOperation(roomId, async () => {
      const room = this.rooms.get(roomId);
      if (!room) throw new Error(`Room ${roomId} not found.`);
      if (room.phase !== "LOBBY") throw new Error("Ready state can only be toggled in LOBBY.");

      const player = room.players.find((p) => p.id === playerId);
      if (!player) throw new Error(`Player ${playerId} not found in room.`);

      const newReadyState = !player.isReady;

      // 1. AWAIT database append first (strict historical truth before RAM commit)
      const { isDuplicate } = await this.appendEvent(
        room,
        "PLAYER_READY_CHANGED",
        playerId,
        {
          playerId,
          isReady: newReadyState,
        },
        commandContext
      );

      // If duplicate command retransmission, NO-OP: return current state without mutation
      if (isDuplicate) {
        return room;
      }

      // 2. Only upon successful persistence commit, update authoritative state in RAM
      player.isReady = newReadyState;
      room.updatedAt = Date.now();
      return room;
    });
  }

  /**
   * Updates room configuration during LOBBY phase.
   * Emits ROOM_CONFIG_UPDATED event to EventStore before mutating RAM state.
   */
  public static async updateRoomConfig(
    roomId: string,
    hostPlayerId: string,
    config: {
      gameMode?: AuthoritativeRoomState["gameMode"];
      targetPlayerCount?: number;
      selectedRoles?: SelectedRole[];
      selectedRolePool?: string[];
    },
    commandContext?: CommandRecord
  ): Promise<AuthoritativeRoomState> {
    return this.enqueueRoomOperation(roomId, async () => {
      const room = this.rooms.get(roomId);
      if (!room) throw new Error(`Room ${roomId} not found.`);
      if (room.phase !== "LOBBY") {
        throw new Error("Room configuration can only be updated in LOBBY phase.");
      }
      if (room.hostPlayerId !== hostPlayerId) {
        throw new Error("Only the host can update room configuration.");
      }

      if (config.targetPlayerCount !== undefined) {
        if (!Number.isInteger(config.targetPlayerCount) || config.targetPlayerCount < MINIMUM_PLAYERS) {
          throw new Error(`targetPlayerCount must be an integer >= ${MINIMUM_PLAYERS}.`);
        }
        if (config.targetPlayerCount < room.players.length) {
          throw new Error(
            `Jumlah pemain target (${config.targetPlayerCount}) tidak boleh lebih kecil dari jumlah pemain yang sudah bergabung (${room.players.length}).`
          );
        }
      }

      if (config.selectedRoles !== undefined) {
        if (!Array.isArray(config.selectedRoles)) {
          throw new Error("selectedRoles must be an array.");
        }
        for (const sel of config.selectedRoles) {
          if (!sel.role_id || !ROLE_BY_ID.has(sel.role_id)) {
            throw new Error(`Invalid role_id in selectedRoles: ${sel.role_id}`);
          }
          if (!Number.isInteger(sel.count) || sel.count <= 0) {
            throw new Error(`Invalid role count for ${sel.role_id}: must be a positive integer.`);
          }
        }
      }

      if (config.selectedRolePool !== undefined) {
        if (!Array.isArray(config.selectedRolePool) || config.selectedRolePool.length === 0) {
          throw new Error("selectedRolePool must be a non-empty array of role IDs.");
        }
        const uniqueIds = new Set<string>();
        for (const id of config.selectedRolePool) {
          if (!ROLE_BY_ID.has(id)) {
            throw new Error(`Invalid role ID in pool: ${id}`);
          }
          if (uniqueIds.has(id)) {
            throw new Error(`Duplicate role ID in pool: ${id}`);
          }
          uniqueIds.add(id);
        }
        const poolRoles: SelectedRole[] = config.selectedRolePool.map((id) => ({
          role_id: id,
          canonical_name: ROLE_BY_ID.get(id)!.canonical_name,
          count: 1,
        }));
        const val = validateMode2Pool(poolRoles);
        if (!val.valid) {
          throw new Error(val.error || "Invalid role pool: must contain at least 1 werewolf-side role.");
        }
      }

      const payload = {
        gameMode: config.gameMode,
        targetPlayerCount: config.targetPlayerCount,
        selectedRoles: config.selectedRoles,
        selectedRolePool: config.selectedRolePool,
      };

      // 1. AWAIT PostgreSQL persistence commit first
      const { isDuplicate } = await this.appendEvent(
        room,
        "ROOM_CONFIG_UPDATED",
        hostPlayerId,
        payload,
        commandContext
      );

      if (isDuplicate) {
        return room;
      }

      // 2. Mutate RAM state only after database confirms commit
      if (config.gameMode) room.gameMode = config.gameMode;
      if (config.targetPlayerCount !== undefined) room.targetPlayerCount = config.targetPlayerCount;
      if (config.selectedRoles !== undefined) room.selectedRoles = config.selectedRoles;
      if (config.selectedRolePool !== undefined) room.selectedRolePool = config.selectedRolePool;
      room.updatedAt = Date.now();

      // 3. Broadcast sync to all clients in room
      FogOfWarDispatcher.dispatchRoomSync(room);

      return room;
    });
  }

  /**
   * Starts the match from LOBBY: assigns roles via Golden Engine balance logic
   * and transitions to NIGHT_ACTIVE in a single atomic database batch.
   */
  public static async startGame(
    roomId: string,
    hostPlayerId: string,
    options?: {
      selectedRolePool?: string[];
      fixedRoles?: SelectedRole[];
    },
    commandContext?: CommandRecord
  ): Promise<AuthoritativeRoomState> {
    return this.enqueueRoomOperation(roomId, async () => {
      const room = this.rooms.get(roomId);
      if (!room) throw new Error(`Room ${roomId} not found.`);
      if (room.phase !== "LOBBY") throw new Error(`Cannot start game from phase ${room.phase}.`);
      if (room.hostPlayerId !== hostPlayerId) {
        throw new Error("Only the host can start the game.");
      }

      const playerCount = room.players.length;
      if (playerCount < MINIMUM_PLAYERS) {
        throw new Error(`Minimum ${MINIMUM_PLAYERS} players required to start.`);
      }

      // Role Distribution Logic according to game mode
      let assignedRoleDefs: typeof ALL_ROLES = [];

      const effectiveFixedRoles = options?.fixedRoles || room.selectedRoles;
      const effectiveRolePool = options?.selectedRolePool || room.selectedRolePool;

      if (effectiveFixedRoles && effectiveFixedRoles.length > 0 && room.gameMode === "MODE_1_FIXED") {
        for (const sel of effectiveFixedRoles) {
          if (!Number.isInteger(sel.count) || sel.count <= 0) {
            throw new Error(`Invalid role count for ${sel.role_id}: must be a positive integer.`);
          }
        }
        const totalFixedCount = effectiveFixedRoles.reduce((sum, sel) => sum + sel.count, 0);
        if (totalFixedCount !== playerCount) {
          throw new Error(
            `Cannot start game: Total fixed role count (${totalFixedCount}) must exactly match player count (${playerCount}).`
          );
        }
        const expanded: typeof ALL_ROLES = [];
        for (const sel of effectiveFixedRoles) {
          const def = ROLE_BY_ID.get(sel.role_id);
          if (!def) {
            throw new Error(`Role definition not found for role_id: ${sel.role_id}`);
          }
          for (let i = 0; i < sel.count; i++) expanded.push(def);
        }
        assignedRoleDefs = shuffleRoles(expanded);
      } else if (room.gameMode === "MODE_2_POOL" && effectiveRolePool && effectiveRolePool.length > 0) {
        for (const id of effectiveRolePool) {
          if (!ROLE_BY_ID.has(id)) {
            throw new Error(`Invalid role pool: unknown role ID ${id}`);
          }
        }
        const poolRoles: SelectedRole[] = effectiveRolePool.map((id) => {
          const def = ROLE_BY_ID.get(id)!;
          return {
            role_id: id,
            canonical_name: def.canonical_name,
            count: 1,
          };
        });
        assignedRoleDefs = selectBalancedSubsetFromPool(poolRoles, playerCount);
      } else if (effectiveFixedRoles && effectiveFixedRoles.length > 0) {
        for (const sel of effectiveFixedRoles) {
          if (!Number.isInteger(sel.count) || sel.count <= 0) {
            throw new Error(`Invalid role count for ${sel.role_id}: must be a positive integer.`);
          }
        }
        const totalFixedCount = effectiveFixedRoles.reduce((sum, sel) => sum + sel.count, 0);
        if (totalFixedCount !== playerCount) {
          throw new Error(
            `Cannot start game: Total fixed role count (${totalFixedCount}) must exactly match player count (${playerCount}).`
          );
        }
        const expanded: typeof ALL_ROLES = [];
        for (const sel of effectiveFixedRoles) {
          const def = ROLE_BY_ID.get(sel.role_id);
          if (!def) {
            throw new Error(`Role definition not found for role_id: ${sel.role_id}`);
          }
          for (let i = 0; i < sel.count; i++) expanded.push(def);
        }
        assignedRoleDefs = shuffleRoles(expanded);
      } else {
        assignedRoleDefs = generateBalancedRandomComposition(playerCount);
      }

      // PURE CANDIDATE COMPUTATION: Zero RAM mutation before persistence commit!
      const candidatePlayers: PlayerEngineState[] = room.players.map((p, idx) => {
        const role = assignedRoleDefs[idx] || ALL_ROLES[0];
        return {
          ...p,
          role_id: role.role_id,
          canonical_name: role.canonical_name,
          team: role.team,
          originalTeam: role.team,
          category: role.category,
          seer_result: role.seer_result,
          role_points: role.role_points,
          balance_weight: role.balance_weight,
          night_priority: role.night_priority || 50,
          active_phase: role.active_phase,
          action_type: role.action_type,
          trigger: role.trigger,
          target_type: role.target_type,
          usage_limit: role.usage_limit,
          can_change_role: role.can_change_role,
          reveal_on_death: role.reveal_on_death,
          requires_engine_resolution: role.requires_engine_resolution,
          description_id: role.description_id || role.tooltip_id,
          tooltip_id: role.tooltip_id,
          alive: true,
          protected: false,
          silenced: false,
          inCult: false,
          hasUsedAbility: false,
        };
      });

      const candidateNightCount = 1;
      const candidateDayCount = 0;
      const candidatePhase: AuthoritativeRoomState["phase"] = "NIGHT_ACTIVE";
      const candidateNightActions = buildEngineNightActions(candidatePlayers, candidateNightCount, false);

      const now = Date.now();
      const DURATION = 10000;
      const eligibleWolves = candidatePlayers.filter((p) => p.alive && canParticipateInWerewolfPackVote(p, candidatePlayers, candidateNightCount));
      const seer = candidatePlayers.find((p) => p.alive && (p.role_id === "ROLE-002" || p.role_id === "ROLE-022" || p.canonical_name?.toLowerCase().includes("seer") || p.action_type === "Investigate"));

      // ATOMIC PERSISTENCE: Commit GAME_STARTED, ROLES_ASSIGNED, and PHASE_TRANSITIONED together
      // Includes complete canonical role snapshot & ruleset version for immutable long-term replay
      const eventsBatch: Array<{ type: GameEventType; actorId?: string; payload: any }> = [
        {
          type: "GAME_STARTED",
          actorId: hostPlayerId,
          payload: {
            playerCount,
            gameMode: room.gameMode,
            rulesetVersion: "1.0.0",
            engineVersion: "1.0.0",
          },
        },
        {
          type: "ROLES_ASSIGNED",
          actorId: hostPlayerId,
          payload: {
            assignedCount: playerCount,
            rulesetVersion: "1.0.0",
            assignments: candidatePlayers.map((p) => ({
              playerId: p.id,
              role_id: p.role_id,
              canonical_name: p.canonical_name,
              team: p.team,
              originalTeam: p.originalTeam,
              category: p.category,
              seer_result: p.seer_result,
              role_points: p.role_points,
              balance_weight: p.balance_weight,
              night_priority: p.night_priority,
              active_phase: p.active_phase,
              action_type: p.action_type,
              trigger: p.trigger,
              target_type: p.target_type,
              usage_limit: p.usage_limit,
              can_change_role: p.can_change_role,
              reveal_on_death: p.reveal_on_death,
              requires_engine_resolution: p.requires_engine_resolution,
              description_id: p.description_id,
              tooltip_id: p.tooltip_id,
            })),
          },
        },
        {
          type: "PHASE_TRANSITIONED",
          payload: {
            phase: candidatePhase,
            nightCount: candidateNightCount,
            dayCount: candidateDayCount,
          },
        },
      ];

      if (eligibleWolves.length > 0) {
        eventsBatch.push({
          type: "PACK_VOTE_STARTED",
          payload: {
            startedAt: now,
            expiresAt: now + DURATION,
            isRevote: false,
          },
        });
      }

      if (seer) {
        eventsBatch.push({
          type: "SEER_WINDOW_STARTED",
          actorId: seer.id,
          payload: {
            startedAt: now,
            expiresAt: now + DURATION,
            seerPlayerId: seer.id,
          },
        });
      }

      const { isDuplicate } = await this.appendBatch(room, eventsBatch, commandContext);

      // If duplicate command retransmission, NO-OP: return current state without mutation
      if (isDuplicate) {
        return room;
      }

      // ONLY UPON SUCCESSFUL DATABASE BATCH COMMIT: Apply candidate state to RAM!
      room.players = candidatePlayers;
      room.nightCount = candidateNightCount;
      room.dayCount = candidateDayCount;
      room.phase = candidatePhase;
      room.nightActions = candidateNightActions;

      // Clear any old timers & reset pack votes
      if (room.packVoteWindow?.timer) clearTimeout(room.packVoteWindow.timer);
      if (room.seerActionState?.timer) clearTimeout(room.seerActionState.timer);
      room.packVotes = {};

      if (eligibleWolves.length > 0) {
        room.packVoteWindow = {
          startedAt: now,
          expiresAt: now + DURATION,
          isRevote: false,
          eligibleWolfIds: eligibleWolves.map((w) => w.id),
          timer: setTimeout(async () => {
            try {
              await RoomManager.closePackVoteAndTally(room.roomId);
            } catch (err) {
              console.error("Pack vote timer error:", err);
            }
          }, DURATION).unref(),
        };
      } else {
        delete room.packVoteWindow;
      }

      if (seer) {
        room.seerActionState = {
          startedAt: now,
          expiresAt: now + DURATION,
          checked: false,
          timer: setTimeout(async () => {
            try {
              await RoomManager.closeSeerWindow(room.roomId);
            } catch (err) {
              console.error("Seer window timer error:", err);
            }
          }, DURATION).unref(),
        };
      } else {
        delete room.seerActionState;
      }

      return room;
    });
  }

  /**
   * Submits a night action. If all completed, automatically resolves night!
   * Enforces Database-First persistence: event is committed before action is marked completed in RAM.
   */
  public static async submitNightAction(
    roomId: string,
    actorPlayerId: string,
    actionId: string,
    targetPlayerId: string | null,
    secondaryTargetId?: string | null,
    commandContext?: CommandRecord
  ): Promise<{ room: AuthoritativeRoomState; resolved: boolean }> {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error(`Room ${roomId} not found.`);
    if (room.phase !== "NIGHT_ACTIVE") {
      throw new Error(`Night action rejected: room phase is ${room.phase}, expected NIGHT_ACTIVE.`);
    }

    const action = room.nightActions.find(
      (a) => (a.id === actionId || !actionId) && a.player_ids.includes(actorPlayerId)
    );

    if (!action) {
      throw new Error(`Action ${actionId || "auto"} not found or actor ${actorPlayerId} unauthorized.`);
    }

    // Validate target existence and alive status if provided
    if (targetPlayerId) {
      const target = room.players.find((p) => p.id === targetPlayerId);
      if (!target) throw new Error(`Target player ${targetPlayerId} not found in room.`);
      if (!target.alive) throw new Error(`Target player ${targetPlayerId} is dead.`);
    }
    if (secondaryTargetId) {
      const secTarget = room.players.find((p) => p.id === secondaryTargetId);
      if (!secTarget) throw new Error(`Secondary target player ${secondaryTargetId} not found in room.`);
      if (!secTarget.alive) throw new Error(`Secondary target player ${secondaryTargetId} is dead.`);
    }

    const actor = room.players.find((p) => p.id === actorPlayerId);
    if (actor && targetPlayerId) {
      const abilityCheck = validateAbilityTarget(action, actor, targetPlayerId, secondaryTargetId);
      if (!abilityCheck.valid) {
        throw new Error(abilityCheck.reason || "Invalid ability target.");
      }
    }

    const effectiveActionId = action.id;

    // 1. AWAIT database persistence commit BEFORE mutating action in RAM
    const { isDuplicate } = await this.appendEvent(room, "NIGHT_ACTION_SUBMITTED", actorPlayerId, {
      actionId: effectiveActionId,
      targetPlayerId,
      secondaryTargetId: secondaryTargetId || null,
    }, commandContext);

    // If duplicate command retransmission, NO-OP: return current state without mutation
    if (isDuplicate) {
      return { room, resolved: false };
    }

    // 2. Commit to RAM only after database persistence confirms success
    action.target_player_id = targetPlayerId;
    action.secondary_target_id = secondaryTargetId || null;
    action.completed = true;

    // If wolf action completed, sync pack votes and clear window
    const isWolfAct =
      action.role_id === "SYSTEM-WEREWOLF-PACK" ||
      action.id === "SYSTEM-WEREWOLF-PACK" ||
      action.role_name.toLowerCase().includes("werewolf") ||
      action.role_name.toLowerCase().includes("werewolves") ||
      action.action_type.toLowerCase().includes("werewolf") ||
      action.action_type === "Kill";

    if (isWolfAct) {
      if (room.packVoteWindow?.timer) clearTimeout(room.packVoteWindow.timer);
      delete room.packVoteWindow;
      if (targetPlayerId) {
        if (!room.packVotes) room.packVotes = {};
        room.packVotes[actorPlayerId] = targetPlayerId;
      }
    }

    // If seer action completed, sync seerActionState
    if (action.role_id === "ROLE-002" || action.role_id === "ROLE-022" || action.role_name.toLowerCase().includes("seer") || action.action_type === "Investigate") {
      if (room.seerActionState) {
        if (room.seerActionState.timer) clearTimeout(room.seerActionState.timer);
        room.seerActionState.checked = true;
        if (targetPlayerId) {
          room.seerActionState.targetPlayerId = targetPlayerId;
          const target = room.players.find((p) => p.id === targetPlayerId);
          if (target) {
            room.seerActionState.result = (target.seer_result as "Werewolf" | "Villager") || (target.team === "Werewolf" ? "Werewolf" : "Villager");
          }
        }
      }
    }

    // Check if night can be auto-resolved
    const resolved = await this.checkNightAutoResolve(room);
    return { room, resolved };
  }

  /**
   * Resolves the night phase using the Golden Engine modules.
   * STRICT PERSISTENCE INVARIANT:
   * Commits results in an atomic database transaction BEFORE mutating RAM room state.
   */
  public static async resolveNightPhase(
    room: AuthoritativeRoomState,
    commandContext?: CommandRecord
  ): Promise<AuthoritativeRoomState> {
    // Pure calculation via Golden Engine: ZERO RAM mutation yet!
    const { updatedPlayers, outcome } = resolveNightActions(
      room.players,
      room.nightActions,
      room.nightCount
    );

    // Process cascading death chain
    const deathChain = resolveDeathChain(
      updatedPlayers,
      outcome.killedPlayerIds,
      "WEREWOLF"
    );

    const candidatePlayers = deathChain.updatedPlayers;
    const candidateDayCount = room.dayCount + 1;
    const candidateNightCount = room.nightCount;

    // Check Win Conditions
    const winResult = evaluateWinConditions(candidatePlayers, { timeoutCount: room.timeoutCount });
    const candidatePhase: AuthoritativeRoomState["phase"] = winResult.gameEnded ? "GAME_OVER" : "DAY_DISCUSSION";

    const batch: Array<{ type: GameEventType; payload: any; actorId?: string }> = [
      {
        type: "NIGHT_RESOLVED",
        payload: {
          killedPlayerIds: outcome.killedPlayerIds,
          savedPlayerIds: outcome.savedPlayerIds,
          cascadeCasualties: deathChain.chainCasualties || [],
          silencedPlayerIds: outcome.silencedPlayerIds || [],
          convertedPlayerIds: outcome.convertedPlayerIds || [],
          triggeredActions: outcome.triggeredActions || [],
          updatedPlayers: candidatePlayers.map((p) => ({ ...p })), // Canonical snapshot of all player states
        },
      },
    ];

    // Detect and emit explicit ROLE_TRANSFORMED events if roles or teams mutated
    for (const p of candidatePlayers) {
      const old = room.players.find((x) => x.id === p.id);
      if (old && (old.role_id !== p.role_id || old.team !== p.team)) {
        batch.push({
          type: "ROLE_TRANSFORMED",
          actorId: p.id,
          payload: {
            playerId: p.id,
            fromRoleId: old.role_id,
            toRoleId: p.role_id,
            fromTeam: old.team,
            toTeam: p.team,
            canonicalName: p.canonical_name,
          },
        });
      }
    }

    const canonicalWinResult = winResult.gameEnded ? {
      winner: winResult.winner || "Draw",
      reason: winResult.reason || "Pertarungan di desa telah mencapai akhir!",
      winningPlayerIds: winResult.winningPlayerIds,
      winningTeams: winResult.winningTeams,
    } : null;

    if (winResult.gameEnded) {
      batch.push({
        type: "WIN_CONDITION_SATISFIED",
        payload: canonicalWinResult,
      });
    } else {
      batch.push({
        type: "PHASE_TRANSITIONED",
        payload: {
          phase: candidatePhase,
          dayCount: candidateDayCount,
          nightCount: candidateNightCount,
        },
      });
    }

    // 1. PERSIST ATOMIC BATCH TO DB FIRST
    const { isDuplicate } = await this.appendBatch(room, batch, commandContext);
    if (isDuplicate) {
      return room;
    }

    // 2. ONLY UPON SUCCESSFUL DB COMMIT: Apply candidate state to RAM!
    if (room.packVoteWindow?.timer) clearTimeout(room.packVoteWindow.timer);
    if (room.seerActionState?.timer) clearTimeout(room.seerActionState.timer);
    delete room.packVoteWindow;
    delete room.seerActionState;
    room.packVotes = {};

    room.players = candidatePlayers;
    room.dayCount = candidateDayCount;
    room.phase = candidatePhase;
    room.votes = {};
    room.nightActions = [];
    room.activeWinResult = canonicalWinResult;
    room.lastNightResult = {
      killed: deathChain.chainCasualties ? Array.from(new Set([...outcome.killedPlayerIds, ...deathChain.chainCasualties])) : outcome.killedPlayerIds,
      protected: outcome.savedPlayerIds || [],
      silenced: outcome.silencedPlayerIds || [],
    };

    return room;
  }

  /**
   * Transitions from Day Discussion to Day Voting.
   */
  public static async startDayVoting(
    roomId: string,
    commandContext?: CommandRecord
  ): Promise<AuthoritativeRoomState> {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error(`Room ${roomId} not found.`);
    if (room.phase !== "DAY_DISCUSSION") {
      throw new Error(`Cannot start voting from phase ${room.phase}.`);
    }

    // 1. PERSIST TO DB FIRST
    const { isDuplicate } = await this.appendEvent(
      room,
      "PHASE_TRANSITIONED",
      undefined,
      {
        phase: "DAY_VOTING",
        dayCount: room.dayCount,
        nightCount: room.nightCount,
      },
      commandContext
    );

    if (isDuplicate) {
      return room;
    }

    // 2. ONLY AFTER DB COMMIT: Apply to RAM
    room.phase = "DAY_VOTING";
    room.votes = {};

    return room;
  }

  /**
   * Submits a vote during DAY_VOTING.
   * Enforces Database-First persistence: event is committed before vote is registered in RAM.
   */
  public static async submitVote(
    roomId: string,
    voterId: string,
    targetPlayerId: string,
    commandContext?: CommandRecord
  ): Promise<{ room: AuthoritativeRoomState; resolved: boolean }> {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error(`Room ${roomId} not found.`);
    if (room.phase !== "DAY_VOTING") {
      throw new Error(`Vote rejected: room phase is ${room.phase}, expected DAY_VOTING.`);
    }

    const voter = room.players.find((p) => p.id === voterId);
    if (!voter || !voter.alive) {
      throw new Error(`Voter ${voterId} is dead or does not exist.`);
    }

    if (targetPlayerId !== "SKIP") {
      const target = room.players.find((p) => p.id === targetPlayerId);
      if (!target) throw new Error(`Vote target ${targetPlayerId} not found in room.`);
      if (!target.alive) throw new Error(`Cannot vote for dead player ${targetPlayerId}.`);
    }

    // 1. AWAIT database persistence commit BEFORE updating votes in RAM
    const { isDuplicate } = await this.appendEvent(
      room,
      "VOTE_CAST",
      voterId,
      {
        voterId,
        targetPlayerId,
      },
      commandContext
    );

    // If duplicate command retransmission, NO-OP: return current state without mutation
    if (isDuplicate) {
      return { room, resolved: false };
    }

    // 2. Commit vote to RAM only after database confirms persistence
    room.votes[voterId] = targetPlayerId;

    // Count eligible living voters (excluding silenced)
    const eligibleVoters = room.players.filter((p) => p.alive && !p.silenced);
    const hasEveryoneVoted = eligibleVoters.every((p) => Boolean(room.votes[p.id]));

    if (hasEveryoneVoted) {
      await this.resolveDayVotePhase(room);
      return { room, resolved: true };
    }

    return { room, resolved: false };
  }

  /**
   * Resolves Day Votes using the Golden Engine modules.
   * STRICT PERSISTENCE INVARIANT:
   * Commits results in an atomic database transaction BEFORE mutating RAM room state.
   */
  public static async resolveDayVotePhase(
    room: AuthoritativeRoomState,
    isTimeout: boolean = false,
    commandContext?: CommandRecord
  ): Promise<AuthoritativeRoomState> {
    const candidateTimeoutCount = isTimeout ? room.timeoutCount + 1 : room.timeoutCount;
    const batch: Array<{ type: GameEventType; payload: any; actorId?: string }> = [];

    if (isTimeout) {
      batch.push({
        type: "TIMEOUT_OCCURRED",
        payload: { timeoutCount: candidateTimeoutCount },
      });
    }

    const { updatedPlayers, outcome } = resolveDayVotes(room.players, room.votes, {
      dayCount: room.dayCount,
      isTimeout,
    });

    // If a player was eliminated, resolve cascading death chain
    let finalPlayers = updatedPlayers;
    if (outcome.eliminatedPlayer) {
      const deathChain = resolveDeathChain(
        updatedPlayers,
        [outcome.eliminatedPlayer.id],
        "VOTE"
      );
      finalPlayers = deathChain.updatedPlayers;
    }

    const winResult = evaluateWinConditions(finalPlayers, { timeoutCount: candidateTimeoutCount });

    batch.push({
      type: "VOTE_RESOLVED",
      payload: {
        tally: outcome.tally,
        topTargetId: outcome.topTargetId,
        isTie: outcome.isTie,
        eliminatedPlayerId: outcome.eliminatedPlayer?.id || null,
        princeSurvived: outcome.princeSurvived,
        tannerWon: outcome.tannerWon,
        dayTimerReduced: outcome.dayTimerReduced,
        updatedPlayers: finalPlayers.map((p) => ({ ...p })), // Canonical snapshot of all player states
      },
    });

    let candidatePhase: AuthoritativeRoomState["phase"];
    let candidateNightCount = room.nightCount;
    let candidateNightActions: EngineNightAction[] = [];

    const canonicalWinResult = winResult.gameEnded ? {
      winner: winResult.winner || "Draw",
      reason: winResult.reason || "Pertarungan di desa telah mencapai akhir!",
      winningPlayerIds: winResult.winningPlayerIds,
      winningTeams: winResult.winningTeams,
    } : null;

    if (winResult.gameEnded) {
      candidatePhase = "GAME_OVER";
      batch.push({
        type: "WIN_CONDITION_SATISFIED",
        payload: canonicalWinResult,
      });
    } else {
      candidatePhase = "NIGHT_ACTIVE";
      candidateNightCount = room.nightCount + 1;
      candidateNightActions = buildEngineNightActions(finalPlayers, candidateNightCount, false);
      batch.push({
        type: "PHASE_TRANSITIONED",
        payload: {
          phase: "NIGHT_ACTIVE",
          nightCount: candidateNightCount,
          dayCount: room.dayCount,
        },
      });
    }

    const now = Date.now();
    const DURATION = 10000;
    const eligibleWolves = candidatePhase === "NIGHT_ACTIVE"
      ? finalPlayers.filter((p) => p.alive && canParticipateInWerewolfPackVote(p, finalPlayers, candidateNightCount))
      : [];
    const seer = candidatePhase === "NIGHT_ACTIVE"
      ? finalPlayers.find((p) => p.alive && (p.role_id === "ROLE-002" || p.role_id === "ROLE-022" || p.canonical_name?.toLowerCase().includes("seer") || p.action_type === "Investigate"))
      : undefined;

    if (candidatePhase === "NIGHT_ACTIVE") {
      if (eligibleWolves.length > 0) {
        batch.push({
          type: "PACK_VOTE_STARTED",
          payload: {
            startedAt: now,
            expiresAt: now + DURATION,
            isRevote: false,
          },
        });
      }

      if (seer) {
        batch.push({
          type: "SEER_WINDOW_STARTED",
          actorId: seer.id,
          payload: {
            startedAt: now,
            expiresAt: now + DURATION,
            seerPlayerId: seer.id,
          },
        });
      }
    }

    // 1. PERSIST ATOMIC BATCH TO DB FIRST
    const { isDuplicate } = await this.appendBatch(room, batch, commandContext);
    if (isDuplicate) {
      return room;
    }

    // 2. ONLY UPON SUCCESSFUL DB COMMIT: Apply candidate state to RAM!
    if (room.packVoteWindow?.timer) clearTimeout(room.packVoteWindow.timer);
    if (room.seerActionState?.timer) clearTimeout(room.seerActionState.timer);
    delete room.packVoteWindow;
    delete room.seerActionState;
    room.packVotes = {};

    room.timeoutCount = candidateTimeoutCount;
    room.players = finalPlayers;
    room.phase = candidatePhase;
    room.nightCount = candidateNightCount;
    room.nightActions = candidateNightActions;
    room.votes = {};
    room.activeWinResult = canonicalWinResult;

    if (candidatePhase === "NIGHT_ACTIVE") {
      if (eligibleWolves.length > 0) {
        room.packVoteWindow = {
          startedAt: now,
          expiresAt: now + DURATION,
          isRevote: false,
          eligibleWolfIds: eligibleWolves.map((w) => w.id),
          timer: setTimeout(async () => {
            try {
              await RoomManager.closePackVoteAndTally(room.roomId);
            } catch (err) {
              console.error("Pack vote timer error:", err);
            }
          }, DURATION).unref(),
        };
      }

      if (seer) {
        room.seerActionState = {
          startedAt: now,
          expiresAt: now + DURATION,
          checked: false,
          timer: setTimeout(async () => {
            try {
              await RoomManager.closeSeerWindow(room.roomId);
            } catch (err) {
              console.error("Seer window timer error:", err);
            }
          }, DURATION).unref(),
        };
      }
    }

    return room;
  }

  /**
   * Resets match from GAME_OVER back to LOBBY for a new round in the same room.
   */
  public static async restartGame(
    roomId: string,
    hostPlayerId: string,
    commandContext?: CommandRecord
  ): Promise<AuthoritativeRoomState> {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error(`Room ${roomId} not found.`);
    if (room.phase !== "GAME_OVER") throw new Error(`Can only restart game from GAME_OVER, current: ${room.phase}`);
    if (room.hostPlayerId !== hostPlayerId) throw new Error("Only the host can restart the game.");

    const resetPlayers = room.players.map((p) => ({
      playerId: p.id,
      alive: true,
      isReady: false,
      silenced: false,
      protected: false,
      inCult: false,
      hasUsedAbility: false,
    }));

    // 1. Commit MATCH_RESTARTED event to DB first with complete player reset payload
    await this.appendEvent(room, "MATCH_RESTARTED", hostPlayerId, {
      phase: "LOBBY",
      dayCount: 0,
      nightCount: 0,
      resetPlayers,
    }, commandContext);

    // 2. Reset RAM room state
    if (room.packVoteWindow?.timer) clearTimeout(room.packVoteWindow.timer);
    if (room.seerActionState?.timer) clearTimeout(room.seerActionState.timer);
    delete room.packVoteWindow;
    delete room.seerActionState;
    room.packVotes = {};

    room.phase = "LOBBY";
    room.dayCount = 0;
    room.nightCount = 0;
    room.votes = {};
    room.nightActions = [];
    room.activeWinResult = null;
    room.lastNightResult = null;
    for (const p of room.players) {
      p.alive = true;
      p.isReady = false;
      p.silenced = false;
      p.protected = false;
      p.inCult = false;
      p.hasUsedAbility = false;
    }
    room.updatedAt = Date.now();
    return room;
  }

  /**
   * Handles client socket connection registration.
   */
  public static async registerClientSocket(
    socketId: string,
    socket: any,
    playerId: string,
    roomId: string
  ): Promise<void> {
    return this.enqueueRoomOperation(roomId, async () => {
      const room = this.rooms.get(roomId);
      if (!room) return;

      // Clear disconnect grace period timer if reconnecting
      const existingTimer = room.disconnectTimers.get(playerId);
      if (existingTimer) {
        clearTimeout(existingTimer);
        room.disconnectTimers.delete(playerId);
        await this.appendEvent(room, "PLAYER_RECONNECTED", playerId, { playerId });
      }

      room.clients.set(playerId, {
        socketId,
        socket,
        playerId,
        roomId,
        isAlive: true,
        lastPingAt: Date.now(),
      });
    });
  }

  /**
   * Handles client socket disconnection with grace period.
   */
  public static async handleClientDisconnect(
    roomId: string,
    playerId: string,
    socketId?: string
  ): Promise<void> {
    return this.enqueueRoomOperation(roomId, async () => {
      const room = this.rooms.get(roomId);
      if (!room) return;

      const current = room.clients.get(playerId);
      if (socketId && current && current.socketId !== socketId) {
        // Obsolete or stale socket from previous session — do NOT evict active reconnected socket
        return;
      }

      room.clients.delete(playerId);

      const disconnectDeadline = Date.now() + config.disconnectGracePeriodMs;
      await this.appendEvent(room, "PLAYER_DISCONNECTED", playerId, {
        playerId,
        disconnectDeadline,
      });

      // Set grace period timer that triggers authoritative disconnect timeout
      const timer = setTimeout(async () => {
        room.disconnectTimers.delete(playerId);
        try {
          await RoomManager.handleDisconnectTimeout(roomId, playerId);
        } catch (err) {
          console.error(`Error handling disconnect timeout for ${playerId} in ${roomId}:`, err);
        }
      }, config.disconnectGracePeriodMs);

      room.disconnectTimers.set(playerId, timer);
    });
  }

  /**
   * Authoritative disconnect timeout handler:
   * Commits canonical PLAYER_DISCONNECT_TIMEOUT event to database before mutating RAM.
   */
  public static async handleDisconnectTimeout(roomId: string, playerId: string): Promise<void> {
    return this.enqueueRoomOperation(roomId, async () => {
      const room = this.rooms.get(roomId);
      if (!room) return;

      const player = room.players.find((p) => p.id === playerId);
      if (!player) return;

      // 1. Commit canonical event PLAYER_DISCONNECT_TIMEOUT to EventStore first
      await this.appendEvent(room, "PLAYER_DISCONNECT_TIMEOUT", playerId, {
        playerId,
        phase: room.phase,
        reason: "Disconnect grace period expired without reconnection.",
      });

      // 2. Mutate RAM state only after persistence commit
      if (room.phase === "LOBBY") {
        room.players = room.players.filter((p) => p.id !== playerId);
      } else {
        // In active game, player is forfeited/eliminated
        player.alive = false;
      }

      FogOfWarDispatcher.dispatchRoomSync(room);
    });
  }

  /**
   * Checks if all night actions and timed action windows have finished,
   * automatically resolving the night if so.
   */
  public static async checkNightAutoResolve(room: AuthoritativeRoomState): Promise<boolean> {
    if (room.phase !== "NIGHT_ACTIVE") return false;

    // Do not auto-resolve while pack vote window is active
    if (room.packVoteWindow) {
      return false;
    }

    // Do not auto-resolve while Seer window is open and unexpired
    if (room.seerActionState && !room.seerActionState.checked && Date.now() < room.seerActionState.expiresAt) {
      return false;
    }

    // Check if all actions in nightActions have completed
    const allCompleted = room.nightActions.every((a) => a.completed);
    if (allCompleted && room.nightActions.length > 0) {
      await this.resolveNightPhase(room);
      return true;
    }

    return false;
  }

  /**
   * Submits or updates a vote from an eligible werewolf during the pack vote window.
   * Dynamic: A wolf can change their vote anytime before the 10s window expires.
   */
  public static async submitPackVote(
    roomId: string,
    voterPlayerId: string,
    targetPlayerId: string,
    commandContext?: CommandRecord
  ): Promise<AuthoritativeRoomState> {
    return this.enqueueRoomOperation(roomId, async () => {
      const room = this.rooms.get(roomId);
      if (!room) throw new Error(`Room ${roomId} not found.`);
      if (room.phase !== "NIGHT_ACTIVE") {
        throw new Error(`Cannot vote in pack: room phase is ${room.phase}, expected NIGHT_ACTIVE.`);
      }
      if (!room.packVoteWindow) {
        throw new Error("Pack voting window is not active.");
      }
      if (Date.now() > room.packVoteWindow.expiresAt) {
        throw new Error("Pack voting window has expired.");
      }

      const voter = room.players.find((p) => p.id === voterPlayerId);
      if (!voter || !voter.alive) throw new Error("Voter must be alive.");
      if (!canParticipateInWerewolfPackVote(voter, room.players, room.nightCount)) {
        throw new Error("Only eligible werewolves can participate in pack voting.");
      }

      const target = room.players.find((p) => p.id === targetPlayerId);
      if (!target || !target.alive) throw new Error("Target must be an alive player.");

      if (room.packVoteWindow.allowedTargets && room.packVoteWindow.allowedTargets.length > 0) {
        if (!room.packVoteWindow.allowedTargets.includes(targetPlayerId)) {
          throw new Error("Target is not in the allowed revote candidate pool.");
        }
      }

      if (!room.packVotes) room.packVotes = {};
      const nextVotes = { ...room.packVotes, [voterPlayerId]: targetPlayerId };

      // 1. Commit PACK_VOTE_UPDATED event to DB first
      const { isDuplicate } = await this.appendEvent(
        room,
        "PACK_VOTE_UPDATED",
        voterPlayerId,
        {
          voterPlayerId,
          targetPlayerId,
          votes: nextVotes,
        },
        commandContext
      );

      if (isDuplicate) return room;

      // 2. Commit to RAM
      room.packVotes[voterPlayerId] = targetPlayerId;
      room.updatedAt = Date.now();

      FogOfWarDispatcher.dispatchRoomSync(room);
      return room;
    });
  }

  /**
   * Authoritatively closes the werewolf pack vote window, tallies votes,
   * handles ties (triggers 10s revote or deterministic null attack), and updates night action.
   */
  public static async closePackVoteAndTally(
    roomId: string,
    commandContext?: CommandRecord
  ): Promise<AuthoritativeRoomState> {
    return this.enqueueRoomOperation(roomId, async () => {
      const room = this.rooms.get(roomId);
      if (!room || room.phase !== "NIGHT_ACTIVE" || !room.packVoteWindow) {
        return room!;
      }

      if (room.packVoteWindow.timer) {
        clearTimeout(room.packVoteWindow.timer);
        delete room.packVoteWindow.timer;
      }

      const votes = room.packVotes || {};
      const tally: Record<string, number> = {};
      for (const [, targetId] of Object.entries(votes)) {
        if (targetId) {
          tally[targetId] = (tally[targetId] || 0) + 1;
        }
      }

      const entries = Object.entries(tally);
      let maxVotes = 0;
      for (const [, count] of entries) {
        if (count > maxVotes) maxVotes = count;
      }

      const topCandidates = maxVotes > 0 ? entries.filter(([, count]) => count === maxVotes).map(([id]) => id) : [];
      const isRevote = room.packVoteWindow.isRevote;

      if (topCandidates.length === 1) {
        // Clear winner!
        const resolvedTargetId = topCandidates[0];
        const batch = [
          {
            type: "PACK_VOTE_CLOSED" as GameEventType,
            payload: { tally, resolvedTargetId },
          },
          {
            type: "PACK_TARGET_RESOLVED" as GameEventType,
            payload: { targetPlayerId: resolvedTargetId, isTieBreakFailure: false },
          },
        ];

        const { isDuplicate } = await this.appendBatch(room, batch, commandContext);
        if (isDuplicate) return room;

        const wolfAction = room.nightActions.find(
          (a) =>
            a.role_id === "SYSTEM-WEREWOLF-PACK" ||
            a.id === "SYSTEM-WEREWOLF-PACK" ||
            a.action_type === "Kill" ||
            a.role_name.toLowerCase().includes("werewolf") ||
            a.role_name.toLowerCase().includes("werewolves") ||
            a.action_type.toLowerCase().includes("werewolf")
        );
        if (wolfAction) {
          wolfAction.target_player_id = resolvedTargetId;
          wolfAction.completed = true;
        }

        delete room.packVoteWindow;

        await this.checkNightAutoResolve(room);
        FogOfWarDispatcher.dispatchRoomSync(room);
        return room;
      } else if (topCandidates.length > 1 && !isRevote) {
        // Tie on initial vote -> Launch 10s revote restricted strictly to tied targets!
        const now = Date.now();
        const DURATION = 10000;
        const revotePayload = {
          startedAt: now,
          expiresAt: now + DURATION,
          allowedTargets: topCandidates,
        };

        const { isDuplicate } = await this.appendEvent(
          room,
          "PACK_REVOTE_STARTED",
          undefined,
          revotePayload,
          commandContext
        );
        if (isDuplicate) return room;

        // Reset votes for revote
        room.packVotes = {};
        const eligibleWolfIds = room.packVoteWindow.eligibleWolfIds;
        room.packVoteWindow = {
          startedAt: now,
          expiresAt: now + DURATION,
          isRevote: true,
          allowedTargets: topCandidates,
          eligibleWolfIds,
          timer: setTimeout(async () => {
            try {
              await RoomManager.closePackVoteAndTally(roomId);
            } catch (err) {
              console.error("Revote timer error:", err);
            }
          }, DURATION).unref(),
        };

        FogOfWarDispatcher.dispatchRoomSync(room);
        return room;
      } else {
        // Either:
        // 1. Tie after revote (isRevote === true)
        // 2. Zero votes cast (topCandidates.length === 0)
        // DETERMINISTIC RULE: No Werewolf attack that night! (targetPlayerId: null)
        const isTieFailure = topCandidates.length > 1 && isRevote;
        const batch = [
          {
            type: "PACK_VOTE_CLOSED" as GameEventType,
            payload: { tally, resolvedTargetId: null },
          },
          {
            type: "PACK_TARGET_RESOLVED" as GameEventType,
            payload: { targetPlayerId: null, isTieBreakFailure: isTieFailure },
          },
        ];

        const { isDuplicate } = await this.appendBatch(room, batch, commandContext);
        if (isDuplicate) return room;

        const wolfAction = room.nightActions.find(
          (a) =>
            a.role_id === "SYSTEM-WEREWOLF-PACK" ||
            a.id === "SYSTEM-WEREWOLF-PACK" ||
            a.action_type === "Kill" ||
            a.role_name.toLowerCase().includes("werewolf") ||
            a.role_name.toLowerCase().includes("werewolves") ||
            a.action_type.toLowerCase().includes("werewolf")
        );
        if (wolfAction) {
          wolfAction.target_player_id = null;
          wolfAction.completed = true;
        }

        delete room.packVoteWindow;

        await this.checkNightAutoResolve(room);
        FogOfWarDispatcher.dispatchRoomSync(room);
        return room;
      }
    });
  }

  /**
   * Submits a single authoritative Seer check (max 1 check per night).
   */
  public static async submitSeerCheck(
    roomId: string,
    seerPlayerId: string,
    targetPlayerId: string,
    commandContext?: CommandRecord
  ): Promise<AuthoritativeRoomState> {
    return this.enqueueRoomOperation(roomId, async () => {
      const room = this.rooms.get(roomId);
      if (!room) throw new Error(`Room ${roomId} not found.`);
      if (room.phase !== "NIGHT_ACTIVE") {
        throw new Error(`Cannot perform seer check: room phase is ${room.phase}, expected NIGHT_ACTIVE.`);
      }
      if (!room.seerActionState) {
        throw new Error("Seer check window is not active.");
      }
      if (room.seerActionState.checked) {
        throw new Error("Seer has already performed their check for tonight.");
      }
      if (Date.now() > room.seerActionState.expiresAt) {
        throw new Error("Seer check window has expired.");
      }

      const seer = room.players.find((p) => p.id === seerPlayerId);
      if (!seer || !seer.alive) throw new Error("Seer must be alive.");
      const isSeerRole =
        seer.role_id === "ROLE-002" ||
        seer.role_id === "ROLE-022" ||
        seer.canonical_name?.toLowerCase().includes("seer") ||
        seer.action_type === "Investigate";
      if (!isSeerRole) throw new Error("Only the Seer can perform a seer check.");

      if (targetPlayerId === seerPlayerId) {
        throw new Error("Seer cannot check themselves.");
      }
      const target = room.players.find((p) => p.id === targetPlayerId);
      if (!target || !target.alive) throw new Error("Target must be an alive player.");

      const result: "Werewolf" | "Villager" = (target.seer_result as "Werewolf" | "Villager") || (target.team === "Werewolf" ? "Werewolf" : "Villager");

      if (room.seerActionState.timer) {
        clearTimeout(room.seerActionState.timer);
        delete room.seerActionState.timer;
      }

      // 1. Commit SEER_CHECK_RESOLVED event to DB first
      const { isDuplicate } = await this.appendEvent(
        room,
        "SEER_CHECK_RESOLVED",
        seerPlayerId,
        {
          seerPlayerId,
          targetPlayerId,
          result,
        },
        commandContext
      );

      if (isDuplicate) return room;

      // 2. Commit to RAM
      room.seerActionState.checked = true;
      room.seerActionState.targetPlayerId = targetPlayerId;
      room.seerActionState.result = result;

      // Update Seer's night action in nightActions
      const seerAction = room.nightActions.find(
        (a) => a.action_type === "Investigate" || a.role_id === "ROLE-002" || a.role_id === "ROLE-022" || a.player_ids.includes(seerPlayerId)
      );
      if (seerAction) {
        seerAction.target_player_id = targetPlayerId;
        seerAction.completed = true;
      }

      await this.checkNightAutoResolve(room);
      FogOfWarDispatcher.dispatchRoomSync(room);
      return room;
    });
  }

  /**
   * Closes the Seer window when the 10s timer expires.
   */
  public static async closeSeerWindow(
    roomId: string,
    commandContext?: CommandRecord
  ): Promise<AuthoritativeRoomState> {
    return this.enqueueRoomOperation(roomId, async () => {
      const room = this.rooms.get(roomId);
      if (!room || room.phase !== "NIGHT_ACTIVE" || !room.seerActionState) {
        return room!;
      }

      if (room.seerActionState.timer) {
        clearTimeout(room.seerActionState.timer);
        delete room.seerActionState.timer;
      }

      room.seerActionState.checked = true;

      const seerAction = room.nightActions.find(
        (a) => a.action_type === "Investigate" || a.role_id === "ROLE-002" || a.role_id === "ROLE-022"
      );
      if (seerAction) {
        seerAction.completed = true;
      }

      await this.checkNightAutoResolve(room);
      FogOfWarDispatcher.dispatchRoomSync(room);
      return room;
    });
  }
}
