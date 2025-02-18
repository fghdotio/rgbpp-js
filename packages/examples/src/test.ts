import { getTxIdFromScriptArgs } from "@rgbpp-js/core";

const txId = getTxIdFromScriptArgs(
  "0x0100000015217fa5caae9f5fc674782078089c71abc92d0b15ccadfc069967dfe89a41dd"
);

const txId2 = getTxIdFromScriptArgs(
  "0x6900000010000000450000004900000035000000100000003000000031000000000000000000000000000000000000000000000000000000000000000000000000000000000600000015217fa5caae9f5fc674782078089c71abc92d0b15ccadfc069967dfe89a41dd"
);

console.log(
  txId === txId2,
  txId,
  txId === "dd419ae8df679906fcadcc150b2dc9ab719c0878207874c65f9faecaa57f2115"
);

/* 
pnpm tsx packages/examples/src/test.ts
*/
