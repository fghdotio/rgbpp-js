import { ccc, spore } from "@ckb-ccc/shell";

import { RawSporeData } from "@spore-sdk/core";

import {
  buildBtcRgbppOutputs,
  parseUtxoSealFromScriptArgs,
} from "@rgbpp-js/core";

import { ckbClient, ckbSigner, initializeRgbppEnv } from "../common/env.js";

import { RgbppTxLogger } from "../common/logger.js";

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

  const { tx: transferClusterTx } = await spore.transferSporeCluster({
    signer: ckbSigner,
    id: receiverInfo.rawSporeData.clusterId!,
    to: rgbppXudtLikeClient.buildPseudoRgbppLockScript(0), // new cluster output
  });

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
    await rgbppXudtLikeClient.insertRgbppWitnessPlaceholder(ckbPartialTx);

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

  // TODO: move to prepareTransaction
  // because of not being able to use cluster mode
  rgbppSignedCkbTx.cellDeps.push(
    ccc.CellDep.from({
      outPoint: rgbppClusterCell.outPoint,
      depType: "code",
    })
  );

  await rgbppSignedCkbTx.completeFeeBy(ckbSigner);
  logger.logCkbTx("ckbFinalTxToSign", rgbppSignedCkbTx);

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


btcTxId: 0e611f8425cf0e9b32c17e690e62bcf00d4164351572f5afb42d94b850442491
ckbTxId: 0x034e22c55d2be9cff68c130a7dde47301cb35d27c035ffb194e258c18ab0b8d9


btcTxId: 25569146a3478fe16726ef3a8c5382a611830c9b90b8736c88cea1a9f8631d02
ckbTxId: 0xeb2bd9e149982f70ad3898f1922cb61ec1838d662f7a294dceeee8a0ef89629d
*/
