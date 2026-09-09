// ============================================================
// ASPIRE: WEREWOLF — RECONNECT SECURITY MATRIX TEST SUITE
// Exhaustively tests every GameEventType against the Fog-of-War
// event sanitization policy:
//   - Player A (Own info: ALLOW)
//   - Player B (Other info: DENY / MASK)
//   - Game Over (Explicit disclosure policy)
//   - Unknown Events (DEFAULT-DENY)
// ============================================================

import assert from "node:assert";
import { FogOfWarDispatcher } from "../server/gateway/fogOfWarDispatcher";
import { GameEvent, GameEventType } from "../src/contracts";

console.log("============================================================");
console.log("RECONNECT SECURITY MATRIX: EXHAUSTIVE EVENT AUTHORIZATION");
console.log("============================================================\n");

let passCount = 0;
function test(name: string, fn: () => void) {
  fn();
  passCount++;
  console.log(`  ✅ [PASS] ${name}`);
}

const PLAYER_A = "player-alice";
const PLAYER_B = "player-bob";
const ROOM_ID = "ROOM-SEC-MATRIX";

function makeEvent<T = any>(type: GameEventType | string, actorId: string | undefined, payload: T): GameEvent<T> {
  return {
    eventId: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    roomId: ROOM_ID,
    sequence: 1,
    timestamp: Date.now(),
    type: type as GameEventType,
    actorId,
    payload,
    serverSignature: "hmac-valid-signature",
  };
}

// ------------------------------------------------------------
// 1. PUBLIC GENERAL EVENTS (Explicitly Allowed)
// ------------------------------------------------------------
console.log("--- 1. PUBLIC GENERAL EVENTS (ALLOWLIST) ---");

test("ROOM_INITIALIZED is public and preserved for all players", () => {
  const ev = makeEvent("ROOM_INITIALIZED", PLAYER_A, { roomId: ROOM_ID, gameMode: "MODE_1_FIXED", hostPlayerId: PLAYER_A });
  const sanitizedA = FogOfWarDispatcher.sanitizeEventForPlayer(ev, PLAYER_A, false);
  const sanitizedB = FogOfWarDispatcher.sanitizeEventForPlayer(ev, PLAYER_B, false);
  assert.strictEqual(sanitizedA.payload.roomId, ROOM_ID);
  assert.strictEqual(sanitizedB.payload.roomId, ROOM_ID);
});

test("ROOM_CONFIG_UPDATED is public and preserved for all players", () => {
  const ev = makeEvent("ROOM_CONFIG_UPDATED", PLAYER_A, {
    gameMode: "MODE_2_POOL",
    selectedRolePool: ["ROLE-023", "ROLE-022", "ROLE-028"],
  });
  const sanitizedA = FogOfWarDispatcher.sanitizeEventForPlayer(ev, PLAYER_A, false);
  const sanitizedB = FogOfWarDispatcher.sanitizeEventForPlayer(ev, PLAYER_B, false);
  assert.strictEqual(sanitizedA.payload.gameMode, "MODE_2_POOL");
  assert.strictEqual(sanitizedB.payload.gameMode, "MODE_2_POOL");
  assert.deepStrictEqual(sanitizedB.payload.selectedRolePool, ["ROLE-023", "ROLE-022", "ROLE-028"]);
});

test("PLAYER_JOINED is public and preserved for all players", () => {
  const ev = makeEvent("PLAYER_JOINED", PLAYER_A, { playerId: PLAYER_A, playerName: "Alice" });
  const sanitizedB = FogOfWarDispatcher.sanitizeEventForPlayer(ev, PLAYER_B, false);
  assert.strictEqual(sanitizedB.payload.playerId, PLAYER_A);
  assert.strictEqual(sanitizedB.payload.playerName, "Alice");
});

test("PLAYER_READY_CHANGED is public and preserved for all players", () => {
  const ev = makeEvent("PLAYER_READY_CHANGED", PLAYER_A, { playerId: PLAYER_A, isReady: true });
  const sanitizedB = FogOfWarDispatcher.sanitizeEventForPlayer(ev, PLAYER_B, false);
  assert.strictEqual(sanitizedB.payload.isReady, true);
});

test("PLAYER_DISCONNECTED and PLAYER_RECONNECTED are public", () => {
  const disc = makeEvent("PLAYER_DISCONNECTED", PLAYER_A, { playerId: PLAYER_A });
  const reco = makeEvent("PLAYER_RECONNECTED", PLAYER_A, { playerId: PLAYER_A });
  assert.strictEqual(FogOfWarDispatcher.sanitizeEventForPlayer(disc, PLAYER_B, false).payload.playerId, PLAYER_A);
  assert.strictEqual(FogOfWarDispatcher.sanitizeEventForPlayer(reco, PLAYER_B, false).payload.playerId, PLAYER_A);
});

