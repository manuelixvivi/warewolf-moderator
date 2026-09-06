import { Player, NightAction, NightResult, TriggeredAction, WinResult } from "@/types/game";

// ── Night Action Resolution ────────────────────────────────────────────
export function resolveNight(
  players: Player[],
  actions: NightAction[]
): { updatedPlayers: Player[]; result: NightResult; triggered: TriggeredAction[] } {
  const sortedActions = [...actions].sort((a, b) => a.priority - b.priority);
  const playerMap = new Map<string, Player>(players.map((p) => [p.id, { ...p, protected: false }]));

  const result: NightResult = {
    killed: [],
    protected: [],
    investigated: [],
    conversions: [],
    silenced: [],
    triggered: [],
    narrative: "",
  };
  const triggered: TriggeredAction[] = [];

  // Phase 1: Protections (priority < 50)
  for (const action of sortedActions) {
    if (!action.completed || !action.target_player_id) continue;
    const targetId = action.target_player_id;
    if (["Protect", "Protect/Heal", "Guard"].some(t => action.action_type.includes(t))) {
      const target = playerMap.get(targetId);
      if (target) {
        playerMap.set(targetId, { ...target, protected: true });
      }
    }
  }

  // Phase 2: Kills (priority 50-80)
  for (const action of sortedActions) {
    if (!action.completed || !action.target_player_id) continue;
    const targetId = action.target_player_id;
    if (["Kill", "Eliminate", "Attack", "Chain Elimination"].some(t => action.action_type.includes(t))) {
      const target = playerMap.get(targetId);
      if (target && target.alive) {
        if (target.protected) {
          result.protected.push(targetId);
        } else {
          result.killed.push(targetId);
          playerMap.set(targetId, { ...target, alive: false });
        }
      }
    }
  }

  // Phase 3: Investigations (priority 80+)
  for (const action of sortedActions) {
    if (!action.completed || !action.target_player_id) continue;
    const targetId = action.target_player_id;
    if (["Investigate", "Check", "See"].some(t => action.action_type.includes(t))) {
      const target = playerMap.get(targetId);
      if (target) {
        const seerResult = getSeerResult(target);
        result.investigated.push({
          investigator: action.player_ids[0] || "",
          target: targetId,
          result: seerResult,
        });
      }
    }
  }

  // Check triggered actions for killed players
  for (const killedId of result.killed) {
    const killed = playerMap.get(killedId);
    if (!killed) continue;

    if (killed.canonical_name === "Hunter") {
      triggered.push({
        type: "HUNTER",
        player_id: killedId,
        role_name: "Hunter",
        completed: false,
      });
    } else if (killed.canonical_name === "Wolf Cub") {
      triggered.push({
        type: "WOLF_CUB_EXTRA",
        player_id: killedId,
        role_name: "Wolf Cub",
        completed: true, // auto-handle
      });
    } else if (killed.can_change_role) {
      triggered.push({
        type: "DOPPELGANGER",
        player_id: killedId,
        role_name: killed.canonical_name,
        completed: false,
      });
    }
  }

  result.triggered = triggered;
  result.narrative = generateNightNarrative(result, playerMap);
  return { updatedPlayers: Array.from(playerMap.values()), result, triggered };
}

function getSeerResult(player: Player): "Werewolf" | "Villager" {
  if (player.seer_result === "Werewolf") return "Werewolf";
  return "Villager";
}

export function resolveVoteElimination(
  players: Player[],
  targetId: string
): { updatedPlayers: Player[]; triggered: TriggeredAction[] } {
  const triggered: TriggeredAction[] = [];
  const updatedPlayers = players.map((p) => {
    if (p.id === targetId) {
      if (p.canonical_name === "Hunter") {
        triggered.push({
          type: "HUNTER",
          player_id: p.id,
          role_name: "Hunter",
          completed: false,
        });
      }
      if (p.canonical_name === "Tanner") {
        triggered.push({
          type: "TANNER_WIN",
          player_id: p.id,
          role_name: "Tanner",
          completed: true,
        });
      }
      return { ...p, alive: false };
    }
    return p;
  });
  return { updatedPlayers, triggered };
}

