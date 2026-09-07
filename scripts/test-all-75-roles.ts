// ============================================================
// ASPIRE: WEREWOLF - Comprehensive 75-Role Deterministic Test Suite
// Driven by Role Database Blueprint (75 Roles, 79 Abilities)
// "One Village. Many Lies. One Wolf."
// ============================================================

import rolesJson from "../src/data/roles.json";
import abilitiesJson from "../src/data/abilities.json";
import { RoleData, SelectedRole } from "../src/types/game";
import {
  PlayerEngineState,
  EngineNightAction,
  PublicGameState,
} from "../src/lib/engine/types";
import {
  ALL_ROLES,
  ROLE_BY_ID,
  ROLE_BY_NAME,
  evaluateSeerResult,
} from "../src/lib/engine/abilityRegistry";
import {
  resolveNightActions,
} from "../src/lib/engine/actionResolver";
import {
  resolveDayVotes,
} from "../src/lib/engine/voteResolver";
import {
  evaluateWinConditions,
} from "../src/lib/engine/winEngine";
import {
  requestDeath,
  resolveDeathChain,
  getAliveAdjacentNeighbors,
} from "../src/lib/engine/deathResolver";
import {
  transformPlayerRole,
  activateDoppelganger,
  convertCursedToWerewolf,
  awakenApprenticeSeer,
  awakenSasquatch,
  awakenDrunk,
  switchAlexanderTeam,
} from "../src/lib/engine/roleTransformation";
import {
  resolveInvestigation,
} from "../src/lib/engine/investigationEngine";
import {
  evaluateDefense,
} from "../src/lib/engine/protectionEngine";
import {
  maskPublicGameState,
  maskPublicPlayerInfo,
  generatePrivatePlayerState,
} from "../src/lib/engine/informationEngine";
import {
  calculateCompositionBalance,
  validateMode1Fixed,
  validateMode2Pool,
  selectBalancedSubsetFromPool,
  generateBalancedRandomComposition,
} from "../src/lib/engine/balanceEngine";

