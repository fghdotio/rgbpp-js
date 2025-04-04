import { ccc, spore } from "@ckb-ccc/shell";

import { UtxoSeal } from "@rgbpp-js/core";

import { ckbClient, ckbSigner, initializeRgbppEnv } from "../common/env.js";
import { prepareRgbppCells } from "../common/utils.js";
import { clusterData } from "../common/assets.js";
import { RgbppTxLogger } from "../common/logger.js";

async function createSporeCluster(utxoSeal?: UtxoSeal) {
  const {
    rgbppBtcWallet,
    rgbppUdtClient,
    utxoBasedAccountAddress,
    ckbRgbppUnlockSinger,
  } = initializeRgbppEnv();

  if (!utxoSeal) {
    utxoSeal = await rgbppBtcWallet.prepareUtxoSeal(28);
  }

  const rgbppCells = await prepareRgbppCells(utxoSeal, rgbppUdtClient);
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
    to: rgbppUdtClient.buildPseudoRgbppLockScript(),
    tx,
  });

  logger.add("cluster id", id, true);

  const { psbt, indexedCkbPartialTx } = await rgbppBtcWallet.buildPsbt({
    ckbPartialTx,
    ckbClient,
    rgbppUdtClient,
    btcChangeAddress: utxoBasedAccountAddress,
    receiverBtcAddresses: [utxoBasedAccountAddress],
    feeRate: 28,
  });
  logger.logCkbTx("indexedCkbPartialTx", indexedCkbPartialTx);

  const btcTxId = await rgbppBtcWallet.signAndSendTx(psbt);
  logger.add("btcTxId", btcTxId, true);

  const ckbPartialTxInjected = await rgbppUdtClient.injectTxIdToRgbppCkbTx(
    indexedCkbPartialTx,
    btcTxId
  );
  const rgbppSignedCkbTx =
    await ckbRgbppUnlockSinger.signTransaction(ckbPartialTxInjected);

  await rgbppSignedCkbTx.completeFeeBy(ckbSigner);
  const ckbFinalTx = await ckbSigner.signTransaction(rgbppSignedCkbTx);
  const txHash = await ckbSigner.client.sendTransaction(ckbFinalTx);
  await ckbRgbppUnlockSinger.client.waitTransaction(txHash);
  logger.add("ckbTxId", txHash, true);
}

const logger = new RgbppTxLogger({ opType: "cluster-creation" });

createSporeCluster({
  txId: "19206b17e037492244e573655de52b5c025c1e40259c2f176ef976704d7b5043",
  index: 2,
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


clusterId: 0x90b36a07945592686ad38ac0af5132785794cb9910702e4a2872183aba4b6ca0
btcTxId: 0a57071711f3d8dabed23227a31f00a2d7130108a2bec13bca36deeccd669755
ckbTxId: 0x9001d61481368ff9d5889949d0376fa1211e88c6993447907e30b73c03b36ea0


clusterId: 0x341b804c60f6e62d63b309ad4005e0da06cf786224f89ee061acba4849e0b04d
btcTxId: f9ab101251e59f776f6f9fe22ad075ccfb6dbabe9f1b6f0a4ff1ff2f9dc781c0
ckbTxId: 0xd4d1f24811ebf542ccd8a9d0fb08f2c51b69d91ef464f00f5e2a953bdb7951ca


clusterId: 0x4147d017d7a13ce731ac0a6dd33ed056b641e2a8b02d9a722ea4aa77f2c36cd8
btcTxId: 0f9f2ed86847642f475f0997fe4721c940497471dd9ae8b12b56e59c1f3a8857
ckbTxId: 0x00f56d7c7dcc65ef3d1e132c8ceb70e6b6defd48684887c9e0b270af005e8f56


clusterId: 0x9f57129a53e80349320f72395e1b72e64498518097956b1393c2a7b5ff4bd9ea
btcTxId: f4ce852afafc0727938a5b075f62b146cf1e00bb7899690e8f9c4a4da9348a1a
ckbTxId: 0x11d348698faff249ae5067a4d3a3e70d98a87c40dc1e6b283494619b5f58cf81


clusterId: 0x526bf88c3061548cc2656fd0702f9fb91d7164a01b9fb1422923c43015f66d44
btcTxId: a9fe267b8a944d9409ffac61965cb0c1afa41a56992b84a97aef104d30ef4e36
ckbTxId: 0x344bbdafb30bd3de5df8518b7b8e1e06e2e233fe66967b556be507311a2348c8
*/
