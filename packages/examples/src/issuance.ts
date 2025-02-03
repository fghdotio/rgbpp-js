import { UtxoSeal } from "@rgbpp-js/core";

import {
  ckbClient,
  ckbSigner,
  rgbppBtcWallet,
  rgbppXudtLikeClient,
  utxoBasedAccountAddress,
  ckbRgbppSigner,
} from "./env.js";
import { pollForSpvProof, prepareRgbppCell, saveCkbTx } from "./utils.js";
import { issuanceAmount, xudtToken } from "./asset.js";

async function issueXudt(utxoSeal: UtxoSeal) {
  const rgbppIssuanceCells = await prepareRgbppCell(utxoSeal);
  console.log("rgbppIssuanceCells", rgbppIssuanceCells);

  const ckbPartialTx = await rgbppXudtLikeClient.issuanceCkbPartialTx({
    token: xudtToken,
    amount: issuanceAmount,
    rgbppLiveCells: rgbppIssuanceCells,
  });
  saveCkbTx(ckbPartialTx, "issuance");

  const commitment = rgbppXudtLikeClient.calculateCommitment(ckbPartialTx);

  const psbt = await rgbppBtcWallet.buildPsbt({
    ckbPartialTx,
    utxoSeals: [utxoSeal],
    from: utxoBasedAccountAddress,
    to: utxoBasedAccountAddress,
    commitment,
    rgbppLockScriptTemplate: rgbppXudtLikeClient.rgbppLockScriptTemplate(),
    btcTimeLockScriptTemplate: rgbppXudtLikeClient.btcTimeLockScriptTemplate(),
  });

  const signedBtcTx = await rgbppBtcWallet.signTx(psbt);
  const rawBtcTxHex = await rgbppBtcWallet.rawTxHex(signedBtcTx);
  console.log("rawBtcTxHex", rawBtcTxHex);
  const btcTxId = await rgbppBtcWallet.sendTx(signedBtcTx);
  console.log("btcTxId", btcTxId);

  const proof = await pollForSpvProof(btcTxId, 28);
  const semiFinalCkbTx = await ckbRgbppSigner.setRgbppUnlockParams({
    spvProof: proof!,
    txId: btcTxId,
    rawTxHex: rawBtcTxHex,
    ckbPartialTx,
    rgbppLockScriptTemplate: rgbppXudtLikeClient.rgbppLockScriptTemplate(),
    btcTimeLockScriptTemplate: rgbppXudtLikeClient.btcTimeLockScriptTemplate(),
  });

  // ? ckbRgbppSigner 是否要做普通 signer 的事
  const finalCkbTx = await ckbRgbppSigner.signTransaction(semiFinalCkbTx);

  await finalCkbTx.completeFeeBy(ckbSigner);
  const txHash = await ckbSigner.sendTransaction(finalCkbTx);
  await ckbClient.waitTransaction(txHash);
  console.log("xUDT issued, txHash: ", txHash);
}

issueXudt({
  txId: "5e380972d91ebd6a03c7c9f90ffaf3ddd17ec47c2b15d91c2ed487dae00725e8",
  index: 2,
})
  .then(() => {
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

/* 
pnpm tsx packages/examples/src/issuance.ts
*/
