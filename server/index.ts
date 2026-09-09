// ============================================================
// ASPIRE: WEREWOLF — Authoritative Standalone Server Entrypoint
// Fastify + WebSocket Server Gateway (Phase 2)
// "Server owns the state. Engine resolves truth."
// ============================================================

import Fastify, { FastifyInstance } from "fastify";
import websocketPlugin from "@fastify/websocket";
import corsPlugin from "@fastify/cors";
import { config, validateProductionSecrets } from "./config";
import { RoomManager } from "./rooms/roomManager";
import { FogOfWarDispatcher } from "./gateway/fogOfWarDispatcher";
import { registerWebSocketGateway } from "./gateway/websocket";
import { v7 as uuidv7 } from "uuid";
import { defaultEventStore, PostgresEventStore } from "./persistence";
import { SessionManager } from "./auth/sessionManager";

export async function buildServer(): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: process.env.NODE_ENV === "test" ? false : { level: "info" },
  });

  // 1. Register Plugins
  await fastify.register(corsPlugin, {
    origin: config.corsOrigin,
    methods: ["GET", "POST", "OPTIONS"],
  });

  await fastify.register(websocketPlugin);

  // 2. Healthcheck Route
  fastify.get("/health", async () => {
    return {
      status: "ok",
      server: "ASPIRE: WEREWOLF Authoritative Server v1.0",
      persistence: defaultEventStore instanceof PostgresEventStore ? "PostgreSQL" : "InMemory",
      roomsActive: RoomManager.getAllRooms().length,
      uptimeSec: Math.floor(process.uptime()),
      timestamp: Date.now(),
    };
  });

  // 3. HTTP REST Endpoints for Room Creation & Join Handshake
  fastify.post<{
    Body: {
      hostPlayerId?: string;
      hostPlayerName: string;
      gameMode?: any;
      customRoomId?: string;
      targetPlayerCount?: number;
      selectedRoles?: any[];
      selectedRolePool?: string[];
    };
  }>("/api/rooms", async (req, reply) => {
    const { hostPlayerId, hostPlayerName, gameMode, customRoomId, targetPlayerCount, selectedRoles, selectedRolePool } = req.body || {};
    if (!hostPlayerName || !hostPlayerName.trim()) {
      return reply.status(400).send({ error: "hostPlayerName is required." });
    }

    const effectiveHostId = hostPlayerId && hostPlayerId.trim() ? hostPlayerId.trim() : `host-${uuidv7()}`;

    try {
      const { room, sessionToken } = await RoomManager.createRoom(
        effectiveHostId,
        hostPlayerName.trim(),
        gameMode || "MODE_1_FIXED",
        customRoomId,
        {
          targetPlayerCount,
          selectedRoles,
          selectedRolePool,
        }
      );

      const publicState = FogOfWarDispatcher.buildPublicState(room);
      return reply.status(201).send({
        roomId: room.roomId,
        hostPlayerId: effectiveHostId,
        sessionToken,
        publicState,
      });
    } catch (err: any) {
      const statusCode = err.message?.includes("collision") || err.message?.includes("already exists") ? 409 : 400;
      return reply.status(statusCode).send({ error: err.message });
    }
  });

  fastify.post<{
    Params: { roomId: string };
    Body: { playerId?: string; playerName: string; sessionToken?: string };
  }>("/api/rooms/:roomId/join", async (req, reply) => {
    const { roomId } = req.params;
    const { playerId, playerName, sessionToken } = req.body || {};
    if (!playerName || !playerName.trim()) {
      return reply.status(400).send({ error: "playerName is required." });
    }

    try {
      let room = RoomManager.getRoom(roomId);
      if (!room) {
        room = (await RoomManager.recoverRoom(roomId)) || undefined;
      }
      if (!room) {
        return reply.status(404).send({ error: `Room ${roomId} not found.` });
      }

      const effectivePlayerId = playerId && playerId.trim() ? playerId.trim() : `p-${uuidv7()}`;

      const { room: updatedRoom, sessionToken: token } = await RoomManager.joinRoom(
        roomId,
        effectivePlayerId,
        playerName.trim(),
        undefined,
        sessionToken
      );
      const publicState = FogOfWarDispatcher.buildPublicState(updatedRoom);
      return reply.status(200).send({
        roomId: updatedRoom.roomId,
        playerId: effectivePlayerId,
        sessionToken: token,
        publicState,
      });
    } catch (err: any) {
      const statusCode = err.message?.includes("already claimed") ? 409 : 400;
      return reply.status(statusCode).send({ error: err.message });
    }
  });

  fastify.get<{
    Params: { roomId: string };
  }>("/api/rooms/:roomId", async (req, reply) => {
    const { roomId } = req.params;
    let room = RoomManager.getRoom(roomId);
    if (!room) {
      room = (await RoomManager.recoverRoom(roomId)) || undefined;
    }
    if (!room) {
      return reply.status(404).send({ error: `Room ${roomId} not found.` });
    }

    return reply.status(200).send({
      publicState: FogOfWarDispatcher.buildPublicState(room),
    });
  });

  // 4. WebSocket Ticket Exchange (Hardened authentication without query-string JWT leak)
  fastify.post<{
    Body: { sessionToken: string };
  }>("/api/auth/ws-ticket", async (req, reply) => {
    const { sessionToken } = req.body || {};
    if (!sessionToken || typeof sessionToken !== "string") {
      return reply.status(400).send({ error: "Missing or invalid sessionToken." });
    }
    try {
      const ticket = SessionManager.issueTicket(sessionToken);
      return reply.status(200).send({ ticket, expiresInSeconds: 60 });
    } catch (err: any) {
      return reply.status(401).send({ error: err.message || "Invalid session token." });
    }
  });

  // 5. Register WebSocket Gateway
  await registerWebSocketGateway(fastify);

  return fastify;
}

