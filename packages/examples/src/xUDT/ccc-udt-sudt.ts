import { ccc, udtBalanceFrom } from "@ckb-ccc/ccc";
import { ccc as cccCore } from "@ckb-ccc/core";

import { buildBtcRgbppOutputs, TX_ID_PLACEHOLDER } from "@rgbpp-js/core";

import { inspect } from "util";

import {
  ckbSigner,
  ckbClient,
  ckbRgbppUnlockSinger,
  rgbppXudtLikeClient,
  utxoBasedAccountAddress,
  rgbppBtcWallet,
} from "../common/env.js";
import { testnetSudt, testnetSudtCellDep } from "../common/assets.js";
import { RgbppTxLogger } from "../common/logger.js";

const logger = new RgbppTxLogger({ opType: "ccc-udt-sudt" });

const sudtTypeScript = await ccc.Script.from({
  ...testnetSudt,
  args: "0xbdc59548202fab1de28bd5c781f9f5fd24ab239cd135a971795b310a4a634fa3",
});

const udt = new ccc.udt.Udt(testnetSudtCellDep.outPoint, sudtTypeScript);
const receivers = [
  {
    address: "tb1qyyhdxmhc059rksfh9jjlkqgvs4w6mdl0z3zqj3",
    amount: ccc.fixedPointFrom(1),
  },
];

let { res: tx } = await udt.transfer(
  ckbSigner as unknown as ccc.Signer,
  receivers.map((receiver, index) => ({
    to: rgbppXudtLikeClient.buildRgbppLockScript({
      txId: TX_ID_PLACEHOLDER,
      index: index + 1, // 0 is for OP_RETURN of btc
    }),
    amount: ccc.fixedPointFrom(receiver.amount),
  }))
);

const exceptedBalance = tx.getOutputsUdtBalance(sudtTypeScript);

const utxoSeal = {
  txId: "5f72d9e74ed67e2ce5e0f65c61ffd7e08667802240e3ae212b5f401e2c71cdc0",
  index: 1,
};
const rgbppLock = rgbppXudtLikeClient.buildRgbppLockScript(utxoSeal);

// Fill UDT inputs
const cells = await ckbSigner.client.findCellsByLock(rgbppLock, sudtTypeScript);
const collectedCells: ccc.Cell[] = [];

for await (const cell of cells) {
  const balance = udtBalanceFrom(cell.outputData);
  const sum = collectedCells.reduce((acc) => acc + balance, 0n);
  if (sum >= exceptedBalance) {
    break;
  }
  collectedCells.push(cell);
}
tx.inputs.push(
  ...collectedCells.map(({ outPoint, outputData, cellOutput }) =>
    ccc.CellInput.from({
      previousOutput: outPoint,
      outputData,
      cellOutput,
    })
  )
);

// completeChangeToLock
const balanceDiff =
  (await tx.getInputsUdtBalance(
    ckbClient as unknown as ccc.Client,
    sudtTypeScript
  )) - tx.getOutputsUdtBalance(sudtTypeScript);
if (balanceDiff > ccc.Zero) {
  tx.addOutput(
    {
      lock: rgbppXudtLikeClient.buildRgbppLockScript({
        txId: TX_ID_PLACEHOLDER,
        index: 2, // receivers.length + 1
      }),
      type: sudtTypeScript,
    },
    ccc.numLeToBytes(balanceDiff, 16)
  );
}
console.log(
  balanceDiff,
  inspect(tx, { depth: null, colors: true }),
  udtBalanceFrom(tx.outputsData[0])
);

const txWithRgbppWitnessPlaceholder =
  await rgbppXudtLikeClient.injectRgbppWitnessPlaceholder(
    cccCore.Transaction.from(tx)
  );

const psbt = await rgbppBtcWallet.buildPsbt({
  rgbppOutputs: buildBtcRgbppOutputs(
    txWithRgbppWitnessPlaceholder,
    utxoBasedAccountAddress,
    receivers.map((receiver) => receiver.address),
    rgbppXudtLikeClient
  ),

  utxoSeals: [utxoSeal],
  from: utxoBasedAccountAddress,
  feeRate: 28,
});

const signedBtcTx = await rgbppBtcWallet.signTx(psbt);
const rawBtcTxHex = rgbppBtcWallet.rawTxHex(signedBtcTx);
logger.add("rawBtcTxHex", rawBtcTxHex);

const btcTxId = await rgbppBtcWallet.sendTx(signedBtcTx);
logger.add("btcTxId", btcTxId, true);

const ckbPartialTxInjected = await rgbppXudtLikeClient.injectTxIdToRgbppCkbTx(
  txWithRgbppWitnessPlaceholder,
  btcTxId
);
logger.logCkbTx("ckbPartialTxInjected", ckbPartialTxInjected);

await ckbPartialTxInjected.completeFeeBy(ckbRgbppUnlockSinger.feeSigner);
logger.logCkbTx("ckbPartialTxWithFee", ckbPartialTxInjected);

const ckbFinalTx =
  await ckbRgbppUnlockSinger.signTransaction(ckbPartialTxInjected);
logger.logCkbTx("ckbFinalTx", ckbFinalTx);

const txHash = await ckbRgbppUnlockSinger.client.sendTransaction(ckbFinalTx);
await ckbRgbppUnlockSinger.client.waitTransaction(txHash);
logger.add("ckbTxId", txHash, true);

/* 
pnpm tsx packages/examples/src/xUDT/ccc-udt-sudt.ts
*/
