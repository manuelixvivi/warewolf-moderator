import {
  auditGenerateBalancedRandomComposition,
  auditSelectBalancedSubsetFromPool,
  validateMode2Pool,
} from "../src/lib/engine/balanceEngine";
import { ALL_ROLES } from "../src/lib/engine/abilityRegistry";

console.log("==================================================");
console.log("MODE 3 DYNAMIC BALANCING AUDIT (5 to 20 Players)");
console.log("==================================================");

const testCounts = [5, 6, 7, 8, 9, 10, 12, 15, 20];
for (const count of testCounts) {
  const res = auditGenerateBalancedRandomComposition(count);
  const roleNames = res.selected.map((r) => r.canonical_name);
  const rejectedCount = res.candidateLog.filter((c) => !c.valid).length;
  const acceptedCount = res.candidateLog.filter((c) => c.valid).length;

  console.log(
    `[Count: ${count}] Evals: ${res.evaluationsCount} (Accepted: ${acceptedCount}, Rejected: ${rejectedCount}) | Best Score: ${res.bestScore}`
  );
  console.log(`  Selected (${roleNames.length} roles): ${roleNames.join(", ")}`);
  
  if (rejectedCount > 0) {
    const sampleReject = res.candidateLog.find((c) => !c.valid);
    console.log(`  Sample Rejection Reason: "${sampleReject?.reason}" (Roles: ${sampleReject?.roles.slice(0, 4).join(", ")}...)`);
  }
}

console.log("\n==================================================");
console.log("MODE 2 ROLE POOL SELECTION & EDGE CASES AUDIT");
console.log("==================================================");

// Edge Case 1: Pool without wolf (must be rejected)
const villageOnlyPool = [
  { role_id: "ROLE-022", canonical_name: "Seer", count: 1 },
  { role_id: "ROLE-028", canonical_name: "Bodyguard", count: 1 },
  { role_id: "ROLE-024", canonical_name: "Villager", count: 1 },
  { role_id: "ROLE-039", canonical_name: "Hunter", count: 1 },
  { role_id: "ROLE-050", canonical_name: "Prince", count: 1 },
];
const v1 = validateMode2Pool(villageOnlyPool, 5);
console.log(`Pool without wolf rejected: ${!v1.valid} (Error: "${v1.error}")`);

// Edge Case 2: Pool with only 1 wolf and multiple villagers
const singleWolfPool = [
  { role_id: "ROLE-023", canonical_name: "Werewolf", count: 1 },
  { role_id: "ROLE-022", canonical_name: "Seer", count: 1 },
  { role_id: "ROLE-028", canonical_name: "Bodyguard", count: 1 },
  { role_id: "ROLE-024", canonical_name: "Villager", count: 1 },
  { role_id: "ROLE-039", canonical_name: "Hunter", count: 1 },
  { role_id: "ROLE-050", canonical_name: "Prince", count: 1 },
  { role_id: "ROLE-044", canonical_name: "Mayor", count: 1 },
];
const m2Res1 = auditSelectBalancedSubsetFromPool(singleWolfPool, 5);
console.log(
  `Pool with 1 wolf -> Selected 5: [${m2Res1.selected.map((r) => r.canonical_name).join(", ")}] | Score: ${m2Res1.bestScore}`
);

// Edge Case 3: Pool with neutral roles
const neutralHeavyPool = [
  { role_id: "ROLE-023", canonical_name: "Werewolf", count: 1 },
  { role_id: "ROLE-003", canonical_name: "Alpha Wolf", count: 1 },
  { role_id: "ROLE-053", canonical_name: "Tanner", count: 1 },
  { role_id: "ROLE-029", canonical_name: "Cult Leader", count: 1 },
  { role_id: "ROLE-036", canonical_name: "Hoodlum", count: 1 },
  { role_id: "ROLE-022", canonical_name: "Seer", count: 1 },
  { role_id: "ROLE-024", canonical_name: "Villager", count: 1 },
  { role_id: "ROLE-028", canonical_name: "Bodyguard", count: 1 },
];
const neutralPoolAllowed = new Set(neutralHeavyPool.map((r) => r.role_id));
for (const pCount of [5, 6, 8]) {
  const m2Res2 = auditSelectBalancedSubsetFromPool(neutralHeavyPool, pCount);
  const selectedNames = m2Res2.selected.map((r) => r.canonical_name);
  if (m2Res2.selected.length !== pCount) {
    throw new Error(`Expected ${pCount} roles, got ${m2Res2.selected.length}`);
  }
  const allFromPool = m2Res2.selected.every((r) => neutralPoolAllowed.has(r.role_id));
  if (!allFromPool) {
    throw new Error(`Mode 2 selected roles outside pool: ${selectedNames.join(", ")}`);
  }
  console.log(
    `Mode 2 Neutral-heavy Pool (${pCount} players) -> Selected: [${selectedNames.join(", ")}] | Score: ${m2Res2.bestScore}`
  );
}