test("GAME_STARTED and PHASE_TRANSITIONED are public", () => {
  const start = makeEvent("GAME_STARTED", PLAYER_A, { playerCount: 5, gameMode: "MODE_1_FIXED" });
  const phase = makeEvent("PHASE_TRANSITIONED", undefined, { phase: "NIGHT_ACTIVE", dayCount: 0, nightCount: 1 });
  assert.strictEqual(FogOfWarDispatcher.sanitizeEventForPlayer(start, PLAYER_B, false).payload.playerCount, 5);
  assert.strictEqual(FogOfWarDispatcher.sanitizeEventForPlayer(phase, PLAYER_B, false).payload.phase, "NIGHT_ACTIVE");
});

test("VOTE_RESOLVED, TIMEOUT_OCCURRED, WIN_CONDITION_SATISFIED, MATCH_RESTARTED are public", () => {
  const voteRes = makeEvent("VOTE_RESOLVED", undefined, { eliminatedPlayerId: PLAYER_A });
  const timeout = makeEvent("TIMEOUT_OCCURRED", undefined, { timeoutCount: 1 });
  const win = makeEvent("WIN_CONDITION_SATISFIED", undefined, { winner: "Village" });
  const restart = makeEvent("MATCH_RESTARTED", PLAYER_A, { phase: "LOBBY" });
  assert.strictEqual(FogOfWarDispatcher.sanitizeEventForPlayer(voteRes, PLAYER_B, false).payload.eliminatedPlayerId, PLAYER_A);
  assert.strictEqual(FogOfWarDispatcher.sanitizeEventForPlayer(timeout, PLAYER_B, false).payload.timeoutCount, 1);
  assert.strictEqual(FogOfWarDispatcher.sanitizeEventForPlayer(win, PLAYER_B, false).payload.winner, "Village");
  assert.strictEqual(FogOfWarDispatcher.sanitizeEventForPlayer(restart, PLAYER_B, false).payload.phase, "LOBBY");
});

test("NARRATIVE_LORE_EMITTED and PLAYER_DISCONNECT_TIMEOUT are public", () => {
  const lore = makeEvent("NARRATIVE_LORE_EMITTED", undefined, { text: "Sun rose." });
  const discTimeout = makeEvent("PLAYER_DISCONNECT_TIMEOUT", PLAYER_A, { playerId: PLAYER_A });
  assert.strictEqual(FogOfWarDispatcher.sanitizeEventForPlayer(lore, PLAYER_B, false).payload.text, "Sun rose.");
  assert.strictEqual(FogOfWarDispatcher.sanitizeEventForPlayer(discTimeout, PLAYER_B, false).payload.playerId, PLAYER_A);
});

// ------------------------------------------------------------
// 2. CONFIDENTIAL ROLES_ASSIGNED
// ------------------------------------------------------------
console.log("\n--- 2. ROLES_ASSIGNED MATRIX ---");

const rawAssignments = [
  { playerId: PLAYER_A, role_id: "ROLE-022", canonical_name: "Seer", team: "Village", seer_result: "Villager" },
  { playerId: PLAYER_B, role_id: "ROLE-023", canonical_name: "Werewolf", team: "Werewolf", seer_result: "Werewolf" },
];
const rolesEvent = makeEvent("ROLES_ASSIGNED", PLAYER_A, { assignedCount: 2, rulesetVersion: "1.0.0", assignments: rawAssignments });

test("[ROLES_ASSIGNED] Player A receives ONLY Player A assignment during match", () => {
  const sanitized = FogOfWarDispatcher.sanitizeEventForPlayer(rolesEvent, PLAYER_A, false);
  assert.strictEqual(sanitized.payload.assignments.length, 1);
  assert.strictEqual(sanitized.payload.assignments[0].playerId, PLAYER_A);
  assert.strictEqual(sanitized.payload.assignments[0].role_id, "ROLE-022");
});

test("[ROLES_ASSIGNED] Player B receives ONLY Player B assignment during match", () => {
  const sanitized = FogOfWarDispatcher.sanitizeEventForPlayer(rolesEvent, PLAYER_B, false);
  assert.strictEqual(sanitized.payload.assignments.length, 1);
  assert.strictEqual(sanitized.payload.assignments[0].playerId, PLAYER_B);
  assert.strictEqual(sanitized.payload.assignments[0].role_id, "ROLE-023");
});