export function checkWinCondition(players: Player[]): WinResult | null {
  const alivePlayers = players.filter((p) => p.alive);
  const aliveWerewolves = alivePlayers.filter(
    (p) => p.team === "Werewolf" || p.team === "Werewolf-aligned" || p.team === "Solo Werewolf"
  );
  const aliveVillage = alivePlayers.filter(
    (p) => p.team === "Village" || p.team === "Village/Dynamic"
  );

  // Werewolf win: >= village count
  if (aliveWerewolves.length >= aliveVillage.length && aliveWerewolves.length > 0) {
    return { winner: "Werewolf", reason: "Werewolf telah mencapai paritas dengan Village!" };
  }

  // Village win: all werewolves dead
  if (aliveWerewolves.length === 0 && alivePlayers.length > 0) {
    return { winner: "Village", reason: "Semua Werewolf telah dieliminasi!" };
  }

  return null;
}

export function buildNightActions(players: Player[]): NightAction[] {
  const alivePlayers = players.filter((p) => p.alive);
  const actions: NightAction[] = [];
  const roleGroups = new Map<string, Player[]>();

  for (const p of alivePlayers) {
    const phase = p.active_phase || "";
    const isNightActive =
      phase.toLowerCase().includes("night") ||
      phase.toLowerCase().includes("triggered");

    if (!isNightActive || !p.action_type || p.action_type.toLowerCase() === "passive") continue;

    if (!roleGroups.has(p.canonical_name)) {
      roleGroups.set(p.canonical_name, []);
    }
    roleGroups.get(p.canonical_name)!.push(p);
  }

  for (const [roleName, rolePlayers] of roleGroups) {
    const rep = rolePlayers[0];
    actions.push({
      id: `action-${roleName}-${Date.now()}`,
      role_id: rep.role_id,
      role_name: roleName,
      player_ids: rolePlayers.map((p) => p.id),
      action_type: rep.action_type,
      target_player_id: null,
      completed: false,
      priority: rep.night_priority || 50,
    });
  }

  return actions.sort((a, b) => a.priority - b.priority);
}

// ── Narrative Generator ────────────────────────────────────────────────
export function generateNightNarrative(result: NightResult, playerMap: Map<string, Player>): string {
  const themes: Record<string, string[]> = {
    default: [
      "Kegelapan menyelimuti desa...",
      "Malam menghampiri...",
      "Suara malam memenuhi udara...",
    ],
  };

  const opening = themes.default[Math.floor(Math.random() * themes.default.length)];

  if (result.killed.length === 0 && result.protected.length > 0) {
    const savedName = playerMap.get(result.protected[0])?.name || "seseorang";
    return `${opening} Semua aman... ${savedName} hampir menjadi korban, namun berhasil diselamatkan.`;
  }

  if (result.killed.length === 0) {
    return `${opening} Pagi tiba, dan tidak ada korban jiwa malam ini.`;
  }

  const killedNames = result.killed.map((id) => playerMap.get(id)?.name || "seseorang").join(", ");
  return `${opening} Saat fajar menyingsing, desa menemukan ${killedNames} terbujur kaku...`;
}

export function generateDayNarrative(
  killedPlayers: Player[],
  theme: string,
  style: string
): string {
  if (killedPlayers.length === 0) {
    const openings = [
      "☀️ Matahari terbit di atas desa yang sunyi...",
      "☀️ Fajar menyingsing tanpa membawa duka...",
    ];
    return openings[Math.floor(Math.random() * openings.length)] +
      "\n\nTidak ada korban semalam. Warga berkumpul di alun-alun, wajah mereka penuh curiga.";
  }

  const names = killedPlayers.map((p) => p.name).join(" dan ");
  const openings = [
    `☀️ Matahari terbit, namun desa sudah tidak sama...`,
    `☀️ Pagi datang membawa duka ke desa...`,
  ];
  return openings[Math.floor(Math.random() * openings.length)] +
    "\n\n**" + names + "** ditemukan tidak bernyawa.\n\nWarga berkumpul dan mulai berdiskusi... Siapakah Werewolf di antara mereka?";
}