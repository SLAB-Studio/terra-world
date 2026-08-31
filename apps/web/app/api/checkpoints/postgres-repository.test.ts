import type postgres from "postgres";
import { describe, expect, it } from "vitest";

import type { AdultCheckpointStorageReference, AdultSession } from "./server";
import {
  createPostgresAdultCheckpointRepository,
  readCheckpointDatabaseConfig,
} from "./postgres-repository";

const SESSION: AdultSession = {
  sessionId: `adult-session:${"a".repeat(64)}`,
};
const IDEMPOTENCY_KEY = `checkpoint-v1-${"b".repeat(64)}`;
const CONTENT_HASH = `sha256:${"c".repeat(64)}`;
const TRANSACTION_HASH = `0x${"d".repeat(64)}`;

type SqlInvocation = Readonly<{
  text: string;
  values: readonly unknown[];
}>;

function createSqlFake(results: readonly (readonly unknown[])[]) {
  const invocations: SqlInvocation[] = [];
  let resultIndex = 0;
  const sql = (async (
    strings: TemplateStringsArray,
    ...values: readonly unknown[]
  ) => {
    invocations.push({
      text: strings.join("?").replace(/\s+/gu, " ").trim(),
      values,
    });
    return results[resultIndex++] ?? [];
  }) as unknown as postgres.Sql;
  return { invocations, sql };
}

function reference(
  overrides: Partial<AdultCheckpointStorageReference> = {},
): AdultCheckpointStorageReference {
  return {
    root: "0g-checkpoint-root",
    contentHash: CONTENT_HASH,
    byteLength: 4_096,
    transactionHash: TRANSACTION_HASH,
    transactionSequence: 7,
    idempotencyKey: IDEMPOTENCY_KEY,
    attachedAt: 1_725_000_000_000,
    ...overrides,
  };
}

function row(value: AdultCheckpointStorageReference) {
  return {
    root: value.root,
    content_hash: value.contentHash,
    byte_length: value.byteLength,
    transaction_hash: value.transactionHash ?? null,
    transaction_sequence: String(value.transactionSequence ?? ""),
    idempotency_key: value.idempotencyKey,
    attached_at: String(value.attachedAt),
  };
}

describe("checkpoint database configuration", () => {
  it("accepts an explicit PostgreSQL database with a bounded pool", () => {
    expect(
      readCheckpointDatabaseConfig({
        DATABASE_URL: "postgresql://terra:secret@db.example.com/terra_world",
        TERRA_DATABASE_MAX_CONNECTIONS: "6",
      }),
    ).toEqual({
      databaseUrl: "postgresql://terra:secret@db.example.com/terra_world",
      maximumConnections: 6,
    });
  });

  it.each(["require", "verify-ca", "verify-full"])(
    "accepts the secure PostgreSQL sslmode=%s in production",
    (sslmode) => {
      const databaseUrl = `postgresql://terra:secret@db.example.com/terra_world?sslmode=${sslmode}`;
      expect(
        readCheckpointDatabaseConfig({
          NODE_ENV: "production",
          TERRA_CHECKPOINT_MODE: "zero-g",
          DATABASE_URL: databaseUrl,
        }),
      ).toEqual({ databaseUrl, maximumConnections: 4 });
    },
  );

  it.each([
    ["missing", ""],
    ["disabled", "?sslmode=disable"],
    ["downgrade-friendly", "?sslmode=prefer"],
    ["ambiguous", "?sslmode=require&sslmode=disable"],
  ])(
    "rejects %s PostgreSQL TLS configuration in production",
    (_name, query) => {
      expect(() =>
        readCheckpointDatabaseConfig({
          NODE_ENV: "production",
          TERRA_CHECKPOINT_MODE: "zero-g",
          DATABASE_URL: `postgresql://terra@db.example.com/terra_world${query}`,
        }),
      ).toThrowError(
        "DATABASE_URL must set sslmode=require or stronger in production",
      );
    },
  );

  it("fails closed when production durability is not configured", () => {
    expect(() => readCheckpointDatabaseConfig({})).toThrowError(
      "DATABASE_URL must be a PostgreSQL connection URL",
    );
    expect(() =>
      readCheckpointDatabaseConfig({
        DATABASE_URL: "https://db.example.com/terra_world",
      }),
    ).toThrowError("DATABASE_URL must be a PostgreSQL connection URL");
  });

  it("rejects an unbounded database connection pool", () => {
    expect(() =>
      readCheckpointDatabaseConfig({
        DATABASE_URL: "postgresql://terra@db.example.com/terra_world",
        TERRA_DATABASE_MAX_CONNECTIONS: "100",
      }),
    ).toThrowError("Invalid TERRA_DATABASE_MAX_CONNECTIONS");
  });
});

describe("PostgreSQL checkpoint evidence", () => {
  it("writes and restores the 0G transaction hash and sequence", async () => {
    const storedReference = reference();
    const fake = createSqlFake([
      [{ idempotency_key: IDEMPOTENCY_KEY }],
      [row(storedReference)],
    ]);
    const repository = createPostgresAdultCheckpointRepository({
      databaseUrl: "postgresql://terra@db.example.com/terra_world",
      clock: () => 1_725_000_000_100,
      sql: fake.sql,
    });

    await repository.attach(SESSION, storedReference);
    await expect(
      repository.findByIdempotency(SESSION, IDEMPOTENCY_KEY),
    ).resolves.toEqual(storedReference);

    expect(fake.invocations[0]?.text).toContain(
      "INSERT INTO terra_checkpoint_references",
    );
    expect(fake.invocations[0]?.values[5]).toBe(TRANSACTION_HASH);
    expect(fake.invocations[0]?.values[6]).toBe(7);
    expect(fake.invocations[1]?.text).toContain("reference.transaction_hash");
    expect(fake.invocations[1]?.text).toContain(
      "reference.transaction_sequence",
    );
  });

  it("preserves a null transaction hash for an already-finalized 0G root", async () => {
    const finalizedReference = reference({
      root: "0g-already-finalized-root",
      transactionHash: null,
      transactionSequence: 23,
    });
    const fake = createSqlFake([
      [{ idempotency_key: IDEMPOTENCY_KEY }],
      [row(finalizedReference)],
    ]);
    const repository = createPostgresAdultCheckpointRepository({
      databaseUrl: "postgresql://terra@db.example.com/terra_world",
      sql: fake.sql,
    });

    await repository.attach(SESSION, finalizedReference);
    await expect(
      repository.findByRoot(SESSION, finalizedReference.root),
    ).resolves.toEqual(finalizedReference);

    expect(fake.invocations[0]?.values[5]).toBeNull();
    expect(fake.invocations[0]?.values[6]).toBe(23);
  });
});
