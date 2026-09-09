// ============================================================
// ASPIRE: WEREWOLF — Authoritative Client Game Store
// "Optimistic interaction. Authoritative state."
// Client is UI-only. Engine & truth live on Authoritative Server.
// ============================================================

import { create } from "zustand";
import {
  GameState,
  Phase,
  RoomInfo,
  Player,
  SelectedRole,
  NightAction,
  TriggeredAction,
  WinResult,
  ChatMessage,
} from "@/types/game";
import {
  SanitizedPublicGameState,
  SanitizedPrivatePlayerState,
} from "@/contracts";
import { authoritativeWsClient, getNetworkConfig } from "@/lib/network";
import { narratorVoice } from "@/lib/narratorVoice";

interface GameStore extends GameState {
  // Navigation & Room Setup
  setPhase: (phase: Phase) => void;
  setPlayerName: (name: string) => void;
  createRoom: (
    hostName: string,
    selectedRoles?: SelectedRole[],
    theme?: string,
    gameMode?: "MODE_1_FIXED" | "MODE_2_POOL" | "MODE_3_RANDOM" | "MODERATOR_HELPER",
    targetPlayerCount?: number,
    selectedRolePool?: string[]
  ) => Promise<string>;
  updateRoomConfig: (config: {
    gameMode?: "MODE_1_FIXED" | "MODE_2_POOL" | "MODE_3_RANDOM" | "MODERATOR_HELPER";
    targetPlayerCount?: number;
    selectedRoles?: SelectedRole[];
    selectedRolePool?: string[];
  }) => void;
  joinRoom: (roomCode: string, playerName: string) => Promise<boolean>;
  leaveRoom: () => void;
  toggleVoice: () => void;

  // Game Lifecycle (Host commands)
  startGame: () => void;
  proceedToNight: () => void;
  proceedToVoting: () => void;
  resolveNightPhase: () => void;
  resolveDayVotingPhase: (isTimeout?: boolean) => void;
  resolveTriggeredAction: (type: string, targetId?: string) => void;
  restartGame: () => void;

  // Player Actions
  submitNightAction: (targetPlayerId: string | null) => void;
  castVote: (targetPlayerId: string | null) => void;
  setPlayerReady: () => void;
  sendChatMessage: (text: string, channel?: "DAY_PUBLIC" | "WOLF_SECRET" | "LOBBY") => void;

  // Authoritative State
  myPrivateRole: SanitizedPrivatePlayerState | null;
  hasSeenCardReveal: boolean;
}

// Generate cryptographically secure player ID per browser session
function generatePlayerId(): string {
  if (typeof window !== "undefined") {
    let id = sessionStorage.getItem("aspire_player_id");
    if (!id) {
      id = typeof crypto !== "undefined" && crypto.randomUUID
        ? `p-${crypto.randomUUID().substring(0, 8)}`
        : `p-${Math.random().toString(36).substring(2, 9)}`;
      sessionStorage.setItem("aspire_player_id", id);
    }
    return id;
  }
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? `p-${crypto.randomUUID().substring(0, 8)}`
    : `p-${Math.random().toString(36).substring(2, 9)}`;
}

// Generate random room code
function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `WOLF-${code}`;
}

const initialPlayerId = generatePlayerId();
const initialPlayerName =
  typeof window !== "undefined"
    ? localStorage.getItem("aspire_player_name") || ""
    : "";

const initialState: GameState = {
  mode: "MULTIPLAYER",
  phase: "HOME",
  room: null,
  myPlayerId: initialPlayerId,
  myPlayerName: initialPlayerName,
  players: [],
  dayCount: 0,
  nightCount: 0,
  nightActions: [],
  triggeredActions: [],
  activeTriggeredAction: null,
  lastNightResult: null,
  currentNarrative: "",
  gameLog: [],
  winResult: null,
  votes: {},
  seerResultHistory: {},
  chatMessages: [],
  timeoutCount: 0,
};

