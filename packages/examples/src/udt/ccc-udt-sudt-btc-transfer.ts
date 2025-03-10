import { ccc, udtBalanceFrom } from "@ckb-ccc/shell";

import {
  buildBtcRgbppOutputs,
  TX_ID_PLACEHOLDER,
  RgbppBtcReceiver,
  UtxoSeal,
} from "@rgbpp-js/core";

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
import { collectRgbppCells } from "../common/utils.js";

async function transferUdt({
  utxoSeals,
  udtId,
  receivers,
}: {
  utxoSeals: UtxoSeal[];
  udtId: string;
  receivers: RgbppBtcReceiver[];
}) {
  const sudtTypeScript = await ccc.Script.from({
    ...testnetSudt,
    args: udtId,
  });

  const udt = new ccc.udt.Udt(testnetSudtCellDep.outPoint, sudtTypeScript);

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

  const rgbppLiveCells = await collectRgbppCells(utxoSeals, sudtTypeScript);
  console.log(rgbppLiveCells);
  tx.inputs.push(
    ...rgbppLiveCells.map(({ outPoint, outputData, cellOutput }) =>
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
  if (balanceDiff < ccc.Zero) {
    throw new Error("Insufficient balance");
  } else if (balanceDiff > ccc.Zero) {
    tx.addOutput(
      {
        lock: rgbppXudtLikeClient.buildRgbppLockScript({
          txId: TX_ID_PLACEHOLDER,
          index: receivers.length + 1,
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
    await rgbppXudtLikeClient.injectRgbppWitnessPlaceholder(tx);

  const psbt = await rgbppBtcWallet.buildPsbt({
    rgbppOutputs: buildBtcRgbppOutputs(
      txWithRgbppWitnessPlaceholder,
      utxoBasedAccountAddress,
      receivers.map((receiver) => receiver.address),
      rgbppXudtLikeClient
    ),

    utxoSeals,
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

  const rgbppSignedCkbTx =
    await ckbRgbppUnlockSinger.signTransaction(ckbPartialTxInjected);
  await rgbppSignedCkbTx.completeFeeBy(ckbSigner);
  logger.logCkbTx("ckbPartialTxWithFee", rgbppSignedCkbTx);
  const ckbFinalTx = await ckbSigner.signTransaction(rgbppSignedCkbTx);
  logger.logCkbTx("ckbFinalTx", ckbFinalTx);
  const txHash = await ckbSigner.client.sendTransaction(ckbFinalTx);
  await ckbRgbppUnlockSinger.client.waitTransaction(txHash);
  logger.add("ckbTxId", txHash, true);
}

const logger = new RgbppTxLogger({ opType: "ccc-udt-sudt" });

transferUdt({
  utxoSeals: [
    {
      txId: "ac4213efbb8719fcb409ea5289749070123ad171b390139188bda41c4a7746b8",
      index: 1,
    },
  ],
  udtId: "0xd1819aeca38207922951973f4e47332b813186e8bd549d257f03db035147f76a",
  receivers: [
    {
      address: "tb1qjkdqj8zk6gl7pwuw2d2jp9e6wgf26arjl8pcys",
      amount: ccc.fixedPointFrom(1),
    },
    {
      address: "tb1qjkdqj8zk6gl7pwuw2d2jp9e6wgf26arjl8pcys",
      amount: ccc.fixedPointFrom(2),
    },
    {
      address: "tb1qjkdqj8zk6gl7pwuw2d2jp9e6wgf26arjl8pcys",
      amount: ccc.fixedPointFrom(3),
    },
    {
      address: "tb1qjkdqj8zk6gl7pwuw2d2jp9e6wgf26arjl8pcys",
      amount: ccc.fixedPointFrom(4),
    },
    {
      address: "tb1qyyhdxmhc059rksfh9jjlkqgvs4w6mdl0z3zqj3",
      amount: ccc.fixedPointFrom(5),
    },
  ],
})
  .then(() => {
    logger.saveOnSuccess();
    process.exit(0);
  })
  .catch((e) => {
    console.log(e.message);
    logger.saveOnError(e);
    process.exit(1);
  });

/* 
pnpm tsx packages/examples/src/udt/ccc-udt-sudt-btc-transfer.ts
*/
