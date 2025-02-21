import {
  RgbppBtcReceiver,
  UtxoSeal,
  buildBtcRgbppOutputs,
} from "@rgbpp-js/core";

import { RgbppTxLogger } from "../common/logger.js";
import {
  rgbppBtcWallet,
  rgbppXudtLikeClient,
  utxoBasedAccountAddress,
  ckbRgbppUnlockSinger,
} from "../common/env.js";
import { collectRgbppCells } from "../common/utils.js";
import { xudtToken } from "../common/assets.js";

async function distributeSudt({
  utxoSeals,
  compatibleXudtTokenId,
  receivers,
}: {
  utxoSeals: UtxoSeal[];
  compatibleXudtTokenId: string;
  receivers: RgbppBtcReceiver[];
}) {
  const { rgbppLiveCells, xudtLikeTypeScript } = await collectRgbppCells(
    utxoSeals,
    compatibleXudtTokenId,
    "sudt"
  );
  console.log(rgbppLiveCells);

  const ckbPartialTx = await rgbppXudtLikeClient.distributionCkbPartialTx({
    rgbppLiveCells,
    xudtLikeTypeScript,
    receivers,
  });
  logger.logCkbTx("ckbPartialTx", ckbPartialTx, true);
  const commitment = rgbppXudtLikeClient.calculateCommitment(ckbPartialTx);
  const psbt = await rgbppBtcWallet.buildPsbt({
    rgbppOutputs: buildBtcRgbppOutputs(
      ckbPartialTx,
      utxoBasedAccountAddress,
      receivers.map((receiver) => receiver.address),
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
  logger.logCkbTx("ckbFinalTx", ckbFinalTx);

  const txHash = await ckbRgbppUnlockSinger.client.sendTransaction(ckbFinalTx);
  await ckbRgbppUnlockSinger.client.waitTransaction(txHash);
  logger.add("ckbTxId", txHash, true);
}

const logger = new RgbppTxLogger({ opType: "compatible-xudt-distribution" });

distributeSudt({
  utxoSeals: [
    {
      txId: "7dbd0d60d2ce56cd9685035f281061fdfc306b32fea0061649e1f298441b5e34",
      index: 1,
    },
  ],
  compatibleXudtTokenId:
    "0x0bb59f94b0fc2984fe3b1b239515fc77bc454dff9152047ced5d5d2a3a32d033",
  receivers: [
    {
      address: "tb1qjkdqj8zk6gl7pwuw2d2jp9e6wgf26arjl8pcys",
      amount: BigInt(1001) * BigInt(10 ** xudtToken.decimal),
    },
    {
      address: "tb1qjkdqj8zk6gl7pwuw2d2jp9e6wgf26arjl8pcys",
      amount: BigInt(2002) * BigInt(10 ** xudtToken.decimal),
    },
    {
      address: "tb1qjkdqj8zk6gl7pwuw2d2jp9e6wgf26arjl8pcys",
      amount: BigInt(3003) * BigInt(10 ** xudtToken.decimal),
    },
    {
      address: "tb1qjkdqj8zk6gl7pwuw2d2jp9e6wgf26arjl8pcys",
      amount: BigInt(4004) * BigInt(10 ** xudtToken.decimal),
    },
    {
      address: "tb1qyyhdxmhc059rksfh9jjlkqgvs4w6mdl0z3zqj3",
      amount: BigInt(5005) * BigInt(10 ** xudtToken.decimal),
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
pnpm tsx packages/examples/src/compatible-xUDT/2-distribution.ts
*/
