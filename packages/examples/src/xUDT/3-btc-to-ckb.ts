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
    confirmations: 6,
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

  await ckbPartialTxInjected.completeFeeBy(
    ckbRgbppUnlockSinger.feeSigner,
    5000
  );
  logger.logCkbTx("ckbPartialTxWithFee", ckbPartialTxInjected);

  const ckbFinalTx =
    await ckbRgbppUnlockSinger.signTransaction(ckbPartialTxInjected);
  logger.logCkbTx("ckbFinalTx", ckbFinalTx, true);

  const txHash = await ckbRgbppUnlockSinger.client.sendTransaction(ckbFinalTx);
  await ckbRgbppUnlockSinger.client.waitTransaction(txHash);
  logger.add("ckbTxId", txHash, true);
}

const logger = new RgbppTxLogger({ opType: "btc-to-ckb" });

leapFromBtcToCkb({
  utxoSeals: [
    {
      txId: "5e9c4e47fdf4d435974ec7e92fef80a079d434978ba5037db50e6866947aa829",
      index: 1,
    },
  ],
  xudtTokenId:
    "0x67edb00bea376a36407444081ce2a58ea3e7cd5c4ff89fd732dffd465c3e3096",
  amount: BigInt(101) * BigInt(10 ** xudtToken.decimal),
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
