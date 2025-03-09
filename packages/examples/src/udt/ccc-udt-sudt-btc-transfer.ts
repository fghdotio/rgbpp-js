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

  await ckbPartialTxInjected.completeFeeBy(ckbRgbppUnlockSinger.feeSigner);
  logger.logCkbTx("ckbPartialTxWithFee", ckbPartialTxInjected);

  const ckbFinalTx =
    await ckbRgbppUnlockSinger.signTransaction(ckbPartialTxInjected);
  logger.logCkbTx("ckbFinalTx", ckbFinalTx);

  const txHash = await ckbRgbppUnlockSinger.client.sendTransaction(ckbFinalTx);
  await ckbRgbppUnlockSinger.client.waitTransaction(txHash);
  logger.add("ckbTxId", txHash, true);
}

const logger = new RgbppTxLogger({ opType: "ccc-udt-sudt" });

transferUdt({
  utxoSeals: [
    {
      txId: "364da29ef731ce45368e6d509ab8c6c9b558957d6dd11eeb13ed8e25d5cec6e3",
      index: 2,
    },
  ],
  udtId: "0xbdc59548202fab1de28bd5c781f9f5fd24ab239cd135a971795b310a4a634fa3",
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
