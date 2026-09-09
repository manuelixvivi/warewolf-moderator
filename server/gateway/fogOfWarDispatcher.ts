// ============================================================
// ASPIRE: WEREWOLF — Fog-of-War Dispatcher (Security P0)
// Sanitizes authoritative room state into public broadcast
// and confidential private unicast payloads.
// "Zero secrets leaked over public channels."
// ============================================================

import { AuthoritativeRoomState } from "../types";
import {
  SanitizedPublicGameState,
  SanitizedPublicPlayer,
  SanitizedPrivatePlayerState,
  FactionAlignment,
  GameEvent,
} from "../../src/contracts";
import {
  maskPublicGameState,
  generatePrivatePlayerState,
} from "../../src/lib/engine/informationEngine";
import { ROLE_BY_ID, ALL_ROLES, canParticipateInWerewolfPackVote } from "../../src/lib/engine/abilityRegistry";
import { evaluateWinConditions } from "../../src/lib/engine/winEngine";

export class FogOfWarDispatcher {
  /**
   * Generates sanitized public game state safe for all room participants.
   * Completely strips role_id, canonical_name, and team identities.
   */
  public static buildPublicState(room: AuthoritativeRoomState): SanitizedPublicGameState {
    const rawPublic = maskPublicGameState({
      gameMode: room.gameMode,
      phase: room.phase,
      dayCount: room.dayCount,
      nightCount: room.nightCount,
      players: room.players,
      narrativeText: "",
      gameEnded: room.phase === "GAME_OVER",
      winner: null,
      winningPlayerIds: [],
      winningTeams: [],
      winReason: null,
      voteTally: room.phase === "DAY_VOTING" || room.phase === "DAY_RESOLVING" ? undefined : undefined,
    });

    const isGameOver = room.phase === "GAME_OVER";
    const sanitizedPlayers: SanitizedPublicPlayer[] = rawPublic.players.map((p) => {
      const roomPlayer = room.players.find((rp) => rp.id === p.id);
      return {
        id: p.id,
        name: p.name,
        isHost: p.isHost,
        isReady: roomPlayer?.isReady ?? false,
        alive: p.alive,
        silenced: p.silenced,
        ...(isGameOver && roomPlayer
          ? {
              role_id: roomPlayer.role_id,
              canonical_name: roomPlayer.canonical_name,
              team: roomPlayer.team as FactionAlignment,
            }
          : {}),
      };
    });

    let winResult: any = null;
    if (isGameOver) {
      if (room.activeWinResult) {
        winResult = room.activeWinResult;
      } else {
        const evaluated = evaluateWinConditions(room.players, { timeoutCount: room.timeoutCount });
        winResult = {
          winner: evaluated.winner || "Draw",
          reason: evaluated.reason || "Pertarungan di desa telah mencapai akhir!",
          winningPlayerIds: evaluated.winningPlayerIds,
          winningTeams: evaluated.winningTeams,
        };
      }
    }

    return {
      roomId: room.roomId,
      gameMode: room.gameMode,
      phase: room.phase,
      dayCount: room.dayCount,
      nightCount: room.nightCount,
      sequenceNumber: room.sequenceNumber,
      players: sanitizedPlayers,
      currentNarrative: "",
      winResult,
      targetPlayerCount: room.targetPlayerCount,
      selectedRoles: room.selectedRoles,
      selectedRolePool: room.selectedRolePool,
      votes: room.phase === "DAY_RESOLVING" ? room.votes : undefined,
      nightActionProgress: room.phase === "NIGHT_ACTIVE" && room.nightActions ? {
        totalEligible: room.nightActions.length,
        completedCount: room.nightActions.filter((a) => a.completed).length,
      } : undefined,
      packVoteProgress: room.phase === "NIGHT_ACTIVE" && room.packVoteWindow ? {
        startedAt: room.packVoteWindow.startedAt,
        expiresAt: room.packVoteWindow.expiresAt,
        isRevote: room.packVoteWindow.isRevote,
        isClosed: false,
      } : undefined,
      publicNightResult: room.phase !== "NIGHT_ACTIVE" && room.lastNightResult ? room.lastNightResult : null,
    };
  }

