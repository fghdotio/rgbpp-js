import { ccc } from "@ckb-ccc/shell";

import {
  buildBtcRgbppOutputs,
  TX_ID_PLACEHOLDER,
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
      to: rgbppXudtLikeClient.buildRgbppLockScript({
        txId: TX_ID_PLACEHOLDER,
        index: index + 1, // 0 is for OP_RETURN of btc
      }),
      amount: ccc.fixedPointFrom(receiver.amount),
    }))
  );

  let txWithInputs: ccc.Transaction;

  // * collect udt inputs using ccc
  txWithInputs = await udt.completeChangeToLock(
    tx,
    ckbRgbppUnlockSinger,
    rgbppXudtLikeClient.buildRgbppLockScript({
      txId: TX_ID_PLACEHOLDER,
      index: receivers.length + 1,
    })
  );

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

const logger = new RgbppTxLogger({ opType: "ccc-udt-xudt-btc-transfer" });

transferUdt({
  // udtScriptInfo: {
  //   name: ccc.KnownScript.XUdt,
  //   script: await ccc.Script.fromKnownScript(
  //     ckbClient,
  //     ccc.KnownScript.XUdt,
  //     "0x868c505051f06bb41646bd1b442dbed8035d91abd9ac7acc4bda3bab267e6ac7"
  //   ),
  //   cellDep: (await ckbClient.getKnownScript(ccc.KnownScript.XUdt)).cellDeps[0]
  //     .cellDep,
  // },

  udtScriptInfo: {
    ...testnetSudtInfo,
    script: await ccc.Script.from({
      ...testnetSudtInfo.script,
      args: "0x07bccc105cdd747019a843d8bd0b5424efc33beb20b4f0db0f925e97f30c465f",
    }),
  },

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


btcTxId: cefdc47c51e5a48576a25c50ea3249a5b3d4029c01f6712424c78bd8bd449e76
ckbTxId: 0x9d236f0698ad0f742027db3d58c9de77e734f9fbc8fa9213805ffc9ea5673b4e


btcTxId: 7f6c43de47becbafe4954e3b1cc917f41aa6919a8ef040a188b481ec74972acc
ckbTxId: 0x817dfd20228df3294e511336908dd6ed2252f8cb2ea27a22b5e27d029a8e5129
*/
