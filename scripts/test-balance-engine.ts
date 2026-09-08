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
for (const pCount of [5, 6, 8]) {
  const m2Res2 = auditSelectBalancedSubsetFromPool(neutralHeavyPool, pCount);
  const selectedNames = m2Res2.selected.map((r) => r.canonical_name);
  const uniqueNames = new Set(selectedNames);
  if (pCount <= neutralHeavyPool.length) {
    if (uniqueNames.size !== selectedNames.length) {
      throw new Error(`Mode 2 duplicate detected in pool size >= playerCount: ${selectedNames.join(", ")}`);
    }
  }
  console.log(
    `Mode 2 Neutral-heavy Pool (${pCount} players) -> Selected: [${selectedNames.join(", ")}] (Unique: ${uniqueNames.size === selectedNames.length}) | Score: ${m2Res2.bestScore}`
  );
}

// Edge Case 4: Pool with fewer unique roles than players, WITHOUT Villager (must be rejected)
const smallPoolNoVillager = [
  { role_id: "ROLE-023", canonical_name: "Werewolf", count: 1 },
  { role_id: "ROLE-022", canonical_name: "Seer", count: 1 },
  { role_id: "ROLE-028", canonical_name: "Bodyguard", count: 1 },
  { role_id: "ROLE-039", canonical_name: "Hunter", count: 1 },
];
const vSmall = validateMode2Pool(smallPoolNoVillager, 6);
console.log(`Small pool without villager rejected for 6 players: ${!vSmall.valid} (Error: "${vSmall.error}")`);
if (vSmall.valid) throw new Error("Expected small pool without villager to be rejected!");

// Edge Case 5: Pool with fewer unique roles than players, WITH Villager (Villager pads, specials unique)
const smallPoolWithVillager = [
  { role_id: "ROLE-023", canonical_name: "Werewolf", count: 1 },
  { role_id: "ROLE-022", canonical_name: "Seer", count: 1 },
  { role_id: "ROLE-028", canonical_name: "Bodyguard", count: 1 },
  { role_id: "ROLE-024", canonical_name: "Villager", count: 1 },
];
const vVillagerPad = validateMode2Pool(smallPoolWithVillager, 6);
console.log(`Small pool with villager valid for 6 players: ${vVillagerPad.valid}`);
if (!vVillagerPad.valid) throw new Error("Expected small pool with villager to be valid!");
const m2ResPad = auditSelectBalancedSubsetFromPool(smallPoolWithVillager, 6);
const padRoleNames = m2ResPad.selected.map((r) => r.canonical_name);
const nonVillagers = m2ResPad.selected.filter((r) => r.canonical_name !== "Villager");
const uniqueNonVillagers = new Set(nonVillagers.map((r) => r.role_id));
if (uniqueNonVillagers.size !== nonVillagers.length) {
  throw new Error(`Special role duplicated in villager-padded pool: ${padRoleNames.join(", ")}`);
}
console.log(
  `Small pool with Villager padding (6 players) -> Selected: [${padRoleNames.join(", ")}] (Special roles unique: true, Villager padded: ${padRoleNames.filter(n => n === "Villager").length})`
);

