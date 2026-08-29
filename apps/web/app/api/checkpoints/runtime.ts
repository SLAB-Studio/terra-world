import {
  createOfficialZeroGStorageDriver,
  createZeroGStorageAdapter,
  loadZeroGServerConfig,
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

export type CheckpointRuntimeMode = "demo" | "disabled" | "zero-g";

export type CheckpointRouteRuntime = Readonly<{
  mode: CheckpointRuntimeMode;
  checkpointPost(request: Request): Promise<Response>;
  sessionPost(request: Request): Promise<Response>;
}>;

export type CheckpointRouteRuntimeOptions = Readonly<{
  mode: CheckpointRuntimeMode;
  allowedOrigins: readonly string[];
  repository?: AdultCheckpointRepository;
  remote?: CheckpointRemoteStorage;
  clock?: () => number;
}>;

/** Composition seam used by the Next routes and by durable production hosts. */
export function createCheckpointRouteRuntime(
  options: CheckpointRouteRuntimeOptions,
): CheckpointRouteRuntime {
  const repository =
    options.repository ?? createMemoryAdultCheckpointRepository();
  const clock = options.clock ?? Date.now;
  const remote = options.remote ?? remoteForMode(options.mode, process.env);
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
  });
}

let defaultRuntime: CheckpointRouteRuntime | undefined;

export function getCheckpointRouteRuntime(): CheckpointRouteRuntime {
  defaultRuntime ??= createCheckpointRouteRuntime({
    mode: readMode(process.env),
    allowedOrigins: readAllowedOrigins(process.env),
  });
  return defaultRuntime;
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
      createZeroGStorageAdapter(loadZeroGServerConfig(env), {
        driver: createOfficialZeroGStorageDriver(),
        maximumUploadBytes: CHECKPOINT_API_LIMITS.maximumBodyBytes,
        maximumDownloadBytes: CHECKPOINT_API_LIMITS.maximumBodyBytes,
      }),
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
