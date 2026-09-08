-- ============================================================
-- ASPIRE: WEREWOLF — Enterprise Event Store Schema v1.0
-- "Event Store is the Canonical Source of Historical Truth.
--  State is merely a deterministic projection of Event[1..N]."
-- ============================================================

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

