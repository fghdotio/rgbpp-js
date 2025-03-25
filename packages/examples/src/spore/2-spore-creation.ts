import { ccc, spore } from "@ckb-ccc/shell";

import { RawSporeData } from "@spore-sdk/core";

import {
  TX_ID_PLACEHOLDER,
  UtxoSeal,
  buildBtcRgbppOutputs,
  parseUtxoSealFromScriptArgs,
} from "@rgbpp-js/core";

import { ckbClient, ckbSigner, initializeRgbppEnv } from "../common/env.js";
import { collectRgbppCells } from "../common/utils.js";
import { RgbppTxLogger } from "../common/logger.js";
import { generateSporeCreateCoBuild } from "../common/spore.js";

async function createSpore({
  receiverInfo,
}: {
  receiverInfo: {
    btcAddress: string;
    rawSporeData: RawSporeData;
  };
}) {
  const {
    rgbppBtcWallet,
    rgbppXudtLikeClient,
    utxoBasedAccountAddress,
    ckbRgbppUnlockSinger,
  } = initializeRgbppEnv();

  const { cell: rgbppClusterCell } = await spore.assertCluster(
    ckbClient,
    receiverInfo.rawSporeData.clusterId!
  );
  const utxoSeal = parseUtxoSealFromScriptArgs(
    rgbppClusterCell.cellOutput.lock.args
  );

  const transferClusterTx = ccc.Transaction.default();
  const cellInput = ccc.CellInput.from({
    previousOutput: rgbppClusterCell.outPoint,
  });
  cellInput.completeExtraInfos(ckbClient);
  transferClusterTx.inputs.push(cellInput);
  transferClusterTx.addOutput(
    {
      ...rgbppClusterCell.cellOutput,
      lock: rgbppXudtLikeClient.buildPseudoRgbppLockScript(0), // new cluster output
    },
    rgbppClusterCell.outputData
  );

  // const { tx: transferClusterTx } = await spore.transferSporeCluster({
  //   signer: ckbSigner,
  //   id: receiverInfo.rawSporeData.clusterId!,
  //   to: rgbppXudtLikeClient.buildPseudoRgbppLockScript(0), // new cluster output
  // });

  // ? API for creating multiple spores
  const { tx: ckbPartialTx, id } = await spore.createSpore({
    signer: ckbSigner,
    data: receiverInfo.rawSporeData,
    to: rgbppXudtLikeClient.buildPseudoRgbppLockScript(0 + 1), // offset by 1 as it's for new cluster output
    // cannot use cluster mode here as cluster's lock needs to be updated
    clusterMode: "skip",
    tx: transferClusterTx,
  });

  const txWithRgbppWitnessPlaceholder =
    await rgbppXudtLikeClient.injectRgbppWitnessPlaceholder(ckbPartialTx);

  logger.add("spore id", id, true);
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
    generateSporeCreateCoBuild({
      sporeOutputs: rgbppSignedCkbTx.outputs.slice(
        1,
        rgbppSignedCkbTx.outputs.length - 1
      ),
      sporeOutputsData: rgbppSignedCkbTx.outputsData.slice(
        1,
        rgbppSignedCkbTx.outputsData.length - 1
      ),
      clusterCell: rgbppClusterCell,
      clusterOutputCell: rgbppSignedCkbTx.outputs[0],
    }) as ccc.Hex
  );

  const clusterTypeScriptInfo = spore.getClusterScriptInfo(ckbClient);
  rgbppSignedCkbTx.cellDeps.push(
    ccc.CellDep.from(clusterTypeScriptInfo.cellDeps[0].cellDep),
    ccc.CellDep.from({
      outPoint: rgbppClusterCell.outPoint,
      depType: "code",
    })
  );

  const ckbFinalTx = await ckbSigner.signTransaction(rgbppSignedCkbTx);
  logger.logCkbTx("ckbFinalTx", ckbFinalTx);
  const txHash = await ckbSigner.client.sendTransaction(ckbFinalTx);
  await ckbRgbppUnlockSinger.client.waitTransaction(txHash);
  logger.add("ckbTxId", txHash, true);
}

const logger = new RgbppTxLogger({ opType: "spore-creation" });

createSpore({
  receiverInfo: {
    btcAddress: "tb1qjkdqj8zk6gl7pwuw2d2jp9e6wgf26arjl8pcys",
    rawSporeData: {
      contentType: "text/plain",
      content: ccc.bytesFrom("First Spore Live", "utf8"),
      clusterId:
        "0x7c9157efd21445b601e429e9cb0871a772f7531fcbf362dd2333c8c759d82b19",
    },
  },
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
pnpm tsx packages/examples/src/spore/2-spore-creation.ts


btcTxId: 3dcb4d6829b4ed019eaadceeab21f3cf87d4ef3c086f4006c9d01003ee961710
ckbTxId: 0x41a91e02781f22c229edb3e0b9fc2ada67ef828c59cca3988a68d36999404bd6
*/
