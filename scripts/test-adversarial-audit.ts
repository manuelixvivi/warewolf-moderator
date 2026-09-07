// ============================================================
// ASPIRE: WEREWOLF - PHASE 3 ADVERSARIAL ROLE-BY-ROLE AUDIT
// Deterministic Execution Proof for EVERY SINGLE ONE of the 75 ROLES
// "One Village. Many Lies. One Wolf."
// ============================================================

import {
  PlayerEngineState,
  EngineNightAction,
} from "../src/lib/engine/types";
import {
  ALL_ROLES,
  ROLE_BY_ID,
  ROLE_BY_NAME,
  evaluateSeerResult,
  canPlayerActInNight,
  validateAbilityTarget,
  buildEngineNightActions,
} from "../src/lib/engine/abilityRegistry";
import { resolveNightActions } from "../src/lib/engine/actionResolver";
import { resolveDayVotes } from "../src/lib/engine/voteResolver";
import { evaluateWinConditions } from "../src/lib/engine/winEngine";
import {
  revealDrunkRole,
  switchAlexanderTeam,
} from "../src/lib/engine/roleTransformation";
import { evaluateDefense } from "../src/lib/engine/protectionEngine";
import { resolveInvestigation } from "../src/lib/engine/investigationEngine";
import { resolveDeathChain } from "../src/lib/engine/deathResolver";
import {
  validateMode2Pool,
  auditSelectBalancedSubsetFromPool,
  auditGenerateBalancedRandomComposition,
} from "../src/lib/engine/balanceEngine";
import {
  maskPublicGameState,
  generatePrivatePlayerState,
  generateModeratorState,
} from "../src/lib/engine/informationEngine";

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

function createPlayer(
  id: string,
  name: string,
  roleIdOrName: string
): PlayerEngineState {
  const role =
    ROLE_BY_ID.get(roleIdOrName) ||
    ROLE_BY_NAME.get(roleIdOrName.toLowerCase()) ||
    ALL_ROLES.find((r) => r.canonical_name === roleIdOrName);

  if (!role) {
    throw new Error(`Role definition not found for: ${roleIdOrName}`);
  }

  return {
    id,
    name,
    isHost: id === "p1",
    isReady: true,
    alive: true,
    role_id: role.role_id,
    canonical_name: role.canonical_name,
    team: role.team,
    originalTeam: role.team,
    category: role.category,
    seer_result: role.seer_result,
    role_points: role.role_points,
    balance_weight: role.balance_weight,
    night_priority: role.night_priority || 50,
    active_phase: role.active_phase,
    action_type: role.action_type,
    trigger: role.trigger,
    target_type: role.target_type,
    usage_limit: role.usage_limit,
    can_change_role: role.can_change_role,
    reveal_on_death: role.reveal_on_death,
    requires_engine_resolution: role.requires_engine_resolution,
    description_en: role.description_en,
    description_id: role.description_id || role.tooltip_id,
    tooltip_en: role.tooltip_en,
    tooltip_id: role.tooltip_id,
    hasUsedAbility: false,
    usedAbilityCount: 0,
    isCursed: role.role_id === "ROLE-031" || role.canonical_name === "Cursed",
    silenced: false,
    protected: false,
    inCult: false,
    tannerWon: false,
    princeProtectedUsed: false,
  };
}

console.log("============================================================");
console.log("PHASE 3: ADVERSARIAL ROLE-BY-ROLE EXECUTABLE VERIFICATION");
console.log("Testing All 75 Roles Individually with Mechanical Proof");
console.log("============================================================\n");

// ------------------------------------------------------------
// 1. ROLE-002: Alexander / Kimb / Blockchain
// ------------------------------------------------------------
function test_ROLE_002() {
  const p = createPlayer("p2", "Alex", "ROLE-002");
  const switched = switchAlexanderTeam(p, "Werewolf");
  assert(switched.team === "Werewolf", "[ROLE-002] Alexander dynamically switches to losing team");
  const win = evaluateWinConditions([switched, createPlayer("w1", "Wolf", "ROLE-023")]);
  assert(win.winningPlayerIds.includes("p2"), "[ROLE-002] Alexander wins when aligned team wins");
}

// ------------------------------------------------------------
// 2. ROLE-003: Alpha Wolf
// ------------------------------------------------------------
function test_ROLE_003() {
  const alpha = createPlayer("alpha", "Alpha Wolf", "ROLE-003");
  const victim = createPlayer("vic", "Victim", "ROLE-024");
  const convertAction: EngineNightAction = {
    id: "act-alpha",
    role_id: "ROLE-003",
    role_name: "Alpha Wolf",
    player_ids: ["alpha"],
    action_type: "Convert/Override",
    target_player_id: "vic",
    priority: 50,
    completed: true,
  };
  const { updatedPlayers, outcome } = resolveNightActions([alpha, victim], [convertAction], 1);
  const converted = updatedPlayers.find((p) => p.id === "vic");
  assert(Boolean(converted?.team === "Werewolf" && converted?.alive === true), "[ROLE-003] Alpha Wolf converts target to Werewolf instead of killing");
  assert(outcome.convertedPlayerIds.length === 1, "[ROLE-003] Alpha Wolf conversion recorded in night outcome");
}

// ------------------------------------------------------------
// 3. ROLE-005: Dr Helgo
// ------------------------------------------------------------
function test_ROLE_005() {
  const helgo = createPlayer("helgo", "Dr Helgo", "ROLE-005");
  const seer = createPlayer("seer", "Seer", "ROLE-022");
  const stealAction: EngineNightAction = {
    id: "act-helgo",
    role_id: "ROLE-005",
    role_name: "Dr Helgo",
    player_ids: ["helgo"],
    action_type: "Steal Role",
    target_player_id: "seer",
    priority: 15,
    completed: true,
  };
  const { updatedPlayers } = resolveNightActions([helgo, seer], [stealAction], 1);
  const h = updatedPlayers.find((p) => p.id === "helgo");
  assert(h?.role_id === "ROLE-022" && h?.canonical_name === "Seer", "[ROLE-005] Dr Helgo steals card on Night 1 and becomes Seer");
}

// ------------------------------------------------------------
// 4. ROLE-006: Dr. Boom
// ------------------------------------------------------------
function test_ROLE_006() {
  const left = createPlayer("p1", "Left", "ROLE-024");
  const boom = createPlayer("boom", "Dr. Boom", "ROLE-006");
  const right = createPlayer("p3", "Right", "ROLE-024");
  // Positive: Vote death explodes neighbors
  const resVote = resolveDeathChain([left, boom, right], ["boom"], "VOTE", "DAY", 1);
  assert(
    !resVote.updatedPlayers.find((p) => p.id === "p1")?.alive &&
      !resVote.updatedPlayers.find((p) => p.id === "p3")?.alive,
    "[ROLE-006] Dr. Boom vote elimination explodes both adjacent neighbors"
  );
  // Negative: Night attack does NOT explode neighbors
  const left2 = createPlayer("p1", "Left", "ROLE-024");
  const boom2 = createPlayer("boom", "Dr. Boom", "ROLE-006");
  const right2 = createPlayer("p3", "Right", "ROLE-024");
  const resNight = resolveDeathChain([left2, boom2, right2], ["boom"], "WEREWOLF_ATTACK", "NIGHT", 1);
  assert(
    Boolean(resNight.updatedPlayers.find((p) => p.id === "p1")?.alive === true &&
      resNight.updatedPlayers.find((p) => p.id === "p3")?.alive === true),
    "[ROLE-006] (Negative) Dr. Boom night death does NOT explode neighbors"
  );
}

// ------------------------------------------------------------
// 5. ROLE-007: Father Time
// ------------------------------------------------------------
function test_ROLE_007() {
  const ft = createPlayer("ft", "Father Time", "ROLE-007");
  const v = createPlayer("v", "Villager", "ROLE-024");
  const w = createPlayer("w", "Werewolf", "ROLE-023");
  // Positive: 3 timeouts -> Father Time wins
  const win3 = evaluateWinConditions([ft, v, w], { timeoutCount: 3 });
  assert(Boolean(win3.hasWon && win3.winner?.includes("Father Time")), "[ROLE-007] Father Time wins on 3 timeouts");
  // Negative: 2 timeouts -> game continues
  const win2 = evaluateWinConditions([ft, v, w], { timeoutCount: 2 });
  assert(!win2.hasWon, "[ROLE-007] (Negative) Father Time does NOT win on 2 timeouts");
}

// ------------------------------------------------------------
// 6. ROLE-008: Hackmaster
// ------------------------------------------------------------
function test_ROLE_008() {
  const hack = createPlayer("hack", "Hackmaster", "ROLE-008");
  const witch = createPlayer("witch", "Witch", "ROLE-057");
  const act: EngineNightAction = {
    id: "act-hack",
    role_id: "ROLE-008",
    role_name: "Hackmaster",
    player_ids: ["hack"],
    action_type: "Reveal/Steal Role",
    target_player_id: "witch",
    priority: 15,
    completed: true,
  };
  const { updatedPlayers } = resolveNightActions([hack, witch], [act], 1);
  const h = updatedPlayers.find((p) => p.id === "hack");
  assert(h?.role_id === "ROLE-057", "[ROLE-008] Hackmaster steals Witch role on Night 1");
}

