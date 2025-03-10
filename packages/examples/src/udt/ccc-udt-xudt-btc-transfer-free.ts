import { ccc, udtBalanceFrom } from "@ckb-ccc/shell";

import {
  buildBtcRgbppOutputs,
  TX_ID_PLACEHOLDER,
  RgbppBtcReceiver,
  parseUtxoSealFromScriptArgs,
  PredefinedScriptName,
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

import { RgbppTxLogger } from "../common/logger.js";

async function transferUdt({
  udtId,
  receivers,
}: {
  udtId: string;
  receivers: RgbppBtcReceiver[];
}) {
  const xudtTypeScript = await ccc.Script.fromKnownScript(
    ckbClient,
    ccc.KnownScript.XUdt,
    udtId
  );

  // ?
  // ckbClient.getCellDeps();
  // const cell = await ckbClient.findSingletonCellByType(xudtTypeScript);
  // if (!cell) {
  //   throw new Error("XUDT cell not found");
  // }

  const udt = new ccc.udt.Udt(
    rgbppXudtLikeClient.getRgbppScriptsDetail()[
      PredefinedScriptName.Xudt
    ].cellDep.outPoint,
    xudtTypeScript
  );

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

  const txWithInputs = await udt.completeChangeToLock(
    tx,
    ckbRgbppUnlockSinger,
    rgbppXudtLikeClient.buildRgbppLockScript({
      txId: TX_ID_PLACEHOLDER,
      index: receivers.length + 1,
    })
  );

  // console.log(inspect(txWithInputs, { depth: null, colors: true }));

  const utxoSeals = await Promise.all(
    txWithInputs.inputs.map(async (input) => {
      await input.completeExtraInfos(ckbClient);
      return parseUtxoSealFromScriptArgs(input.cellOutput!.lock.args);
    })
  );

  console.log(utxoSeals);

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

const logger = new RgbppTxLogger({ opType: "ccc-udt-xudt-free" });

transferUdt({
  udtId: "0x1257e3a770e602dfddaadcfb36c8f609fd01128355b70741184e50d397e3457f",
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
pnpm tsx packages/examples/src/udt/ccc-udt-xudt-btc-transfer-free.ts
*/