  /**
   * Generates confidential private player state for a specific recipient socket.
   */
  public static buildPrivateState(
    room: AuthoritativeRoomState,
    playerId: string
  ): SanitizedPrivatePlayerState | null {
    const player = room.players.find((p) => p.id === playerId);
    if (!player) return null;

    const roleDef = ROLE_BY_ID.get(player.role_id) || ALL_ROLES.find((r) => r.role_id === player.role_id) || ALL_ROLES[0];
    const privateEngine = generatePrivatePlayerState(player, room.players, roleDef);

    const isEligibleWolf = player.alive && canParticipateInWerewolfPackVote(player, room.players, room.nightCount);
    const isSeer = player.alive && (player.role_id === "ROLE-002" || player.role_id === "ROLE-022" || player.canonical_name?.toLowerCase().includes("seer") || player.action_type === "Investigate");

    return {
      playerId: player.id,
      role_id: player.role_id,
      canonical_name: player.canonical_name,
      team: player.team as FactionAlignment,
      abilities: [roleDef.action_type],
      night_priority: player.night_priority,
      seer_result: player.seer_result as "Werewolf" | "Villager",
      fellowTeamMembers: (privateEngine.teammateIds || []).map((id) => {
        const fellow = room.players.find((p) => p.id === id);
        return {
          id,
          name: fellow?.name || "Unknown",
          role: fellow?.canonical_name || "Unknown",
        };
      }),
      packVotes: isEligibleWolf && room.phase === "NIGHT_ACTIVE" ? room.packVotes : undefined,
      packVoteWindow: isEligibleWolf && room.phase === "NIGHT_ACTIVE" && room.packVoteWindow ? {
        startedAt: room.packVoteWindow.startedAt,
        expiresAt: room.packVoteWindow.expiresAt,
        isRevote: room.packVoteWindow.isRevote,
        allowedTargets: room.packVoteWindow.allowedTargets,
      } : undefined,
      seerWindow: isSeer && room.phase === "NIGHT_ACTIVE" && room.seerActionState ? {
        startedAt: room.seerActionState.startedAt,
        expiresAt: room.seerActionState.expiresAt,
        checked: room.seerActionState.checked,
        result: room.seerActionState.result,
        targetPlayerId: room.seerActionState.targetPlayerId,
      } : undefined,
    };
  }

  /**
   * Dispatches public broadcast and private unicasts to all connected sockets in a room.
   */
  public static dispatchRoomSync(room: AuthoritativeRoomState): void {
    const publicState = this.buildPublicState(room);
    const publicPayload = JSON.stringify({
      type: "PUBLIC_STATE_UPDATE",
      state: publicState,
    });

    for (const [playerId, client] of room.clients.entries()) {
      if (client.socket && client.socket.readyState === 1 /* OPEN */) {
        // 1. Send public state
        client.socket.send(publicPayload);

        // 2. Send confidential private state
        const privateState = this.buildPrivateState(room, playerId);
        if (privateState) {
          client.socket.send(
            JSON.stringify({
              type: "PRIVATE_STATE_UPDATE",
              state: privateState,
            })
          );
        }
      }
    }
  }

