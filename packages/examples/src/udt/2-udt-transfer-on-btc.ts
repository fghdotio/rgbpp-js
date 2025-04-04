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
  } = initializeRgbppEnv();

  const udt = new ccc.udt.Udt(
    udtScriptInfo.cellDep.outPoint,
    udtScriptInfo.script
  );

  let { res: tx } = await udt.transfer(
    ckbSigner as unknown as ccc.Signer,
    receivers.map((receiver) => ({
      to: rgbppXudtLikeClient.buildPseudoRgbppLockScript(),
      amount: ccc.fixedPointFrom(receiver.amount),
    }))
  );

  let txWithInputs: ccc.Transaction;

  // * collect udt inputs using ccc
  txWithInputs = await udt.completeChangeToLock(
    tx,
    ckbRgbppUnlockSinger,
    rgbppXudtLikeClient.buildPseudoRgbppLockScript()
  );

  const { psbt, indexedCkbPartialTx } = await rgbppBtcWallet.buildPsbt({
    ckbPartialTx: txWithInputs,
    ckbClient,
    rgbppXudtLikeClient,
    btcChangeAddress: utxoBasedAccountAddress,
    receiverBtcAddresses: receivers.map((receiver) => receiver.address),
    feeRate: 28,
  });
  logger.logCkbTx("indexedCkbPartialTx", indexedCkbPartialTx);

  const btcTxId = await rgbppBtcWallet.signAndSendTx(psbt);
  logger.add("btcTxId", btcTxId, true);

  const ckbPartialTxInjected = await rgbppXudtLikeClient.injectTxIdToRgbppCkbTx(
    indexedCkbPartialTx,
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

const logger = new RgbppTxLogger({ opType: "udt-transfer-on-btc" });

transferUdt({
  udtScriptInfo: {
    name: ccc.KnownScript.XUdt,
    script: await ccc.Script.fromKnownScript(
      ckbClient,
      ccc.KnownScript.XUdt,
      "0x29e04d8c0c246cc1b0027d7aa8a31f56f740134a56d056bb5efdbb00d3c78a44"
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
      address: "tb1qe8xc5ay5sdh0r58v0xfxrtss47kxveyzncs5ja",
      amount: ccc.fixedPointFrom(1),
    },
    {
      address: "tb1qe8xc5ay5sdh0r58v0xfxrtss47kxveyzncs5ja",
      amount: ccc.fixedPointFrom(2),
    },
    {
      address: "tb1qe8xc5ay5sdh0r58v0xfxrtss47kxveyzncs5ja",
      amount: ccc.fixedPointFrom(3),
    },
    {
      address: "tb1qe8xc5ay5sdh0r58v0xfxrtss47kxveyzncs5ja",
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
pnpm tsx packages/examples/src/udt/2-udt-transfer-on-btc.ts


xUDT:
btcTxId: 65ef87fa75c3122e718d50112defffb92010808759947a48f1b11ecb48c76c02
ckbTxId: 0x2d9b4866fb8a1ce10a66ef37fc741b6f77fba580513ca45ae30bbddd68d51fe5


sUDT:
btcTxId: 7f6c43de47becbafe4954e3b1cc917f41aa6919a8ef040a188b481ec74972acc
ckbTxId: 0x817dfd20228df3294e511336908dd6ed2252f8cb2ea27a22b5e27d029a8e5129
*/
