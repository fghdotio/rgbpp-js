import { ccc, spore } from "@ckb-ccc/shell";

import {
  TX_ID_PLACEHOLDER,
  UtxoSeal,
  buildBtcRgbppOutputs,
} from "@rgbpp-js/core";

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

async function transferSpore({
  utxoSeal,
  btcAddress,
  sporeTypeArgs,
}: {
  utxoSeal: UtxoSeal;
  btcAddress: string;
  sporeTypeArgs: string;
}) {
  const { tx: ckbPartialTx } = await spore.transferSpore({
    signer: ckbSigner,
    id: sporeTypeArgs,
    to: rgbppXudtLikeClient.buildRgbppLockScript({
      txId: TX_ID_PLACEHOLDER,
      index: 1,
    }),
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

const logger = new RgbppTxLogger({ opType: "spore-transfer" });

transferSpore({
  utxoSeal: {
    txId: "abe7d2160eec0fb9e97b6cd33b88df78957c9df0163156134499e9160c394231",
    index: 2,
  },
  btcAddress: "tb1qyyhdxmhc059rksfh9jjlkqgvs4w6mdl0z3zqj3",
  sporeTypeArgs:
    "0xa13b4c4dea0693e6662cfeb72bce2edbb044e8e41a702979fef6ad991bf04120",
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
https://testnet.explorer.nervos.org/transaction/0xc735daaf7e67fef02811efbb2ae0e7cdc24c6b8314e2e06ed562b896e465bb69
*/
