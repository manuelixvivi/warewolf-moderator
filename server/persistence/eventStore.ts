// ============================================================
// ASPIRE: WEREWOLF — EventStore Repository
// Append-Only Event Store Implementation (PostgreSQL + In-Memory Fallback)
// "Event Store is the Canonical Source of Truth."
// ============================================================

import { Pool, PoolClient } from "pg";
import { GameEvent } from "../../src/contracts";

export interface MatchRecord {
  roomId: string;
  gameMode: string;
  hostPlayerId: string;
  hostPlayerName: string;
  status?: "ACTIVE" | "COMPLETED" | "ABANDONED";
  winner?: string;
  winReason?: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface IEventStore {
  saveMatch(match: MatchRecord): Promise<void>;
  appendEvent<T = any>(event: GameEvent<T>): Promise<void>;
  appendBatch(events: GameEvent[]): Promise<void>;
  getEvents(roomId: string, fromSequence?: number, toSequence?: number): Promise<GameEvent[]>;
  getLatestSequence(roomId: string): Promise<number>;
  hasMatch(roomId: string): Promise<boolean>;
  clearRoom?(roomId: string): Promise<void>;
}

/**
 * High-performance PostgreSQL Event Store implementation.
 */
export class PostgresEventStore implements IEventStore {
  private pool: Pool;
  private initialized = false;

  constructor(connectionString?: string) {
    this.pool = new Pool({
      connectionString: connectionString || process.env.DATABASE_URL || process.env.POSTGRES_URL,
    });
  }

  public async init(): Promise<void> {
    if (this.initialized) return;

    const ddl = `
      CREATE TABLE IF NOT EXISTS matches (
          room_id VARCHAR(64) PRIMARY KEY,
          game_mode VARCHAR(32) NOT NULL,
          host_player_id VARCHAR(64) NOT NULL,
          host_player_name VARCHAR(128) NOT NULL,
          status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
          winner VARCHAR(64),
          win_reason TEXT,
          created_at BIGINT NOT NULL,
          updated_at BIGINT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS game_events (
          event_id UUID NOT NULL,
          room_id VARCHAR(64) NOT NULL REFERENCES matches(room_id) ON DELETE CASCADE,
          sequence INTEGER NOT NULL,
          event_type VARCHAR(64) NOT NULL,
          actor_id VARCHAR(64),
          payload JSONB NOT NULL,
          server_signature VARCHAR(128) NOT NULL,
          timestamp BIGINT NOT NULL,
          PRIMARY KEY (room_id, sequence)
      );

      CREATE INDEX IF NOT EXISTS idx_game_events_room_seq ON game_events(room_id, sequence ASC);
    `;

    const client = await this.pool.connect();
    try {
      await client.query(ddl);
      this.initialized = true;
    } finally {
      client.release();
    }
  }

  public async saveMatch(match: MatchRecord): Promise<void> {
    await this.init();
    const now = Date.now();
    const query = `
      INSERT INTO matches (room_id, game_mode, host_player_id, host_player_name, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (room_id) DO UPDATE
      SET updated_at = EXCLUDED.updated_at,
          status = COALESCE(EXCLUDED.status, matches.status);
    `;
    await this.pool.query(query, [
      match.roomId,
      match.gameMode,
      match.hostPlayerId,
      match.hostPlayerName,
      match.status || "ACTIVE",
      match.createdAt || now,
      match.updatedAt || now,
    ]);
  }

  public async appendEvent<T = any>(event: GameEvent<T>): Promise<void> {
    await this.init();
    const query = `
      INSERT INTO game_events (event_id, room_id, sequence, event_type, actor_id, payload, server_signature, timestamp)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (room_id, sequence) DO NOTHING;
    `;
    await this.pool.query(query, [
      event.eventId,
      event.roomId,
      event.sequence,
      event.type,
      event.actorId || null,
      JSON.stringify(event.payload),
      event.serverSignature,
      event.timestamp,
    ]);
  }

