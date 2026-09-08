// ============================================================
// ASPIRE: WEREWOLF — EventStore Repository
// Append-Only Event Store Implementation (PostgreSQL + In-Memory Fallback)
// "Event Store is the Canonical Source of Truth.
//  PostgreSQL = Historical Truth. State = Projection(Events[1..N])."
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

export interface CommandRecord {
  commandId: string;
  roomId: string;
  senderId: string;
  commandType: string;
  processedAt?: number;
}

export interface IEventStore {
  saveMatch(match: MatchRecord): Promise<void>;
  saveParticipant?(participant: {
    roomId: string;
    playerId: string;
    playerName: string;
    isHost?: boolean;
    roleId?: string;
    canonicalName?: string;
    team?: string;
    alive?: boolean;
    joinedAt?: number;
  }): Promise<void>;
  appendEvent<T = any>(event: GameEvent<T>): Promise<void>;
  appendBatch(events: GameEvent[]): Promise<void>;
  getEvents(roomId: string, fromSequence?: number, toSequence?: number): Promise<GameEvent[]>;
  getLatestSequence(roomId: string): Promise<number>;
  hasMatch(roomId: string): Promise<boolean>;
  recordCommand(cmd: CommandRecord): Promise<void>;
  isCommandProcessed(roomId: string, commandId: string): Promise<boolean>;
  getProcessedCommandIds(roomId: string): Promise<Set<string>>;
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

