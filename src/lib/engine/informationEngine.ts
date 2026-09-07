// ============================================================
// ASPIRE: WEREWOLF - Information Engine & State Masking (Security P0)
// Prevents secret role leakage over public network broadcasts
// "One Village. Many Lies. One Wolf."
// ============================================================

import { RoleData } from "@/types/game";
import {
  PlayerEngineState,
  PublicPlayerInfo,
  PublicGameState,
  PrivatePlayerState,
  ModeratorState,
  GameMode,
  EngineNightAction,
  WinEvaluationResult,
} from "./types";

/**
 * Strips all sensitive role and secret attributes from player states
 * for public broadcast over public MQTT room topics.
 */
export function maskPublicPlayerInfo(player: PlayerEngineState): PublicPlayerInfo {
  return {
    id: player.id,
    name: player.name,
    alive: player.alive,
    isHost: player.isHost,
    silenced: !!player.silenced,
  };
}

/**
 * Builds the sanitized PublicGameState that is safe to broadcast to all clients.
 */
export function maskPublicGameState(params: {
  gameMode: GameMode;
  phase: string;
  dayCount: number;
  nightCount: number;
  players: PlayerEngineState[];
  narrativeText: string;
  gameEnded: boolean;
  winner: string | null;
  winningPlayerIds: string[];
  winningTeams: string[];
  winReason: string | null;
  voteTally?: Record<string, number>;
  eliminatedPlayerId?: string | null;
  nightVictimIds?: string[];
  princeSurvived?: boolean;
  tannerWon?: boolean;
}): PublicGameState {
  return {
    gameMode: params.gameMode,
    phase: params.phase,
    dayCount: params.dayCount,
    nightCount: params.nightCount,
    players: params.players.map(maskPublicPlayerInfo),
    narrativeText: params.narrativeText,
    gameEnded: params.gameEnded,
    winner: params.winner,
    winningPlayerIds: params.winningPlayerIds,
    winningTeams: params.winningTeams,
    winReason: params.winReason,
    voteTally: params.voteTally,
    eliminatedPlayerId: params.eliminatedPlayerId,
    nightVictimIds: params.nightVictimIds,
    princeSurvived: params.princeSurvived,
    tannerWon: params.tannerWon,
  };
}

/**
 * Generates the confidential, player-specific PrivatePlayerState.
 * Only the recipient player must ever receive this payload.
 */
export function generatePrivatePlayerState(
  player: PlayerEngineState,
  allPlayers: PlayerEngineState[],
  roleData: RoleData,
  seerHistory?: Array<{ night: number; targetId: string; targetName: string; result: string }>,
  activeAction?: EngineNightAction | null,
  availableActions?: EngineNightAction[]
): PrivatePlayerState {
  let teammateIds: string[] = [];

  // Werewolf knowledge: living wolves know each other
  const isWolf =
    player.team === "Werewolf" ||
    (player.team === "Solo Werewolf" && player.canonical_name !== "Lone Wolf");

  if (isWolf) {
    teammateIds = allPlayers
      .filter(
        (p) =>
          p.id !== player.id &&
          (p.team === "Werewolf" ||
            (p.team === "Solo Werewolf" && p.canonical_name !== "Lone Wolf"))
      )
      .map((p) => p.id);
  }

  // Mason knowledge: living masons know each other
  if (player.role_id === "ROLE-043" || player.canonical_name === "Mason") {
    teammateIds = allPlayers
      .filter(
        (p) =>
          p.id !== player.id &&
          (p.role_id === "ROLE-043" || p.canonical_name === "Mason")
      )
      .map((p) => p.id);
  }

  return {
    player: { ...player },
    roleData,
    teammateIds,
    partnerIds: player.linkedPartnerIds,
    seerHistory,
    activeAction,
    availableActions,
  };
}

/**
 * Builds authoritative ModeratorState available only on host device or AI moderator engine.
 */
export function generateModeratorState(
  players: PlayerEngineState[],
  phase: string,
  dayCount: number,
  nightCount: number,
  activeActions: EngineNightAction[],
  logs: string[],
  winResult: WinEvaluationResult | null
): ModeratorState {
  return {
    players: players.map((p) => ({ ...p })),
    phase,
    dayCount,
    nightCount,
    activeActions,
    logs,
    winResult,
  };
}
