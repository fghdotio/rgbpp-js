import { ccc } from "@ckb-ccc/core";

import { inspect } from "util";
import { writeFileSync, readFileSync } from "fs";

import { UtxoSeal } from "@rgbpp-js/core";
import { BtcAssetsApiError } from "@rgbpp-js/bitcoin";

import {
  ckbClient,
  ckbSigner,
  rgbppClient,
  utxoBasedAccountAddress,
} from "./env.js";

const xudtToken = {
  name: "Standard xUDT",
  symbol: "stdXUDT",
  decimal: 8,
};
const issuanceAmount = 2100_0000n;

async function prepareRgbppCell(utxoSeal: UtxoSeal) {
  const rgbppLockScript = rgbppClient.buildRgbppLockScript(utxoSeal);

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
  tx.addOutput({
    lock: rgbppLockScript,
    capacity: rgbppClient.calculateXudtIssuanceCellCapacity(xudtToken),
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
  const rgbppCell = await prepareRgbppCell(utxoSeal);

  const ckbPartialTx = await rgbppClient.xudtLikeIssuanceCkbPartialTx({
    token: xudtToken,
    amount: issuanceAmount,
    utxoSeal,
    rgbppLiveCell: rgbppCell,
  });
  // console.log(
  //   "ckbPartialTx\n",
  //   inspect(ckbPartialTx, { depth: null, colors: true })
  // );

  const ckbPartialTxBytes = ckbPartialTx.toBytes();
  const timestamp = Date.now();
  writeFileSync(`ckbPartialTxBytes-${timestamp}.txt`, ckbPartialTxBytes);

  // const ckbPartialTxBytesRead = readFileSync(
  //   `ckbPartialTxBytes-${timestamp}.txt`
  // );
  // const ckbPartialTxRecovered = ccc.Transaction.fromBytes(
  //   ckbPartialTxBytesRead
  // );
  // console.log(
  //   "ckbPartialTxRecovered\n",
  //   inspect(ckbPartialTxRecovered, { depth: null, colors: true })
  // );

  const commitment = rgbppClient.calculateCommitment(ckbPartialTx);

  // TODO: return a btc.Psbt
  const { inputs, outputs } = await rgbppClient.buildUtxoLikeInputsOutputs({
    ckbPartialTx,
    utxoSeal,
    from: utxoBasedAccountAddress,
    to: utxoBasedAccountAddress,
    commitment,
  });

  // TODO: 拆分 rgbpp.build (complete fee) and btcWallet.sign
  const { txHex, rawTxHex } = rgbppClient.buildAndSignUtxoLikeTx(
    inputs,
    outputs
  );
  console.log("rawTxHex\n", rawTxHex);
  const txId = await rgbppClient.sendUtxoLikeTx(txHex);
  console.log("txId: ", txId);

  const polling = setInterval(async () => {
    try {
      console.log("Waiting for tx and proof to be ready");

      const proof = await rgbppClient.getSpvProof(txId, 0);
      clearInterval(polling);

      const finalCkbTx = await rgbppClient.assembleFinalRgbppCkbTx(
        ckbPartialTx,
        txId,
        rawTxHex,
        proof!
      );
      await finalCkbTx.completeFeeBy(ckbSigner);
      const txHash = await ckbSigner.sendTransaction(finalCkbTx);
      await ckbClient.waitTransaction(txHash);
      console.log("xUDT issued, txHash: ", txHash);
    } catch (e) {
      if (!(e instanceof BtcAssetsApiError)) {
        console.error(e);
      }
    }
  }, 34 * 1000);
}

issueXudt({
  txId: "d0e3586c5f7d818937f18b9b14b576f0dc1029d5a57cd299c157e37ad42998b1",
  index: 2,
});

/* 
pnpm tsx packages/examples/src/index.ts

rawTxHex
 02000000019e302a7322d974aaa6a37ab739895276d8784b1c13daa837c098442671e4aac10200000000ffffffff030000000000000000226a203e26e3348162b3b9af2ed274d50d21569eac992e0827e6c81e42d81cf0c4bdb52202000000000000160014959a091c56d23fe0bb8e535520973a7212ad74728055a70000000000160014959a091c56d23fe0bb8e535520973a7212ad747200000000
txId:  d0e3586c5f7d818937f18b9b14b576f0dc1029d5a57cd299c157e37ad42998b1
*/
