import { ccc } from "@ckb-ccc/core";

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
      rgbppXudtLikeClient.rgbppLockScriptTemplate(),
      rgbppXudtLikeClient.btcTimeLockScriptTemplate()
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
  logger.logCkbTx("ckbPartialTxInjected", ckbPartialTxInjected);

  await ckbPartialTxInjected.completeFeeBy(ckbRgbppUnlockSinger.feeSigner);
  logger.logCkbTx("ckbPartialTxWithFee", ckbPartialTxInjected);

  const ckbFinalTx =
    await ckbRgbppUnlockSinger.signTransaction(ckbPartialTxInjected);
  logger.logCkbTx("ckbFinalTx", ckbFinalTx, true);

  const txHash = await ckbRgbppUnlockSinger.client.sendTransaction(ckbFinalTx);
  await ckbRgbppUnlockSinger.client.waitTransaction(txHash);
  logger.add("ckbTxId", txHash, true);
}

const logger = new RgbppTxLogger({ opType: "xudt-btc-to-ckb" });

leapFromBtcToCkb({
  utxoSeals: [
    {
      txId: "c61b7b8bc010ace294cfb6d1676e7e5ad919fef6e37b04f949cb1105a6f62946",
      index: 1,
    },
  ],
  xudtTokenId:
    "0x25c090ec44476bed83d78a673d76c099b802679a4a7be8503080869bb9648d26",
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
