// ============================================================
// ASPIRE: WEREWOLF — Fastify WebSocket Gateway
// Real-time authoritative bidirectional connection management
// ============================================================

import { FastifyInstance } from "fastify";
import { WebSocket } from "ws";
import { SessionManager } from "../auth/sessionManager";
import { RoomManager } from "../rooms/roomManager";
import { CommandDispatcher } from "./commandDispatcher";
import { FogOfWarDispatcher } from "./fogOfWarDispatcher";

export async function registerWebSocketGateway(fastify: FastifyInstance): Promise<void> {
  fastify.get("/ws", { websocket: true }, (socket: WebSocket, req) => {
    const query = req.query as { token?: string; roomId?: string };
    const token = query.token;

    if (!token) {
      socket.send(
        JSON.stringify({
          type: "ERROR",
          code: "AUTH_REQUIRED",
          message: "Connection rejected: session token required in query (?token=...).",
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
    const room = RoomManager.getRoom(roomId);
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

    // Register connected socket
    const socketId = `sock-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    RoomManager.registerClientSocket(socketId, socket, playerId, roomId);

    // Immediately dispatch initial synchronized Fog-of-War state
    FogOfWarDispatcher.dispatchRoomSync(room);

    // Handle incoming frames
    socket.on("message", async (raw: Buffer | string) => {
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
    });

    // Handle socket disconnect
    socket.on("close", () => {
      RoomManager.handleClientDisconnect(roomId, playerId);
    });

    socket.on("error", (err) => {
      fastify.log.error({ err, playerId, roomId }, "WebSocket error");
      RoomManager.handleClientDisconnect(roomId, playerId);
    });
  });
}
