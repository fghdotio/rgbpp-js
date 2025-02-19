import {
  RgbppBtcReceiver,
  UtxoSeal,
  buildBtcRgbppOutputs,
} from "@rgbpp-js/core";

import { RgbppTxLogger } from "./logger.js";
import {
  rgbppBtcWallet,
  rgbppXudtLikeClient,
  utxoBasedAccountAddress,
  createCkbRgbppUnlockSinger,
} from "./env.js";
import { collectRgbppCells } from "./utils.js";
import { xudtToken } from "./asset.js";

async function distributeXudt(
  utxoSeals: UtxoSeal[],
  xUdtTokenId: string,
  receivers: RgbppBtcReceiver[]
) {
  const { rgbppLiveCells, xudtLikeTypeScript } = await collectRgbppCells(
    utxoSeals,
    xUdtTokenId
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

const logger = new RgbppTxLogger({ opType: "distribute" });

distributeXudt(
  [
    {
      txId: "b1d1580919aa4ce73b29be12173e00fdb28fde38ab32e57be00866d9c647fc69",
      index: 6,
    },
  ],
  "0xcafc80445e16b49e9b849be4912f93970f80956d62f01fdc0238f1f694bea996",
  [
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
  ]
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
pnpm tsx packages/examples/src/distribute.ts
*/
