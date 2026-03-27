-- Migration: 005_sessions_table.sql
-- Description: Persistente sessie-opslag in Supabase zodat sessies bewaard blijven bij herstart backend.

CREATE TABLE IF NOT EXISTS sessions (
    sid  VARCHAR NOT NULL PRIMARY KEY,
    sess JSONB   NOT NULL,
    expire TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_expire_idx ON sessions (expire);
