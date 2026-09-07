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
  NetworkMessage,
} from "@/types/game";
import {
  randomizeRolesToPlayers,
  buildNightActions,
  resolveNight,
  resolveDayVotes,
  checkWinCondition,
  generateDayNarrative,
  getSeerResult,
} from "@/lib/gameEngine";
import { network } from "@/lib/network";
import { narratorVoice } from "@/lib/narratorVoice";

interface GameStore extends GameState {
  // Navigation & Room Setup
  setPhase: (phase: Phase) => void;
  setPlayerName: (name: string) => void;
  createRoom: (hostName: string, selectedRoles: SelectedRole[], theme: string) => Promise<string>;
  joinRoom: (roomCode: string, playerName: string) => Promise<boolean>;
  leaveRoom: () => void;
  toggleVoice: () => void;

  // Game Lifecycle (Host only)
  startGame: () => void;
  proceedToNight: () => void;
  proceedToVoting: () => void;
  resolveNightPhase: () => void;
  resolveDayVotingPhase: () => void;
  resolveTriggeredAction: (type: string, targetId?: string) => void;
  restartGame: () => void;

  // Player Actions (Any player)
  submitNightAction: (targetPlayerId: string | null) => void;
  castVote: (targetPlayerId: string | null) => void;
  setPlayerReady: () => void;
  sendChatMessage: (text: string, channel?: "DAY_PUBLIC" | "WOLF_SECRET" | "LOBBY") => void;

  // Network sync handler
  handleIncomingNetworkMessage: (msg: NetworkMessage) => void;
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

// Generate random player ID
function generatePlayerId(): string {
  return `p_${Math.random().toString(36).substring(2, 9)}`;
}

const initialPlayerId = typeof window !== "undefined"
  ? sessionStorage.getItem("aspire_player_id") || generatePlayerId()
  : generatePlayerId();

const initialPlayerName = typeof window !== "undefined"
  ? localStorage.getItem("aspire_player_name") || ""
  : "";

if (typeof window !== "undefined") {
  sessionStorage.setItem("aspire_player_id", initialPlayerId);
}

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
};

