import { Rgbpp } from "@rgbpp-js/core";

import { utxoBasedWallet, utxoBasedNetwork } from "./env.js";

const rgbpp = new Rgbpp(utxoBasedNetwork, utxoBasedWallet);
console.log(rgbpp);

/* 
pnpm tsx packages/examples/src/index.ts
*/
