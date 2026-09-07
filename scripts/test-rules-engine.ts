// ============================================================
// ASPIRE: WEREWOLF - Comprehensive Rules Engine Test Suite
// Verifying all 11 required scenarios from Master Prompt
// ============================================================

import {
  evaluateSeerResult,
  validateAbilityTarget,
  ALL_ROLES,
} from "../src/lib/engine/abilityRegistry";
import { resolveNightActions } from "../src/lib/engine/actionResolver";
import { resolveDeathChain } from "../src/lib/engine/deathResolver";
import { resolveDayVotes } from "../src/lib/engine/voteResolver";
import { evaluateWinConditions } from "../src/lib/engine/winEngine";
import {
  validateMode1Fixed,
  MINIMUM_PLAYERS,
} from "../src/lib/engine/balanceEngine";
import {
  PlayerEngineState,
  EngineNightAction,
} from "../src/lib/engine/types";

function createMockPlayer(
  id: string,
  name: string,
  canonical_name: string,
  team: string = "Village",
  overrides: Partial<PlayerEngineState> = {}
): PlayerEngineState {
  const roleData = ALL_ROLES.find((r) => r.canonical_name.toLowerCase() === canonical_name.toLowerCase());
  return {
    id,
    name,
    isHost: false,
    isReady: true,
    role_id: roleData?.role_id || `ROLE-${id}`,
    canonical_name: roleData?.canonical_name || canonical_name,
    team: roleData?.team || team,
    originalTeam: roleData?.team || team,
    category: roleData?.category || "Village",
    seer_result: roleData?.seer_result || "Villager",
    role_points: roleData?.role_points || 2,
    balance_weight: roleData?.balance_weight || 0,
    night_priority: roleData?.night_priority || 50,
    active_phase: roleData?.active_phase || "None",
    action_type: roleData?.action_type || "None",
    trigger: roleData?.trigger || "",
    target_type: roleData?.target_type || "Player",
    usage_limit: roleData?.usage_limit || "Passive",
    can_change_role: roleData?.can_change_role || false,
    alive: true,
    protected: false,
    silenced: false,
    inCult: false,
    isCursed: canonical_name === "Cursed",
    hasUsedAbility: false,
    usedAbilityCount: 0,
    ...overrides,
  };
}

let passedCount = 0;
let totalCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalCount++;
  if (condition) {
    passedCount++;
    console.log(`✅ [PASS] Scenario ${totalCount}: ${testName}`);
  } else {
    console.error(`❌ [FAIL] Scenario ${totalCount}: ${testName}`);
    if (detail) console.error(`   Details: ${detail}`);
  }
}

console.log("============================================================");
console.log("ASPIRE: WEREWOLF - RULES & ABILITY ENGINE TEST SUITE");
console.log("============================================================\n");

// -----------------------------------------------------------------
// Scenario 1: Hunter dies by wolf attack at night -> Does NOT retaliate
// (Hunter only shoots when voted out by village)
// -----------------------------------------------------------------
{
  const p1 = createMockPlayer("p1", "Alice", "Werewolf", "Werewolf");
  const p2 = createMockPlayer("p2", "Bob", "Hunter", "Village");
  const p3 = createMockPlayer("p3", "Charlie", "Villager", "Village");
  const p4 = createMockPlayer("p4", "Diana", "Villager", "Village");
  const p5 = createMockPlayer("p5", "Ethan", "Villager", "Village");

  const actions: EngineNightAction[] = [
    {
      id: "act-1",
      role_id: "ROLE-068",
      role_name: "Werewolves",
      player_ids: ["p1"],
      action_type: "Werewolf Action",
      target_player_id: "p2", // Werewolf targets Hunter
      priority: 50,
      completed: true,
    },
  ];

  const { updatedPlayers, outcome } = resolveNightActions([p1, p2, p3, p4, p5], actions, 1);
  const deathChain = resolveDeathChain(updatedPlayers, outcome.killedPlayerIds, "WEREWOLF");

  const bob = deathChain.updatedPlayers.find((p) => p.id === "p2");
  const hunterTriggered = deathChain.pendingTriggeredActions.some((t) => t.type === "HUNTER");

  assert(
    bob?.alive === false && !hunterTriggered,
    "Hunter killed by Werewolves at night does NOT trigger retaliation shot",
    `Hunter alive: ${bob?.alive}, Pending actions: ${JSON.stringify(deathChain.pendingTriggeredActions)}`
  );
}

