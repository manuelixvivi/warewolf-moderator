-- ============================================================
-- ASPIRE: WEREWOLF — Enterprise Event Store Schema v1.0
-- "Event Store is the Canonical Source of Historical Truth.
--  State is merely a deterministic projection of Event[1..N]."
--
-- ARCHITECTURAL ROLE DEFINITIONS:
-- 1. game_events:        CANONICAL HISTORICAL TRUTH (The Single Source of Truth).
--                        Every gameplay mutation exists solely as an immutable event.
--                        Replay reducer reconstructs 100% of game state from this log.
--                        If any disparity exists with projections, game_events ALWAYS wins.
-- 2. matches:            MATCH METADATA PROJECTION (Read Model).
--                        Provides fast query indices for active lobbies and match histories.
-- 3. match_participants: QUERY PROJECTION (Read Model).
--                        Optimized read model for participant listings and player profiles.
-- 4. processed_commands: IDEMPOTENCY INFRASTRUCTURE (Deduplication Store).
--                        Crash-safe tracking of processed command IDs to reject duplicates
--                        even after full process restarts and memory eviction.
-- ============================================================

-- 1. MATCH METADATA PROJECTION
CREATE TABLE IF NOT EXISTS matches (
    room_id VARCHAR(64) PRIMARY KEY,
    game_mode VARCHAR(32) NOT NULL,
    host_player_id VARCHAR(64) NOT NULL,
    host_player_name VARCHAR(128) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE', 'COMPLETED', 'ABANDONED'
    winner VARCHAR(64),
    win_reason TEXT,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
);

-- 2. PARTICIPANT QUERY PROJECTION
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

-- 3. CANONICAL HISTORICAL EVENT STORE (SINGLE SOURCE OF TRUTH)
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

-- 4. PERSISTENT IDEMPOTENCY INFRASTRUCTURE
CREATE TABLE IF NOT EXISTS processed_commands (
    command_id VARCHAR(128) PRIMARY KEY,
    room_id VARCHAR(64) NOT NULL REFERENCES matches(room_id) ON DELETE CASCADE,
    sender_id VARCHAR(64) NOT NULL,
    command_type VARCHAR(64) NOT NULL,
    processed_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_processed_commands_room ON processed_commands(room_id);
