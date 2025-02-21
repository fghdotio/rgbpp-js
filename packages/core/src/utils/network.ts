import { NetworkRegistry } from "../rgbpp/network-registry.js";
import { NetworkConfig } from "../types/network.js";

export const registerNetwork = (name: string, config: NetworkConfig): void => {
  NetworkRegistry.getInstance().register(name, config);
};

export const getNetworkConfig = (name: string): NetworkConfig => {
  return NetworkRegistry.getInstance().getConfig(name);
};

export const getSupportedNetworks = (): string[] => {
  return NetworkRegistry.getInstance().getSupportedNetworks();
};

export const isSupportedNetwork = (name: string): boolean => {
  return NetworkRegistry.getInstance().isSupported(name);
};

export const isMainnet = (network: string): boolean => {
  return NetworkRegistry.getInstance().isMainnet(network);
};

// export const networkConfigs: Record<string, NetworkConfig> = {
//   [PredefinedNetwork.BitcoinTestnet3]: {
//     name: PredefinedNetwork.BitcoinTestnet3,
//     isMainnet: false,
//     scripts: predefinedScripts[PredefinedNetwork.BitcoinTestnet3],
//     cellDeps: predefinedCellDeps[PredefinedNetwork.BitcoinTestnet3],
//   },
//   [PredefinedNetwork.BitcoinSignet]: {
//     name: PredefinedNetwork.BitcoinSignet,
//     isMainnet: false,
//     scripts: predefinedScripts[PredefinedNetwork.BitcoinSignet],
//     cellDeps: predefinedCellDeps[PredefinedNetwork.BitcoinSignet],
//   },
// };

// export function registerNetwork(name: string, config: NetworkConfig) {
//   for (const scriptName of Object.values(PredefinedScriptName)) {
//     if (!config.scripts[scriptName]) {
//       throw new Error(`Script ${scriptName} not found in ${name}`);
//     }
//   }

//   networkConfigs[name] = config;
// }

// export function getSupportedNetworks(): string[] {
//   return Object.keys(networkConfigs);
// }

// export function isSupportedNetwork(name: string): boolean {
//   return getSupportedNetworks().includes(name);
// }

// export const isMainnet = (network: string): boolean => {
//   return networkConfigs[network]?.isMainnet ?? false;
// };
