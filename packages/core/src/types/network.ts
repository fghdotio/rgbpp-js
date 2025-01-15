export enum Network {
  BitcoinMainnet = "BitcoinMainnet",
  BitcoinTestnet3 = "BitcoinTestnet3",
  BitcoinSignet = "BitcoinSignet",

  DogecoinMainnet = "DogecoinMainnet",
  DogecoinTestnet = "DogecoinTestnet",
}

export const Networks = {
  [Network.BitcoinMainnet]: Network.BitcoinMainnet,
  [Network.BitcoinTestnet3]: Network.BitcoinTestnet3,
  [Network.BitcoinSignet]: Network.BitcoinSignet,

  [Network.DogecoinMainnet]: Network.DogecoinMainnet,
  [Network.DogecoinTestnet]: Network.DogecoinTestnet,
} as const;
