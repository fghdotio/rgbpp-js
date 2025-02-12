import { UtxoSeal, buildBtcRgbppOutputs } from "@rgbpp-js/core";

import {
  ckbClient,
  ckbSigner,
  createCkbRgbppUnlockSinger,
  rgbppBtcWallet,
  rgbppXudtLikeClient,
  utxoBasedAccountAddress,
} from "./env.js";
import { pollForSpvProof, prepareRgbppCell } from "./utils.js";
import { issuanceAmount, xudtToken } from "./asset.js";
import { RgbppTxLogger } from "./logger.js";

const logger = new RgbppTxLogger({ opType: "issuance" });

async function issueXudt(utxoSeal?: UtxoSeal) {
  if (!utxoSeal) {
    utxoSeal = await rgbppBtcWallet.prepareUtxoSeal(10);
  }

  const rgbppIssuanceCells = await prepareRgbppCell(utxoSeal);

  const ckbPartialTx = await rgbppXudtLikeClient.issuanceCkbPartialTx({
    token: xudtToken,
    amount: issuanceAmount,
    rgbppLiveCells: rgbppIssuanceCells,
  });
  logger.logCkbTx("ckbPartialTx", ckbPartialTx);

  const commitment = rgbppXudtLikeClient.calculateCommitment(ckbPartialTx);

  const psbt = await rgbppBtcWallet.buildPsbt({
    rgbppOutputs: buildBtcRgbppOutputs(
      ckbPartialTx,
      utxoBasedAccountAddress,
      rgbppXudtLikeClient.rgbppLockScriptTemplate(),
      rgbppXudtLikeClient.btcTimeLockScriptTemplate(),
      commitment
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

  const proof = await pollForSpvProof(btcTxId, 30);
  const ckbRgbppUnlockSinger = createCkbRgbppUnlockSinger(rawBtcTxHex, proof);

  // TODO: set btcTxId first before sign (maybe us interface)，签名不改变除了 witness 外的内容
  // const ckbRgbppUnlockSinger = createCkbRgbppUnlockSinger(rgbppBtcWallet, rgbppSignedCkbTx);

  const rgbppSignedCkbTx =
    await ckbRgbppUnlockSinger.signTransaction(ckbPartialTxInjected);

  await rgbppSignedCkbTx.completeFeeBy(ckbSigner);
  const ckbFinalTx = await ckbSigner.signTransaction(rgbppSignedCkbTx);
  logger.logCkbTx("ckbFinalTx", ckbFinalTx);
  const txHash = await ckbSigner.client.sendTransaction(ckbFinalTx);
  await ckbClient.waitTransaction(txHash);
  logger.add("ckbTxId", txHash, true);
}

issueXudt({
  txId: "caa1e12e546213343ca1fa5fa94dc093155b2be0f958246b87b635c7b6045367",
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
pnpm tsx packages/examples/src/issuance.ts
*/
