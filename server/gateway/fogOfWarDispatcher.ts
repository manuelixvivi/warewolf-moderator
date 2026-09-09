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
} from "../../src/contracts";
import {
  maskPublicGameState,
  generatePrivatePlayerState,
} from "../../src/lib/engine/informationEngine";
import { ROLE_BY_ID, ALL_ROLES } from "../../src/lib/engine/abilityRegistry";

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

    const sanitizedPlayers: SanitizedPublicPlayer[] = rawPublic.players.map((p) => {
      const roomPlayer = room.players.find((rp) => rp.id === p.id);
      return {
        id: p.id,
        name: p.name,
        isHost: p.isHost,
        isReady: roomPlayer?.isReady ?? false,
        alive: p.alive,
        silenced: p.silenced,
      };
    });

    return {
      roomId: room.roomId,
      gameMode: room.gameMode,
      phase: room.phase,
      dayCount: room.dayCount,
      nightCount: room.nightCount,
      sequenceNumber: room.sequenceNumber,
      players: sanitizedPlayers,
      currentNarrative: "",
      winResult: null,
      votes: room.phase === "DAY_RESOLVING" ? room.votes : undefined,
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
}
