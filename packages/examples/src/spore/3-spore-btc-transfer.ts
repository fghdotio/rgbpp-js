import { spore } from "@ckb-ccc/shell";

import { ckbClient, ckbSigner, initializeRgbppEnv } from "../common/env.js";

import { RgbppTxLogger } from "../common/logger.js";

async function transferSpore({
  btcAddress,
  sporeTypeArgs,
}: {
  btcAddress: string;
  sporeTypeArgs: string;
}) {
  const {
    rgbppBtcWallet,
    rgbppXudtLikeClient,
    utxoBasedAccountAddress,
    ckbRgbppUnlockSinger,
  } = initializeRgbppEnv();

  const { tx: ckbPartialTx } = await spore.transferSpore({
    signer: ckbSigner,
    id: sporeTypeArgs,
    to: rgbppXudtLikeClient.buildPseudoRgbppLockScript(),
  });

  const { psbt, indexedCkbPartialTx } = await rgbppBtcWallet.buildPsbt({
    ckbPartialTx,
    ckbClient,
    rgbppXudtLikeClient,
    btcChangeAddress: utxoBasedAccountAddress,
    receiverBtcAddresses: [btcAddress],
    feeRate: 28,
  });
  logger.logCkbTx("indexedCkbPartialTx", indexedCkbPartialTx);

  const btcTxId = await rgbppBtcWallet.signAndSendTx(psbt);
  logger.add("btcTxId", btcTxId, true);

  const ckbPartialTxInjected = await rgbppXudtLikeClient.injectTxIdToRgbppCkbTx(
    indexedCkbPartialTx,
    btcTxId
  );
  const rgbppSignedCkbTx =
    await ckbRgbppUnlockSinger.signTransaction(ckbPartialTxInjected);

  await rgbppSignedCkbTx.completeFeeBy(ckbSigner);
  logger.logCkbTx("ckbPartialTxWithFee", rgbppSignedCkbTx);

  const ckbFinalTx = await ckbSigner.signTransaction(rgbppSignedCkbTx);
  logger.logCkbTx("ckbFinalTx", ckbFinalTx);
  const txHash = await ckbSigner.client.sendTransaction(ckbFinalTx);
  await ckbRgbppUnlockSinger.client.waitTransaction(txHash);
  logger.add("ckbTxId", txHash, true);
}

const logger = new RgbppTxLogger({ opType: "spore-transfer" });

transferSpore({
  btcAddress: "tb1qe8xc5ay5sdh0r58v0xfxrtss47kxveyzncs5ja",
  sporeTypeArgs:
    "0xa46af1dda123cbd503edbcc42dc67fdf6fed533379b73da4a3dc6665a5572f1c",
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


https://mempool.space/testnet/tx/459d62a172ef5d311354c1f544599396cb4291c36e5bacbe6a08b301d3015f72
https://testnet.explorer.nervos.org/transaction/0x659fb26595019caa3e1cd001a803707c29dfe4601ed0b5571f34e7cbc856aca0
*/
