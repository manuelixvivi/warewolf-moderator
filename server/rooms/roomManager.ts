// ============================================================
// ASPIRE: WEREWOLF — Authoritative Room Manager
// State Machine & Lifecycle Authority
// "Server owns the state. Engine resolves truth.
//  PostgreSQL = Canonical Historical Truth. State = Projection(Event[1..N])."
// ============================================================

import { AsyncLocalStorage } from "async_hooks";
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
import { ROLE_BY_ID, ALL_ROLES, buildEngineNightActions } from "../../src/lib/engine/abilityRegistry";
import { resolveNightActions } from "../../src/lib/engine/actionResolver";
import { resolveDeathChain } from "../../src/lib/engine/deathResolver";
import { resolveDayVotes } from "../../src/lib/engine/voteResolver";
import { evaluateWinConditions } from "../../src/lib/engine/winEngine";
import {
  selectBalancedSubsetFromPool,
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
    const recovered = await ReplayEngine.reconstructState(roomId, defaultEventStore);
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
  ): Promise<GameEvent<T>> {
    const candidateSequence = room.sequenceNumber + 1;
    const signature = signGameEvent(room.roomId, candidateSequence, type, payload);

    const event: GameEvent<T> = {
      eventId: uuidv7(),
      roomId: room.roomId,
      sequence: candidateSequence,
      timestamp: Date.now(),
      type,
      actorId,
      payload,
      serverSignature: signature,
    };

    // 1. AWAIT database append first (strict historical truth before RAM commit)
    if (commandContext) {
      const { isDuplicate } = await defaultEventStore.appendEventWithCommand(event, commandContext);
      if (isDuplicate) {
        return event;
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

    return event;
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
  ): Promise<GameEvent[]> {
    if (eventsToCommit.length === 0) return [];

    let currentSeq = room.sequenceNumber;
    const preparedEvents: GameEvent[] = eventsToCommit.map((item) => {
      currentSeq++;
      return {
        eventId: uuidv7(),
        roomId: room.roomId,
        sequence: currentSeq,
        timestamp: Date.now(),
        type: item.type,
        actorId: item.actorId,
        payload: item.payload,
        serverSignature: signGameEvent(room.roomId, currentSeq, item.type, item.payload),
      };
    });

    // 1. AWAIT atomic batch persistence (transactional BEGIN ... COMMIT)
    if (commandContext) {
      const { isDuplicate } = await defaultEventStore.appendBatchWithCommand(preparedEvents, commandContext);
      if (isDuplicate) {
        return preparedEvents;
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

    return preparedEvents;
  }

  /**
   * Creates a new authoritative room.
   */
  public static async createRoom(
    hostPlayerId: string,
    hostPlayerName: string,
    gameMode: AuthoritativeRoomState["gameMode"] = "MODE_1_FIXED",
    customRoomId?: string
  ): Promise<{ room: AuthoritativeRoomState; sessionToken: string }> {
    const roomId = customRoomId || `ROOM-${Math.floor(1000 + Math.random() * 9000)}`;

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
    };
    const initEventSignature = signGameEvent(roomId, 1, "ROOM_INITIALIZED", initEventPayload);
    const initEvent: GameEvent = {
      eventId: uuidv7(),
      roomId,
      sequence: 1,
      timestamp: Date.now(),
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
    commandContext?: CommandRecord
  ): Promise<{ room: AuthoritativeRoomState; sessionToken: string }> {
    return this.enqueueRoomOperation(roomId, async () => {
      const room = this.rooms.get(roomId);
      if (!room) {
        throw new Error(`Room ${roomId} not found.`);
      }

      if (room.phase !== "LOBBY") {
        throw new Error(`Cannot join room ${roomId}; game is already in phase ${room.phase}.`);
      }

      let existingPlayer = room.players.find((p) => p.id === playerId);
      if (!existingPlayer) {
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
        const signature = signGameEvent(room.roomId, candidateSequence, "PLAYER_JOINED", joinPayload);
        const joinEvent: GameEvent = {
          eventId: uuidv7(),
          roomId: room.roomId,
          sequence: candidateSequence,
          timestamp: Date.now(),
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
    const room = this.rooms.get(roomId);
    if (!room) throw new Error(`Room ${roomId} not found.`);
    if (room.phase !== "LOBBY") throw new Error("Ready state can only be toggled in LOBBY.");

    const player = room.players.find((p) => p.id === playerId);
    if (!player) throw new Error(`Player ${playerId} not found in room.`);

    const newReadyState = !player.isReady;

    // 1. AWAIT database append first (strict historical truth before RAM commit)
    await this.appendEvent(
      room,
      "PLAYER_READY_CHANGED",
      playerId,
      {
        playerId,
        isReady: newReadyState,
      },
      commandContext
    );

    // 2. Only upon successful persistence commit, update authoritative state in RAM
    player.isReady = newReadyState;
    room.updatedAt = Date.now();
    return room;
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

    if (options?.fixedRoles && options.fixedRoles.length > 0) {
      const expanded: typeof ALL_ROLES = [];
      for (const sel of options.fixedRoles) {
        const def = ROLE_BY_ID.get(sel.role_id);
        if (def) {
          for (let i = 0; i < sel.count; i++) expanded.push(def);
        }
      }
      assignedRoleDefs = shuffleRoles(expanded);
    } else if (room.gameMode === "MODE_2_POOL" && options?.selectedRolePool) {
      const poolRoles: SelectedRole[] = options.selectedRolePool.map((id) => {
        const def = ROLE_BY_ID.get(id);
        return {
          role_id: id,
          canonical_name: def?.canonical_name || "Unknown",
          count: 1,
        };
      });
      assignedRoleDefs = selectBalancedSubsetFromPool(poolRoles, playerCount);
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

    // ATOMIC PERSISTENCE: Commit GAME_STARTED, ROLES_ASSIGNED, and PHASE_TRANSITIONED together
    // Includes complete canonical role snapshot & ruleset version for immutable long-term replay
    await this.appendBatch(room, [
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
    ], commandContext);

    // ONLY UPON SUCCESSFUL DATABASE BATCH COMMIT: Apply candidate state to RAM!
    room.players = candidatePlayers;
    room.nightCount = candidateNightCount;
    room.dayCount = candidateDayCount;
    room.phase = candidatePhase;
    room.nightActions = candidateNightActions;

    // Update query read-model projection in match_participants
    if (defaultEventStore.updateParticipantsBatch) {
      await defaultEventStore.updateParticipantsBatch(
        room.roomId,
        candidatePlayers.map((p) => ({
          playerId: p.id,
          roleId: p.role_id,
          canonicalName: p.canonical_name,
          team: p.team,
          alive: p.alive,
        }))
      );
    }

    return room;
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
      (a) => a.id === actionId && a.player_ids.includes(actorPlayerId)
    );

    if (!action) {
      throw new Error(`Action ${actionId} not found or actor ${actorPlayerId} unauthorized.`);
    }

    // 1. AWAIT database persistence commit BEFORE mutating action in RAM
    await this.appendEvent(room, "NIGHT_ACTION_SUBMITTED", actorPlayerId, {
      actionId,
      targetPlayerId,
      secondaryTargetId: secondaryTargetId || null,
    }, commandContext);

    // 2. Commit to RAM only after database persistence confirms success
    action.target_player_id = targetPlayerId;
    action.secondary_target_id = secondaryTargetId || null;
    action.completed = true;

    // Check if all actions completed
    const allCompleted = room.nightActions.every((a) => a.completed);
    if (allCompleted) {
      await this.resolveNightPhase(room);
      return { room, resolved: true };
    }

    return { room, resolved: false };
  }

  /**
   * Resolves the night phase using the Golden Engine modules.
   * STRICT PERSISTENCE INVARIANT:
   * Commits results in an atomic database transaction BEFORE mutating RAM room state.
   */
  public static async resolveNightPhase(room: AuthoritativeRoomState): Promise<AuthoritativeRoomState> {
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

    if (winResult.gameEnded) {
      batch.push({
        type: "WIN_CONDITION_SATISFIED",
        payload: winResult,
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
    await this.appendBatch(room, batch);

    // 2. ONLY UPON SUCCESSFUL DB COMMIT: Apply candidate state to RAM!
    room.players = candidatePlayers;
    room.dayCount = candidateDayCount;
    room.phase = candidatePhase;
    room.votes = {};
    room.nightActions = [];

    // Update query read-model projections
    const deadPlayers = candidatePlayers.filter((p: PlayerEngineState) => !p.alive);
    if (defaultEventStore.updateParticipantsBatch && deadPlayers.length > 0) {
      await defaultEventStore.updateParticipantsBatch(
        room.roomId,
        deadPlayers.map((p: PlayerEngineState) => ({ playerId: p.id, alive: false }))
      );
    }
    if (candidatePhase === "GAME_OVER" && defaultEventStore.updateMatchStatus) {
      await defaultEventStore.updateMatchStatus(
        room.roomId,
        "FINISHED",
        winResult.winner || undefined,
        winResult.reason || undefined
      );
    }

    return room;
  }

  /**
   * Transitions from Day Discussion to Day Voting.
   */
  public static async startDayVoting(roomId: string): Promise<AuthoritativeRoomState> {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error(`Room ${roomId} not found.`);
    if (room.phase !== "DAY_DISCUSSION") {
      throw new Error(`Cannot start voting from phase ${room.phase}.`);
    }

    // 1. PERSIST TO DB FIRST
    await this.appendEvent(room, "PHASE_TRANSITIONED", undefined, {
      phase: "DAY_VOTING",
      dayCount: room.dayCount,
      nightCount: room.nightCount,
    });

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

    // 1. AWAIT database persistence commit BEFORE updating votes in RAM
    await this.appendEvent(room, "VOTE_CAST", voterId, {
      voterId,
      targetPlayerId,
    }, commandContext);

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
    isTimeout: boolean = false
  ): Promise<AuthoritativeRoomState> {
    const candidateTimeoutCount = isTimeout ? room.timeoutCount + 1 : room.timeoutCount;
    const batch: Array<{ type: GameEventType; payload: any }> = [];

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

    if (winResult.gameEnded) {
      candidatePhase = "GAME_OVER";
      batch.push({
        type: "WIN_CONDITION_SATISFIED",
        payload: winResult,
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

    // 1. PERSIST ATOMIC BATCH TO DB FIRST
    await this.appendBatch(room, batch);

    // 2. ONLY UPON SUCCESSFUL DB COMMIT: Apply candidate state to RAM!
    room.timeoutCount = candidateTimeoutCount;
    room.players = finalPlayers;
    room.phase = candidatePhase;
    room.nightCount = candidateNightCount;
    room.nightActions = candidateNightActions;
    room.votes = {};

    // Update query read-model projections
    const eliminated = outcome.eliminatedPlayer;
    if (defaultEventStore.updateParticipant && eliminated) {
      await defaultEventStore.updateParticipant(room.roomId, eliminated.id, { alive: false });
    }
    if (candidatePhase === "GAME_OVER" && defaultEventStore.updateMatchStatus) {
      await defaultEventStore.updateMatchStatus(
        room.roomId,
        "FINISHED",
        winResult.winner || undefined,
        winResult.reason || undefined
      );
    }

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
  }

  /**
   * Handles client socket disconnection with grace period.
   */
  public static async handleClientDisconnect(roomId: string, playerId: string): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) return;

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
        if (defaultEventStore.updateParticipant) {
          await defaultEventStore.updateParticipant(roomId, playerId, { alive: false });
        }
      } else {
        // In active game, player is forfeited/eliminated
        player.alive = false;
        if (defaultEventStore.updateParticipant) {
          await defaultEventStore.updateParticipant(roomId, playerId, { alive: false });
        }
      }

      FogOfWarDispatcher.dispatchRoomSync(room);
    });
  }
}
