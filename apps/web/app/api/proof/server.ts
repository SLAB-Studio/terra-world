import {
  RIVERGATE_CAMPAIGN_PACKAGE_ID,
  RIVERGATE_CAMPAIGN_PACKAGE_VERSION,
  RIVERGATE_CAMPAIGN_V1_HASH,
} from "@terra/simulation";

type ProofState = "configured" | "misconfigured" | "unconfigured";

export type TerraProofSnapshot = Readonly<{
  schemaVersion: 1;
  campaign: Readonly<{
    packageId: typeof RIVERGATE_CAMPAIGN_PACKAGE_ID;
    packageVersion: typeof RIVERGATE_CAMPAIGN_PACKAGE_VERSION;
    packageHash: typeof RIVERGATE_CAMPAIGN_V1_HASH;
    storageState: ProofState;
    rootHash: string | null;
    transactionHash: string | null;
  }>;
  compute: Readonly<{
    state: ProofState;
    trustMode: "private";
    teeVerificationRequired: true;
  }>;
  chain: Readonly<{
    state: ProofState;
    agenticIdState: ProofState;
    campaignRegistryState: ProofState;
    campaignRegistryRequired: false;
    network: "testnet" | "mainnet" | null;
    campaignRegistryAddress: string | null;
    cityAgentAddress: string | null;
    cityAgentTokenId: string | null;
  }>;
  sponsor: Readonly<{
    state: ProofState;
    childWalletRequired: false;
  }>;
}>;

type ProofEnvironment = Readonly<Record<string, string | undefined>>;

const HASH_32 = /^0x[0-9a-fA-F]{64}$/u;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/u;
const SPONSOR_KEY = /^0x[0-9a-fA-F]{64}$/u;
const DECIMAL_TOKEN_ID = /^[0-9]+$/u;

/**
 * Produces a public, non-sensitive configuration snapshot. A present but
 * malformed value is never returned and is labelled misconfigured instead.
 */
export function createTerraProofSnapshot(
  environment: ProofEnvironment,
): TerraProofSnapshot {
  const network = parseNetwork(environment.ZERO_G_NETWORK);
  const storage = configuredTuple(environment, [
    ["ZERO_G_RIVERGATE_STORAGE_ROOT", HASH_32],
    ["ZERO_G_RIVERGATE_STORAGE_TX_HASH", HASH_32],
  ]);
  const compute = configuredTuple(environment, [
    ["ZERO_G_NETWORK", /^(?:testnet|mainnet)$/u],
    ["ZERO_G_COMPUTE_API_KEY", /^(?:app-)?sk-[A-Za-z0-9_-]{8,}$/u],
    ["ZERO_G_COMPUTE_MODEL", /^[A-Za-z0-9][A-Za-z0-9._:/-]{1,127}$/u],
  ]);
  const registry = configuredValue(
    environment.ZERO_G_CAMPAIGN_REGISTRY_ADDRESS,
    ADDRESS,
  );
  const cityAgent = configuredValue(
    environment.ZERO_G_CITY_AGENT_ADDRESS,
    ADDRESS,
  );
  const cityAgentTokenId = configuredValue(
    environment.ZERO_G_CITY_AGENT_TOKEN_ID,
    DECIMAL_TOKEN_ID,
  );
  const networkState = configuredValue(
    environment.ZERO_G_NETWORK,
    /^(?:testnet|mainnet)$/u,
  ).state;
  const agenticIdState = combineStates(
    networkState,
    cityAgent.state,
    cityAgentTokenId.state,
  );
  const campaignRegistryState = optionalChainResourceState(
    networkState,
    registry.state,
  );
  const sponsor = configuredValue(
    environment.ZERO_G_SPONSOR_PRIVATE_KEY,
    SPONSOR_KEY,
  );

  return Object.freeze({
    schemaVersion: 1 as const,
    campaign: Object.freeze({
      packageId: RIVERGATE_CAMPAIGN_PACKAGE_ID,
      packageVersion: RIVERGATE_CAMPAIGN_PACKAGE_VERSION,
      packageHash: RIVERGATE_CAMPAIGN_V1_HASH,
      storageState: storage,
      rootHash:
        storage === "configured"
          ? environment.ZERO_G_RIVERGATE_STORAGE_ROOT!.trim()
          : null,
      transactionHash:
        storage === "configured"
          ? environment.ZERO_G_RIVERGATE_STORAGE_TX_HASH!.trim()
          : null,
    }),
    compute: Object.freeze({
      state: compute,
      trustMode: "private" as const,
      teeVerificationRequired: true as const,
    }),
    chain: Object.freeze({
      state: agenticIdState,
      agenticIdState,
      campaignRegistryState,
      campaignRegistryRequired: false as const,
      network: networkState === "configured" ? network : null,
      campaignRegistryAddress:
        registry.state === "configured" ? registry.value : null,
      cityAgentAddress:
        cityAgent.state === "configured" ? cityAgent.value : null,
      cityAgentTokenId:
        cityAgentTokenId.state === "configured" ? cityAgentTokenId.value : null,
    }),
    sponsor: Object.freeze({
      state: sponsor.state,
      childWalletRequired: false as const,
    }),
  });
}

export function createProofGetHandler(
  environment: ProofEnvironment,
): () => Response {
  return () =>
    new Response(JSON.stringify(createTerraProofSnapshot(environment)), {
      status: 200,
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": "application/json; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    });
}

function configuredTuple(
  environment: ProofEnvironment,
  fields: readonly (readonly [string, RegExp])[],
): ProofState {
  const states = fields.map(([name, pattern]) =>
    configuredValue(environment[name], pattern),
  );
  return combineStates(...states.map((value) => value.state));
}

function configuredValue(
  raw: string | undefined,
  pattern: RegExp,
): Readonly<{ state: ProofState; value: string | null }> {
  const value = raw?.trim();
  if (!value) return { state: "unconfigured", value: null };
  return pattern.test(value)
    ? { state: "configured", value }
    : { state: "misconfigured", value: null };
}

function combineStates(...states: readonly ProofState[]): ProofState {
  if (states.includes("misconfigured")) return "misconfigured";
  if (states.every((state) => state === "configured")) return "configured";
  if (states.every((state) => state === "unconfigured")) return "unconfigured";
  return "misconfigured";
}

function optionalChainResourceState(
  networkState: ProofState,
  resourceState: ProofState,
): ProofState {
  if (resourceState === "unconfigured") return "unconfigured";
  if (networkState !== "configured" || resourceState === "misconfigured") {
    return "misconfigured";
  }
  return "configured";
}

function parseNetwork(raw: string | undefined): "testnet" | "mainnet" | null {
  const value = raw?.trim();
  return value === "testnet" || value === "mainnet" ? value : null;
}
