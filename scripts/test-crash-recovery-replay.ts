// ============================================================
// ASPIRE: WEREWOLF — Phase 4 Crash Recovery & Event Replay Test Suite
// Verifies:
// 1. Immutable Append-Only EventStore persistence
// 2. Monotonic sequence & unique (room_id, sequence) constraint
// 3. Complete In-Memory Room Destruction (Simulated Crash)
// 4. Deterministic State Reconstruction from EventStore
// 5. Semantic Equivalence of Reconstructed State
// 6. Seamless match continuation from restored state
// "Event Store is the Canonical Source of Historical Truth."
// ============================================================

import { RoomManager } from "../server/rooms/roomManager";
import {
  InMemoryEventStore,
  ReplayEngine,
  defaultEventStore,
} from "../server/persistence";
import { GameEvent, BaseCommand } from "../src/contracts";
import { CommandDispatcher } from "../server/gateway/commandDispatcher";

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

async function runCrashRecoveryTestSuite() {
  console.log("============================================================");
  console.log("PHASE 4: POSTGRESQL EVENT STORE & REPLAY VERIFICATION SUITE");
  console.log("Testing Immutable Event Persistence, Memory Destruction & State Projection");
  console.log("============================================================\n");

  // ------------------------------------------------------------
  // 1. EVENT STORE MONOTONICITY & UNIQUE CONSTRAINT AUDIT
  // ------------------------------------------------------------
  console.log("--- 1. EVENT STORE MONOTONICITY & UNIQUE (room_id, sequence) CONSTRAINT ---");
  {
    const store = new InMemoryEventStore();
    const testRoomId = "ROOM-STORE-001";

    await store.saveMatch({
      roomId: testRoomId,
      gameMode: "MODE_1_FIXED",
      hostPlayerId: "p1",
      hostPlayerName: "Alice",
    });

    const event1: GameEvent = {
      eventId: "evt-001",
      roomId: testRoomId,
      sequence: 1,
      timestamp: Date.now(),
      type: "ROOM_INITIALIZED",
      payload: { roomId: testRoomId },
      serverSignature: "sig-001",
    };

    const event2: GameEvent = {
      eventId: "evt-002",
      roomId: testRoomId,
      sequence: 2,
      timestamp: Date.now() + 10,
      type: "PLAYER_JOINED",
      payload: { playerId: "p2", playerName: "Bob" },
      serverSignature: "sig-002",
    };

    await store.appendEvent(event1);
    await store.appendEvent(event2);

    const latestSeq = await store.getLatestSequence(testRoomId);
    assert(latestSeq === 2, "[Store] Latest sequence correctly reported as 2");

    const events = await store.getEvents(testRoomId);
    assert(events.length === 2, "[Store] Appended events retrieved in sequence order");
    assert(events[0].sequence === 1 && events[1].sequence === 2, "[Store] Monotonic sequence invariant preserved");

    // Negative Test: Duplicate Sequence Violation
    let duplicateRejected = false;
    try {
      const duplicateSeqEvent: GameEvent = {
        eventId: "evt-003",
        roomId: testRoomId,
        sequence: 2, // DUPLICATE SEQUENCE!
        timestamp: Date.now() + 20,
        type: "PLAYER_JOINED",
        payload: { playerId: "p3", playerName: "Charlie" },
        serverSignature: "sig-003",
      };
      await store.appendEvent(duplicateSeqEvent);
    } catch {
      duplicateRejected = true;
    }

    assert(duplicateRejected === true, "[Store] (Negative) Duplicate sequence (room_id, sequence) violation rejected");
  }

  // ------------------------------------------------------------
  // 2. RUN FULL MATCH UP TO NIGHT 1 RESOLUTION
  // ------------------------------------------------------------
  console.log("\n--- 2. EXECUTE GAMEPLAY UP TO NIGHT 1 RESOLUTION ---");
  const roomId = "ROOM-CRASH-TEST-999";
  const { room, sessionToken: hostToken } = RoomManager.createRoom(
    "p1",
    "Alice",
    "MODE_1_FIXED",
    roomId
  );

  const players = [
    { id: "p2", name: "Bob" },
    { id: "p3", name: "Charlie" },
    { id: "p4", name: "David" },
    { id: "p5", name: "Eve" },
  ];

  const tokens: Record<string, string> = { p1: hostToken };
  for (const p of players) {
    const joined = RoomManager.joinRoom(roomId, p.id, p.name);
    tokens[p.id] = joined.sessionToken;
  }

  assert(room.players.length === 5, "[Setup] 5 players registered in lobby");

  // Start game with fixed roles (1 Wolf, 1 Seer, 1 Bodyguard, 2 Villagers)
  RoomManager.startGame(roomId, "p1", {
    fixedRoles: [
      { role_id: "ROLE-023", canonical_name: "Werewolf", count: 1 }, // Werewolf
      { role_id: "ROLE-022", canonical_name: "Seer", count: 1 }, // Seer
      { role_id: "ROLE-028", canonical_name: "Bodyguard", count: 1 }, // Bodyguard
      { role_id: "ROLE-024", canonical_name: "Villager", count: 2 }, // Villager
    ],
  });

  assert(room.phase === "NIGHT_ACTIVE", "[Setup] Match started in NIGHT_ACTIVE");
  assert(room.nightCount === 1, "[Setup] Night count is 1");

  // Find Werewolf and Seer players
  const wolfPlayer = room.players.find((p) => p.team === "Werewolf")!;
  const seerPlayer = room.players.find((p) => p.role_id === "ROLE-022")!;
  const guardPlayer = room.players.find((p) => p.role_id === "ROLE-028")!;

  // Submit Night Actions:
  // - Werewolf attacks p5 (Eve)
  // - Bodyguard protects p5 (Eve) -> Save!
  // - Seer investigates wolfPlayer
  for (const action of room.nightActions) {
    const actorId = action.player_ids[0];
    let targetId: string | null = "p5";
    if (actorId === seerPlayer.id) {
      targetId = wolfPlayer.id;
    }

    RoomManager.submitNightAction(roomId, actorId, action.id, targetId, null);
  }

  // Verify Night 1 resolved automatically
  assert(room.phase === "DAY_DISCUSSION", "[Setup] Night 1 resolved and transitioned to DAY_DISCUSSION");
  assert(room.dayCount === 1, "[Setup] Day count is 1");
  assert(room.players.every((p) => p.alive), "[Setup] All 5 players alive (Bodyguard holy shield saved Eve)");

  // Capture Pre-Crash Snapshot
  const preCrashSnapshot = {
    roomId: room.roomId,
    hostPlayerId: room.hostPlayerId,
    gameMode: room.gameMode,
    phase: room.phase,
    dayCount: room.dayCount,
    nightCount: room.nightCount,
    sequenceNumber: room.sequenceNumber,
    timeoutCount: room.timeoutCount,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      role_id: p.role_id,
      canonical_name: p.canonical_name,
      team: p.team,
      alive: p.alive,
      protected: p.protected,
      silenced: p.silenced,
    })),
  };

  const persistedEvents = await defaultEventStore.getEvents(roomId);
  assert(persistedEvents.length >= 7, "[Setup] All events persisted to canonical EventStore");
  assert(persistedEvents.length === room.sequenceNumber, "[Setup] Event count matches monotonic sequence number");

  // ------------------------------------------------------------
  // 3. SIMULATE TOTAL SERVER CRASH (DESTROY MEMORY)
  // ------------------------------------------------------------
  console.log("\n--- 3. SIMULATE TOTAL SERVER MEMORY CRASH ---");
  {
    // Wipe room completely from in-memory Map
    RoomManager.rooms.delete(roomId);
    assert(RoomManager.getRoom(roomId) === undefined, "[Crash] In-memory room state completely destroyed");
  }

  // ------------------------------------------------------------
  // 4. RECONSTRUCT STATE FROM EVENT STORE VIA REPLAY ENGINE
  // ------------------------------------------------------------
  console.log("\n--- 4. DETERMINISTIC RECONSTRUCTION FROM EVENT STORE ---");
  let restoredRoom = await RoomManager.recoverRoom(roomId);
  assert(restoredRoom !== null, "[Recovery] Room successfully recovered from EventStore");

  // ------------------------------------------------------------
  // 5. SEMANTIC EQUIVALENCE PROOF (ORIGINAL VS RESTORED)
  // ------------------------------------------------------------
  console.log("\n--- 5. SEMANTIC EQUIVALENCE AUDIT (PRE-CRASH VS RESTORED) ---");
  {
    const r = restoredRoom!;
    assert(r.roomId === preCrashSnapshot.roomId, "[Equivalence] roomId matches exactly");
    assert(r.hostPlayerId === preCrashSnapshot.hostPlayerId, "[Equivalence] hostPlayerId matches exactly");
    assert(r.gameMode === preCrashSnapshot.gameMode, "[Equivalence] gameMode matches exactly");
    assert(r.phase === preCrashSnapshot.phase, "[Equivalence] phase matches exactly (DAY_DISCUSSION)");
    assert(r.dayCount === preCrashSnapshot.dayCount, "[Equivalence] dayCount matches exactly (1)");
    assert(r.nightCount === preCrashSnapshot.nightCount, "[Equivalence] nightCount matches exactly (1)");
    assert(r.sequenceNumber === preCrashSnapshot.sequenceNumber, "[Equivalence] sequenceNumber matches exactly");
    assert(r.timeoutCount === preCrashSnapshot.timeoutCount, "[Equivalence] timeoutCount matches exactly (0)");

    // Player semantic equality check
    assert(r.players.length === preCrashSnapshot.players.length, "[Equivalence] Player count matches exactly (5)");
    for (let i = 0; i < preCrashSnapshot.players.length; i++) {
      const origP = preCrashSnapshot.players[i];
      const restP = r.players.find((p) => p.id === origP.id)!;
      assert(restP !== undefined, `[Equivalence] Player ${origP.name} exists in reconstructed state`);
      assert(restP.role_id === origP.role_id, `[Equivalence] Player ${origP.name} role_id restored identically (${origP.role_id})`);
      assert(restP.canonical_name === origP.canonical_name, `[Equivalence] Player ${origP.name} canonical_name restored identically (${origP.canonical_name})`);
      assert(restP.team === origP.team, `[Equivalence] Player ${origP.name} team restored identically (${origP.team})`);
      assert(restP.alive === origP.alive, `[Equivalence] Player ${origP.name} alive status restored identically (${origP.alive})`);
    }
  }

  // ------------------------------------------------------------
  // 6. CONTINUED MATCH EXECUTION AFTER CRASH RECOVERY
  // ------------------------------------------------------------
  console.log("\n--- 6. MATCH CONTINUATION FROM RECONSTRUCTED STATE ---");
  {
    // A. Start voting in the restored room
    RoomManager.startDayVoting(roomId);
    assert(restoredRoom!.phase === "DAY_VOTING", "[Continuation] Restored room transitioned to DAY_VOTING");

    // B. Cast votes: All 4 villagers vote for the Werewolf
    const livingPlayers = restoredRoom!.players.filter((p) => p.alive);
    for (const p of livingPlayers) {
      const voteTarget = p.id === wolfPlayer.id ? "p1" : wolfPlayer.id;
      RoomManager.submitVote(roomId, p.id, voteTarget);
    }

    // C. Verify Werewolf eliminated and Village declared winner!
    assert(restoredRoom!.phase === "GAME_OVER", "[Continuation] Match completed authoritatively with GAME_OVER");
    const eliminatedWolf = restoredRoom!.players.find((p) => p.id === wolfPlayer.id)!;
    assert(eliminatedWolf.alive === false, "[Continuation] Werewolf was eliminated by daytime vote");

    // D. Verify final events appended to EventStore with strictly contiguous sequence numbers
    const finalEvents = await defaultEventStore.getEvents(roomId);
    assert(finalEvents[finalEvents.length - 1].type === "WIN_CONDITION_SATISFIED", "[Continuation] Final event is WIN_CONDITION_SATISFIED");
    assert(finalEvents.length === restoredRoom!.sequenceNumber, "[Continuation] Final event log length matches sequence number");

    // Verify sequence numbers are strictly 1, 2, 3, ..., N without gaps
    let sequenceContiguous = true;
    for (let i = 0; i < finalEvents.length; i++) {
      if (finalEvents[i].sequence !== i + 1) {
        sequenceContiguous = false;
        break;
      }
    }
    assert(sequenceContiguous === true, "[Continuation] Event sequence numbers are strictly contiguous with zero gaps");
  }

  console.log("\n============================================================");
  console.log(`CRASH RECOVERY TEST RESULTS: ${passCount} PASSED / ${failCount} FAILED`);
  console.log("============================================================");
  if (failCount === 0) {
    console.log("🎉 PHASE 4 POSTGRESQL EVENT STORE & REPLAY ENGINE 100% VERIFIED!");
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runCrashRecoveryTestSuite().catch((err) => {
  console.error("Fatal test error:", err);
  process.exit(1);
});
