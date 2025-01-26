import { ccc } from "@ckb-ccc/core";

import { writeFileSync } from "fs";

import { UtxoSeal } from "@rgbpp-js/core";
import { BtcAssetsApiError } from "@rgbpp-js/bitcoin";

import {
  ckbClient,
  ckbSigner,
  rgbppBtcWallet,
  rgbppXudtLikeClient,
  utxoBasedAccountAddress,
  ckbRgbppSigner,
} from "./env.js";

const xudtToken = {
  name: "Standard xUDT",
  symbol: "stdXUDT",
  decimal: 8,
};
const issuanceAmount = 2100_0000n;

// TODO: prepare utxo seal
async function prepareRgbppCell(utxoSeal: UtxoSeal) {
  const rgbppLockScript = rgbppXudtLikeClient.buildRgbppLockScript(utxoSeal);

  const rgbppCellGen = await ckbClient.findCellsByLock(rgbppLockScript);
  const rgbppCells: ccc.Cell[] = [];
  for await (const cell of rgbppCellGen) {
    rgbppCells.push(cell);
  }

  // TODO: spend all related cells or just one
  if (rgbppCells.length !== 0) {
    console.log("Using existing RGB++ cell");
    return rgbppCells[0];
  }

  console.log("RGB++ cell not found, creating a new one");
  const tx = ccc.Transaction.default();

  // ? The capacity of the prepared cell appears to be irrelevant.
  // If additional capacity is required when used as an input in a transaction, it can always be supplemented in `completeInputsByCapacity`.
  tx.addOutput({
    lock: rgbppLockScript,
  });

  await tx.completeInputsByCapacity(ckbSigner);
  await tx.completeFeeBy(ckbSigner);
  const txHash = await ckbSigner.sendTransaction(tx);
  await ckbClient.waitTransaction(txHash);
  console.log("RGB++ cell created, txHash: ", txHash);

  const cell = await ckbClient.getCellLive({
    txHash,
    index: 0,
  });
  if (!cell) {
    throw new Error("Cell not found");
  }

  return cell;
}

async function issueXudt(utxoSeal: UtxoSeal) {
  const rgbppIssuanceCell = await prepareRgbppCell(utxoSeal);
  console.log("rgbppIssuanceCell", rgbppIssuanceCell);

  const ckbPartialTx = await rgbppXudtLikeClient.issuanceCkbPartialTx({
    token: xudtToken,
    amount: issuanceAmount,
    rgbppLiveCell: rgbppIssuanceCell,
  });
  const ckbPartialTxBytes = ckbPartialTx.toBytes();
  const timestamp = Date.now();
  writeFileSync(
    `issuance-ckbPartialTxBytes-${timestamp}.txt`,
    ckbPartialTxBytes
  );
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

  const polling = setInterval(async () => {
    try {
      console.log("Waiting for btc tx and proof to be ready");

      const proof = await rgbppBtcWallet.getRgbppSpvProof(btcTxId, 0);
      clearInterval(polling);

      const semiFinalCkbTx = await ckbRgbppSigner.setRgbppUnlockParams(
        ckbPartialTx,
        {
          spvProof: proof!,
          txId: btcTxId,
          rawTxHex: rawBtcTxHex,
          ckbPartialTx,
          rgbppLockScriptTemplate:
            rgbppXudtLikeClient.rgbppLockScriptTemplate(),
          btcTimeLockScriptTemplate:
            rgbppXudtLikeClient.btcTimeLockScriptTemplate(),
        }
      );
      // ? ckbRgbppSigner 是否要做普通 signer 的事
      const finalCkbTx = await ckbRgbppSigner.signTransaction(semiFinalCkbTx);

      await finalCkbTx.completeFeeBy(ckbSigner);
      const txHash = await ckbSigner.sendTransaction(finalCkbTx);
      await ckbClient.waitTransaction(txHash);
      console.log("xUDT issued, txHash: ", txHash);
    } catch (e) {
      if (!(e instanceof BtcAssetsApiError)) {
        console.error(e);
      }
    }
  }, 28 * 1000);
}

issueXudt({
  txId: "f97ce80d69f3c3db75abb191c824ceca6589b11151c7cabd3ed5615950b22d20",
  index: 2,
});

/* 
pnpm tsx packages/examples/src/issuance.ts
*/
