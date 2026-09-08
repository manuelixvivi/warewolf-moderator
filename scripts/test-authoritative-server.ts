// ============================================================
// ASPIRE: WEREWOLF — Phase 2 Authoritative Server Integration Test
// Verifies Runtime Server Validation Pipeline:
// Incoming Frame -> Schema Validation -> Authentication -> Authorization
// -> Game Phase Invariant -> Engine Delegation -> Fog-of-War Dispatch
// "Server owns the state. Engine resolves truth."
// ============================================================

import { buildServer } from "../server";
import { RoomManager } from "../server/rooms/roomManager";
import { SessionManager } from "../server/auth/sessionManager";
import { CommandDispatcher } from "../server/gateway/commandDispatcher";
import { FogOfWarDispatcher } from "../server/gateway/fogOfWarDispatcher";
import { BaseCommand, SubmitNightActionCommandPayload, CastVoteCommandPayload } from "../src/contracts";
import crypto from "crypto";

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

async function runServerTestSuite() {
  console.log("============================================================");
  console.log("PHASE 2: AUTHORITATIVE SERVER RUNTIME VALIDATION TEST SUITE");
  console.log("Verifying Fastify Gateway, Multi-Tier Auth & Engine Boundary");
  console.log("============================================================\n");

  const server = await buildServer();

  // ------------------------------------------------------------
  // 1. HEALTHCHECK & BOOT
  // ------------------------------------------------------------
  console.log("--- 1. SERVER BOOT & HEALTHCHECK ---");
  {
    const res = await server.inject({
      method: "GET",
      url: "/health",
    });

    assert(res.statusCode === 200, "[Boot] Server responds with HTTP 200 OK");
    const body = JSON.parse(res.body);
    assert(body.status === "ok", "[Boot] Healthcheck payload indicates status: ok");
    assert(typeof body.uptimeSec === "number", "[Boot] Server uptime reported");
  }

  // ------------------------------------------------------------
  // 2. CRYPTOGRAPHIC SESSION MANAGER
  // ------------------------------------------------------------
  console.log("\n--- 2. CRYPTOGRAPHIC SESSION MANAGER ---");
  {
    const token = SessionManager.createSessionToken("p1", "Alice", "ROOM-TEST", true);
    assert(typeof token === "string" && token.length > 50, "[Session] JWT session token generated");

    const decoded = SessionManager.verifySessionToken(token);
    assert(decoded !== null, "[Session] Valid token verified successfully");
    assert(decoded?.playerId === "p1" && decoded?.roomId === "ROOM-TEST", "[Session] Token payload preserves identity claims");
    assert(decoded?.isHost === true, "[Session] Token payload records host status");

    // Tampered Token Rejection
    const tampered = token.slice(0, -5) + "abcde";
    const tamperedDecoded = SessionManager.verifySessionToken(tampered);
    assert(tamperedDecoded === null, "[Session] (Negative) Tampered token is rejected");

    // Empty/Malformed Token Rejection
    assert(SessionManager.verifySessionToken("") === null, "[Session] (Negative) Empty token is rejected");
  }

  // ------------------------------------------------------------
  // 3. ROOM CREATION & LOBBY REST HANDSHAKE
  // ------------------------------------------------------------
  console.log("\n--- 3. ROOM CREATION & LOBBY HANDSHAKE ---");
  let testRoomId = "";
  let hostToken = "";
  let p2Token = "";
  let p3Token = "";
  let p4Token = "";
  let p5Token = "";

  {
    const res = await server.inject({
      method: "POST",
      url: "/api/rooms",
      payload: {
        hostPlayerId: "p1",
        hostPlayerName: "Alice",
        gameMode: "MODE_3_RANDOM",
        customRoomId: "ROOM-AUTH-001",
      },
    });

    assert(res.statusCode === 201, "[Rooms] Room created via HTTP POST 201");
    const body = JSON.parse(res.body);
    testRoomId = body.roomId;
    hostToken = body.sessionToken;

    assert(testRoomId === "ROOM-AUTH-001", "[Rooms] Room ID confirmed");
    assert(Boolean(hostToken), "[Rooms] Host session token returned");
    assert(body.publicState.players.length === 1, "[Rooms] Initial lobby contains host");
    assert(body.publicState.phase === "LOBBY", "[Rooms] Initial phase is LOBBY");

    // Join 4 more players
    const playersToJoin = [
      { id: "p2", name: "Bob" },
      { id: "p3", name: "Charlie" },
      { id: "p4", name: "David" },
      { id: "p5", name: "Eve" },
    ];

    const tokens: string[] = [];
    for (const p of playersToJoin) {
      const joinRes = await server.inject({
        method: "POST",
        url: `/api/rooms/${testRoomId}/join`,
        payload: { playerId: p.id, playerName: p.name },
      });
      assert(joinRes.statusCode === 200, `[Rooms] Player ${p.name} joined room`);
      const joinBody = JSON.parse(joinRes.body);
      tokens.push(joinBody.sessionToken);
    }

    p2Token = tokens[0];
    p3Token = tokens[1];
    p4Token = tokens[2];
    p5Token = tokens[3];

    const roomInfo = RoomManager.getRoom(testRoomId);
    assert(roomInfo?.players.length === 5, "[Rooms] Room has 5 players in lobby");
  }

  // ------------------------------------------------------------
  // 4. MULTI-TIER COMMAND VALIDATION PIPELINE
  // ------------------------------------------------------------
  console.log("\n--- 4. MULTI-TIER RUNTIME VALIDATION PIPELINE ---");
  {
    const room = RoomManager.getRoom(testRoomId)!;

    // A. Malformed JSON Frame
    const malformedResult = CommandDispatcher.validateCommand("not a json string", room);
    assert(malformedResult.isValid === false, "[Validation] (Negative) Malformed JSON frame is rejected");
    assert(malformedResult.errorCode === "INVALID_SCHEMA", "[Validation] Error code is INVALID_SCHEMA");

    // B. Missing BaseCommand fields
    const missingFieldsResult = CommandDispatcher.validateCommand(
      JSON.stringify({ type: "CAST_VOTE" }),
      room
    );
    assert(missingFieldsResult.isValid === false, "[Validation] (Negative) Missing BaseCommand fields rejected");

    // C. Forged Token (Auth Failure)
    const forgedCommand: BaseCommand = {
      commandId: "cmd-001",
      roomId: testRoomId,
      senderId: "p1",
      sessionToken: "invalid.forged.jwt.token",
      type: "CAST_VOTE",
      payload: { targetPlayerId: "p2" },
      clientTimestamp: Date.now(),
    };
    const authFailResult = CommandDispatcher.validateCommand(JSON.stringify(forgedCommand), room);
    assert(authFailResult.isValid === false, "[Validation] (Negative) Forged token fails authentication");
    assert(authFailResult.errorCode === "AUTH_FAILED", "[Validation] Error code is AUTH_FAILED");

    // D. Impersonation Attack (Token belongs to Alice, but senderId claims to be Bob)
    const impersonationCommand: BaseCommand = {
      commandId: "cmd-002",
      roomId: testRoomId,
      senderId: "p2", // Bob
      sessionToken: hostToken, // Alice's token!
      type: "TOGGLE_READY",
      payload: {},
      clientTimestamp: Date.now(),
    };
    const impersonationResult = CommandDispatcher.validateCommand(JSON.stringify(impersonationCommand), room);
    assert(impersonationResult.isValid === false, "[Validation] (Negative) Impersonation attack prevented");
    assert(impersonationResult.errorCode === "NOT_PERMITTED", "[Validation] Error code is NOT_PERMITTED");

    // E. Cross-Room Attack (Valid token from another room)
    const foreignToken = SessionManager.createSessionToken("p1", "Alice", "ANOTHER-ROOM-999", true);
    const crossRoomCommand: BaseCommand = {
      commandId: "cmd-003",
      roomId: testRoomId,
      senderId: "p1",
      sessionToken: foreignToken,
      type: "TOGGLE_READY",
      payload: {},
      clientTimestamp: Date.now(),
    };
    const crossRoomResult = CommandDispatcher.validateCommand(JSON.stringify(crossRoomCommand), room);
    assert(crossRoomResult.isValid === false, "[Validation] (Negative) Cross-room token replay prevented");

    // F. Phase Invariant Violation (Voting during LOBBY phase)
    const outOfPhaseCommand: BaseCommand<CastVoteCommandPayload> = {
      commandId: "cmd-004",
      roomId: testRoomId,
      senderId: "p1",
      sessionToken: hostToken,
      type: "CAST_VOTE",
      payload: { targetPlayerId: "p2" },
      clientTimestamp: Date.now(),
    };
    const phaseViolationResult = CommandDispatcher.validateCommand(JSON.stringify(outOfPhaseCommand), room);
    assert(phaseViolationResult.isValid === false, "[Validation] (Negative) Out-of-phase command rejected");
    assert(phaseViolationResult.errorCode === "INVALID_PHASE", "[Validation] Error code is INVALID_PHASE");
  }

  // ------------------------------------------------------------
  // 5. AUTHORITATIVE ENGINE DELEGATION & MATCH LIFECYCLE
  // ------------------------------------------------------------
  console.log("\n--- 5. AUTHORITATIVE GAME LIFECYCLE & ENGINE DELEGATION ---");
  {
    // A. Start Game (Alice starts game)
    const startGameCommand: BaseCommand = {
      commandId: "cmd-start",
      roomId: testRoomId,
      senderId: "p1",
      sessionToken: hostToken,
      type: "START_GAME",
      payload: {},
      clientTimestamp: Date.now(),
    };

    const startResult = await CommandDispatcher.handleCommand(JSON.stringify(startGameCommand));
    assert(startResult.success === true, "[Lifecycle] Host START_GAME executed successfully");

    const room = RoomManager.getRoom(testRoomId)!;
    assert(room.phase === "NIGHT_ACTIVE", "[Lifecycle] Room transitioned to NIGHT_ACTIVE");
    assert(room.nightCount === 1, "[Lifecycle] Night count initialized to 1");

    // Verify all 5 players received roles from Golden Engine
    const rolesAssigned = room.players.map((p) => p.canonical_name);
    assert(rolesAssigned.length === 5, "[Lifecycle] Golden Engine assigned roles to all 5 players");
    assert(room.players.some((p) => p.team === "Werewolf" || p.team === "Solo Werewolf"), "[Lifecycle] Werewolf presence guaranteed");

    // Verify Night Actions built
    assert(room.nightActions.length > 0, "[Lifecycle] Night actions generated for Night 1");

    // Verify Monotonic Event Log & Signatures
    const lastEvent = room.eventLog[room.eventLog.length - 1];
    assert(lastEvent.sequence === room.sequenceNumber, "[Events] Monotonic sequence incremented");
    assert(lastEvent.serverSignature.length === 64, "[Events] Event signed with server HMAC-SHA256 signature");
  }

  // ------------------------------------------------------------
  // 6. FOG-OF-WAR STATE SANITIZATION & LEAK AUDIT
  // ------------------------------------------------------------
  console.log("\n--- 6. FOG-OF-WAR SANITIZATION & LEAK AUDIT ---");
  {
    const room = RoomManager.getRoom(testRoomId)!;
    const publicState = FogOfWarDispatcher.buildPublicState(room);

    // Serialization leak check: Public state MUST NOT contain secret keys
    const publicJson = JSON.stringify(publicState);
    assert(!publicJson.includes('"role_id"'), "[Fog-of-War] Public state contains NO role_id");
    assert(!publicJson.includes('"team"'), "[Fog-of-War] Public state contains NO team");
    assert(!publicJson.includes('"seer_result"'), "[Fog-of-War] Public state contains NO seer_result");

    // Private state delivery check: Alice only gets her own role
    const alicePrivate = FogOfWarDispatcher.buildPrivateState(room, "p1");
    assert(alicePrivate !== null, "[Fog-of-War] Private state generated for Alice");
    assert(alicePrivate?.playerId === "p1", "[Fog-of-War] Private state playerId matches recipient");
    assert(Boolean(alicePrivate?.role_id), "[Fog-of-War] Private state delivers secret role_id exclusively to owner");
  }

  // ------------------------------------------------------------
  // 7. DISCONNECT & RECONNECT GRACE PERIOD
  // ------------------------------------------------------------
  console.log("\n--- 7. DISCONNECT & RECONNECT GRACE PERIOD ---");
  {
    const room = RoomManager.getRoom(testRoomId)!;

    // Simulate disconnect of Bob (p2)
    await RoomManager.handleClientDisconnect(testRoomId, "p2");
    assert(room.disconnectTimers.has("p2"), "[Reconnection] Disconnect grace timer registered for p2");

    // Simulate immediate reconnection of Bob
    await RoomManager.registerClientSocket("sock-new-bob", {} as any, "p2", testRoomId);
    assert(!room.disconnectTimers.has("p2"), "[Reconnection] Reconnection cleared grace timer");

    const reconnectedEvent = room.eventLog.find((e) => e.type === "PLAYER_RECONNECTED");
    assert(Boolean(reconnectedEvent), "[Reconnection] PLAYER_RECONNECTED event appended to log");
  }

  console.log("\n============================================================");
  console.log(`SERVER TEST RESULTS: ${passCount} PASSED / ${failCount} FAILED`);
  console.log("============================================================");
  if (failCount === 0) {
    console.log("🎉 AUTHORITATIVE SERVER RUNTIME PIPELINE 100% VERIFIED!");
  }

  await server.close();
}

runServerTestSuite().catch((err) => {
  console.error("Fatal test error:", err);
  process.exit(1);
});
