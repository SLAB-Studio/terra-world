import {
  createOfficialZeroGStorageDriver,
  createZeroGStorageAdapter,
  loadZeroGSponsorConfig,
  loadZeroGStorageConfig,
} from "../../../../../packages/zero-g/src/server";
import {
  CheckpointRemoteError,
  type CheckpointDownloadRequest,
  type CheckpointRemoteStorage,
  type CheckpointUploadRequest,
} from "../../../lib/checkpoints/backup";
import { assertEncryptedCheckpointEnvelope } from "../../../lib/checkpoints/encryption";
import { createZeroGCheckpointRemoteStorage } from "../../../lib/checkpoints/zero-g-server";

import {
  CHECKPOINT_API_LIMITS,
  createAdultSessionRateLimiter,
  createCheckpointPostHandler,
} from "./server";
import {
  createAdultSessionAuthorizer,
  createAdultSessionPostHandler,
  createMemoryAdultCheckpointRepository,
  type AdultCheckpointRepository,
} from "./session-server";
import {
  createPostgresAdultCheckpointRepository,
  readCheckpointDatabaseConfig,
} from "./postgres-repository";
import {
  CheckpointAnchorError,
  createCheckpointAnchorGlobalRateLimiter,
  createCheckpointAnchorPostHandler,
  type CheckpointAnchorEvidence,
  type CheckpointAnchorGlobalRateLimiter,
  type CheckpointAnchorService,
} from "./anchor-server";

export type CheckpointRuntimeMode = "demo" | "disabled" | "zero-g";

export type CheckpointRouteRuntime = Readonly<{
  mode: CheckpointRuntimeMode;
  checkpointPost(request: Request): Promise<Response>;
  sessionPost(request: Request): Promise<Response>;
  anchorPost(request: Request): Promise<Response>;
}>;

export type CheckpointRouteRuntimeOptions = Readonly<{
  mode: CheckpointRuntimeMode;
  allowedOrigins: readonly string[];
  repository?: AdultCheckpointRepository;
  remote?: CheckpointRemoteStorage;
  anchorService?: CheckpointAnchorService;
  anchorGlobalRateLimiter?: CheckpointAnchorGlobalRateLimiter;
  clock?: () => number;
}>;

/** Composition seam used by the Next routes and by durable production hosts. */
export function createCheckpointRouteRuntime(
  options: CheckpointRouteRuntimeOptions,
): CheckpointRouteRuntime {
  const repository =
    options.repository ?? repositoryForMode(options.mode, process.env);
  const clock = options.clock ?? Date.now;
  const remote = options.remote ?? remoteForMode(options.mode, process.env);
  const anchorService =
    options.anchorService ?? anchorServiceForMode(options.mode, process.env);
  const addModeHeader =
    (handler: (request: Request) => Promise<Response>) =>
    async (request: Request): Promise<Response> => {
      const response = await handler(request);
      response.headers.set("x-terra-checkpoint-mode", options.mode);
      return response;
    };

  return Object.freeze({
    mode: options.mode,
    checkpointPost: addModeHeader(
      createCheckpointPostHandler({
        remote,
        sessions: repository,
        authorizeAdultSession: createAdultSessionAuthorizer({
          repository,
          clock,
        }),
        rateLimiter: createAdultSessionRateLimiter({
          capacity: 30,
          windowMs: 60 * 60_000,
          clock,
        }),
        allowedOrigins: options.allowedOrigins,
        clock,
      }),
    ),
    sessionPost: addModeHeader(
      createAdultSessionPostHandler({
        repository,
        allowedOrigins: options.allowedOrigins,
        clock,
      }),
    ),
    anchorPost: addModeHeader(
      createCheckpointAnchorPostHandler({
        repository,
        authorizeAdultSession: createAdultSessionAuthorizer({
          repository,
          clock,
        }),
        sessionRateLimiter: createAdultSessionRateLimiter({
          capacity: 6,
          windowMs: 60 * 60_000,
          clock,
        }),
        globalRateLimiter:
          options.anchorGlobalRateLimiter ?? getGlobalAnchorRateLimiter(),
        service: anchorService,
        allowedOrigins: options.allowedOrigins,
      }),
    ),
  });
}

const CHECKPOINT_RUNTIME_KEY = Symbol.for("terra-world.checkpoint-runtime.v1");
const CHECKPOINT_ANCHOR_RATE_LIMITER_KEY = Symbol.for(
  "terra-world.checkpoint-anchor-global-rate-limiter.v1",
);