      CREATE TABLE IF NOT EXISTS match_participants (
          id SERIAL PRIMARY KEY,
          room_id VARCHAR(64) NOT NULL REFERENCES matches(room_id) ON DELETE CASCADE,
          player_id VARCHAR(64) NOT NULL,
          player_name VARCHAR(128) NOT NULL,
          role_id VARCHAR(32),
          canonical_name VARCHAR(64),
          team VARCHAR(32),
          alive BOOLEAN NOT NULL DEFAULT TRUE,
          is_host BOOLEAN NOT NULL DEFAULT FALSE,
          joined_at BIGINT NOT NULL,
          UNIQUE (room_id, player_id)
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
      CREATE INDEX IF NOT EXISTS idx_game_events_type ON game_events(event_type);

      CREATE TABLE IF NOT EXISTS processed_commands (
          command_id VARCHAR(128) PRIMARY KEY,
          room_id VARCHAR(64) NOT NULL REFERENCES matches(room_id) ON DELETE CASCADE,
          sender_id VARCHAR(64) NOT NULL,
          command_type VARCHAR(64) NOT NULL,
          processed_at BIGINT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_processed_commands_room ON processed_commands(room_id);
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

  public async saveParticipant(p: {
    roomId: string;
    playerId: string;
    playerName: string;
    isHost?: boolean;
    roleId?: string;
    canonicalName?: string;
    team?: string;
    alive?: boolean;
    joinedAt?: number;
  }): Promise<void> {
    await this.init();
    const query = `
      INSERT INTO match_participants (room_id, player_id, player_name, role_id, canonical_name, team, alive, is_host, joined_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (room_id, player_id) DO UPDATE
      SET role_id = EXCLUDED.role_id,
          canonical_name = EXCLUDED.canonical_name,
          team = EXCLUDED.team,
          alive = EXCLUDED.alive;
    `;
    await this.pool.query(query, [
      p.roomId,
      p.playerId,
      p.playerName,
      p.roleId || null,
      p.canonicalName || null,
      p.team || null,
      p.alive !== undefined ? p.alive : true,
      p.isHost || false,
      p.joinedAt || Date.now(),
    ]);
  }

  public async appendEvent<T = any>(event: GameEvent<T>): Promise<void> {
    await this.init();
    const query = `
      INSERT INTO game_events (event_id, room_id, sequence, event_type, actor_id, payload, server_signature, timestamp)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8);
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
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8);
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

  public async recordCommand(cmd: CommandRecord): Promise<void> {
    await this.init();
    const query = `
      INSERT INTO processed_commands (command_id, room_id, sender_id, command_type, processed_at)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (command_id) DO NOTHING;
    `;
    await this.pool.query(query, [
      cmd.commandId,
      cmd.roomId,
      cmd.senderId,
      cmd.commandType,
      cmd.processedAt || Date.now(),
    ]);
  }

  public async isCommandProcessed(roomId: string, commandId: string): Promise<boolean> {
    await this.init();
    const query = `SELECT 1 FROM processed_commands WHERE command_id = $1 AND room_id = $2;`;
    const res = await this.pool.query(query, [commandId, roomId]);
    return (res.rowCount ?? 0) > 0;
  }

  public async getProcessedCommandIds(roomId: string): Promise<Set<string>> {
    await this.init();
    const query = `SELECT command_id as "commandId" FROM processed_commands WHERE room_id = $1;`;
    const res = await this.pool.query(query, [roomId]);
    return new Set(res.rows.map((r) => r.commandId));
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
 * In-Memory Event Store for test environments & environments without active PostgreSQL.
 * Enforces identical constraints: monotonic sequences, unique (room_id, sequence) keys,
 * and persistent command idempotency.
 */
export class InMemoryEventStore implements IEventStore {
  private matches = new Map<string, MatchRecord>();
  private participants = new Map<string, Map<string, any>>();
  private eventsByRoom = new Map<string, GameEvent[]>();
  private processedCommandsByRoom = new Map<string, Set<string>>();

  public async saveMatch(match: MatchRecord): Promise<void> {
    this.matches.set(match.roomId, { ...match });
    if (!this.eventsByRoom.has(match.roomId)) {
      this.eventsByRoom.set(match.roomId, []);
    }
    if (!this.processedCommandsByRoom.has(match.roomId)) {
      this.processedCommandsByRoom.set(match.roomId, new Set());
    }
  }

  public async saveParticipant(p: {
    roomId: string;
    playerId: string;
    playerName: string;
    isHost?: boolean;
    roleId?: string;
    canonicalName?: string;
    team?: string;
    alive?: boolean;
    joinedAt?: number;
  }): Promise<void> {
    let roomParts = this.participants.get(p.roomId);
    if (!roomParts) {
      roomParts = new Map();
      this.participants.set(p.roomId, roomParts);
    }
    roomParts.set(p.playerId, { ...p });
  }

  public async appendEvent<T = any>(event: GameEvent<T>): Promise<void> {
    let list = this.eventsByRoom.get(event.roomId);
    if (!list) {
      list = [];
      this.eventsByRoom.set(event.roomId, list);
    }

    // Strict constraint: (room_id, sequence) must be unique
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
    if (events.length === 0) return;
    const roomId = events[0].roomId;
    let list = this.eventsByRoom.get(roomId);
    if (!list) {
      list = [];
      this.eventsByRoom.set(roomId, list);
    }

    // Atomic pre-validation: verify no duplicate sequences in batch or store
    const existingSeqs = new Set(list.map((e) => e.sequence));
    for (const e of events) {
      if (existingSeqs.has(e.sequence)) {
        throw new Error(
          `Unique constraint violation in batch: Sequence ${e.sequence} already exists for room ${e.roomId}.`
        );
      }
      existingSeqs.add(e.sequence);
    }

    // Commit batch atomically
    for (const e of events) {
      list.push({ ...e });
    }
    list.sort((a, b) => a.sequence - b.sequence);
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

  public async recordCommand(cmd: CommandRecord): Promise<void> {
    let set = this.processedCommandsByRoom.get(cmd.roomId);
    if (!set) {
      set = new Set();
      this.processedCommandsByRoom.set(cmd.roomId, set);
    }
    set.add(cmd.commandId);
  }

  public async isCommandProcessed(roomId: string, commandId: string): Promise<boolean> {
    const set = this.processedCommandsByRoom.get(roomId);
    return set ? set.has(commandId) : false;
  }

  public async getProcessedCommandIds(roomId: string): Promise<Set<string>> {
    const set = this.processedCommandsByRoom.get(roomId);
    return set ? new Set(set) : new Set();
  }

  public async clearRoom(roomId: string): Promise<void> {
    this.matches.delete(roomId);
    this.participants.delete(roomId);
    this.eventsByRoom.delete(roomId);
    this.processedCommandsByRoom.delete(roomId);
  }
}

// Global EventStore Singleton
export const defaultEventStore: IEventStore =
  process.env.DATABASE_URL || process.env.POSTGRES_URL
    ? new PostgresEventStore()
    : new InMemoryEventStore();
