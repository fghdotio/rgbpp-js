import { ccc, spore } from "@ckb-ccc/shell";

import { UtxoSeal, buildBtcRgbppOutputs } from "@rgbpp-js/core";

import { ckbClient, ckbSigner, initializeRgbppEnv } from "../common/env.js";

import { RgbppTxLogger } from "../common/logger.js";
import { insertSporeTransferWitness } from "../common/spore.js";
import { inspect } from "util";

async function btcSporeToCkb({
  utxoSeal,
  ckbAddress,
  sporeTypeArgs,
}: {
  utxoSeal: UtxoSeal;
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

  console.log(inspect(ckbPartialTx, { showHidden: true, depth: null }));

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

  const rgbppSignedCkbTxWithCobuild = await insertSporeTransferWitness(
    rgbppSignedCkbTx,
    sporeTypeArgs,
    ckbClient
  );

  await rgbppSignedCkbTxWithCobuild.completeFeeBy(ckbSigner);
  logger.logCkbTx("ckbPartialTxWithFee", rgbppSignedCkbTxWithCobuild);

  const ckbFinalTx = await ckbSigner.signTransaction(
    rgbppSignedCkbTxWithCobuild
  );
  logger.logCkbTx("ckbFinalTx", ckbFinalTx);
  const txHash = await ckbSigner.client.sendTransaction(ckbFinalTx);
  await ckbRgbppUnlockSinger.client.waitTransaction(txHash);
  logger.add("ckbTxId", txHash, true);
}

const logger = new RgbppTxLogger({ opType: "spore-btc-to-ckb" });

btcSporeToCkb({
  utxoSeal: {
    txId: "459d62a172ef5d311354c1f544599396cb4291c36e5bacbe6a08b301d3015f72",
    index: 1,
  },
  ckbAddress:
    "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqfpu7pwavwf3yang8khrsklumayj6nyxhqpmh7fq",
  sporeTypeArgs:
    "0x8c2f6d23f1132aeec63a9c923ec82d5ccefe9e33aeb33bfd6125f063b597c7a9",
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
