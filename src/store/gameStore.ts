import { create } from "zustand";
import {
  GameState,
  GameConfig,
  Player,
  TriggeredAction,
  WinResult,
} from "@/types/game";
import {
  buildNightActions,
  resolveNight,
  resolveVoteElimination,
  checkWinCondition,
  generateDayNarrative,
} from "@/lib/gameEngine";

interface GameStore extends GameState {
  setConfig: (config: Partial<GameConfig>) => void;
  initPlayers: (players: Player[]) => void;
  startGame: () => void;
  setNightActionTarget: (actionId: string, targetId: string | null) => void;
  setNightActionTarget2: (actionId: string, targetId: string | null) => void;
  completeNightAction: (actionId: string) => void;
  resolveNightPhase: () => void;
  voteEliminate: (targetId: string) => void;
  startNight: () => void;
  resolveTriggeredAction: (type: string, targetId?: string) => void;
  resetGame: () => void;
}

const initialState: GameState = {
  phase: "SETUP",
  dayCount: 0,
  nightCount: 0,
  config: {
    gameName: "",
    storyTheme: "Dark Fantasy",
    narrationStyle: "Dramatic",
    selectedRoles: [],
  },
  players: [],
  nightActions: [],
  triggeredActions: [],
  activeTriggeredAction: null,
  lastNightResult: null,
  currentNarrative: "",
  gameLog: [],
  winResult: null,
};

