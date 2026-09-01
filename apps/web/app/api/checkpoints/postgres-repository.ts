import postgres from "postgres";

import type { AdultCheckpointStorageReference, AdultSession } from "./server";
import type { AdultCheckpointRepository } from "./session-server";

const SESSION_ID = /^adult-session:[a-f0-9]{64}$/u;
const SAFE_ROOT = /^[A-Za-z0-9._:-]{1,256}$/u;
const IDEMPOTENCY_KEY = /^checkpoint-v1-[a-f0-9]{64}$/u;
const CONTENT_HASH = /^sha256:[a-f0-9]{64}$/u;
const TRANSACTION_HASH = /^0x[a-fA-F0-9]{64}$/u;
const SECURE_DATABASE_SSL_MODES = new Set([
  "require",
  "verify-ca",
  "verify-full",
]);

type CheckpointDatabaseConfig = Readonly<{
  databaseUrl: string;
  maximumConnections: number;
}>;

type ReferenceRow = Readonly<{
  root: string;
  content_hash: string;
  byte_length: number;
  transaction_hash: string | null;
  transaction_sequence: string | number | null;
  idempotency_key: string;
  checkpoint_saved_at: string | number | null;
  attached_at: string | number;
}>;

export type PostgresCheckpointRepositoryOptions = Readonly<{
  databaseUrl: string;
  maximumConnections?: number;
  clock?: () => number;
  sql?: postgres.Sql;
}>;

/**
 * Durable ownership index for encrypted 0G Storage checkpoints.
 *
 * Only opaque session identifiers, 0G roots, hashes, sizes, and timestamps are
 * stored in PostgreSQL. Gameplay state and recovery keys never reach this
 * database. Run `pnpm zero-g:db:migrate` before enabling zero-g mode.
 */
export function createPostgresAdultCheckpointRepository(
  options: PostgresCheckpointRepositoryOptions,
): AdultCheckpointRepository {
  const databaseUrl = validateDatabaseUrl(options.databaseUrl);
  const maximumConnections = boundedInteger(
    options.maximumConnections ?? 4,
    1,
    20,
    "checkpoint database connection limit",
  );
  const clock = options.clock ?? Date.now;
  const sql =
    options.sql ??
    postgres(databaseUrl, {
      max: maximumConnections,
      connect_timeout: 10,
      idle_timeout: 20,
      max_lifetime: 60 * 30,
      prepare: true,
    });

  const repository: AdultCheckpointRepository = {
    async createSession(sessionId, expiresAt) {
      assertSessionId(sessionId);
      const safeExpiry = validTimestamp(expiresAt);
      const createdAt = validTimestamp(clock());
      await sql`
        INSERT INTO terra_checkpoint_sessions (
          session_id,
          expires_at,
          created_at
        ) VALUES (
          ${sessionId},
          ${safeExpiry},
          ${createdAt}
        )
        ON CONFLICT (session_id) DO UPDATE
        SET expires_at = EXCLUDED.expires_at
      `;
    },

    async isSessionActive(sessionId, now) {
      if (!SESSION_ID.test(sessionId)) return false;
      const checkedAt = validTimestamp(now);
      const rows = await sql<{ active: boolean }[]>`
        SELECT EXISTS (
          SELECT 1
          FROM terra_checkpoint_sessions
          WHERE session_id = ${sessionId}
            AND expires_at > ${checkedAt}
        ) AS active
      `;
      return rows[0]?.active === true;
    },

    async findByIdempotency(session, idempotencyKey) {
      if (!isValidSession(session) || !IDEMPOTENCY_KEY.test(idempotencyKey)) {
        return null;
      }
      const rows = await sql<ReferenceRow[]>`
        SELECT
          reference.root,
          reference.content_hash,
          reference.byte_length,
          reference.transaction_hash,
          reference.transaction_sequence,
          reference.idempotency_key,
          reference.checkpoint_saved_at,
          reference.attached_at
        FROM terra_checkpoint_references AS reference
        INNER JOIN terra_checkpoint_sessions AS session
          ON session.session_id = reference.session_id
        WHERE reference.session_id = ${session.sessionId}
          AND reference.idempotency_key = ${idempotencyKey}
          AND session.expires_at > ${validTimestamp(clock())}
        LIMIT 1
      `;
      return rows[0] ? referenceFromRow(rows[0]) : null;
    },

    async attach(session, reference) {
      assertSession(session);
      assertReference(reference);
      const now = validTimestamp(clock());
      const inserted = await sql<{ idempotency_key: string }[]>`
        INSERT INTO terra_checkpoint_references (
          session_id,
          idempotency_key,
          root,
          content_hash,
          byte_length,
          transaction_hash,
          transaction_sequence,
          checkpoint_saved_at,
          attached_at
        )
        SELECT
          ${session.sessionId},
          ${reference.idempotencyKey},
          ${reference.root},
          ${reference.contentHash},
          ${reference.byteLength},
          ${reference.transactionHash ?? null},
          ${reference.transactionSequence ?? null},
          ${reference.checkpointSavedAt},
          ${reference.attachedAt}
        WHERE EXISTS (
          SELECT 1
          FROM terra_checkpoint_sessions
          WHERE session_id = ${session.sessionId}
            AND expires_at > ${now}
        )
        ON CONFLICT DO NOTHING
        RETURNING idempotency_key
      `;
      if (inserted.length > 0) return;

      const rows = await sql<ReferenceRow[]>`
        SELECT
          root,
          content_hash,
          byte_length,
          transaction_hash,
          transaction_sequence,
          idempotency_key,
          checkpoint_saved_at,
          attached_at
        FROM terra_checkpoint_references
        WHERE session_id = ${session.sessionId}
          AND idempotency_key = ${reference.idempotencyKey}
        LIMIT 1
      `;
      const existing = rows[0] ? referenceFromRow(rows[0]) : null;
      if (!existing || !sameReference(existing, reference)) {
        throw new TypeError("Checkpoint reference could not be attached");
      }
    },

    async findByRoot(session, root) {
      if (!isValidSession(session) || !SAFE_ROOT.test(root)) return null;
      const rows = await sql<ReferenceRow[]>`
        SELECT
          root,
          content_hash,
          byte_length,
          transaction_hash,
          transaction_sequence,
          idempotency_key,
          checkpoint_saved_at,
          attached_at
        FROM terra_checkpoint_references
        WHERE root = ${root}
        ORDER BY attached_at DESC
        LIMIT 1
      `;
      return rows[0] ? referenceFromRow(rows[0]) : null;
    },
  };

  return Object.freeze(repository);
}

