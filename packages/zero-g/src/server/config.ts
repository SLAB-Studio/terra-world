import { getZeroGPublicNetwork, type ZeroGNetworkName } from "../network";
import { ZeroGConfigError } from "./errors";
import mainnetStorageDeployment from "../../deployments/storage-mainnet.v1.json";

export type ZeroGEnvironment = Readonly<Record<string, string | undefined>>;

export type ZeroGRequestConfig = Readonly<{
  timeoutMs: number;
  maxRetries: number;
}>;

export type ZeroGChainConfig = Readonly<{
  network: ZeroGNetworkName;
  chainId: 16602 | 16661;
  chainRpcUrl: string;
  chainExplorerUrl: string;
}>;

export type ZeroGComputeConfig = Readonly<{
  network: ZeroGNetworkName;
  chainId: 16602 | 16661;
  required?: boolean;
  compute: Readonly<{
    baseUrl: string;
    apiKey: string;
    model: string;
    trustMode: "private";
    verifyTee: true;
    providerSort?: "price";
    allowProviderFallbacks?: false;
  }>;
  request: ZeroGRequestConfig;
}>;

export type ZeroGStorageConfig = ZeroGChainConfig &
  Readonly<{
    storage: Readonly<{
      indexerUrl: string;
      flowAddress: `0x${string}`;
      /** Finality-aware uploads can take minutes; keep this separate from API reads. */
      uploadTimeoutMs: number;
    }>;
    request: ZeroGRequestConfig;
  }>;

export type ZeroGSponsorConfig = Readonly<{
  sponsorPrivateKey: `0x${string}`;
}>;

/** Compatibility aggregate for callers that intentionally use every service. */
export type ZeroGServerConfig = ZeroGChainConfig &
  ZeroGComputeConfig &
  ZeroGStorageConfig &
  ZeroGSponsorConfig;

const OFFICIAL_COMPUTE_HOSTS: Record<ZeroGNetworkName, string> = {
  testnet: "router-api-testnet.integratenetwork.work",
  mainnet: "router-api.0g.ai",
};
const OFFICIAL_CHAIN_HOSTS: Record<ZeroGNetworkName, string> = {
  testnet: "evmrpc-testnet.0g.ai",
  mainnet: new URL(mainnetStorageDeployment.rpcUrl).hostname,
};
const OFFICIAL_STORAGE_HOSTS: Record<ZeroGNetworkName, string> = {
  testnet: "indexer-storage-testnet-turbo.0g.ai",
  mainnet: new URL(mainnetStorageDeployment.indexerUrl).hostname,
};
// Verified against the official Turbo indexers' trusted-node identities.
const OFFICIAL_STORAGE_FLOW_ADDRESSES: Record<ZeroGNetworkName, `0x${string}`> =
  {
    testnet: "0x22e03a6a89b950f1c82ec5e74f8eca321a105296",
    mainnet: validatedMainnetFlowAddress(),
  };

function validatedMainnetFlowAddress(): `0x${string}` {
  if (
    mainnetStorageDeployment.network !== "0g-mainnet" ||
    mainnetStorageDeployment.chainId !== 16661 ||
    mainnetStorageDeployment.rpcUrl !== "https://evmrpc.0g.ai" ||
    mainnetStorageDeployment.indexerUrl !==
      "https://indexer-storage-turbo.0g.ai" ||
    !/^0x[0-9a-fA-F]{40}$/u.test(mainnetStorageDeployment.flowAddress)
  ) {
    throw new Error("The reviewed 0G mainnet Storage deployment is invalid");
  }
  return mainnetStorageDeployment.flowAddress as `0x${string}`;
}

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