type CheckpointRuntimeGlobal = typeof globalThis & {
  [CHECKPOINT_RUNTIME_KEY]?: CheckpointRouteRuntime;
  [CHECKPOINT_ANCHOR_RATE_LIMITER_KEY]?: CheckpointAnchorGlobalRateLimiter;
};

export function getCheckpointRouteRuntime(): CheckpointRouteRuntime {
  const runtimeGlobal = globalThis as CheckpointRuntimeGlobal;
  if (!runtimeGlobal[CHECKPOINT_RUNTIME_KEY]) {
    const mode = readMode(process.env);
    runtimeGlobal[CHECKPOINT_RUNTIME_KEY] = createCheckpointRouteRuntime({
      mode,
      allowedOrigins: readAllowedOrigins(process.env),
      repository: repositoryForMode(mode, process.env),
    });
  }
  return runtimeGlobal[CHECKPOINT_RUNTIME_KEY];
}

export function createMemoryEncryptedCheckpointRemote(
  input: {
    readonly maximumEntries?: number;
  } = {},
): CheckpointRemoteStorage {
  const maximumEntries = boundedInteger(
    input.maximumEntries ?? 1_000,
    1,
    10_000,
  );
  const records = new Map<
    string,
    Readonly<{
      encryptedEnvelope: string;
      contentHash: string;
      byteLength: number;
    }>
  >();

  const memoryRemote: CheckpointRemoteStorage = {
    async upload(request: CheckpointUploadRequest) {
      const bytes = new TextEncoder().encode(request.encryptedEnvelope);
      let parsed: unknown;
      try {
        parsed = JSON.parse(request.encryptedEnvelope) as unknown;
        assertEncryptedCheckpointEnvelope(parsed);
      } catch {
        throw new CheckpointRemoteError("invalid_envelope", false);
      }
      const contentHash = await sha256(bytes);
      if (
        request.idempotencyKey !==
          `checkpoint-v1-${contentHash.slice("sha256:".length)}` ||
        request.contentHash !== contentHash ||
        request.byteLength !== bytes.byteLength
      ) {
        throw new CheckpointRemoteError("integrity_mismatch", false);
      }
      const root = `demo:${contentHash.slice("sha256:".length)}`;
      const previous = records.get(root);
      if (
        previous &&
        (previous.contentHash !== contentHash ||
          previous.byteLength !== bytes.byteLength ||
          previous.encryptedEnvelope !== request.encryptedEnvelope)
      ) {
        throw new CheckpointRemoteError("integrity_mismatch", false);
      }
      if (!previous && records.size >= maximumEntries) {
        throw new CheckpointRemoteError("demo_capacity", false);
      }
      records.set(
        root,
        Object.freeze({
          encryptedEnvelope: request.encryptedEnvelope,
          contentHash,
          byteLength: bytes.byteLength,
        }),
      );
      return Object.freeze({ root, contentHash, byteLength: bytes.byteLength });
    },

    async download(request: CheckpointDownloadRequest) {
      const record = records.get(request.root);
      if (!record) throw new CheckpointRemoteError("not_found", false);
      if (
        record.contentHash !== request.expectedContentHash ||
        record.byteLength !== request.expectedByteLength
      ) {
        throw new CheckpointRemoteError("integrity_mismatch", false);
      }
      return Object.freeze({ root: request.root, ...record });
    },
  };
  return Object.freeze(memoryRemote);
}

function remoteForMode(
  mode: CheckpointRuntimeMode,
  env: NodeJS.ProcessEnv,
): CheckpointRemoteStorage {
  if (mode === "demo") return createMemoryEncryptedCheckpointRemote();
  if (mode === "disabled") return unavailableRemote();

  let remote: CheckpointRemoteStorage | undefined;
  const resolve = (): CheckpointRemoteStorage => {
    remote ??= createZeroGCheckpointRemoteStorage(
      createZeroGStorageAdapter(
        {
          ...loadZeroGStorageConfig(env),
          ...loadZeroGSponsorConfig(env),
        },
        {
          driver: createOfficialZeroGStorageDriver(),
          maximumUploadBytes: CHECKPOINT_API_LIMITS.maximumBodyBytes,
          maximumDownloadBytes: CHECKPOINT_API_LIMITS.maximumBodyBytes,
        },
      ),
    );
    return remote;
  };
  const lazyRemote: CheckpointRemoteStorage = {
    upload: (request: CheckpointUploadRequest) => resolve().upload(request),
    download: (request: CheckpointDownloadRequest) =>
      resolve().download(request),
  };
  return Object.freeze(lazyRemote);
}

