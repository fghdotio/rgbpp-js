import { cellDeps, scripts } from "../scripts/index.js";
import { NetworkConfig, PredefinedNetwork } from "../types/network.js";

export const networkConfigs: Record<string, NetworkConfig> = {
  [PredefinedNetwork.BitcoinMainnet]: {
    name: PredefinedNetwork.BitcoinMainnet,
    isMainnet: true,
    scripts: scripts[PredefinedNetwork.BitcoinMainnet],
    cellDeps: cellDeps[PredefinedNetwork.BitcoinMainnet],
  },
  [PredefinedNetwork.BitcoinTestnet3]: {
    name: PredefinedNetwork.BitcoinTestnet3,
    isMainnet: false,
    scripts: scripts[PredefinedNetwork.BitcoinTestnet3],
    cellDeps: cellDeps[PredefinedNetwork.BitcoinTestnet3],
  },
  [PredefinedNetwork.BitcoinSignet]: {
    name: PredefinedNetwork.BitcoinSignet,
    isMainnet: false,
    scripts: scripts[PredefinedNetwork.BitcoinSignet],
    cellDeps: cellDeps[PredefinedNetwork.BitcoinSignet],
  },
} as const;

export function registerNetwork(name: string, config: NetworkConfig) {
  networkConfigs[name] = config;
}

export const isMainnet = (network: string): boolean => {
  return networkConfigs[network]?.isMainnet ?? false;
};
