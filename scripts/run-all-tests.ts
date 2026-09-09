// ============================================================
// ASPIRE: WEREWOLF — Unified Acceptance Test Runner
// Executes all Phase 1-4 validation suites sequentially
// "One command to audit them all."
// ============================================================

import { execSync } from "node:child_process";

interface TestSuite {
  name: string;
  file: string;
}

const suites: TestSuite[] = [
  { name: "Contracts Validation (Phase 1)", file: "scripts/test-contracts-validation.ts" },
  { name: "75 Canonical Roles Engine", file: "scripts/test-all-75-roles.ts" },
  { name: "Balance Engine & Mode Allocators", file: "scripts/test-balance-engine.ts" },
  { name: "Authoritative Server Runtime (Phase 2)", file: "scripts/test-authoritative-server.ts" },
  { name: "Client Adapter E2E WSS (Phase 3)", file: "scripts/test-client-adapter-e2e.ts" },
  { name: "Crash Recovery & Replay (Phase 4)", file: "scripts/test-crash-recovery-replay.ts" },
  { name: "Reconnect Security Matrix (Fog-of-War)", file: "scripts/test-reconnect-security-matrix.ts" },
  { name: "Phase 4 Final Hardening Suite", file: "scripts/test-phase4-final-hardening.ts" },
];

console.log("============================================================");
console.log("ASPIRE WEREWOLF: UNIFIED ACCEPTANCE TEST RUNNER");
console.log("============================================================");

let failed = 0;
const startTotal = Date.now();

for (const suite of suites) {
  console.log(`\n============================================================`);
  console.log(`▶ Running: ${suite.name} (${suite.file})`);
  console.log(`============================================================`);
  const startSuite = Date.now();
  try {
    execSync(`npx tsx ${suite.file}`, { stdio: "inherit" });
    const duration = ((Date.now() - startSuite) / 1000).toFixed(1);
    console.log(`✔ [PASS] ${suite.name} (${duration}s)`);
  } catch {
    console.error(`✘ [FAIL] ${suite.name}`);
    failed++;
  }
}

const totalDuration = ((Date.now() - startTotal) / 1000).toFixed(1);
console.log("\n============================================================");
console.log("UNIFIED TEST RUN SUMMARY");
console.log(`Completed in ${totalDuration}s`);
console.log("============================================================");

if (failed > 0) {
  console.error(`❌ TEST RUN FAILED: ${failed} of ${suites.length} test suite(s) failed.`);
  process.exit(1);
} else {
  console.log(`🎉 ALL ${suites.length} TEST SUITES PASSED (100% SUCCESS) — PRODUCTION READY!`);
  process.exit(0);
}
