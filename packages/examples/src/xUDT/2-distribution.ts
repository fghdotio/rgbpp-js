import { ccc } from "@ckb-ccc/shell";

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
  ckbClient,
  ckbSigner,
} from "../common/env.js";
import { collectRgbppCells } from "../common/utils.js";
import { xudtToken } from "../common/assets.js";

async function distributeXudt({
  utxoSeals,
  xudtTokenId,
  receivers,
}: {
  utxoSeals: UtxoSeal[];
  xudtTokenId: string;
  receivers: RgbppBtcReceiver[];
}) {
  const xudtLikeTypeScript = await ccc.Script.fromKnownScript(
    ckbClient,
    ccc.KnownScript.XUdt,
    xudtTokenId
  );
  const rgbppLiveCells = await collectRgbppCells(utxoSeals, xudtLikeTypeScript);
  console.log(rgbppLiveCells);

  const ckbPartialTx = await rgbppXudtLikeClient.distributionCkbPartialTx({
    rgbppLiveCells,
    xudtLikeTypeScript,
    receivers,
  });
  logger.logCkbTx("ckbPartialTx", ckbPartialTx, true);
  const psbt = await rgbppBtcWallet.buildPsbt({
    rgbppOutputs: buildBtcRgbppOutputs(
      ckbPartialTx,
      utxoBasedAccountAddress,
      receivers.map((receiver) => receiver.address),
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

const logger = new RgbppTxLogger({ opType: "xudt-distribution" });

distributeXudt({
  utxoSeals: [
    {
      txId: "4fa0c35ebb351dd02c00efb168a80ca65e84f1ee633ccbbe436bea4dd0bb6eb4",
      index: 1,
    },
  ],
  xudtTokenId:
    "0x1257e3a770e602dfddaadcfb36c8f609fd01128355b70741184e50d397e3457f",
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
pnpm tsx packages/examples/src/xUDT/2-distribution.ts
*/
