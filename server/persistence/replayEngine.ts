// ============================================================
// ASPIRE: WEREWOLF — Deterministic Replay Engine
// Reconstructs canonical AuthoritativeRoomState from Event[1..N]
// "State is merely a deterministic projection of immutable events."
// ============================================================

import { GameEvent, CanonicalGameState } from "../../src/contracts";
import { AuthoritativeRoomState } from "../types";
import { IEventStore } from "./eventStore";
import { PlayerEngineState } from "../../src/lib/engine/types";
import { ALL_ROLES, ROLE_BY_ID, buildEngineNightActions } from "../../src/lib/engine/abilityRegistry";
import { verifyGameEventSignature } from "../config";

export class ReplayEngine {
  /**
   * Pure deterministic reducer: takes currentState + event -> returns nextState.
   */
  public static gameReducer(
    state: AuthoritativeRoomState | null,
    event: GameEvent
  ): AuthoritativeRoomState {
    switch (event.type) {
      case "ROOM_INITIALIZED": {
        const payload = event.payload;
        const hostPlayer: PlayerEngineState = {
          id: payload.hostPlayerId,
          name: payload.hostPlayerName,
          isHost: true,
          isReady: true,
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

        return {
          roomId: payload.roomId,
          hostPlayerId: payload.hostPlayerId,
          gameMode: payload.gameMode,
          phase: "LOBBY",
          dayCount: 0,
          nightCount: 0,
          sequenceNumber: event.sequence,
          timeoutCount: 0,
          players: [hostPlayer],
          votes: {},
          nightActions: [],
          eventLog: [event],
          clients: new Map(),
          disconnectTimers: new Map(),
          processedCommandIds: new Set(),
          createdAt: event.timestamp,
          updatedAt: event.timestamp,
        };
      }

      case "PLAYER_JOINED": {
        if (!state) throw new Error("Cannot apply PLAYER_JOINED on uninitialized state.");
        const payload = event.payload;
        const exists = state.players.some((p) => p.id === payload.playerId);
        const players = [...state.players];

        if (!exists) {
          players.push({
            id: payload.playerId,
            name: payload.playerName,
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
          });
        }

        return {
          ...state,
          players,
          sequenceNumber: event.sequence,
          eventLog: [...state.eventLog, event],
          updatedAt: event.timestamp,
        };
      }

      case "GAME_STARTED": {
        if (!state) throw new Error("Cannot apply GAME_STARTED on uninitialized state.");
        return {
          ...state,
          phase: "NIGHT_ACTIVE",
          nightCount: 1,
          dayCount: 0,
          sequenceNumber: event.sequence,
          eventLog: [...state.eventLog, event],
          updatedAt: event.timestamp,
        };
      }

      case "ROLES_ASSIGNED": {
        if (!state) throw new Error("Cannot apply ROLES_ASSIGNED on uninitialized state.");
        const roleAssignments = event.payload?.assignments as
          | Array<{ playerId: string; role_id: string }>
          | undefined;

        let players = state.players;
        if (roleAssignments) {
          players = state.players.map((p) => {
            const assignment = roleAssignments.find((a) => a.playerId === p.id);
            if (!assignment) return p;
            const role = ROLE_BY_ID.get(assignment.role_id) || ALL_ROLES[0];
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
            };
          });
        }

        return {
          ...state,
          players,
          nightActions: buildEngineNightActions(players, state.nightCount || 1, false),
          sequenceNumber: event.sequence,
          eventLog: [...state.eventLog, event],
          updatedAt: event.timestamp,
        };
      }

      case "PHASE_TRANSITIONED": {
        if (!state) throw new Error("Cannot apply PHASE_TRANSITIONED on uninitialized state.");
        const payload = event.payload;
        let nightActions = state.nightActions;
        if (payload.phase === "NIGHT_ACTIVE") {
          nightActions = buildEngineNightActions(state.players, payload.nightCount || state.nightCount, false);
        }

        return {
          ...state,
          phase: payload.phase,
          dayCount: payload.dayCount !== undefined ? payload.dayCount : state.dayCount,
          nightCount: payload.nightCount !== undefined ? payload.nightCount : state.nightCount,
          nightActions,
          votes: payload.phase === "DAY_VOTING" || payload.phase === "NIGHT_ACTIVE" ? {} : state.votes,
          sequenceNumber: event.sequence,
          eventLog: [...state.eventLog, event],
          updatedAt: event.timestamp,
        };
      }

      case "NIGHT_ACTION_SUBMITTED": {
        if (!state) throw new Error("Cannot apply NIGHT_ACTION_SUBMITTED on uninitialized state.");
        const payload = event.payload;
        const nightActions = state.nightActions.map((a) => {
          if (a.id === payload.actionId) {
            return {
              ...a,
              target_player_id: payload.targetPlayerId,
              secondary_target_id: payload.secondaryTargetId || null,
              completed: true,
            };
          }
          return a;
        });

        return {
          ...state,
          nightActions,
          sequenceNumber: event.sequence,
          eventLog: [...state.eventLog, event],
          updatedAt: event.timestamp,
        };
      }

      case "NIGHT_RESOLVED": {
        if (!state) throw new Error("Cannot apply NIGHT_RESOLVED on uninitialized state.");
        const payload = event.payload;
        const killedPlayerIds = new Set<string>(payload.killedPlayerIds || []);
        if (payload.cascadeCasualties) {
          for (const id of payload.cascadeCasualties) killedPlayerIds.add(id);
        }

        const players = state.players.map((p) => {
          if (killedPlayerIds.has(p.id)) {
            return { ...p, alive: false };
          }
          return p;
        });

        return {
          ...state,
          players,
          nightActions: [],
          sequenceNumber: event.sequence,
          eventLog: [...state.eventLog, event],
          updatedAt: event.timestamp,
        };
      }

      case "VOTE_CAST": {
        if (!state) throw new Error("Cannot apply VOTE_CAST on uninitialized state.");
        const payload = event.payload;
        const votes = { ...state.votes, [payload.voterId]: payload.targetPlayerId };
        return {
          ...state,
          votes,
          sequenceNumber: event.sequence,
          eventLog: [...state.eventLog, event],
          updatedAt: event.timestamp,
        };
      }

      case "VOTE_RESOLVED": {
        if (!state) throw new Error("Cannot apply VOTE_RESOLVED on uninitialized state.");
        const payload = event.payload;
        const elimId = payload.eliminatedPlayerId;
        const players = state.players.map((p) => {
          if (p.id === elimId) {
            return { ...p, alive: false };
          }
          return p;
        });

        return {
          ...state,
          players,
          votes: {},
          sequenceNumber: event.sequence,
          eventLog: [...state.eventLog, event],
          updatedAt: event.timestamp,
        };
      }

      case "TIMEOUT_OCCURRED": {
        if (!state) throw new Error("Cannot apply TIMEOUT_OCCURRED on uninitialized state.");
        return {
          ...state,
          timeoutCount: (state.timeoutCount || 0) + 1,
          sequenceNumber: event.sequence,
          eventLog: [...state.eventLog, event],
          updatedAt: event.timestamp,
        };
      }

      case "WIN_CONDITION_SATISFIED": {
        if (!state) throw new Error("Cannot apply WIN_CONDITION_SATISFIED on uninitialized state.");
        return {
          ...state,
          phase: "GAME_OVER",
          sequenceNumber: event.sequence,
          eventLog: [...state.eventLog, event],
          updatedAt: event.timestamp,
        };
      }

      default:
        if (!state) return state as any;
        return {
          ...state,
          sequenceNumber: event.sequence,
          eventLog: [...state.eventLog, event],
          updatedAt: event.timestamp,
        };
    }
  }