// -----------------------------------------------------------------
// Scenario 2: Tanner voted out by village -> Tanner WINS immediately
// -----------------------------------------------------------------
{
  const p1 = createMockPlayer("p1", "Alice", "Villager", "Village");
  const p2 = createMockPlayer("p2", "Bob", "Tanner", "Neutral");
  const p3 = createMockPlayer("p3", "Charlie", "Werewolf", "Werewolf");
  const p4 = createMockPlayer("p4", "Diana", "Villager", "Village");
  const p5 = createMockPlayer("p5", "Ethan", "Villager", "Village");

  // Alice, Charlie, Diana vote for Bob (Tanner)
  const votes = {
    p1: "p2",
    p3: "p2",
    p4: "p2",
    p5: "p1",
  };

  const { updatedPlayers, outcome } = resolveDayVotes([p1, p2, p3, p4, p5], votes);
  const win = evaluateWinConditions(updatedPlayers);

  assert(
    outcome.tannerWon === true && win.hasWon === true && win.winner === "Tanner",
    "Tanner voted out by village WINS the game immediately",
    `tannerWon: ${outcome.tannerWon}, Winner: ${win.winner}`
  );
}

// -----------------------------------------------------------------
// Scenario 3: Hunter voted out by village -> Retaliation shot triggers
// -----------------------------------------------------------------
{
  const p1 = createMockPlayer("p1", "Alice", "Villager", "Village");
  const p2 = createMockPlayer("p2", "Bob", "Hunter", "Village");
  const p3 = createMockPlayer("p3", "Charlie", "Werewolf", "Werewolf");
  const p4 = createMockPlayer("p4", "Diana", "Villager", "Village");
  const p5 = createMockPlayer("p5", "Ethan", "Villager", "Village");

  // Votes against Bob (Hunter)
  const votes = {
    p1: "p2",
    p3: "p2",
    p4: "p2",
  };

  const { updatedPlayers, outcome } = resolveDayVotes([p1, p2, p3, p4, p5], votes);
  const hunterTrigger = outcome.triggeredRetaliations.find((t) => t.type === "HUNTER" && t.playerId === "p2");

  assert(
    outcome.eliminatedPlayer?.id === "p2" && !!hunterTrigger,
    "Hunter voted out by village triggers retaliation shot",
    `Eliminated: ${outcome.eliminatedPlayer?.name}, Trigger: ${JSON.stringify(hunterTrigger)}`
  );
}

// -----------------------------------------------------------------
// Scenario 4: Prince voted out by village -> Prince survives lynching
// -----------------------------------------------------------------
{
  const p1 = createMockPlayer("p1", "Alice", "Villager", "Village");
  const p2 = createMockPlayer("p2", "Bob", "Prince", "Village");
  const p3 = createMockPlayer("p3", "Charlie", "Werewolf", "Werewolf");
  const p4 = createMockPlayer("p4", "Diana", "Villager", "Village");
  const p5 = createMockPlayer("p5", "Ethan", "Villager", "Village");

  // All vote for Bob (Prince)
  const votes = {
    p1: "p2",
    p3: "p2",
    p4: "p2",
    p5: "p2",
  };

  const { updatedPlayers, outcome } = resolveDayVotes([p1, p2, p3, p4, p5], votes);
  const prince = updatedPlayers.find((p) => p.id === "p2");

  assert(
    outcome.princeSurvived === true && prince?.alive === true && outcome.eliminatedPlayer === null,
    "Prince survives first lynching and remains alive",
    `princeSurvived: ${outcome.princeSurvived}, Prince alive: ${prince?.alive}`
  );
}