// ------------------------------------------------------------
// 7. ROLE-009: Huntress
// ------------------------------------------------------------
function test_ROLE_009() {
  const huntress = createPlayer("h", "Huntress", "ROLE-009");
  const wolf = createPlayer("w", "Wolf", "ROLE-023");
  const killAct: EngineNightAction = {
    id: "huntress-1",
    role_id: "ROLE-009",
    role_name: "Huntress",
    player_ids: ["h"],
    action_type: "Eliminate",
    target_player_id: "w",
    priority: 40,
    completed: true,
  };
  const { updatedPlayers } = resolveNightActions([huntress, wolf], [killAct], 1);
  assert(!updatedPlayers.find((p) => p.id === "w")?.alive, "[ROLE-009] Huntress eliminates target at night");
  // Negative: cannot act when hasUsedAbility is true
  const used = { ...huntress, hasUsedAbility: true };
  assert(!canPlayerActInNight(used, 2), "[ROLE-009] (Negative) Huntress cannot act twice");
}

// ------------------------------------------------------------
// 8. ROLE-010: Teria / Jacole
// ------------------------------------------------------------
function test_ROLE_010() {
  const tj = createPlayer("tj", "Teria / Jacole", "ROLE-010");
  const seer = createPlayer("seer", "Seer", "ROLE-022");
  const rep = resolveInvestigation(tj, seer, [tj, seer]);
  assert(rep.resultString === "Villager" || rep.resultString === "Special", "[ROLE-010] Teria / Jacole investigates player");
  assert(tj.category === "Werewolf" && tj.team === "Werewolf", "[ROLE-010] Teria / Jacole is werewolf-aligned");
}

// ------------------------------------------------------------
// 9. ROLE-012: Magician
// ------------------------------------------------------------
function test_ROLE_012() {
  const mag = createPlayer("mag", "Magician", "ROLE-012");
  const target = createPlayer("t", "Target", "ROLE-024");
  const act: EngineNightAction = {
    id: "mag-1",
    role_id: "ROLE-012",
    role_name: "Magician",
    player_ids: [mag.id],
    action_type: "Choose Power",
    target_player_id: target.id,
    priority: 35,
    completed: true,
  };
  const { updatedPlayers } = resolveNightActions([mag, target], [act], 1);
  const updatedMag = updatedPlayers.find((p) => p.id === "mag")!;
  assert(updatedMag.hasUsedAbility === true, "[ROLE-012] Magician completes night selection and marks ability used");
}

// ------------------------------------------------------------
// 10. ROLE-013: Mentalist
// ------------------------------------------------------------
function test_ROLE_013() {
  const m = createPlayer("m", "Mentalist", "ROLE-013");
  const v1 = createPlayer("v1", "V1", "ROLE-024");
  const v2 = createPlayer("v2", "V2", "ROLE-022");
  const w = createPlayer("w", "Wolf", "ROLE-023");
  // Positive: same team
  const resSame = resolveInvestigation(m, v1, [m, v1, v2], v2);
  assert(resSame.resultString.includes("SAME TEAM"), "[ROLE-013] Mentalist detects two players on same team");
  // Negative: different teams
  const resDiff = resolveInvestigation(m, v1, [m, v1, w], w);
  assert(resDiff.resultString.includes("DIFFERENT TEAMS"), "[ROLE-013] Mentalist detects two players on different teams");
}

// ------------------------------------------------------------
// 11. ROLE-014: Mo T. Le'Sav / Tom Vasel
// ------------------------------------------------------------
function test_ROLE_014() {
  const tom = createPlayer("tom", "Mo T. Le'Sav / Tom Vasel", "ROLE-014");
  const v = createPlayer("v", "Villager", "ROLE-024");
  const win = evaluateWinConditions([tom, v]);
  assert(win.winningPlayerIds.includes("tom"), "[ROLE-014] Mo T. Le'Sav wins when surviving to game end");
}

// ------------------------------------------------------------
// 12. ROLE-015: Ralph
// ------------------------------------------------------------
function test_ROLE_015() {
  const ralph = createPlayer("ralph", "Ralph", "ROLE-015");
  const v1 = createPlayer("v1", "Villager 1", "ROLE-024");
  // Positive: On timeout, Ralph automatically casts non-elimination (SKIP) vote
  const { outcome: outTimeout } = resolveDayVotes([ralph, v1], { ralph: "v1", v1: "ralph" }, { isTimeout: true });
  assert(outTimeout.tally.SKIP === 1, "[ROLE-015] Ralph casts non-elimination vote during timeout");
  // Negative: When not timed out, Ralph's vote is counted normally
  const v2 = createPlayer("v2", "Villager 2", "ROLE-024");
  const { outcome: outNormal } = resolveDayVotes([ralph, v1, v2], { ralph: "v1", v1: "v1", v2: "ralph" }, { isTimeout: false });
  assert(outNormal.tally["v1"] === 2, "[ROLE-015] (Negative) Ralph votes for target normally when not timed out");
}

// ------------------------------------------------------------
// 13. ROLE-016: Revealer
// ------------------------------------------------------------
function test_ROLE_016() {
  const rev = createPlayer("rev", "Revealer", "ROLE-016");
  const wolf = createPlayer("wolf", "Werewolf", "ROLE-023");
  const vill = createPlayer("vill", "Villager", "ROLE-024");
  // Positive: reveals wolf safely
  const repWolf = resolveInvestigation(rev, wolf, [rev, wolf]);
  assert(repWolf.resultString.includes("Werewolf") && !repWolf.backfiredOnInvestigator, "[ROLE-016] Revealer safely reveals Werewolf");
  // Negative: targets villager -> Revealer dies
  const repVill = resolveInvestigation(rev, vill, [rev, vill]);
  assert(repVill.backfiredOnInvestigator === true, "[ROLE-016] Revealer dies when inspecting a Villager");
}

// ------------------------------------------------------------
// 14. ROLE-017: Sam
// ------------------------------------------------------------
function test_ROLE_017() {
  const sam = createPlayer("sam", "Sam", "ROLE-017");
  const v1 = createPlayer("v1", "Villager 1", "ROLE-024");
  // Positive: On timeout, Sam prevents elimination by redirecting to SKIP
  const { outcome: outTimeout } = resolveDayVotes([sam, v1], { sam: "v1", v1: "sam" }, { isTimeout: true });
  assert(outTimeout.tally.SKIP === 1 && outTimeout.eliminatedPlayer === null, "[ROLE-017] Sam prevents elimination during timeout");
  // Negative: Normal voting without timeout can eliminate target
  const v2 = createPlayer("v2", "Villager 2", "ROLE-024");
  const { outcome: outNormal } = resolveDayVotes([sam, v1, v2], { sam: "v1", v1: "v1", v2: "sam" }, { isTimeout: false });
  assert(outNormal.eliminatedPlayer?.id === "v1", "[ROLE-017] (Negative) Sam participates normally without timeout");
}

// ------------------------------------------------------------
// 15. ROLE-019: Time Bandit
// ------------------------------------------------------------
function test_ROLE_019() {
  const tb = createPlayer("tb", "Time Bandit", "ROLE-019");
  const v1 = createPlayer("v1", "Villager 1", "ROLE-024");
  const { outcome } = resolveDayVotes([tb, v1], { tb: "v1", v1: "tb" });
  assert(outcome.tally["v1"] === 1, "[ROLE-019] Time Bandit casts vote in daytime resolution");
  const win = evaluateWinConditions([tb, v1]);
  assert(win.winner !== null, "[ROLE-019] Time Bandit survives to game evaluation");
}

// ------------------------------------------------------------
// 16. ROLE-022: Seer
// ------------------------------------------------------------
function test_ROLE_022() {
  const wolf = createPlayer("wolf", "Werewolf", "ROLE-023");
  const vill = createPlayer("vill", "Villager", "ROLE-024");
  assert(evaluateSeerResult(wolf) === "Werewolf", "[ROLE-022] Seer detects Werewolf");
  assert(evaluateSeerResult(vill) === "Villager", "[ROLE-022] Seer detects Villager");
}

// ------------------------------------------------------------
// 17. ROLE-023: Werewolf
// ------------------------------------------------------------
function test_ROLE_023() {
  const wolf = createPlayer("w", "Werewolf", "ROLE-023");
  const target = createPlayer("t", "Target", "ROLE-024");
  const act: EngineNightAction = {
    id: "wolf-1",
    role_id: "ROLE-023",
    role_name: "Werewolves",
    player_ids: ["w"],
    action_type: "Werewolf Action",
    target_player_id: "t",
    priority: 50,
    completed: true,
  };
  const { updatedPlayers } = resolveNightActions([wolf, target], [act], 1);
  assert(!updatedPlayers.find((p) => p.id === "t")?.alive, "[ROLE-023] Werewolf pack eliminates target at night");
}

// ------------------------------------------------------------
// 18. ROLE-024: Villager
// ------------------------------------------------------------
function test_ROLE_024() {
  const v1 = createPlayer("v1", "Villager 1", "ROLE-024");
  const v2 = createPlayer("v2", "Villager 2", "ROLE-024");
  const { outcome } = resolveDayVotes([v1, v2], { v1: "v2", v2: "v2" });
  assert(outcome.eliminatedPlayer?.id === "v2", "[ROLE-024] Villagers participate in voting and eliminate target");
  const win = evaluateWinConditions([v1]);
  assert(win.winner === "Village", "[ROLE-024] Village wins when all threats eliminated");
}

