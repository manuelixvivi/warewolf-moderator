// ============================================================
// ASPIRE: WEREWOLF — Fastify WebSocket Gateway
// Real-time authoritative bidirectional connection management
// ============================================================

import { FastifyInstance } from "fastify";
import { WebSocket } from "ws";
import { randomUUID } from "node:crypto";
import { SessionManager } from "../auth/sessionManager";
import { RoomManager } from "../rooms/roomManager";
import { CommandDispatcher } from "./commandDispatcher";
import { FogOfWarDispatcher } from "./fogOfWarDispatcher";

export async function registerWebSocketGateway(fastify: FastifyInstance): Promise<void> {
  fastify.get("/ws", { websocket: true }, (socket: WebSocket, req) => {
    const query = req.query as { ticket?: string };
    // WSS auth: short-lived single-use ticket ONLY.
    // Long-lived JWT (?token=) is intentionally not accepted here — use POST /api/auth/ws-ticket first.
    const token = query.ticket ? SessionManager.consumeTicket(query.ticket) || undefined : undefined;

    if (!token) {
      socket.send(
        JSON.stringify({
          type: "ERROR",
          code: "AUTH_REQUIRED",
          message: "Connection rejected: single-use ticket required (?ticket=...). Obtain one via POST /api/auth/ws-ticket.",
        })
      );
      socket.close(4001, "Auth Required");
      return;
    }

    const session = SessionManager.verifySessionToken(token);
    if (!session) {
      socket.send(
        JSON.stringify({
          type: "ERROR",
          code: "INVALID_TOKEN",
          message: "Connection rejected: invalid or expired session token.",
        })
      );
      socket.close(4002, "Invalid Token");
      return;
    }

    const { playerId, roomId } = session;

    let isSocketReady = false;
    const pendingMessageQueue: (Buffer | string)[] = [];

    const processMessage = async (raw: Buffer | string) => {
      const messageStr = raw.toString();
      const result = await CommandDispatcher.handleCommand(messageStr);

      if (!result.success) {
        socket.send(
          JSON.stringify({
            type: "COMMAND_REJECTED",
            error: result.error,
          })
        );
      }
    };

    // Buffer incoming messages until socket is registered and initial sync has dispatched
    socket.on("message", (raw: Buffer | string) => {
      if (!isSocketReady) {
        pendingMessageQueue.push(raw);
      } else {
        processMessage(raw);
      }
    });

    (async () => {
      let room = RoomManager.getRoom(roomId);
      if (!room) {
        room = (await RoomManager.recoverRoom(roomId)) || undefined;
      }
      if (!room) {
        socket.send(
          JSON.stringify({
            type: "ERROR",
            code: "ROOM_NOT_FOUND",
            message: `Room ${roomId} does not exist.`,
          })
        );
        socket.close(4004, "Room Not Found");
        return;
      }

      // Register connected socket asynchronously and dispatch initial sync upon registration
      const socketId = `sock-${randomUUID()}`;
      try {
        await RoomManager.registerClientSocket(socketId, socket, playerId, roomId);
        const currentRoom = RoomManager.getRoom(roomId);
        if (currentRoom) {
          FogOfWarDispatcher.dispatchRoomSync(currentRoom);
        }
      } catch (err) {
        fastify.log.error({ err, playerId, roomId }, "Failed to register socket");
      }

      // Socket handshake is complete: drain any buffered frames that arrived during registration
      isSocketReady = true;
      while (pendingMessageQueue.length > 0) {
        const raw = pendingMessageQueue.shift()!;
        await processMessage(raw);
      }

      // Handle socket disconnect
      socket.on("close", () => {
        RoomManager.handleClientDisconnect(roomId, playerId, socketId);
      });

      socket.on("error", (err) => {
        fastify.log.error({ err, playerId, roomId }, "WebSocket error");
        RoomManager.handleClientDisconnect(roomId, playerId, socketId);
      });
    })();
  });
}