// -----------------------------------------------------------------
// Scenario 5: Doppelganger selects player on Night 1 -> stays passive
// until target dies, then adopts target's role
// -----------------------------------------------------------------
{
  const p1 = createMockPlayer("p1", "Alice", "Doppelgänger", "Dynamic");
  const p2 = createMockPlayer("p2", "Bob", "Seer", "Village");
  const p3 = createMockPlayer("p3", "Charlie", "Werewolf", "Werewolf");
  const p4 = createMockPlayer("p4", "Diana", "Villager", "Village");
  const p5 = createMockPlayer("p5", "Ethan", "Villager", "Village");

  // Night 1: Alice (Doppelganger) selects Bob (Seer)
  const actionsN1: EngineNightAction[] = [
    {
      id: "doppel-n1",
      role_id: p1.role_id,
      role_name: "Doppelgänger",
      player_ids: ["p1"],
      action_type: "Copy Role",
      target_player_id: "p2",
      priority: 10,
      completed: true,
    },
  ];

  const { updatedPlayers: playersAfterN1 } = resolveNightActions([p1, p2, p3, p4, p5], actionsN1, 1);
  const aliceN1 = playersAfterN1.find((p) => p.id === "p1");

  const isPassiveBeforeDeath =
    aliceN1?.canonical_name === "Doppelgänger" &&
    aliceN1?.doppelganger?.targetPlayerId === "p2" &&
    aliceN1?.doppelganger?.isActivated === false;

  // Now Bob (Seer) dies
  const deathChain = resolveDeathChain(playersAfterN1, ["p2"], "WEREWOLF");
  const aliceAfterDeath = deathChain.updatedPlayers.find((p) => p.id === "p1");

  const adoptsTargetRole =
    aliceAfterDeath?.canonical_name === "Seer" &&
    aliceAfterDeath?.doppelganger?.isActivated === true;

  assert(
    isPassiveBeforeDeath && adoptsTargetRole,
    "Doppelgänger stays passive on Night 1, then activates and adopts target role upon target death",
    `Passive before: ${isPassiveBeforeDeath}, Role after death: ${aliceAfterDeath?.canonical_name}`
  );
}

// -----------------------------------------------------------------
// Scenario 6: Seer investigates Lycan -> returns "Werewolf"
// -----------------------------------------------------------------
{
  const lycan = createMockPlayer("p1", "Lupin", "Lycan", "Village");
  const result = evaluateSeerResult(lycan);

  assert(
    result === "Werewolf",
    "Seer investigating Lycan returns 'Werewolf' (Lycan has seer_result: Werewolf)",
    `Result: ${result}`
  );
}

// -----------------------------------------------------------------
// Scenario 7: Seer investigates Wolf Man -> returns "Villager"
// -----------------------------------------------------------------
{
  const wolfMan = createMockPlayer("p2", "Fenrir", "Wolf Man", "Werewolf");
  const result = evaluateSeerResult(wolfMan);

  assert(
    result === "Villager",
    "Seer investigating Wolf Man returns 'Villager' (Wolf Man appears as Villager to Seer)",
    `Result: ${result}`
  );
}

// -----------------------------------------------------------------
// Scenario 8: Mode 1 with 6 players and 5 roles selected -> Cannot start
// (Exact match required, no silent Villager padding)
// -----------------------------------------------------------------
{
  const selectedRoles = [
    { role_id: "ROLE-068", canonical_name: "Werewolf", count: 1 },
    { role_id: "ROLE-057", canonical_name: "Seer", count: 1 },
    { role_id: "ROLE-030", canonical_name: "Bodyguard", count: 1 },
    { role_id: "ROLE-066", canonical_name: "Villager", count: 2 },
  ]; // Total = 5 roles
  const playerCount = 6;

  const val = validateMode1Fixed(playerCount, selectedRoles);

  assert(
    val.valid === false && val.totalSelectedCount === 5,
    "Mode 1 forbids starting when selected role count (5) doesn't exactly match player count (6)",
    `Valid: ${val.valid}, Error: ${val.error}`
  );
}

