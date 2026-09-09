// ============================================================
// ASPIRE: WEREWOLF — Authoritative Server Configuration
// Enterprise Server Architecture (Phase 2)
// "Server owns the state. Engine resolves truth. Secrets stay sealed."
// ============================================================

import crypto from "crypto";

export interface ServerConfig {
  port: number;
  host: string;
  jwtSecret: string;
  hmacSecret: string;
  corsOrigin: string;
  disconnectGracePeriodMs: number; // 60s reconnection window before elimination
  heartbeatIntervalMs: number;     // 15s ping-pong
}

const isProduction = process.env.NODE_ENV === "production";
const devJwtDefault = "aspire-authoritative-jwt-secret-dev-mode-32char+";
const devHmacDefault = "aspire-hmac-sha256-signature-secret-key-32c+";

export function validateProductionSecrets(): void {
  const isProduction = process.env.NODE_ENV === "production";
  if (isProduction) {
    if (!process.env.ASPIRE_JWT_SECRET || process.env.ASPIRE_JWT_SECRET === devJwtDefault) {
      throw new Error(
        "[FATAL_SECURITY_ERROR] Running in production mode (NODE_ENV=production) without a secure ASPIRE_JWT_SECRET.\n" +
        "Default development secrets are strictly prohibited in production."
      );
    }
    if (!process.env.ASPIRE_HMAC_SECRET || process.env.ASPIRE_HMAC_SECRET === devHmacDefault) {
      throw new Error(
        "[FATAL_SECURITY_ERROR] Running in production mode (NODE_ENV=production) without a secure ASPIRE_HMAC_SECRET.\n" +
        "Default development secrets are strictly prohibited in production."
      );
    }
  }
}

if (isProduction) {
  validateProductionSecrets();
}

export const config: ServerConfig = {
  port: parseInt(process.env.PORT || process.env.ASPIRE_PORT || "4000", 10),
  host: process.env.HOST || process.env.ASPIRE_HOST || "0.0.0.0",
  jwtSecret: process.env.ASPIRE_JWT_SECRET || devJwtDefault,
  hmacSecret: process.env.ASPIRE_HMAC_SECRET || devHmacDefault,
  corsOrigin: process.env.ASPIRE_CORS_ORIGIN || "*",
  disconnectGracePeriodMs: 60_000,
  heartbeatIntervalMs: 15_000,
};

/**
 * Deterministic JSON serializer that sorts object keys lexicographically.
 * Ensures HMAC signatures remain identical regardless of PostgreSQL JSONB key reordering.
 */
export function canonicalJsonStringify(obj: any): string {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return `[${obj.map(canonicalJsonStringify).join(",")}]`;
  }
  const keys = Object.keys(obj).sort();
  const pairs = keys.map((k) => `${JSON.stringify(k)}:${canonicalJsonStringify(obj[k])}`);
  return `{${pairs.join(",")}}`;
}

/**
 * Creates an HMAC-SHA256 signature for server-signed GameEvents.
 * Signs full canonical event identity: (roomId, sequence, eventId, timestamp, type, actorId, payload).
 */
export function signGameEvent(
  roomId: string,
  sequence: number,
  type: string,
  payload: any,
  eventId?: string,
  timestamp?: number,
  actorId?: string
): string {
  const data = eventId && timestamp
    ? `${roomId}:${sequence}:${eventId}:${timestamp}:${type}:${actorId || ""}:${canonicalJsonStringify(payload)}`
    : `${roomId}:${sequence}:${type}:${canonicalJsonStringify(payload)}`;
  return crypto.createHmac("sha256", config.hmacSecret).update(data).digest("hex");
}

/**
 * Cryptographically audits an HMAC-SHA256 signature for an immutable GameEvent.
 * Detects any payload, sequence, eventId, timestamp, actorId, or tampering modification.
 */
export function verifyGameEventSignature(event: {
  roomId: string;
  sequence: number;
  type: string;
  payload: any;
  serverSignature: string;
  eventId?: string;
  timestamp?: number;
  actorId?: string;
}): boolean {
  if (!event.serverSignature) return false;

  // 1. Verify against enhanced signature format (all metadata signed)
  if (event.eventId && event.timestamp) {
    const expectedEnhanced = signGameEvent(
      event.roomId,
      event.sequence,
      event.type,
      event.payload,
      event.eventId,
      event.timestamp,
      event.actorId
    );
    try {
      const sigBuf = Buffer.from(event.serverSignature, "hex");
      const expBuf = Buffer.from(expectedEnhanced, "hex");
      if (sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf)) {
        return true;
      }
    } catch {}
  }

  // 2. Fallback to base signature format for backwards compatibility
  const expectedBase = signGameEvent(event.roomId, event.sequence, event.type, event.payload);
  try {
    const sigBuf = Buffer.from(event.serverSignature, "hex");
    const expBuf = Buffer.from(expectedBase, "hex");
    if (sigBuf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expBuf);
  } catch {
    return false;
  }
}

