export type ZeroGNetworkName = "testnet" | "mainnet";

export type ZeroGPublicNetwork = Readonly<{
  name: ZeroGNetworkName;
  displayName: string;
  chainId: 16602 | 16661;
  chainRpcUrl: string;
  chainExplorerUrl: string;
  computeRouterUrl: string;
  storageIndexerUrl?: string;
}>;

const TESTNET: ZeroGPublicNetwork = Object.freeze({
  name: "testnet",
  displayName: "0G Galileo Testnet",
  chainId: 16602,
  chainRpcUrl: "https://evmrpc-testnet.0g.ai",
  chainExplorerUrl: "https://chainscan-galileo.0g.ai",
  computeRouterUrl: "https://router-api-testnet.integratenetwork.work/v1",
});

const MAINNET: ZeroGPublicNetwork = Object.freeze({
  name: "mainnet",
  displayName: "0G Mainnet",
  chainId: 16661,
  chainRpcUrl: "https://evmrpc.0g.ai",
  chainExplorerUrl: "https://chainscan.0g.ai",
  computeRouterUrl: "https://router-api.0g.ai/v1",
  storageIndexerUrl: "https://indexer-storage-turbo.0g.ai",
});

export const ZERO_G_NETWORKS: Readonly<
  Record<ZeroGNetworkName, ZeroGPublicNetwork>
> = Object.freeze({ testnet: TESTNET, mainnet: MAINNET });

export function getZeroGPublicNetwork(
  name: ZeroGNetworkName,
): ZeroGPublicNetwork {
  return ZERO_G_NETWORKS[name];
}
