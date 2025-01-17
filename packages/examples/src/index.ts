import { ccc } from "@ckb-ccc/core";

import { UtxoSeal } from "@rgbpp-js/core";

import { ckbClient, ckbSigner, rgbppClient } from "./env.js";

const xudtToken = {
  name: "Standard xUDT",
  symbol: "stdXUDT",
  decimal: 8,
};

const prepareRgbppCell = async (utxoSeal: UtxoSeal) => {
  const rgbppLockScript = rgbppClient.buildRgbppLockScript(utxoSeal);

  const rgbppCellGen = await ckbClient.findCellsByLock(rgbppLockScript);
  const rgbppCells: ccc.Cell[] = [];
  for await (const cell of rgbppCellGen) {
    rgbppCells.push(cell);
  }
  let rgbppCell: ccc.Cell;
  if (rgbppCells.length === 0) {
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
    rgbppCell = cell;
  } else {
    console.log("Using existing RGB++ cell");
    rgbppCell = rgbppCells[0];
  }

  return rgbppCell;
};

const issueXudt = async (utxoSeal: UtxoSeal) => {
  const rgbppCell = await prepareRgbppCell(utxoSeal);

  const partialTx = await rgbppClient.xudtLikeIssuanceCkbPartialTx({
    token: xudtToken,
    amount: 2100_0000n,
    utxoSeal,
    rgbppLiveCell: rgbppCell,
  });
  const commitment = rgbppClient.calculateCommitment(partialTx);
};

issueXudt({
  txId: "116ff4fed254357d5d321d8c9a6846ecf3b18b48f06a566c58278df58a38429e",
  index: 0,
})
  .then(() => {
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

/* 
pnpm tsx packages/examples/src/index.ts
*/
