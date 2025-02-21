import {
  predefinedCellDeps,
  predefinedScripts,
} from "../configs/scripts/index.js";
import {
  NetworkConfig,
  NetworkConfigOverrides,
  PredefinedNetwork,
} from "../types/network.js";
import {
  CellDepSet,
  PredefinedScriptName,
  ScriptSet,
} from "../types/script.js";

export class NetworkRegistry {
  private static instance: NetworkRegistry;
  private networks: Map<string, NetworkConfig>;

  private constructor() {
    this.networks = new Map();
    this.initializePredefinedNetworks();
  }

  private initializePredefinedNetworks() {
    const predefinedConfigs = {
      [PredefinedNetwork.BitcoinTestnet3]: {
        name: PredefinedNetwork.BitcoinTestnet3,
        isMainnet: false,
        scripts: predefinedScripts[PredefinedNetwork.BitcoinTestnet3],
        cellDeps: predefinedCellDeps[PredefinedNetwork.BitcoinTestnet3],
      },
      [PredefinedNetwork.BitcoinSignet]: {
        name: PredefinedNetwork.BitcoinSignet,
        isMainnet: false,
        scripts: predefinedScripts[PredefinedNetwork.BitcoinSignet],
        cellDeps: predefinedCellDeps[PredefinedNetwork.BitcoinSignet],
      },
    };

    Object.entries(predefinedConfigs).forEach(([name, config]) => {
      this.networks.set(name, config);
    });
  }

  public static getInstance(): NetworkRegistry {
    if (!NetworkRegistry.instance) {
      NetworkRegistry.instance = new NetworkRegistry();
    }
    return NetworkRegistry.instance;
  }

  public register(name: string, config: NetworkConfig): void {
    this.validateConfig(config);

    if (this.networks.has(name)) {
      throw new Error(`Network "${name}" is already registered`);
    }

    this.networks.set(name, { ...config, name });
  }

  public update(name: string, overrides: NetworkConfigOverrides): void {
    const baseConfig = this.networks.get(name);
    if (!baseConfig) {
      throw new Error(`Network "${name}" not found`);
    }

    const updatedConfig = this.mergeConfigs(baseConfig, overrides);
    this.validateConfig(updatedConfig);
    this.networks.set(name, updatedConfig);
  }

  private mergeConfigs(
    base: NetworkConfig,
    overrides: NetworkConfigOverrides,
  ): NetworkConfig {
    return {
      name: base.name,
      isMainnet: overrides.isMainnet ?? base.isMainnet,
      scripts: Object.assign(
        {},
        base.scripts,
        overrides.scripts || {},
      ) as ScriptSet,
      cellDeps: Object.assign(
        {},
        base.cellDeps,
        overrides.cellDeps || {},
      ) as CellDepSet,
    };
  }

  private validateConfig(config: NetworkConfig): void {
    for (const scriptName of Object.values(PredefinedScriptName)) {
      if (!config.scripts[scriptName]) {
        throw new Error(`Script ${scriptName} not found in network config`);
      }
    }
  }

  public getConfig(name: string): NetworkConfig {
    const config = this.networks.get(name);
    if (!config) {
      throw new Error(`Network "${name}" not found`);
    }
    return config;
  }

  public isSupported(name: string): boolean {
    return this.networks.has(name);
  }

  public getSupportedNetworks(): string[] {
    return Array.from(this.networks.keys());
  }

  public isMainnet(network: string): boolean {
    return this.networks.get(network)?.isMainnet ?? false;
  }
}