export async function startServer(): Promise<void> {
  // CRITICAL PRODUCTION PERSISTENCE & SECURITY GATES:
  // Running in production mode without PostgresEventStore or with default secrets is strictly prohibited.
  if (process.env.NODE_ENV === "production") {
    validateProductionSecrets();
    if (!(defaultEventStore instanceof PostgresEventStore)) {
      console.error(
        "❌ [FATAL PERSISTENCE ERROR] NODE_ENV is set to 'production' but the active event store is NOT PostgresEventStore!\n" +
        "ASPIRE: WEREWOLF mandates PostgreSQL persistence in production mode to guarantee historical truth and crash recovery.\n" +
        "Process will terminate immediately."
      );
      process.exit(1);
    }
  }

  const server = await buildServer();

  // 3. STARTUP CRASH RECOVERY: Rehydrate active rooms from canonical EventStore
  try {
    const activeRoomIds = await defaultEventStore.getActiveRoomIds();
    if (activeRoomIds.length > 0) {
      console.log(`\n🔄 [STARTUP CRASH RECOVERY] Rehydrating ${activeRoomIds.length} active room(s) from canonical event store...`);
      for (const roomId of activeRoomIds) {
        try {
          const recovered = await RoomManager.recoverRoom(roomId);
          if (recovered) {
            console.log(`  ✅ Recovered active room ${roomId} (phase: ${recovered.phase}, seq: ${recovered.sequenceNumber}, players: ${recovered.players.length})`);
          }
        } catch (err) {
          console.error(`  ❌ Failed to auto-recover room ${roomId}:`, err);
        }
      }
      console.log(`✅ [STARTUP CRASH RECOVERY] Completed. Active in-memory rooms: ${RoomManager.getAllRooms().length}\n`);
    }
  } catch (err) {
    console.error("⚠️ Warning: Failed to query active rooms during startup:", err);
  }

  try {
    const address = await server.listen({
      port: config.port,
      host: config.host,
    });
    console.log(`\n🚀 ASPIRE Authoritative Server listening on ${address}`);
    console.log(`📡 WebSocket Gateway ready at ws://${config.host}:${config.port}/ws`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}