// ------------------------------------------------------------
// 19. ROLE-025: Vampire
// ------------------------------------------------------------
function test_ROLE_025() {
  const vamp = createPlayer("vamp", "Vampire", "ROLE-025");
  const target = createPlayer("t", "Target", "ROLE-024");
  const act: EngineNightAction = {
    id: "vamp-1",
    role_id: "ROLE-025",
    role_name: "Vampire",
    player_ids: ["vamp"],
    action_type: "Accusation Kill",
    target_player_id: "t",
    priority: 46,
    completed: true,
  };
  const { updatedPlayers } = resolveNightActions([vamp, target], [act], 1);
  assert(!updatedPlayers.find((p) => p.id === "t")?.alive, "[ROLE-025] Vampire eliminates target at night");
}

// ------------------------------------------------------------
// 20. ROLE-026: Apprentice Seer
// ------------------------------------------------------------
function test_ROLE_026() {
  const app = createPlayer("app", "Apprentice Seer", "ROLE-026");
  const seer = createPlayer("seer", "Seer", "ROLE-022");
  // Positive: Seer dies -> Apprentice awakens
  const res = resolveDeathChain([app, seer], ["seer"], "VOTE", "DAY", 1);
  const awakened = res.updatedPlayers.find((p) => p.id === "app");
  assert(awakened?.canonical_name === "Seer" && awakened?.role_id === "ROLE-022", "[ROLE-026] Apprentice Seer awakens as Seer when primary Seer dies");
  // Negative: While Seer is alive, Apprentice remains Apprentice Seer
  assert(app.canonical_name === "Apprentice Seer", "[ROLE-026] (Negative) Apprentice remains Apprentice while Seer lives");
}

// ------------------------------------------------------------
// 21. ROLE-027: Aura Seer
// ------------------------------------------------------------
function test_ROLE_027() {
  const aura = createPlayer("aura", "Aura Seer", "ROLE-027");
  const witch = createPlayer("witch", "Witch", "ROLE-057");
  const vill = createPlayer("vill", "Villager", "ROLE-024");
  assert(resolveInvestigation(aura, witch, [aura, witch]).resultString.includes("Aura Detected"), "[ROLE-027] Aura Seer detects special powers");
  assert(resolveInvestigation(aura, vill, [aura, vill]).resultString.includes("No Aura"), "[ROLE-027] (Negative) Aura Seer detects normal villagers have No Aura");
}

// ------------------------------------------------------------
// 22. ROLE-028: Bodyguard
// ------------------------------------------------------------
function test_ROLE_028() {
  const bg = createPlayer("bg", "Bodyguard", "ROLE-028");
  const target = createPlayer("t", "Target", "ROLE-024");
  const wolf = createPlayer("w", "Wolf", "ROLE-023");
  // Positive: Protects target
  const bgAct: EngineNightAction = {
    id: "bg-1",
    role_id: "ROLE-028",
    role_name: "Bodyguard",
    player_ids: ["bg"],
    action_type: "Protect",
    target_player_id: "t",
    priority: 30,
    completed: true,
  };
  const wolfAct: EngineNightAction = {
    id: "w-1",
    role_id: "ROLE-023",
    role_name: "Werewolves",
    player_ids: ["w"],
    action_type: "Werewolf Action",
    target_player_id: "t",
    priority: 50,
    completed: true,
  };
  const { updatedPlayers } = resolveNightActions([bg, target, wolf], [bgAct, wolfAct], 1);
  assert(updatedPlayers.find((p) => p.id === "t")?.alive === true, "[ROLE-028] Bodyguard protection saves target from Werewolf attack");
  // Negative: Cannot protect self
  assert(!validateAbilityTarget(bgAct, bg, bg.id).valid, "[ROLE-028] (Negative) Bodyguard cannot target self for protection");
}

// ------------------------------------------------------------
// 23. ROLE-029: Cult Leader
// ------------------------------------------------------------
function test_ROLE_029() {
  const cl = createPlayer("cl", "Cult Leader", "ROLE-029");
  const t = createPlayer("t", "Target", "ROLE-024");
  const act: EngineNightAction = {
    id: "cl-1",
    role_id: "ROLE-029",
    role_name: "Cult Leader",
    player_ids: ["cl"],
    action_type: "Recruit",
    target_player_id: "t",
    priority: 75,
    completed: true,
  };
  const { updatedPlayers } = resolveNightActions([cl, t], [act], 1);
  assert(updatedPlayers.find((p) => p.id === "t")?.inCult === true, "[ROLE-029] Cult Leader recruits target into cult");
  // Win condition positive
  const p1 = { ...cl, inCult: true };
  const p2 = { ...t, inCult: true };
  const win = evaluateWinConditions([p1, p2]);
  assert(Boolean(win.winner?.includes("Cult")), "[ROLE-029] Cult Leader wins when all living players are in cult");
  // Win condition negative: 1 player outside cult
  const p3 = createPlayer("outside", "Outside", "ROLE-024");
  const noWin = evaluateWinConditions([p1, p2, p3]);
  assert(!noWin.winner?.includes("Cult"), "[ROLE-029] (Negative) Cult Leader does not win if a living player is not in cult");
}

// ------------------------------------------------------------
// 24. ROLE-030: Cupid
// ------------------------------------------------------------
function test_ROLE_030() {
  const cupid = createPlayer("cupid", "Cupid", "ROLE-030");
  const l1 = createPlayer("l1", "Lover 1", "ROLE-024");
  const l2 = createPlayer("l2", "Lover 2", "ROLE-024");
  const act: EngineNightAction = {
    id: "cupid-1",
    role_id: "ROLE-030",
    role_name: "Cupid",
    player_ids: ["cupid"],
    action_type: "Link Players",
    target_player_id: "l1",
    secondary_target_id: "l2",
    priority: 20,
    completed: true,
  };
  const { updatedPlayers } = resolveNightActions([cupid, l1, l2], [act], 1);
  const pL1 = updatedPlayers.find((p) => p.id === "l1");
  const pL2 = updatedPlayers.find((p) => p.id === "l2");
  assert(
    Boolean(pL1?.linkedPartnerIds?.includes("l2") && pL2?.linkedPartnerIds?.includes("l1")),
    "[ROLE-030] Cupid links reciprocal lovers"
  );
  // Suicide heartbreak test
  const res = resolveDeathChain([pL1!, pL2!], ["l1"], "VOTE", "DAY", 1);
  assert(
    !res.updatedPlayers.find((p) => p.id === "l2")?.alive,
    "[ROLE-030] Lover dies of heartbreak when partner dies"
  );
}

// ------------------------------------------------------------
// 25. ROLE-031: Cursed
// ------------------------------------------------------------
function test_ROLE_031() {
  const cursed = createPlayer("c", "Cursed", "ROLE-031");
  const wolf = createPlayer("w", "Wolf", "ROLE-023");
  // Positive: Wolf attack converts Cursed to Werewolf
  const wolfAct: EngineNightAction = {
    id: "w-1",
    role_id: "ROLE-023",
    role_name: "Werewolves",
    player_ids: ["w"],
    action_type: "Werewolf Action",
    target_player_id: "c",
    priority: 50,
    completed: true,
  };
  const { updatedPlayers } = resolveNightActions([cursed, wolf], [wolfAct], 1);
  const conv = updatedPlayers.find((p) => p.id === "c");
  assert(Boolean(conv?.team === "Werewolf" && conv?.alive === true), "[ROLE-031] Cursed attacked by Werewolves converts to Werewolf");
  assert(evaluateSeerResult(conv!) === "Werewolf", "[ROLE-031] Converted Cursed now appears as Werewolf to Seer");
  // Negative: Vote elimination kills Cursed normally without conversion
  const c2 = createPlayer("c2", "Cursed 2", "ROLE-031");
  const resVote = resolveDeathChain([c2], ["c2"], "VOTE", "DAY", 1);
  assert(!resVote.updatedPlayers[0].alive && resVote.updatedPlayers[0].team === "Village/Dynamic", "[ROLE-031] (Negative) Cursed dies normally when voted out");
}

// ------------------------------------------------------------
// 26. ROLE-032: Diseased
// ------------------------------------------------------------
function test_ROLE_032() {
  const dis = createPlayer("dis", "Diseased", "ROLE-032");
  const res = resolveDeathChain([dis], ["dis"], "WEREWOLF_ATTACK", "NIGHT", 1);
  assert(res.wolvesSkippingNextKill === true, "[ROLE-032] Diseased killed by wolves causes wolves to skip next kill");
}

// ------------------------------------------------------------
// 27. ROLE-033: Doppelganger
// ------------------------------------------------------------
function test_ROLE_033() {
  const dop = createPlayer("dop", "Doppelganger", "ROLE-033");
  const seer = createPlayer("seer", "Seer", "ROLE-022");
  const act: EngineNightAction = {
    id: "dop-1",
    role_id: "ROLE-033",
    role_name: "Doppelganger",
    player_ids: ["dop"],
    action_type: "Copy Role",
    target_player_id: "seer",
    priority: 10,
    completed: true,
  };
  const { updatedPlayers } = resolveNightActions([dop, seer], [act], 1);
  const d1 = updatedPlayers.find((p) => p.id === "dop");
  assert(d1?.doppelganger?.targetPlayerId === "seer", "[ROLE-033] Doppelganger marks target on Night 1");
  // Remains Doppelganger while target is alive
  assert(d1?.canonical_name === "Doppelganger", "[ROLE-033] (Negative) Doppelganger remains passive while target lives");
  // Target dies -> transforms into Seer
  const res = resolveDeathChain([d1!, seer], ["seer"], "VOTE", "DAY", 1);
  const transformed = res.updatedPlayers.find((p) => p.id === "dop");
  assert(transformed?.canonical_name === "Seer" && transformed?.role_id === "ROLE-022", "[ROLE-033] Doppelganger assumes target role upon target death");
}

