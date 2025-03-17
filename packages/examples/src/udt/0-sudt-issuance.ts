import { UtxoSeal, buildBtcRgbppOutputs } from "@rgbpp-js/core";

import {
  ckbRgbppUnlockSinger,
  ckbSigner,
  rgbppBtcWallet,
  rgbppXudtLikeClient,
  utxoBasedAccountAddress,
} from "../common/env.js";
import { prepareRgbppCells } from "../common/utils.js";
import { issuanceAmount, testnetSudt, sudtToken } from "../common/assets.js";
import { RgbppTxLogger } from "../common/logger.js";

async function issueSudt(utxoSeal?: UtxoSeal) {
  if (!utxoSeal) {
    utxoSeal = await rgbppBtcWallet.prepareUtxoSeal(10);
  }

  const rgbppIssuanceCells = await prepareRgbppCells(utxoSeal);

  const ckbPartialTx = await rgbppXudtLikeClient.issuanceCkbPartialTx({
    token: sudtToken,
    amount: issuanceAmount,
    rgbppLiveCells: rgbppIssuanceCells,
    xudtLikeTypeScript: testnetSudt,
  });
  logger.logCkbTx("ckbPartialTx", ckbPartialTx);
  console.log(
    "Unique ID of issued sUDT token",
    ckbPartialTx.outputs[0].type!.args
  );

  const psbt = await rgbppBtcWallet.buildPsbt({
    rgbppOutputs: buildBtcRgbppOutputs(
      ckbPartialTx,
      utxoBasedAccountAddress,
      [utxoBasedAccountAddress],
      rgbppXudtLikeClient
    ),

    utxoSeals: [utxoSeal],
    from: utxoBasedAccountAddress,
    feeRate: 28,
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

const logger = new RgbppTxLogger({ opType: "sudt-issuance" });

issueSudt({
  txId: "219826cc34e1d82f4b3f6aa7909e95e3a21808a205a5e04804bf5a8bd2b94c95",
  index: 1,
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
pnpm tsx packages/examples/src/xUDT/sudt-issuance.ts

https://mempool.space/testnet/tx/bfb01d23c37c4c7b99241a6f2f343693f0b9c073c694a06bddf7a3cae2c454c2
https://testnet.explorer.nervos.org/transaction/0x93a9d87b503748bb84163f0efcde15cb6cfd6f4f3fa2009ef518d5146faea8c1
*/
