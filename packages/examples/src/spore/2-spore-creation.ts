import { ccc, spore } from "@ckb-ccc/shell";

import { RawSporeData } from "@spore-sdk/core";

import { ckbClient, ckbSigner, initializeRgbppEnv } from "../common/env.js";

import { RgbppTxLogger } from "../common/logger.js";
import { inspect } from "util";

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

  const { tx: transferClusterTx } = await spore.transferSporeCluster({
    signer: ckbSigner,
    id: receiverInfo.rawSporeData.clusterId!,
    to: rgbppXudtLikeClient.buildPseudoRgbppLockScript(), // new cluster output
  });

  // ? API for creating multiple spores
  const { tx: ckbPartialTx, id } = await spore.createSpore({
    signer: ckbSigner,
    data: receiverInfo.rawSporeData,
    to: rgbppXudtLikeClient.buildPseudoRgbppLockScript(),
    // cannot use cluster mode here as cluster's lock needs to be updated
    clusterMode: "skip",
    tx: transferClusterTx,
  });

  logger.add("spore id", id, true);

  console.log(inspect(ckbPartialTx.witnesses, { depth: null, colors: true }));

  const { psbt, indexedCkbPartialTx } = await rgbppBtcWallet.buildPsbt({
    ckbPartialTx,
    ckbClient,
    rgbppXudtLikeClient,
    btcChangeAddress: utxoBasedAccountAddress,
    receiverBtcAddresses: [utxoBasedAccountAddress],
    feeRate: 28,
  });
  logger.logCkbTx("indexedCkbPartialTx", indexedCkbPartialTx);

  const signedBtcTx = await rgbppBtcWallet.signTx(psbt);
  const rawBtcTxHex = rgbppBtcWallet.rawTxHex(signedBtcTx);
  logger.add("rawBtcTxHex", rawBtcTxHex);

  const btcTxId = await rgbppBtcWallet.sendTx(signedBtcTx);
  logger.add("btcTxId", btcTxId, true);

  const ckbPartialTxInjected = await rgbppXudtLikeClient.injectTxIdToRgbppCkbTx(
    indexedCkbPartialTx,
    btcTxId
  );
  const rgbppSignedCkbTx =
    await ckbRgbppUnlockSinger.signTransaction(ckbPartialTxInjected);

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
    btcAddress: "tb1qe8xc5ay5sdh0r58v0xfxrtss47kxveyzncs5ja",
    rawSporeData: {
      contentType: "text/plain",
      content: ccc.bytesFrom("First Spore Live", "utf8"),
      clusterId:
        "0x09d035e0a576136ba24ed128cbd97aec61554c8390fbee35e74e3836deb0a34f",
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


btcTxId: f0145fa3e511e00ea7aa16dcf67b3693b453ec5791db12efde04138e082834ae
ckbTxId: 0x79acde60a0ccad9522587877579cf204c7190e765dec44481322609dd5872419
*/
