import { spore } from "@ckb-ccc/shell";

import {
  buildBtcRgbppOutputs,
  parseUtxoSealFromScriptArgs,
} from "@rgbpp-js/core";

import { ckbClient, ckbSigner, initializeRgbppEnv } from "../common/env.js";

import { RgbppTxLogger } from "../common/logger.js";

async function btcSporeToCkb({
  ckbAddress,
  sporeTypeArgs,
}: {
  ckbAddress: string;
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
    to: await rgbppXudtLikeClient.buildBtcTimeLockScript(ckbAddress),
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
      [],
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

const logger = new RgbppTxLogger({ opType: "spore-btc-to-ckb" });

btcSporeToCkb({
  ckbAddress:
    "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqfpu7pwavwf3yang8khrsklumayj6nyxhqpmh7fq",
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
pnpm tsx packages/examples/src/spore/4-spore-btc-to-ckb.ts


https://mempool.space/testnet/tx/2f3c6f0f580f654850ab9c1dce5519fc0c07d6c64b17d4207a8b16e39ce919b9
https://testnet.explorer.nervos.org/transaction/0x34991e0eba85cda5fef82819c676d39eaeee4d813bb78c7c7a951c9dd426bdda
*/
