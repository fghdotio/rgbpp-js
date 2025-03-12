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
import { prepareRgbppCells } from "../common/utils.js";
import { clusterData } from "../common/assets.js";
import { RgbppTxLogger } from "../common/logger.js";
import { generateClusterCreateCoBuild } from "../common/spore.js";

async function createSporeCluster(utxoSeal?: UtxoSeal) {
  if (!utxoSeal) {
    utxoSeal = await rgbppBtcWallet.prepareUtxoSeal(28);
  }

  const rgbppCells = await prepareRgbppCells(utxoSeal);
  const tx = ccc.Transaction.default();
  // ? manually add specified inputs
  rgbppCells.forEach((cell) => {
    const cellInput = ccc.CellInput.from({
      previousOutput: cell.outPoint,
    });
    cellInput.completeExtraInfos(ckbClient);

    tx.inputs.push(cellInput);
  });

  const { tx: ckbPartialTx, id } = await spore.createSporeCluster({
    signer: ckbSigner,
    data: clusterData,
    to: rgbppXudtLikeClient.buildRgbppLockScript({
      txId: TX_ID_PLACEHOLDER,
      index: 1,
    }),
    tx,
  });

  // ? see `injectRgbppWitnessPlaceholder`
  const txWithRgbppWitnessPlaceholder =
    await rgbppXudtLikeClient.injectRgbppWitnessPlaceholder(ckbPartialTx);

  logger.add("clusterId", id, true);
  logger.logCkbTx(
    "txWithRgbppWitnessPlaceholder",
    txWithRgbppWitnessPlaceholder,
    false
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

  // ? co-build witness
  rgbppSignedCkbTx.witnesses.push(
    generateClusterCreateCoBuild(
      rgbppSignedCkbTx.outputs[0],
      rgbppSignedCkbTx.outputsData[0]
    ) as ccc.Hex
  );

  const ckbFinalTx = await ckbSigner.signTransaction(rgbppSignedCkbTx);
  logger.logCkbTx("ckbFinalTx", ckbFinalTx);
  const txHash = await ckbSigner.client.sendTransaction(ckbFinalTx);
  await ckbRgbppUnlockSinger.client.waitTransaction(txHash);
  logger.add("ckbTxId", txHash, true);
}

const logger = new RgbppTxLogger({ opType: "cluster-creation" });

createSporeCluster()
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
pnpm tsx packages/examples/src/spore/1-cluster-creation.ts
*/