  /**
   * Reconstructs an AuthoritativeRoomState from an event sequence.
   * Performs cryptographic HMAC-SHA256 signature auditing to detect tampering.
   */
  public static async reconstructState(
    roomId: string,
    eventStore: IEventStore,
    upToSequence?: number,
    options?: { verifySignatures?: boolean }
  ): Promise<AuthoritativeRoomState | null> {
    const verifySignatures = options?.verifySignatures ?? true;
    const events = await eventStore.getEvents(roomId, 1, upToSequence);
    if (events.length === 0) return null;

    let state: AuthoritativeRoomState | null = null;
    for (const event of events) {
      if (verifySignatures) {
        const isValid = verifyGameEventSignature(event);
        if (!isValid) {
          throw new Error(
            `[TamperDetected] Cryptographic HMAC-SHA256 signature verification failed for event ${event.eventId} (sequence ${event.sequence}, type ${event.type}) in room ${roomId}. Event payload or signature has been modified!`
          );
        }
      }
      state = this.gameReducer(state, event);
    }

    return state;
  }

  /**
   * Audits cryptographic integrity for all stored events of a room.
   */
  public static async auditIntegrity(
    roomId: string,
    eventStore: IEventStore
  ): Promise<{ valid: boolean; totalAudited: number; tamperedEvent?: GameEvent; error?: string }> {
    const events = await eventStore.getEvents(roomId);
    for (const event of events) {
      const isValid = verifyGameEventSignature(event);
      if (!isValid) {
        return {
          valid: false,
          totalAudited: events.length,
          tamperedEvent: event,
          error: `Tamper detected on event ${event.eventId} at sequence ${event.sequence}`,
        };
      }
    }
    return { valid: true, totalAudited: events.length };
  }
}
