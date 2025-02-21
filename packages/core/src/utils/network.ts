import { NetworkRegistry } from "../rgbpp/network-registry.js";
import { NetworkConfig, NetworkConfigOverrides } from "../types/network.js";
import { ScriptInfo } from "../types/rgbpp/rgbpp.js";

export function registerNetwork(
  name: string,
  config: NetworkConfig,
): NetworkConfig {
  NetworkRegistry.getInstance().register(name, config);
  return NetworkRegistry.getInstance().getConfig(name);
}

export function updateNetworkConfig(
  name: string,
  config: NetworkConfigOverrides,
): NetworkConfig {
  NetworkRegistry.getInstance().update(name, config);
  return getNetworkConfig(name);
}

export function registerCompatibleXudtScript(
  networkName: string,
  scriptInfos: ScriptInfo[],
): NetworkConfig {
  return updateNetworkConfig(networkName, {
    scripts: scriptInfos.reduce(
      (acc, scriptInfo) => ({
        ...acc,
        [scriptInfo.name]: scriptInfo.script,
      }),
      {},
    ),
    cellDeps: scriptInfos.reduce(
      (acc, scriptInfo) => ({
        ...acc,
        [scriptInfo.name]: scriptInfo.cellDep,
      }),
      {},
    ),
  });
}

export function getNetworkConfig(name: string): NetworkConfig {
  return NetworkRegistry.getInstance().getConfig(name);
}

export function getSupportedNetworks(): string[] {
  return NetworkRegistry.getInstance().getSupportedNetworks();
}

export function isSupportedNetwork(name: string): boolean {
  return NetworkRegistry.getInstance().isSupported(name);
}

export function isMainnet(network: string): boolean {
  return NetworkRegistry.getInstance().isMainnet(network);
}
