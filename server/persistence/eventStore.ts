// ============================================================
// ASPIRE: WEREWOLF — EventStore Repository
// Append-Only Event Store Implementation (PostgreSQL + In-Memory Fallback)
// "Event Store is the Canonical Source of Truth.
//  PostgreSQL = Historical Truth. State = Projection(Events[1..N])."
// ============================================================

import { Pool, PoolClient } from "pg";
import { GameEvent } from "../../src/contracts";
import { canonicalJsonStringify } from "../config";

export interface MatchRecord {
  roomId: string;
  gameMode: string;
  hostPlayerId: string;
  hostPlayerName: string;
  status?: "ACTIVE" | "COMPLETED" | "ABANDONED" | "FINISHED" | string;
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

export interface ParticipantRecord {
  roomId: string;
  playerId: string;
  playerName: string;
  isHost?: boolean;
  roleId?: string;
  canonicalName?: string;
  team?: string;
  alive?: boolean;
  joinedAt?: number;
}

export interface IEventStore {
  saveMatch(match: MatchRecord): Promise<void>;
  updateMatchStatus?(
    roomId: string,
    status: string,
    winner?: string,
    winReason?: string
  ): Promise<void>;
  saveParticipant?(participant: ParticipantRecord): Promise<void>;
  updateParticipant?(
    roomId: string,
    playerId: string,
    updates: Partial<ParticipantRecord>
  ): Promise<void>;
  updateParticipantsBatch?(
    roomId: string,
    updates: Array<{ playerId: string } & Partial<ParticipantRecord>>
  ): Promise<void>;
  createRoomAtomic(
    match: MatchRecord,
    hostParticipant: ParticipantRecord,
    initEvent: GameEvent
  ): Promise<void>;
  joinRoomAtomic(
    participant: ParticipantRecord,
    joinEvent: GameEvent,
    command?: CommandRecord
  ): Promise<{ isDuplicate: boolean }>;
  appendEvent<T = any>(event: GameEvent<T>): Promise<void>;
  appendBatch(events: GameEvent[]): Promise<void>;
  appendEventWithCommand<T = any>(
    event: GameEvent<T>,
    command: CommandRecord
  ): Promise<{ isDuplicate: boolean }>;
  appendBatchWithCommand(
    events: GameEvent[],
    command: CommandRecord
  ): Promise<{ isDuplicate: boolean }>;
  getEvents(roomId: string, fromSequence?: number, toSequence?: number): Promise<GameEvent[]>;
  getLatestSequence(roomId: string): Promise<number>;
  hasMatch(roomId: string): Promise<boolean>;
  recordCommand(cmd: CommandRecord): Promise<void>;
  isCommandProcessed(roomId: string, commandId: string): Promise<boolean>;
  getProcessedCommandIds(roomId: string): Promise<Set<string>>;
  getActiveRoomIds(): Promise<string[]>;
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

