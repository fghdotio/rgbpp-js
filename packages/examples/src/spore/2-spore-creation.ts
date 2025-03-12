import { ccc, spore } from "@ckb-ccc/shell";

import { RawSporeData } from "@spore-sdk/core";

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
import { collectRgbppCells } from "../common/utils.js";
import { RgbppTxLogger } from "../common/logger.js";
import { generateSporeCreateCoBuild } from "../common/spore.js";

async function createSpore({
  utxoSeal,
  receiverInfo,
}: {
  utxoSeal: UtxoSeal;
  receiverInfo: {
    btcAddress: string;
    rawSporeData: RawSporeData;
  };
}) {
  const clusterTypeScriptInfo = spore.getClusterScriptInfo(ckbClient);

  const rgbppCells = await collectRgbppCells(
    [utxoSeal],
    ccc.Script.from({
      codeHash: clusterTypeScriptInfo.codeHash,
      hashType: clusterTypeScriptInfo.hashType,
      args: receiverInfo.rawSporeData.clusterId!,
    })
  );
  // * assume a 1 to 1 relationship between utxoSeal and rgbppCell
  const rgbppClusterCell = rgbppCells[0];

  const tx = ccc.Transaction.default();

  // ? manually add specified inputs
  const cellInput = ccc.CellInput.from({
    previousOutput: rgbppClusterCell.outPoint,
  });
  cellInput.completeExtraInfos(ckbClient);
  tx.inputs.push(cellInput);

  // add new cluster cell as output since current cluster utxo seal will be consumed
  tx.addOutput(
    {
      ...rgbppClusterCell.cellOutput,
      lock: rgbppXudtLikeClient.buildRgbppLockScript({
        txId: TX_ID_PLACEHOLDER,
        index: 1, // 0 is for OP_RETURN
      }),
    },
    rgbppClusterCell.outputData
  );

  // ? API for creating multiple spores
  const { tx: ckbPartialTx, id } = await spore.createSpore({
    signer: ckbSigner,
    data: receiverInfo.rawSporeData,
    to: rgbppXudtLikeClient.buildRgbppLockScript({
      txId: TX_ID_PLACEHOLDER,
      index: 2,
    }),
    // ? cannot use cluster mode here
    clusterMode: "skip",
    tx,
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
  utxoSeal: {
    txId: "f5417fdb977583bfec0262e9e41c0dda56f9bb84d7da71f0d7425c1b48587204",
    index: 1,
  },
  receiverInfo: {
    btcAddress: "tb1qjkdqj8zk6gl7pwuw2d2jp9e6wgf26arjl8pcys",
    rawSporeData: {
      contentType: "text/plain",
      content: ccc.bytesFrom("First Spore Live", "utf8"),
      // The cluster id is from 2-create-cluster.ts
      clusterId:
        "0x27564728f7f6127f8f37bd94f31e97a2eab147897abd446c6bbcf72d11ee2294",
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

0x27564728f7f6127f8f37bd94f31e97a2eab147897abd446c6bbcf72d11ee2294
https://testnet.explorer.nervos.org/transaction/0xa3920986f892f8ee7ab199c198a09ba4570a7f345a4ce86220760d03c5973332
https://testnet.explorer.nervos.org/transaction/0x2a268b875a880f2147a1f6192efced85e1b5c524b90b16840bc17b014525deb8
*/
