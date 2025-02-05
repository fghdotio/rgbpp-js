import { UtxoSeal } from "@rgbpp-js/core";

import {
  ckbClient,
  ckbSigner,
  rgbppBtcWallet,
  rgbppXudtLikeClient,
  utxoBasedAccountAddress,
  ckbRgbppSigner,
} from "./env.js";
import { pollForSpvProof, prepareRgbppCell } from "./utils.js";
import { issuanceAmount, xudtToken } from "./asset.js";
import { RgbppTxLogger } from "./logger.js";

const logger = new RgbppTxLogger({ opType: "issuance" });

async function issueXudt(utxoSeal: UtxoSeal) {
  const rgbppIssuanceCells = await prepareRgbppCell(utxoSeal);

  const ckbPartialTx = await rgbppXudtLikeClient.issuanceCkbPartialTx({
    token: xudtToken,
    amount: issuanceAmount,
    rgbppLiveCells: rgbppIssuanceCells,
  });
  logger.logCkbTx("ckbPartialTx", ckbPartialTx);

  const commitment = rgbppXudtLikeClient.calculateCommitment(ckbPartialTx);

  const psbt = await rgbppBtcWallet.buildPsbt({
    ckbPartialTx,
    utxoSeals: [utxoSeal],
    from: utxoBasedAccountAddress,
    to: utxoBasedAccountAddress,
    commitment,
    rgbppLockScriptTemplate: rgbppXudtLikeClient.rgbppLockScriptTemplate(),
    btcTimeLockScriptTemplate: rgbppXudtLikeClient.btcTimeLockScriptTemplate(),
  });

  const signedBtcTx = await rgbppBtcWallet.signTx(psbt);
  const rawBtcTxHex = await rgbppBtcWallet.rawTxHex(signedBtcTx);
  logger.add("rawBtcTxHex", rawBtcTxHex);

  const btcTxId = await rgbppBtcWallet.sendTx(signedBtcTx);
  logger.add("btcTxId", btcTxId, true);
  const proof = await pollForSpvProof(btcTxId, 30);

  const ckbTxWithRgbppUnlockParams = await ckbRgbppSigner.setRgbppUnlockParams({
    spvProof: proof!,
    txId: btcTxId,
    rawTxHex: rawBtcTxHex,
    ckbPartialTx,
    rgbppLockScriptTemplate: rgbppXudtLikeClient.rgbppLockScriptTemplate(),
    btcTimeLockScriptTemplate: rgbppXudtLikeClient.btcTimeLockScriptTemplate(),
  });
  // ? ckbRgbppSigner 是否要做普通 signer 的事
  const rgbppSignedCkbTx = await ckbRgbppSigner.signTransaction(
    ckbTxWithRgbppUnlockParams
  );

  await rgbppSignedCkbTx.completeFeeBy(ckbSigner);
  const ckbFinalTx = await ckbSigner.signTransaction(rgbppSignedCkbTx);
  logger.logCkbTx("ckbFinalTx", ckbFinalTx);
  const txHash = await ckbSigner.client.sendTransaction(ckbFinalTx);
  await ckbClient.waitTransaction(txHash);
  logger.add("ckbTxId", txHash, true);
}

issueXudt({
  txId: "2e8eb5c4a5d0f3b59f6a548d34128da0a18d0d468c82cb4c391c132aa5986935",
  index: 2,
})
  .then(() => {
    logger.saveOnSuccess();
    process.exit(0);
  })
  .catch((e) => {
    logger.saveOnError(e);
    process.exit(1);
  });

/* 
pnpm tsx packages/examples/src/issuance.ts
*/
