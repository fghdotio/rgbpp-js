import { ccc } from "@ckb-ccc/shell";

import { buildBtcRgbppOutputs, UtxoSeal } from "@rgbpp-js/core";

import { RgbppTxLogger } from "../common/logger.js";
import { xudtToken } from "../common/assets.js";
import { collectRgbppCells } from "../common/utils.js";
import {
  rgbppXudtLikeClient,
  ckbAddress,
  rgbppBtcWallet,
  utxoBasedAccountAddress,
  ckbRgbppUnlockSinger,
  ckbClient,
  ckbSigner,
} from "../common/env.js";

async function leapFromBtcToCkb({
  utxoSeals,
  xudtTokenId,
  amount,
  ckbAddress,
}: {
  utxoSeals: UtxoSeal[];
  xudtTokenId: string;
  amount: bigint;
  ckbAddress: string;
}) {
  const xudtLikeTypeScript = await ccc.Script.fromKnownScript(
    ckbClient,
    ccc.KnownScript.XUdt,
    xudtTokenId
  );
  const rgbppLiveCells = await collectRgbppCells(utxoSeals, xudtLikeTypeScript);
  console.log(rgbppLiveCells);

  const ckbPartialTx = await rgbppXudtLikeClient.leapFromBtcCkbPartialTx({
    rgbppLiveCells,
    xudtLikeTypeScript,
    address: ckbAddress,
    amount,
    confirmations: 6,
  });
  logger.logCkbTx("ckbPartialTx", ckbPartialTx, true);

  const psbt = await rgbppBtcWallet.buildPsbt({
    rgbppOutputs: buildBtcRgbppOutputs(
      ckbPartialTx,
      utxoBasedAccountAddress,
      [utxoBasedAccountAddress],
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

const logger = new RgbppTxLogger({ opType: "xudt-btc-to-ckb" });

leapFromBtcToCkb({
  utxoSeals: [
    {
      txId: "2d0f8847b2c6f9c194ff722135b1cd36669432cbcc561e48bade5be3613b1566",
      index: 1,
    },
  ],
  xudtTokenId:
    "0x1257e3a770e602dfddaadcfb36c8f609fd01128355b70741184e50d397e3457f",
  amount: BigInt(202) * BigInt(10 ** xudtToken.decimal),
  ckbAddress,
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
pnpm tsx packages/examples/src/xUDT/3-btc-to-ckb.ts
*/