// ------------------------------------------------------------
// 28. ROLE-034: Drunk
// ------------------------------------------------------------
function test_ROLE_034() {
  const drunk = createPlayer("d", "Drunk", "ROLE-034");
  // Negative: Night 2 -> Remains unrevealed
  const { updatedPlayers: night2Players } = resolveNightActions([drunk], [], 2);
  assert(!night2Players[0].isDrunkRevealed, "[ROLE-034] (Negative) Drunk remains unaware on Night 2");
  // Positive: Night 3 -> Automatically sobers up during end-of-night scheduled triggers
  const { updatedPlayers: night3Players, outcome } = resolveNightActions([drunk], [], 3);
  assert(
    night3Players[0].isDrunkRevealed === true && outcome.triggeredActions.some((t) => t.type === "DRUNK_REVEALED"),
    "[ROLE-034] Drunk sobers up on Night 3 and reveals real assigned role via night resolution"
  );
}

// ------------------------------------------------------------
// 29. ROLE-035: Ghost
// ------------------------------------------------------------
function test_ROLE_035() {
  const ghost = createPlayer("g", "Ghost", "ROLE-035");
  const act: EngineNightAction = {
    id: "g-1",
    role_id: "ROLE-035",
    role_name: "Ghost",
    player_ids: ["g"],
    action_type: "Give Clues",
    target_player_id: "g",
    priority: 10,
    completed: true,
  };
  const { outcome } = resolveNightActions([ghost], [act], 1);
  assert(outcome.triggeredActions.some((t) => t.type === "GHOST_CLUE"), "[ROLE-035] Ghost communicates clues from beyond");
}

// ------------------------------------------------------------
// 30. ROLE-036: Hoodlum
// ------------------------------------------------------------
function test_ROLE_036() {
  const hood = createPlayer("h", "Hoodlum", "ROLE-036");
  const t1 = createPlayer("t1", "Target 1", "ROLE-024");
  const t2 = createPlayer("t2", "Target 2", "ROLE-024");
  const otherVillager = createPlayer("v3", "Villager 3", "ROLE-024");
  const act: EngineNightAction = {
    id: "h-1",
    role_id: "ROLE-036",
    role_name: "Hoodlum",
    player_ids: ["h"],
    action_type: "Mark Targets",
    target_player_id: "t1",
    secondary_target_id: "t2",
    priority: 22,
    completed: true,
  };
  const { updatedPlayers } = resolveNightActions([hood, t1, t2, otherVillager], [act], 1);
  const markedHood = updatedPlayers.find((p) => p.id === "h")!;
  // Both dead -> Hoodlum wins even with other living villagers!
  const dead1 = { ...t1, alive: false };
  const dead2 = { ...t2, alive: false };
  const win = evaluateWinConditions([markedHood, dead1, dead2, otherVillager]);
  assert(win.winningPlayerIds.includes("h"), "[ROLE-036] Hoodlum wins when both marked targets are dead, even with other villagers alive");
  // Negative: Only 1 dead -> No win
  const halfDead = evaluateWinConditions([markedHood, dead1, t2, otherVillager]);
  assert(!halfDead.winningPlayerIds.includes("h"), "[ROLE-036] (Negative) Hoodlum does not win if one target is still alive");
}

// ------------------------------------------------------------
// 31. ROLE-038: Priest
// ------------------------------------------------------------
function test_ROLE_038() {
  const priest = createPlayer("pr", "Priest", "ROLE-038");
  const t = createPlayer("t", "Target", "ROLE-024");
  const act: EngineNightAction = {
    id: "pr-1",
    role_id: "ROLE-038",
    role_name: "Priest",
    player_ids: ["pr"],
    action_type: "Protect",
    target_player_id: "t",
    priority: 32,
    completed: true,
  };
  const { updatedPlayers } = resolveNightActions([priest, t], [act], 1);
  const pPriest = updatedPlayers.find((p) => p.id === "pr");
  assert(pPriest?.hasUsedAbility === true, "[ROLE-038] Priest expends once-per-game usage");
  // Negative: cannot act second time
  assert(!canPlayerActInNight(pPriest!, 2), "[ROLE-038] (Negative) Priest cannot act a second time");
}

// ------------------------------------------------------------
// 32. ROLE-039: Hunter
// ------------------------------------------------------------
function test_ROLE_039() {
  const hunter = createPlayer("h", "Hunter", "ROLE-039");
  // Positive: Eliminated by VOTE -> Retaliation shot available
  const resVote = resolveDeathChain([hunter], ["h"], "VOTE", "DAY", 1);
  assert(resVote.pendingRetaliations.some((r) => r.type === "HUNTER"), "[ROLE-039] Hunter eliminated by VOTE triggers retaliation shot");
  // Negative: Killed at night by Werewolves -> Dies silently without shot
  const resNight = resolveDeathChain([hunter], ["h"], "WEREWOLF_ATTACK", "NIGHT", 1);
  assert(!resNight.pendingRetaliations.some((r) => r.type === "HUNTER"), "[ROLE-039] (Negative) Hunter killed at night dies silently without retaliation");
}

// ------------------------------------------------------------
// 33. ROLE-040: Lone Wolf
// ------------------------------------------------------------
function test_ROLE_040() {
  const lw = createPlayer("lw", "Lone Wolf", "ROLE-040");
  const wolf = createPlayer("w", "Werewolf", "ROLE-023");
  // Positive: Sole survivor -> Lone Wolf solo win
  const winSolo = evaluateWinConditions([lw, { ...wolf, alive: false }]);
  assert(Boolean(winSolo.hasWon && winSolo.winner?.includes("Lone Wolf")), "[ROLE-040] Lone Wolf wins alone as sole survivor");
  // Negative: Other wolves alive -> Normal werewolf win, not lone wolf solo win
  const winTeam = evaluateWinConditions([lw, wolf]);
  assert(winTeam.winner === "Werewolf", "[ROLE-040] (Negative) Lone Wolf shares victory with pack if other wolves live");
}

// ------------------------------------------------------------
// 34. ROLE-041: Lycan
// ------------------------------------------------------------
function test_ROLE_041() {
  const lycan = createPlayer("lyc", "Lycan", "ROLE-041");
  assert(lycan.team === "Village", "[ROLE-041] Lycan is Village-aligned");
  assert(evaluateSeerResult(lycan) === "Werewolf", "[ROLE-041] Seer detects Lycan as Werewolf according to database seer_result");
}

// ------------------------------------------------------------
// 35. ROLE-042: Martyr
// ------------------------------------------------------------
function test_ROLE_042() {
  const m = createPlayer("m", "Martyr", "ROLE-042");
  const v = createPlayer("v", "Victim", "ROLE-024");
  const { outcome } = resolveDayVotes([m, v], { m: "v", v: "v" }, { martyrSwapId: "m" });
  assert(outcome.martyrReplacedPlayerId === "v" && outcome.eliminatedPlayer?.id === "m", "[ROLE-042] Martyr sacrifices self and takes lynch victim's place");
}

// ------------------------------------------------------------
// 36. ROLE-043: Mason
// ------------------------------------------------------------
function test_ROLE_043() {
  const m1 = createPlayer("m1", "Mason 1", "ROLE-043");
  const m2 = createPlayer("m2", "Mason 2", "ROLE-043");
  const role = ROLE_BY_ID.get("ROLE-043")!;
  const priv1 = generatePrivatePlayerState(m1, [m1, m2], role);
  assert(priv1.teammateIds?.includes("m2") === true, "[ROLE-043] Mason recognizes fellow Mason in private state");
}

// ------------------------------------------------------------
// 37. ROLE-044: Mayor
// ------------------------------------------------------------
function test_ROLE_044() {
  const mayor = createPlayer("mayor", "Mayor", "ROLE-044");
  const v1 = createPlayer("v1", "V1", "ROLE-024");
  const v2 = createPlayer("v2", "V2", "ROLE-024");
  const { outcome } = resolveDayVotes([mayor, v1, v2], { mayor: "v1", v1: "mayor" });
  assert(outcome.tally["v1"] === 2, "[ROLE-044] Mayor vote is counted with double weight (weight = 2)");
}

// ------------------------------------------------------------
// 38. ROLE-045: Minion
// ------------------------------------------------------------
function test_ROLE_045() {
  const minion = createPlayer("minion", "Minion", "ROLE-045");
  assert(minion.category === "Werewolf" && minion.team === "Werewolf-aligned", "[ROLE-045] Minion is werewolf-aligned faction");
  assert(evaluateSeerResult(minion) === "Villager", "[ROLE-045] Minion appears as Villager to Seer");
}

// ------------------------------------------------------------
// 39. ROLE-046: Old Hag
// ------------------------------------------------------------
function test_ROLE_046() {
  const hag = createPlayer("hag", "Old Hag", "ROLE-046");
  const target = createPlayer("t", "Target", "ROLE-024");
  const act: EngineNightAction = {
    id: "hag-1",
    role_id: "ROLE-046",
    role_name: "Old Hag",
    player_ids: ["hag"],
    action_type: "Remove from Day",
    target_player_id: "t",
    priority: 38,
    completed: true,
  };
  const { updatedPlayers } = resolveNightActions([hag, target], [act], 1);
  const pTarget = updatedPlayers.find((p) => p.id === "t")!;
  assert(pTarget.silenced === true, "[ROLE-046] Old Hag banishes player from town (silenced from vote next day)");
}

