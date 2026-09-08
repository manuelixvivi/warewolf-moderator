// ============================================================
// ASPIRE: WEREWOLF — Authoritative Session Manager
// Cryptographic JWT Session Issuance & Verification
// "Secrets stay sealed on the server. Clients receive only signed claims."
// ============================================================

import jwt from "jsonwebtoken";
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
}
