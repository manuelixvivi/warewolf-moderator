import { Player, NightAction, NightResult, TriggeredAction, WinResult, SelectedRole, RoleData } from "@/types/game";
import rolesJson from "@/data/roles.json";

const ALL_ROLES = rolesJson as RoleData[];

// ── 1. Role Randomizer ──────────────────────────────────────────────
export function randomizeRolesToPlayers(
  players: Player[],
  selectedRoles: SelectedRole[]
): Player[] {
  // 1. Expand selected roles into full role array
  const rolePool: RoleData[] = [];
  for (const sr of selectedRoles) {
    const roleData = ALL_ROLES.find((r) => r.role_id === sr.role_id);
    if (roleData) {
      for (let i = 0; i < sr.count; i++) {
        rolePool.push(roleData);
      }
    }
  }

  // If rolePool is smaller than players, fill remainder with Villager
  const villagerRole = ALL_ROLES.find((r) => r.canonical_name === "Villager") || ALL_ROLES[0];
  while (rolePool.length < players.length) {
    rolePool.push(villagerRole);
  }

  // 2. Fisher-Yates cryptographically-secure shuffle
  const shuffled = [...rolePool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  // 3. Assign role to each player
  return players.map((player, idx) => {
    const role = shuffled[idx];
    return {
      ...player,
      role_id: role.role_id,
      canonical_name: role.canonical_name,
      team: role.team,
      category: role.category,
      seer_result: role.seer_result,
      description_id: role.description_id || role.tooltip_id || role.description_en,
      description_en: role.description_en,
      tooltip_en: role.tooltip_en,
      tooltip_id: role.tooltip_id,
      active_phase: role.active_phase,
      action_type: role.action_type,
      target_type: role.target_type,
      usage_limit: role.usage_limit,
      night_priority: role.night_priority || 99,
      can_change_role: role.can_change_role,
      alive: true,
      protected: false,
      silenced: false,
      inCult: false,
      hasUsedAbility: false,
      votedForId: null,
      nightTargetId: null,
    };
  });
}

// ── 2. Build Night Actions ──────────────────────────────────────────
export function buildNightActions(players: Player[], nightCount: number = 1): NightAction[] {
  const alivePlayers = players.filter((p) => p.alive);
  const actions: NightAction[] = [];
  const roleGroups = new Map<string, Player[]>();

  for (const p of alivePlayers) {
    const phase = (p.active_phase || "").toLowerCase();

    // Only roles whose active phase contains "night" (excludes triggered/passive)
    if (!phase.includes("night")) continue;

    // Roles strictly First Night / Night 1 do not wake on Night 2+
    const isFirstNightOnly =
      (phase.includes("night 1") || phase.includes("first night")) &&
      !phase.includes("/ night");
    if (nightCount > 1 && isFirstNightOnly) continue;

    const actionType = (p.action_type || "").toLowerCase();
    if (!actionType || actionType === "passive" || actionType === "none" || actionType === "vote") {
      continue;
    }

    if (!roleGroups.has(p.canonical_name || "Unknown")) {
      roleGroups.set(p.canonical_name || "Unknown", []);
    }
    roleGroups.get(p.canonical_name || "Unknown")!.push(p);
  }

  for (const [roleName, rolePlayers] of roleGroups) {
    const rep = rolePlayers[0];
    actions.push({
      id: `action-${roleName}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      role_id: rep.role_id || "",
      role_name: roleName,
      player_ids: rolePlayers.map((p) => p.id),
      action_type: rep.action_type || "Aksi",
      target_player_id: null,
      completed: false,
      priority: rep.night_priority || 50,
    });
  }

  return actions.sort((a, b) => a.priority - b.priority);
}

// ── 3. Resolve Night Phase ──────────────────────────────────────────
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

  // Phase 1: Protections (Bodyguard, Doctor, Priest)
  for (const action of sortedActions) {
    if (!action.completed || !action.target_player_id) continue;
    const targetId = action.target_player_id;

    // Bodyguard cannot protect self
    if (action.role_name.toLowerCase().includes("bodyguard") && action.player_ids.includes(targetId)) {
      continue;
    }

    if (["Protect", "Protect/Heal", "Guard"].some((t) => action.action_type.includes(t))) {
      const target = playerMap.get(targetId);
      if (target) {
        playerMap.set(targetId, { ...target, protected: true });
      }
    }
  }

  // Phase 2: Kills (Werewolves, Vampire, etc.)
  for (const action of sortedActions) {
    if (!action.completed || !action.target_player_id) continue;
    const targetId = action.target_player_id;

    if (["Kill", "Eliminate", "Attack", "Werewolf Action"].some((t) => action.action_type.includes(t))) {
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

  // Phase 3: Investigations (Seer, Aura Seer, Sorceress)
  for (const action of sortedActions) {
    if (!action.completed || !action.target_player_id) continue;
    const targetId = action.target_player_id;

    if (["Investigate", "Check", "See", "Find Seer"].some((t) => action.action_type.includes(t))) {
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

  // Triggered actions upon death
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
        completed: true,
      });
    }
  }

  result.triggered = triggered;
  result.narrative = generateNightNarrative(result, playerMap);
  return { updatedPlayers: Array.from(playerMap.values()), result, triggered };
}

// ── 4. Seer Calculation ─────────────────────────────────────────────
export function getSeerResult(player: Player): "Werewolf" | "Villager" {
  if (player.seer_result === "Werewolf") return "Werewolf";
  return "Villager";
}

// ── 5. Voting Resolution ────────────────────────────────────────────
export function resolveDayVotes(
  players: Player[],
  votes: Record<string, string> // voterId -> targetId
): {
  updatedPlayers: Player[];
  eliminatedPlayer: Player | null;
  tally: Record<string, number>;
  triggered: TriggeredAction[];
} {
  const tally: Record<string, number> = {};
  const alivePlayers = players.filter((p) => p.alive);

  for (const p of alivePlayers) {
    tally[p.id] = 0;
  }

  for (const [voterId, targetId] of Object.entries(votes)) {
    const voter = players.find((p) => p.id === voterId);
    if (voter && voter.alive && targetId && tally[targetId] !== undefined) {
      // Mayor has 2 votes
      const voteWeight = voter.canonical_name === "Mayor" ? 2 : 1;
      tally[targetId] += voteWeight;
    }
  }

  let maxVotes = 0;
  let topTargetId: string | null = null;
  let isTie = false;

  for (const [targetId, count] of Object.entries(tally)) {
    if (count > maxVotes) {
      maxVotes = count;
      topTargetId = targetId;
      isTie = false;
    } else if (count === maxVotes && maxVotes > 0) {
      isTie = true;
    }
  }

  // If tie or 0 votes, no one eliminated
  if (isTie || maxVotes === 0 || !topTargetId) {
    return {
      updatedPlayers: players,
      eliminatedPlayer: null,
      tally,
      triggered: [],
    };
  }

  const triggered: TriggeredAction[] = [];
  const updatedPlayers = players.map((p) => {
    if (p.id === topTargetId) {
      if (p.canonical_name === "Prince") {
        // Prince survives first lynching
        return p;
      }
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

  const eliminatedPlayer = players.find((p) => p.id === topTargetId) || null;

  return {
    updatedPlayers,
    eliminatedPlayer,
    tally,
    triggered,
  };
}

// ── 6. Check Win Condition ──────────────────────────────────────────
export function checkWinCondition(players: Player[]): WinResult | null {
  const alivePlayers = players.filter((p) => p.alive);
  const aliveWerewolves = alivePlayers.filter(
    (p) => p.team === "Werewolf" || p.team === "Werewolf-aligned" || p.team === "Solo Werewolf"
  );
  const aliveVillage = alivePlayers.filter(
    (p) => p.team === "Village" || p.team === "Village/Dynamic"
  );

  // Werewolf win: Werewolves >= Village and Werewolves > 0
  if (aliveWerewolves.length >= aliveVillage.length && aliveWerewolves.length > 0) {
    return {
      winner: "Werewolf",
      reason: "Para Werewolf telah berhasil menguasai desa! Jumlah serigala telah menyamai atau melebihi warga.",
    };
  }

  // Village win: All Werewolves eliminated
  if (aliveWerewolves.length === 0 && alivePlayers.length > 0) {
    return {
      winner: "Village",
      reason: "Semua Werewolf telah berhasil dieliminasi! Desa kini aman dan damai kembali.",
    };
  }

  // All dead: Draw
  if (alivePlayers.length === 0) {
    return {
      winner: "Draw",
      reason: "Semua pemain telah gugur. Tidak ada yang selamat di desa ini.",
    };
  }

  return null;
}

// ── 7. Atmospheric Narratives ───────────────────────────────────────
export function generateNightNarrative(result: NightResult, playerMap: Map<string, Player>): string {
  if (result.killed.length === 0 && result.protected.length > 0) {
    const savedName = playerMap.get(result.protected[0])?.name || "seorang warga";
    return `Malam penuh ketegangan telah berlalu. Terjangan cakar serigala nyaris merenggut nyawa ${savedName}, namun perlindungan suci berhasil menyelamatkannya!`;
  }

  if (result.killed.length === 0) {
    return `Kabut malam berangsur menipis. Dinginnya malam tidak merenggut korban jiwa. Semua warga terbangun dalam keadaan selamat.`;
  }

  const killedNames = result.killed.map((id) => playerMap.get(id)?.name || "seseorang").join(" dan ");
  return `Lolongan serigala terdengar merobek sunyinya malam. Saat fajar tiba, warga desa menemukan ${killedNames} terbujur kaku tanpa nyawa...`;
}

export function generateDayNarrative(
  killedPlayers: Player[],
  theme: string = "Dark Fantasy"
): string {
  if (killedPlayers.length === 0) {
    return (
      "☀️ **FAJAR TELAH TIBA DI DESA ASPIRE**\n\n" +
      "Matahari terbit menembus pepohonan lebat. Tidak ada ceceran darah malam ini.\n\n" +
      "Seluruh warga berkumpul di alun-alun desa, saling bertukar tatap penuh curiga. Siapakah serigala yang bersembunyi di antara kalian?"
    );
  }

  const names = killedPlayers.map((p) => p.name).join(" dan ");
  return (
    "☀️ **DUKA MENYELIMUTI DESA ASPIRE**\n\n" +
    `Fajar menyingsing dengan bau anyir darah yang menusuk hidung.\n\n` +
    `Warga desa menemukan **${names}** telah gugur dimangsa semalam.\n\n` +
    `Kepanikan mulai merayapi setiap jiwa. Waktu berdiskusi dimulai — temukan sang serigala sebelum malam berikutnya tiba!`
  );
}