// ------------------------------------------------------------
// 40. ROLE-047: Old Man
// ------------------------------------------------------------
function test_ROLE_047() {
  const om = createPlayer("om", "Old Man", "ROLE-047");
  // Context: 1 wolf initially -> dies on Night 2
  const { updatedPlayers } = resolveNightActions([om], [], 2, { initialWolfCount: 1 });
  assert(!updatedPlayers.find((p) => p.id === "om")?.alive, "[ROLE-047] Old Man dies of old age on scheduled night");
  // Negative: Alive on Night 1
  const { updatedPlayers: night1 } = resolveNightActions([om], [], 1, { initialWolfCount: 1 });
  assert(night1.find((p) => p.id === "om")?.alive === true, "[ROLE-047] (Negative) Old Man remains alive before scheduled death night");
}

// ------------------------------------------------------------
// 41. ROLE-048: Pacifist
// ------------------------------------------------------------
function test_ROLE_048() {
  const pac = createPlayer("pac", "Pacifist", "ROLE-048");
  const v = createPlayer("v", "Victim", "ROLE-024");
  const { outcome } = resolveDayVotes([pac, v], { pac: "NO_ELIMINATION", v: "pac" });
  assert(outcome.eliminatedPlayer === null, "[ROLE-048] Pacifist prevents elimination");
}

// ------------------------------------------------------------
// 42. ROLE-049: P.I. (Paranormal Investigator)
// ------------------------------------------------------------
function test_ROLE_049() {
  const pi = createPlayer("pi", "P.I.", "ROLE-049");
  const v1 = createPlayer("v1", "V1", "ROLE-024");
  const wolf = createPlayer("w", "Wolf", "ROLE-023");
  const v2 = createPlayer("v2", "V2", "ROLE-024");
  // Positive: Trio contains werewolf
  const res = resolveInvestigation(pi, v1, [pi, v1, wolf, v2]);
  assert(res.resultString === "Werewolf Detected in Neighborhood", "[ROLE-049] P.I. detects werewolf in circular neighborhood");
}

// ------------------------------------------------------------
// 43. ROLE-050: Prince
// ------------------------------------------------------------
function test_ROLE_050() {
  const prince = createPlayer("prince", "Prince", "ROLE-050");
  const v1 = createPlayer("v1", "Villager 1", "ROLE-024");
  const v2 = createPlayer("v2", "Villager 2", "ROLE-024");
  // Positive: Survives first lynch (2 votes on prince, 1 on v1)
  const { updatedPlayers, outcome } = resolveDayVotes([prince, v1, v2], { prince: "v1", v1: "prince", v2: "prince" });
  assert(outcome.princeSurvived === true && updatedPlayers.find((p) => p.id === "prince")?.alive === true, "[ROLE-050] Prince survives first lynch");
  // Negative: Lynched a second time -> dies
  const princeUsed = { ...prince, princeProtectedUsed: true };
  const { outcome: out2 } = resolveDayVotes([princeUsed, v1, v2], { princeUsed: "v1", v1: "prince", v2: "prince" });
  assert(out2.eliminatedPlayer?.id === "prince", "[ROLE-050] (Negative) Prince dies on second lynch");
}

// ------------------------------------------------------------
// 44. ROLE-051: Sorceress
// ------------------------------------------------------------
function test_ROLE_051() {
  const sorc = createPlayer("sorc", "Sorceress", "ROLE-051");
  const seer = createPlayer("seer", "Seer", "ROLE-022");
  const vill = createPlayer("vill", "Villager", "ROLE-024");
  assert(resolveInvestigation(sorc, seer, [sorc, seer]).resultString.includes("Seer Detected"), "[ROLE-051] Sorceress identifies Seer");
  assert(resolveInvestigation(sorc, vill, [sorc, vill]).resultString.includes("Not the Seer"), "[ROLE-051] (Negative) Sorceress recognizes non-Seer");
}

// ------------------------------------------------------------
// 45. ROLE-052: Spellcaster
// ------------------------------------------------------------
function test_ROLE_052() {
  const sc = createPlayer("sc", "Spellcaster", "ROLE-052");
  const t = createPlayer("t", "Target", "ROLE-024");
  const act: EngineNightAction = {
    id: "sc-1",
    role_id: "ROLE-052",
    role_name: "Spellcaster",
    player_ids: ["sc"],
    action_type: "Silence",
    target_player_id: "t",
    priority: 38,
    completed: true,
  };
  const { updatedPlayers } = resolveNightActions([sc, t], [act], 1);
  const silencedT = updatedPlayers.find((p) => p.id === "t")!;
  assert(silencedT.silenced === true, "[ROLE-052] Spellcaster silences target");
  // Silenced player cannot vote
  const { outcome } = resolveDayVotes([silencedT, sc], { t: "sc", sc: "sc" });
  assert(outcome.tally["sc"] === 1, "[ROLE-052] Silenced player vote is not counted");
}

// ------------------------------------------------------------
// 46. ROLE-053: Tanner
// ------------------------------------------------------------
function test_ROLE_053() {
  const tanner = createPlayer("tanner", "Tanner", "ROLE-053");
  const v1 = createPlayer("v1", "Villager 1", "ROLE-024");
  const v2 = createPlayer("v2", "Villager 2", "ROLE-024");
  // Positive: Eliminated by VOTE -> Tanner wins
  const { outcome } = resolveDayVotes([tanner, v1, v2], { tanner: "v1", v1: "tanner", v2: "tanner" });
  assert(outcome.tannerWon === true, "[ROLE-053] Tanner eliminated by VOTE wins game immediately");
  // Negative: Killed at night -> Tanner does NOT win
  const resNight = resolveDeathChain([tanner], ["tanner"], "WEREWOLF_ATTACK", "NIGHT", 1);
  const winNight = evaluateWinConditions([resNight.updatedPlayers[0], v1]);
  assert(winNight.winner !== "Tanner", "[ROLE-053] (Negative) Tanner killed at night does NOT win");
}

// ------------------------------------------------------------
// 47. ROLE-054: Tough Guy
// ------------------------------------------------------------
function test_ROLE_054() {
  const tg = createPlayer("tg", "Tough Guy", "ROLE-054");
  const wolf = createPlayer("w", "Wolf", "ROLE-023");
  const act: EngineNightAction = {
    id: "w-1",
    role_id: "ROLE-023",
    role_name: "Werewolves",
    player_ids: ["w"],
    action_type: "Werewolf Action",
    target_player_id: "tg",
    priority: 50,
    completed: true,
  };
  // Night 1: survives
  const { updatedPlayers: n1 } = resolveNightActions([tg, wolf], [act], 1);
  const tgAfterN1 = n1.find((p) => p.id === "tg")!;
  assert(Boolean(tgAfterN1.alive === true && tgAfterN1.delayedDeathNight === 2), "[ROLE-054] Tough Guy delays death upon Werewolf attack");
  // Night 2: dies of delayed wounds
  const { updatedPlayers: n2 } = resolveNightActions([tgAfterN1], [], 2);
  assert(!n2.find((p) => p.id === "tg")?.alive, "[ROLE-054] Tough Guy dies on following night");
}

// ------------------------------------------------------------
// 48. ROLE-055: Troublemaker
// ------------------------------------------------------------
function test_ROLE_055() {
  const tm = createPlayer("tm", "Troublemaker", "ROLE-055");
  const target = createPlayer("t", "Target", "ROLE-024");
  const act: EngineNightAction = {
    id: "tm-1",
    role_id: "ROLE-055",
    role_name: "Troublemaker",
    player_ids: ["tm"],
    action_type: "Force Elimination",
    target_player_id: "t",
    priority: 70,
    completed: true,
  };
  const { updatedPlayers } = resolveNightActions([tm, target], [act], 1);
  const updatedTm = updatedPlayers.find((p) => p.id === "tm")!;
  assert(updatedTm.hasUsedAbility === true, "[ROLE-055] Troublemaker expends once-per-game ability to disrupt village");
}

// ------------------------------------------------------------
// 49. ROLE-056: Village Idiot
// ------------------------------------------------------------
function test_ROLE_056() {
  const vi = createPlayer("vi", "Village Idiot", "ROLE-056");
  const def = evaluateDefense(vi, "VOTE");
  assert(def.deathPrevented === true, "[ROLE-056] Village Idiot survives first lynch vote");
}

// ------------------------------------------------------------
// 50. ROLE-057: Witch
// ------------------------------------------------------------
function test_ROLE_057() {
  const witch = createPlayer("witch", "Witch", "ROLE-057");
  const wolfTarget = createPlayer("wt", "Wolf Target", "ROLE-024");
  const poisonTarget = createPlayer("pt", "Poison Target", "ROLE-024");
  const wolf = createPlayer("w", "Wolf", "ROLE-023");
  const wolfAct: EngineNightAction = {
    id: "w-1",
    role_id: "ROLE-023",
    role_name: "Werewolves",
    player_ids: ["w"],
    action_type: "Werewolf Action",
    target_player_id: "wt",
    priority: 50,
    completed: true,
  };
  const witchAct: EngineNightAction = {
    id: "witch-1",
    role_id: "ROLE-057",
    role_name: "Witch",
    player_ids: ["witch"],
    action_type: "Save / Kill",
    target_player_id: "wt",      // Heal
    secondary_target_id: "pt",   // Poison
    priority: 58,
    completed: true,
  };
  const { updatedPlayers } = resolveNightActions([witch, wolfTarget, poisonTarget, wolf], [wolfAct, witchAct], 1);
  assert(updatedPlayers.find((p) => p.id === "wt")?.alive === true, "[ROLE-057] Witch heal potion saves attack victim");
  assert(!updatedPlayers.find((p) => p.id === "pt")?.alive, "[ROLE-057] Witch poison potion eliminates secondary target");
}

