import { spore } from "@ckb-ccc/shell";

import {
  buildBtcRgbppOutputs,
  parseUtxoSealFromScriptArgs,
} from "@rgbpp-js/core";

import { ckbClient, ckbSigner, initializeRgbppEnv } from "../common/env.js";

import { RgbppTxLogger } from "../common/logger.js";

async function transferSpore({
  btcAddress,
  sporeTypeArgs,
}: {
  btcAddress: string;
  sporeTypeArgs: string;
}) {
  const {
    rgbppBtcWallet,
    rgbppXudtLikeClient,
    utxoBasedAccountAddress,
    ckbRgbppUnlockSinger,
  } = initializeRgbppEnv();

  const { tx: ckbPartialTx } = await spore.transferSpore({
    signer: ckbSigner,
    id: sporeTypeArgs,
    to: rgbppXudtLikeClient.buildPseudoRgbppLockScript(0),
  });

  const inputSpore = ckbPartialTx.inputs[0];
  await inputSpore.completeExtraInfos(ckbClient);
  const utxoSeal = parseUtxoSealFromScriptArgs(
    inputSpore.cellOutput!.lock.args
  );

  const txWithRgbppWitnessPlaceholder =
    await rgbppXudtLikeClient.insertRgbppWitnessPlaceholder(ckbPartialTx);

  logger.logCkbTx(
    "txWithRgbppWitnessPlaceholder",
    txWithRgbppWitnessPlaceholder,
    true
  );

  const psbt = await rgbppBtcWallet.buildPsbt({
    rgbppOutputs: buildBtcRgbppOutputs(
      txWithRgbppWitnessPlaceholder,
      utxoBasedAccountAddress,
      [btcAddress],
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
    txWithRgbppWitnessPlaceholder,
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

const logger = new RgbppTxLogger({ opType: "spore-transfer" });

transferSpore({
  btcAddress: "tb1qjkdqj8zk6gl7pwuw2d2jp9e6wgf26arjl8pcys",
  sporeTypeArgs:
    "0x1ce69c40f01f412128aadc4acaf2af4292b12efdf7bbec11824c708cf4ab70d8",
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
pnpm tsx packages/examples/src/spore/3-spore-btc-transfer.ts


https://mempool.space/testnet/tx/459d62a172ef5d311354c1f544599396cb4291c36e5bacbe6a08b301d3015f72
https://testnet.explorer.nervos.org/transaction/0x659fb26595019caa3e1cd001a803707c29dfe4601ed0b5571f34e7cbc856aca0
*/