function repositoryForMode(
  mode: CheckpointRuntimeMode,
  env: NodeJS.ProcessEnv,
): AdultCheckpointRepository {
  if (readCheckpointRepositoryKind(mode, env) === "memory") {
    return createMemoryAdultCheckpointRepository();
  }
  const database = readCheckpointDatabaseConfig(env);
  return createPostgresAdultCheckpointRepository({
    databaseUrl: database.databaseUrl,
    maximumConnections: database.maximumConnections,
  });
}

export function readCheckpointRepositoryKind(
  mode: CheckpointRuntimeMode,
  env: Readonly<Record<string, string | undefined>>,
): "memory" | "postgres" {
  if (mode !== "zero-g") return "memory";
  const configured = env.TERRA_CHECKPOINT_REPOSITORY?.trim();
  if (
    configured === undefined ||
    configured === "" ||
    configured === "postgres"
  ) {
    return "postgres";
  }
  if (configured !== "memory") {
    throw new TypeError(
      "TERRA_CHECKPOINT_REPOSITORY must be postgres or memory",
    );
  }
  if (env.NODE_ENV === "production") {
    throw new TypeError(
      "Production zero-g mode requires the PostgreSQL checkpoint repository",
    );
  }
  if (
    readExactBoolean(
      env.TERRA_ALLOW_MAINNET_MEMORY_REPOSITORY,
      "TERRA_ALLOW_MAINNET_MEMORY_REPOSITORY",
    ) !== true
  ) {
    throw new TypeError(
      "Mainnet memory repository requires an explicit development opt-in",
    );
  }
  return "memory";
}

export function isAgenticCheckpointSyncEnabled(
  env: Readonly<Record<string, string | undefined>>,
): boolean {
  return (
    readExactBoolean(
      env.TERRA_AGENTIC_SYNC_ENABLED,
      "TERRA_AGENTIC_SYNC_ENABLED",
    ) ?? false
  );
}

function anchorServiceForMode(
  mode: CheckpointRuntimeMode,
  env: NodeJS.ProcessEnv,
): CheckpointAnchorService {
  if (mode !== "zero-g" || !isAgenticCheckpointSyncEnabled(env)) {
    return unavailableAnchorService();
  }

  // The core synchronizer is resolved on the first authorized, validated anchor
  // request so disabled/demo routes never construct a signer or network client.
  let servicePromise: Promise<CheckpointAnchorService> | undefined;
  const inFlight = new Map<string, Promise<CheckpointAnchorEvidence>>();
  return Object.freeze({
    anchor: (request) => {
      const existing = inFlight.get(request.idempotencyKey);
      if (existing !== undefined) return existing;
      servicePromise ??= createCoreAgenticAnchorService(env);
      const operation = servicePromise
        .then((service) => service.anchor(request))
        .finally(() => {
          if (inFlight.get(request.idempotencyKey) === operation) {
            inFlight.delete(request.idempotencyKey);
          }
        });
      inFlight.set(request.idempotencyKey, operation);
      return operation;
    },
  });
}

async function createCoreAgenticAnchorService(
  env: NodeJS.ProcessEnv,
): Promise<CheckpointAnchorService> {
  const ownerPrivateKey = requiredAgenticOwnerPrivateKey(env);
  const storageConfig = loadZeroGStorageConfig(env);
  const sponsorConfig = loadZeroGSponsorConfig(env);
  const storage = createZeroGStorageAdapter(
    { ...storageConfig, ...sponsorConfig },
    {
      driver: createOfficialZeroGStorageDriver(),
      maximumUploadBytes: CHECKPOINT_API_LIMITS.maximumBodyBytes,
      maximumDownloadBytes: CHECKPOINT_API_LIMITS.maximumBodyBytes,
    },
  );
  const agentic = await import("../../../../../packages/zero-g/src/server");
  const synchronizer = agentic.createAgenticMilestoneSynchronizer(
    {
      chainId: agentic.AGENTIC_MILESTONE_MAINNET_TARGET.chainId,
      chainRpcUrl: storageConfig.chainRpcUrl,
      agenticIdProxy: agentic.AGENTIC_MILESTONE_MAINNET_TARGET.agenticIdProxy,
      canonicalRegistry:
        agentic.AGENTIC_MILESTONE_MAINNET_TARGET.canonicalRegistry,
      agentTokenId: agentic.AGENTIC_MILESTONE_MAINNET_TARGET.agentTokenId,
      intelligentDataIndex:
        agentic.AGENTIC_MILESTONE_MAINNET_TARGET.intelligentDataIndex,
      ownerPrivateKey,
    },
    { storage },
  );

  return Object.freeze({
    async anchor(request) {
      const result = await synchronizer.sync({
        idempotencyKey: request.idempotencyKey,
        rootHash: request.checkpointRoot,
        contentHash: request.contentHash,
        byteLength: request.byteLength,
        transactionHash: request.milestoneStorageTransactionHash,
        transactionSequence: request.milestoneStorageTransactionSequence,
        savedAt: request.checkpointSavedAt,
      });
      return Object.freeze({
        status:
          result.status === "already-current"
            ? ("already-synced" as const)
            : ("synced" as const),
        checkpointRoot: request.checkpointRoot,
        agenticRoot: result.milestoneRoot,
        milestoneStorageTransactionHash:
          result.milestoneStorage.transactionHash,
        milestoneStorageTransactionSequence:
          result.milestoneStorage.transactionSequence,
        milestoneStorageBlockNumber: null,
        updateAtTransactionHash: result.updateAt?.transactionHash ?? null,
        updateAtBlockNumber: result.updateAt?.blockNumber ?? null,
        agentCardTransactionHash: result.agentCard?.transactionHash ?? null,
        agentCardBlockNumber: result.agentCard?.blockNumber ?? null,
      });
    },
  });
}