  public async saveParticipant(p: ParticipantRecord): Promise<void> {
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

  public async updateMatchStatus(
    roomId: string,
    status: string,
    winner?: string,
    winReason?: string
  ): Promise<void> {
    await this.init();
    const query = `
      UPDATE matches
      SET status = $2,
          winner = COALESCE($3, winner),
          win_reason = COALESCE($4, win_reason),
          updated_at = $5
      WHERE room_id = $1;
    `;
    await this.pool.query(query, [roomId, status, winner || null, winReason || null, Date.now()]);
  }

  public async updateParticipant(
    roomId: string,
    playerId: string,
    updates: Partial<ParticipantRecord>
  ): Promise<void> {
    await this.init();
    const sets: string[] = [];
    const values: any[] = [roomId, playerId];
    let idx = 3;

    if (updates.roleId !== undefined) {
      sets.push(`role_id = $${idx++}`);
      values.push(updates.roleId);
    }
    if (updates.canonicalName !== undefined) {
      sets.push(`canonical_name = $${idx++}`);
      values.push(updates.canonicalName);
    }
    if (updates.team !== undefined) {
      sets.push(`team = $${idx++}`);
      values.push(updates.team);
    }
    if (updates.alive !== undefined) {
      sets.push(`alive = $${idx++}`);
      values.push(updates.alive);
    }

    if (sets.length === 0) return;

    const query = `
      UPDATE match_participants
      SET ${sets.join(", ")}
      WHERE room_id = $1 AND player_id = $2;
    `;
    await this.pool.query(query, values);
  }

  public async updateParticipantsBatch(
    roomId: string,
    updates: Array<{ playerId: string } & Partial<ParticipantRecord>>
  ): Promise<void> {
    await this.init();
    if (updates.length === 0) return;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      for (const u of updates) {
        const sets: string[] = [];
        const values: any[] = [roomId, u.playerId];
        let idx = 3;
        if (u.roleId !== undefined) {
          sets.push(`role_id = $${idx++}`);
          values.push(u.roleId);
        }
        if (u.canonicalName !== undefined) {
          sets.push(`canonical_name = $${idx++}`);
          values.push(u.canonicalName);
        }
        if (u.team !== undefined) {
          sets.push(`team = $${idx++}`);
          values.push(u.team);
        }
        if (u.alive !== undefined) {
          sets.push(`alive = $${idx++}`);
          values.push(u.alive);
        }
        if (sets.length > 0) {
          await client.query(
            `UPDATE match_participants SET ${sets.join(", ")} WHERE room_id = $1 AND player_id = $2;`,
            values
          );
        }
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  public async createRoomAtomic(
    match: MatchRecord,
    hostParticipant: any,
    initEvent: GameEvent
  ): Promise<void> {
    await this.init();
    const client = await this.pool.connect();
    const now = Date.now();
    try {
      await client.query("BEGIN");

      // 1. Insert match projection record
      const matchRes = await client.query(
        `INSERT INTO matches (room_id, game_mode, host_player_id, host_player_name, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (room_id) DO NOTHING;`,
        [
          match.roomId,
          match.gameMode,
          match.hostPlayerId,
          match.hostPlayerName,
          match.status || "ACTIVE",
          match.createdAt || now,
          match.updatedAt || now,
        ]
      );
      if (matchRes.rowCount === 0) {
        throw new Error(`Room collision: Room ${match.roomId} already exists.`);
      }

      // 2. Insert host participant query projection
      await client.query(
        `INSERT INTO match_participants (room_id, player_id, player_name, role_id, canonical_name, team, alive, is_host, joined_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (room_id, player_id) DO NOTHING;`,
        [
          hostParticipant.roomId,
          hostParticipant.playerId,
          hostParticipant.playerName,
          hostParticipant.roleId || null,
          hostParticipant.canonicalName || null,
          hostParticipant.team || null,
          hostParticipant.alive !== undefined ? hostParticipant.alive : true,
          hostParticipant.isHost ?? true,
          hostParticipant.joinedAt || now,
        ]
      );

      // 3. Insert initial event into canonical historical event log
      await client.query(
        `INSERT INTO game_events (event_id, room_id, sequence, event_type, actor_id, payload, server_signature, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8);`,
        [
          initEvent.eventId,
          initEvent.roomId,
          initEvent.sequence,
          initEvent.type,
          initEvent.actorId || null,
          canonicalJsonStringify(initEvent.payload),
          initEvent.serverSignature,
          initEvent.timestamp || now,
        ]
      );

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  public async joinRoomAtomic(
    participant: {
      roomId: string;
      playerId: string;
      playerName: string;
      isHost?: boolean;
      roleId?: string;
      canonicalName?: string;
      team?: string;
      alive?: boolean;
      joinedAt?: number;
    },
    joinEvent: GameEvent,
    command?: CommandRecord
  ): Promise<{ isDuplicate: boolean }> {
    await this.init();
    const client = await this.pool.connect();
    const now = Date.now();
    try {
      await client.query("BEGIN");

      // 1. Transactional idempotency check (if command provided)
      if (command) {
        const checkRes = await client.query(
          `SELECT 1 FROM processed_commands WHERE command_id = $1 AND room_id = $2;`,
          [command.commandId, command.roomId]
        );
        if ((checkRes.rowCount ?? 0) > 0) {
          await client.query("ROLLBACK");
          return { isDuplicate: true };
        }
      }

      // 2. Insert match_participant read-model projection (strict INSERT, no UPSERT)
      await client.query(
        `INSERT INTO match_participants (room_id, player_id, player_name, role_id, canonical_name, team, alive, is_host, joined_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);`,
        [
          participant.roomId,
          participant.playerId,
          participant.playerName,
          participant.roleId || null,
          participant.canonicalName || null,
          participant.team || null,
          participant.alive !== undefined ? participant.alive : true,
          participant.isHost || false,
          participant.joinedAt || now,
        ]
      );

      // 3. Insert canonical PLAYER_JOINED event into historical event log
      await client.query(
        `INSERT INTO game_events (event_id, room_id, sequence, event_type, actor_id, payload, server_signature, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8);`,
        [
          joinEvent.eventId,
          joinEvent.roomId,
          joinEvent.sequence,
          joinEvent.type,
          joinEvent.actorId || null,
          canonicalJsonStringify(joinEvent.payload),
          joinEvent.serverSignature,
          joinEvent.timestamp || now,
        ]
      );

      // 4. Record command persistently if provided
      if (command) {
        await client.query(
          `INSERT INTO processed_commands (command_id, room_id, sender_id, command_type, processed_at)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (command_id) DO NOTHING;`,
          [
            command.commandId,
            command.roomId,
            command.senderId,
            command.commandType,
            command.processedAt || now,
          ]
        );
      }

      await client.query("COMMIT");
      return { isDuplicate: false };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  public async appendEvent<T = any>(event: GameEvent<T>): Promise<void> {
    await this.init();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
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
        canonicalJsonStringify(event.payload),
        event.serverSignature,
        event.timestamp,
      ]);
      await this.applyProjectionsInTransaction(client, [event]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  private async applyProjectionsInTransaction(client: PoolClient, events: GameEvent[]): Promise<void> {
    for (const event of events) {
      if (event.type === "ROLES_ASSIGNED" && event.payload?.assignments) {
        for (const a of event.payload.assignments) {
          await client.query(
            `UPDATE match_participants
             SET role_id = $3, canonical_name = $4, team = $5
             WHERE room_id = $1 AND player_id = $2;`,
            [event.roomId, a.playerId, a.role_id, a.canonical_name, a.team]
          );
        }
      } else if (event.payload?.updatedPlayers && Array.isArray(event.payload.updatedPlayers)) {
        for (const p of event.payload.updatedPlayers) {
          await client.query(
            `UPDATE match_participants
             SET alive = $3, role_id = COALESCE($4, role_id), canonical_name = COALESCE($5, canonical_name), team = COALESCE($6, team)
             WHERE room_id = $1 AND player_id = $2;`,
            [event.roomId, p.id, p.alive, p.role_id || null, p.canonical_name || null, p.team || null]
          );
        }
      } else if (event.type === "NIGHT_RESOLVED") {
        const deadIds = new Set<string>([
          ...(event.payload?.killedPlayerIds || []),
          ...(event.payload?.cascadeCasualties || []),
        ]);
        for (const killedId of deadIds) {
          await client.query(
            `UPDATE match_participants
             SET alive = false
             WHERE room_id = $1 AND player_id = $2;`,
            [event.roomId, killedId]
          );
        }
      } else if (event.type === "VOTE_RESOLVED" && event.payload?.eliminatedPlayerId) {
        await client.query(
          `UPDATE match_participants
           SET alive = false
           WHERE room_id = $1 AND player_id = $2;`,
          [event.roomId, event.payload.eliminatedPlayerId]
        );
      } else if (event.type === "ROLE_TRANSFORMED" && event.payload?.playerId) {
        await client.query(
          `UPDATE match_participants
           SET role_id = $3, canonical_name = $4, team = $5
           WHERE room_id = $1 AND player_id = $2;`,
          [event.roomId, event.payload.playerId, event.payload.toRoleId, event.payload.canonicalName, event.payload.toTeam]
        );
      } else if (event.type === "PLAYER_DISCONNECT_TIMEOUT" && event.payload?.playerId) {
        await client.query(
          `UPDATE match_participants
           SET alive = false
           WHERE room_id = $1 AND player_id = $2;`,
          [event.roomId, event.payload.playerId]
        );
      } else if (event.type === "WIN_CONDITION_SATISFIED") {
        await client.query(
          `UPDATE matches
           SET status = 'COMPLETED', winner = $2, win_reason = $3, updated_at = $4
           WHERE room_id = $1;`,
          [event.roomId, event.payload.winner || null, event.payload.reason || null, event.timestamp]
        );
      } else if (event.type === "MATCH_RESTARTED") {
        await client.query(
          `UPDATE matches
           SET status = 'ACTIVE', winner = NULL, win_reason = NULL, updated_at = $2
           WHERE room_id = $1;`,
          [event.roomId, event.timestamp]
        );
        if (event.payload?.resetPlayers && Array.isArray(event.payload.resetPlayers)) {
          for (const rp of event.payload.resetPlayers) {
            await client.query(
              `UPDATE match_participants
               SET alive = true
               WHERE room_id = $1 AND player_id = $2;`,
              [event.roomId, rp.playerId]
            );
          }
        }
      }
    }
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
          canonicalJsonStringify(event.payload),
          event.serverSignature,
          event.timestamp,
        ]);
      }
      // Apply read-model projections in the exact same atomic transaction
      await this.applyProjectionsInTransaction(client, events);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Appends an event and records command idempotency in a single atomic database transaction.
   */
  public async appendEventWithCommand<T = any>(
    event: GameEvent<T>,
    command: CommandRecord
  ): Promise<{ isDuplicate: boolean }> {
    return this.appendBatchWithCommand([event], command);
  }

  /**
   * Appends an event batch and records command idempotency in a single atomic database transaction.
   * If the command was already processed, rolls back and reports duplicate without modifying event log.
   */
  public async appendBatchWithCommand(
    events: GameEvent[],
    command: CommandRecord
  ): Promise<{ isDuplicate: boolean }> {
    await this.init();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      // 1. Transactional idempotency check
      const checkRes = await client.query(
        `SELECT 1 FROM processed_commands WHERE command_id = $1 AND room_id = $2;`,
        [command.commandId, command.roomId]
      );
      if ((checkRes.rowCount ?? 0) > 0) {
        await client.query("ROLLBACK");
        return { isDuplicate: true };
      }

      // 2. Append events to canonical historical log
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
          canonicalJsonStringify(event.payload),
          event.serverSignature,
          event.timestamp,
        ]);
      }

      // 3. Record command persistently in the exact same transaction
      await client.query(
        `INSERT INTO processed_commands (command_id, room_id, sender_id, command_type, processed_at)
         VALUES ($1, $2, $3, $4, $5);`,
        [
          command.commandId,
          command.roomId,
          command.senderId,
          command.commandType,
          command.processedAt || Date.now(),
        ]
      );

      // 4. Apply read-model projections in the exact same atomic transaction
      await this.applyProjectionsInTransaction(client, events);

      await client.query("COMMIT");
      return { isDuplicate: false };
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

  public async getActiveRoomIds(): Promise<string[]> {
    await this.init();
    const query = `SELECT room_id as "roomId" FROM matches WHERE status = 'ACTIVE' ORDER BY created_at ASC;`;
    const res = await this.pool.query(query);
    return res.rows.map((r) => r.roomId);
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

  public async updateMatchStatus(
    roomId: string,
    status: string,
    winner?: string,
    winReason?: string
  ): Promise<void> {
    const match = this.matches.get(roomId);
    if (match) {
      match.status = status;
      if (winner !== undefined) match.winner = winner;
      if (winReason !== undefined) match.winReason = winReason;
      match.updatedAt = Date.now();
    }
  }

  public async saveParticipant(p: ParticipantRecord): Promise<void> {
    let roomParts = this.participants.get(p.roomId);
    if (!roomParts) {
      roomParts = new Map();
      this.participants.set(p.roomId, roomParts);
    }
    roomParts.set(p.playerId, { ...p });
  }

  public async updateParticipant(
    roomId: string,
    playerId: string,
    updates: Partial<ParticipantRecord>
  ): Promise<void> {
    const parts = this.participants.get(roomId);
    if (parts) {
      const p = parts.get(playerId);
      if (p) {
        Object.assign(p, updates);
      }
    }
  }

  public async updateParticipantsBatch(
    roomId: string,
    updates: Array<{ playerId: string } & Partial<ParticipantRecord>>
  ): Promise<void> {
    for (const u of updates) {
      await this.updateParticipant(roomId, u.playerId, u);
    }
  }

  public async createRoomAtomic(
    match: MatchRecord,
    hostParticipant: any,
    initEvent: GameEvent
  ): Promise<void> {
    const roomId = match.roomId;
    if (this.matches.has(roomId)) {
      throw new Error(`Room collision: Room ${roomId} already exists.`);
    }
    const oldMatch = this.matches.get(roomId);
    const oldParts = this.participants.get(roomId);
    const oldEvents = this.eventsByRoom.get(roomId);

    try {
      await this.saveMatch(match);
      await this.saveParticipant(hostParticipant);
      await this.appendEvent(initEvent);
    } catch (err) {
      if (oldMatch) this.matches.set(roomId, oldMatch);
      else this.matches.delete(roomId);
      if (oldParts) this.participants.set(roomId, oldParts);
      else this.participants.delete(roomId);
      if (oldEvents) this.eventsByRoom.set(roomId, oldEvents);
      else this.eventsByRoom.delete(roomId);
      throw err;
    }
  }

  public async joinRoomAtomic(
    participant: any,
    joinEvent: GameEvent,
    command?: CommandRecord
  ): Promise<{ isDuplicate: boolean }> {
    if (command && (await this.isCommandProcessed(command.roomId, command.commandId))) {
      return { isDuplicate: true };
    }
    let roomParts = this.participants.get(participant.roomId);
    if (!roomParts) {
      roomParts = new Map();
      this.participants.set(participant.roomId, roomParts);
    }
    if (roomParts.has(participant.playerId)) {
      throw new Error(`Participant collision: Player ${participant.playerId} already in room ${participant.roomId}`);
    }

    await this.saveParticipant(participant);
    try {
      await this.appendEvent(joinEvent);
    } catch (err) {
      roomParts.delete(participant.playerId);
      throw err;
    }

    if (command) {
      await this.recordCommand(command);
    }
    return { isDuplicate: false };
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
    this.applyProjectionsInMemory([event]);
  }

  private applyProjectionsInMemory(events: GameEvent[]): void {
    for (const event of events) {
      const roomParts = this.participants.get(event.roomId);
      if (event.type === "ROLES_ASSIGNED" && event.payload?.assignments) {
        for (const a of event.payload.assignments) {
          const p = roomParts?.get(a.playerId);
          if (p) {
            p.roleId = a.role_id;
            p.canonicalName = a.canonical_name;
            p.team = a.team;
          }
        }
      } else if (event.payload?.updatedPlayers && Array.isArray(event.payload.updatedPlayers)) {
        for (const up of event.payload.updatedPlayers) {
          const p = roomParts?.get(up.id);
          if (p) {
            p.alive = up.alive;
            if (up.role_id) p.roleId = up.role_id;
            if (up.canonical_name) p.canonicalName = up.canonical_name;
            if (up.team) p.team = up.team;
          }
        }
      } else if (event.type === "NIGHT_RESOLVED") {
        const deadIds = new Set<string>([
          ...(event.payload?.killedPlayerIds || []),
          ...(event.payload?.cascadeCasualties || []),
        ]);
        for (const killedId of deadIds) {
          const p = roomParts?.get(killedId);
          if (p) p.alive = false;
        }
      } else if (event.type === "VOTE_RESOLVED" && event.payload?.eliminatedPlayerId) {
        const p = roomParts?.get(event.payload.eliminatedPlayerId);
        if (p) p.alive = false;
      } else if (event.type === "ROLE_TRANSFORMED" && event.payload?.playerId) {
        const p = roomParts?.get(event.payload.playerId);
        if (p) {
          p.roleId = event.payload.toRoleId;
          p.canonicalName = event.payload.canonicalName;
          p.team = event.payload.toTeam;
        }
      } else if (event.type === "PLAYER_DISCONNECT_TIMEOUT" && event.payload?.playerId) {
        const p = roomParts?.get(event.payload.playerId);
        if (p) p.alive = false;
      } else if (event.type === "WIN_CONDITION_SATISFIED") {
        const match = this.matches.get(event.roomId);
        if (match) {
          match.status = "COMPLETED";
          match.winner = event.payload.winner;
          match.winReason = event.payload.reason;
          match.updatedAt = event.timestamp;
        }
      } else if (event.type === "MATCH_RESTARTED") {
        const match = this.matches.get(event.roomId);
        if (match) {
          match.status = "ACTIVE";
          match.winner = undefined;
          match.winReason = undefined;
          match.updatedAt = event.timestamp;
        }
        if (event.payload?.resetPlayers && Array.isArray(event.payload.resetPlayers)) {
          for (const rp of event.payload.resetPlayers) {
            const p = roomParts?.get(rp.playerId);
            if (p) p.alive = true;
          }
        }
      }
    }
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

    // Apply read-model projections atomically
    this.applyProjectionsInMemory(events);
  }

  public async appendEventWithCommand<T = any>(
    event: GameEvent<T>,
    command: CommandRecord
  ): Promise<{ isDuplicate: boolean }> {
    return this.appendBatchWithCommand([event], command);
  }

  public async appendBatchWithCommand(
    events: GameEvent[],
    command: CommandRecord
  ): Promise<{ isDuplicate: boolean }> {
    if (await this.isCommandProcessed(command.roomId, command.commandId)) {
      return { isDuplicate: true };
    }
    const roomId = command.roomId;
    const existingEvents = this.eventsByRoom.get(roomId);
    const eventsSnapshot = existingEvents ? [...existingEvents] : undefined;
    const existingCmds = this.processedCommandsByRoom.get(roomId);
    const cmdsSnapshot = existingCmds ? new Set(existingCmds) : undefined;
    const existingParts = this.participants.get(roomId);
    const partsSnapshot = existingParts ? new Map(Array.from(existingParts.entries()).map(([k, v]) => [k, { ...v }])) : undefined;
    const existingMatch = this.matches.get(roomId);
    const matchSnapshot = existingMatch ? { ...existingMatch } : undefined;

    try {
      await this.appendBatch(events);
      await this.recordCommand(command);
      return { isDuplicate: false };
    } catch (err) {
      if (eventsSnapshot !== undefined) {
        this.eventsByRoom.set(roomId, eventsSnapshot);
      } else {
        this.eventsByRoom.delete(roomId);
      }
      if (cmdsSnapshot !== undefined) {
        this.processedCommandsByRoom.set(roomId, cmdsSnapshot);
      } else {
        this.processedCommandsByRoom.delete(roomId);
      }
      if (partsSnapshot !== undefined) {
        this.participants.set(roomId, partsSnapshot);
      } else {
        this.participants.delete(roomId);
      }
      if (matchSnapshot !== undefined) {
        this.matches.set(roomId, matchSnapshot);
      } else {
        this.matches.delete(roomId);
      }
      throw err;
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

  public async getActiveRoomIds(): Promise<string[]> {
    const active: string[] = [];
    for (const [roomId, match] of this.matches.entries()) {
      if ((match.status || "ACTIVE") === "ACTIVE") {
        active.push(roomId);
      }
    }
    return active;
  }

  public async clearRoom(roomId: string): Promise<void> {
    this.matches.delete(roomId);
    this.participants.delete(roomId);
    this.eventsByRoom.delete(roomId);
    this.processedCommandsByRoom.delete(roomId);
  }
}

// ------------------------------------------------------------
// PRODUCTION PERSISTENCE GATE
// ------------------------------------------------------------
const isProduction = process.env.NODE_ENV === "production";
const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (isProduction && !connectionString) {
  throw new Error(
    "[FATAL_PERSISTENCE_ERROR] Running in production mode (NODE_ENV=production) but no PostgreSQL DATABASE_URL or POSTGRES_URL was provided.\n" +
    "ASPIRE: WEREWOLF mandates PostgreSQL as the canonical historical event store in production.\n" +
    "Fallback to InMemoryEventStore is strictly prohibited in production to prevent catastrophic data loss upon container/process restart."
  );
}

// Global EventStore Singleton
export const defaultEventStore: IEventStore = connectionString
  ? new PostgresEventStore(connectionString)
  : new InMemoryEventStore();