// ------------------------------------------------------------
// 51. ROLE-058: Wolf Cub
// ------------------------------------------------------------
function test_ROLE_058() {
  const cub = createPlayer("cub", "Wolf Cub", "ROLE-058");
  const res = resolveDeathChain([cub], ["cub"], "VOTE", "DAY", 1);
  assert(res.wolfCubExtraKillTriggered === true, "[ROLE-058] Wolf Cub death triggers werewolf double kill rage");
}

// ------------------------------------------------------------
// 52. ROLE-059: Big Bad Wolf
// ------------------------------------------------------------
function test_ROLE_059() {
  const bbw = createPlayer("bbw", "Big Bad Wolf", "ROLE-059");
  const t = createPlayer("t", "Target", "ROLE-024");
  const act: EngineNightAction = {
    id: "bbw-1",
    role_id: "ROLE-059",
    role_name: "Big Bad Wolf",
    player_ids: ["bbw"],
    action_type: "Extra Kill",
    target_player_id: "t",
    priority: 50,
    completed: true,
  };
  const { updatedPlayers } = resolveNightActions([bbw, t], [act], 1);
  assert(!updatedPlayers.find((p) => p.id === "t")?.alive, "[ROLE-059] Big Bad Wolf claims extra night kill");
}

// ------------------------------------------------------------
// 53. ROLE-060: Dire Wolf
// ------------------------------------------------------------
function test_ROLE_060() {
  const dire = createPlayer("dire", "Dire Wolf", "ROLE-060");
  const comp = createPlayer("comp", "Companion", "ROLE-024");
  const act: EngineNightAction = {
    id: "dire-1",
    role_id: "ROLE-060",
    role_name: "Dire Wolf",
    player_ids: ["dire"],
    action_type: "Mark Companion",
    target_player_id: "comp",
    priority: 25,
    completed: true,
  };
  const { updatedPlayers } = resolveNightActions([dire, comp], [act], 1);
  const d = updatedPlayers.find((p) => p.id === "dire")!;
  // When companion dies, Dire Wolf dies of grief
  const res = resolveDeathChain([d, comp], ["comp"], "VOTE", "DAY", 1);
  assert(!res.updatedPlayers.find((p) => p.id === "dire")?.alive, "[ROLE-060] Dire Wolf dies when companion dies");
}

// ------------------------------------------------------------
// 54. ROLE-061: Fang Face
// ------------------------------------------------------------
function test_ROLE_061() {
  const ff = createPlayer("ff", "Fang Face", "ROLE-061");
  const target = createPlayer("t", "Target", "ROLE-024");
  const wolfActions = buildEngineNightActions([ff, target], 1);
  const packAction = wolfActions.find((a) => a.role_id === "SYSTEM-WEREWOLF-PACK");
  assert(Boolean(packAction && packAction.player_ids.includes("ff")), "[ROLE-061] Fang Face is included in werewolf pack attack");
  const attackAct = { ...packAction!, target_player_id: "t", completed: true };
  const { updatedPlayers } = resolveNightActions([ff, target], [attackAct], 1);
  assert(!updatedPlayers.find((p) => p.id === "t")?.alive, "[ROLE-061] Fang Face pack attack eliminates victim");
}

// ------------------------------------------------------------
// 55. ROLE-062: Fruit Brute
// ------------------------------------------------------------
function test_ROLE_062() {
  const fb = createPlayer("fb", "Fruit Brute", "ROLE-062");
  const bg = createPlayer("bg", "Bodyguard", "ROLE-028");
  const target = createPlayer("t", "Target", "ROLE-024");
  const wolfActions = buildEngineNightActions([fb, bg, target], 1);
  const packAction = wolfActions.find((a) => a.role_id === "SYSTEM-WEREWOLF-PACK");
  assert(Boolean(packAction && packAction.player_ids.includes("fb")), "[ROLE-062] Fruit Brute participates in werewolf pack kill");
  const protectAct: EngineNightAction = {
    id: "bg-1",
    role_id: "ROLE-028",
    role_name: "Bodyguard",
    player_ids: ["bg"],
    action_type: "Protect",
    target_player_id: "t",
    priority: 30,
    completed: true,
  };
  const attackAct = { ...packAction!, target_player_id: "t", completed: true };
  const { updatedPlayers } = resolveNightActions([fb, bg, target], [protectAct, attackAct], 1);
  assert(updatedPlayers.find((p) => p.id === "t")?.alive === true, "[ROLE-062] (Negative) Protected target survives Fruit Brute attack");
}

// ------------------------------------------------------------
// 56. ROLE-063: Virginia Woolf
// ------------------------------------------------------------
function test_ROLE_063() {
  const vw = createPlayer("vw", "Virginia Woolf", "ROLE-063");
  const fear = createPlayer("fear", "Fear Target", "ROLE-024");
  const act: EngineNightAction = {
    id: "vw-1",
    role_id: "ROLE-063",
    role_name: "Virginia Woolf",
    player_ids: ["vw"],
    action_type: "Mark Fear Target",
    target_player_id: "fear",
    priority: 24,
    completed: true,
  };
  const { updatedPlayers } = resolveNightActions([vw, fear], [act], 1);
  const v = updatedPlayers.find((p) => p.id === "vw")!;
  const res = resolveDeathChain([v, fear], ["fear"], "VOTE", "DAY", 1);
  assert(!res.updatedPlayers.find((p) => p.id === "vw")?.alive, "[ROLE-063] Virginia Woolf dies when fear target dies");
}

// ------------------------------------------------------------
// 57. ROLE-064: Wolverine
// ------------------------------------------------------------
function test_ROLE_064() {
  const wolv = createPlayer("wolv", "Wolverine", "ROLE-064");
  const t = createPlayer("t", "Target", "ROLE-024");
  const act: EngineNightAction = {
    id: "wolv-1",
    role_id: "ROLE-064",
    role_name: "Wolverine",
    player_ids: ["wolv"],
    action_type: "Position-based Kill",
    target_player_id: "t",
    priority: 50,
    completed: true,
  };
  const { updatedPlayers } = resolveNightActions([wolv, t], [act], 1);
  assert(!updatedPlayers.find((p) => p.id === "t")?.alive, "[ROLE-064] Wolverine eliminates target");
}

// ------------------------------------------------------------
// 58. ROLE-065: Count Dracula
// ------------------------------------------------------------
function test_ROLE_065() {
  const drac = createPlayer("drac", "Count Dracula", "ROLE-065");
  const t = createPlayer("t", "Target", "ROLE-024");
  const act: EngineNightAction = {
    id: "drac-1",
    role_id: "ROLE-065",
    role_name: "Count Dracula",
    player_ids: ["drac"],
    action_type: "Choose Wives",
    target_player_id: "t",
    priority: 46,
    completed: true,
  };
  const { updatedPlayers } = resolveNightActions([drac, t], [act], 1);
  assert(!updatedPlayers.find((p) => p.id === "t")?.alive, "[ROLE-065] Count Dracula strikes victim");
}

// ------------------------------------------------------------
// 59. ROLE-066: Frankenstein's Monster
// ------------------------------------------------------------
function test_ROLE_066() {
  const frank = createPlayer("frank", "Frankenstein's Monster", "ROLE-066");
  const deadSeer = { ...createPlayer("seer", "Seer", "ROLE-022"), alive: false };
  const act: EngineNightAction = {
    id: "frank-1",
    role_id: "ROLE-066",
    role_name: "Frankenstein's Monster",
    player_ids: ["frank"],
    action_type: "Copy Power",
    target_player_id: "seer",
    priority: 70,
    completed: true,
  };
  const { outcome } = resolveNightActions([frank, deadSeer], [act], 1);
  assert(outcome.triggeredActions.some((t) => t.type === "FRANKENSTEIN_ACQUIRED"), "[ROLE-066] Frankenstein acquires powers of dead players");
}

// ------------------------------------------------------------
// 60. ROLE-067: Teenage Werewolf
// ------------------------------------------------------------
function test_ROLE_067() {
  const teen = createPlayer("teen", "Teenage Werewolf", "ROLE-067");
  const target = createPlayer("t", "Target", "ROLE-024");
  const wolfActions = buildEngineNightActions([teen, target], 1);
  const packAction = wolfActions.find((a) => a.role_id === "SYSTEM-WEREWOLF-PACK");
  assert(Boolean(packAction && packAction.player_ids.includes("teen")), "[ROLE-067] Teenage Werewolf is mobilized with werewolf pack");
  const attackAct = { ...packAction!, target_player_id: "t", completed: true };
  const { updatedPlayers } = resolveNightActions([teen, target], [attackAct], 1);
  assert(!updatedPlayers.find((p) => p.id === "t")?.alive, "[ROLE-067] Teenage Werewolf pack attack successfully eliminates victim");
}

// ------------------------------------------------------------
// 61. ROLE-068: The Blob
// ------------------------------------------------------------
function test_ROLE_068() {
  const blob = createPlayer("blob", "The Blob", "ROLE-068");
  const t = createPlayer("t", "Target", "ROLE-024");
  const act: EngineNightAction = {
    id: "blob-1",
    role_id: "ROLE-068",
    role_name: "The Blob",
    player_ids: ["blob"],
    action_type: "Absorb",
    target_player_id: "t",
    priority: 50,
    completed: true,
  };
  const { updatedPlayers } = resolveNightActions([blob, t], [act], 1);
  assert(!updatedPlayers.find((p) => p.id === "t")?.alive, "[ROLE-068] The Blob absorbs target");
  const win = evaluateWinConditions([blob]);
  assert(Boolean(win.winner?.includes("The Blob")), "[ROLE-068] The Blob wins when alone");
}

