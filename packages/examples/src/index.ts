import { Rgbpp, Network } from "@rgbpp-js/core";
import { BtcWallet } from "@rgbpp-js/bitcoin";

const rgbpp = new Rgbpp(Network.BitcoinSignet, new BtcWallet());
rgbpp.getSpvProof("0x123");

/* 
pnpm tsx packages/examples/src/index.ts
*/
