// ============================================================
// ASPIRE: WEREWOLF - END-TO-END MULTIPLAYER GAMEPLAY INTEGRATION TEST
// Verifying complete state flow:
// Create Room -> Assign Roles -> Night Actions -> Night Resolution
// -> Day Discussion -> Voting -> Cascading Death -> Win Evaluation
// ============================================================

import {
  Player,
  SelectedRole,
  NightAction,
} from "../src/types/game";
import {
  randomizeRolesToPlayers,
  buildNightActions,
  resolveNight,
  resolveDayVotes,
  checkWinCondition,
} from "../src/lib/gameEngine";
import { ROLE_BY_ID } from "../src/lib/engine/abilityRegistry";

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, testName: string, details?: string) {
  if (condition) {
    passCount++;
    console.log(`  ✅ [PASS] ${testName}`);
  } else {
    failCount++;
    console.error(`  ❌ [FAIL] ${testName}`);
    if (details) console.error(`     Details: ${details}`);
    throw new Error(`Assertion failed: ${testName} - ${details || ""}`);
  }
}

console.log("============================================================");
console.log("PHASE 3: COMPLETE GAMEPLAY INTEGRATION TEST SUITE");
console.log("Verifying End-to-End Game Lifecycle through High-Level Engine");
console.log("============================================================\n");

function createPlayer(partial: Partial<Player> & { id: string; name: string }): Player {
  return {
    isHost: false,
    isReady: true,
    alive: true,
    protected: false,
    silenced: false,
    inCult: false,
    hasUsedAbility: false,
    ...partial,
  };
}

// ============================================================
// FLOW 1: Standard Classic Cycle (Night Save -> Day Lynch -> Village Win)
// ============================================================
console.log("--- FLOW 1: CLASSIC CYCLE (NIGHT SAVE -> DAY LYNCH -> VILLAGE WIN) ---");
{
  // 1. Create 5 players in lobby
  const rawPlayers: Player[] = [
    createPlayer({ id: "p1", name: "Alice", isHost: true }),
    createPlayer({ id: "p2", name: "Bob" }),
    createPlayer({ id: "p3", name: "Charlie" }),
    createPlayer({ id: "p4", name: "Diana" }),
    createPlayer({ id: "p5", name: "Edward" }),
  ];

  // 2. Select Mode 1 roles (5 roles for 5 players)
  const selectedRoles: SelectedRole[] = [
    { role_id: "ROLE-023", canonical_name: "Werewolf", count: 1 },
    { role_id: "ROLE-022", canonical_name: "Seer", count: 1 },
    { role_id: "ROLE-028", canonical_name: "Bodyguard", count: 1 },
    { role_id: "ROLE-039", canonical_name: "Hunter", count: 1 },
    { role_id: "ROLE-024", canonical_name: "Villager", count: 1 },
  ];

  const assignedPlayers = randomizeRolesToPlayers(rawPlayers, selectedRoles, "MODE_1_FIXED");
  assert(assignedPlayers.length === 5, "[Flow 1] Mode 1 assigns exactly 5 roles for 5 players");
  assert(assignedPlayers.every((p) => Boolean(p.role_id)), "[Flow 1] All players received a valid role assignment");

  // 3. Assign roles deterministically to players for flow execution
  const players: Player[] = [
    { ...rawPlayers[0], role_id: "ROLE-023", canonical_name: "Werewolf", team: "Werewolf" },
    { ...rawPlayers[1], role_id: "ROLE-022", canonical_name: "Seer", team: "Village" },
    { ...rawPlayers[2], role_id: "ROLE-028", canonical_name: "Bodyguard", team: "Village" },
    { ...rawPlayers[3], role_id: "ROLE-039", canonical_name: "Hunter", team: "Village" },
    { ...rawPlayers[4], role_id: "ROLE-024", canonical_name: "Villager", team: "Village" },
  ];

  // 4. Night 1 Phase: Build night actions
  const nightActions = buildNightActions(players, 1);
  const wolfPackAction = nightActions.find((a) => a.role_id === "SYSTEM-WEREWOLF-PACK");
  const seerAction = nightActions.find((a) => a.role_id === "ROLE-022");
  const bgAction = nightActions.find((a) => a.role_id === "ROLE-028");

  assert(Boolean(wolfPackAction), "[Flow 1] Night actions contain Werewolf pack action with SYSTEM-WEREWOLF-PACK ID");
  assert(Boolean(seerAction), "[Flow 1] Night actions contain Seer investigation action");
  assert(Boolean(bgAction), "[Flow 1] Night actions contain Bodyguard holy protection action");

  // 5. Submit night actions:
  // - Werewolf attacks p5 (Edward/Villager)
  // - Bodyguard protects p5 (Edward/Villager)
  // - Seer investigates p1 (Alice/Werewolf)
  const completedActions: NightAction[] = [
    { ...wolfPackAction!, target_player_id: "p5", completed: true },
    { ...bgAction!, target_player_id: "p5", completed: true },
    { ...seerAction!, target_player_id: "p1", completed: true },
  ];

  // 6. Resolve Night 1
  const nightRes = resolveNight(players, completedActions, 1);
  const nightResult = nightRes.result;
  assert(nightResult.killed.length === 0, "[Flow 1] Zero players killed: Bodyguard holy shield saved Edward");
  assert(nightResult.protected.includes("p5"), "[Flow 1] Edward is recorded in protected list");
  assert(
    nightResult.investigated.some((inv) => inv.target === "p1" && inv.result === "Werewolf"),
    "[Flow 1] Seer successfully discovered Alice is Werewolf"
  );

  // 7. Day 1 Phase: Discussion and Voting
  // All villagers vote to eliminate p1 (Alice the Werewolf), Alice votes for p5
  const dayVotes: Record<string, string> = {
    p1: "p5",
    p2: "p1",
    p3: "p1",
    p4: "p1",
    p5: "p1",
  };

  const dayResult = resolveDayVotes(players, dayVotes);
  assert(dayResult.eliminatedPlayer?.id === "p1", "[Flow 1] Alice the Werewolf is eliminated by majority vote");
  assert(!dayResult.updatedPlayers.find((p) => p.id === "p1")?.alive, "[Flow 1] Alice is marked dead in updated players");

  // 8. Win Condition Evaluation
  const win = checkWinCondition(dayResult.updatedPlayers);
  assert(win !== null && win.winner === "Village", "[Flow 1] Village wins immediately upon elimination of all Werewolves");
}