function unavailableAnchorService(): CheckpointAnchorService {
  return Object.freeze({
    anchor: async () => {
      throw new CheckpointAnchorError("not_configured", false);
    },
  });
}

function getGlobalAnchorRateLimiter(): CheckpointAnchorGlobalRateLimiter {
  const runtimeGlobal = globalThis as CheckpointRuntimeGlobal;
  runtimeGlobal[CHECKPOINT_ANCHOR_RATE_LIMITER_KEY] ??=
    createCheckpointAnchorGlobalRateLimiter({
      capacity: 30,
      windowMs: 60 * 60_000,
    });
  return runtimeGlobal[CHECKPOINT_ANCHOR_RATE_LIMITER_KEY];
}

function readExactBoolean(
  value: string | undefined,
  field: string,
): boolean | undefined {
  const normalized = value?.trim().toLowerCase();
  if (normalized === undefined || normalized === "") return undefined;
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  throw new TypeError(`${field} must be true or false`);
}

function requiredAgenticOwnerPrivateKey(
  env: Readonly<Record<string, string | undefined>>,
): `0x${string}` {
  const value = env.ZERO_G_AGENTIC_OWNER_PRIVATE_KEY?.trim();
  if (!value || !/^0x[0-9a-fA-F]{64}$/u.test(value)) {
    throw new TypeError(
      "ZERO_G_AGENTIC_OWNER_PRIVATE_KEY must be a 32-byte private key",
    );
  }
  return value as `0x${string}`;
}

function unavailableRemote(): CheckpointRemoteStorage {
  const unavailable = (): never => {
    throw new CheckpointRemoteError("not_configured", true);
  };
  return Object.freeze({
    upload: async () => unavailable(),
    download: async () => unavailable(),
  });
}

function readMode(env: NodeJS.ProcessEnv): CheckpointRuntimeMode {
  const value = env.TERRA_CHECKPOINT_MODE;
  if (value === "demo" || value === "disabled" || value === "zero-g") {
    return value;
  }
  return env.NODE_ENV === "production" ? "disabled" : "demo";
}

function readAllowedOrigins(env: NodeJS.ProcessEnv): readonly string[] {
  if (env.TERRA_APP_ORIGIN) {
    const parsed = new URL(env.TERRA_APP_ORIGIN);
    if (
      parsed.origin !== env.TERRA_APP_ORIGIN ||
      (env.NODE_ENV === "production" && parsed.protocol !== "https:") ||
      !["http:", "https:"].includes(parsed.protocol)
    ) {
      throw new TypeError("TERRA_APP_ORIGIN must be an origin");
    }
    return Object.freeze([parsed.origin]);
  }
  if (env.NODE_ENV === "production") {
    return Object.freeze(["https://unconfigured.terra-world.invalid"]);
  }
  return Object.freeze(["http://localhost:3000", "http://127.0.0.1:3000"]);
}

async function sha256(
  bytes: Uint8Array<ArrayBuffer>,
): Promise<`sha256:${string}`> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${[...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

function boundedInteger(
  value: number,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RangeError("Invalid checkpoint memory capacity");
  }
  return value;
}
