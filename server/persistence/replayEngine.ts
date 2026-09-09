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
          targetPlayerCount: payload.targetPlayerCount,
          selectedRoles: payload.selectedRoles,
          selectedRolePool: payload.selectedRolePool,
          createdAt: event.timestamp,
          updatedAt: event.timestamp,
        };
      }

      case "ROOM_CONFIG_UPDATED": {
        if (!state) throw new Error("Cannot apply ROOM_CONFIG_UPDATED on uninitialized state.");
        const payload = event.payload;
        return {
          ...state,
          sequenceNumber: event.sequence,
          gameMode: payload.gameMode || state.gameMode,
          targetPlayerCount: payload.targetPlayerCount !== undefined ? payload.targetPlayerCount : state.targetPlayerCount,
          selectedRoles: payload.selectedRoles !== undefined ? payload.selectedRoles : state.selectedRoles,
          selectedRolePool: payload.selectedRolePool !== undefined ? payload.selectedRolePool : state.selectedRolePool,
          eventLog: [...state.eventLog, event],
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

      case "PLAYER_READY_CHANGED": {
        if (!state) throw new Error("Cannot apply PLAYER_READY_CHANGED on uninitialized state.");
        const { playerId, isReady } = event.payload || {};
        const players = state.players.map((p) =>
          p.id === playerId ? { ...p, isReady: Boolean(isReady) } : p
        );
        return {
          ...state,
          players,
          sequenceNumber: event.sequence,
          eventLog: [...state.eventLog, event],
          updatedAt: event.timestamp,
        };
      }

      case "PLAYER_DISCONNECT_TIMEOUT": {
        if (!state) throw new Error("Cannot apply PLAYER_DISCONNECT_TIMEOUT on uninitialized state.");
        const { playerId, phase } = event.payload || {};
        let players = state.players;
        if (state.phase === "LOBBY" || phase === "LOBBY") {
          players = state.players.filter((p) => p.id !== playerId);
        } else {
          players = state.players.map((p) =>
            p.id === playerId ? { ...p, alive: false } : p
          );
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
          | Array<any>
          | undefined;

        let players = state.players;
        if (roleAssignments) {
          players = state.players.map((p) => {
            const assignment = roleAssignments.find((a) => a.playerId === p.id);
            if (!assignment) return p;

            // If assignment contains full canonical snapshot, project directly without external dependency
            if (assignment.canonical_name && assignment.team) {
              return {
                ...p,
                role_id: assignment.role_id,
                canonical_name: assignment.canonical_name,
                team: assignment.team,
                originalTeam: assignment.originalTeam || assignment.team,
                category: assignment.category || "Village",
                seer_result: assignment.seer_result || "Villager",
                role_points: assignment.role_points ?? 1,
                balance_weight: assignment.balance_weight ?? 1,
                night_priority: assignment.night_priority ?? 50,
                active_phase: assignment.active_phase || "Night",
                action_type: assignment.action_type || "None",
                trigger: assignment.trigger || "None",
                target_type: assignment.target_type || "None",
                usage_limit: assignment.usage_limit,
                can_change_role: assignment.can_change_role,
                reveal_on_death: assignment.reveal_on_death,
                requires_engine_resolution: assignment.requires_engine_resolution,
                description_id: assignment.description_id || assignment.tooltip_id,
                tooltip_id: assignment.tooltip_id,
              };
            }

            // Fallback for legacy events
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
        let players = state.players;
        let activeWinResult = state.activeWinResult;
        let lastNightResult = state.lastNightResult;

        if (payload.phase === "NIGHT_ACTIVE") {
          nightActions = buildEngineNightActions(state.players, payload.nightCount || state.nightCount, false);
        } else if (payload.phase === "LOBBY") {
          nightActions = [];
          activeWinResult = null;
          lastNightResult = null;
          players = state.players.map((p) => ({
            ...p,
            alive: true,
            isReady: false,
            silenced: false,
            protected: false,
            inCult: false,
            hasUsedAbility: false,
          }));
        }

        return {
          ...state,
          phase: payload.phase,
          dayCount: payload.dayCount !== undefined ? payload.dayCount : state.dayCount,
          nightCount: payload.nightCount !== undefined ? payload.nightCount : state.nightCount,
          players,
          nightActions,
          activeWinResult,
          lastNightResult,
          votes: payload.phase === "DAY_VOTING" || payload.phase === "NIGHT_ACTIVE" || payload.phase === "LOBBY" ? {} : state.votes,
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

      case "PACK_VOTE_STARTED": {
        if (!state) throw new Error("Cannot apply PACK_VOTE_STARTED on uninitialized state.");
        const payload = event.payload;
        return {
          ...state,
          packVotes: {},
          packVoteWindow: {
            startedAt: payload.startedAt,
            expiresAt: payload.expiresAt,
            isRevote: false,
            eligibleWolfIds: state.players.filter((p) => (p.team === "Werewolf" || p.category === "Werewolf") && p.alive).map((p) => p.id),
          },
          sequenceNumber: event.sequence,
          eventLog: [...state.eventLog, event],
          updatedAt: event.timestamp,
        };
      }

      case "PACK_VOTE_UPDATED": {
        if (!state) throw new Error("Cannot apply PACK_VOTE_UPDATED on uninitialized state.");
        const payload = event.payload;
        const packVotes = payload.votes
          ? { ...payload.votes }
          : { ...(state.packVotes || {}), [payload.voterPlayerId]: payload.targetPlayerId };
        return {
          ...state,
          packVotes,
          sequenceNumber: event.sequence,
          eventLog: [...state.eventLog, event],
          updatedAt: event.timestamp,
        };
      }

      case "PACK_REVOTE_STARTED": {
        if (!state) throw new Error("Cannot apply PACK_REVOTE_STARTED on uninitialized state.");
        const payload = event.payload;
        return {
          ...state,
          packVotes: {},
          packVoteWindow: {
            startedAt: payload.startedAt,
            expiresAt: payload.expiresAt,
            isRevote: true,
            allowedTargets: payload.allowedTargets || [],
            eligibleWolfIds: state.players.filter((p) => (p.team === "Werewolf" || p.category === "Werewolf") && p.alive).map((p) => p.id),
          },
          sequenceNumber: event.sequence,
          eventLog: [...state.eventLog, event],
          updatedAt: event.timestamp,
        };
      }

      case "PACK_VOTE_CLOSED": {
        if (!state) throw new Error("Cannot apply PACK_VOTE_CLOSED on uninitialized state.");
        return {
          ...state,
          packVoteWindow: undefined,
          sequenceNumber: event.sequence,
          eventLog: [...state.eventLog, event],
          updatedAt: event.timestamp,
        };
      }

      case "PACK_TARGET_RESOLVED": {
        if (!state) throw new Error("Cannot apply PACK_TARGET_RESOLVED on uninitialized state.");
        const payload = event.payload;
        const targetPlayerId = payload.targetPlayerId || null;
        const nightActions = state.nightActions.map((a) => {
          if (a.id === "SYSTEM-WEREWOLF-PACK" || a.action_type === "Kill" || a.role_name.toLowerCase().includes("werewolf")) {
            return {
              ...a,
              target_player_id: targetPlayerId,
              completed: true,
            };
          }
          return a;
        });
        return {
          ...state,
          nightActions,
          packVoteWindow: undefined,
          sequenceNumber: event.sequence,
          eventLog: [...state.eventLog, event],
          updatedAt: event.timestamp,
        };
      }

      case "SEER_WINDOW_STARTED": {
        if (!state) throw new Error("Cannot apply SEER_WINDOW_STARTED on uninitialized state.");
        const payload = event.payload;
        return {
          ...state,
          seerActionState: {
            startedAt: payload.startedAt,
            expiresAt: payload.expiresAt,
            checked: false,
          },
          sequenceNumber: event.sequence,
          eventLog: [...state.eventLog, event],
          updatedAt: event.timestamp,
        };
      }

      case "SEER_CHECK_RESOLVED": {
        if (!state) throw new Error("Cannot apply SEER_CHECK_RESOLVED on uninitialized state.");
        const payload = event.payload;
        const nightActions = state.nightActions.map((a) => {
          if (a.action_type === "Investigate" || a.role_id === "ROLE-002" || a.player_ids.includes(payload.seerPlayerId)) {
            return {
              ...a,
              target_player_id: payload.targetPlayerId,
              completed: true,
            };
          }
          return a;
        });
        return {
          ...state,
          nightActions,
          seerActionState: {
            ...(state.seerActionState || { startedAt: event.timestamp, expiresAt: event.timestamp }),
            checked: true,
            targetPlayerId: payload.targetPlayerId,
            result: payload.result,
          },
          sequenceNumber: event.sequence,
          eventLog: [...state.eventLog, event],
          updatedAt: event.timestamp,
        };
      }

      case "NIGHT_RESOLVED": {
        if (!state) throw new Error("Cannot apply NIGHT_RESOLVED on uninitialized state.");
        const payload = event.payload;

        // If full canonical player snapshot is present in event payload, project directly!
        let players: PlayerEngineState[];
        if (payload.updatedPlayers && Array.isArray(payload.updatedPlayers)) {
          players = payload.updatedPlayers.map((p: any) => ({ ...p }));
        } else {
          // Comprehensive fallback reduction for legacy events
          const killedPlayerIds = new Set<string>(payload.killedPlayerIds || []);
          if (payload.cascadeCasualties) {
            for (const id of payload.cascadeCasualties) killedPlayerIds.add(id);
          }
          const silencedIds = new Set<string>(payload.silencedPlayerIds || []);
          const convertedIds = new Set<string>(payload.convertedPlayerIds || []);

          players = state.players.map((p) => {
            let updated = { ...p, protected: false };
            if (killedPlayerIds.has(p.id)) {
              updated.alive = false;
            }
            if (silencedIds.has(p.id)) {
              updated.silenced = true;
            }
            if (convertedIds.has(p.id)) {
              updated.inCult = true;
            }
            return updated;
          });
        }

        return {
          ...state,
          players,
          nightActions: [],
          packVotes: {},
          packVoteWindow: undefined,
          seerActionState: undefined,
          sequenceNumber: event.sequence,
          eventLog: [...state.eventLog, event],
          updatedAt: event.timestamp,
        };
      }

      case "ROLE_TRANSFORMED": {
        if (!state) throw new Error("Cannot apply ROLE_TRANSFORMED on uninitialized state.");
        const payload = event.payload;
        const players = state.players.map((p) => {
          if (p.id === payload.playerId) {
            const role = payload.toRoleId ? ROLE_BY_ID.get(payload.toRoleId) : undefined;
            return {
              ...p,
              role_id: payload.toRoleId || p.role_id,
              canonical_name: payload.canonicalName || role?.canonical_name || p.canonical_name,
              team: payload.toTeam || role?.team || p.team,
              category: role?.category || p.category,
              seer_result: role?.seer_result || p.seer_result,
            };
          }
          return p;
        });

        return {
          ...state,
          players,
          sequenceNumber: event.sequence,
          eventLog: [...state.eventLog, event],
          updatedAt: event.timestamp,
        };
      }

      case "DEATH_CASCADE_TRIGGERED": {
        if (!state) throw new Error("Cannot apply DEATH_CASCADE_TRIGGERED on uninitialized state.");
        const payload = event.payload;
        const victimIds = new Set<string>(
          Array.isArray(payload.eliminatedPlayerIds)
            ? payload.eliminatedPlayerIds
            : payload.eliminatedPlayerId
            ? [payload.eliminatedPlayerId]
            : []
        );

        const players = state.players.map((p) => {
          if (victimIds.has(p.id)) {
            return { ...p, alive: false };
          }
          return p;
        });

        return {
          ...state,
          players,
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

        let players: PlayerEngineState[];
        if (payload.updatedPlayers && Array.isArray(payload.updatedPlayers)) {
          players = payload.updatedPlayers.map((p: any) => ({ ...p }));
        } else {
          const elimId = payload.eliminatedPlayerId;
          players = state.players.map((p) => {
            if (p.id === elimId) {
              return { ...p, alive: false };
            }
            return p;
          });
        }

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
          activeWinResult: event.payload,
          sequenceNumber: event.sequence,
          eventLog: [...state.eventLog, event],
          updatedAt: event.timestamp,
        };
      }

      case "MATCH_RESTARTED": {
        if (!state) throw new Error("Cannot apply MATCH_RESTARTED on uninitialized state.");
        const payload = event.payload;
        const resetMap = new Map((payload.resetPlayers || []).map((rp: any) => [rp.playerId, rp]));
        const players = state.players.map((p) => {
          const reset = resetMap.get(p.id) as any;
          return {
            ...p,
            alive: true,
            isReady: false,
            silenced: false,
            protected: false,
            inCult: false,
            hasUsedAbility: false,
            ...(reset || {}),
          };
        });

        return {
          ...state,
          phase: "LOBBY",
          dayCount: 0,
          nightCount: 0,
          players,
          votes: {},
          nightActions: [],
          packVotes: {},
          packVoteWindow: undefined,
          seerActionState: undefined,
          activeWinResult: null,
          lastNightResult: null,
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
    options?: { verifySignatures?: boolean; rearmTimers?: boolean }
  ): Promise<AuthoritativeRoomState | null> {
    const verifySignatures = options?.verifySignatures ?? true;
    const events = await eventStore.getEvents(roomId, 1, upToSequence);
    if (events.length === 0) return null;

    let state: AuthoritativeRoomState | null = null;
    let expectedSequence = 1;
    for (const event of events) {
      // Event Sequence Integrity: must start at 1 and increment contiguously without gaps
      if (event.sequence !== expectedSequence) {
        throw new Error(
          `[TamperDetected] Event sequence gap detected in room ${roomId}. Expected sequence ${expectedSequence}, but got ${event.sequence}. Missing or deleted events detected!`
        );
      }
      expectedSequence++;

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

    // Restore persistent command idempotency registry so deduplication survives crashes
    if (state) {
      const persistedCommands = await eventStore.getProcessedCommandIds(roomId);
      state.processedCommandIds = new Set([
        ...(state.processedCommandIds ? Array.from(state.processedCommandIds) : []),
        ...Array.from(persistedCommands),
      ]);

      // Re-arm disconnect timers ONLY if explicitly in recovery mode and game is still active
      if (options?.rearmTimers && state.phase !== "GAME_OVER") {
        const lastDisconnectEvents = new Map<string, { disconnectDeadline?: number }>();
        for (const ev of events) {
          if (ev.type === "PLAYER_DISCONNECTED") {
            lastDisconnectEvents.set(ev.payload.playerId, ev.payload);
          } else if (ev.type === "PLAYER_RECONNECTED" || ev.type === "PLAYER_DISCONNECT_TIMEOUT") {
            lastDisconnectEvents.delete(ev.payload.playerId);
          }
        }
        for (const [playerId, payload] of lastDisconnectEvents) {
          if (payload?.disconnectDeadline) {
            const remainingMs = payload.disconnectDeadline - Date.now();
            if (remainingMs > 0) {
              const timer = setTimeout(async () => {
                state?.disconnectTimers.delete(playerId);
                try {
                  const { RoomManager } = await import("../rooms/roomManager");
                  await RoomManager.handleDisconnectTimeout(roomId, playerId);
                } catch (err) {
                  console.error(`Error handling disconnect timeout for ${playerId}:`, err);
                }
              }, remainingMs);
              state.disconnectTimers.set(playerId, timer);
            } else {
              // Grace period already expired while server was offline: emit canonical timeout
              try {
                const { RoomManager } = await import("../rooms/roomManager");
                RoomManager.handleDisconnectTimeout(roomId, playerId).catch(() => {});
              } catch {}
            }
          }
        }
      }
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
    let expectedSequence = 1;
    for (const event of events) {
      if (event.sequence !== expectedSequence) {
        return {
          valid: false,
          totalAudited: events.length,
          tamperedEvent: event,
          error: `Tamper detected: non-contiguous sequence gap in room ${roomId}. Expected sequence ${expectedSequence}, but got ${event.sequence}`,
        };
      }
      expectedSequence++;

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