test("[ROLES_ASSIGNED] At GAME_OVER all assignments revealed with safe fields only", () => {
  const sanitized = FogOfWarDispatcher.sanitizeEventForPlayer(rolesEvent, PLAYER_A, true);
  assert.strictEqual(sanitized.payload.assignments.length, 2);
  assert.strictEqual(sanitized.payload.assignments.some((a: any) => a.playerId === PLAYER_B), true);
  assert.strictEqual(sanitized.payload.assignments[0].seer_result, undefined);
});

// ------------------------------------------------------------
// 3. CONFIDENTIAL NIGHT_ACTION_SUBMITTED
// ------------------------------------------------------------
console.log("\n--- 3. NIGHT_ACTION_SUBMITTED MATRIX ---");

const nightActionEv = makeEvent("NIGHT_ACTION_SUBMITTED", PLAYER_A, {
  actionId: "WEREWOLF_KILL",
  targetPlayerId: PLAYER_B,
  secondaryTargetId: null,
});

test("[NIGHT_ACTION] Actor (Player A) sees own action and target during match", () => {
  const sanitized = FogOfWarDispatcher.sanitizeEventForPlayer(nightActionEv, PLAYER_A, false);
  assert.strictEqual(sanitized.actorId, PLAYER_A);
  assert.strictEqual(sanitized.payload.targetPlayerId, PLAYER_B);
});

test("[NIGHT_ACTION] Non-Actor (Player B) has actorId and target masked during match", () => {
  const sanitized = FogOfWarDispatcher.sanitizeEventForPlayer(nightActionEv, PLAYER_B, false);
  assert.strictEqual(sanitized.actorId, undefined);
  assert.strictEqual(sanitized.payload.targetPlayerId, null);
  assert.strictEqual(sanitized.payload.actionId, "MASKED_NIGHT_ACTION");
});

test("[NIGHT_ACTION] Non-Actor (Player B) STILL masked at GAME_OVER (no raw action leakage)", () => {
  const sanitized = FogOfWarDispatcher.sanitizeEventForPlayer(nightActionEv, PLAYER_B, true);
  assert.strictEqual(sanitized.actorId, undefined);
  assert.strictEqual(sanitized.payload.targetPlayerId, null);
  assert.strictEqual(sanitized.payload.actionId, "MASKED_NIGHT_ACTION");
});

// ------------------------------------------------------------
// 4. CONFIDENTIAL NIGHT_RESOLVED
// ------------------------------------------------------------
console.log("\n--- 4. NIGHT_RESOLVED MATRIX ---");

const nightResolvedEv = makeEvent("NIGHT_RESOLVED", undefined, {
  killedPlayerIds: ["player-c"],
  savedPlayerIds: ["player-d"],
  cascadeCasualties: [],
  silencedPlayerIds: [],
  convertedPlayerIds: [PLAYER_A],
  triggeredActions: [{ actorId: PLAYER_A, action: "INVESTIGATE" }],
  updatedPlayers: [
    { id: PLAYER_A, name: "Alice", alive: true, role_id: "ROLE-023", team: "Werewolf" },
    { id: PLAYER_B, name: "Bob", alive: true, role_id: "ROLE-022", team: "Village" },
  ],
});

test("[NIGHT_RESOLVED] Public casualties and saves are visible to everyone", () => {
  const sanitizedB = FogOfWarDispatcher.sanitizeEventForPlayer(nightResolvedEv, PLAYER_B, false);
  assert.deepStrictEqual(sanitizedB.payload.killedPlayerIds, ["player-c"]);
  assert.deepStrictEqual(sanitizedB.payload.savedPlayerIds, ["player-d"]);
});

test("[NIGHT_RESOLVED] Player A conversion and triggered actions are HIDDEN from Player B", () => {
  const sanitizedB = FogOfWarDispatcher.sanitizeEventForPlayer(nightResolvedEv, PLAYER_B, false);
  assert.strictEqual(sanitizedB.payload.convertedPlayerIds.length, 0);
  assert.strictEqual(sanitizedB.payload.triggeredActions.length, 0);
  const aliceInB = sanitizedB.payload.updatedPlayers.find((p: any) => p.id === PLAYER_A);
  assert.strictEqual(aliceInB.role_id, undefined);
  assert.strictEqual(aliceInB.team, undefined);
});

test("[NIGHT_RESOLVED] Player A receives own conversion & triggered action", () => {
  const sanitizedA = FogOfWarDispatcher.sanitizeEventForPlayer(nightResolvedEv, PLAYER_A, false);
  assert.deepStrictEqual(sanitizedA.payload.convertedPlayerIds, [PLAYER_A]);
  assert.strictEqual(sanitizedA.payload.triggeredActions.length, 1);
});