// -----------------------------------------------------------------
// Scenario 9: 4 players joined in any mode -> Cannot start (min 5 players)
// -----------------------------------------------------------------
{
  const selectedRoles = [
    { role_id: "ROLE-068", canonical_name: "Werewolf", count: 1 },
    { role_id: "ROLE-057", canonical_name: "Seer", count: 1 },
    { role_id: "ROLE-066", canonical_name: "Villager", count: 2 },
  ]; // Total 4
  const playerCount = 4;

  const val = validateMode1Fixed(playerCount, selectedRoles);

  assert(
    playerCount < MINIMUM_PLAYERS && val.valid === false,
    `Strict minimum 5 players required across all modes (player count 4 rejected)`,
    `Min: ${MINIMUM_PLAYERS}, Valid: ${val.valid}, Error: ${val.error}`
  );
}

// -----------------------------------------------------------------
// Scenario 10: Werewolf attacks player protected by Bodyguard -> Survives
// -----------------------------------------------------------------
{
  const p1 = createMockPlayer("p1", "Werewolf1", "Werewolf", "Werewolf");
  const p2 = createMockPlayer("p2", "Guard", "Bodyguard", "Village");
  const p3 = createMockPlayer("p3", "VillagerTarget", "Villager", "Village");
  const p4 = createMockPlayer("p4", "Diana", "Villager", "Village");
  const p5 = createMockPlayer("p5", "Ethan", "Villager", "Village");

  const actions: EngineNightAction[] = [
    {
      id: "act-bg",
      role_id: "ROLE-030",
      role_name: "Bodyguard",
      player_ids: ["p2"],
      action_type: "Protect",
      target_player_id: "p3", // Bodyguard protects p3
      priority: 30,
      completed: true,
    },
    {
      id: "act-wolf",
      role_id: "ROLE-068",
      role_name: "Werewolves",
      player_ids: ["p1"],
      action_type: "Werewolf Action",
      target_player_id: "p3", // Werewolf attacks p3
      priority: 50,
      completed: true,
    },
  ];

  const { updatedPlayers, outcome } = resolveNightActions([p1, p2, p3, p4, p5], actions, 1);
  const target = updatedPlayers.find((p) => p.id === "p3");

  assert(
    target?.alive === true && outcome.savedPlayerIds.includes("p3"),
    "Player protected by Bodyguard survives Werewolf attack",
    `Target alive: ${target?.alive}, Saved list: ${JSON.stringify(outcome.savedPlayerIds)}`
  );
}

// -----------------------------------------------------------------
// Scenario 11: Bodyguard attempts to protect self -> Rejected
// -----------------------------------------------------------------
{
  const guard = createMockPlayer("p2", "Guard", "Bodyguard", "Village");
  const action: EngineNightAction = {
    id: "act-bg-self",
    role_id: "ROLE-030",
    role_name: "Bodyguard",
    player_ids: ["p2"],
    action_type: "Protect",
    target_player_id: "p2",
    priority: 30,
    completed: true,
  };

  const validation = validateAbilityTarget(action, guard, "p2");

  assert(
    validation.valid === false,
    "Bodyguard attempting to protect self is rejected by rules engine",
    `Validation valid: ${validation.valid}, Reason: ${validation.reason}`
  );
}

console.log("\n============================================================");
console.log(`TEST RESULTS: ${passedCount} / ${totalCount} SCENARIOS PASSED (${Math.round((passedCount / totalCount) * 100)}%)`);
console.log("============================================================\n");

if (passedCount === totalCount) {
  console.log("🎉 ALL 11 SCENARIOS PASSED WITH ZERO ERRORS!");
  process.exit(0);
} else {
  console.error("❌ SOME TESTS FAILED!");
  process.exit(1);
}