export const useGameStore = create<GameStore>()((set, get) => {
  // Listen for incoming network events
  if (typeof window !== "undefined") {
    network.onMessage((msg) => {
      get().handleIncomingNetworkMessage(msg);
    });
  }

  return {
    ...initialState,

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
        if (get().myPlayerId === room.hostId) {
          network.broadcast({
            type: "SYNC_STATE",
            senderId: get().myPlayerId,
            payload: { room: { ...room, voiceEnabled: nextVoice } },
          });
        }
      }
    },

    // ── Host Creates Room ──────────────────────────────────────
    createRoom: async (hostName: string, selectedRoles: SelectedRole[], theme: string) => {
      const hostId = get().myPlayerId;
      const roomCode = generateRoomCode();
      const targetCount = selectedRoles.reduce((sum, r) => sum + r.count, 0);

      get().setPlayerName(hostName);

      const hostPlayer: Player = {
        id: hostId,
        name: hostName.trim(),
        isHost: true,
        isReady: false,
        alive: true,
        protected: false,
        silenced: false,
        inCult: false,
        hasUsedAbility: false,
      };

      const roomInfo: RoomInfo = {
        code: roomCode,
        hostId: hostId,
        hostName: hostName.trim(),
        targetPlayerCount: targetCount,
        gameName: "ASPIRE: WEREWOLF",
        storyTheme: theme || "Dark Fantasy",
        narrationStyle: "Dramatic",
        selectedRoles,
        voiceEnabled: true,
      };

      await network.initHost(roomCode, hostId);

      set({
        phase: "LOBBY",
        room: roomInfo,
        players: [hostPlayer],
        dayCount: 0,
        nightCount: 0,
        nightActions: [],
        votes: {},
        winResult: null,
        currentNarrative: `Selamat datang di ASPIRE: WEREWOLF! Bagikan kode room ke teman-temanmu.`,
      });

      return roomCode;
    },

    // ── Player Joins Room ──────────────────────────────────────
    joinRoom: async (roomCode: string, playerName: string) => {
      const myId = get().myPlayerId;
      get().setPlayerName(playerName);

      await network.joinRoom(roomCode, myId, playerName.trim());

      set({
        phase: "LOBBY",
        room: {
          code: roomCode.toUpperCase().trim(),
          hostId: "",
          hostName: "",
          targetPlayerCount: 0,
          gameName: "ASPIRE: WEREWOLF",
          storyTheme: "Dark Fantasy",
          narrationStyle: "Dramatic",
          selectedRoles: [],
          voiceEnabled: true,
        },
      });

      return true;
    },

    leaveRoom: () => {
      network.cleanup();
      narratorVoice.stop();
      set({
        ...initialState,
        myPlayerId: get().myPlayerId,
        myPlayerName: get().myPlayerName,
      });
    },

    // ── Host Starts Game ───────────────────────────────────────
    startGame: () => {
      const { room, players, myPlayerId } = get();
      if (!room || myPlayerId !== room.hostId) return;

      // Only start if room is full
      if (players.length < room.targetPlayerCount) {
        alert(`Room belum penuh! Menunggu ${room.targetPlayerCount - players.length} pemain lagi.`);
        return;
      }

      // Randomize roles
      const randomizedPlayers = randomizeRolesToPlayers(players, room.selectedRoles);

      const updatedState = {
        phase: "CARD_REVEAL" as Phase,
        players: randomizedPlayers,
        dayCount: 0,
        nightCount: 0,
        nightActions: [],
        currentNarrative: "Kartu peran telah dibagikan secara rahasia! Buka kartu peranmu sekarang.",
        gameLog: [
          {
            day: 0,
            phase: "NIGHT" as const,
            type: "system" as const,
            text: `Permainan dimulai! ${randomizedPlayers.length} pemain telah menerima peran rahasia.`,
            timestamp: Date.now(),
          },
        ],
      };

      set(updatedState);

      // Broadcast to all clients
      network.broadcast({
        type: "START_GAME",
        senderId: myPlayerId,
        payload: updatedState,
      });

      narratorVoice.speak("Kartu peran telah dibagikan secara rahasia. Buka kartumu dan bersiaplah.");
    },

    // ── Player Confirms Role Card ──────────────────────────────
    setPlayerReady: () => {
      const myId = get().myPlayerId;
      const isHost = get().room?.hostId === myId;

      const updatedPlayers = get().players.map((p) =>
        p.id === myId ? { ...p, isReady: true } : p
      );

      set({ players: updatedPlayers });

      if (!isHost) {
        network.sendToHost({
          type: "TOGGLE_READY",
          senderId: myId,
          payload: { playerId: myId, isReady: true },
        });
      } else {
        network.broadcast({
          type: "SYNC_STATE",
          senderId: myId,
          payload: { players: updatedPlayers },
        });
      }
    },

    // ── Transition to Night Phase ──────────────────────────────
    proceedToNight: () => {
      const { room, players, myPlayerId, nightCount } = get();
      if (!room || myPlayerId !== room.hostId) return;

      const nextNight = nightCount + 1;
      const nightActions = buildNightActions(players, nextNight);

      const updatedState = {
        phase: "NIGHT" as Phase,
        nightCount: nextNight,
        nightActions,
        currentNarrative: `🌙 Malam ke-${nextNight} telah tiba... Semua warga desa menutup mata. Serigala dan peran malam mulai beraksi.`,
        gameLog: [
          ...get().gameLog,
          {
            day: nextNight,
            phase: "NIGHT" as const,
            type: "system" as const,
            text: `Malam ke-${nextNight} dimulai.`,
            timestamp: Date.now(),
          },
        ],
      };

      set(updatedState);

      network.broadcast({
        type: "SYNC_STATE",
        senderId: myPlayerId,
        payload: updatedState,
      });

      narratorVoice.speak(`Malam ke-${nextNight} telah tiba di desa. Semua warga tertidur lelap...`);
    },

    // ── Submit Night Action (Player) ───────────────────────────
    submitNightAction: (targetPlayerId: string | null) => {
      const myId = get().myPlayerId;
      const isHost = get().room?.hostId === myId;
      const myPlayer = get().players.find((p) => p.id === myId);

      if (!myPlayer) return;

      // Calculate seer result if Seer
      if (myPlayer.canonical_name === "Seer" && targetPlayerId) {
        const target = get().players.find((p) => p.id === targetPlayerId);
        if (target) {
          const res = getSeerResult(target);
          set((state) => ({
            seerResultHistory: {
              ...state.seerResultHistory,
              [targetPlayerId]: {
                targetName: target.name,
                result: res,
              },
            },
          }));
        }
      }

      // Update my player's night target
      const updatedPlayers = get().players.map((p) =>
        p.id === myId ? { ...p, nightTargetId: targetPlayerId } : p
      );

      // Update night actions in Host
      let updatedNightActions = get().nightActions.map((action) => {
        if (action.player_ids.includes(myId) || action.role_name === myPlayer.canonical_name) {
          return {
            ...action,
            target_player_id: targetPlayerId,
            completed: true,
          };
        }
        return action;
      });

      set({ players: updatedPlayers, nightActions: updatedNightActions });

      if (!isHost) {
        network.sendToHost({
          type: "SUBMIT_NIGHT_ACTION",
          senderId: myId,
          payload: {
            playerId: myId,
            targetPlayerId,
            roleName: myPlayer.canonical_name,
          },
        });
      } else {
        network.broadcast({
          type: "SYNC_STATE",
          senderId: myId,
          payload: {
            players: updatedPlayers,
            nightActions: updatedNightActions,
          },
        });
      }
    },

    // ── Resolve Night Phase (Host only) ────────────────────────
    resolveNightPhase: () => {
      const { players, nightActions, nightCount, room, myPlayerId } = get();
      if (!room || myPlayerId !== room.hostId) return;

      const { updatedPlayers, result, triggered } = resolveNight(players, nightActions);
      const killedPlayers = updatedPlayers.filter((p) => result.killed.includes(p.id));
      const narrative = generateDayNarrative(killedPlayers, room.storyTheme);

      const newLog = [
        ...get().gameLog,
        {
          day: nightCount,
          phase: "NIGHT" as const,
          type: "narrative" as const,
          text: result.narrative,
          timestamp: Date.now(),
        },
      ];

      for (const killed of killedPlayers) {
        newLog.push({
          day: nightCount,
          phase: "NIGHT" as const,
          type: "elimination" as const,
          text: `${killed.name} (${killed.canonical_name}) gugur di malam hari.`,
          timestamp: Date.now(),
        });
      }

      // Check win condition
      const win = checkWinCondition(updatedPlayers);

      const nextPhase: Phase = win ? "GAME_OVER" : "DAY_NARRATIVE";

      const updatedState = {
        phase: nextPhase,
        dayCount: nightCount,
        players: updatedPlayers,
        lastNightResult: result,
        triggeredActions: triggered,
        activeTriggeredAction: triggered.find((t) => !t.completed) || null,
        currentNarrative: narrative,
        gameLog: newLog,
        winResult: win,
        votes: {},
      };

      set(updatedState);

      network.broadcast({
        type: "SYNC_STATE",
        senderId: myPlayerId,
        payload: updatedState,
      });

      if (win) {
        narratorVoice.speak(`Permainan telah berakhir! ${win.winner === "Werewolf" ? "Para Werewolf" : "Warga Desa"} memenangkan pertempuran.`);
      } else if (killedPlayers.length > 0) {
        narratorVoice.speak(`Fajar telah tiba. Duka menyelimuti desa, ${killedPlayers.map((p) => p.name).join(" dan ")} telah gugur dimangsa serigala.`);
      } else {
        narratorVoice.speak("Fajar telah tiba. Semua warga desa selamat, tidak ada korban semalam!");
      }
    },

    // ── Transition to Voting Phase ─────────────────────────────
    proceedToVoting: () => {
      const { room, myPlayerId } = get();
      if (!room || myPlayerId !== room.hostId) return;

      const updatedState = {
        phase: "DAY_VOTING" as Phase,
        votes: {},
        currentNarrative: "Waktu diskusi telah usai. Saatnya setiap warga memberikan suaranya untuk mengeliminasi satu orang yang dicurigai!",
      };

      set(updatedState);

      network.broadcast({
        type: "SYNC_STATE",
        senderId: myPlayerId,
        payload: updatedState,
      });

      narratorVoice.speak("Waktu berdiskusi selesai. Saatnya warga menentukan suara eliminasi.");
    },

    // ── Cast Vote (Player) ─────────────────────────────────────
    castVote: (targetPlayerId: string | null) => {
      const myId = get().myPlayerId;
      const isHost = get().room?.hostId === myId;

      const updatedVotes = {
        ...get().votes,
        [myId]: targetPlayerId || "",
      };

      set({ votes: updatedVotes });

      if (!isHost) {
        network.sendToHost({
          type: "SUBMIT_VOTE",
          senderId: myId,
          payload: { voterId: myId, targetId: targetPlayerId },
        });
      } else {
        network.broadcast({
          type: "SYNC_STATE",
          senderId: myId,
          payload: { votes: updatedVotes },
        });
      }
    },

    // ── Resolve Day Voting (Host only) ─────────────────────────
    resolveDayVotingPhase: () => {
      const { players, votes, dayCount, room, myPlayerId } = get();
      if (!room || myPlayerId !== room.hostId) return;

      const { updatedPlayers, eliminatedPlayer, tally, triggered } = resolveDayVotes(players, votes);

      const newLog = [...get().gameLog];
      let narrative = "";

      if (eliminatedPlayer) {
        narrative = `⚖️ **HASIL VOTING WARGA**\n\nSetelah perdebatan sengit, warga desa telah memutuskan.\n\n**${eliminatedPlayer.name}** (${eliminatedPlayer.canonical_name}) dieksekusi oleh warga desa!\n\n`;
        newLog.push({
          day: dayCount,
          phase: "DAY" as const,
          type: "elimination" as const,
          text: `${eliminatedPlayer.name} (${eliminatedPlayer.canonical_name}) dieliminasi melalui voting warga.`,
          timestamp: Date.now(),
        });
      } else {
        narrative = `⚖️ **HASIL VOTING WARGA**\n\nVoting berakhir seri atau tidak ada suara yang cukup. Tidak ada warga yang dieksekusi hari ini!\n\n`;
      }

      // Check win condition
      const win = checkWinCondition(updatedPlayers);
      const nextPhase: Phase = win ? "GAME_OVER" : "DAY_NARRATIVE";

      const updatedState = {
        phase: nextPhase,
        players: updatedPlayers,
        triggeredActions: triggered,
        activeTriggeredAction: triggered.find((t) => !t.completed) || null,
        currentNarrative: narrative,
        gameLog: newLog,
        winResult: win,
      };

      set(updatedState);

      network.broadcast({
        type: "SYNC_STATE",
        senderId: myPlayerId,
        payload: updatedState,
      });

      if (win) {
        narratorVoice.speak(`Permainan telah berakhir! ${win.winner} menang.`);
      } else if (eliminatedPlayer) {
        narratorVoice.speak(`Warga telah sepakat. ${eliminatedPlayer.name} dieliminasi oleh warga desa.`);
      } else {
        narratorVoice.speak("Voting berakhir seri. Tidak ada yang dieksekusi hari ini.");
      }
    },

    // ── Resolve Triggered Action (Hunter, etc.) ─────────────────
    resolveTriggeredAction: (type: string, targetId?: string) => {
      const { players, triggeredActions, myPlayerId, room } = get();
      let updatedPlayers = [...players];

      const updatedTriggered = triggeredActions.map((t) => {
        if (t.type === type && !t.completed) {
          return { ...t, completed: true, target_player_id: targetId || null };
        }
        return t;
      });

      if (type === "HUNTER" && targetId) {
        updatedPlayers = updatedPlayers.map((p) =>
          p.id === targetId ? { ...p, alive: false } : p
        );
      }

      const win = checkWinCondition(updatedPlayers);
      const nextPending = updatedTriggered.find((t) => !t.completed) || null;

      const updatedState = {
        players: updatedPlayers,
        triggeredActions: updatedTriggered,
        activeTriggeredAction: nextPending,
        winResult: win,
        phase: win ? ("GAME_OVER" as Phase) : get().phase,
      };

      set(updatedState);

      if (room && myPlayerId === room.hostId) {
        network.broadcast({
          type: "SYNC_STATE",
          senderId: myPlayerId,
          payload: updatedState,
        });
      }
    },

    // ── Restart Game ───────────────────────────────────────────
    restartGame: () => {
      const { room, players, myPlayerId } = get();
      if (!room || myPlayerId !== room.hostId) return;

      const resetPlayers = players.map((p) => ({
        id: p.id,
        name: p.name,
        isHost: p.isHost,
        isReady: false,
        alive: true,
        protected: false,
        silenced: false,
        inCult: false,
        hasUsedAbility: false,
      }));

      const updatedState = {
        phase: "LOBBY" as Phase,
        players: resetPlayers,
        dayCount: 0,
        nightCount: 0,
        nightActions: [],
        triggeredActions: [],
        activeTriggeredAction: null,
        lastNightResult: null,
        winResult: null,
        votes: {},
        seerResultHistory: {},
        currentNarrative: "Siap untuk ronde berikutnya!",
      };

      set(updatedState);

      network.broadcast({
        type: "SYNC_STATE",
        senderId: myPlayerId,
        payload: updatedState,
      });
    },

    // ── Send Chat Message ─────────────────────────────────────
    sendChatMessage: (text: string, channel = "DAY_PUBLIC") => {
      const { myPlayerId, myPlayerName, players, room } = get();
      const me = players.find((p) => p.id === myPlayerId);
      const isHost = room && room.hostId === myPlayerId;

      const chatMsg = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        senderId: myPlayerId,
        senderName: myPlayerName || me?.name || "Pemain",
        channel: channel as any,
        text: text.trim(),
        timestamp: Date.now(),
        isDead: me ? !me.alive : false,
      };

      set((state) => ({ chatMessages: [...state.chatMessages, chatMsg] }));

      if (isHost) {
        network.broadcast({
          type: "SEND_CHAT",
          senderId: myPlayerId,
          payload: chatMsg,
        });
      } else {
        network.sendToHost({
          type: "SEND_CHAT",
          senderId: myPlayerId,
          payload: chatMsg,
        });
      }
    },

    // ── Handle Incoming Network Messages ───────────────────────
    handleIncomingNetworkMessage: (msg: NetworkMessage) => {
      const { myPlayerId, room, players } = get();
      const isHost = room && room.hostId === myPlayerId;

      switch (msg.type) {
        case "JOIN_ROOM": {
          if (!isHost || !room) return;
          const { id, name } = msg.payload || {};
          if (!id || !name) return;

          // Check if player already exists
          const existing = players.find((p) => p.id === id);
          let updatedPlayers: Player[];

          if (existing) {
            updatedPlayers = players.map((p) =>
              p.id === id ? { ...p, name: name.trim() } : p
            );
          } else {
            // Check if room already full
            if (players.length >= room.targetPlayerCount) {
              return;
            }

            const newPlayer: Player = {
              id,
              name: name.trim(),
              isHost: false,
              isReady: false,
              alive: true,
              protected: false,
              silenced: false,
              inCult: false,
              hasUsedAbility: false,
            };
            updatedPlayers = [...players, newPlayer];
          }

          set({ players: updatedPlayers });

          // Send current state to all clients
          network.broadcast({
            type: "SYNC_STATE",
            senderId: myPlayerId,
            payload: {
              room: { ...room },
              players: updatedPlayers,
              phase: get().phase,
              chatMessages: get().chatMessages,
            },
          });
          break;
        }

        case "REQUEST_SYNC": {
          if (!isHost || !room) return;
          network.broadcast({
            type: "SYNC_STATE",
            senderId: myPlayerId,
            payload: {
              room: { ...room },
              players: get().players,
              phase: get().phase,
              nightCount: get().nightCount,
              dayCount: get().dayCount,
              currentNarrative: get().currentNarrative,
              chatMessages: get().chatMessages,
              votes: get().votes,
            },
          });
          break;
        }

        case "SYNC_STATE": {
          if (msg.payload) {
            set((state) => ({
              ...state,
              ...msg.payload,
              // Maintain local player identity
              myPlayerId: state.myPlayerId,
              myPlayerName: state.myPlayerName,
            }));
          }
          break;
        }

        case "START_GAME": {
          if (msg.payload) {
            set((state) => ({
              ...state,
              ...msg.payload,
            }));
            narratorVoice.speak("Kartu peran telah dibagikan secara rahasia. Buka kartumu dan bersiaplah.");
          }
          break;
        }

        case "SUBMIT_NIGHT_ACTION": {
          if (!isHost) return;
          const { playerId, targetPlayerId, roleName } = msg.payload || {};
          const updatedNightActions = get().nightActions.map((a) => {
            if (a.player_ids.includes(playerId) || a.role_name === roleName) {
              return { ...a, target_player_id: targetPlayerId, completed: true };
            }
            return a;
          });

          set({ nightActions: updatedNightActions });
          network.broadcast({
            type: "SYNC_STATE",
            senderId: myPlayerId,
            payload: { nightActions: updatedNightActions },
          });
          break;
        }

        case "SUBMIT_VOTE": {
          if (!isHost) return;
          const { voterId, targetId } = msg.payload || {};
          const updatedVotes = { ...get().votes, [voterId]: targetId };
          set({ votes: updatedVotes });
          network.broadcast({
            type: "SYNC_STATE",
            senderId: myPlayerId,
            payload: { votes: updatedVotes },
          });
          break;
        }

        case "TOGGLE_READY": {
          if (!isHost) return;
          const { playerId, isReady } = msg.payload || {};
          const updatedPlayers = get().players.map((p) =>
            p.id === playerId ? { ...p, isReady } : p
          );
          set({ players: updatedPlayers });
          network.broadcast({
            type: "SYNC_STATE",
            senderId: myPlayerId,
            payload: { players: updatedPlayers },
          });
          break;
        }

        case "SEND_CHAT": {
          if (msg.payload) {
            const newMsg = msg.payload;
            if (!get().chatMessages.some((m) => m.id === newMsg.id)) {
              set((state) => ({
                chatMessages: [...state.chatMessages, newMsg],
              }));

              // If Host received from client, re-broadcast to all other peers!
              if (isHost) {
                network.broadcast({
                  type: "SEND_CHAT",
                  senderId: myPlayerId,
                  payload: newMsg,
                });
              }
            }
          }
          break;
        }

        default:
          break;
      }
    },
  };
});
