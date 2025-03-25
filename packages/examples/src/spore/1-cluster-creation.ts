import { ccc, spore } from "@ckb-ccc/shell";

import { UtxoSeal, buildBtcRgbppOutputs } from "@rgbpp-js/core";

import { ckbClient, ckbSigner, initializeRgbppEnv } from "../common/env.js";
import { prepareRgbppCells } from "../common/utils.js";
import { clusterData } from "../common/assets.js";
import { RgbppTxLogger } from "../common/logger.js";
import { generateClusterCreateCoBuild } from "../common/spore.js";

async function createSporeCluster(utxoSeal?: UtxoSeal) {
  const {
    rgbppBtcWallet,
    rgbppXudtLikeClient,
    utxoBasedAccountAddress,
    ckbRgbppUnlockSinger,
  } = initializeRgbppEnv();

  if (!utxoSeal) {
    utxoSeal = await rgbppBtcWallet.prepareUtxoSeal(28);
  }

  const rgbppCells = await prepareRgbppCells(utxoSeal, rgbppXudtLikeClient);
  const tx = ccc.Transaction.default();
  // manually add specified inputs
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
    to: rgbppXudtLikeClient.buildPseudoRgbppLockScript(0),
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

  // ? 无法前置
  // `prepareSighashAllWitness` will fail
  // const position = await this.findInputIndexByLock(scriptLike, client);
  // fee input unshift(0)?
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

createSporeCluster({
  txId: "9243145d323312899a7c7c4e526d6f075301d5e0745e2dfc135c8b9b0f1fa13f",
  index: 3,
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
pnpm tsx packages/examples/src/spore/1-cluster-creation.ts


clusterId: 0x7c9157efd21445b601e429e9cb0871a772f7531fcbf362dd2333c8c759d82b19
btcTxId: fd79774ebf7b5cd641de47b708fb4f6a9fb417490df0be055eaf7915dcb3db28
ckbTxId: 0xa6a62b6ad2e1c3a2929cf40f34d2082068f816d3cc5d5ee8820f8ad42bdbb4a4
*/