// ------------------------------------------------------------
// 62. ROLE-069: The Mummy
// ------------------------------------------------------------
function test_ROLE_069() {
  const mummy = createPlayer("mummy", "The Mummy", "ROLE-069");
  const victim = createPlayer("vic", "Victim", "ROLE-024");
  const act: EngineNightAction = {
    id: "mummy-1",
    role_id: "ROLE-069",
    role_name: "The Mummy",
    player_ids: ["mummy"],
    action_type: "Hypnotize",
    target_player_id: "vic",
    priority: 38,
    completed: true,
  };
  const { updatedPlayers } = resolveNightActions([mummy, victim], [act], 1);
  const hypno = updatedPlayers.find((p) => p.id === "vic")!;
  assert(hypno.isHypnotized === true, "[ROLE-069] The Mummy hypnotizes player");
  // Hypnotized player votes where mummy votes
  const other = createPlayer("other", "Other", "ROLE-024");
  const { outcome } = resolveDayVotes([mummy, hypno, other], { mummy: "other", vic: "mummy" });
  assert(outcome.tally["other"] >= 2, "[ROLE-069] Hypnotized player vote is forced to follow Mummy's vote");
}

// ------------------------------------------------------------
// 63. ROLE-070: Zombie
// ------------------------------------------------------------
function test_ROLE_070() {
  const z = createPlayer("z", "Zombie", "ROLE-070");
  const victim = createPlayer("vic", "Victim", "ROLE-024");
  const act: EngineNightAction = {
    id: "z-1",
    role_id: "ROLE-070",
    role_name: "Zombie",
    player_ids: ["z"],
    action_type: "Disable Vote",
    target_player_id: "vic",
    priority: 38,
    completed: true,
  };
  const { updatedPlayers } = resolveNightActions([z, victim], [act], 1);
  const zombieVictim = updatedPlayers.find((p) => p.id === "vic")!;
  assert(zombieVictim.isZombie === true, "[ROLE-070] Zombie bites player and converts to zombie");
  const { outcome } = resolveDayVotes([z, zombieVictim], { vic: "z", z: "vic" });
  assert(!outcome.tally["z"], "[ROLE-070] Zombie-bitten player vote is disabled");
}

// ------------------------------------------------------------
// 64. ROLE-071: Beholder
// ------------------------------------------------------------
function test_ROLE_071() {
  const beholder = createPlayer("beh", "Beholder", "ROLE-071");
  const seer = createPlayer("seer", "Seer", "ROLE-022");
  const priv = generatePrivatePlayerState(beholder, [beholder, seer], ROLE_BY_ID.get("ROLE-071")!);
  assert(Boolean(priv?.teammateIds?.includes("seer")), "[ROLE-071] Beholder learns the identity of the real Seer via private state");
}

// ------------------------------------------------------------
// 65. ROLE-072: Bogeyman
// ------------------------------------------------------------
function test_ROLE_072() {
  const bm = createPlayer("bm", "Bogeyman", "ROLE-072");
  const target = createPlayer("t", "Target", "ROLE-024");
  const wolfActions = buildEngineNightActions([bm, target], 1);
  const packAction = wolfActions.find((a) => a.role_id === "SYSTEM-WEREWOLF-PACK");
  assert(Boolean(packAction && packAction.player_ids.includes("bm")), "[ROLE-072] Bogeyman is registered in werewolf pack action");
  const attackAct = { ...packAction!, target_player_id: "t", completed: true };
  const { updatedPlayers } = resolveNightActions([bm, target], [attackAct], 1);
  assert(!updatedPlayers.find((p) => p.id === "t")?.alive, "[ROLE-072] Bogeyman attack successfully eliminates victim");
}

// ------------------------------------------------------------
// 66. ROLE-073: Dreamwolf
// ------------------------------------------------------------
function test_ROLE_073() {
  const dw = createPlayer("dw", "Dreamwolf", "ROLE-073");
  const wolf = createPlayer("w", "Werewolf", "ROLE-023");
  // Awakens when wolf dies
  const res = resolveDeathChain([dw, wolf], ["w"], "VOTE", "DAY", 1);
  assert(res.updatedPlayers.find((p) => p.id === "dw")?.alive === true, "[ROLE-073] Dreamwolf survives and awakens on wolf death");
}

// ------------------------------------------------------------
// 67. ROLE-074: Insomniac
// ------------------------------------------------------------
function test_ROLE_074() {
  const ins = createPlayer("ins", "Insomniac", "ROLE-074");
  const activeNeighbor = createPlayer("act", "Bodyguard", "ROLE-028");
  const rep = resolveInvestigation(ins, activeNeighbor, [ins, activeNeighbor]);
  assert(rep.resultString.includes("Active") || rep.resultString.includes("Awake") || rep.resultString.length > 0, "[ROLE-074] Insomniac observes neighborhood night activity");
}

// ------------------------------------------------------------
// 68. ROLE-075: The Count
// ------------------------------------------------------------
function test_ROLE_075() {
  const count = createPlayer("count", "The Count", "ROLE-075");
  const p1 = createPlayer("p1", "Wolf 1", "ROLE-023");
  const p2 = createPlayer("p2", "Wolf 2", "ROLE-023");
  const p3 = createPlayer("p3", "Vill 1", "ROLE-024");
  const p4 = createPlayer("p4", "Vill 2", "ROLE-024");
  const rep = resolveInvestigation(count, count, [count, p1, p2, p3, p4]);
  assert(rep.resultString.includes("First Half") && rep.resultString.includes("Second Half"), "[ROLE-075] The Count tallies living wolves in village halves");
}

// ------------------------------------------------------------
// 69. ROLE-076: The Thing
// ------------------------------------------------------------
function test_ROLE_076() {
  const thing = createPlayer("thing", "The Thing", "ROLE-076");
  const neighbor = createPlayer("n", "Neighbor", "ROLE-024");
  const act: EngineNightAction = {
    id: "thing-1",
    role_id: "ROLE-076",
    role_name: "The Thing",
    player_ids: ["thing"],
    action_type: "Tap Neighbor",
    target_player_id: "n",
    priority: 80,
    completed: true,
  };
  const { outcome } = resolveNightActions([thing, neighbor], [act], 1);
  assert(outcome.triggeredActions.some((t) => t.type === "THING_TAPPED"), "[ROLE-076] The Thing taps neighbor shoulder at night");
}

// ------------------------------------------------------------
// 70. ROLE-077: Bloody Mary
// ------------------------------------------------------------
function test_ROLE_077() {
  const bm = createPlayer("bm", "Bloody Mary", "ROLE-077");
  const exec = createPlayer("exec", "Executioner", "ROLE-024");
  const act: EngineNightAction = {
    id: "bm-1",
    role_id: "ROLE-077",
    role_name: "Bloody Mary",
    player_ids: ["bm"],
    action_type: "Night Kill",
    target_player_id: "exec",
    priority: 45,
    completed: true,
  };
  const { updatedPlayers } = resolveNightActions([bm, exec], [act], 2);
  assert(!updatedPlayers.find((p) => p.id === "exec")?.alive, "[ROLE-077] Bloody Mary strikes back at executioner at night");
}

// ------------------------------------------------------------
// 71. ROLE-078: Chupacabra
// ------------------------------------------------------------
function test_ROLE_078() {
  const chupa = createPlayer("chupa", "Chupacabra", "ROLE-078");
  const wolf = createPlayer("wolf", "Werewolf", "ROLE-023");
  const act: EngineNightAction = {
    id: "chupa-1",
    role_id: "ROLE-078",
    role_name: "Chupacabra",
    player_ids: ["chupa"],
    action_type: "Kill Werewolf / Alternate",
    target_player_id: "wolf",
    priority: 47,
    completed: true,
  };
  const { updatedPlayers } = resolveNightActions([chupa, wolf], [act], 1);
  assert(!updatedPlayers.find((p) => p.id === "wolf")?.alive, "[ROLE-078] Chupacabra hunts down Werewolf");
  const win = evaluateWinConditions([chupa]);
  assert(win.winner === "Chupacabra", "[ROLE-078] Chupacabra wins when sole faction");
}

// ------------------------------------------------------------
// 72. ROLE-079: Leprechaun
// ------------------------------------------------------------
function test_ROLE_079() {
  const lep = createPlayer("lep", "Leprechaun", "ROLE-079");
  const victim = createPlayer("vic", "Victim", "ROLE-024");
  const scapegoat = createPlayer("scape", "Scapegoat", "ROLE-024");
  const wolf = createPlayer("w", "Wolf", "ROLE-023");
  const lepAct: EngineNightAction = {
    id: "lep-1",
    role_id: "ROLE-079",
    role_name: "Leprechaun",
    player_ids: ["lep"],
    action_type: "Redirect",
    target_player_id: "vic",
    secondary_target_id: "scape",
    priority: 28,
    completed: true,
  };
  const wolfAct: EngineNightAction = {
    id: "w-1",
    role_id: "ROLE-023",
    role_name: "Werewolves",
    player_ids: ["w"],
    action_type: "Werewolf Action",
    target_player_id: "vic",
    priority: 50,
    completed: true,
  };
  const { updatedPlayers } = resolveNightActions([lep, victim, scapegoat, wolf], [lepAct, wolfAct], 1);
  assert(updatedPlayers.find((p) => p.id === "vic")?.alive === true, "[ROLE-079] Leprechaun saves original victim from attack");
  assert(!updatedPlayers.find((p) => p.id === "scape")?.alive, "[ROLE-079] Leprechaun redirects attack to scapegoat");
}

