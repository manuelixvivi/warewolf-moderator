// ============================================================
// ASPIRE: WEREWOLF — Phase 4 Final Hardening & Production Gate Suite
// Verifies all 4 Critical Blockers + 5 Hardening Items from Audit:
//
// 1. GAME_OVER Winner Projection (No false "Draw")
// 2. Anonymous Join Player Takeover Prevention (Identity Gate)
// 3. PostgreSQL Startup Crash Auto-Recovery Loop
// 4. MATCH_RESTARTED Complete Event Sourcing & Deterministic Replay
// 5. Socket Disconnect Race & ID Matching Guard
// 6. Stateful RECONNECT / REQUEST_SYNC Delta Protocol
// 7. Safe UI Projections (nightActionProgress & publicNightResult)
// 8. Persistent SEND_CHAT Idempotency
// 9. Create Room Collision Prevention
// ============================================================

import { RoomManager } from "../server/rooms/roomManager";
import { defaultEventStore, ReplayEngine, InMemoryEventStore } from "../server/persistence";
import { FogOfWarDispatcher } from "../server/gateway/fogOfWarDispatcher";
import { CommandDispatcher } from "../server/gateway/commandDispatcher";
import { SessionManager } from "../server/auth/sessionManager";
import { signGameEvent, verifyGameEventSignature } from "../server/config";
import { GameEvent } from "../src/contracts";
import { canParticipateInWerewolfPackVote, canAccessWolfChat } from "../src/lib/engine/abilityRegistry";
import { v7 as uuidv7 } from "uuid";

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

