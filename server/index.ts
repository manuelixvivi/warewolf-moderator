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
import { defaultEventStore, PostgresEventStore } from "./persistence";

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
    Body: { hostPlayerId: string; hostPlayerName: string; gameMode?: any; customRoomId?: string };
  }>("/api/rooms", async (req, reply) => {
    const { hostPlayerId, hostPlayerName, gameMode, customRoomId } = req.body || {};
    if (!hostPlayerId || !hostPlayerName) {
      return reply.status(400).send({ error: "hostPlayerId and hostPlayerName are required." });
    }

    try {
      const { room, sessionToken } = await RoomManager.createRoom(
        hostPlayerId,
        hostPlayerName,
        gameMode || "MODE_1_FIXED",
        customRoomId
      );

      const publicState = FogOfWarDispatcher.buildPublicState(room);
      return reply.status(201).send({
        roomId: room.roomId,
        sessionToken,
        publicState,
      });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.post<{
    Params: { roomId: string };
    Body: { playerId: string; playerName: string };
  }>("/api/rooms/:roomId/join", async (req, reply) => {
    const { roomId } = req.params;
    const { playerId, playerName } = req.body || {};
    if (!playerId || !playerName) {
      return reply.status(400).send({ error: "playerId and playerName are required." });
    }

    try {
      const { room, sessionToken } = await RoomManager.joinRoom(roomId, playerId, playerName);
      const publicState = FogOfWarDispatcher.buildPublicState(room);
      return reply.status(200).send({
        roomId: room.roomId,
        sessionToken,
        publicState,
      });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.get<{
    Params: { roomId: string };
  }>("/api/rooms/:roomId", async (req, reply) => {
    const { roomId } = req.params;
    const room = RoomManager.getRoom(roomId);
    if (!room) {
      return reply.status(404).send({ error: `Room ${roomId} not found.` });
    }

    return reply.status(200).send({
      publicState: FogOfWarDispatcher.buildPublicState(room),
    });
  });

  // 4. Register WebSocket Gateway
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