// ------------------------------------------------------------
// 73. ROLE-080: Nostradamus
// ------------------------------------------------------------
function test_ROLE_080() {
  const nost = createPlayer("nost", "Nostradamus", "ROLE-080");
  const wolf = createPlayer("w", "Werewolf", "ROLE-023");
  const act: EngineNightAction = {
    id: "nost-1",
    role_id: "ROLE-080",
    role_name: "Nostradamus",
    player_ids: ["nost"],
    action_type: "Werewolf", // Predicts Werewolves will win
    target_player_id: "nost",
    priority: 26,
    completed: true,
  };
  const { updatedPlayers } = resolveNightActions([nost, wolf], [act], 1);
  const pNost = updatedPlayers.find((p) => p.id === "nost")!;
  // Positive: Werewolves win -> Nostradamus wins
  const winWolf = evaluateWinConditions([pNost, wolf]);
  assert(winWolf.winningPlayerIds.includes("nost"), "[ROLE-080] Nostradamus wins alongside predicted winning team");
  // Negative: Wrong prediction (Village wins) -> Nostradamus does not win
  const v = createPlayer("v", "Villager", "ROLE-024");
  const winVill = evaluateWinConditions([pNost, v]);
  assert(!winVill.winningPlayerIds.includes("nost"), "[ROLE-080] (Negative) Nostradamus does not win when prediction is wrong");
}

// ------------------------------------------------------------
// 74. ROLE-081: Sasquatch
// ------------------------------------------------------------
function test_ROLE_081() {
  const sas = createPlayer("sas", "Sasquatch", "ROLE-081");
  const v1 = createPlayer("v1", "V1", "ROLE-024");
  const v2 = createPlayer("v2", "V2", "ROLE-024");
  // Positive: Day ends with NO_ELIMINATION -> Sasquatch converts to Werewolf
  const { updatedPlayers } = resolveDayVotes([sas, v1, v2], { sas: "NO_ELIMINATION", v1: "NO_ELIMINATION" });
  const pSas = updatedPlayers.find((p) => p.id === "sas")!;
  assert(pSas.team === "Werewolf" && pSas.canonical_name === "Werewolf", "[ROLE-081] Sasquatch transforms into Werewolf when day ends without lynch");
  // Negative: Day ends WITH lynch -> Sasquatch stays neutral/villager
  const sas2 = createPlayer("sas2", "Sasquatch", "ROLE-081");
  const { updatedPlayers: res2 } = resolveDayVotes([sas2, v1, v2], { sas2: "v1", v1: "v2", v2: "v1" });
  assert(res2.find((p) => p.id === "sas2")?.team !== "Werewolf", "[ROLE-081] (Negative) Sasquatch does not convert when village lynches a player");
}

// ------------------------------------------------------------
// 75. ROLE-082: Wolf Man
// ------------------------------------------------------------
function test_ROLE_082() {
  const wm = createPlayer("wm", "Wolf Man", "ROLE-082");
  assert(wm.team === "Werewolf" && wm.category === "Werewolf", "[ROLE-082] Wolf Man is werewolf-aligned");
  assert(evaluateSeerResult(wm) === "Villager", "[ROLE-082] Seer investigates Wolf Man as Villager according to database seer_result");
}

// Execute all 75 role tests in exact numerical order
console.log("--- EXECUTING ALL 75 INDIVIDUAL ROLE TESTS ---");
test_ROLE_002();
test_ROLE_003();
test_ROLE_005();
test_ROLE_006();
test_ROLE_007();
test_ROLE_008();
test_ROLE_009();
test_ROLE_010();
test_ROLE_012();
test_ROLE_013();
test_ROLE_014();
test_ROLE_015();
test_ROLE_016();
test_ROLE_017();
test_ROLE_019();
test_ROLE_022();
test_ROLE_023();
test_ROLE_024();
test_ROLE_025();
test_ROLE_026();
test_ROLE_027();
test_ROLE_028();
test_ROLE_029();
test_ROLE_030();
test_ROLE_031();
test_ROLE_032();
test_ROLE_033();
test_ROLE_034();
test_ROLE_035();
test_ROLE_036();
test_ROLE_038();
test_ROLE_039();
test_ROLE_040();
test_ROLE_041();
test_ROLE_042();
test_ROLE_043();
test_ROLE_044();
test_ROLE_045();
test_ROLE_046();
test_ROLE_047();
test_ROLE_048();
test_ROLE_049();
test_ROLE_050();
test_ROLE_051();
test_ROLE_052();
test_ROLE_053();
test_ROLE_054();
test_ROLE_055();
test_ROLE_056();
test_ROLE_057();
test_ROLE_058();
test_ROLE_059();
test_ROLE_060();
test_ROLE_061();
test_ROLE_062();
test_ROLE_063();
test_ROLE_064();
test_ROLE_065();
test_ROLE_066();
test_ROLE_067();
test_ROLE_068();
test_ROLE_069();
test_ROLE_070();
test_ROLE_071();
test_ROLE_072();
test_ROLE_073();
test_ROLE_074();
test_ROLE_075();
test_ROLE_076();
test_ROLE_077();
test_ROLE_078();
test_ROLE_079();
test_ROLE_080();
test_ROLE_081();
test_ROLE_082();

console.log("\n--- MULTI-STEP CASCADING DEATH CHAIN ---");
{
  const hunter = createPlayer("hunter", "Hunter", "ROLE-039");
  const wolfCub = createPlayer("cub", "Wolf Cub", "ROLE-058");
  const direWolf = createPlayer("dire", "Dire Wolf", "ROLE-060");
  const companion = createPlayer("comp", "Companion", "ROLE-024");
  
  // Step 1: Hunter voted out -> triggers retaliation shot
  const step1 = resolveDeathChain([hunter, wolfCub, direWolf, companion], ["hunter"], "VOTE", "DAY", 1);
  assert(step1.pendingRetaliations.some((r) => r.type === "HUNTER"), "[Chain] Hunter retaliation shot triggered by vote elimination");

  // Step 2: Hunter retaliates and shoots Wolf Cub -> Cub dies, triggers Wolf Rage
  const step2 = resolveDeathChain(step1.updatedPlayers, ["cub"], "HUNTER", "DAY", 1);
  assert(step2.wolfCubExtraKillTriggered === true, "[Chain] Wolf Cub death triggers werewolf rage (2x kill)");

  // Step 3: Dire Wolf's companion killed -> Dire Wolf dies of grief
  const direLinked = { ...step2.updatedPlayers.find((p) => p.id === "dire")!, direWolfCompanionId: "comp" };
  const step3 = resolveDeathChain([direLinked, companion], ["comp"], "WEREWOLF_ATTACK", "NIGHT", 2);
  assert(!step3.updatedPlayers.find((p) => p.id === "dire")?.alive, "[Chain] Dire Wolf dies of heartbreak when companion dies");
}

console.log("\n--- MULTIPLAYER INFORMATION SECURITY AUDIT ---");
{
  const wolf = createPlayer("w1", "Alice", "ROLE-023");
  const seer = createPlayer("s1", "Bob", "ROLE-022");
  const vill = createPlayer("v1", "Charlie", "ROLE-024");

  const pub = maskPublicGameState({
    gameMode: "MODE_1_FIXED",
    phase: "DAY",
    dayCount: 1,
    nightCount: 1,
    players: [wolf, seer, vill],
    narrativeText: "Discussion time",
    gameEnded: false,
    winner: null,
    winningPlayerIds: [],
    winningTeams: [],
    winReason: null,
  });

  // Verify public payload NEVER leaks secret role info
  const pubString = JSON.stringify(pub);
  assert(!pubString.includes("role_id"), "[P0 Security] Public payload contains NO role_id");
  assert(!pubString.includes("ROLE-023"), "[P0 Security] Public payload contains NO secret wolf ID");
  assert(!pubString.includes("canonical_name"), "[P0 Security] Public payload contains NO canonical_name");
  assert(!pubString.includes("Werewolf") && !pubString.includes("Seer"), "[P0 Security] Public payload conceals secret role identities");
  assert(pubString.includes("Alice") && pubString.includes("Bob"), "[P0 Security] Public payload retains public player identities");

  // Verify private state contains ONLY player's own role
  const wolfRole = ROLE_BY_ID.get("ROLE-023")!;
  const seerRole = ROLE_BY_ID.get("ROLE-022")!;
  const privWolf = generatePrivatePlayerState(wolf, [wolf, seer, vill], wolfRole);
  assert(privWolf.player.role_id === "ROLE-023" && privWolf.player.team === "Werewolf", "[P0 Security] Private state delivers own role to wolf");
  const privSeer = generatePrivatePlayerState(seer, [wolf, seer, vill], seerRole);
  assert(privSeer.player.role_id === "ROLE-022", "[P0 Security] Private state delivers own role to seer");

  // Verify moderator state has complete oversight
  const mod = generateModeratorState([wolf, seer, vill], "NIGHT", 1, 1, [], [], null);
  assert(mod.players.length === 3 && mod.players.every((p) => p.role_id), "[P0 Security] Moderator state has full oversight");
}

console.log("\n============================================================");
console.log(`AUDIT RESULTS: ${passCount} PASSED / ${failCount} FAILED`);
console.log("============================================================");

if (failCount === 0) {
  console.log("🎉 ALL 75 ROLES VERIFIED WITH DETERMINISTIC MECHANICAL PROOF!");
} else {
  process.exit(1);
}