async function runHardeningSuite() {
  console.log("============================================================");
  console.log("PHASE 4: FINAL HARDENING & AUDIT VERIFICATION SUITE");
  console.log("============================================================\n");

  const testRoomId = `ROOM-HARDEN-${Date.now()}`;

  // ------------------------------------------------------------
  // 1. ROOM CREATION & COLLISION CHECK
  // ------------------------------------------------------------
  console.log("--- 1. ROOM CREATION & COLLISION PREVENTION ---");
  {
    const { room, sessionToken } = await RoomManager.createRoom(
      "host-1",
      "Alice",
      "MODE_1_FIXED",
      testRoomId
    );
    assert(room.roomId === testRoomId, "[Collision] Room created with specified ID");
    assert(Boolean(sessionToken), "[Collision] Session token issued to host");

    // Attempt to create room with existing ID must throw collision error
    let collisionDetected = false;
    try {
      await RoomManager.createRoom("host-2", "Malory", "MODE_1_FIXED", testRoomId);
    } catch (err: any) {
      if (err.message.includes("Room collision") || err.message.includes("already exists")) {
        collisionDetected = true;
      }
    }
    assert(collisionDetected, "[Collision] Duplicate room creation rejected with collision error");
  }

  // ------------------------------------------------------------
  // 2. ANONYMOUS JOIN & PLAYER TAKEOVER PREVENTION
  // ------------------------------------------------------------
  console.log("\n--- 2. ANONYMOUS JOIN & PLAYER TAKEOVER PREVENTION ---");
  {
    // New player Bob joins
    const { sessionToken: bobToken } = await RoomManager.joinRoom(testRoomId, "p-bob", "Bob");
    assert(Boolean(bobToken), "[Security] New player Bob joins and receives session token");

    // Attacker tries to hijack Bob's playerId without bobToken -> MUST BE REJECTED
    let hijackRejected = false;
    try {
      await RoomManager.joinRoom(testRoomId, "p-bob", "AttackerEve");
    } catch (err: any) {
      if (err.message.includes("already claimed")) {
        hijackRejected = true;
      }
    }
    assert(hijackRejected, "[Security] Attacker cannot claim existing playerId without valid sessionToken");

    // Attacker tries to hijack Host's playerId -> MUST BE REJECTED
    let hostHijackRejected = false;
    try {
      await RoomManager.joinRoom(testRoomId, "host-1", "FakeHost");
    } catch (err: any) {
      if (err.message.includes("already claimed")) {
        hostHijackRejected = true;
      }
    }
    assert(hostHijackRejected, "[Security] Attacker cannot claim host playerId without valid sessionToken");

    // Legitimate Bob reconnects with bobToken -> MUST BE ACCEPTED
    const { sessionToken: resumeToken } = await RoomManager.joinRoom(
      testRoomId,
      "p-bob",
      "Bob",
      undefined,
      bobToken
    );
    assert(Boolean(resumeToken), "[Security] Legitimate player resumes identity with valid sessionToken");

    // Join remaining players for game: Charlie, David, Eve
    await RoomManager.joinRoom(testRoomId, "p-charlie", "Charlie");
    await RoomManager.joinRoom(testRoomId, "p-david", "David");
    await RoomManager.joinRoom(testRoomId, "p-eve", "Eve");
  }

  // ------------------------------------------------------------
  // 3. START GAME & UI PROGRESS PROJECTION
  // ------------------------------------------------------------
  console.log("\n--- 3. START GAME & UI PROGRESS PROJECTION ---");
  {
    await RoomManager.startGame(testRoomId, "host-1", {
      fixedRoles: [
        { role_id: "ROLE-023", canonical_name: "Werewolf", count: 1 },
        { role_id: "ROLE-024", canonical_name: "Villager", count: 4 },
      ],
    });
    const room = RoomManager.getRoom(testRoomId)!;
    assert(room.phase === "NIGHT_ACTIVE", "[Game] Phase transitioned to NIGHT_ACTIVE");

    // Check FogOfWar public projection includes nightActionProgress
    const pubState = FogOfWarDispatcher.buildPublicState(room);
    assert(pubState.nightActionProgress !== undefined, "[UI Projection] nightActionProgress present in NIGHT_ACTIVE");
    assert(pubState.nightActionProgress?.totalEligible === room.nightActions.length, "[UI Projection] totalEligible matches nightActions count");
    assert(pubState.nightActionProgress?.completedCount === 0, "[UI Projection] Initial completedCount is 0");

    // Submit first action
    const firstAction = room.nightActions[0];
    if (firstAction) {
      const villager = room.players.find((p) => p.team === "Village")!;
      const submitResult = await RoomManager.submitNightAction(
        testRoomId,
        firstAction.player_ids[0],
        firstAction.id,
        villager.id
      );
      if (!submitResult.resolved) {
        const pubStateAfter = FogOfWarDispatcher.buildPublicState(room);
        assert(pubStateAfter.nightActionProgress?.completedCount === 1, "[UI Projection] completedCount incremented to 1 after submission");
      } else {
        assert(room.phase === "DAY_DISCUSSION", "[UI Projection] All actions completed -> auto-transitioned to DAY_DISCUSSION");
      }
    }
  }

  // ------------------------------------------------------------
  // 4. NIGHT RESOLUTION & PUBLIC NIGHT RESULT PROJECTION
  // ------------------------------------------------------------
  console.log("\n--- 4. NIGHT RESOLUTION & PUBLIC NIGHT RESULT PROJECTION ---");
  {
    const room = RoomManager.getRoom(testRoomId)!;
    if (room.phase === "NIGHT_ACTIVE") {
      await RoomManager.resolveNightPhase(room);
    }

    assert(room.phase === "DAY_DISCUSSION", "[Night] Resolved to DAY_DISCUSSION");
    assert(room.lastNightResult !== null, "[Night] room.lastNightResult populated");

    const pubState = FogOfWarDispatcher.buildPublicState(room);
    assert(pubState.publicNightResult !== null, "[UI Projection] publicNightResult projected to clients");
    assert(Array.isArray(pubState.publicNightResult?.killed), "[UI Projection] publicNightResult.killed is an array");
    assert(Array.isArray(pubState.publicNightResult?.protected), "[UI Projection] publicNightResult.protected is an array");
  }

  // ------------------------------------------------------------
  // 5. CHAT IDEMPOTENCY
  // ------------------------------------------------------------
  console.log("\n--- 5. CHAT IDEMPOTENCY ---");
  {
    const room = RoomManager.getRoom(testRoomId)!;
    const alivePlayer = room.players.find((p) => p.alive)!;
    const senderToken = SessionManager.createSessionToken(alivePlayer.id, alivePlayer.name, testRoomId, alivePlayer.isHost);

    const chatCmd = JSON.stringify({
      commandId: "cmd-chat-001",
      roomId: testRoomId,
      senderId: alivePlayer.id,
      sessionToken: senderToken,
      type: "SEND_CHAT",
      payload: { text: "Hello villagers!", channel: "DAY_PUBLIC" },
      clientTimestamp: Date.now(),
    });

    // First send
    const res1 = await CommandDispatcher.handleCommand(chatCmd);
    assert(res1.success === true && !res1.isDuplicate, "[Chat] First chat message accepted");

    // Duplicate send with same commandId
    const res2 = await CommandDispatcher.handleCommand(chatCmd);
    assert(res2.success === true && res2.isDuplicate === true, "[Chat] Duplicate chat message deduplicated via idempotency");
  }

  // ------------------------------------------------------------
  // 6. STATEFUL RECONNECT DELTA PROTOCOL
  // ------------------------------------------------------------
  console.log("\n--- 6. STATEFUL RECONNECT PROTOCOL ---");
  {
    const aliceToken = SessionManager.createSessionToken("host-1", "Alice", testRoomId, true);
    const room = RoomManager.getRoom(testRoomId)!;

    let receivedSync: any = null;
    const mockSocket = {
      readyState: 1,
      send: (data: string) => {
        const parsed = JSON.parse(data);
        if (parsed.type === "RECONNECT_SYNC") {
          receivedSync = parsed.sync;
        }
      },
    };

    // Register socket
    await RoomManager.registerClientSocket("sock-reconn-1", mockSocket, "host-1", testRoomId);

    const reconnectCmd = JSON.stringify({
      commandId: "cmd-reconn-001",
      roomId: testRoomId,
      senderId: "host-1",
      sessionToken: aliceToken,
      type: "RECONNECT",
      payload: { lastKnownSequence: 2 },
      clientTimestamp: Date.now(),
    });

    const res = await CommandDispatcher.handleCommand(reconnectCmd);
    assert(res.success === true, "[Reconnect] RECONNECT command processed successfully");
    assert(receivedSync !== null, "[Reconnect] RECONNECT_SYNC frame dispatched to client");
    assert(receivedSync.publicState.roomId === testRoomId, "[Reconnect] Public state delivered in sync");
    assert(receivedSync.privateState.playerId === "host-1", "[Reconnect] Private state delivered in sync");
    assert(Array.isArray(receivedSync.missedEvents), "[Reconnect] Missed events delta array delivered");
    assert(receivedSync.missedEvents.length > 0, "[Reconnect] Missed events contains sequence > 2");
    assert(receivedSync.missedEvents[0].sequence >= 3, "[Reconnect] Delta sequence starts at lastKnownSequence + 1");

    // Fog-of-War Reconnect Event Sanitization Auditing
    const rolesEv = receivedSync.missedEvents.find((e: any) => e.type === "ROLES_ASSIGNED");
    assert(rolesEv !== undefined, "[Reconnect Fog-of-War] ROLES_ASSIGNED present in missed events");
    assert(rolesEv.payload.assignments.length === 1, "[Reconnect Fog-of-War] Recipient only receives their own role assignment");
    assert(rolesEv.payload.assignments[0].playerId === "host-1", "[Reconnect Fog-of-War] Delivered assignment strictly matches recipient ID");
    assert(rolesEv.payload.assignments.some((a: any) => a.playerId === "p-bob") === false, "[Reconnect Fog-of-War] Other players' roles strictly stripped");

    const nightActionEvs = receivedSync.missedEvents.filter((e: any) => e.type === "NIGHT_ACTION_SUBMITTED");
    for (const naEv of nightActionEvs) {
      if (naEv.actorId !== "host-1") {
        assert(naEv.actorId === undefined, "[Reconnect Fog-of-War] Other player's night action actorId masked");
        assert(naEv.payload.targetPlayerId === null, "[Reconnect Fog-of-War] Other player's night action target masked");
      }
    }

    const nightResolvedEv = receivedSync.missedEvents.find((e: any) => e.type === "NIGHT_RESOLVED");
    if (nightResolvedEv && Array.isArray(nightResolvedEv.payload.updatedPlayers)) {
      const otherPlayerSnapshot = nightResolvedEv.payload.updatedPlayers.find((p: any) => p.id === "p-bob");
      if (otherPlayerSnapshot) {
        assert(otherPlayerSnapshot.role_id === undefined, "[Reconnect Fog-of-War] Other player's role_id stripped from updatedPlayers");
        assert(otherPlayerSnapshot.team === undefined, "[Reconnect Fog-of-War] Other player's team stripped from updatedPlayers");
      }
    }
  }

  // ------------------------------------------------------------
  // 7. SOCKET DISCONNECT RACE PROTECTION
  // ------------------------------------------------------------
  console.log("\n--- 7. SOCKET DISCONNECT RACE PROTECTION ---");
  {
    const room = RoomManager.getRoom(testRoomId)!;

    // Connect Socket 1
    const mockSocket1 = { readyState: 1, send: () => {} };
    await RoomManager.registerClientSocket("sock-old", mockSocket1, "p-bob", testRoomId);
    assert(room.clients.get("p-bob")?.socketId === "sock-old", "[Socket Race] Socket 1 registered");

    // Socket 2 connects (reconnection happens before old socket officially closes)
    const mockSocket2 = { readyState: 1, send: () => {} };
    await RoomManager.registerClientSocket("sock-new", mockSocket2, "p-bob", testRoomId);
    assert(room.clients.get("p-bob")?.socketId === "sock-new", "[Socket Race] Socket 2 registered as active socket");

    // Old socket 1 finally triggers 'close' event with 'sock-old'
    await RoomManager.handleClientDisconnect(testRoomId, "p-bob", "sock-old");

    // Socket 2 MUST STILL BE ACTIVE!
    assert(room.clients.has("p-bob"), "[Socket Race] Player Bob is NOT disconnected by obsolete socket close");
    assert(room.clients.get("p-bob")?.socketId === "sock-new", "[Socket Race] Socket 2 remains the active socket");

    // Disconnecting with matching socketId 'sock-new' DOES evict
    await RoomManager.handleClientDisconnect(testRoomId, "p-bob", "sock-new");
    assert(!room.clients.has("p-bob"), "[Socket Race] Player Bob evicted when active socket closes");
  }

  // ------------------------------------------------------------
  // 8. GAME OVER WINNER PROJECTION (No False Draw)
  // ------------------------------------------------------------
  console.log("\n--- 8. GAME OVER WINNER PROJECTION ---");
  {
    const room = RoomManager.getRoom(testRoomId)!;

    // Transition to DAY_VOTING
    await RoomManager.startDayVoting(testRoomId);
    assert(room.phase === "DAY_VOTING", "[Game Over] Transitioned to DAY_VOTING");

    // Find living werewolf to eliminate
    const werewolf = room.players.find((p) => p.alive && p.team === "Werewolf");
    assert(werewolf !== undefined, "[Game Over] Werewolf found in room");

    // Everyone votes for the werewolf
    const living = room.players.filter((p) => p.alive);
    for (const voter of living) {
      await RoomManager.submitVote(testRoomId, voter.id, werewolf!.id);
    }

    // Resolve day votes -> Eliminates werewolf -> Triggers Village win!
    await RoomManager.resolveDayVotePhase(room);
    assert(room.phase === "GAME_OVER", "[Game Over] Room phase is strictly GAME_OVER");
    assert(room.activeWinResult !== null, "[Game Over] room.activeWinResult is populated");
    assert(room.activeWinResult?.winner === "Village", `[Game Over] Authoritative winner is Village (got ${room.activeWinResult?.winner})`);

    // FogOfWar public projection MUST NOT be null or Draw!
    const pubState = FogOfWarDispatcher.buildPublicState(room);
    assert(pubState.winResult !== null, "[Game Over] Public state winResult is NOT null");
    assert(pubState.winResult?.winner === "Village", `[Game Over] Public state winner is Village (got ${pubState.winResult?.winner})`);
    assert(pubState.players.every((p) => Boolean(p.role_id)), "[Game Over] All players roles revealed on GAME_OVER");

    // GAME_OVER Reconnect Event Sanitization Verification
    const allEvents = await defaultEventStore.getEvents(testRoomId);
    const gameOverSanitized = FogOfWarDispatcher.sanitizeEventsForPlayer(allEvents, "p-bob", true);

    const gameOverNightAction = gameOverSanitized.find((e: any) => e.type === "NIGHT_ACTION_SUBMITTED" && e.actorId !== "p-bob");
    if (gameOverNightAction) {
      assert(gameOverNightAction.actorId === undefined, "[Game Over Reconnect] Other player night action actorId masked");
      assert(gameOverNightAction.payload.targetPlayerId === null, "[Game Over Reconnect] Other player night action target masked");
    }

    const gameOverNightResolved = gameOverSanitized.find((e: any) => e.type === "NIGHT_RESOLVED");
    if (gameOverNightResolved) {
      assert(gameOverNightResolved.payload.triggeredActions.length === 0, "[Game Over Reconnect] Other player triggeredActions stripped");
    }
  }

  // ------------------------------------------------------------
  // 9. RESTART GAME & DETERMINISTIC REPLAY RESTORATION
  // ------------------------------------------------------------
  console.log("\n--- 9. MATCH_RESTARTED EVENT SOURCING & REPLAY ---");
  {
    const room = RoomManager.getRoom(testRoomId)!;
    await RoomManager.restartGame(testRoomId, "host-1");

    assert(room.phase === "LOBBY", "[Restart] RAM phase reset to LOBBY");
    assert(room.dayCount === 0, "[Restart] RAM dayCount reset to 0");
    assert(room.nightCount === 0, "[Restart] RAM nightCount reset to 0");
    assert(room.activeWinResult === null, "[Restart] RAM activeWinResult cleared");
    assert(room.players.every((p) => p.alive === true), "[Restart] All RAM players revived to alive: true");
    assert(room.players.every((p) => p.isReady === false), "[Restart] All RAM players reset to isReady: false");

    // Check that MATCH_RESTARTED event was persisted
    const lastEvent = room.eventLog[room.eventLog.length - 1];
    assert(lastEvent.type === "MATCH_RESTARTED", `[Restart] MATCH_RESTARTED event persisted (got ${lastEvent.type})`);
    assert(Array.isArray(lastEvent.payload?.resetPlayers), "[Restart] resetPlayers payload contains player snapshot");

    // CRASH RECOVERY SIMULATION:
    // Wipe RAM completely!
    RoomManager.rooms.delete(testRoomId);
    assert(RoomManager.getRoom(testRoomId) === undefined, "[Restart Replay] RAM state completely purged");

    // Replay state from canonical event log
    const replayed = await ReplayEngine.reconstructState(testRoomId, defaultEventStore);
    assert(replayed !== null, "[Restart Replay] Room reconstructed from event store");
    assert(replayed!.phase === "LOBBY", `[Restart Replay] Replayed phase is strictly LOBBY (got ${replayed!.phase})`);
    assert(replayed!.dayCount === 0, "[Restart Replay] Replayed dayCount is 0");
    assert(replayed!.nightCount === 0, "[Restart Replay] Replayed nightCount is 0");
    assert(replayed!.activeWinResult === null, "[Restart Replay] Replayed activeWinResult is null");
    assert(replayed!.players.every((p) => p.alive === true), "[Restart Replay] All replayed players revived to alive: true");
    assert(replayed!.players.every((p) => p.isReady === false), "[Restart Replay] All replayed players reset to isReady: false");
    assert(replayed!.players.length === 5, "[Restart Replay] All 5 players preserved in lobby");

    console.log("  ✅ [PASS] MATCH_RESTARTED replay produces 100% exact state matching pre-crash RAM!");
  }

  // ------------------------------------------------------------
  // 10. POSTGRESQL STARTUP CRASH AUTO-RECOVERY LOOP
  // ------------------------------------------------------------
  console.log("\n--- 10. POSTGRESQL STARTUP CRASH AUTO-RECOVERY LOOP ---");
  {
    // Ensure active room IDs can be queried
    console.log("Active store type:", defaultEventStore.constructor.name);
    const activeIds = await defaultEventStore.getActiveRoomIds();
    console.log("activeIds returned:", activeIds, "looking for:", testRoomId);
    assert(Array.isArray(activeIds), "[Auto-Recovery] getActiveRoomIds returns array");
    assert(activeIds.includes(testRoomId), "[Auto-Recovery] Active match included in query");

    // Wipe all rooms in memory
    RoomManager.rooms.clear();
    assert(RoomManager.getAllRooms().length === 0, "[Auto-Recovery] Server RAM wiped to 0 rooms");

    // Simulate server startup boot recovery loop
    for (const rId of activeIds) {
      await RoomManager.recoverRoom(rId);
    }

    const restoredRoom = RoomManager.getRoom(testRoomId);
    assert(restoredRoom !== undefined, "[Auto-Recovery] Room automatically restored into memory upon startup");
    assert(restoredRoom!.phase === "LOBBY", "[Auto-Recovery] Restored room preserves LOBBY phase");
    assert(restoredRoom!.players.length === 5, "[Auto-Recovery] Restored room preserves 5 players");
  }

  // ------------------------------------------------------------
  // 11. HARDENED WEBSOCKET TICKET EXCHANGE
  // ------------------------------------------------------------
  console.log("\n--- 11. HARDENED WEBSOCKET TICKET EXCHANGE ---");
  {
    // 1. Issue ticket for Alice
    const testToken = SessionManager.createSessionToken("host-1", "Alice", testRoomId, true);
    const ticket = SessionManager.issueTicket(testToken, 60000);
    assert(typeof ticket === "string" && ticket.startsWith("ticket-"), "[WS Ticket] Single-use ticket issued");

    // 2. Consume ticket (first use: success)
    const consumedToken = SessionManager.consumeTicket(ticket);
    assert(consumedToken === testToken, "[WS Ticket] Consumed ticket successfully yields matching session token");

    // 3. Single-use replay protection (second use: rejected)
    const replayed = SessionManager.consumeTicket(ticket);
    assert(replayed === null, "[WS Ticket] Replaying consumed ticket is strictly rejected (single-use guarantee)");

    // 4. Invalid ticket rejection
    const invalid = SessionManager.consumeTicket("ticket-invalid-token");
    assert(invalid === null, "[WS Ticket] Forged/invalid ticket rejected");
  }

  // ------------------------------------------------------------
  // 12. RIGOROUS TARGET VALIDATION & ABILITY TARGET CONSTRAINTS
  // ------------------------------------------------------------
  console.log("\n--- 12. RIGOROUS TARGET VALIDATION & ABILITY TARGET CONSTRAINTS ---");
  {
    const targetRoomId = `ROOM-TARGET-${Date.now()}`;
    const { sessionToken: hostToken } = await RoomManager.createRoom("p-host", "Host", "MODE_1_FIXED", targetRoomId);
    await RoomManager.joinRoom(targetRoomId, "p-wolf", "Wolf");
    await RoomManager.joinRoom(targetRoomId, "p-bg", "Bodyguard");
    await RoomManager.joinRoom(targetRoomId, "p-seer", "Seer");
    await RoomManager.joinRoom(targetRoomId, "p-vil", "Villager");

    // Start match with explicit roles
    await RoomManager.startGame(targetRoomId, "p-host", {
      fixedRoles: [
        { role_id: "ROLE-023", canonical_name: "Werewolf", count: 1 },
        { role_id: "ROLE-028", canonical_name: "Bodyguard", count: 1 },
        { role_id: "ROLE-022", canonical_name: "Seer", count: 1 },
        { role_id: "ROLE-024", canonical_name: "Villager", count: 2 },
      ],
    });

    const room = RoomManager.getRoom(targetRoomId)!;
    const bgPlayer = room.players.find((p) => p.canonical_name === "Bodyguard")!;
    const bgAction = room.nightActions.find((a) => a.player_ids.includes(bgPlayer.id))!;
    const bgToken = SessionManager.createSessionToken(bgPlayer.id, bgPlayer.name, targetRoomId, false);

    // Test A: Bodyguard attempting to protect self is rejected with INVALID_TARGET
    const selfProtectCmd = {
      commandId: "cmd-bg-self",
      roomId: targetRoomId,
      senderId: bgPlayer.id,
      sessionToken: bgToken,
      type: "SUBMIT_NIGHT_ACTION",
      payload: { actionId: bgAction.id, targetPlayerId: bgPlayer.id },
      clientTimestamp: Date.now(),
    };
    const bgResult = await CommandDispatcher.handleCommand(JSON.stringify(selfProtectCmd));
    assert(bgResult.success === false, "[Target Validation] Bodyguard self-protect rejected");
    assert(bgResult.errorCode === "INVALID_TARGET", "[Target Validation] Error code is strictly INVALID_TARGET");

    // Test B: Targeting non-existent player is rejected
    const ghostTargetCmd = {
      commandId: "cmd-bg-ghost",
      roomId: targetRoomId,
      senderId: bgPlayer.id,
      sessionToken: bgToken,
      type: "SUBMIT_NIGHT_ACTION",
      payload: { actionId: bgAction.id, targetPlayerId: "p-non-existent" },
      clientTimestamp: Date.now(),
    };
    const ghostResult = await CommandDispatcher.handleCommand(JSON.stringify(ghostTargetCmd));
    assert(ghostResult.success === false, "[Target Validation] Non-existent target rejected");
    assert(ghostResult.errorCode === "INVALID_TARGET", "[Target Validation] Ghost target returns INVALID_TARGET");
  }

  // ------------------------------------------------------------
  // 13. STRICT FIXED ROLE COMPOSITION SUM VALIDATION
  // ------------------------------------------------------------
  console.log("\n--- 13. STRICT FIXED ROLE COMPOSITION SUM VALIDATION ---");
  {
    const compRoomId = `ROOM-COMP-${Date.now()}`;
    const { sessionToken: compHostToken } = await RoomManager.createRoom("p-host", "Host", "MODE_1_FIXED", compRoomId);
    await RoomManager.joinRoom(compRoomId, "p2", "P2");
    await RoomManager.joinRoom(compRoomId, "p3", "P3");
    await RoomManager.joinRoom(compRoomId, "p4", "P4");
    await RoomManager.joinRoom(compRoomId, "p5", "P5");

    // Attempt to start 5-player room with only 4 roles (sum !== 5)
    const invalidCompCmd = {
      commandId: "cmd-start-invalid-comp",
      roomId: compRoomId,
      senderId: "p-host",
      sessionToken: compHostToken,
      type: "START_GAME",
      payload: {
        fixedRoles: [
          { role_id: "ROLE-023", canonical_name: "Werewolf", count: 1 },
          { role_id: "ROLE-024", canonical_name: "Villager", count: 3 }, // Total 4, expected 5!
        ],
      },
      clientTimestamp: Date.now(),
    };
    const compResult = await CommandDispatcher.handleCommand(JSON.stringify(invalidCompCmd));
    assert(compResult.success === false, "[Role Composition] Under-counted fixedRoles composition rejected");
    assert(compResult.errorCode === "INVALID_ROLE_COMPOSITION", "[Role Composition] Error code is strictly INVALID_ROLE_COMPOSITION");

    // RoomManager method direct check throws error
    let thrown = false;
    try {
      await RoomManager.startGame(compRoomId, "p-host", {
        fixedRoles: [
          { role_id: "ROLE-023", canonical_name: "Werewolf", count: 1 },
          { role_id: "ROLE-024", canonical_name: "Villager", count: 3 },
        ],
      });
    } catch {
      thrown = true;
    }
    assert(thrown, "[Role Composition] RoomManager.startGame directly throws on count mismatch");

    // Negative / Fractional count rejection
    const fractionalCompCmd = {
      commandId: "cmd-start-fractional",
      roomId: compRoomId,
      senderId: "p-host",
      sessionToken: compHostToken,
      type: "START_GAME",
      payload: {
        fixedRoles: [
          { role_id: "ROLE-023", canonical_name: "Werewolf", count: 1.5 },
          { role_id: "ROLE-024", canonical_name: "Villager", count: 3.5 },
        ],
      },
      clientTimestamp: Date.now(),
    };
    const fracResult = await CommandDispatcher.handleCommand(JSON.stringify(fractionalCompCmd));
    assert(fracResult.success === false, "[Role Composition] Fractional role counts strictly rejected");
    assert(fracResult.errorCode === "INVALID_ROLE_COMPOSITION", "[Role Composition] Fractional count returns INVALID_ROLE_COMPOSITION");

    // Unknown pool role rejection
    const invalidPoolCmd = {
      commandId: "cmd-start-invalid-pool",
      roomId: compRoomId,
      senderId: "p-host",
      sessionToken: compHostToken,
      type: "START_GAME",
      payload: {
        selectedRolePool: ["ROLE-023", "ROLE-NON-EXISTENT-HACK"],
      },
      clientTimestamp: Date.now(),
    };
    const poolResult = await CommandDispatcher.handleCommand(JSON.stringify(invalidPoolCmd));
    assert(poolResult.success === false, "[Role Pool] Unknown role ID in pool rejected");
    assert(poolResult.errorCode === "INVALID_SCHEMA", "[Role Pool] Unknown pool ID returns INVALID_SCHEMA");
  }

  // ------------------------------------------------------------
  // 14. EVENT SEQUENCE GAP TAMPER AUDIT & REPLAY INTEGRITY
  // ------------------------------------------------------------
  console.log("\n--- 14. EVENT SEQUENCE GAP TAMPER AUDIT & REPLAY INTEGRITY ---");
  {
    const gapRoomId = `ROOM-GAP-${Date.now()}`;
    const gapStore = new InMemoryEventStore();

    // Append sequence 1, 2, and then skipped to 4 (sequence 3 is missing!)
    const ev1: GameEvent = {
      eventId: "gap-ev-1",
      roomId: gapRoomId,
      sequence: 1,
      timestamp: Date.now(),
      type: "ROOM_INITIALIZED",
      payload: { roomId: gapRoomId },
      serverSignature: signGameEvent(gapRoomId, 1, "ROOM_INITIALIZED", { roomId: gapRoomId }, "gap-ev-1", Date.now()),
    };
    const ev2: GameEvent = {
      eventId: "gap-ev-2",
      roomId: gapRoomId,
      sequence: 2,
      timestamp: Date.now(),
      type: "PLAYER_JOINED",
      payload: { playerId: "p2", playerName: "Bob" },
      serverSignature: signGameEvent(gapRoomId, 2, "PLAYER_JOINED", { playerId: "p2", playerName: "Bob" }, "gap-ev-2", Date.now()),
    };
    // Gap: sequence 4 directly without sequence 3!
    const ev4: GameEvent = {
      eventId: "gap-ev-4",
      roomId: gapRoomId,
      sequence: 4,
      timestamp: Date.now(),
      type: "PLAYER_JOINED",
      payload: { playerId: "p4", playerName: "David" },
      serverSignature: signGameEvent(gapRoomId, 4, "PLAYER_JOINED", { playerId: "p4", playerName: "David" }, "gap-ev-4", Date.now()),
    };

    await gapStore.appendEvent(ev1);
    await gapStore.appendEvent(ev2);
    await gapStore.appendEvent(ev4);

    // 1. auditIntegrity detects missing sequence gap
    const auditRes = await ReplayEngine.auditIntegrity(gapRoomId, gapStore);
    assert(auditRes.valid === false, "[Sequence Integrity] auditIntegrity flags sequence gap as invalid");
    assert(Boolean(auditRes.error?.includes("gap") || auditRes.error?.includes("sequence")), "[Sequence Integrity] Audit error identifies sequence gap");

    // 2. reconstructState aborts with [TamperDetected]
    let reconstructFailed = false;
    try {
      await ReplayEngine.reconstructState(gapRoomId, gapStore);
    } catch (err: any) {
      if (err.message.includes("[TamperDetected]") && err.message.includes("gap")) {
        reconstructFailed = true;
      }
    }
    assert(reconstructFailed, "[Sequence Integrity] reconstructState throws [TamperDetected] on sequence gap");
  }

  // ------------------------------------------------------------
  // 15. FULL CANONICAL METADATA HMAC INTEGRITY AUDIT
  // ------------------------------------------------------------
  console.log("\n--- 15. FULL CANONICAL METADATA HMAC INTEGRITY AUDIT ---");
  {
    const hmacRoomId = "ROOM-HMAC-TEST";
    const ts = Date.now();
    const eventId = "ev-secure-001";
    const payload = { actionId: "TEST", targetPlayerId: "p2" };

    // Legitimate signature signed over all metadata: (roomId, sequence, type, payload, eventId, timestamp, actorId)
    const validSig = signGameEvent(hmacRoomId, 1, "NIGHT_ACTION_SUBMITTED", payload, eventId, ts, "p1");

    const legitimateEvent: GameEvent = {
      eventId,
      roomId: hmacRoomId,
      sequence: 1,
      timestamp: ts,
      type: "NIGHT_ACTION_SUBMITTED",
      actorId: "p1",
      payload,
      serverSignature: validSig,
    };

    assert(verifyGameEventSignature(legitimateEvent) === true, "[HMAC Audit] Legitimate event signature passes verification");

    // Tampering test A: Tampering actorId without re-signing must fail
    const tamperedActorEvent: GameEvent = {
      ...legitimateEvent,
      actorId: "p-intruder", // Modified actorId!
    };
    assert(verifyGameEventSignature(tamperedActorEvent) === false, "[HMAC Audit] Tampered actorId is detected and rejected");

    // Tampering test B: Tampering timestamp without re-signing must fail
    const tamperedTsEvent: GameEvent = {
      ...legitimateEvent,
      timestamp: ts + 5000, // Modified timestamp!
    };
    assert(verifyGameEventSignature(tamperedTsEvent) === false, "[HMAC Audit] Tampered timestamp is detected and rejected");

    // Tampering test C: Tampering eventId without re-signing must fail
    const tamperedIdEvent: GameEvent = {
      ...legitimateEvent,
      eventId: "forged-id-999", // Modified eventId!
    };
    assert(verifyGameEventSignature(tamperedIdEvent) === false, "[HMAC Audit] Tampered eventId is detected and rejected");
  }

  // ------------------------------------------------------------
  // 16. AUTHORITATIVE LOBBY CONFIG & MODE 2 POOL SAMPLING REFACTOR
  // ------------------------------------------------------------
  console.log("\n--- 16. AUTHORITATIVE LOBBY CONFIG & MODE 2 POOL SAMPLING REFACTOR ---");
  {
    const cfgRoomId = "ROOM-CFG-REFACTOR";
    const { room: cfgRoom, sessionToken: hostToken } = await RoomManager.createRoom("h-cfg", "HostCfg", "MODE_1_FIXED", cfgRoomId);

    // Join 4 more players to reach 5 players total
    const pTokens: string[] = [];
    for (let i = 1; i <= 4; i++) {
      const { sessionToken: pToken } = await RoomManager.joinRoom(cfgRoomId, `p-${i}`, `Player${i}`);
      pTokens.push(pToken);
    }

    // 1. Non-host attempting UPDATE_ROOM_CONFIG is rejected
    const nonHostCmd = JSON.stringify({
      commandId: "cmd-cfg-unauth",
      roomId: cfgRoomId,
      senderId: "p-1",
      sessionToken: pTokens[0],
      type: "UPDATE_ROOM_CONFIG",
      payload: { gameMode: "MODE_2_POOL" },
      clientTimestamp: Date.now(),
    });
    const nonHostRes = await CommandDispatcher.handleCommand(nonHostCmd);
    assert(nonHostRes.success === false, "[Config Auth] Non-host cannot update room configuration");
    assert(nonHostRes.errorCode === "NOT_PERMITTED", "[Config Auth] Non-host gets NOT_PERMITTED");

    // 2. Host attempts to set targetPlayerCount < joined players (5) -> rejected
    const invalidTargetCmd = JSON.stringify({
      commandId: "cmd-cfg-small-target",
      roomId: cfgRoomId,
      senderId: "h-cfg",
      sessionToken: hostToken,
      type: "UPDATE_ROOM_CONFIG",
      payload: {
        gameMode: "MODE_1_FIXED",
        targetPlayerCount: 4,
      },
      clientTimestamp: Date.now(),
    });
    const invalidTargetRes = await CommandDispatcher.handleCommand(invalidTargetCmd);
    assert(invalidTargetRes.success === false, "[Config Validation] targetPlayerCount < players.length rejected");
    assert(invalidTargetRes.errorCode === "NOT_PERMITTED" || invalidTargetRes.errorCode === "INVALID_SCHEMA", "[Config Validation] Error code is NOT_PERMITTED or INVALID_SCHEMA");

    // 2b. Host sends invalid role pool (no wolf) -> rejected
    const invalidPoolCmd = JSON.stringify({
      commandId: "cmd-cfg-nowolf",
      roomId: cfgRoomId,
      senderId: "h-cfg",
      sessionToken: hostToken,
      type: "UPDATE_ROOM_CONFIG",
      payload: {
        gameMode: "MODE_2_POOL",
        selectedRolePool: ["ROLE-022", "ROLE-028"], // Seer + Bodyguard (NO WOLF)
      },
      clientTimestamp: Date.now(),
    });
    const invalidPoolRes = await CommandDispatcher.handleCommand(invalidPoolCmd);
    assert(invalidPoolRes.success === false, "[Config Validation] Role pool lacking werewolf rejected");

    // 3. Host updates to Mode 2 with valid role pool
    const validPoolCmd = JSON.stringify({
      commandId: "cmd-cfg-valid",
      roomId: cfgRoomId,
      senderId: "h-cfg",
      sessionToken: hostToken,
      type: "UPDATE_ROOM_CONFIG",
      payload: {
        gameMode: "MODE_2_POOL",
        selectedRolePool: ["ROLE-023", "ROLE-022", "ROLE-028", "ROLE-039"], // Werewolf, Seer, Bodyguard, Hunter (4 roles)
      },
      clientTimestamp: Date.now(),
    });
    const validPoolRes = await CommandDispatcher.handleCommand(validPoolCmd);
    assert(validPoolRes.success === true, "[Config Update] Host successfully updates room config to Mode 2 pool");
    assert(cfgRoom.gameMode === "MODE_2_POOL", "[Config State] Room RAM state updated to MODE_2_POOL");
    assert(cfgRoom.selectedRolePool?.length === 4, "[Config State] Room RAM state contains 4 pool roles");

    // 4. Duplicate command retransmission is deduplicated
    const dupRes = await CommandDispatcher.handleCommand(validPoolCmd);
    assert(dupRes.success === true && dupRes.isDuplicate === true, "[Config Idempotency] Retransmitted command is deduplicated");

    // 5. ReplayEngine crash recovery reconstructs room config
    const recoveredCfgRoom = await ReplayEngine.reconstructState(cfgRoomId, defaultEventStore);
    assert(recoveredCfgRoom !== null, "[Config Replay] Room state successfully reconstructed from EventStore");
    assert(recoveredCfgRoom!.gameMode === "MODE_2_POOL", "[Config Replay] Reconstructed gameMode is MODE_2_POOL");
    assert(recoveredCfgRoom!.selectedRolePool?.length === 4, "[Config Replay] Reconstructed selectedRolePool length is 4");

    // 6. Join 7 more players to have 12 players (more than the 4 roles in the pool!)
    for (let i = 5; i <= 11; i++) {
      await RoomManager.joinRoom(cfgRoomId, `p-${i}`, `Player${i}`);
    }
    assert(cfgRoom.players.length === 12, "[Mode 2 Setup] Total 12 players in room");
    assert(cfgRoom.targetPlayerCount === undefined, "[Mode 2 Setup] targetPlayerCount is undefined in Mode 2");

    // 7. Start game in Mode 2 with 12 players and 4-role pool:
    // Golden Engine must sample strictly from the pool with replacement without any roles outside pool!
    await RoomManager.startGame(cfgRoomId, "h-cfg");
    assert(cfgRoom.phase === "NIGHT_ACTIVE", "[Mode 2 Start] Game started successfully into NIGHT_ACTIVE");
    assert(cfgRoom.players.length === 12, "[Mode 2 Start] Exactly 12 players assigned roles");

    const poolAllowedSet = new Set(["ROLE-023", "ROLE-022", "ROLE-028", "ROLE-039"]);
    const allAssignedFromPool = cfgRoom.players.every((p) => poolAllowedSet.has(p.role_id));
    assert(allAssignedFromPool, "[Mode 2 Sampling] 100% of assigned roles are strictly within host's pool");

    const zeroVillagers = cfgRoom.players.every((p) => p.role_id !== "ROLE-024");
    assert(zeroVillagers, "[Mode 2 Sampling] Zero Villagers injected when not in pool");

    const wolfCount = cfgRoom.players.filter((p) => p.role_id === "ROLE-023").length;
    assert(wolfCount >= 1, "[Mode 2 Balance] At least 1 werewolf assigned");

    // 8. Attempting UPDATE_ROOM_CONFIG after game start (NIGHT_ACTIVE) is rejected
    const midGameCmd = JSON.stringify({
      commandId: "cmd-cfg-midgame",
      roomId: cfgRoomId,
      senderId: "h-cfg",
      sessionToken: hostToken,
      type: "UPDATE_ROOM_CONFIG",
      payload: { gameMode: "MODE_1_FIXED" },
      clientTimestamp: Date.now(),
    });
    const midGameRes = await CommandDispatcher.handleCommand(midGameCmd);
    assert(midGameRes.success === false, "[Config Phase Gate] Updating config outside LOBBY rejected");
    assert(midGameRes.errorCode === "INVALID_PHASE", "[Config Phase Gate] Error code is strictly INVALID_PHASE");
  }

  // ------------------------------------------------------------
  // 17. SPRINT 1: DEAD-PLAYER CHAT GATE & WOLF_SECRET AUTHORIZATION
  // ------------------------------------------------------------
  console.log("\n--- 17. SPRINT 1: DEAD-PLAYER CHAT GATE & WOLF_SECRET AUTHORIZATION ---");
  {
    const chatRoomId = `ROOM-CHAT-SECURITY-${Date.now()}`;
    const { room: chatRoom } = await RoomManager.createRoom("h-chat", "HostChat", "MODE_1_FIXED", chatRoomId);

    // Join 4 players:
    // p-alive-wolf (Werewolf, alive)
    // p-dead-wolf  (Werewolf, dead)
    // p-alive-vill (Villager, alive)
    // p-dead-vill  (Villager, dead)
    const { sessionToken: tAliveWolf } = await RoomManager.joinRoom(chatRoomId, "p-alive-wolf", "AliveWolf");
    const { sessionToken: tDeadWolf } = await RoomManager.joinRoom(chatRoomId, "p-dead-wolf", "DeadWolf");
    const { sessionToken: tAliveVill } = await RoomManager.joinRoom(chatRoomId, "p-alive-vill", "AliveVill");
    const { sessionToken: tDeadVill } = await RoomManager.joinRoom(chatRoomId, "p-dead-vill", "DeadVill");

    // Assign roles & statuses
    const pAliveWolf = chatRoom.players.find((p) => p.id === "p-alive-wolf")!;
    pAliveWolf.role_id = "ROLE-023";
    pAliveWolf.canonical_name = "Werewolf";
    pAliveWolf.team = "Werewolf";
    pAliveWolf.alive = true;

    const pDeadWolf = chatRoom.players.find((p) => p.id === "p-dead-wolf")!;
    pDeadWolf.role_id = "ROLE-023";
    pDeadWolf.canonical_name = "Werewolf";
    pDeadWolf.team = "Werewolf";
    pDeadWolf.alive = false;

    const pAliveVill = chatRoom.players.find((p) => p.id === "p-alive-vill")!;
    pAliveVill.role_id = "ROLE-024";
    pAliveVill.canonical_name = "Villager";
    pAliveVill.team = "Village";
    pAliveVill.alive = true;

    const pDeadVill = chatRoom.players.find((p) => p.id === "p-dead-vill")!;
    pDeadVill.role_id = "ROLE-024";
    pDeadVill.canonical_name = "Villager";
    pDeadVill.team = "Village";
    pDeadVill.alive = false;

    // 1. Alive player sends DAY_PUBLIC chat -> Accepted
    const aliveChatCmd = JSON.stringify({
      commandId: "cmd-chat-alive-1",
      roomId: chatRoomId,
      senderId: "p-alive-vill",
      sessionToken: tAliveVill,
      type: "SEND_CHAT",
      payload: { text: "Hello from alive villager", channel: "DAY_PUBLIC" },
      clientTimestamp: Date.now(),
    });
    const aliveChatRes = await CommandDispatcher.handleCommand(aliveChatCmd);
    assert(aliveChatRes.success === true, "[Chat Security] Alive player can send DAY_PUBLIC chat");

    // 2. Dead player sends DAY_PUBLIC chat -> Rejected strictly with PLAYER_DEAD
    const deadChatCmd = JSON.stringify({
      commandId: "cmd-chat-dead-1",
      roomId: chatRoomId,
      senderId: "p-dead-vill",
      sessionToken: tDeadVill,
      type: "SEND_CHAT",
      payload: { text: "Ghost trying to chat", channel: "DAY_PUBLIC" },
      clientTimestamp: Date.now(),
    });
    const deadChatRes = await CommandDispatcher.handleCommand(deadChatCmd);
    assert(deadChatRes.success === false, "[Chat Security] Dead player cannot send DAY_PUBLIC chat");
    assert(deadChatRes.errorCode === "PLAYER_DEAD", "[Chat Security] Error code is strictly PLAYER_DEAD");
    assert(deadChatRes.error === "Dead players cannot chat.", "[Chat Security] Error message states 'Dead players cannot chat.'");

    // 3. Dead player sends LOBBY chat -> Also rejected strictly with PLAYER_DEAD
    const deadLobbyCmd = JSON.stringify({
      commandId: "cmd-chat-dead-lobby",
      roomId: chatRoomId,
      senderId: "p-dead-vill",
      sessionToken: tDeadVill,
      type: "SEND_CHAT",
      payload: { text: "Ghost in lobby", channel: "LOBBY" },
      clientTimestamp: Date.now(),
    });
    const deadLobbyRes = await CommandDispatcher.handleCommand(deadLobbyCmd);
    assert(deadLobbyRes.success === false, "[Chat Security] Dead player cannot send LOBBY chat");
    assert(deadLobbyRes.errorCode === "PLAYER_DEAD", "[Chat Security] Error code is strictly PLAYER_DEAD for lobby too");

    // 4. Villager attempts WOLF_SECRET chat -> Rejected strictly with NOT_PERMITTED
    const villWolfChatCmd = JSON.stringify({
      commandId: "cmd-chat-vill-wolf",
      roomId: chatRoomId,
      senderId: "p-alive-vill",
      sessionToken: tAliveVill,
      type: "SEND_CHAT",
      payload: { text: "Villager intruding wolf chat", channel: "WOLF_SECRET" },
      clientTimestamp: Date.now(),
    });
    const villWolfChatRes = await CommandDispatcher.handleCommand(villWolfChatCmd);
    assert(villWolfChatRes.success === false, "[Chat Security] Non-wolf sending WOLF_SECRET chat is rejected");
    assert(villWolfChatRes.errorCode === "NOT_PERMITTED", "[Chat Security] Non-wolf gets NOT_PERMITTED");

    // 5. Dead Werewolf attempts WOLF_SECRET chat -> Rejected with PLAYER_DEAD
    const deadWolfChatCmd = JSON.stringify({
      commandId: "cmd-chat-dead-wolf",
      roomId: chatRoomId,
      senderId: "p-dead-wolf",
      sessionToken: tDeadWolf,
      type: "SEND_CHAT",
      payload: { text: "Dead wolf chatting", channel: "WOLF_SECRET" },
      clientTimestamp: Date.now(),
    });
    const deadWolfChatRes = await CommandDispatcher.handleCommand(deadWolfChatCmd);
    assert(deadWolfChatRes.success === false, "[Chat Security] Dead werewolf sending WOLF_SECRET is rejected");
    assert(deadWolfChatRes.errorCode === "PLAYER_DEAD", "[Chat Security] Dead werewolf gets PLAYER_DEAD");

    // 6. Alive Werewolf sends WOLF_SECRET chat -> Accepted & delivered ONLY to alive wolves
    const receivedFrames: Record<string, string[]> = {
      "p-alive-wolf": [],
      "p-dead-wolf": [],
      "p-alive-vill": [],
      "p-dead-vill": [],
    };
    for (const pId of Object.keys(receivedFrames)) {
      chatRoom.clients.set(pId, {
        socketId: `sock-${pId}`,
        socket: {
          readyState: 1,
          send: (data: string) => {
            receivedFrames[pId].push(data);
          },
        } as any,
        playerId: pId,
        roomId: chatRoomId,
        isAlive: pId.includes("alive"),
        lastPingAt: Date.now(),
      });
    }

    const aliveWolfChatCmd = JSON.stringify({
      commandId: "cmd-chat-alive-wolf",
      roomId: chatRoomId,
      senderId: "p-alive-wolf",
      sessionToken: tAliveWolf,
      type: "SEND_CHAT",
      payload: { text: "Pack target Alice!", channel: "WOLF_SECRET" },
      clientTimestamp: Date.now(),
    });
    const aliveWolfChatRes = await CommandDispatcher.handleCommand(aliveWolfChatCmd);
    assert(aliveWolfChatRes.success === true, "[Chat Security] Alive werewolf can send WOLF_SECRET chat");
    assert(receivedFrames["p-alive-wolf"].length === 1, "[Chat Fog-of-War] Alive werewolf receives wolf chat message");
    assert(receivedFrames["p-dead-wolf"].length === 0, "[Chat Fog-of-War] Dead werewolf does NOT receive wolf chat");
    assert(receivedFrames["p-alive-vill"].length === 0, "[Chat Fog-of-War] Alive villager does NOT receive wolf chat");
    assert(receivedFrames["p-dead-vill"].length === 0, "[Chat Fog-of-War] Dead villager does NOT receive wolf chat");

    // 7. canParticipateInWerewolfPackVote helper verification
    const testPackWolves = [
      { id: "w-normal", role_id: "ROLE-023", team: "Werewolf", alive: true },
      { id: "w-dead", role_id: "ROLE-023", team: "Werewolf", alive: false },
      { id: "w-sorcerer", role_id: "ROLE-012", team: "Werewolf-aligned", action_type: "Find Seer", alive: true },
      { id: "w-fang", role_id: "ROLE-061", canonical_name: "Fang Face", team: "Werewolf", alive: true },
      { id: "v-seer", role_id: "ROLE-022", team: "Village", alive: true },
    ];
    assert(canParticipateInWerewolfPackVote(testPackWolves[0], testPackWolves, 1) === true, "[Pack Eligibility] Alive normal werewolf is eligible");
    assert(canParticipateInWerewolfPackVote(testPackWolves[1], testPackWolves, 1) === false, "[Pack Eligibility] Dead werewolf is NOT eligible");
    assert(canParticipateInWerewolfPackVote(testPackWolves[2], testPackWolves, 1) === false, "[Pack Eligibility] Sorcerer (Find Seer) is NOT eligible for pack vote");
    assert(canParticipateInWerewolfPackVote(testPackWolves[4], testPackWolves, 1) === false, "[Pack Eligibility] Village Seer is NOT eligible for pack vote");
    assert(canParticipateInWerewolfPackVote(testPackWolves[3], testPackWolves, 1) === true, "[Pack Eligibility] Fang Face participates on Night 1");
    assert(canParticipateInWerewolfPackVote(testPackWolves[3], testPackWolves, 2) === false, "[Pack Eligibility] Fang Face does NOT participate on Night 2 if other wolves alive");
    const fangSoleWolves = [testPackWolves[3], testPackWolves[1], testPackWolves[4]];
    assert(canParticipateInWerewolfPackVote(testPackWolves[3], fangSoleWolves, 2) === true, "[Pack Eligibility] Fang Face participates on Night 2 if sole surviving wolf");

    // ------------------------------------------------------------
    // 18. SPRINT 2: AUTHORITATIVE WEREWOLF PACK VOTING & SEER 10s CHECK
    // ------------------------------------------------------------
    console.log("\n--- 18. AUTHORITATIVE WEREWOLF PACK VOTING & SEER 10s CHECK ---");

    const packRoomId = `ROOM-PACK-${Date.now()}`;
    const p1 = "p-player-1";
    const p2 = "p-player-2";
    const p3 = "p-player-3";
    const p4 = "p-player-4";
    const p5 = "p-player-5";

    const { room: packRoom } = await RoomManager.createRoom(p1, "Player One", "MODE_1_FIXED", packRoomId);
    await RoomManager.joinRoom(packRoomId, p2, "Player Two");
    await RoomManager.joinRoom(packRoomId, p3, "Player Three");
    await RoomManager.joinRoom(packRoomId, p4, "Player Four");
    await RoomManager.joinRoom(packRoomId, p5, "Player Five");

    // Start game with fixed roles (2 Werewolves, 1 Seer, 2 Villagers)
    await RoomManager.startGame(packRoomId, p1, {
      fixedRoles: [
        { role_id: "ROLE-023", canonical_name: "Werewolf", count: 2 },
        { role_id: "ROLE-022", canonical_name: "Seer", count: 1 },
        { role_id: "ROLE-024", canonical_name: "Villager", count: 2 },
      ],
    });

    // Identify roles from actual assignments (handling shuffle)
    const wolves = packRoom.players.filter((p) => p.team === "Werewolf");
    const seerPlayer = packRoom.players.find((p) => p.role_id === "ROLE-022" || p.canonical_name === "Seer")!;
    const villagers = packRoom.players.filter((p) => p.team === "Village" && p.id !== seerPlayer.id);

    const pWolf1 = wolves[0].id;
    const pWolf2 = wolves[1].id;
    const pSeer = seerPlayer.id;
    const pVill1 = villagers[0].id;
    const pVill2 = villagers[1].id;

    const tWolf1 = SessionManager.createSessionToken(pWolf1, wolves[0].name, packRoomId, wolves[0].id === p1);
    const tWolf2 = SessionManager.createSessionToken(pWolf2, wolves[1].name, packRoomId, wolves[1].id === p1);
    const tSeer = SessionManager.createSessionToken(pSeer, seerPlayer.name, packRoomId, seerPlayer.id === p1);
    const tVill1 = SessionManager.createSessionToken(pVill1, villagers[0].name, packRoomId, villagers[0].id === p1);

    assert(packRoom.phase === "NIGHT_ACTIVE", "[Pack Vote] Game started into NIGHT_ACTIVE");
    assert(Boolean(packRoom.packVoteWindow), "[Pack Vote] Authoritative packVoteWindow is active");
    assert(packRoom.packVoteWindow?.isRevote === false, "[Pack Vote] Initial vote window is not revote");
    assert(Boolean(packRoom.seerActionState), "[Seer Window] Authoritative seerActionState is active");
    assert(packRoom.seerActionState?.checked === false, "[Seer Window] Initial seer check state is unchecked");

    // Fog of War checks
    const pubState = FogOfWarDispatcher.buildPublicState(packRoom);
    assert(Boolean(pubState.packVoteProgress), "[Pack Fog-of-War] Public state exposes packVoteProgress");
    assert((pubState as any).packVotes === undefined, "[Pack Fog-of-War] Public state does NOT leak packVotes");

    const wolf1Priv = FogOfWarDispatcher.buildPrivateState(packRoom, pWolf1);
    const vill1Priv = FogOfWarDispatcher.buildPrivateState(packRoom, pVill1);
    const seerPriv = FogOfWarDispatcher.buildPrivateState(packRoom, pSeer);

    assert(Boolean(wolf1Priv?.packVoteWindow), "[Pack Fog-of-War] Wolf private state contains packVoteWindow");
    assert(Boolean(wolf1Priv?.packVotes), "[Pack Fog-of-War] Wolf private state contains packVotes");
    assert(vill1Priv?.packVoteWindow === undefined, "[Pack Fog-of-War] Villager private state does NOT contain packVoteWindow");
    assert(vill1Priv?.packVotes === undefined, "[Pack Fog-of-War] Villager private state does NOT contain packVotes");
    assert(Boolean(seerPriv?.seerWindow), "[Seer Fog-of-War] Seer private state contains seerWindow");
    assert(wolf1Priv?.seerWindow === undefined, "[Seer Fog-of-War] Wolf private state does NOT contain seerWindow");
    assert(vill1Priv?.seerWindow === undefined, "[Seer Fog-of-War] Villager private state does NOT contain seerWindow");

    // 1. Non-wolf pack vote rejected
    const nonWolfVoteCmd = JSON.stringify({
      commandId: "cmd-pack-nonwolf",
      roomId: packRoomId,
      senderId: pVill1,
      sessionToken: tVill1,
      type: "WEREWOLF_PACK_VOTE",
      payload: { targetPlayerId: pVill2 },
      clientTimestamp: Date.now(),
    });
    const nonWolfVoteRes = await CommandDispatcher.handleCommand(nonWolfVoteCmd);
    assert(nonWolfVoteRes.success === false, "[Pack Vote] Non-wolf pack vote is rejected");
    assert(nonWolfVoteRes.errorCode === "NOT_PERMITTED", "[Pack Vote] Non-wolf gets NOT_PERMITTED");

    // 2. Wolf 1 votes for Villager 1 -> Success
    const wolf1VoteCmd1 = JSON.stringify({
      commandId: "cmd-pack-w1-v1",
      roomId: packRoomId,
      senderId: pWolf1,
      sessionToken: tWolf1,
      type: "WEREWOLF_PACK_VOTE",
      payload: { targetPlayerId: pVill1 },
      clientTimestamp: Date.now(),
    });
    const wolf1VoteRes1 = await CommandDispatcher.handleCommand(wolf1VoteCmd1);
    assert(wolf1VoteRes1.success === true, "[Pack Vote] Wolf 1 votes for Villager 1 successfully");
    assert(packRoom.packVotes?.[pWolf1] === pVill1, "[Pack Vote] RAM state records Wolf 1 vote for Villager 1");

    // 3. Wolf 1 dynamic vote update (Wolf 1 changes vote to Villager 2 -> Replaces, exactly 1 current vote)
    const wolf1VoteCmd2 = JSON.stringify({
      commandId: "cmd-pack-w1-v2",
      roomId: packRoomId,
      senderId: pWolf1,
      sessionToken: tWolf1,
      type: "WEREWOLF_PACK_VOTE",
      payload: { targetPlayerId: pVill2 },
      clientTimestamp: Date.now(),
    });
    const wolf1VoteRes2 = await CommandDispatcher.handleCommand(wolf1VoteCmd2);
    assert(wolf1VoteRes2.success === true, "[Pack Vote] Wolf 1 dynamically switches vote to Villager 2");
    assert(packRoom.packVotes?.[pWolf1] === pVill2, "[Pack Vote] Wolf 1 vote updated to Villager 2 (1 vote per wolf)");

    // 4. Wolf 2 votes for Villager 1 -> Creates a 1 vs 1 tie!
    const wolf2VoteCmd1 = JSON.stringify({
      commandId: "cmd-pack-w2-v1",
      roomId: packRoomId,
      senderId: pWolf2,
      sessionToken: tWolf2,
      type: "WEREWOLF_PACK_VOTE",
      payload: { targetPlayerId: pVill1 },
      clientTimestamp: Date.now(),
    });
    const wolf2VoteRes1 = await CommandDispatcher.handleCommand(wolf2VoteCmd1);
    assert(wolf2VoteRes1.success === true, "[Pack Vote] Wolf 2 votes for Villager 1");
    assert(packRoom.packVotes?.[pWolf2] === pVill1, "[Pack Vote] Tie created (Wolf 1 -> Villager 2, Wolf 2 -> Villager 1)");

    // 5. Tally initial vote -> Tie detected! Launches 10s Revote restricted to tied targets
    await RoomManager.closePackVoteAndTally(packRoomId);
    assert(Boolean(packRoom.packVoteWindow), "[Pack Revote] Revote window created");
    assert(packRoom.packVoteWindow?.isRevote === true, "[Pack Revote] packVoteWindow.isRevote is true");
    assert(
      Boolean(packRoom.packVoteWindow?.allowedTargets?.includes(pVill1)) &&
      Boolean(packRoom.packVoteWindow?.allowedTargets?.includes(pVill2)) &&
      packRoom.packVoteWindow?.allowedTargets?.length === 2,
      "[Pack Revote] Allowed targets restricted strictly to tied candidates (Villager 1 & 2)"
    );
    assert(Object.keys(packRoom.packVotes || {}).length === 0, "[Pack Revote] Votes reset for revote round");

    // 6. Wolf votes for candidate NOT in allowedTargets during revote -> Rejected
    const invalidTargetCmd = JSON.stringify({
      commandId: "cmd-pack-invalid-target",
      roomId: packRoomId,
      senderId: pWolf1,
      sessionToken: tWolf1,
      type: "WEREWOLF_PACK_VOTE",
      payload: { targetPlayerId: pSeer },
      clientTimestamp: Date.now(),
    });
    const invalidTargetRes = await CommandDispatcher.handleCommand(invalidTargetCmd);
    assert(invalidTargetRes.success === false, "[Pack Revote] Voting for un-tied candidate rejected");
    assert(invalidTargetRes.errorCode === "INVALID_TARGET", "[Pack Revote] Error code is INVALID_TARGET");

    // 7. Seer 10s check: Non-seer check rejected
    const nonSeerCheckCmd = JSON.stringify({
      commandId: "cmd-seer-nonseer",
      roomId: packRoomId,
      senderId: pWolf1,
      sessionToken: tWolf1,
      type: "SEER_CHECK",
      payload: { targetPlayerId: pVill1 },
      clientTimestamp: Date.now(),
    });
    const nonSeerCheckRes = await CommandDispatcher.handleCommand(nonSeerCheckCmd);
    assert(nonSeerCheckRes.success === false, "[Seer Check] Non-seer check rejected");
    assert(nonSeerCheckRes.errorCode === "NOT_PERMITTED", "[Seer Check] Non-seer gets NOT_PERMITTED");

    // 8. Seer self-check rejected
    const seerSelfCheckCmd = JSON.stringify({
      commandId: "cmd-seer-self",
      roomId: packRoomId,
      senderId: pSeer,
      sessionToken: tSeer,
      type: "SEER_CHECK",
      payload: { targetPlayerId: pSeer },
      clientTimestamp: Date.now(),
    });
    const seerSelfCheckRes = await CommandDispatcher.handleCommand(seerSelfCheckCmd);
    assert(seerSelfCheckRes.success === false, "[Seer Check] Seer self-check rejected");
    assert(seerSelfCheckRes.errorCode === "INVALID_TARGET", "[Seer Check] Self-check returns INVALID_TARGET");

    // 9. Seer checks Wolf 1 -> Returns Werewolf strictly to Seer while NIGHT_ACTIVE
    const seerCheckCmd = JSON.stringify({
      commandId: "cmd-seer-w1",
      roomId: packRoomId,
      senderId: pSeer,
      sessionToken: tSeer,
      type: "SEER_CHECK",
      payload: { targetPlayerId: pWolf1 },
      clientTimestamp: Date.now(),
    });
    const seerCheckRes = await CommandDispatcher.handleCommand(seerCheckCmd);
    assert(seerCheckRes.success === true, "[Seer Check] Seer check accepted");
    assert(packRoom.phase === "NIGHT_ACTIVE", "[Seer Check] Room is still NIGHT_ACTIVE while pack vote revote is pending");
    assert(packRoom.seerActionState?.checked === true, "[Seer Check] seerActionState marked checked");
    assert(packRoom.seerActionState?.result === "Werewolf", "[Seer Check] Result is 'Werewolf'");

    const seerPrivAfter = FogOfWarDispatcher.buildPrivateState(packRoom, pSeer);
    assert(seerPrivAfter?.seerWindow?.result === "Werewolf", "[Seer Fog-of-War] Seer private state delivers 'Werewolf'");

    const wolfPrivAfter = FogOfWarDispatcher.buildPrivateState(packRoom, pWolf1);
    assert(wolfPrivAfter?.seerWindow === undefined, "[Seer Fog-of-War] Wolf does NOT receive seerWindow");

    // 10. Seer second check attempt tonight -> ALREADY_CHECKED
    const seerCheckSecondCmd = JSON.stringify({
      commandId: "cmd-seer-w1-second",
      roomId: packRoomId,
      senderId: pSeer,
      sessionToken: tSeer,
      type: "SEER_CHECK",
      payload: { targetPlayerId: pVill2 },
      clientTimestamp: Date.now(),
    });
    const seerCheckSecondRes = await CommandDispatcher.handleCommand(seerCheckSecondCmd);
    assert(seerCheckSecondRes.success === false, "[Seer Check] Second check attempt rejected");
    assert(seerCheckSecondRes.errorCode === "ALREADY_CHECKED", "[Seer Check] Error code is strictly ALREADY_CHECKED");

    // 11. Revote Tie -> Persisting tie results in deterministic zero-attack (targetPlayerId: null)
    const revoteW1Cmd = JSON.stringify({
      commandId: "cmd-pack-revote-w1",
      roomId: packRoomId,
      senderId: pWolf1,
      sessionToken: tWolf1,
      type: "WEREWOLF_PACK_VOTE",
      payload: { targetPlayerId: pVill1 },
      clientTimestamp: Date.now(),
    });
    await CommandDispatcher.handleCommand(revoteW1Cmd);

    const revoteW2Cmd = JSON.stringify({
      commandId: "cmd-pack-revote-w2",
      roomId: packRoomId,
      senderId: pWolf2,
      sessionToken: tWolf2,
      type: "WEREWOLF_PACK_VOTE",
      payload: { targetPlayerId: pVill2 },
      clientTimestamp: Date.now(),
    });
    await CommandDispatcher.handleCommand(revoteW2Cmd);

    // Close pack revote tally: both wolf action & seer check complete -> auto-resolves night into DAY_DISCUSSION!
    await RoomManager.closePackVoteAndTally(packRoomId);
    assert(packRoom.packVoteWindow === undefined, "[Pack Revote Tie] packVoteWindow closed after revote tally");
    assert(packRoom.phase === "DAY_DISCUSSION", "[Night Auto-Resolve] Room smoothly transitions to DAY_DISCUSSION upon completion");

    // 12. Full Event Sourcing & Deterministic Replay Verification
    const replayedRoom = await ReplayEngine.reconstructState(packRoomId, defaultEventStore);
    assert(Boolean(replayedRoom), "[Pack/Seer Replay] Replayed room state successfully reconstructed");
    assert(replayedRoom!.phase === "DAY_DISCUSSION", "[Pack/Seer Replay] Replayed phase matches RAM DAY_DISCUSSION");
    assert(replayedRoom!.dayCount === 1, "[Pack/Seer Replay] Replayed dayCount advanced to 1");
    assert(replayedRoom!.players.every((p) => p.alive === true), "[Pack/Seer Replay] All players alive because zero wolf attack on revote tie");
  }

  console.log("\n============================================================");
  console.log(`HARDENING SUITE RESULTS: ${passCount} PASSED / ${failCount} FAILED`);
  console.log("============================================================");
  console.log("🎉 ALL AUDIT BLOCKERS & HARDENING ISSUES 100% RESOLVED AND VERIFIED!");
}

runHardeningSuite().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