// ------------------------------------------------------------
// 5. CONFIDENTIAL ROLE_TRANSFORMED
// ------------------------------------------------------------
console.log("\n--- 5. ROLE_TRANSFORMED MATRIX ---");

const transformEv = makeEvent("ROLE_TRANSFORMED", PLAYER_A, {
  playerId: PLAYER_A,
  fromRoleId: "ROLE-031",
  toRoleId: "ROLE-023",
  fromTeam: "Village",
  toTeam: "Werewolf",
  canonicalName: "Werewolf",
});

test("[ROLE_TRANSFORMED] Transformed player sees own new role during match", () => {
  const sanitizedA = FogOfWarDispatcher.sanitizeEventForPlayer(transformEv, PLAYER_A, false);
  assert.strictEqual(sanitizedA.payload.toRoleId, "ROLE-023");
  assert.strictEqual(sanitizedA.payload.toTeam, "Werewolf");
});

test("[ROLE_TRANSFORMED] Other players see only transformed: true (no role or team leak)", () => {
  const sanitizedB = FogOfWarDispatcher.sanitizeEventForPlayer(transformEv, PLAYER_B, false);
  assert.strictEqual(sanitizedB.actorId, undefined);
  assert.strictEqual(sanitizedB.payload.transformed, true);
  assert.strictEqual(sanitizedB.payload.toRoleId, undefined);
  assert.strictEqual(sanitizedB.payload.toTeam, undefined);
});

// ------------------------------------------------------------
// 6. CONFIDENTIAL VOTE_CAST MATRIX
// ------------------------------------------------------------
console.log("\n--- 6. VOTE_CAST MATRIX ---");

const voteCastEv = makeEvent("VOTE_CAST", PLAYER_A, {
  voterPlayerId: PLAYER_A,
  targetPlayerId: PLAYER_B,
  weight: 1,
});

test("[VOTE_CAST] Voter (Player A) sees own vote target during active voting", () => {
  const sanitizedA = FogOfWarDispatcher.sanitizeEventForPlayer(voteCastEv, PLAYER_A, false);
  assert.strictEqual(sanitizedA.actorId, PLAYER_A);
  assert.strictEqual(sanitizedA.payload.targetPlayerId, PLAYER_B);
});

test("[VOTE_CAST] Other players (Player B) have vote target masked during active voting", () => {
  const sanitizedB = FogOfWarDispatcher.sanitizeEventForPlayer(voteCastEv, PLAYER_B, false);
  assert.strictEqual(sanitizedB.actorId, undefined);
  assert.strictEqual(sanitizedB.payload.targetPlayerId, null);
  assert.strictEqual(sanitizedB.payload.voteCast, true);
});

test("[VOTE_CAST] At GAME_OVER vote target is visible for post-game inspection", () => {
  const sanitizedB = FogOfWarDispatcher.sanitizeEventForPlayer(voteCastEv, PLAYER_B, true);
  assert.strictEqual(sanitizedB.payload.targetPlayerId, PLAYER_B);
});

// ------------------------------------------------------------
// 7. DEFAULT-DENY FALLBACK MATRIX
// ------------------------------------------------------------
console.log("\n--- 7. DEFAULT-DENY FALLBACK MATRIX ---");

const unknownEv = makeEvent("UNKNOWN_FUTURE_EVENT" as any, PLAYER_A, {
  secretEngineDetails: "super-secret-computation",
  rawToken: "secret-token-12345",
});

test("[DEFAULT-DENY] Unknown / unmodeled event type is strictly redacted for other players", () => {
  const sanitizedB = FogOfWarDispatcher.sanitizeEventForPlayer(unknownEv, PLAYER_B, false);
  assert.strictEqual(sanitizedB.actorId, undefined);
  assert.strictEqual(sanitizedB.payload.masked, true);
  assert.strictEqual((sanitizedB.payload as any).secretEngineDetails, undefined);
  assert.strictEqual((sanitizedB.payload as any).rawToken, undefined);
});

test("[DEFAULT-DENY] Unknown event at GAME_OVER is STILL strictly redacted", () => {
  const sanitizedB = FogOfWarDispatcher.sanitizeEventForPlayer(unknownEv, PLAYER_B, true);
  assert.strictEqual(sanitizedB.actorId, undefined);
  assert.strictEqual(sanitizedB.payload.masked, true);
  assert.strictEqual((sanitizedB.payload as any).secretEngineDetails, undefined);
});

console.log("\n============================================================");
console.log(`SECURITY MATRIX RESULTS: ${passCount} PASSED / 0 FAILED`);
console.log("============================================================");
console.log("🎉 ALL 19 GameEventType POLICIES + DEFAULT-DENY 100% VERIFIED!");