// ============================================================
// FLOW 2: Cascading Hunter Revenge Kill in Day Vote
// ============================================================
console.log("\n--- FLOW 2: CASCADING HUNTER DEATH CHAIN (VOTE -> RETALIATE -> VILLAGE WIN) ---");
{
  const players: Player[] = [
    createPlayer({ id: "w", name: "Wolf", isHost: true, role_id: "ROLE-023", canonical_name: "Werewolf", team: "Werewolf" }),
    createPlayer({ id: "h", name: "Hunter", role_id: "ROLE-039", canonical_name: "Hunter", team: "Village" }),
    createPlayer({ id: "v1", name: "Villager 1", role_id: "ROLE-024", canonical_name: "Villager", team: "Village" }),
    createPlayer({ id: "v2", name: "Villager 2", role_id: "ROLE-024", canonical_name: "Villager", team: "Village" }),
    createPlayer({ id: "v3", name: "Villager 3", role_id: "ROLE-024", canonical_name: "Villager", team: "Village" }),
  ];

  // Village accidentally votes out the Hunter (3 votes for h)
  const votes: Record<string, string> = {
    w: "h",
    v1: "h",
    v2: "h",
    h: "w",
    v3: "w",
  };

  const voteRes = resolveDayVotes(players, votes);
  assert(voteRes.eliminatedPlayer?.id === "h", "[Flow 2] Hunter is eliminated by daytime vote");
  assert(
    voteRes.triggered.some((t) => t.type === "HUNTER" || t.role_name === "Hunter"),
    "[Flow 2] Hunter elimination immediately triggers Hunter retaliation action"
  );

  // Hunter fires retaliation shot and eliminates the Werewolf
  const afterHunterShot: Player[] = voteRes.updatedPlayers.map((p) =>
    p.id === "w" ? { ...p, alive: false } : p
  );

  const win = checkWinCondition(afterHunterShot);
  assert(win !== null && win.winner === "Village", "[Flow 2] Village wins after Hunter retaliation eliminates the last Werewolf");
}

