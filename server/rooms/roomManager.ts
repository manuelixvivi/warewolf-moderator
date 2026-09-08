// ============================================================
// ASPIRE: WEREWOLF — Authoritative Room Manager
// State Machine & Lifecycle Authority
// "Server owns the state. Engine resolves truth.
//  PostgreSQL = Canonical Historical Truth. State = Projection(Event[1..N])."
// ============================================================

import { v4 as uuidv4 } from "uuid";
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
import { defaultEventStore, ReplayEngine } from "../persistence";

export class RoomManager {
  public static rooms = new Map<string, AuthoritativeRoomState>();

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
    payload: T
  ): Promise<GameEvent<T>> {
    const candidateSequence = room.sequenceNumber + 1;
    const signature = signGameEvent(room.roomId, candidateSequence, type, payload);

    const event: GameEvent<T> = {
      eventId: uuidv4(),
      roomId: room.roomId,
      sequence: candidateSequence,
      timestamp: Date.now(),
      type,
      actorId,
      payload,
      serverSignature: signature,
    };

    // 1. AWAIT database append first (strict historical truth before RAM commit)
    await defaultEventStore.appendEvent(event);

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
    eventsToCommit: Array<{ type: GameEventType; actorId?: string; payload: any }>
  ): Promise<GameEvent[]> {
    if (eventsToCommit.length === 0) return [];

    let currentSeq = room.sequenceNumber;
    const preparedEvents: GameEvent[] = eventsToCommit.map((item) => {
      currentSeq++;
      return {
        eventId: uuidv4(),
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
    await defaultEventStore.appendBatch(preparedEvents);

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

    const room: AuthoritativeRoomState = {
      roomId,
      hostPlayerId,
      gameMode,
      phase: "LOBBY",
      dayCount: 0,
      nightCount: 0,
      sequenceNumber: 0,
      timeoutCount: 0,
      players: [hostPlayer],
      votes: {},
      nightActions: [],
      eventLog: [],
      clients: new Map(),
      disconnectTimers: new Map(),
      processedCommandIds: new Set(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.rooms.set(roomId, room);

    await defaultEventStore.saveMatch({
      roomId,
      gameMode,
      hostPlayerId,
      hostPlayerName,
      status: "ACTIVE",
    });

    if (defaultEventStore.saveParticipant) {
      await defaultEventStore.saveParticipant({
        roomId,
        playerId: hostPlayerId,
        playerName: hostPlayerName,
        isHost: true,
        roleId: hostPlayer.role_id,
        canonicalName: hostPlayer.canonical_name,
        team: hostPlayer.team,
        alive: true,
      });
    }

    await this.appendEvent(room, "ROOM_INITIALIZED", hostPlayerId, {
      roomId,
      gameMode,
      hostPlayerId,
      hostPlayerName,
    });

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
    playerName: string
  ): Promise<{ room: AuthoritativeRoomState; sessionToken: string }> {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error(`Room ${roomId} not found.`);
    }

    if (room.phase !== "LOBBY") {
      throw new Error(`Cannot join room ${roomId}; game is already in phase ${room.phase}.`);
    }

    let existingPlayer = room.players.find((p) => p.id === playerId);
    if (!existingPlayer) {
      existingPlayer = {
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
      room.players.push(existingPlayer);

      if (defaultEventStore.saveParticipant) {
        await defaultEventStore.saveParticipant({
          roomId,
          playerId,
          playerName,
          isHost: false,
          roleId: existingPlayer.role_id,
          canonicalName: existingPlayer.canonical_name,
          team: existingPlayer.team,
          alive: true,
        });
      }

      await this.appendEvent(room, "PLAYER_JOINED", playerId, {
        playerId,
        playerName,
      });
    }

    const sessionToken = SessionManager.createSessionToken(
      playerId,
      playerName,
      roomId,
      existingPlayer.isHost
    );

    return { room, sessionToken };
  }

  /**
   * Toggles ready state in lobby.
   */
  public static toggleReady(roomId: string, playerId: string): AuthoritativeRoomState {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error(`Room ${roomId} not found.`);
    if (room.phase !== "LOBBY") throw new Error("Ready state can only be toggled in LOBBY.");

    const player = room.players.find((p) => p.id === playerId);
    if (!player) throw new Error(`Player ${playerId} not found in room.`);

    player.isReady = !player.isReady;
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
    }
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

    // Mutate internal player entities with assigned roles
    room.players.forEach((p, idx) => {
      const role = assignedRoleDefs[idx] || ALL_ROLES[0];
      p.role_id = role.role_id;
      p.canonical_name = role.canonical_name;
      p.team = role.team;
      p.originalTeam = role.team;
      p.category = role.category;
      p.seer_result = role.seer_result;
      p.role_points = role.role_points;
      p.balance_weight = role.balance_weight;
      p.night_priority = role.night_priority || 50;
      p.active_phase = role.active_phase;
      p.action_type = role.action_type;
      p.trigger = role.trigger;
      p.target_type = role.target_type;
      p.usage_limit = role.usage_limit;
      p.can_change_role = role.can_change_role;
      p.reveal_on_death = role.reveal_on_death;
      p.requires_engine_resolution = role.requires_engine_resolution;
      p.description_id = role.description_id || role.tooltip_id;
      p.tooltip_id = role.tooltip_id;
      p.alive = true;
      p.protected = false;
      p.silenced = false;
      p.inCult = false;
      p.hasUsedAbility = false;
    });

    room.nightCount = 1;
    room.dayCount = 0;
    room.phase = "NIGHT_ACTIVE";

    // Build night actions for Night 1
    room.nightActions = buildEngineNightActions(room.players, room.nightCount, false);

    // ATOMIC PERSISTENCE: Commit GAME_STARTED, ROLES_ASSIGNED, and PHASE_TRANSITIONED together
    await this.appendBatch(room, [
      {
        type: "GAME_STARTED",
        actorId: hostPlayerId,
        payload: {
          playerCount,
          gameMode: room.gameMode,
        },
      },
      {
        type: "ROLES_ASSIGNED",
        actorId: hostPlayerId,
        payload: {
          assignedCount: playerCount,
          assignments: room.players.map((p) => ({ playerId: p.id, role_id: p.role_id })),
        },
      },
      {
        type: "PHASE_TRANSITIONED",
        payload: {
          phase: "NIGHT_ACTIVE",
          nightCount: room.nightCount,
          dayCount: room.dayCount,
        },
      },
    ]);

    return room;
  }

  /**
   * Submits a night action. If all completed, automatically resolves night!
   */
  public static async submitNightAction(
    roomId: string,
    actorPlayerId: string,
    actionId: string,
    targetPlayerId: string | null,
    secondaryTargetId?: string | null
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

    action.target_player_id = targetPlayerId;
    action.secondary_target_id = secondaryTargetId || null;
    action.completed = true;

    await this.appendEvent(room, "NIGHT_ACTION_SUBMITTED", actorPlayerId, {
      actionId,
      targetPlayerId,
    });

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
   * Commits results in an atomic database transaction.
   */
  public static async resolveNightPhase(room: AuthoritativeRoomState): Promise<AuthoritativeRoomState> {
    room.phase = "NIGHT_RESOLVING";

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

    room.players = deathChain.updatedPlayers;

    // Advance to Day Phase
    room.dayCount += 1;
    room.votes = {};
    room.nightActions = [];

    // Check Win Conditions
    const winResult = evaluateWinConditions(room.players, { timeoutCount: room.timeoutCount });

    const batch: Array<{ type: GameEventType; payload: any }> = [
      {
        type: "NIGHT_RESOLVED",
        payload: {
          killedPlayerIds: outcome.killedPlayerIds,
          savedPlayerIds: outcome.savedPlayerIds,
          cascadeCasualties: deathChain.chainCasualties || [],
        },
      },
    ];

    if (winResult.gameEnded) {
      room.phase = "GAME_OVER";
      batch.push({
        type: "WIN_CONDITION_SATISFIED",
        payload: winResult,
      });
    } else {
      room.phase = "DAY_DISCUSSION";
      batch.push({
        type: "PHASE_TRANSITIONED",
        payload: {
          phase: "DAY_DISCUSSION",
          dayCount: room.dayCount,
          nightCount: room.nightCount,
        },
      });
    }

    await this.appendBatch(room, batch);
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

    room.phase = "DAY_VOTING";
    room.votes = {};

    await this.appendEvent(room, "PHASE_TRANSITIONED", undefined, {
      phase: "DAY_VOTING",
      dayCount: room.dayCount,
      nightCount: room.nightCount,
    });

    return room;
  }

  /**
   * Submits a vote during DAY_VOTING.
   */
  public static async submitVote(
    roomId: string,
    voterId: string,
    targetPlayerId: string
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

    room.votes[voterId] = targetPlayerId;

    await this.appendEvent(room, "VOTE_CAST", voterId, {
      voterId,
      targetPlayerId,
    });

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
   * Commits results in an atomic database transaction.
   */
  public static async resolveDayVotePhase(
    room: AuthoritativeRoomState,
    isTimeout: boolean = false
  ): Promise<AuthoritativeRoomState> {
    room.phase = "DAY_RESOLVING";

    const batch: Array<{ type: GameEventType; payload: any }> = [];

    if (isTimeout) {
      room.timeoutCount += 1;
      batch.push({
        type: "TIMEOUT_OCCURRED",
        payload: { timeoutCount: room.timeoutCount },
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

    room.players = finalPlayers;

    batch.push({
      type: "VOTE_RESOLVED",
      payload: {
        tally: outcome.tally,
        eliminatedPlayerId: outcome.eliminatedPlayer?.id || null,
        princeSurvived: outcome.princeSurvived,
        tannerWon: outcome.tannerWon,
        dayTimerReduced: outcome.dayTimerReduced,
      },
    });

    // Check Win Conditions
    const winResult = evaluateWinConditions(room.players, { timeoutCount: room.timeoutCount });
    if (winResult.gameEnded) {
      room.phase = "GAME_OVER";
      batch.push({
        type: "WIN_CONDITION_SATISFIED",
        payload: winResult,
      });
    } else {
      // Advance to Next Night
      room.nightCount += 1;
      room.phase = "NIGHT_ACTIVE";
      room.votes = {};
      room.nightActions = buildEngineNightActions(room.players, room.nightCount, false);

      batch.push({
        type: "PHASE_TRANSITIONED",
        payload: {
          phase: "NIGHT_ACTIVE",
          nightCount: room.nightCount,
          dayCount: room.dayCount,
        },
      });
    }

    await this.appendBatch(room, batch);
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
   * Handles client socket disconnection with 60-second grace period.
   */
  public static async handleClientDisconnect(roomId: string, playerId: string): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.clients.delete(playerId);

    await this.appendEvent(room, "PLAYER_DISCONNECTED", playerId, { playerId });

    // Set grace period timer
    const timer = setTimeout(() => {
      room.disconnectTimers.delete(playerId);
      // If still in lobby, remove player; if in-game, player remains marked disconnected
      if (room.phase === "LOBBY") {
        room.players = room.players.filter((p) => p.id !== playerId);
      }
    }, config.disconnectGracePeriodMs);

    room.disconnectTimers.set(playerId, timer);
  }
}
