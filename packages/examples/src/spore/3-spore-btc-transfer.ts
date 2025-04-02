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
    // TODO: buildPseudoRgbppLockScript 不用 index 参数和 txid placeholder，在 build psbt 中推断
    to: rgbppXudtLikeClient.buildPseudoRgbppLockScript(),
  });

  // TODO: buildBtcRgbppOutputs 和计算 utxo seals 放到 buildPsbt 中
  const { psbt, indexedCkbPartialTx } = await rgbppBtcWallet.buildPsbt({
    ckbPartialTx,
    ckbClient,
    rgbppXudtLikeClient,
    btcChangeAddress: utxoBasedAccountAddress,
    receiverBtcAddresses: [btcAddress],
    feeRate: 28,
  });
  logger.logCkbTx("indexedCkbPartialTx", indexedCkbPartialTx);

  // TODO 合并 send tx （包含签名）
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
    "0x3b0a06b5b4cb5cf2f751af8748b8dd55ece6dc6d5523b22a29ba903f73ad3aa4",
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
