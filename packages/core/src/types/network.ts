// TODO: DEV network 设计
export enum Network {
  BitcoinMainnet = "BitcoinMainnet",
  BitcoinTestnet3 = "BitcoinTestnet3",
  BitcoinSignet = "BitcoinSignet",

  DogecoinMainnet = "DogecoinMainnet",
  DogecoinTestnet = "DogecoinTestnet",
}

export const Networks = {
  [Network.BitcoinMainnet]: {
    name: Network.BitcoinMainnet,
    isMainnet: true,
  },
  [Network.BitcoinTestnet3]: {
    name: Network.BitcoinTestnet3,
    isMainnet: false,
  },
  [Network.BitcoinSignet]: {
    name: Network.BitcoinSignet,
    isMainnet: false,
  },
  [Network.DogecoinMainnet]: {
    name: Network.DogecoinMainnet,
    isMainnet: true,
  },
  [Network.DogecoinTestnet]: {
    name: Network.DogecoinTestnet,
    isMainnet: false,
  },
} as const;

export const isMainnet = (network: Network): boolean => {
  return Networks[network].isMainnet;
};
