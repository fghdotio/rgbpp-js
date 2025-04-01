import { ccc } from "@ckb-ccc/shell";

import {
  buildBtcRgbppOutputs,
  RgbppBtcReceiver,
  parseUtxoSealFromScriptArgs,
  ScriptInfo,
} from "@rgbpp-js/core";

import { ckbSigner, ckbClient, initializeRgbppEnv } from "../common/env.js";

import { testnetSudtInfo } from "../common/assets.js";
import { RgbppTxLogger } from "../common/logger.js";

async function transferUdt({
  udtScriptInfo,
  receivers,
}: {
  udtScriptInfo: ScriptInfo;
  receivers: RgbppBtcReceiver[];
}) {
  const {
    rgbppBtcWallet,
    rgbppXudtLikeClient,
    utxoBasedAccountAddress,
    ckbRgbppUnlockSinger,
  } = initializeRgbppEnv([udtScriptInfo]);

  const udt = new ccc.udt.Udt(
    udtScriptInfo.cellDep.outPoint,
    udtScriptInfo.script
  );

  let { res: tx } = await udt.transfer(
    ckbSigner as unknown as ccc.Signer,
    receivers.map((receiver, index) => ({
      to: rgbppXudtLikeClient.buildPseudoRgbppLockScript(index),
      amount: ccc.fixedPointFrom(receiver.amount),
    }))
  );

  let txWithInputs: ccc.Transaction;

  // * collect udt inputs using ccc
  txWithInputs = await udt.completeChangeToLock(
    tx,
    ckbRgbppUnlockSinger,
    rgbppXudtLikeClient.buildPseudoRgbppLockScript(receivers.length)
  );

  const utxoSeals = await Promise.all(
    txWithInputs.inputs.map(async (input) => {
      await input.completeExtraInfos(ckbClient);
      return parseUtxoSealFromScriptArgs(input.cellOutput!.lock.args);
    })
  );
  console.log(utxoSeals);

  const txWithRgbppWitnessPlaceholder =
    await rgbppXudtLikeClient.insertRgbppWitnessPlaceholder(txWithInputs);
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

const logger = new RgbppTxLogger({ opType: "ccc-udt-xudt-btc-transfer" });

transferUdt({
  udtScriptInfo: {
    name: ccc.KnownScript.XUdt,
    script: await ccc.Script.fromKnownScript(
      ckbClient,
      ccc.KnownScript.XUdt,
      "0xa4a61ca895f4f47c3419d6c80b0f22cb115a01107b12eedcb14f83d9e008545c"
    ),
    cellDep: (await ckbClient.getKnownScript(ccc.KnownScript.XUdt)).cellDeps[0]
      .cellDep,
  },

  // udtScriptInfo: {
  //   ...testnetSudtInfo,
  //   script: await ccc.Script.from({
  //     ...testnetSudtInfo.script,
  //     args: "0x07bccc105cdd747019a843d8bd0b5424efc33beb20b4f0db0f925e97f30c465f",
  //   }),
  // },

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
pnpm tsx packages/examples/src/udt/1-udt-transfer-on-btc.ts


xUDT:
btcTxId: 65ef87fa75c3122e718d50112defffb92010808759947a48f1b11ecb48c76c02
ckbTxId: 0x2d9b4866fb8a1ce10a66ef37fc741b6f77fba580513ca45ae30bbddd68d51fe5


sUDT:
btcTxId: 7f6c43de47becbafe4954e3b1cc917f41aa6919a8ef040a188b481ec74972acc
ckbTxId: 0x817dfd20228df3294e511336908dd6ed2252f8cb2ea27a22b5e27d029a8e5129
*/