function configuredNetwork(env: ZeroGEnvironment): ZeroGNetworkName {
  // Production integration is mainnet-first. Galileo remains available only
  // through an explicit network selection.
  return parseNetwork(env.ZERO_G_NETWORK?.trim() || "mainnet");
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

function requestConfig(env: ZeroGEnvironment): ZeroGRequestConfig {
  return Object.freeze({
    timeoutMs: parseInteger(
      env,
      "ZERO_G_REQUEST_TIMEOUT_MS",
      12_000,
      1_000,
      30_000,
    ),
    maxRetries: parseInteger(env, "ZERO_G_MAX_RETRIES", 2, 0, 4),
  });
}

function parseApiKey(value: string): string {
  // Router keys in circulation include both sk-* and app-sk-* forms.
  if (!/^(?:app-)?sk-[A-Za-z0-9_-]{8,}$/.test(value)) {
    throw new ZeroGConfigError(
      "INVALID_VALUE",
      "ZERO_G_COMPUTE_API_KEY",
      "ZERO_G_COMPUTE_API_KEY must be an inference key beginning with sk- or app-sk-",
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

function assertServiceNetwork(
  network: ZeroGNetworkName,
  url: string,
  field: string,
  officialHosts: Record<ZeroGNetworkName, string>,
  allowedPaths: readonly string[] = ["/"],
): void {
  const parsed = new URL(url);
  const isExactOfficialEndpoint =
    parsed.hostname === officialHosts[network] &&
    parsed.port === "" &&
    parsed.username === "" &&
    parsed.password === "" &&
    allowedPaths.includes(parsed.pathname) &&
    parsed.search === "" &&
    parsed.hash === "";
  if (!isExactOfficialEndpoint) {
    throw new ZeroGConfigError(
      "NETWORK_MISMATCH",
      field,
      `${field} is not the official ${network} host`,
    );
  }
}

function assertComputeNetwork(
  network: ZeroGNetworkName,
  url: string,
  field: string,
): void {
  const parsed = new URL(url);
  const isOfficialRouter =
    parsed.hostname === OFFICIAL_COMPUTE_HOSTS[network] &&
    parsed.pathname === "/v1";
  const isPrivateComputerProvider =
    /^compute-network-\d+\.integratenetwork\.work$/u.test(parsed.hostname) &&
    parsed.pathname === "/v1/proxy";
  const isExactEndpoint =
    parsed.protocol === "https:" &&
    parsed.port === "" &&
    parsed.username === "" &&
    parsed.password === "" &&
    parsed.search === "" &&
    parsed.hash === "" &&
    (isOfficialRouter || isPrivateComputerProvider);

  if (!isExactEndpoint) {
    throw new ZeroGConfigError(
      "NETWORK_MISMATCH",
      field,
      `${field} must be the official ${network} Router /v1 endpoint or a 0G Private Computer provider /v1/proxy endpoint`,
    );
  }
}

export function isZeroGRequired(env: ZeroGEnvironment): boolean {
  const value = env.ZERO_G_REQUIRED?.trim().toLowerCase();
  if (!value || value === "false") return false;
  if (value === "true") return true;
  throw new ZeroGConfigError(
    "INVALID_VALUE",
    "ZERO_G_REQUIRED",
    "ZERO_G_REQUIRED must be true or false",
  );
}

export function loadZeroGChainConfig(env: ZeroGEnvironment): ZeroGChainConfig {
  const network = configuredNetwork(env);
  const defaults = getZeroGPublicNetwork(network);
  const chainRpcUrl = parseHttpsUrl(
    env.ZERO_G_CHAIN_RPC_URL ?? defaults.chainRpcUrl,
    "ZERO_G_CHAIN_RPC_URL",
  );
  assertServiceNetwork(
    network,
    chainRpcUrl,
    "ZERO_G_CHAIN_RPC_URL",
    OFFICIAL_CHAIN_HOSTS,
  );
  return Object.freeze({
    network,
    chainId: defaults.chainId,
    chainRpcUrl,
    chainExplorerUrl: defaults.chainExplorerUrl,
  });
}

export function loadZeroGComputeConfig(
  env: ZeroGEnvironment,
): ZeroGComputeConfig {
  const network = configuredNetwork(env);
  const defaults = getZeroGPublicNetwork(network);
  const baseUrl = parseHttpsUrl(
    env.ZERO_G_COMPUTE_ROUTER_URL ?? defaults.computeRouterUrl,
    "ZERO_G_COMPUTE_ROUTER_URL",
  );
  assertComputeNetwork(network, baseUrl, "ZERO_G_COMPUTE_ROUTER_URL");
  return Object.freeze({
    network,
    chainId: defaults.chainId,
    required: isZeroGRequired(env),
    compute: Object.freeze({
      baseUrl,
      apiKey: parseApiKey(required(env, "ZERO_G_COMPUTE_API_KEY")),
      model: required(env, "ZERO_G_COMPUTE_MODEL"),
      trustMode: "private" as const,
      verifyTee: true as const,
      providerSort: "price" as const,
      allowProviderFallbacks: false as const,
    }),
    request: requestConfig(env),
  });
}

export function loadZeroGStorageConfig(
  env: ZeroGEnvironment,
): ZeroGStorageConfig {
  const chain = loadZeroGChainConfig(env);
  const defaults = getZeroGPublicNetwork(chain.network);
  const configuredIndexer =
    env.ZERO_G_STORAGE_INDEXER_URL ?? defaults.storageIndexerUrl;
  if (!configuredIndexer) {
    throw new ZeroGConfigError(
      "MISSING_VALUE",
      "ZERO_G_STORAGE_INDEXER_URL",
      "ZERO_G_STORAGE_INDEXER_URL is required when the network has no stable default",
    );
  }
  const indexerUrl = parseHttpsUrl(
    configuredIndexer,
    "ZERO_G_STORAGE_INDEXER_URL",
  );
  assertServiceNetwork(
    chain.network,
    indexerUrl,
    "ZERO_G_STORAGE_INDEXER_URL",
    OFFICIAL_STORAGE_HOSTS,
  );
  return Object.freeze({
    ...chain,
    storage: Object.freeze({
      indexerUrl,
      flowAddress: OFFICIAL_STORAGE_FLOW_ADDRESSES[chain.network],
      uploadTimeoutMs: parseInteger(
        env,
        "ZERO_G_STORAGE_UPLOAD_TIMEOUT_MS",
        300_000,
        60_000,
        900_000,
      ),
    }),
    request: requestConfig(env),
  });
}

export function loadZeroGSponsorConfig(
  env: ZeroGEnvironment,
): ZeroGSponsorConfig {
  return Object.freeze({
    sponsorPrivateKey: parsePrivateKey(
      required(env, "ZERO_G_SPONSOR_PRIVATE_KEY"),
    ),
  });
}

export function loadZeroGServerConfig(
  env: ZeroGEnvironment,
): ZeroGServerConfig {
  return Object.freeze({
    ...loadZeroGChainConfig(env),
    ...loadZeroGComputeConfig(env),
    ...loadZeroGStorageConfig(env),
    ...loadZeroGSponsorConfig(env),
  });
}