export const useGameStore = create<GameStore>()((set, get) => ({
  ...initialState,

  setConfig: (config) =>
    set((state) => ({
      config: { ...state.config, ...config },
    })),

  initPlayers: (players) =>
    set({ players, phase: "NAME_INPUT" }),

  startGame: () =>
    set((state) => ({
      phase: "NIGHT",
      nightCount: 1,
      nightActions: buildNightActions(state.players),
      currentNarrative: "🌙 Malam pertama telah tiba. Semua pemain menutup mata...",
      gameLog: [
        ...state.gameLog,
        {
          day: 0,
          phase: "NIGHT" as const,
          type: "system" as const,
          text: "Permainan dimulai! Malam 1 telah dimulai.",
          timestamp: Date.now(),
        },
      ],
    })),

  setNightActionTarget: (actionId, targetId) =>
    set((state) => ({
      nightActions: state.nightActions.map((a) =>
        a.id === actionId ? { ...a, target_player_id: targetId } : a
      ),
    })),

  setNightActionTarget2: (actionId, targetId) =>
    set((state) => ({
      nightActions: state.nightActions.map((a) =>
        a.id === actionId ? { ...a, target2_player_id: targetId } : a
      ),
    })),

  completeNightAction: (actionId) =>
    set((state) => ({
      nightActions: state.nightActions.map((a) =>
        a.id === actionId ? { ...a, completed: true } : a
      ),
    })),

  resolveNightPhase: () => {
    const { players, nightActions, nightCount, config } = get();
    const { updatedPlayers, result, triggered } = resolveNight(players, nightActions);

    const killedPlayers = updatedPlayers.filter((p) => result.killed.includes(p.id));
    const dayNarrative = generateDayNarrative(
      killedPlayers,
      config.storyTheme,
      config.narrationStyle
    );

    const newLog = [...get().gameLog];
    newLog.push({
      day: nightCount,
      phase: "NIGHT" as const,
      type: "narrative" as const,
      text: result.narrative,
      timestamp: Date.now(),
    });
    for (const killedId of result.killed) {
      const p = updatedPlayers.find((x) => x.id === killedId);
      if (p) {
        newLog.push({
          day: nightCount,
          phase: "NIGHT" as const,
          type: "elimination" as const,
          text: `${p.name} (${p.canonical_name}) dieliminasi malam ini.`,
          timestamp: Date.now(),
        });
      }
    }

    const pendingTriggered = triggered.find((t) => !t.completed) || null;

    if (pendingTriggered) {
      set({
        players: updatedPlayers,
        lastNightResult: result,
        triggeredActions: triggered,
        activeTriggeredAction: pendingTriggered,
        currentNarrative: dayNarrative,
        dayCount: nightCount,
        gameLog: newLog,
      });
      return;
    }

    const win = checkWinCondition(updatedPlayers);
    set({
      players: updatedPlayers,
      lastNightResult: result,
      triggeredActions: triggered,
      activeTriggeredAction: null,
      currentNarrative: dayNarrative,
      dayCount: nightCount,
      gameLog: newLog,
      winResult: win,
      phase: win ? "GAME_OVER" : "DAY",
    });
  },

  voteEliminate: (targetId) => {
    const { players, dayCount } = get();
    const { updatedPlayers, triggered } = resolveVoteElimination(players, targetId);

    const eliminated = updatedPlayers.find((p) => p.id === targetId);
    const narrative =
      get().currentNarrative +
      (eliminated
        ? `\n\n⚖️ Warga telah memilih... **${eliminated.name}** (${eliminated.canonical_name}) dieliminasi!`
        : "");

    const newLog = [...get().gameLog];
    if (eliminated) {
      newLog.push({
        day: dayCount,
        phase: "DAY" as const,
        type: "elimination" as const,
        text: `${eliminated.name} (${eliminated.canonical_name}) divote keluar.`,
        timestamp: Date.now(),
      });
    }

    const allTriggered = [...get().triggeredActions, ...triggered];
    const pendingTriggered = triggered.find((t) => !t.completed) || null;

    if (pendingTriggered) {
      set({
        players: updatedPlayers,
        triggeredActions: allTriggered,
        activeTriggeredAction: pendingTriggered,
        currentNarrative: narrative,
        gameLog: newLog,
      });
      return;
    }

    const win = checkWinCondition(updatedPlayers);
    set({
      players: updatedPlayers,
      triggeredActions: allTriggered,
      activeTriggeredAction: null,
      currentNarrative: narrative,
      gameLog: newLog,
      winResult: win,
      phase: win ? "GAME_OVER" : undefined,
    } as any);
    if (win) set({ phase: "GAME_OVER", winResult: win });
  },

  startNight: () =>
    set((state) => ({
      phase: "NIGHT",
      nightCount: state.nightCount + 1,
      nightActions: buildNightActions(state.players),
      triggeredActions: [],
      activeTriggeredAction: null,
      currentNarrative: `🌙 Malam ke-${state.nightCount + 1} telah tiba...`,
      gameLog: [
        ...state.gameLog,
        {
          day: state.nightCount + 1,
          phase: "NIGHT" as const,
          type: "system" as const,
          text: `Malam ${state.nightCount + 1} dimulai.`,
          timestamp: Date.now(),
        },
      ],
    })),

  resolveTriggeredAction: (type, targetId) => {
    const { players, triggeredActions } = get();

    let updatedPlayers = [...players];
    const updatedTriggered = triggeredActions.map((t) => {
      if (t.type === type && !t.completed) {
        return { ...t, completed: true, target_player_id: targetId || null };
      }
      return t;
    });

    const newLog = [...get().gameLog];

    if (type === "HUNTER" && targetId) {
      updatedPlayers = updatedPlayers.map((p) =>
        p.id === targetId ? { ...p, alive: false } : p
      );
      const target = updatedPlayers.find((p) => p.id === targetId);
      if (target) {
        newLog.push({
          day: get().dayCount || get().nightCount,
          phase: (get().phase === "NIGHT" ? "NIGHT" : "DAY") as "NIGHT" | "DAY",
          type: "elimination" as const,
          text: `${target.name} (${target.canonical_name}) dieliminasi oleh Hunter.`,
          timestamp: Date.now(),
        });
      }
    }

    const nextPending = updatedTriggered.find((t) => !t.completed) || null;
    const win = checkWinCondition(updatedPlayers);

    set({
      players: updatedPlayers,
      triggeredActions: updatedTriggered,
      activeTriggeredAction: nextPending,
      gameLog: newLog,
      ...((!nextPending && win) ? { winResult: win, phase: "GAME_OVER" } : {}),
      ...(!nextPending && !win && get().phase === "NIGHT" ? { phase: "DAY" } : {}),
    } as any);
  },

  resetGame: () => set({ ...initialState }),
}));