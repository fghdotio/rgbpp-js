import { ccc } from "@ckb-ccc/core";

import { Rgbpp, UtxoSeal } from "@rgbpp-js/core";

import {
  utxoBasedWallet,
  utxoBasedNetwork,
  ckbClient,
  ckbSigner,
} from "./env.js";

const xudtToken = {
  name: "Standard xUDT",
  symbol: "stdXUDT",
  decimal: 8,
};

const issueXudt = async (utxoSeal: UtxoSeal) => {
  const rgbpp = new Rgbpp(utxoBasedNetwork.name, utxoBasedWallet);
  const rgbppLockScript = rgbpp.buildRgbppLockScript(utxoSeal);

  const rgbppCellGen = await ckbClient.findCellsByLock(rgbppLockScript);
  const rgbppCells: ccc.Cell[] = [];
  for await (const cell of rgbppCellGen) {
    rgbppCells.push(cell);
  }
  let rgbppCell: ccc.Cell;
  if (rgbppCells.length === 0) {
    const tx = ccc.Transaction.default();
    tx.addOutput({
      lock: rgbppLockScript,
      capacity: rgbpp.calculateXudtIssuanceCellCapacity(xudtToken),
    });
    await tx.completeInputsByCapacity(ckbSigner);
    await tx.completeFeeBy(ckbSigner);
    const txHash = await ckbSigner.sendTransaction(tx);
    await ckbClient.waitTransaction(txHash);
    console.log(txHash);

    const cell = await ckbClient.getCellLive({
      txHash,
      index: 0,
    });
    if (!cell) {
      throw new Error("Cell not found");
    }
    rgbppCell = cell;
  } else {
    rgbppCell = rgbppCells[0];
  }

  console.log(rgbppCell);
};

issueXudt({
  txId: "116ff4fed254357d5d321d8c9a6846ecf3b18b48f06a566c58278df58a38429e",
  index: 0,
});

/* 
pnpm tsx packages/examples/src/index.ts
*/
