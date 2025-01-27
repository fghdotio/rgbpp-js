import { ccc } from "@ckb-ccc/core";

export enum PredefinedNetwork {
  BitcoinMainnet = "BitcoinMainnet",
  BitcoinTestnet3 = "BitcoinTestnet3",
  BitcoinSignet = "BitcoinSignet",

  DogecoinMainnet = "DogecoinMainnet",
  DogecoinTestnet = "DogecoinTestnet",
}

export interface NetworkConfig {
  name: string;
  isMainnet: boolean;

  scripts: Record<string, ccc.Script>;
  cellDeps: Record<string, ccc.CellDep>;
}
