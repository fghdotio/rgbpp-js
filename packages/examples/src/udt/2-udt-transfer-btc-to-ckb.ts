import { ccc } from "@ckb-ccc/shell";

import {
  buildBtcRgbppOutputs,
  parseUtxoSealFromScriptArgs,
  ScriptInfo,
  XUDT_LIKE_LEAP_FROM_BTC_OUTPUT_INDEX,
} from "@rgbpp-js/core";

import { ckbSigner, ckbClient, initializeRgbppEnv } from "../common/env.js";

import { RgbppTxLogger } from "../common/logger.js";
import { testnetSudtInfo } from "../common/assets.js";

async function btcUdtToCkb({
  udtScriptInfo,
  receivers,
}: {
  udtScriptInfo: ScriptInfo;
  receivers: { address: string; amount: bigint }[];
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
    await Promise.all(
      receivers.map(async (receiver) => ({
        to: await rgbppXudtLikeClient.buildBtcTimeLockScript(receiver.address),
        amount: ccc.fixedPointFrom(receiver.amount),
      }))
    )
  );

  const txWithInputs = await udt.completeChangeToLock(
    tx,
    ckbRgbppUnlockSinger,
    // merge multiple inputs to a single change output
    rgbppXudtLikeClient.buildPseudoRgbppLockScript(
      XUDT_LIKE_LEAP_FROM_BTC_OUTPUT_INDEX
    )
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
      [],
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

const logger = new RgbppTxLogger({ opType: "udt-transfer-btc-to-ckb" });

btcUdtToCkb({
  udtScriptInfo: {
    name: ccc.KnownScript.XUdt,
    script: await ccc.Script.fromKnownScript(
      ckbClient,
      ccc.KnownScript.XUdt,
      "0x868c505051f06bb41646bd1b442dbed8035d91abd9ac7acc4bda3bab267e6ac7"
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
      address: await ckbSigner.getRecommendedAddress(),
      amount: ccc.fixedPointFrom(1),
    },
    {
      address: await ckbSigner.getRecommendedAddress(),
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
pnpm tsx packages/examples/src/udt/2-udt-transfer-btc-to-ckb.ts
*/
