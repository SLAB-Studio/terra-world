import { getZeroGPublicNetwork, type ZeroGNetworkName } from "../network";
import { ZeroGConfigError } from "./errors";

export type ZeroGEnvironment = Readonly<Record<string, string | undefined>>;

export type ZeroGServerConfig = Readonly<{
  network: ZeroGNetworkName;
  chainId: 16602 | 16661;
  chainRpcUrl: string;
  chainExplorerUrl: string;
  compute: Readonly<{
    baseUrl: string;
    apiKey: string;
    model: string;
    trustMode: "private";
    verifyTee: true;
  }>;
  storage: Readonly<{
    indexerUrl: string;
  }>;
  sponsorPrivateKey: `0x${string}`;
  request: Readonly<{
    timeoutMs: number;
    maxRetries: number;
  }>;
}>;

const OFFICIAL_COMPUTE_HOSTS: Record<ZeroGNetworkName, string> = {
  testnet: "router-api-testnet.integratenetwork.work",
  mainnet: "router-api.0g.ai",
};

function required(env: ZeroGEnvironment, field: string): string {
  const value = env[field]?.trim();
  if (!value) {
    throw new ZeroGConfigError(
      "MISSING_VALUE",
      field,
      `${field} is required for the server-side 0G integration`,
    );
  }
  return value;
}

function parseNetwork(value: string): ZeroGNetworkName {
  if (value === "testnet" || value === "mainnet") return value;
  throw new ZeroGConfigError(
    "INVALID_VALUE",
    "ZERO_G_NETWORK",
    "ZERO_G_NETWORK must be either testnet or mainnet",
  );
}

function parseHttpsUrl(value: string, field: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ZeroGConfigError(
      "INVALID_VALUE",
      field,
      `${field} must be a valid URL`,
    );
  }
  if (url.protocol !== "https:") {
    throw new ZeroGConfigError(
      "INSECURE_URL",
      field,
      `${field} must use HTTPS`,
    );
  }
  return url.toString().replace(/\/$/, "");
}

function parseInteger(
  env: ZeroGEnvironment,
  field: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = env[field]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new ZeroGConfigError(
      "INVALID_VALUE",
      field,
      `${field} must be an integer between ${minimum} and ${maximum}`,
    );
  }
  return value;
}

function parseApiKey(value: string): string {
  if (!/^sk-[A-Za-z0-9_-]{8,}$/.test(value)) {
    throw new ZeroGConfigError(
      "INVALID_VALUE",
      "ZERO_G_COMPUTE_API_KEY",
      "ZERO_G_COMPUTE_API_KEY must be an inference key beginning with sk-",
    );
  }
  return value;
}

function parsePrivateKey(value: string): `0x${string}` {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new ZeroGConfigError(
      "INVALID_VALUE",
      "ZERO_G_SPONSOR_PRIVATE_KEY",
      "ZERO_G_SPONSOR_PRIVATE_KEY must be a 32-byte hex private key",
    );
  }
  return value as `0x${string}`;
}

function assertComputeNetwork(
  network: ZeroGNetworkName,
  baseUrl: string,
): void {
  const host = new URL(baseUrl).hostname;
  if (host !== OFFICIAL_COMPUTE_HOSTS[network]) {
    throw new ZeroGConfigError(
      "NETWORK_MISMATCH",
      "ZERO_G_COMPUTE_ROUTER_URL",
      `The Compute Router host does not match the ${network} environment`,
    );
  }
}

export function loadZeroGServerConfig(
  env: ZeroGEnvironment,
): ZeroGServerConfig {
  const network = parseNetwork(required(env, "ZERO_G_NETWORK"));
  const defaults = getZeroGPublicNetwork(network);
  const chainRpcUrl = parseHttpsUrl(
    env.ZERO_G_CHAIN_RPC_URL ?? defaults.chainRpcUrl,
    "ZERO_G_CHAIN_RPC_URL",
  );
  const computeBaseUrl = parseHttpsUrl(
    env.ZERO_G_COMPUTE_ROUTER_URL ?? defaults.computeRouterUrl,
    "ZERO_G_COMPUTE_ROUTER_URL",
  );
  assertComputeNetwork(network, computeBaseUrl);

  const configuredIndexer =
    env.ZERO_G_STORAGE_INDEXER_URL ?? defaults.storageIndexerUrl;
  if (!configuredIndexer) {
    throw new ZeroGConfigError(
      "MISSING_VALUE",
      "ZERO_G_STORAGE_INDEXER_URL",
      "ZERO_G_STORAGE_INDEXER_URL is required when the network has no stable default",
    );
  }

  return Object.freeze({
    network,
    chainId: defaults.chainId,
    chainRpcUrl,
    chainExplorerUrl: defaults.chainExplorerUrl,
    compute: Object.freeze({
      baseUrl: computeBaseUrl,
      apiKey: parseApiKey(required(env, "ZERO_G_COMPUTE_API_KEY")),
      model: required(env, "ZERO_G_COMPUTE_MODEL"),
      trustMode: "private" as const,
      verifyTee: true as const,
    }),
    storage: Object.freeze({
      indexerUrl: parseHttpsUrl(
        configuredIndexer,
        "ZERO_G_STORAGE_INDEXER_URL",
      ),
    }),
    sponsorPrivateKey: parsePrivateKey(
      required(env, "ZERO_G_SPONSOR_PRIVATE_KEY"),
    ),
    request: Object.freeze({
      timeoutMs: parseInteger(
        env,
        "ZERO_G_REQUEST_TIMEOUT_MS",
        12_000,
        1_000,
        30_000,
      ),
      maxRetries: parseInteger(env, "ZERO_G_MAX_RETRIES", 2, 0, 4),
    }),
  });
}
