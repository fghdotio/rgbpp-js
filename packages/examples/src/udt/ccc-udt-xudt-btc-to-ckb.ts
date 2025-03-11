import { ccc } from "@ckb-ccc/shell";

import {
  buildBtcRgbppOutputs,
  TX_ID_PLACEHOLDER,
  parseUtxoSealFromScriptArgs,
  PredefinedScriptName,
  UtxoSeal,
  XUDT_LIKE_LEAP_FROM_BTC_OUTPUT_INDEX,
} from "@rgbpp-js/core";

import { inspect } from "util";

import {
  ckbSigner,
  ckbClient,
  ckbRgbppUnlockSinger,
  rgbppXudtLikeClient,
  utxoBasedAccountAddress,
  rgbppBtcWallet,
  ckbAddress,
} from "../common/env.js";

import { RgbppTxLogger } from "../common/logger.js";
import { collectRgbppCells } from "../common/utils.js";

async function btcUdtToCkb({
  utxoSeals,
  udtId,
  receivers,
}: {
  utxoSeals?: UtxoSeal[];
  udtId: string;
  receivers: { address: string; amount: bigint }[];
}) {
  const xudtTypeScript = await ccc.Script.fromKnownScript(
    ckbClient,
    ccc.KnownScript.XUdt,
    udtId
  );

  const udt = new ccc.udt.Udt(
    rgbppXudtLikeClient.getRgbppScriptsDetail()[
      PredefinedScriptName.Xudt
    ].cellDep.outPoint,
    xudtTypeScript
  );

  let { res: tx } = await udt.transfer(
    ckbSigner as unknown as ccc.Signer,
    await Promise.all(
      receivers.map(async (receiver) => ({
        to: await rgbppXudtLikeClient.buildBtcTimeLockScript(receiver.address),
        amount: ccc.fixedPointFrom(receiver.amount),
      }))
    )
  );

  let txWithInputs: ccc.Transaction;
  if (!utxoSeals) {
    txWithInputs = await udt.completeChangeToLock(
      tx,
      ckbRgbppUnlockSinger,
      // ? merge multiple inputs to a single change output
      rgbppXudtLikeClient.buildRgbppLockScript({
        txId: TX_ID_PLACEHOLDER,
        index: XUDT_LIKE_LEAP_FROM_BTC_OUTPUT_INDEX,
      })
    );

    // console.log(inspect(txWithInputs, { depth: null, colors: true }));

    utxoSeals = await Promise.all(
      txWithInputs.inputs.map(async (input) => {
        await input.completeExtraInfos(ckbClient);
        return parseUtxoSealFromScriptArgs(input.cellOutput!.lock.args);
      })
    );
    console.log(utxoSeals);
  } else {
    const rgbppLiveCells = await collectRgbppCells(utxoSeals, xudtTypeScript);
    tx.inputs.push(
      ...rgbppLiveCells.map(({ outPoint, outputData, cellOutput }) =>
        ccc.CellInput.from({
          previousOutput: outPoint,
          outputData,
          cellOutput,
        })
      )
    );

    const balanceDiff =
      (await tx.getInputsUdtBalance(
        ckbClient as unknown as ccc.Client,
        xudtTypeScript
      )) - tx.getOutputsUdtBalance(xudtTypeScript);
    if (balanceDiff < ccc.Zero) {
      throw new Error("Insufficient balance");
    } else if (balanceDiff > ccc.Zero) {
      tx.addOutput(
        {
          lock: rgbppXudtLikeClient.buildRgbppLockScript({
            txId: TX_ID_PLACEHOLDER,
            index: XUDT_LIKE_LEAP_FROM_BTC_OUTPUT_INDEX,
          }),
          type: xudtTypeScript,
        },
        ccc.numLeToBytes(balanceDiff, 16)
      );
    }
    txWithInputs = tx;
  }

  const txWithRgbppWitnessPlaceholder =
    await rgbppXudtLikeClient.injectRgbppWitnessPlaceholder(txWithInputs);
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

const logger = new RgbppTxLogger({ opType: "ccc-udt-xudt-btc-to-ckb" });

btcUdtToCkb({
  utxoSeals: [
    {
      txId: "462b77dc530e1f12094fc49f4a9e4ee8b00cd58ad6d6e9e0e5774e8fddacd7b6",
      index: 0,
    },
  ],
  udtId: "0xe5f7d179bccb3715fa554a9cce027972549fec7cbe5a75bedef3418c9196e080",
  receivers: [
    {
      address: ckbAddress,
      amount: ccc.fixedPointFrom(1),
    },
    {
      address: ckbAddress,
      amount: ccc.fixedPointFrom(10),
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
pnpm tsx packages/examples/src/udt/ccc-udt-xudt-btc-to-ckb.ts
*/
