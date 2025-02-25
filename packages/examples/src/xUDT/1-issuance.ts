import { UtxoSeal, buildBtcRgbppOutputs } from "@rgbpp-js/core";

import {
  ckbRgbppUnlockSinger,
  rgbppBtcWallet,
  rgbppXudtLikeClient,
  utxoBasedAccountAddress,
} from "../common/env.js";
import { prepareIssuanceRgbppCells } from "../common/utils.js";
import { issuanceAmount, xudtToken } from "../common/assets.js";
import { RgbppTxLogger } from "../common/logger.js";

async function issueXudt(utxoSeal?: UtxoSeal) {
  if (!utxoSeal) {
    utxoSeal = await rgbppBtcWallet.prepareUtxoSeal(10);
  }

  const rgbppIssuanceCells = await prepareIssuanceRgbppCells(utxoSeal);

  const ckbPartialTx = await rgbppXudtLikeClient.issuanceCkbPartialTx({
    token: xudtToken,
    amount: issuanceAmount,
    rgbppLiveCells: rgbppIssuanceCells,
  });
  logger.logCkbTx("ckbPartialTx", ckbPartialTx);
  console.log(
    "Unique ID of issued xUDT token",
    ckbPartialTx.outputs[0].type!.args
  );

  const psbt = await rgbppBtcWallet.buildPsbt({
    rgbppOutputs: buildBtcRgbppOutputs(
      ckbPartialTx,
      utxoBasedAccountAddress,
      [utxoBasedAccountAddress],
      rgbppXudtLikeClient.rgbppLockScriptTemplate(),
      rgbppXudtLikeClient.btcTimeLockScriptTemplate()
    ),

    utxoSeals: [utxoSeal],
    from: utxoBasedAccountAddress,
    feeRate: 256,
  });

  const signedBtcTx = await rgbppBtcWallet.signTx(psbt);
  const rawBtcTxHex = rgbppBtcWallet.rawTxHex(signedBtcTx);
  logger.add("rawBtcTxHex", rawBtcTxHex);

  const btcTxId = await rgbppBtcWallet.sendTx(signedBtcTx);
  logger.add("btcTxId", btcTxId, true);

  const ckbPartialTxInjected = await rgbppXudtLikeClient.injectTxIdToRgbppCkbTx(
    ckbPartialTx,
    btcTxId
  );

  // > Commitment must cover all Inputs and Outputs where Type is not null;
  // https://github.com/utxostack/RGBPlusPlus-design/blob/main/docs/lockscript-design-prd-en.md#requirements-and-limitations-on-isomorphic-binding
  // https://github.com/fghdotio/rgbpp/blob/main/contracts/rgbpp-lock/src/main.rs#L197-L200
  // TODO: should only select cells with null type script（witness 是否占用手续费）
  await ckbPartialTxInjected.completeFeeBy(
    ckbRgbppUnlockSinger.feeSigner, // TODO ckbRgbppUnlockSinger
    5000
  );
  logger.logCkbTx("ckbPartialTxWithFee", ckbPartialTxInjected);

  const ckbFinalTx =
    await ckbRgbppUnlockSinger.signTransaction(ckbPartialTxInjected);
  logger.logCkbTx("ckbFinalTx", ckbFinalTx);

  const txHash = await ckbRgbppUnlockSinger.client.sendTransaction(ckbFinalTx);
  await ckbRgbppUnlockSinger.client.waitTransaction(txHash);
  logger.add("ckbTxId", txHash, true);
}

const logger = new RgbppTxLogger({ opType: "xudt-issuance" });

issueXudt({
  txId: "a90987a2064fe582d7923b82d406eb294198c3a93a78d86cc16206a1b867422e",
  index: 2,
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
pnpm tsx packages/examples/src/xUDT/1-issuance.ts
*/
