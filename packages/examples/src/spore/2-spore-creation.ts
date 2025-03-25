import { ccc, spore } from "@ckb-ccc/shell";

import { RawSporeData } from "@spore-sdk/core";

import {
  buildBtcRgbppOutputs,
  parseUtxoSealFromScriptArgs,
} from "@rgbpp-js/core";

import { ckbClient, ckbSigner, initializeRgbppEnv } from "../common/env.js";

import { RgbppTxLogger } from "../common/logger.js";
import { insertSporeCreationWitness } from "../common/spore.js";

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

  const rgbppSignedCkbTxWithCobuild = await insertSporeCreationWitness(
    rgbppSignedCkbTx,
    rgbppClusterCell,
    ckbClient
  );

  // because of not being able to use cluster mode
  rgbppSignedCkbTxWithCobuild.cellDeps.push(
    ccc.CellDep.from({
      outPoint: rgbppClusterCell.outPoint,
      depType: "code",
    })
  );

  await rgbppSignedCkbTxWithCobuild.completeFeeBy(ckbSigner);
  logger.logCkbTx("ckbFinalTxToSign", rgbppSignedCkbTx);

  const ckbFinalTx = await ckbSigner.signTransaction(
    rgbppSignedCkbTxWithCobuild
  );
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


btcTxId: 366aa063338d2857adab368216e49c86ec86c1602a64b220bebf768a68a005c6
ckbTxId: 0xe73adff53935c506c0b3e94e1c13405f28657ea0727c3687a92186b222752baa
*/
