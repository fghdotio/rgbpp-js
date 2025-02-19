import { buildBtcRgbppOutputs, UtxoSeal } from "@rgbpp-js/core";

import { RgbppTxLogger } from "./logger.js";
import { xudtToken } from "./asset.js";
import { collectRgbppCells } from "./utils.js";
import {
  rgbppXudtLikeClient,
  ckbAddress,
  rgbppBtcWallet,
  utxoBasedAccountAddress,
  createCkbRgbppUnlockSinger,
} from "./env.js";

async function leapFromBtcToCkb(
  utxoSeals: UtxoSeal[],
  xudtTokenId: string,
  amount: bigint,
  ckbAddress: string
) {
  const { rgbppLiveCells, xudtLikeTypeScript } = await collectRgbppCells(
    utxoSeals,
    xudtTokenId
  );
  console.log(rgbppLiveCells);

  const ckbPartialTx = await rgbppXudtLikeClient.leapFromBtcCkbPartialTx({
    rgbppLiveCells,
    xudtLikeTypeScript,
    address: ckbAddress,
    amount,
  });
  logger.logCkbTx("ckbPartialTx", ckbPartialTx, true);
  const commitment = rgbppXudtLikeClient.calculateCommitment(ckbPartialTx);
  const psbt = await rgbppBtcWallet.buildPsbt({
    rgbppOutputs: buildBtcRgbppOutputs(
      ckbPartialTx,
      utxoBasedAccountAddress,
      [utxoBasedAccountAddress],
      rgbppXudtLikeClient.rgbppLockScriptTemplate(),
      rgbppXudtLikeClient.btcTimeLockScriptTemplate(),
      commitment
    ),

    utxoSeals,
    from: utxoBasedAccountAddress,
    feeRate: 512,
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
  logger.logCkbTx("ckbPartialTxInjected", ckbPartialTxInjected);

  const ckbRgbppUnlockSinger = createCkbRgbppUnlockSinger(rawBtcTxHex);
  await ckbPartialTxInjected.completeFeeBy(
    ckbRgbppUnlockSinger.feeSigner,
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

const logger = new RgbppTxLogger({ opType: "btc-to-ckb" });

leapFromBtcToCkb(
  [
    {
      txId: "b1d1580919aa4ce73b29be12173e00fdb28fde38ab32e57be00866d9c647fc69",
      index: 3,
    },
  ],
  "0xcafc80445e16b49e9b849be4912f93970f80956d62f01fdc0238f1f694bea996",
  BigInt(1000) * BigInt(10 ** xudtToken.decimal),
  ckbAddress
)
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
pnpm tsx packages/examples/src/btc-to-ckb.ts
*/
