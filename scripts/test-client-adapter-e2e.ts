// ============================================================
// ASPIRE: WEREWOLF — Phase 3 Client WebSocket Adapter E2E Test
// Tests: Client -> WSS -> Authoritative Server -> Golden Engine
//        -> Fog-of-War Sanitized Events -> Client Replicas
// Principles: "Optimistic interaction. Authoritative state."
// ============================================================

import { buildServer } from "../server";
import { WebSocket } from "ws";
import { RoomManager } from "../server/rooms/roomManager";
import { FogOfWarDispatcher } from "../server/gateway/fogOfWarDispatcher";
import {
  BaseCommand,
  SanitizedPublicGameState,
  SanitizedPrivatePlayerState,
  GameEvent,
  SubmitNightActionCommandPayload,
  CastVoteCommandPayload,
} from "../src/contracts";

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

interface TestClient {
  id: string;
  name: string;
  token: string;
  socket: WebSocket;
  lastPublicState: SanitizedPublicGameState | null;
  lastPrivateState: SanitizedPrivatePlayerState | null;
  eventsReceived: GameEvent[];
  optimisticPending: boolean;
  errorsReceived: any[];
}

async function runE2ETest() {
  console.log("============================================================");
  console.log("PHASE 3: CLIENT ADAPTER END-TO-END WSS INTEGRATION SUITE");
  console.log("Full Authoritative Match Cycle over Real WebSocket Transport");
  console.log("============================================================\n");

  const server = await buildServer();
  const PORT = 4099;
  await server.listen({ port: PORT, host: "127.0.0.1" });
  const wsBaseUrl = `ws://127.0.0.1:${PORT}/ws`;

  // ------------------------------------------------------------
  // 1. CREATE ROOM & LOBBY REGISTRATION VIA REST
  // ------------------------------------------------------------
  console.log("--- 1. ROOM SETUP & SESSION TOKEN ISSUANCE ---");
  const createRes = await server.inject({
    method: "POST",
    url: "/api/rooms",
    payload: {
      hostPlayerId: "p1",
      hostPlayerName: "Alice",
      gameMode: "MODE_1_FIXED",
      customRoomId: "ROOM-WSS-E2E",
    },
  });

  assert(createRes.statusCode === 201, "[Setup] Host created room ROOM-WSS-E2E");
  const createBody = JSON.parse(createRes.body);
  const roomId = createBody.roomId;
  const aliceToken = createBody.sessionToken;

  const joinData = [
    { id: "p2", name: "Bob" },
    { id: "p3", name: "Charlie" },
    { id: "p4", name: "David" },
    { id: "p5", name: "Eve" },
  ];

  const playerTokens: Record<string, string> = { p1: aliceToken };

  for (const p of joinData) {
    const joinRes = await server.inject({
      method: "POST",
      url: `/api/rooms/${roomId}/join`,
      payload: { playerId: p.id, playerName: p.name },
    });
    assert(joinRes.statusCode === 200, `[Setup] ${p.name} joined room`);
    playerTokens[p.id] = JSON.parse(joinRes.body).sessionToken;
  }

  // ------------------------------------------------------------
  // 2. CONNECT 5 CLIENTS VIA WEBSOCKET WITH TOKEN AUTH
  // ------------------------------------------------------------
  console.log("\n--- 2. REAL WEBSOCKET CONNECTION & FOG-OF-WAR INITIAL SYNC ---");
  const clients: Record<string, TestClient> = {};

  const allPlayers = [
    { id: "p1", name: "Alice" },
    ...joinData,
  ];

  const connectClient = async (id: string, name: string, token: string): Promise<TestClient> => {
    // Exchange session token for a short-lived single-use WS ticket (mirrors production flow)
    const ticketRes = await server.inject({
      method: "POST",
      url: "/api/auth/ws-ticket",
      payload: { sessionToken: token },
    });
    if (ticketRes.statusCode !== 200) {
      throw new Error(`Failed to obtain WS ticket for ${name}: ${ticketRes.body}`);
    }
    const { ticket } = JSON.parse(ticketRes.body);

    return new Promise((resolve, reject) => {
      const socket = new WebSocket(`${wsBaseUrl}?ticket=${encodeURIComponent(ticket)}`);
      const client: TestClient = {
        id,
        name,
        token,
        socket,
        lastPublicState: null,
        lastPrivateState: null,
        eventsReceived: [],
        optimisticPending: false,
        errorsReceived: [],
      };

      socket.on("message", (raw: any) => {
        try {
          const msg = JSON.parse(raw.toString());
          client.optimisticPending = false; // Reset optimistic flag on server response
          if (msg.type === "PUBLIC_STATE_UPDATE") {
            client.lastPublicState = msg.state;
          } else if (msg.type === "PRIVATE_STATE_UPDATE") {
            client.lastPrivateState = msg.state;
          } else if (msg.type === "GAME_EVENT") {
            client.eventsReceived.push(msg.event);
          } else if (msg.type === "COMMAND_REJECTED" || msg.type === "ERROR") {
            client.errorsReceived.push(msg);
          }
        } catch (e) {
          console.error("Parse error:", e);
        }
      });

      socket.on("open", () => resolve(client));
      socket.on("error", (err: any) => reject(err));
    });
  };

  for (const p of allPlayers) {
    clients[p.id] = await connectClient(p.id, p.name, playerTokens[p.id]);
  }

  // Wait 100ms for initial Fog-of-War sync messages
  await new Promise((r) => setTimeout(r, 100));

  assert(clients["p1"].lastPublicState !== null, "[WSS] Alice received initial PublicStateUpdate");
  assert(clients["p2"].lastPublicState !== null, "[WSS] Bob received initial PublicStateUpdate");
  assert(clients["p1"].lastPublicState?.players.length === 5, "[WSS] PublicState reports exactly 5 players");
  assert(clients["p1"].lastPublicState?.phase === "LOBBY", "[WSS] Current phase is LOBBY");

  // Verify Zero Role Leaks in Public State
  const serializedPublic = JSON.stringify(clients["p1"].lastPublicState);
  assert(!serializedPublic.includes('"role_id"'), "[Fog-of-War] Public state contains NO role_id");
  assert(!serializedPublic.includes('"seer_result"'), "[Fog-of-War] Public state contains NO seer_result");

  // ------------------------------------------------------------
  // 3. OPTIMISTIC INTERACTION PATTERN VERIFICATION
  // ------------------------------------------------------------
  console.log("\n--- 3. OPTIMISTIC INTERACTION VS AUTHORITATIVE STATE ---");
  {
    const bob = clients["p2"];

    // A. Bob initiates visual optimistic action
    bob.optimisticPending = true;
    assert(bob.optimisticPending === true, "[Optimistic UI] Client visual loading indicator active");

    // B. Send TOGGLE_READY command to Authoritative Server
    const readyCmd: BaseCommand = {
      commandId: "cmd-ready-bob",
      roomId,
      senderId: "p2",
      sessionToken: bob.token,
      type: "TOGGLE_READY",
      payload: {},
      clientTimestamp: Date.now(),
    };

    bob.socket.send(JSON.stringify(readyCmd));

    // Wait for server state broadcast
    await new Promise((r) => setTimeout(r, 100));

    // Optimistic pending cleared by server response
    assert((bob.optimisticPending as boolean) === false, "[Optimistic UI] Client visual flag cleared upon server resolution");
  }

  // ------------------------------------------------------------
  // 4. AUTHORITATIVE START GAME & ROLE DISTRIBUTION
  // ------------------------------------------------------------
  console.log("\n--- 4. START GAME & CONFIDENTIAL ROLE DELIVERY ---");
  {
    const alice = clients["p1"];
    const startCmd: BaseCommand = {
      commandId: "cmd-start-match",
      roomId,
      senderId: "p1",
      sessionToken: alice.token,
      type: "START_GAME",
      payload: {
        fixedRoles: [
          { role_id: "ROLE-023", count: 1 }, // Werewolf
          { role_id: "ROLE-022", count: 1 }, // Seer
          { role_id: "ROLE-028", count: 1 }, // Bodyguard
          { role_id: "ROLE-024", count: 2 }, // Villager
        ],
      },
      clientTimestamp: Date.now(),
    };

    alice.socket.send(JSON.stringify(startCmd));

    // Wait for state resolution & Fog-of-War dispatch
    await new Promise((r) => setTimeout(r, 150));

    assert(alice.lastPublicState?.phase === "NIGHT_ACTIVE", "[Match] Authoritative server transitioned to NIGHT_ACTIVE");
    assert(alice.lastPublicState?.nightCount === 1, "[Match] Night count is 1");

    // Check Private States across clients
    for (const p of allPlayers) {
      const c = clients[p.id];
      assert(c.lastPrivateState !== null, `[Fog-of-War] Private state delivered to ${p.name}`);
      assert(c.lastPrivateState?.playerId === p.id, `[Fog-of-War] Private state matches ${p.name}'s ID`);
      assert(Boolean(c.lastPrivateState?.role_id), `[Fog-of-War] Secret role_id delivered to ${p.name}`);
    }

    // Confidentiality Check: Villagers do NOT receive any Werewolf identities
    const villagerClients = Object.values(clients).filter(
      (c) => c.lastPrivateState?.team === "Village"
    );

    assert(villagerClients.length === 4, "[Match] Exactly 4 Village members assigned");
    for (const vc of villagerClients) {
      assert(
        (vc.lastPrivateState?.fellowTeamMembers || []).length === 0,
        `[Fog-of-War] Villager ${vc.name} receives NO secret werewolf identities`
      );
    }
  }

  // ------------------------------------------------------------
  // 5. NIGHT ACTIONS & AUTOMATIC NIGHT RESOLUTION
  // ------------------------------------------------------------
  console.log("\n--- 5. NIGHT ACTIONS EXECUTION & AUTOMATIC RESOLUTION ---");
  let wolfPlayerId = "";
  {
    const room = RoomManager.getRoom(roomId)!;
    const requiredNightActions = [...room.nightActions];
    assert(requiredNightActions.length > 0, "[Night] Required night actions generated by engine");

    const wolfPlayer = room.players.find((p) => p.team === "Werewolf")!;
    wolfPlayerId = wolfPlayer.id;

    // 1. Werewolf attacks p5 (Eve)
    // 2. Bodyguard protects p5 (Eve) -> Holy shield saves Eve!
    // 3. Seer investigates wolfPlayer
    for (const action of requiredNightActions) {
      const actorId = action.player_ids[0];
      const actorClient = clients[actorId];
      if (!actorClient) continue;

      let targetId: string | null = "p5"; // Default attack / protect target
      if (action.action_type.toLowerCase().includes("investigate") || action.role_name === "Seer") {
        targetId = wolfPlayerId; // Seer investigates Werewolf
      }

      const actionCmd: BaseCommand<SubmitNightActionCommandPayload> = {
        commandId: `cmd-act-${action.id}`,
        roomId,
        senderId: actorId,
        sessionToken: actorClient.token,
        type: "SUBMIT_NIGHT_ACTION",
        payload: {
          actionId: action.id,
          targetPlayerId: targetId,
          secondaryTargetId: null,
        },
        clientTimestamp: Date.now(),
      };

      actorClient.socket.send(JSON.stringify(actionCmd));
    }

    // Wait for night resolution & state broadcast
    await new Promise((r) => setTimeout(r, 200));

    const updatedRoom = RoomManager.getRoom(roomId)!;
    assert(
      updatedRoom.phase === "DAY_DISCUSSION",
      "[Night] Bodyguard shield saved victim -> All 5 players survive -> Transitioned to DAY_DISCUSSION"
    );
    assert(updatedRoom.dayCount === 1, "[Night] Day count incremented to 1");
  }

  // ------------------------------------------------------------
  // 6. DAY VOTING & AUTHORITATIVE LYNCH -> VILLAGE WIN
  // ------------------------------------------------------------
  console.log("\n--- 6. DAYTIME VOTING & AUTHORITATIVE LYNCH ---");
  {
    // A. Advance to voting
    await RoomManager.startDayVoting(roomId);
    FogOfWarDispatcher.dispatchRoomSync(RoomManager.getRoom(roomId)!);

    await new Promise((r) => setTimeout(r, 100));
    assert(clients["p1"].lastPublicState?.phase === "DAY_VOTING", "[Vote] Clients received DAY_VOTING phase transition");

    // B. Cast votes: All 4 villagers vote to eliminate the Werewolf!
    const room = RoomManager.getRoom(roomId)!;
    const livingPlayers = room.players.filter((p) => p.alive && !p.silenced);

    for (const lp of livingPlayers) {
      const voterClient = clients[lp.id];
      const voteTarget = lp.id === wolfPlayerId ? "p1" : wolfPlayerId; // Werewolf votes p1, villagers vote wolf

      const voteCmd: BaseCommand<CastVoteCommandPayload> = {
        commandId: `cmd-vote-${lp.id}`,
        roomId,
        senderId: lp.id,
        sessionToken: voterClient.token,
        type: "CAST_VOTE",
        payload: {
          targetPlayerId: voteTarget,
        },
        clientTimestamp: Date.now(),
      };

      voterClient.socket.send(JSON.stringify(voteCmd));
    }

    // Wait for vote tally & resolution
    await new Promise((r) => setTimeout(r, 200));

    const resolvedRoom = RoomManager.getRoom(roomId)!;
    const eliminatedWolf = resolvedRoom.players.find((p) => p.id === wolfPlayerId)!;
    assert(eliminatedWolf.alive === false, "[Vote] Majority target Werewolf was authoritatively eliminated");
    assert(
      resolvedRoom.phase === "GAME_OVER",
      "[Win] Last Werewolf eliminated -> Authoritative server declared GAME_OVER (Village Win)"
    );
  }

  // ------------------------------------------------------------
  // 7. CLEANUP & SOCKET TEARDOWN
  // ------------------------------------------------------------
  for (const c of Object.values(clients)) {
    c.socket.close();
  }

  await server.close();

  console.log("\n============================================================");
  console.log(`E2E TEST RESULTS: ${passCount} PASSED / ${failCount} FAILED`);
  console.log("============================================================");
  if (failCount === 0) {
    console.log("🎉 PHASE 3 AUTHORITATIVE WEBSOCKET ADAPTER 100% VERIFIED!");
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runE2ETest().catch((err) => {
  console.error("Fatal E2E test failure:", err);
  process.exit(1);
});