export const useGameStore = create<GameStore>()((set, get) => {
  // ── Authoritative WebSocket Event Subscriptions ─────────────
  if (typeof window !== "undefined") {
    authoritativeWsClient.onPublicState((publicState: SanitizedPublicGameState) => {
      const myId = get().myPlayerId;
      const myRole = get().myPrivateRole;
      const prevPhase = get().phase;

      // Determine UI Phase
      let nextPhase: Phase = get().phase;
      if (publicState.phase === "LOBBY") {
        nextPhase = "LOBBY";
      } else if (publicState.phase === "NIGHT_ACTIVE") {
        if (publicState.nightCount === 1 && !get().hasSeenCardReveal) {
          nextPhase = "CARD_REVEAL";
        } else {
          nextPhase = "NIGHT";
        }
      } else if (publicState.phase === "DAY_DISCUSSION") {
        nextPhase = "DAY_NARRATIVE";
      } else if (publicState.phase === "DAY_VOTING") {
        nextPhase = "DAY_VOTING";
      } else if (publicState.phase === "GAME_OVER") {
        nextPhase = "GAME_OVER";
      }

      // Voice announcements on phase change
      if (prevPhase !== nextPhase) {
        if (nextPhase === "CARD_REVEAL") {
          narratorVoice.speak("Kartu peran telah dibagikan secara rahasia. Buka kartumu dan bersiaplah.");
        } else if (nextPhase === "NIGHT") {
          narratorVoice.speak(`Malam ke-${publicState.nightCount} telah tiba di desa. Semua warga tertidur lelap.`);
        } else if (nextPhase === "DAY_NARRATIVE") {
          narratorVoice.speak("Fajar telah tiba. Warga desa berkumpul untuk memulai musyawarah.");
        } else if (nextPhase === "DAY_VOTING") {
          narratorVoice.speak("Waktu berdiskusi selesai. Saatnya warga menentukan suara eliminasi.");
        } else if (nextPhase === "GAME_OVER" && publicState.winResult) {
          narratorVoice.speak(`Permainan telah berakhir! ${publicState.winResult.winner} menang.`);
        }
      }

      // Map Sanitized Public Players, merging my private role and GAME_OVER reveals
      const isGameOver = publicState.phase === "GAME_OVER";
      const mappedPlayers: Player[] = publicState.players.map((p) => {
        const isMe = p.id === myId;
        return {
          id: p.id,
          name: p.name,
          isHost: p.isHost,
          isReady: p.isReady ?? false,
          alive: p.alive,
          silenced: p.silenced,
          protected: false,
          inCult: false,
          hasUsedAbility: false,
          // Private role info for me, or public reveal on GAME_OVER
          role_id: isMe ? myRole?.role_id : (isGameOver ? p.role_id : undefined),
          canonical_name: isMe ? myRole?.canonical_name : (isGameOver ? p.canonical_name : undefined),
          team: isMe ? (myRole?.team as any) : (isGameOver ? (p.team as any) : undefined),
        };
      });

      // Maintain room info
      const currentRoom = get().room;
      const hostPlayer = publicState.players.find((p) => p.isHost);
      const updatedRoom: RoomInfo = currentRoom
        ? {
            ...currentRoom,
            hostId: hostPlayer?.id || currentRoom.hostId,
            hostName: hostPlayer?.name || currentRoom.hostName,
            gameMode: (publicState.gameMode as any) || currentRoom.gameMode,
            targetPlayerCount: publicState.targetPlayerCount,
            selectedRoles: publicState.selectedRoles,
            selectedRolePool: publicState.selectedRolePool,
          }
        : {
            code: publicState.roomId,
            hostId: hostPlayer?.id || "",
            hostName: hostPlayer?.name || "Host",
            targetPlayerCount: publicState.targetPlayerCount,
            gameName: "ASPIRE: WEREWOLF",
            storyTheme: "Dark Fantasy",
            narrationStyle: "Dramatic",
            selectedRoles: publicState.selectedRoles,
            selectedRolePool: publicState.selectedRolePool,
            voiceEnabled: true,
            gameMode: (publicState.gameMode as any) || "MODE_1_FIXED",
          };

      // Transform win result
      const winRes: WinResult | null = publicState.winResult
        ? {
            winner: publicState.winResult.winner,
            reason: publicState.winResult.reason,
            winningPlayerIds: publicState.winResult.winningPlayerIds,
            winningTeams: publicState.winResult.winningTeams,
          }
        : null;

      // Safe night resolution summary
      let updatedLastNightResult = get().lastNightResult;
      if (publicState.publicNightResult) {
        updatedLastNightResult = {
          killed: publicState.publicNightResult.killed || [],
          protected: publicState.publicNightResult.protected || [],
          silenced: publicState.publicNightResult.silenced || [],
          investigated: updatedLastNightResult?.investigated || [],
          conversions: updatedLastNightResult?.conversions || [],
          triggered: updatedLastNightResult?.triggered || [],
          narrative: "",
        };
      }

      // Safe night action progress tracking for UI indicators
      let updatedNightActions = get().nightActions;
      if (publicState.nightActionProgress) {
        const { totalEligible, completedCount } = publicState.nightActionProgress;
        updatedNightActions = Array.from({ length: totalEligible }, (_, i) => ({
          id: `action-${i}`,
          role_id: "unknown",
          role_name: "Peran Malam",
          player_ids: [],
          action_type: "unknown",
          target_player_id: null,
          priority: 50,
          completed: i < completedCount,
        }));
      } else if (publicState.phase !== "NIGHT_ACTIVE") {
        updatedNightActions = [];
      }

      set({
        phase: nextPhase,
        players: mappedPlayers,
        room: updatedRoom,
        dayCount: publicState.dayCount,
        nightCount: publicState.nightCount,
        votes: publicState.votes || {},
        winResult: winRes,
        nightActions: updatedNightActions,
        lastNightResult: updatedLastNightResult,
        currentNarrative: publicState.currentNarrative || get().currentNarrative,
      });
    });

    authoritativeWsClient.onPrivateState((privateState: SanitizedPrivatePlayerState) => {
      const myId = get().myPlayerId;
      if (privateState.playerId !== myId) return;

      set((state) => {
        // Update my player in the players list with authoritative secret identity
        const updatedPlayers = state.players.map((p) => {
          if (p.id === myId) {
            return {
              ...p,
              role_id: privateState.role_id,
              canonical_name: privateState.canonical_name,
              team: privateState.team as any,
              action_type: privateState.abilities?.[0] || "None",
            };
          }
          return p;
        });

        // Record Seer investigation history if present
        let updatedSeerHistory = { ...state.seerResultHistory };
        if (privateState.seer_result) {
          const myPlayer = updatedPlayers.find((p) => p.id === myId);
          if (myPlayer?.nightTargetId) {
            const targetP = updatedPlayers.find((p) => p.id === myPlayer.nightTargetId);
            updatedSeerHistory[myPlayer.nightTargetId] = {
              targetName: targetP?.name || "Target",
              result: privateState.seer_result,
            };
          }
        }

        return {
          myPrivateRole: privateState,
          players: updatedPlayers,
          seerResultHistory: updatedSeerHistory,
        };
      });
    });

    authoritativeWsClient.onChatMessage((chatMsg: ChatMessage) => {
      set((state) => ({
        chatMessages: [...state.chatMessages, chatMsg],
      }));
    });
  }

  return {
    ...initialState,
    myPrivateRole: null,
    hasSeenCardReveal: false,

    setPhase: (phase) => set({ phase }),

    setPlayerName: (name) => {
      if (typeof window !== "undefined") {
        localStorage.setItem("aspire_player_name", name);
      }
      set({ myPlayerName: name });
    },

    toggleVoice: () => {
      const room = get().room;
      const nextVoice = room ? !room.voiceEnabled : !narratorVoice.isVoiceEnabled();
      narratorVoice.setEnabled(nextVoice);
      if (room) {
        set({ room: { ...room, voiceEnabled: nextVoice } });
      }
    },

    // ── Host Creates Room (Authoritative HTTP + WSS) ───────────
    createRoom: async (
      hostName: string,
      selectedRoles?: SelectedRole[],
      theme: string = "Dark Fantasy",
      gameMode: "MODE_1_FIXED" | "MODE_2_POOL" | "MODE_3_RANDOM" | "MODERATOR_HELPER" = "MODE_1_FIXED",
      targetPlayerCount?: number,
      selectedRolePool?: string[]
    ) => {
      const hostId = get().myPlayerId;
      const roomCode = generateRoomCode();
      const targetCount =
        gameMode === "MODE_1_FIXED"
          ? (targetPlayerCount || (selectedRoles ? selectedRoles.reduce((sum, r) => sum + r.count, 0) : 0))
          : undefined;

      get().setPlayerName(hostName);

      const poolToSend = selectedRolePool || (gameMode === "MODE_2_POOL" && selectedRoles ? selectedRoles.map((r) => r.role_id) : undefined);
      const netConfig = getNetworkConfig();
      const res = await fetch(`${netConfig.serverHttpUrl}/api/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hostPlayerId: hostId,
          hostPlayerName: hostName.trim(),
          gameMode,
          customRoomId: roomCode,
          targetPlayerCount: targetCount,
          selectedRoles: gameMode === "MODE_1_FIXED" ? selectedRoles : undefined,
          selectedRolePool: poolToSend,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Gagal membuat room di authoritative server.");
      }

      const { roomId, sessionToken, publicState } = await res.json();

      // Connect authoritative WebSocket
      authoritativeWsClient.connect(sessionToken, roomId, hostId);

      const roomInfo: RoomInfo = {
        code: roomId,
        hostId: hostId,
        hostName: hostName.trim(),
        targetPlayerCount: targetCount,
        gameName: "ASPIRE: WEREWOLF",
        storyTheme: theme || "Dark Fantasy",
        narrationStyle: "Dramatic",
        selectedRoles: gameMode === "MODE_1_FIXED" ? selectedRoles : undefined,
        selectedRolePool: poolToSend,
        voiceEnabled: true,
        gameMode,
      };

      const hostPlayer: Player = {
        id: hostId,
        name: hostName.trim(),
        isHost: true,
        isReady: true,
        alive: true,
        protected: false,
        silenced: false,
        inCult: false,
        hasUsedAbility: false,
      };

      set({
        phase: "LOBBY",
        room: roomInfo,
        players: publicState?.players?.map((p: any) => ({
          id: p.id,
          name: p.name,
          isHost: p.isHost,
          isReady: p.isReady ?? true,
          alive: p.alive,
          silenced: p.silenced,
          protected: false,
          inCult: false,
          hasUsedAbility: false,
        })) || [hostPlayer],
        dayCount: 0,
        nightCount: 0,
        nightActions: [],
        votes: {},
        winResult: null,
        myPrivateRole: null,
        hasSeenCardReveal: false,
        currentNarrative: `Selamat datang di ASPIRE: WEREWOLF! Bagikan kode room ke teman-temanmu.`,
      });

      return roomId;
    },

    // ── Player Joins Room (Authoritative HTTP + WSS) ───────────
    joinRoom: async (roomCode: string, playerName: string) => {
      const myId = get().myPlayerId;
      get().setPlayerName(playerName);

      const netConfig = getNetworkConfig();
      const formattedCode = roomCode.toUpperCase().trim();
      const res = await fetch(`${netConfig.serverHttpUrl}/api/rooms/${encodeURIComponent(formattedCode)}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId: myId,
          playerName: playerName.trim(),
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Gagal bergabung ke room.");
      }

      const { roomId, playerId: serverPlayerId, sessionToken, publicState } = await res.json();
      const effectiveMyId = serverPlayerId || myId;
      if (typeof window !== "undefined") {
        sessionStorage.setItem("aspire_player_id", effectiveMyId);
      }
      set({ myPlayerId: effectiveMyId });

      // Connect authoritative WebSocket
      authoritativeWsClient.connect(sessionToken, roomId, effectiveMyId);

      const hostPlayer = publicState?.players?.find((p: any) => p.isHost);
      const roomInfo: RoomInfo = {
        code: roomId,
        hostId: hostPlayer?.id || "",
        hostName: hostPlayer?.name || "Host",
        targetPlayerCount: publicState?.targetPlayerCount,
        gameName: "ASPIRE: WEREWOLF",
        storyTheme: "Dark Fantasy",
        narrationStyle: "Dramatic",
        selectedRoles: publicState?.selectedRoles,
        selectedRolePool: publicState?.selectedRolePool,
        voiceEnabled: true,
        gameMode: publicState?.gameMode || "MODE_1_FIXED",
      };

      set({
        phase: "LOBBY",
        room: roomInfo,
        players: publicState?.players?.map((p: any) => ({
          id: p.id,
          name: p.name,
          isHost: p.isHost,
          isReady: p.isReady ?? false,
          alive: p.alive,
          silenced: p.silenced,
          protected: false,
          inCult: false,
          hasUsedAbility: false,
        })) || [],
        myPrivateRole: null,
        hasSeenCardReveal: false,
      });

      return true;
    },

    leaveRoom: () => {
      authoritativeWsClient.disconnect();
      narratorVoice.stop();
      set({
        ...initialState,
        myPlayerId: get().myPlayerId,
        myPlayerName: get().myPlayerName,
        myPrivateRole: null,
        hasSeenCardReveal: false,
      });
    },

    // ── Host Starts Game (Authoritative Command) ───────────────
    startGame: () => {
      const { room, myPlayerId } = get();
      if (!room || myPlayerId !== room.hostId) return;

      const payload: any = {};
      if (room.gameMode === "MODE_1_FIXED") {
        payload.fixedRoles = room.selectedRoles;
      } else if (room.gameMode === "MODE_2_POOL") {
        payload.selectedRolePool = room.selectedRolePool || (room.selectedRoles ? room.selectedRoles.map((r) => r.role_id) : []);
      }

      authoritativeWsClient.sendCommand("START_GAME", payload).catch((err) => {
        alert(err.message || "Gagal memulai permainan.");
      });
    },

    // ── Host Updates Room Config (Authoritative Command) ──────
    updateRoomConfig: (config: {
      gameMode?: "MODE_1_FIXED" | "MODE_2_POOL" | "MODE_3_RANDOM" | "MODERATOR_HELPER";
      targetPlayerCount?: number;
      selectedRoles?: SelectedRole[];
      selectedRolePool?: string[];
    }) => {
      const { room, myPlayerId } = get();
      if (!room || myPlayerId !== room.hostId) return;

      authoritativeWsClient.sendCommand("UPDATE_ROOM_CONFIG", config).catch((err) => {
        console.error("Failed to update room config:", err);
      });
    },

    // ── Player Ready Toggle (Authoritative Command) ─────────────
    setPlayerReady: () => {
      set({ hasSeenCardReveal: true });
      authoritativeWsClient.sendCommand("TOGGLE_READY", {}).catch((err) => {
        console.error("Failed to toggle ready:", err);
      });
    },

    // ── Proceed to Night (Local or Authoritative Command) ──────
    proceedToNight: () => {
      const currentPhase = get().phase;
      if (currentPhase === "CARD_REVEAL") {
        set({ phase: "NIGHT", hasSeenCardReveal: true });
        return;
      }
      authoritativeWsClient.sendCommand("RESOLVE_DAY_VOTES", {}).catch((err) => {
        console.error("Failed to proceed to night:", err);
      });
    },

    // ── Submit Night Action (Authoritative Command) ─────────────
    submitNightAction: (targetPlayerId: string | null) => {
      const myId = get().myPlayerId;
      // Update optimistic local target
      set((state) => ({
        players: state.players.map((p) =>
          p.id === myId ? { ...p, nightTargetId: targetPlayerId } : p
        ),
      }));

      authoritativeWsClient.sendCommand("SUBMIT_NIGHT_ACTION", {
        actionId: "",
        targetPlayerId,
      }).catch((err) => {
        console.error("Failed to submit night action:", err);
      });
    },

    // ── Proceed to Voting (Authoritative Command) ───────────────
    proceedToVoting: () => {
      authoritativeWsClient.sendCommand("START_DAY_VOTING", {}).catch((err) => {
        console.error("Failed to open day voting:", err);
      });
    },

    // ── Cast Vote (Authoritative Command) ───────────────────────
    castVote: (targetPlayerId: string | null) => {
      const myId = get().myPlayerId;
      // Update optimistic local vote
      set((state) => ({
        votes: {
          ...state.votes,
          [myId]: targetPlayerId || "",
        },
      }));

      authoritativeWsClient.sendCommand("CAST_VOTE", {
        targetPlayerId: targetPlayerId || "SKIP",
      }).catch((err) => {
        console.error("Failed to cast vote:", err);
      });
    },

    // ── Resolve Day Voting (Authoritative Command) ─────────────
    resolveDayVotingPhase: (isTimeout?: boolean) => {
      authoritativeWsClient.sendCommand("RESOLVE_DAY_VOTES", {
        isTimeout: Boolean(isTimeout),
      }).catch((err) => {
        console.error("Failed to resolve day votes:", err);
      });
    },

    // ── Resolve Night Phase (Authoritative Command) ────────────
    resolveNightPhase: () => {
      authoritativeWsClient.sendCommand("RESOLVE_NIGHT", {}).catch((err) => {
        console.error("Failed to resolve night phase:", err);
      });
    },

    // ── Triggered Actions (Hunter, etc.) ───────────────────────
    resolveTriggeredAction: (_type: string, _targetId?: string) => {
      // Triggered actions are resolved by authoritative server events
    },

    // ── Restart Game (Authoritative Command) ───────────────────
    restartGame: () => {
      authoritativeWsClient.sendCommand("RESTART_GAME", {}).catch((err) => {
        console.error("Failed to restart game:", err);
      });
    },

    // ── Send Chat Message (Authoritative Command) ──────────────
    sendChatMessage: (text: string, channel = "DAY_PUBLIC") => {
      const myId = get().myPlayerId;
      const me = get().players.find((p) => p.id === myId);
      if (me && !me.alive) return;
      if (!text.trim()) return;
      authoritativeWsClient.sendCommand("SEND_CHAT", {
        text: text.trim(),
        channel,
      }).catch((err) => {
        console.error("Failed to send chat message:", err);
      });
    },
  };
});