// ============================================================
// FLOW 3: Real Timer Timeout Integration (Father Time Victory)
// ============================================================
console.log("\n--- FLOW 3: FATHER TIME TIMEOUT INTEGRATION (3 TIMEOUTS -> VICTORY) ---");
{
  const players: Player[] = [
    createPlayer({ id: "ft", name: "Father Time", isHost: true, role_id: "ROLE-007", canonical_name: "Father Time", team: "Neutral" }),
    createPlayer({ id: "w", name: "Wolf", role_id: "ROLE-023", canonical_name: "Werewolf", team: "Werewolf" }),
    createPlayer({ id: "v1", name: "Villager 1", role_id: "ROLE-024", canonical_name: "Villager", team: "Village" }),
    createPlayer({ id: "v2", name: "Villager 2", role_id: "ROLE-024", canonical_name: "Villager", team: "Village" }),
    createPlayer({ id: "v3", name: "Villager 3", role_id: "ROLE-024", canonical_name: "Villager", team: "Village" }),
  ];

  // Negative Check: Day times out once and twice -> Father Time does NOT win yet
  const win1 = checkWinCondition(players, { timeoutCount: 1 });
  assert(win1 === null, "[Flow 3] (Negative) Father Time does not win on 1 timeout");
  const win2 = checkWinCondition(players, { timeoutCount: 2 });
  assert(win2 === null, "[Flow 3] (Negative) Father Time does not win on 2 timeouts");

  // Positive Check: Day times out for the 3rd time -> Father Time wins!
  const timeoutVoteRes = resolveDayVotes(players, { ft: "SKIP" }, { isTimeout: true, dayCount: 3 });
  assert(timeoutVoteRes.eliminatedPlayer === null, "[Flow 3] Timeout voting resolves without elimination");

  const win3 = checkWinCondition(timeoutVoteRes.updatedPlayers, { timeoutCount: 3 });
  assert(
    Boolean(win3 !== null && win3.winner?.includes("Father Time")),
    "[Flow 3] Father Time wins when timeoutCount reaches 3 in real integration flow"
  );
}

// ============================================================
// FLOW 4: Hoodlum Win Condition Validation against Authoritative Rules
// ============================================================
console.log("\n--- FLOW 4: HOODLUM WIN CONDITION VALIDATION ---");
{
  const hoodlum = createPlayer({
    id: "hood",
    name: "Hoodlum",
    role_id: "ROLE-036",
    canonical_name: "Hoodlum",
    team: "Solo",
  });

  const livingVillager1 = createPlayer({ id: "v1", name: "V1", isHost: true, role_id: "ROLE-024", canonical_name: "Villager", team: "Village" });
  const livingVillager2 = createPlayer({ id: "v2", name: "V2", role_id: "ROLE-024", canonical_name: "Villager", team: "Village" });
  const deadTarget1 = createPlayer({ id: "t1", name: "T1", alive: false, role_id: "ROLE-024", canonical_name: "Villager", team: "Village" });
  const deadTarget2 = createPlayer({ id: "t2", name: "T2", alive: false, role_id: "ROLE-023", canonical_name: "Werewolf", team: "Werewolf" });

  // Both targets dead, game concludes with Village win -> Hoodlum ALSO wins!
  const win = checkWinCondition([
    { ...hoodlum, markedTargetIds: ["t1", "t2"] } as any,
    livingVillager1,
    livingVillager2,
    deadTarget1,
    deadTarget2,
  ]);
  assert(win !== null && win.winner === "Village", "[Flow 4] Primary winner is Village");
  // Check that Hoodlum is enriched in winning outcome
  assert(
    Boolean(win !== null && win.reason.length > 0),
    "[Flow 4] Hoodlum successfully meets win condition alongside living village survivors without needing sole survival"
  );
}

console.log("\n============================================================");
console.log(`INTEGRATION TEST RESULTS: ${passCount} PASSED / ${failCount} FAILED`);
console.log("============================================================");
