// ============================================================
// ASPIRE: WEREWOLF — Authoritative Session Manager
// Cryptographic JWT Session Issuance & Verification
// "Secrets stay sealed on the server. Clients receive only signed claims."
// ============================================================

import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { config } from "../config";
import { SessionTokenPayload } from "../types";

export class SessionManager {
  private static jwtSecret = config.jwtSecret;

  /**
   * Generates a signed JWT session token for a validated player.
   */
  public static createSessionToken(
    playerId: string,
    playerName: string,
    roomId: string,
    isHost: boolean
  ): string {
    const payload: SessionTokenPayload = {
      playerId,
      playerName,
      roomId,
      isHost,
      issuedAt: Date.now(),
    };

    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: "12h",
      algorithm: "HS256",
    });
  }

  /**
   * Verifies and decodes a session token. Returns payload if authentic, null if invalid or tampered.
   */
  public static verifySessionToken(token: string): SessionTokenPayload | null {
    if (!token || typeof token !== "string") {
      return null;
    }

    try {
      const decoded = jwt.verify(token, this.jwtSecret, {
        algorithms: ["HS256"],
      }) as SessionTokenPayload;

      if (!decoded.playerId || !decoded.roomId) {
        return null;
      }

      return decoded;
    } catch {
      return null;
    }
  }

  private static tickets = new Map<string, { token: string; expiresAt: number }>();

  /**
   * Issues a short-lived single-use ticket for WebSocket authentication.
   * Prevents long-lived JWT tokens from appearing in URL query strings or proxy logs.
   */
  public static issueTicket(token: string, ttlMs = 60000): string {
    const verified = this.verifySessionToken(token);
    if (!verified) {
      throw new Error("Invalid or expired session token.");
    }
    const ticketId = `ticket-${randomUUID()}`;
    this.tickets.set(ticketId, { token, expiresAt: Date.now() + ttlMs });
    return ticketId;
  }

  /**
   * Consumes a single-use ticket, returning the associated session token if valid.
   */
  public static consumeTicket(ticketId: string): string | null {
    if (!ticketId || typeof ticketId !== "string") return null;
    const item = this.tickets.get(ticketId);
    if (!item) return null;
    this.tickets.delete(ticketId); // Single-use guarantee
    if (Date.now() > item.expiresAt) return null;
    return item.token;
  }
}