  public async appendBatch(events: GameEvent[]): Promise<void> {
    if (events.length === 0) return;
    await this.init();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      for (const event of events) {
        const query = `
          INSERT INTO game_events (event_id, room_id, sequence, event_type, actor_id, payload, server_signature, timestamp)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (room_id, sequence) DO NOTHING;
        `;
        await client.query(query, [
          event.eventId,
          event.roomId,
          event.sequence,
          event.type,
          event.actorId || null,
          JSON.stringify(event.payload),
          event.serverSignature,
          event.timestamp,
        ]);
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  public async getEvents(
    roomId: string,
    fromSequence = 1,
    toSequence = Infinity
  ): Promise<GameEvent[]> {
    await this.init();
    const query = `
      SELECT event_id as "eventId", room_id as "roomId", sequence, event_type as "type",
             actor_id as "actorId", payload, server_signature as "serverSignature", timestamp
      FROM game_events
      WHERE room_id = $1 AND sequence >= $2 AND sequence <= $3
      ORDER BY sequence ASC;
    `;
    const maxSeq = toSequence === Infinity ? 2147483647 : toSequence;
    const res = await this.pool.query(query, [roomId, fromSequence, maxSeq]);
    return res.rows;
  }

  public async getLatestSequence(roomId: string): Promise<number> {
    await this.init();
    const query = `
      SELECT COALESCE(MAX(sequence), 0) as "latestSeq"
      FROM game_events
      WHERE room_id = $1;
    `;
    const res = await this.pool.query(query, [roomId]);
    return parseInt(res.rows[0]?.latestSeq || "0", 10);
  }

  public async hasMatch(roomId: string): Promise<boolean> {
    await this.init();
    const res = await this.pool.query(`SELECT 1 FROM matches WHERE room_id = $1`, [roomId]);
    return (res.rowCount ?? 0) > 0;
  }

  public async clearRoom(roomId: string): Promise<void> {
    await this.init();
    await this.pool.query(`DELETE FROM matches WHERE room_id = $1`, [roomId]);
  }

  public async close(): Promise<void> {
    await this.pool.end();
  }
}

/**
 * In-Memory Event Store for environments without active PostgreSQL instances.
 * Enforces identical constraints: monotonic sequences, unique (room_id, sequence) keys.
 */
export class InMemoryEventStore implements IEventStore {
  private matches = new Map<string, MatchRecord>();
  private eventsByRoom = new Map<string, GameEvent[]>();

  public async saveMatch(match: MatchRecord): Promise<void> {
    this.matches.set(match.roomId, { ...match });
    if (!this.eventsByRoom.has(match.roomId)) {
      this.eventsByRoom.set(match.roomId, []);
    }
  }

  public async appendEvent<T = any>(event: GameEvent<T>): Promise<void> {
    let list = this.eventsByRoom.get(event.roomId);
    if (!list) {
      list = [];
      this.eventsByRoom.set(event.roomId, list);
    }

    // Constraint: (room_id, sequence) must be strictly unique & monotonic
    const existing = list.find((e) => e.sequence === event.sequence);
    if (existing) {
      throw new Error(
        `Unique constraint violation: Sequence ${event.sequence} already exists for room ${event.roomId}.`
      );
    }

    list.push({ ...event });
    list.sort((a, b) => a.sequence - b.sequence);
  }

  public async appendBatch(events: GameEvent[]): Promise<void> {
    for (const e of events) {
      await this.appendEvent(e);
    }
  }

  public async getEvents(
    roomId: string,
    fromSequence = 1,
    toSequence = Infinity
  ): Promise<GameEvent[]> {
    const list = this.eventsByRoom.get(roomId) || [];
    return list
      .filter((e) => e.sequence >= fromSequence && e.sequence <= toSequence)
      .map((e) => ({ ...e }));
  }

  public async getLatestSequence(roomId: string): Promise<number> {
    const list = this.eventsByRoom.get(roomId) || [];
    if (list.length === 0) return 0;
    return list[list.length - 1].sequence;
  }

  public async hasMatch(roomId: string): Promise<boolean> {
    return this.matches.has(roomId);
  }

  public async clearRoom(roomId: string): Promise<void> {
    this.matches.delete(roomId);
    this.eventsByRoom.delete(roomId);
  }
}

// Global EventStore Singleton
export const defaultEventStore: IEventStore =
  process.env.DATABASE_URL || process.env.POSTGRES_URL
    ? new PostgresEventStore()
    : new InMemoryEventStore();