// Edge Case 4: Mandatory Verification Test: 12 players with 4-role pool WITHOUT Villager
// Pool: [Werewolf, Seer, Bodyguard, Hunter]
// Must result in 12 roles ALL within pool, duplicates allowed, ZERO Villagers!
const fourRolePool = [
  { role_id: "ROLE-023", canonical_name: "Werewolf", count: 1 },
  { role_id: "ROLE-022", canonical_name: "Seer", count: 1 },
  { role_id: "ROLE-028", canonical_name: "Bodyguard", count: 1 },
  { role_id: "ROLE-039", canonical_name: "Hunter", count: 1 },
];
const vFour = validateMode2Pool(fourRolePool, 12);
console.log(`Four-role pool without villager valid for 12 players: ${vFour.valid}`);
if (!vFour.valid) throw new Error(`Expected 4-role pool to be valid for 12 players! Error: ${vFour.error}`);

const m2Res12 = auditSelectBalancedSubsetFromPool(fourRolePool, 12);
if (m2Res12.selected.length !== 12) throw new Error(`Expected exactly 12 roles, got ${m2Res12.selected.length}`);
const fourRoleAllowed = new Set(fourRolePool.map((r) => r.role_id));
const allFourRole = m2Res12.selected.every((r) => fourRoleAllowed.has(r.role_id));
if (!allFourRole) throw new Error("Selected roles contains roles outside the 4-role pool!");

const villagerCount = m2Res12.selected.filter((r) => r.canonical_name === "Villager" || r.role_id === "ROLE-024").length;
if (villagerCount !== 0) throw new Error(`Mode 2 pure sampling injected unselected Villager! (Count: ${villagerCount})`);

const selected12Names = m2Res12.selected.map((r) => r.canonical_name);
console.log(
  `Mandatory Test: 12 players with 4-role pool -> Selected: [${selected12Names.join(", ")}] (100% in pool: true, Zero Villagers: true, Score: ${m2Res12.bestScore})`
);

// Edge Case 5: Pool with fewer unique roles than players, WITH Villager in pool
const smallPoolWithVillager = [
  { role_id: "ROLE-023", canonical_name: "Werewolf", count: 1 },
  { role_id: "ROLE-022", canonical_name: "Seer", count: 1 },
  { role_id: "ROLE-028", canonical_name: "Bodyguard", count: 1 },
  { role_id: "ROLE-024", canonical_name: "Villager", count: 1 },
];
const vVillagerPad = validateMode2Pool(smallPoolWithVillager, 8);
console.log(`Small pool with villager valid for 8 players: ${vVillagerPad.valid}`);
if (!vVillagerPad.valid) throw new Error("Expected small pool with villager to be valid!");
const m2ResPad = auditSelectBalancedSubsetFromPool(smallPoolWithVillager, 8);
if (m2ResPad.selected.length !== 8) throw new Error("Expected 8 roles selected");
const padAllowed = new Set(smallPoolWithVillager.map((r) => r.role_id));
const allPadFromPool = m2ResPad.selected.every((r) => padAllowed.has(r.role_id));
if (!allPadFromPool) throw new Error("Selected roles contains roles outside the pool!");
const padRoleNames = m2ResPad.selected.map((r) => r.canonical_name);
console.log(
  `Small pool with Villager (8 players) -> Selected: [${padRoleNames.join(", ")}] (All from pool: true, Score: ${m2ResPad.bestScore})`
);