  /**
   * Sanitizes an authoritative event before transmission to a specific player's socket.
   * Prevents raw event leakage (e.g. ROLES_ASSIGNED secret assignments,
   * NIGHT_ACTION_SUBMITTED secret targets, NIGHT_RESOLVED secret conversions/updatedPlayers,
   * and secret ROLE_TRANSFORMED events).
   */
  public static sanitizeEventForPlayer(
    event: GameEvent,
    recipientPlayerId: string,
    isGameOver: boolean
  ): GameEvent {
    switch (event.type) {
      case "ROLES_ASSIGNED": {
        const rawAssignments = Array.isArray(event.payload?.assignments) ? event.payload.assignments : [];
        const assignments = isGameOver
          ? rawAssignments.map((a: any) => ({
              playerId: a.playerId,
              role_id: a.role_id,
              canonical_name: a.canonical_name,
              team: a.team,
            }))
          : rawAssignments.filter((a: any) => a.playerId === recipientPlayerId);

        return {
          ...event,
          payload: {
            assignedCount: event.payload?.assignedCount ?? rawAssignments.length,
            rulesetVersion: event.payload?.rulesetVersion ?? "1.0.0",
            assignments,
          },
        };
      }

      case "NIGHT_ACTION_SUBMITTED": {
        // Night action choices & secret targets are NEVER leaked to other players, even at GAME_OVER
        if (event.actorId === recipientPlayerId) {
          return { ...event };
        }
        return {
          ...event,
          actorId: undefined,
          payload: {
            actionId: "MASKED_NIGHT_ACTION",
            targetPlayerId: null,
            secondaryTargetId: null,
          },
        };
      }

      case "PACK_VOTE_STARTED":
      case "PACK_VOTE_UPDATED":
      case "PACK_REVOTE_STARTED": {
        let isEligibleWolf = false;
        try {
          const { RoomManager } = require("../rooms/roomManager");
          const room = RoomManager.rooms.get(event.roomId);
          if (room) {
            const recipient = room.players.find((p: any) => p.id === recipientPlayerId);
            isEligibleWolf = Boolean(recipient?.alive && canParticipateInWerewolfPackVote(recipient, room.players, room.nightCount));
          }
        } catch {}

        if (isEligibleWolf || isGameOver) {
          return { ...event };
        }
        return {
          ...event,
          actorId: undefined,
          payload: { masked: true },
        };
      }

      case "PACK_VOTE_CLOSED": {
        let isEligibleWolf = false;
        try {
          const { RoomManager } = require("../rooms/roomManager");
          const room = RoomManager.rooms.get(event.roomId);
          if (room) {
            const recipient = room.players.find((p: any) => p.id === recipientPlayerId);
            isEligibleWolf = Boolean(recipient?.alive && canParticipateInWerewolfPackVote(recipient, room.players, room.nightCount));
          }
        } catch {}

        if (isEligibleWolf || isGameOver) {
          return { ...event };
        }
        return {
          ...event,
          payload: { closed: true },
        };
      }

      case "PACK_TARGET_RESOLVED": {
        let isEligibleWolf = false;
        try {
          const { RoomManager } = require("../rooms/roomManager");
          const room = RoomManager.rooms.get(event.roomId);
          if (room) {
            const recipient = room.players.find((p: any) => p.id === recipientPlayerId);
            isEligibleWolf = Boolean(recipient?.alive && canParticipateInWerewolfPackVote(recipient, room.players, room.nightCount));
          }
        } catch {}

        if (isEligibleWolf || isGameOver) {
          return { ...event };
        }
        return {
          ...event,
          payload: { targetPlayerId: null, masked: true },
        };
      }

      case "SEER_WINDOW_STARTED": {
        if (event.payload?.seerPlayerId === recipientPlayerId || isGameOver) {
          return { ...event };
        }
        return {
          ...event,
          actorId: undefined,
          payload: { masked: true },
        };
      }

      case "SEER_CHECK_RESOLVED": {
        if (event.payload?.seerPlayerId === recipientPlayerId || isGameOver) {
          return { ...event };
        }
        return {
          ...event,
          actorId: undefined,
          payload: { masked: true },
        };
      }

      case "NIGHT_RESOLVED": {
        const payload = event.payload || {};
        const safeUpdatedPlayers = Array.isArray(payload.updatedPlayers)
          ? payload.updatedPlayers.map((p: any) => {
              if (p.id === recipientPlayerId || isGameOver) {
                return {
                  id: p.id,
                  name: p.name,
                  alive: p.alive,
                  silenced: p.silenced,
                  isHost: p.isHost,
                  isReady: p.isReady,
                  role_id: p.role_id,
                  canonical_name: p.canonical_name,
                  team: p.team,
                };
              }
              return {
                id: p.id,
                name: p.name,
                alive: p.alive,
                silenced: p.silenced,
                isHost: p.isHost,
                isReady: p.isReady,
              };
            })
          : undefined;

        // Internal engine triggers & secret conversions remain private even at GAME_OVER
        const myConverted = Array.isArray(payload.convertedPlayerIds)
          ? payload.convertedPlayerIds.filter((id: string) => id === recipientPlayerId)
          : [];

        const myTriggered = Array.isArray(payload.triggeredActions)
          ? payload.triggeredActions.filter((a: any) => a.actorId === recipientPlayerId)
          : [];

        return {
          ...event,
          payload: {
            killedPlayerIds: payload.killedPlayerIds || [],
            savedPlayerIds: payload.savedPlayerIds || [],
            cascadeCasualties: payload.cascadeCasualties || [],
            silencedPlayerIds: payload.silencedPlayerIds || [],
            convertedPlayerIds: myConverted,
            triggeredActions: myTriggered,
            updatedPlayers: safeUpdatedPlayers,
          },
        };
      }

      case "ROLE_TRANSFORMED": {
        if (event.payload?.playerId === recipientPlayerId || isGameOver) {
          return {
            ...event,
            payload: {
              playerId: event.payload?.playerId,
              toRoleId: event.payload?.toRoleId,
              toTeam: event.payload?.toTeam,
              canonicalName: event.payload?.canonicalName,
            },
          };
        }
        return {
          ...event,
          actorId: undefined,
          payload: {
            playerId: event.payload?.playerId,
            transformed: true,
          },
        };
      }

      case "VOTE_CAST": {
        // Voter may inspect own vote; other players must NOT see vote target during active voting
        const isVoter = event.actorId === recipientPlayerId || event.payload?.voterPlayerId === recipientPlayerId;
        if (isVoter || isGameOver) {
          return { ...event };
        }
        return {
          ...event,
          actorId: undefined,
          payload: {
            voterPlayerId: event.payload?.voterPlayerId,
            targetPlayerId: null,
            weight: 1,
            voteCast: true,
          },
        };
      }

      case "DEATH_CASCADE_TRIGGERED": {
        // Public casualties only; strip internal mechanics
        return {
          ...event,
          payload: {
            triggerPlayerId: event.payload?.triggerPlayerId,
            triggerType: event.payload?.triggerType,
            casualties: event.payload?.casualties || [],
          },
        };
      }

      case "ROOM_INITIALIZED":
        return {
          ...event,
          payload: {
            roomId: event.payload?.roomId,
            gameMode: event.payload?.gameMode,
            hostPlayerId: event.payload?.hostPlayerId,
            hostPlayerName: event.payload?.hostPlayerName,
            targetPlayerCount: event.payload?.targetPlayerCount,
            selectedRoles: event.payload?.selectedRoles,
            selectedRolePool: event.payload?.selectedRolePool,
          },
        };

      case "ROOM_CONFIG_UPDATED":
        return {
          ...event,
          payload: {
            gameMode: event.payload?.gameMode,
            targetPlayerCount: event.payload?.targetPlayerCount,
            selectedRoles: event.payload?.selectedRoles,
            selectedRolePool: event.payload?.selectedRolePool,
          },
        };

      case "PLAYER_JOINED":
        return {
          ...event,
          payload: {
            playerId: event.payload?.playerId,
            playerName: event.payload?.playerName,
            isHost: event.payload?.isHost,
          },
        };

      case "PLAYER_READY_CHANGED":
        return {
          ...event,
          payload: {
            playerId: event.payload?.playerId,
            isReady: Boolean(event.payload?.isReady),
          },
        };

      case "PLAYER_DISCONNECTED":
      case "PLAYER_RECONNECTED":
      case "PLAYER_DISCONNECT_TIMEOUT":
        return {
          ...event,
          payload: {
            playerId: event.payload?.playerId,
          },
        };

      case "GAME_STARTED":
        return {
          ...event,
          payload: {
            playerCount: event.payload?.playerCount,
            gameMode: event.payload?.gameMode,
            rulesetVersion: event.payload?.rulesetVersion,
            engineVersion: event.payload?.engineVersion,
          },
        };

      case "PHASE_TRANSITIONED":
        return {
          ...event,
          payload: {
            phase: event.payload?.phase,
            dayCount: event.payload?.dayCount,
            nightCount: event.payload?.nightCount,
          },
        };

      case "VOTE_RESOLVED":
        return {
          ...event,
          payload: {
            eliminatedPlayerId: event.payload?.eliminatedPlayerId,
            topTargetId: event.payload?.topTargetId,
            tally: event.payload?.tally ?? event.payload?.votes,
            votes: event.payload?.votes ?? event.payload?.tally,
            isTie: Boolean(event.payload?.isTie ?? event.payload?.tie),
            tie: Boolean(event.payload?.tie ?? event.payload?.isTie),
            princeSurvived: Boolean(event.payload?.princeSurvived),
            tannerWon: Boolean(event.payload?.tannerWon),
            dayTimerReduced: Boolean(event.payload?.dayTimerReduced),
          },
        };

      case "TIMEOUT_OCCURRED":
        return {
          ...event,
          payload: {
            timeoutCount: event.payload?.timeoutCount,
          },
        };

      case "WIN_CONDITION_SATISFIED":
        return {
          ...event,
          payload: {
            winner: event.payload?.winner,
            reason: event.payload?.reason,
            winningPlayerIds: event.payload?.winningPlayerIds || [],
            winningTeams: event.payload?.winningTeams || [],
          },
        };

      case "MATCH_RESTARTED":
        return {
          ...event,
          payload: {
            phase: "LOBBY",
            dayCount: 0,
            nightCount: 0,
            resetPlayers: Array.isArray(event.payload?.resetPlayers)
              ? event.payload.resetPlayers.map((p: any) => ({
                  playerId: p.playerId,
                  alive: p.alive,
                  isReady: p.isReady,
                  silenced: p.silenced,
                  protected: p.protected,
                  inCult: p.inCult,
                  hasUsedAbility: p.hasUsedAbility,
                }))
              : [],
          },
        };

      case "NARRATIVE_LORE_EMITTED":
        return {
          ...event,
          payload: {
            text: event.payload?.text,
            phase: event.payload?.phase,
          },
        };

      default: {
        // DEFAULT-DENY: Any unmodeled or unknown event is strictly redacted
        return {
          ...event,
          actorId: event.actorId === recipientPlayerId ? event.actorId : undefined,
          payload: { masked: true },
        };
      }
    }
  }

  /**
   * Sanitizes an array of missed events before sending over RECONNECT_SYNC.
   */
  public static sanitizeEventsForPlayer(
    events: GameEvent[],
    recipientPlayerId: string,
    isGameOver: boolean
  ): GameEvent[] {
    return events.map((ev) => this.sanitizeEventForPlayer(ev, recipientPlayerId, isGameOver));
  }
}
