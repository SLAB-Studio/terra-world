CREATE TABLE IF NOT EXISTS terra_checkpoint_sessions (
  session_id TEXT PRIMARY KEY,
  expires_at BIGINT NOT NULL CHECK (expires_at >= 0),
  created_at BIGINT NOT NULL CHECK (created_at >= 0)
);

CREATE INDEX IF NOT EXISTS terra_checkpoint_sessions_expires_at_idx
  ON terra_checkpoint_sessions (expires_at);

CREATE TABLE IF NOT EXISTS terra_checkpoint_references (
  session_id TEXT NOT NULL
    REFERENCES terra_checkpoint_sessions (session_id) ON DELETE RESTRICT,
  idempotency_key TEXT NOT NULL,
  root TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  byte_length INTEGER NOT NULL CHECK (byte_length > 0),
  transaction_hash TEXT,
  transaction_sequence BIGINT CHECK (transaction_sequence >= 0),
  attached_at BIGINT NOT NULL CHECK (attached_at >= 0),
  PRIMARY KEY (session_id, idempotency_key),
  UNIQUE (session_id, root)
);

CREATE INDEX IF NOT EXISTS terra_checkpoint_references_root_idx
  ON terra_checkpoint_references (root, attached_at DESC);
