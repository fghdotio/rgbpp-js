import { ccc } from "@ckb-ccc/shell";

import { getTxIdFromScriptArgs } from "@rgbpp-js/core";

// const txId = getTxIdFromScriptArgs(
//   "0x0100000015217fa5caae9f5fc674782078089c71abc92d0b15ccadfc069967dfe89a41dd"
// );

// const txId2 = getTxIdFromScriptArgs(
//   "0x6900000010000000450000004900000035000000100000003000000031000000000000000000000000000000000000000000000000000000000000000000000000000000000600000015217fa5caae9f5fc674782078089c71abc92d0b15ccadfc069967dfe89a41dd"
// );

// console.log(
//   txId === txId2,
//   txId,
//   txId === "dd419ae8df679906fcadcc150b2dc9ab719c0878207874c65f9faecaa57f2115"
// );

// interface CommittedLength {
//   inputLength: Uint8Array;
//   outputLength: Uint8Array;
// }

// const cl: CommittedLength = {
//   inputLength: new Uint8Array([1]),
//   outputLength: new Uint8Array([2]),
// };
// const tx = ccc.Transaction.default();
// const prefix = "RGBPP_CKB_WITNESS_PLACEHOLDER";
// const encoder = new TextEncoder();
// const uint8Array = new Uint8Array(
//   prefix.length + cl.inputLength.length + cl.outputLength.length
// );
// uint8Array.set(encoder.encode(prefix));
// uint8Array.set(cl.inputLength, prefix.length);
// uint8Array.set(cl.outputLength, prefix.length + cl.inputLength.length);
// tx.witnesses.push(ccc.hexFrom(uint8Array));

// console.log(tx.witnesses);

// // check if tx.witnesses is prefix with "RGBPP_CKB_WITNESS_PLACEHOLDER"
// const witness = tx.witnesses[0]; // Get the first witness
// const decoder = new TextDecoder();
// const witnessBytes = ccc.bytesFrom(witness); // Convert hex to bytes
// const witnessPrefix = decoder.decode(witnessBytes.slice(0, prefix.length)); // Get prefix portion
// const hasCorrectPrefix = witnessPrefix === prefix;

// console.log(hasCorrectPrefix);

// const inputLength = witnessBytes.slice(prefix.length, prefix.length + 1);
// const outputLength = witnessBytes.slice(prefix.length + 1, prefix.length + 2);

// console.log("Witness prefix check:", hasCorrectPrefix);
// console.log("Input Length:", inputLength[0]);
// console.log("Output Length:", outputLength[0]);

/* 
pnpm tsx packages/examples/src/test.ts
*/