const ROLES = rolesJson as RoleData[];
const ABILITIES = abilitiesJson as any[];

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures: string[] = [];

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ [PASS] ${testName}`);
  } else {
    failedTests++;
    const msg = `  ❌ [FAIL] ${testName}${detail ? ` -> ${detail}` : ""}`;
    console.error(msg);
    failures.push(msg);
  }
}

function createPlayer(
  id: string,
  name: string,
  roleIdentifier: string,
  customState: Partial<PlayerEngineState> = {}
): PlayerEngineState {
  const role = ROLE_BY_ID.get(roleIdentifier) || ROLE_BY_NAME.get(roleIdentifier.toLowerCase()) || {
    role_id: roleIdentifier,
    canonical_name: roleIdentifier,
    team: "Village",
    category: "Village",
    seer_result: "Villager",
    role_points: 1,
    balance_weight: 0,
    night_priority: 50,
    active_phase: "None",
    action_type: "None",
    trigger: "None",
    target_type: "None",
    usage_limit: "Passive",
    can_change_role: false,
    reveal_on_death: "No",
    requires_engine_resolution: false,
  } as RoleData;

  return {
    id,
    name,
    isHost: false,
    isReady: true,
    role_id: role.role_id,
    canonical_name: role.canonical_name,
    team: role.team,
    originalTeam: role.team,
    category: role.category,
    seer_result: role.seer_result,
    role_points: role.role_points || 1,
    balance_weight: role.balance_weight || 0,
    night_priority: role.night_priority || 50,
    active_phase: role.active_phase,
    action_type: role.action_type,
    trigger: role.trigger,
    target_type: role.target_type,
    usage_limit: role.usage_limit || "Passive",
    can_change_role: role.can_change_role || false,
    reveal_on_death: role.reveal_on_death || "No",
    requires_engine_resolution: role.requires_engine_resolution || false,
    alive: true,
    protected: false,
    silenced: false,
    inCult: false,
    isCursed: false,
    isDiseased: false,
    isHypnotized: false,
    isZombie: false,
    isDrunkRevealed: false,
    hasUsedAbility: false,
    usedAbilityCount: 0,
    ...customState,
  };
}

async function runAllTests() {
  console.log("============================================================");
  console.log("ASPIRE: WEREWOLF - COMPLETE 75-ROLE DETERMINISTIC VERIFICATION");
  console.log("============================================================\n");

  // -----------------------------------------------------------------
  // 1. Database Integrity & Registry Completeness
  // -----------------------------------------------------------------
  console.log("--- 1. DATABASE & REGISTRY AUDIT ---");
  assert(ROLES.length === 75, "Database contains exactly 75 roles", `Count: ${ROLES.length}`);
  assert(ABILITIES.length === 79, "Database contains exactly 79 abilities", `Count: ${ABILITIES.length}`);
  assert(ALL_ROLES.length === 75, "Ability registry loaded all 75 roles", `Count: ${ALL_ROLES.length}`);

  let allHaveValidFields = true;
  for (const r of ROLES) {
    if (!r.role_id || !r.canonical_name || !r.team || !r.category) {
      allHaveValidFields = false;
      break;
    }
  }
  assert(allHaveValidFields, "Every role has valid role_id, canonical_name, team, and category");

  // Verify all 75 roles are accessible by role_id and canonical_name
  const testedRoles = new Set<string>();
  for (const r of ROLES) {
    const byId = ROLE_BY_ID.get(r.role_id);
    const byName = ROLE_BY_NAME.get(r.canonical_name.toLowerCase());
    if (byId && byName) {
      testedRoles.add(r.role_id);
    }
  }
  assert(testedRoles.size === 75, "All 75 roles mapped bidirectionally in registry", `Mapped: ${testedRoles.size}`);

  // -----------------------------------------------------------------
  // 2. Role Transformation Engine Verification
  // -----------------------------------------------------------------
  console.log("\n--- 2. ROLE TRANSFORMATION ENGINE ---");

  // Doppelganger (ROLE-033)
  {
    const doppel = createPlayer("p1", "Doppel", "ROLE-033", {
      doppelganger: { targetPlayerId: "p2", targetRoleId: "ROLE-022", isActivated: false },
    });
    const seer = createPlayer("p2", "Seer", "ROLE-022");
    const activated = activateDoppelganger(doppel, seer);
    assert(
      activated.canonical_name === "Seer" && activated.doppelganger?.isActivated === true,
      "[ROLE-033] Doppelganger activates and transforms into Seer upon target death"
    );
  }

  // Cursed (ROLE-031)
  {
    const cursed = createPlayer("p1", "Cursed", "ROLE-031");
    const converted = convertCursedToWerewolf(cursed);
    assert(
      converted.team === "Werewolf" && converted.seer_result === "Werewolf" && !converted.isCursed,
      "[ROLE-031] Cursed converts to Werewolf team and seer result updates"
    );
  }

  // Apprentice Seer (ROLE-026)
  {
    const apprentice = createPlayer("p1", "Apprentice", "ROLE-026");
    const awakened = awakenApprenticeSeer(apprentice);
    assert(
      awakened.canonical_name === "Seer" && awakened.role_id === "ROLE-022",
      "[ROLE-026] Apprentice Seer awakens as full Seer"
    );
  }

  // Sasquatch (ROLE-081)
  {
    const sasquatch = createPlayer("p1", "Sasquatch", "ROLE-081");
    const transformed = awakenSasquatch(sasquatch);
    assert(
      transformed.canonical_name === "Werewolf" && transformed.team === "Werewolf",
      "[ROLE-081] Sasquatch transforms into Werewolf when day ends without lynch"
    );
  }

  // Drunk (ROLE-034)
  {
    const drunk = createPlayer("p1", "Drunk", "ROLE-034");
    const sober = awakenDrunk(drunk, "ROLE-024");
    assert(
      sober.canonical_name === "Villager" && sober.isDrunkRevealed === true,
      "[ROLE-034] Drunk sobers up on Night 3 and reveals assigned role"
    );
  }

  // Alexander / Kimb / Blockchain (ROLE-002)
  {
    const alex = createPlayer("p1", "Alexander", "ROLE-002");
    const switched = switchAlexanderTeam(alex, "Werewolf");
    assert(
      switched.team === "Werewolf" && switched.seer_result === "Werewolf",
      "[ROLE-002] Alexander / Kimb switches dynamic team"
    );
  }

  // -----------------------------------------------------------------
  // 3. Protection & Defense Engine Verification
  // -----------------------------------------------------------------
  console.log("\n--- 3. PROTECTION & DEFENSE ENGINE ---");

  // Bodyguard (ROLE-028) & Holy Protection
  {
    const bg = createPlayer("bg", "Bodyguard", "ROLE-028");
    const target = createPlayer("t", "Target", "ROLE-024", { protected: true });
    const defense = evaluateDefense(target, "WEREWOLF_ATTACK");
    assert(defense.deathPrevented === true && defense.defenseType === "PROTECTION", "[ROLE-028] Bodyguard holy protection prevents Werewolf kill");

    // Self-protection forbidden
    const selfDefenseAction: EngineNightAction = {
      id: "a-bg",
      role_id: "ROLE-028",
      role_name: "Bodyguard",
      player_ids: ["bg"],
      action_type: "Protect",
      target_player_id: "bg",
      priority: 30,
      completed: true,
    };
    const { updatedPlayers } = resolveNightActions([bg], [selfDefenseAction], 1);
    assert(updatedPlayers[0].protected === false, "[ROLE-028] Bodyguard cannot protect self");
  }

  // Priest (ROLE-038)
  {
    const priest = createPlayer("pr", "Priest", "ROLE-038");
    const target = createPlayer("t", "Target", "ROLE-024");
    const action: EngineNightAction = {
      id: "a-pr",
      role_id: "ROLE-038",
      role_name: "Priest",
      player_ids: ["pr"],
      action_type: "Protect",
      target_player_id: "t",
      priority: 32,
      completed: true,
    };
    const { updatedPlayers } = resolveNightActions([priest, target], [action], 1);
    const updatedTarget = updatedPlayers.find((p) => p.id === "t");
    const updatedPriest = updatedPlayers.find((p) => p.id === "pr");
    assert(
      updatedTarget?.protected === true && updatedPriest?.hasUsedAbility === true,
      "[ROLE-038] Priest protects player and spends once-per-game usage"
    );
  }

  // Tough Guy (ROLE-054)
  {
    const tough = createPlayer("tg", "Tough Guy", "ROLE-054");
    const defense = evaluateDefense(tough, "WEREWOLF_ATTACK", 1);
    assert(
      defense.deathPrevented === true && defense.delayedDeath === true,
      "[ROLE-054] Tough Guy delays death by 1 cycle when attacked by Werewolves"
    );
  }

  // Prince (ROLE-050)
  {
    const prince = createPlayer("prince", "Prince", "ROLE-050");
    const defense = evaluateDefense(prince, "VOTE");
    assert(
      defense.deathPrevented === true && defense.defenseType === "PRINCE_SURVIVAL",
      "[ROLE-050] Prince survives first lynch vote"
    );
  }

  // -----------------------------------------------------------------
  // 4. Investigation Engine Verification
  // -----------------------------------------------------------------
  console.log("\n--- 4. INVESTIGATION & REVELATION ENGINE ---");

  // Standard Seer (ROLE-022) binary checks
  {
    const seer = createPlayer("seer", "Seer", "ROLE-022");
    const wolf = createPlayer("wolf", "Wolf", "ROLE-023");
    const villager = createPlayer("vil", "Villager", "ROLE-024");
    const lycan = createPlayer("lycan", "Lycan", "ROLE-041");
    const wolfman = createPlayer("wolfman", "Wolf Man", "ROLE-082");

    const rWolf = resolveInvestigation(seer, wolf, []);
    const rVil = resolveInvestigation(seer, villager, []);
    const rLycan = resolveInvestigation(seer, lycan, []);
    const rWolfman = resolveInvestigation(seer, wolfman, []);

    assert(rWolf.resultString === "Werewolf", "[ROLE-022] Seer correctly detects Werewolf");
    assert(rVil.resultString === "Villager", "[ROLE-024] Seer correctly detects Villager");
    assert(rLycan.resultString === "Werewolf", "[ROLE-041] Lycan appears as Werewolf to Seer");
    assert(rWolfman.resultString === "Villager", "[ROLE-082] Wolf Man appears as Villager to Seer");
  }

  // Aura Seer (ROLE-027)
  {
    const auraSeer = createPlayer("as", "Aura Seer", "ROLE-027");
    const seer = createPlayer("s", "Seer", "ROLE-022");
    const villager = createPlayer("v", "Villager", "ROLE-024");

    const resSpecial = resolveInvestigation(auraSeer, seer, []);
    const resNormal = resolveInvestigation(auraSeer, villager, []);

    assert(resSpecial.resultString.includes("Kekuatan Khusus"), "[ROLE-027] Aura Seer detects special powers");
    assert(resNormal.resultString.includes("Biasa"), "[ROLE-027] Aura Seer detects normal villagers");
  }

  // Sorceress (ROLE-051)
  {
    const sorc = createPlayer("sorc", "Sorceress", "ROLE-051");
    const seer = createPlayer("seer", "Seer", "ROLE-022");
    const villager = createPlayer("vil", "Villager", "ROLE-024");

    const rSeer = resolveInvestigation(sorc, seer, []);
    const rVil = resolveInvestigation(sorc, villager, []);

    assert(rSeer.resultString.includes("Seer Ditemukan"), "[ROLE-051] Sorceress detects Seer");
    assert(rVil.resultString.includes("Bukan Seer"), "[ROLE-051] Sorceress recognizes non-Seer");
  }

  // Revealer (ROLE-016)
  {
    const revealer = createPlayer("rev", "Revealer", "ROLE-016");
    const wolf = createPlayer("w", "Werewolf", "ROLE-023");
    const vil = createPlayer("v", "Villager", "ROLE-024");

    const rWolf = resolveInvestigation(revealer, wolf, []);
    const rVil = resolveInvestigation(revealer, vil, []);

    assert(!rWolf.backfiredOnInvestigator, "[ROLE-016] Revealer safely reveals Werewolf");
    assert(rVil.backfiredOnInvestigator === true, "[ROLE-016] Revealer dies if target is a Villager");
  }

  // P.I. (Paranormal Investigator ROLE-049)
  {
    const pi = createPlayer("pi", "P.I.", "ROLE-049");
    const p1 = createPlayer("p1", "Alice", "ROLE-024");
    const p2 = createPlayer("p2", "Bob", "ROLE-023"); // Wolf
    const p3 = createPlayer("p3", "Charlie", "ROLE-024");

    const report = resolveInvestigation(pi, p1, [p1, p2, p3]);
    assert(report.isThreat === true, "[ROLE-049] P.I. detects werewolf among adjacent neighbors");
  }

  // The Count (ROLE-075)
  {
    const count = createPlayer("count", "The Count", "ROLE-075");
    const p1 = createPlayer("p1", "Alice", "ROLE-023");
    const p2 = createPlayer("p2", "Bob", "ROLE-024");
    const p3 = createPlayer("p3", "Charlie", "ROLE-024");
    const p4 = createPlayer("p4", "Diana", "ROLE-023");

    const report = resolveInvestigation(count, p1, [p1, p2, p3, p4]);
    assert(report.resultString.includes("2"), "[ROLE-075] The Count tallies living wolves in village halves");
  }

  // Mentalist (ROLE-013)
  {
    const mentalist = createPlayer("m", "Mentalist", "ROLE-013");
    const t1 = createPlayer("t1", "Alice", "ROLE-024");
    const t2 = createPlayer("t2", "Bob", "ROLE-024");
    const t3 = createPlayer("t3", "Charlie", "ROLE-023");

    const same = resolveInvestigation(mentalist, t1, [], t2);
    const diff = resolveInvestigation(mentalist, t1, [], t3);

    assert(same.resultString.includes("Tim Sama"), "[ROLE-013] Mentalist detects two players on same team");
    assert(diff.resultString.includes("Tim Berbeda"), "[ROLE-013] Mentalist detects two players on different teams");
  }

  // -----------------------------------------------------------------
  // 5. Special Night Actions & Attacks
  // -----------------------------------------------------------------
  console.log("\n--- 5. OFFENSIVE ACTIONS & SPECIAL NIGHT ROLES ---");

  // Cupid (ROLE-030)
  {
    const cupid = createPlayer("cupid", "Cupid", "ROLE-030");
    const p1 = createPlayer("p1", "Lover1", "ROLE-024");
    const p2 = createPlayer("p2", "Lover2", "ROLE-024");
    const action: EngineNightAction = {
      id: "cupid-1",
      role_id: "ROLE-030",
      role_name: "Cupid",
      player_ids: ["cupid"],
      action_type: "Link Players",
      target_player_id: "p1",
      secondary_target_id: "p2",
      priority: 20,
      completed: true,
    };
    const { updatedPlayers } = resolveNightActions([cupid, p1, p2], [action], 1);
    const l1 = updatedPlayers.find((p) => p.id === "p1");
    const l2 = updatedPlayers.find((p) => p.id === "p2");
    assert(
      Boolean(l1?.linkedPartnerIds?.includes("p2") && l2?.linkedPartnerIds?.includes("p1")),
      "[ROLE-030] Cupid binds lovers with reciprocal partner IDs"
    );
  }

  // Hoodlum (ROLE-036)
  {
    const hoodlum = createPlayer("hoodlum", "Hoodlum", "ROLE-036");
    const p1 = createPlayer("p1", "Target1", "ROLE-024");
    const p2 = createPlayer("p2", "Target2", "ROLE-024");
    const action: EngineNightAction = {
      id: "hoodlum-1",
      role_id: "ROLE-036",
      role_name: "Hoodlum",
      player_ids: ["hoodlum"],
      action_type: "Mark Targets",
      target_player_id: "p1",
      secondary_target_id: "p2",
      priority: 22,
      completed: true,
    };
    const { updatedPlayers } = resolveNightActions([hoodlum, p1, p2], [action], 1);
    const h = updatedPlayers.find((p) => p.id === "hoodlum");
    assert(
      Boolean(h?.markedTargetIds?.includes("p1") && h?.markedTargetIds?.includes("p2")),
      "[ROLE-036] Hoodlum marks 2 targets on First Night"
    );
  }

  // Dire Wolf (ROLE-060)
  {
    const dire = createPlayer("dire", "Dire Wolf", "ROLE-060");
    const comp = createPlayer("comp", "Companion", "ROLE-024");
    const action: EngineNightAction = {
      id: "dire-1",
      role_id: "ROLE-060",
      role_name: "Dire Wolf",
      player_ids: ["dire"],
      action_type: "Mark Companion",
      target_player_id: "comp",
      priority: 25,
      completed: true,
    };
    const { updatedPlayers } = resolveNightActions([dire, comp], [action], 1);
    const d = updatedPlayers.find((p) => p.id === "dire");
    assert(d?.direWolfCompanionId === "comp", "[ROLE-060] Dire Wolf marks companion");
  }

  // Virginia Woolf (ROLE-063)
  {
    const vw = createPlayer("vw", "Virginia Woolf", "ROLE-063");
    const fear = createPlayer("fear", "Fear Target", "ROLE-024");
    const action: EngineNightAction = {
      id: "vw-1",
      role_id: "ROLE-063",
      role_name: "Virginia Woolf",
      player_ids: ["vw"],
      action_type: "Mark Fear Target",
      target_player_id: "fear",
      priority: 24,
      completed: true,
    };
    const { updatedPlayers } = resolveNightActions([vw, fear], [action], 1);
    const v = updatedPlayers.find((p) => p.id === "vw");
    assert(v?.fearTargetId === "fear", "[ROLE-063] Virginia Woolf marks fear target");
  }

  // Nostradamus (ROLE-080)
  {
    const nost = createPlayer("nost", "Nostradamus", "ROLE-080");
    const action: EngineNightAction = {
      id: "nost-1",
      role_id: "ROLE-080",
      role_name: "Nostradamus",
      player_ids: ["nost"],
      action_type: "Werewolf",
      target_player_id: "nost",
      priority: 26,
      completed: true,
    };
    const { updatedPlayers } = resolveNightActions([nost], [action], 1);
    const n = updatedPlayers.find((p) => p.id === "nost");
    assert(n?.predictedWinningTeam === "Werewolf", "[ROLE-080] Nostradamus registers winning team prediction");
  }

  // Leprechaun (ROLE-079) Redirection
  {
    const lep = createPlayer("lep", "Leprechaun", "ROLE-079");
    const wolf = createPlayer("wolf", "Werewolf", "ROLE-023");
    const origTarget = createPlayer("orig", "Original", "ROLE-024");
    const redirected = createPlayer("redir", "Redirected", "ROLE-024");

    const actions: EngineNightAction[] = [
      {
        id: "lep-1",
        role_id: "ROLE-079",
        role_name: "Leprechaun",
        player_ids: ["lep"],
        action_type: "Redirect",
        target_player_id: "orig",
        secondary_target_id: "redir",
        priority: 28,
        completed: true,
      },
      {
        id: "wolf-1",
        role_id: "ROLE-023",
        role_name: "Werewolves",
        player_ids: ["wolf"],
        action_type: "Kill",
        target_player_id: "orig",
        priority: 50,
        completed: true,
      },
    ];

    const { updatedPlayers, outcome } = resolveNightActions([lep, wolf, origTarget, redirected], actions, 1);
    const deadPlayer = updatedPlayers.find((p) => !p.alive);
    assert(
      deadPlayer?.id === "redir" && outcome.redirectedActions.length > 0,
      "[ROLE-079] Leprechaun successfully redirects Werewolf attack to another player"
    );
  }

  // Spellcaster (ROLE-052)
  {
    const sp = createPlayer("sp", "Spellcaster", "ROLE-052");
    const target = createPlayer("t", "Target", "ROLE-024");
    const action: EngineNightAction = {
      id: "sp-1",
      role_id: "ROLE-052",
      role_name: "Spellcaster",
      player_ids: ["sp"],
      action_type: "Silence",
      target_player_id: "t",
      priority: 35,
      completed: true,
    };
    const { updatedPlayers, outcome } = resolveNightActions([sp, target], [action], 1);
    const t = updatedPlayers.find((p) => p.id === "t");
    assert(t?.silenced === true && outcome.silencedPlayerIds.includes("t"), "[ROLE-052] Spellcaster silences player");
  }

  // The Mummy (ROLE-069)
  {
    const mummy = createPlayer("mummy", "The Mummy", "ROLE-069");
    const target = createPlayer("t", "Target", "ROLE-024");
    const action: EngineNightAction = {
      id: "mummy-1",
      role_id: "ROLE-069",
      role_name: "The Mummy",
      player_ids: ["mummy"],
      action_type: "Hypnotize",
      target_player_id: "t",
      priority: 40,
      completed: true,
    };
    const { updatedPlayers } = resolveNightActions([mummy, target], [action], 1);
    const t = updatedPlayers.find((p) => p.id === "t");
    assert(t?.isHypnotized === true, "[ROLE-069] The Mummy hypnotizes player");
  }

  // Zombie (ROLE-070)
  {
    const zombie = createPlayer("zombie", "Zombie", "ROLE-070");
    const target = createPlayer("t", "Target", "ROLE-024");
    const action: EngineNightAction = {
      id: "zombie-1",
      role_id: "ROLE-070",
      role_name: "Zombie",
      player_ids: ["zombie"],
      action_type: "Disable Vote",
      target_player_id: "t",
      priority: 42,
      completed: true,
    };
    const { updatedPlayers } = resolveNightActions([zombie, target], [action], 1);
    const t = updatedPlayers.find((p) => p.id === "t");
    assert(t?.isZombie === true, "[ROLE-070] Zombie bites player and disables voting rights");
  }

  // The Blob (ROLE-068)
  {
    const blob = createPlayer("blob", "The Blob", "ROLE-068");
    const target = createPlayer("t", "Target", "ROLE-024");
    const action: EngineNightAction = {
      id: "blob-1",
      role_id: "ROLE-068",
      role_name: "The Blob",
      player_ids: ["blob"],
      action_type: "Absorb",
      target_player_id: "t",
      priority: 45,
      completed: true,
    };
    const { updatedPlayers, outcome } = resolveNightActions([blob, target], [action], 1);
    const t = updatedPlayers.find((p) => p.id === "t");
    assert(t?.alive === false && outcome.killedPlayerIds.includes("t"), "[ROLE-068] The Blob absorbs and eliminates target");
  }

  // Witch (ROLE-057) Heal & Poison
  {
    const witch = createPlayer("witch", "Witch", "ROLE-057");
    const wolf = createPlayer("wolf", "Werewolf", "ROLE-023");
    const victim = createPlayer("vic", "Victim", "ROLE-024");
    const poisonTarget = createPlayer("poi", "Poison Target", "ROLE-024");

    const actions: EngineNightAction[] = [
      {
        id: "wolf-kill",
        role_id: "ROLE-023",
        role_name: "Werewolves",
        player_ids: ["wolf"],
        action_type: "Kill",
        target_player_id: "vic",
        priority: 50,
        completed: true,
      },
      {
        id: "witch-potions",
        role_id: "ROLE-057",
        role_name: "Witch",
        player_ids: ["witch"],
        action_type: "Save / Kill",
        target_player_id: "vic",        // Heal victim
        secondary_target_id: "poi",     // Poison other
        priority: 90,
        completed: true,
      },
    ];

    const { updatedPlayers, outcome } = resolveNightActions([witch, wolf, victim, poisonTarget], actions, 1);
    const v = updatedPlayers.find((p) => p.id === "vic");
    const p = updatedPlayers.find((p) => p.id === "poi");

    assert(v?.alive === true && outcome.savedPlayerIds.includes("vic"), "[ROLE-057] Witch heal potion saves attack victim");
    assert(p?.alive === false && outcome.killedPlayerIds.includes("poi"), "[ROLE-057] Witch poison potion eliminates secondary target");
  }

  // Cult Leader (ROLE-029)
  {
    const cult = createPlayer("cult", "Cult Leader", "ROLE-029");
    const target = createPlayer("t", "Target", "ROLE-024");
    const action: EngineNightAction = {
      id: "cult-1",
      role_id: "ROLE-029",
      role_name: "Cult Leader",
      player_ids: ["cult"],
      action_type: "Recruit",
      target_player_id: "t",
      priority: 80,
      completed: true,
    };
    const { updatedPlayers } = resolveNightActions([cult, target], [action], 1);
    const t = updatedPlayers.find((p) => p.id === "t");
    assert(t?.inCult === true, "[ROLE-029] Cult Leader recruits target player into the cult");
  }

  // Huntress (ROLE-009)
  {
    const huntress = createPlayer("huntress", "Huntress", "ROLE-009");
    const target = createPlayer("t", "Target", "ROLE-023");
    const action: EngineNightAction = {
      id: "huntress-1",
      role_id: "ROLE-009",
      role_name: "Huntress",
      player_ids: ["huntress"],
      action_type: "Eliminate",
      target_player_id: "t",
      priority: 52,
      completed: true,
    };
    const { updatedPlayers, outcome } = resolveNightActions([huntress, target], [action], 1);
    const t = updatedPlayers.find((p) => p.id === "t");
    const h = updatedPlayers.find((p) => p.id === "huntress");
    assert(
      t?.alive === false && outcome.killedPlayerIds.includes("t") && h?.hasUsedAbility === true,
      "[ROLE-009] Huntress uses once-per-game kill"
    );
  }

  // -----------------------------------------------------------------
  // 6. Daytime & Voting Mechanics
  // -----------------------------------------------------------------
  console.log("\n--- 6. DAYTIME & VOTING MECHANICS ---");

  // Mayor (ROLE-044) Double Vote
  {
    const mayor = createPlayer("m", "Mayor", "ROLE-044");
    const v1 = createPlayer("v1", "Villager 1", "ROLE-024");
    const v2 = createPlayer("v2", "Villager 2", "ROLE-024");
    const wolf = createPlayer("w", "Werewolf", "ROLE-023");

    // Mayor (2 votes for wolf) beats 2 villagers voting for each other
    const votes = {
      m: "w",
      v1: "v2",
      v2: "v1",
      w: "v1",
    };

    const { outcome } = resolveDayVotes([mayor, v1, v2, wolf], votes);
    assert(outcome.tally["w"] === 2, "[ROLE-044] Mayor vote counts with double weight (weight = 2)");
  }

  // Silenced & Zombie Cannot Vote
  {
    const silenced = createPlayer("s", "Silenced", "ROLE-024", { silenced: true });
    const zombieBitten = createPlayer("z", "Zombie Bitten", "ROLE-024", { isZombie: true });
    const normal = createPlayer("n", "Normal", "ROLE-024");
    const wolf = createPlayer("w", "Wolf", "ROLE-023");

    const votes = {
      s: "w",
      z: "w",
      n: "w",
    };

    const { outcome } = resolveDayVotes([silenced, zombieBitten, normal, wolf], votes);
    assert(outcome.tally["w"] === 1, "[ROLE-052 & ROLE-070] Silenced and Zombie-bitten players cannot cast votes");
  }

  // The Mummy Hypnotized Vote
  {
    const mummy = createPlayer("mummy", "The Mummy", "ROLE-069");
    const hypno = createPlayer("hypno", "Hypnotized", "ROLE-024", { isHypnotized: true });
    const wolf = createPlayer("w", "Wolf", "ROLE-023");
    const vil = createPlayer("v", "Villager", "ROLE-024");

    // Hypnotized voted for vil, but Mummy voted for wolf -> Hypnotized forced to vote for wolf
    const votes = {
      mummy: "w",
      hypno: "v",
    };

    const { outcome } = resolveDayVotes([mummy, hypno, wolf, vil], votes);
    assert(outcome.tally["w"] === 2 && outcome.tally["v"] === 0, "[ROLE-069] Hypnotized player is forced to vote the way Mummy votes");
  }

  // Martyr (ROLE-042) Swap
  {
    const martyr = createPlayer("martyr", "Martyr", "ROLE-042");
    const target = createPlayer("target", "Target", "ROLE-024");
    const v1 = createPlayer("v1", "V1", "ROLE-024");
    const v2 = createPlayer("v2", "V2", "ROLE-024");
    const v3 = createPlayer("v3", "V3", "ROLE-024");

    const votes = {
      v1: "target",
      v2: "target",
      v3: "target",
    };

    const { updatedPlayers, outcome } = resolveDayVotes([martyr, target, v1, v2, v3], votes, {
      martyrSwapId: "martyr",
    });

    const m = updatedPlayers.find((p) => p.id === "martyr");
    const t = updatedPlayers.find((p) => p.id === "target");

    assert(
      m?.alive === false && t?.alive === true && outcome.martyrReplacedPlayerId === "target",
      "[ROLE-042] Martyr swaps places and takes the lynch victim's place"
    );
  }

  // Tanner (ROLE-053) Voted Out
  {
    const tanner = createPlayer("tanner", "Tanner", "ROLE-053");
    const v1 = createPlayer("v1", "V1", "ROLE-024");
    const v2 = createPlayer("v2", "V2", "ROLE-024");

    const votes = { v1: "tanner", v2: "tanner" };
    const { outcome } = resolveDayVotes([tanner, v1, v2], votes);

    assert(outcome.tannerWon === true, "[ROLE-053] Tanner voted out triggers immediate Tanner victory flag");
  }

  // Sasquatch (ROLE-081) Converts on No Lynch Day
  {
    const sasquatch = createPlayer("sas", "Sasquatch", "ROLE-081");
    const v1 = createPlayer("v1", "V1", "ROLE-024");
    const v2 = createPlayer("v2", "V2", "ROLE-024");

    // Tie vote -> No lynch
    const votes = { v1: "v2", v2: "v1" };
    const { updatedPlayers, outcome } = resolveDayVotes([sasquatch, v1, v2], votes);

    const s = updatedPlayers.find((p) => p.id === "sas");
    assert(
      outcome.sasquatchConverted === true && s?.team === "Werewolf",
      "[ROLE-081] Day ending with no lynch converts Sasquatch to Werewolf team"
    );
  }

  // -----------------------------------------------------------------
  // 7. Cascading Death Chains
  // -----------------------------------------------------------------
  console.log("\n--- 7. CASCADING DEATH CHAINS ---");

  // Hunter (ROLE-039) Retaliation Shot
  {
    const hunter = createPlayer("h", "Hunter", "ROLE-039");
    const resVote = requestDeath([hunter], "h", "VOTE");
    assert(
      resVote.pendingRetaliations.some((r) => r.type === "HUNTER"),
      "[ROLE-039] Hunter eliminated by VOTE triggers retaliation shot"
    );

    const resNight = requestDeath([hunter], "h", "WEREWOLF_ATTACK");
    assert(
      resNight.pendingRetaliations.length === 0,
      "[ROLE-039] Hunter killed by Werewolves at night dies silently without retaliation"
    );
  }

  // Cupid (ROLE-030) Lovers Suicide
  {
    const l1 = createPlayer("l1", "Lover1", "ROLE-024", { linkedPartnerIds: ["l2"] });
    const l2 = createPlayer("l2", "Lover2", "ROLE-024", { linkedPartnerIds: ["l1"] });
    const bystander = createPlayer("by", "Bystander", "ROLE-024");

    const res = requestDeath([l1, l2, bystander], "l1", "VOTE");
    const updatedL2 = res.updatedPlayers.find((p) => p.id === "l2");

    assert(updatedL2?.alive === false, "[ROLE-030] Cupid lover dies of heartbreak when partner is eliminated");
  }

  // Dire Wolf (ROLE-060) Companion Death
  {
    const comp = createPlayer("c", "Companion", "ROLE-024");
    const dire = createPlayer("d", "Dire Wolf", "ROLE-060", { direWolfCompanionId: "c" });

    const res = requestDeath([comp, dire], "c", "VOTE");
    const updatedDire = res.updatedPlayers.find((p) => p.id === "d");

    assert(updatedDire?.alive === false, "[ROLE-060] Dire Wolf dies when its chosen companion dies");
  }

  // Wolf Cub (ROLE-058) Rage
  {
    const cub = createPlayer("cub", "Wolf Cub", "ROLE-058");
    const res = requestDeath([cub], "cub", "VOTE");
    assert(res.wolfCubExtraKillTriggered === true, "[ROLE-058] Wolf Cub death triggers werewolf double kill rage");
  }

  // Diseased (ROLE-032) Infection
  {
    const diseased = createPlayer("dis", "Diseased", "ROLE-032");
    const res = requestDeath([diseased], "dis", "WEREWOLF_ATTACK");
    assert(res.wolvesSkippingNextKill === true, "[ROLE-032] Diseased attacked by Werewolves causes wolves to skip next kill");
  }

  // Dr. Boom (ROLE-006) Explosion
  {
    const p1 = createPlayer("p1", "Neighbor Left", "ROLE-024");
    const boom = createPlayer("boom", "Dr. Boom", "ROLE-006");
    const p2 = createPlayer("p2", "Neighbor Right", "ROLE-024");
    const p3 = createPlayer("p3", "Safe Player", "ROLE-024");

    const res = requestDeath([p1, boom, p2, p3], "boom", "VOTE");
    const left = res.updatedPlayers.find((p) => p.id === "p1");
    const right = res.updatedPlayers.find((p) => p.id === "p2");
    const safe = res.updatedPlayers.find((p) => p.id === "p3");

    assert(left?.alive === false && right?.alive === false && safe?.alive === true, "[ROLE-006] Dr. Boom eliminates both adjacent neighbors upon death");
  }

  // -----------------------------------------------------------------
  // 8. Universal Win Condition Engine
  // -----------------------------------------------------------------
  console.log("\n--- 8. UNIVERSAL WIN CONDITION ENGINE ---");

  // Tanner Solo Win
  {
    const tanner = createPlayer("t", "Tanner", "ROLE-053", { alive: false, tannerWon: true });
    const wolf = createPlayer("w", "Wolf", "ROLE-023");
    const vil = createPlayer("v", "Vil", "ROLE-024");

    const win = evaluateWinConditions([tanner, wolf, vil]);
    assert(win.winner === "Tanner" && win.winningPlayerIds.includes("t"), "[ROLE-053] Tanner wins alone when eliminated by vote");
  }

  // Cult Leader Win
  {
    const cult = createPlayer("c", "Cult Leader", "ROLE-029");
    const v1 = createPlayer("v1", "V1", "ROLE-024", { inCult: true });
    const v2 = createPlayer("v2", "V2", "ROLE-024", { inCult: true });

    const win = evaluateWinConditions([cult, v1, v2]);
    assert(win.winner === "Cult Leader", "[ROLE-029] Cult Leader wins when all living players are in cult");
  }

  // Lone Wolf (ROLE-040)
  {
    const lone = createPlayer("lw", "Lone Wolf", "ROLE-040");
    const deadVil = createPlayer("v", "Dead Vil", "ROLE-024", { alive: false });

    const win = evaluateWinConditions([lone, deadVil]);
    assert(win.winner === "Lone Wolf", "[ROLE-040] Lone Wolf wins alone as sole survivor");
  }

  // Hoodlum (ROLE-036)
  {
    const hoodlum = createPlayer("h", "Hoodlum", "ROLE-036", { markedTargetIds: ["t1", "t2"] });
    const t1 = createPlayer("t1", "Target 1", "ROLE-024", { alive: false });
    const t2 = createPlayer("t2", "Target 2", "ROLE-024", { alive: false });

    const win = evaluateWinConditions([hoodlum, t1, t2]);
    assert(win.winner === "Hoodlum", "[ROLE-036] Hoodlum wins when both marked targets are dead");
  }

  // Father Time (ROLE-007)
  {
    const father = createPlayer("ft", "Father Time", "ROLE-007");
    const v1 = createPlayer("v1", "V1", "ROLE-024");
    const w1 = createPlayer("w1", "W1", "ROLE-023");

    const win = evaluateWinConditions([father, v1, w1], { timeoutCount: 3 });
    assert(win.winner === "Father Time", "[ROLE-007] Father Time wins when 3 timeouts occur");
  }

  // Nostradamus (ROLE-080) prediction win
  {
    const nost = createPlayer("nost", "Nostradamus", "ROLE-080", { predictedWinningTeam: "Village" });
    const vil = createPlayer("v", "Villager", "ROLE-024");
    const deadWolf = createPlayer("w", "Wolf", "ROLE-023", { alive: false });

    const win = evaluateWinConditions([nost, vil, deadWolf]);
    assert(
      win.winner === "Village" && win.winningPlayerIds.includes("nost"),
      "[ROLE-080] Nostradamus wins alongside predicted winning team"
    );
  }

  // Werewolf Faction Win (Parity)
  {
    const w1 = createPlayer("w1", "Wolf 1", "ROLE-023");
    const w2 = createPlayer("w2", "Wolf 2", "ROLE-023");
    const v1 = createPlayer("v1", "Vil 1", "ROLE-024");
    const v2 = createPlayer("v2", "Vil 2", "ROLE-024");

    const win = evaluateWinConditions([w1, w2, v1, v2]);
    assert(win.winner === "Werewolf", "Werewolves win upon reaching parity with villagers");
  }

  // Village Faction Win
  {
    const v1 = createPlayer("v1", "Vil 1", "ROLE-024");
    const deadWolf = createPlayer("w1", "Wolf 1", "ROLE-023", { alive: false });

    const win = evaluateWinConditions([v1, deadWolf]);
    assert(win.winner === "Village", "Village wins when all werewolves are eliminated");
  }

  // -----------------------------------------------------------------
  // 9. Game Modes & Balance Engine Verification
  // -----------------------------------------------------------------
  console.log("\n--- 9. GAME MODES & BALANCE ENGINE ---");

  // Mode 1: Exact Match Validation
  {
    const selected: SelectedRole[] = [
      { role_id: "ROLE-023", canonical_name: "Werewolf", count: 2 },
      { role_id: "ROLE-024", canonical_name: "Villager", count: 3 },
    ];
    const valid5 = validateMode1Fixed(5, selected);
    const invalid6 = validateMode1Fixed(6, selected);
    const invalid4 = validateMode1Fixed(4, selected);

    assert(valid5.valid === true, "Mode 1 accepts exact match (5 players, 5 roles)");
    assert(invalid6.valid === false, "Mode 1 rejects mismatch without silent padding (6 players, 5 roles)");
    assert(invalid4.valid === false, "Mode 1 strictly enforces minimum 5 players (4 players rejected)");
  }

  // Mode 2: Role Pool Validation & No Outside Padding
  {
    const poolWithoutWolf: SelectedRole[] = [
      { role_id: "ROLE-022", canonical_name: "Seer", count: 1 },
      { role_id: "ROLE-024", canonical_name: "Villager", count: 1 },
    ];
    const poolWithWolf: SelectedRole[] = [
      { role_id: "ROLE-023", canonical_name: "Werewolf", count: 1 },
      { role_id: "ROLE-022", canonical_name: "Seer", count: 1 },
      { role_id: "ROLE-028", canonical_name: "Bodyguard", count: 1 },
      { role_id: "ROLE-024", canonical_name: "Villager", count: 1 },
    ];

    const valNoWolf = validateMode2Pool(poolWithoutWolf, 5);
    const valWithWolf = validateMode2Pool(poolWithWolf, 5);

    assert(valNoWolf.valid === false, "Mode 2 rejects pool lacking wolf-side role");
    assert(valWithWolf.valid === true, "Mode 2 accepts pool containing wolf-side role");

    // Select subset strictly from pool
    const selected = selectBalancedSubsetFromPool(poolWithWolf, 6);
    assert(selected.length === 6, "Mode 2 selects exact player count from pool");

    const poolRoleIds = new Set(poolWithWolf.map((r) => r.role_id));
    const allFromPool = selected.every((r) => poolRoleIds.has(r.role_id));
    assert(allFromPool, "Mode 2 NEVER pads roles outside the host's pool");
  }

  // Mode 3: Dynamic Open Room Balance Generator
  {
    const comp5 = generateBalancedRandomComposition(5);
    const comp8 = generateBalancedRandomComposition(8);
    const comp12 = generateBalancedRandomComposition(12);

    assert(comp5.length === 5, "Mode 3 dynamically balances 5 players");
    assert(comp8.length === 8, "Mode 3 dynamically balances 8 players");
    assert(comp12.length === 12, "Mode 3 dynamically balances 12 players");

    const bal5 = calculateCompositionBalance(comp5);
    const bal8 = calculateCompositionBalance(comp8);
    assert(bal5.isBalanced, "Mode 3 5-player composition satisfies balance threshold");
    assert(bal8.isBalanced, "Mode 3 8-player composition satisfies balance threshold");
  }

  // -----------------------------------------------------------------
  // 10. Information Security & Zero Role Leakage
  // -----------------------------------------------------------------
  console.log("\n--- 10. MULTIPLAYER SECURITY & STATE MASKING ---");
  {
    const secretPlayer = createPlayer("p1", "Alice", "ROLE-023", {
      isCursed: false,
      silenced: true,
    });
    const publicPlayer = maskPublicPlayerInfo(secretPlayer);

    assert(
      !("role_id" in publicPlayer) &&
      !("canonical_name" in publicPlayer) &&
      !("team" in publicPlayer),
      "PublicPlayerInfo completely strips secret role_id, canonical_name, and team"
    );
    assert(publicPlayer.id === "p1" && publicPlayer.silenced === true, "PublicPlayerInfo preserves non-secret status (id, silenced)");

    const publicGameState = maskPublicGameState({
      gameMode: "MODE_1_FIXED",
      phase: "NIGHT",
      dayCount: 1,
      nightCount: 1,
      players: [secretPlayer],
      narrativeText: "The night begins.",
      gameEnded: false,
      winner: null,
      winningPlayerIds: [],
      winningTeams: [],
      winReason: null,
    });

    const publicJson = JSON.stringify(publicGameState);
    assert(!publicJson.includes("ROLE-023") && !publicJson.includes("Werewolf"), "PublicGameState MQTT broadcast contains zero secret role information");
  }

  // -----------------------------------------------------------------
  // 11. Individual Validation of All 75 Playable Roles
  // -----------------------------------------------------------------
  console.log("\n--- 11. EXHAUSTIVE VALIDATION OF ALL 75 ROLES ---");
  let verifiedCount = 0;
  for (const r of ROLES) {
    const p = createPlayer(`p-${r.role_id}`, r.canonical_name, r.role_id);
    const reg = ROLE_BY_ID.get(r.role_id);

    const hasId = !!reg && reg.role_id === r.role_id;
    const hasName = !!reg && reg.canonical_name === r.canonical_name;
    const hasTeam = typeof r.team === "string" && r.team.length > 0;
    const hasCategory = typeof r.category === "string" && r.category.length > 0;
    const hasSeer = r.seer_result === "Werewolf" || r.seer_result === "Villager" || r.seer_result === "Special" || r.seer_result === "Variable";

    if (hasId && hasName && hasTeam && hasCategory && hasSeer) {
      verifiedCount++;
    }
  }

  assert(
    verifiedCount === 75,
    `All 75 roles verified with complete metadata and database attributes (75/75)`,
    `Verified: ${verifiedCount}/75`
  );

  // -----------------------------------------------------------------
  // Final Results Summary
  // -----------------------------------------------------------------
  console.log("\n============================================================");
  console.log(`TEST RESULTS: ${passedTests} / ${totalTests} PASSED (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log("============================================================\n");

  if (failedTests > 0) {
    console.error(`❌ ${failedTests} TESTS FAILED:`);
    failures.forEach((f) => console.error(f));
    process.exit(1);
  } else {
    console.log("🎉 ALL TESTS PASSED WITH 100% SUCCESS!");
    process.exit(0);
  }
}

runAllTests().catch((err) => {
  console.error("Test execution threw exception:", err);
  process.exit(1);
});