export function readCheckpointDatabaseConfig(
  env: Readonly<Record<string, string | undefined>>,
): CheckpointDatabaseConfig {
  const databaseUrl = validateDatabaseUrl(env.DATABASE_URL ?? "");
  assertSecureProductionDatabaseUrl(databaseUrl, env.NODE_ENV);
  const rawMaximumConnections = env.TERRA_DATABASE_MAX_CONNECTIONS;
  const maximumConnections =
    rawMaximumConnections === undefined
      ? 4
      : boundedInteger(
          Number(rawMaximumConnections),
          1,
          20,
          "TERRA_DATABASE_MAX_CONNECTIONS",
        );
  return Object.freeze({ databaseUrl, maximumConnections });
}

function referenceFromRow(row: ReferenceRow): AdultCheckpointStorageReference {
  const reference = {
    root: row.root,
    contentHash: row.content_hash,
    byteLength: Number(row.byte_length),
    transactionHash: row.transaction_hash,
    transactionSequence:
      row.transaction_sequence === null
        ? null
        : Number(row.transaction_sequence),
    idempotencyKey: row.idempotency_key,
    checkpointSavedAt:
      row.checkpoint_saved_at === null ? null : Number(row.checkpoint_saved_at),
    attachedAt: Number(row.attached_at),
  };
  assertReference(reference);
  return Object.freeze(reference);
}

function sameReference(
  left: AdultCheckpointStorageReference,
  right: AdultCheckpointStorageReference,
): boolean {
  return (
    left.root === right.root &&
    left.contentHash === right.contentHash &&
    left.byteLength === right.byteLength &&
    (left.transactionHash ?? null) === (right.transactionHash ?? null) &&
    (left.transactionSequence ?? null) ===
      (right.transactionSequence ?? null) &&
    left.idempotencyKey === right.idempotencyKey &&
    left.checkpointSavedAt === right.checkpointSavedAt &&
    left.attachedAt === right.attachedAt
  );
}

function isValidSession(session: AdultSession): boolean {
  return SESSION_ID.test(session.sessionId);
}

function assertSession(session: AdultSession): void {
  if (!isValidSession(session)) {
    throw new TypeError("Invalid adult checkpoint session");
  }
}

function assertSessionId(sessionId: string): void {
  if (!SESSION_ID.test(sessionId)) {
    throw new TypeError("Invalid adult checkpoint session identifier");
  }
}

function assertReference(reference: AdultCheckpointStorageReference): void {
  if (
    !SAFE_ROOT.test(reference.root) ||
    !IDEMPOTENCY_KEY.test(reference.idempotencyKey) ||
    !CONTENT_HASH.test(reference.contentHash) ||
    !Number.isSafeInteger(reference.byteLength) ||
    reference.byteLength < 1 ||
    (reference.transactionHash !== undefined &&
      reference.transactionHash !== null &&
      !TRANSACTION_HASH.test(reference.transactionHash)) ||
    (reference.transactionSequence !== undefined &&
      reference.transactionSequence !== null &&
      (!Number.isSafeInteger(reference.transactionSequence) ||
        reference.transactionSequence < 0)) ||
    (reference.checkpointSavedAt !== null &&
      (!Number.isSafeInteger(reference.checkpointSavedAt) ||
        reference.checkpointSavedAt < 0)) ||
    !Number.isSafeInteger(reference.attachedAt) ||
    reference.attachedAt < 0
  ) {
    throw new TypeError("Invalid adult checkpoint reference");
  }
}

function validateDatabaseUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new TypeError("DATABASE_URL must be a PostgreSQL connection URL");
  }
  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    parsed.hostname.length === 0 ||
    parsed.pathname.length <= 1
  ) {
    throw new TypeError("DATABASE_URL must be a PostgreSQL connection URL");
  }
  return value;
}

function assertSecureProductionDatabaseUrl(
  databaseUrl: string,
  nodeEnvironment: string | undefined,
): void {
  if (nodeEnvironment !== "production") return;
  const sslModes = new URL(databaseUrl).searchParams.getAll("sslmode");
  if (
    sslModes.length !== 1 ||
    !SECURE_DATABASE_SSL_MODES.has(sslModes[0] ?? "")
  ) {
    throw new TypeError(
      "DATABASE_URL must set sslmode=require or stronger in production",
    );
  }
}

function validTimestamp(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError("Invalid checkpoint timestamp");
  }
  return value;
}

function boundedInteger(
  value: number,
  minimum: number,
  maximum: number,
  label: string,
): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`Invalid ${label}`);
  }
  return value;
}
