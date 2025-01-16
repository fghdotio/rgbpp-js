import { Rgbpp, Network } from "@rgbpp-js/core";

import { utxoBasedWallet } from "./env.js";

console.log(utxoBasedWallet);

const rgbpp = new Rgbpp(Network.BitcoinSignet, utxoBasedWallet);
console.log(rgbpp);

/* 
pnpm tsx packages/examples/src/index.ts
*/
