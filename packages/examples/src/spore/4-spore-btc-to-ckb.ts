import { ccc, spore } from "@ckb-ccc/shell";

import { UtxoSeal, buildBtcRgbppOutputs } from "@rgbpp-js/core";

import {
  ckbRgbppUnlockSinger,
  rgbppBtcWallet,
  rgbppXudtLikeClient,
  utxoBasedAccountAddress,
  ckbClient,
  ckbSigner,
} from "../common/env.js";

import { RgbppTxLogger } from "../common/logger.js";
import { generateSporeTransferCoBuild } from "../common/spore.js";
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
  const { tx: ckbPartialTx } = await spore.transferSpore({
    signer: ckbSigner,
    id: sporeTypeArgs,
    to: await rgbppXudtLikeClient.buildBtcTimeLockScript(ckbAddress),
  });

  console.log(inspect(ckbPartialTx, { showHidden: true, depth: null }));

  const txWithRgbppWitnessPlaceholder =
    await rgbppXudtLikeClient.injectRgbppWitnessPlaceholder(ckbPartialTx);

  logger.logCkbTx(
    "txWithRgbppWitnessPlaceholder",
    txWithRgbppWitnessPlaceholder,
    true
  );

  const psbt = await rgbppBtcWallet.buildPsbt({
    rgbppOutputs: buildBtcRgbppOutputs(
      txWithRgbppWitnessPlaceholder,
      utxoBasedAccountAddress,
      [utxoBasedAccountAddress],
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

  await rgbppSignedCkbTx.completeFeeBy(ckbSigner, 3000);
  logger.logCkbTx("ckbPartialTxWithFee", rgbppSignedCkbTx);

  rgbppSignedCkbTx.witnesses.push(
    generateSporeTransferCoBuild(
      [(await spore.assertSpore(ckbClient, sporeTypeArgs)).cell],
      rgbppSignedCkbTx.outputs.slice(0, 1)
    ) as ccc.Hex
  );

  const ckbFinalTx = await ckbSigner.signTransaction(rgbppSignedCkbTx);
  logger.logCkbTx("ckbFinalTx", ckbFinalTx);
  const txHash = await ckbSigner.client.sendTransaction(ckbFinalTx);
  await ckbRgbppUnlockSinger.client.waitTransaction(txHash);
  logger.add("ckbTxId", txHash, true);
}

const logger = new RgbppTxLogger({ opType: "spore-btc-to-ckb" });

btcSporeToCkb({
  utxoSeal: {
    txId: "f5417fdb977583bfec0262e9e41c0dda56f9bb84d7da71f0d7425c1b48587204",
    index: 2,
  },
  ckbAddress:
    "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqfpu7pwavwf3yang8khrsklumayj6nyxhqpmh7fq",
  sporeTypeArgs:
    "0xb1bf3620fa9caf55bd5e6ca05a99013cb48ba5cbf522efc34cc098da4a1cb1fe",
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

https://testnet.explorer.nervos.org/transaction/0xb168baa2e402832a6223f29b22ea7e14192cf319e2e26f6e60d69ef6ec10fd5b
*/
