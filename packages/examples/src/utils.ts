import { ccc } from "@ckb-ccc/core";

import { UtxoSeal } from "@rgbpp-js/core";

import { ckbClient, ckbSigner, rgbppXudtLikeClient } from "./env.js";

export async function prepareIssuanceRgbppCells(
  utxoSeal: UtxoSeal
): Promise<ccc.Cell[]> {
  const rgbppLockScript = rgbppXudtLikeClient.buildRgbppLockScript(utxoSeal);

  const rgbppCellsGen = await ckbClient.findCellsByLock(rgbppLockScript);
  const rgbppCells: ccc.Cell[] = [];
  for await (const cell of rgbppCellsGen) {
    rgbppCells.push(cell);
  }

  if (rgbppCells.length !== 0) {
    console.log("Using existing RGB++ cell");
    return rgbppCells;
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
  // TODO: combine this waitTransaction with the second one
  await ckbClient.waitTransaction(txHash);
  console.log(`RGB++ cell created, txHash: ${txHash}`);

  const cell = await ckbClient.getCellLive({
    txHash,
    index: 0,
  });
  if (!cell) {
    throw new Error("Cell not found");
  }

  return [cell];
}

export async function collectRgbppCells(
  utxoSeals: UtxoSeal[],
  xudtTokenId: string
): Promise<{ rgbppLiveCells: ccc.Cell[]; xudtLikeTypeScript: ccc.Script }> {
  let rgbppLiveCells: ccc.Cell[] = [];
  const xudtLikeTypeScript = ccc.Script.from({
    ...rgbppXudtLikeClient.xudtLikeTypeScriptTemplate(),
    args: xudtTokenId,
  });

  await Promise.all(
    utxoSeals.map(async (utxoSeal) => {
      const rgbppLockScript =
        rgbppXudtLikeClient.buildRgbppLockScript(utxoSeal);
      const rgbppCellsGen = await ckbClient.findCellsByLock(
        rgbppLockScript,
        xudtLikeTypeScript
      );
      for await (const cell of rgbppCellsGen) {
        rgbppLiveCells.push(cell);
      }
    })
  );

  if (rgbppLiveCells.length === 0) {
    throw new Error("No rgbpp live cells found");
  }

  return { rgbppLiveCells, xudtLikeTypeScript };
}

export async function collectBtcTimeLockCells(
  btcTimeLockArgs: string
): Promise<ccc.Cell[]> {
  const btcTimeLockCellsGen = await ckbClient.findCellsByLock({
    ...rgbppXudtLikeClient.btcTimeLockScriptTemplate(),
    args: btcTimeLockArgs,
  });
  const btcTimeLockCells: ccc.Cell[] = [];
  for await (const cell of btcTimeLockCellsGen) {
    btcTimeLockCells.push(cell);
  }
  return btcTimeLockCells;
}

export async function collectXudtCells(
  ckbAddress: string,
  xudtTokenId: string
): Promise<{ xudtCells: ccc.Cell[]; xudtLikeTypeScript: ccc.Script }> {
  const lock = (await ccc.Address.fromString(ckbAddress, ckbClient)).script;
  const xudtLikeTypeScript = ccc.Script.from({
    ...rgbppXudtLikeClient.xudtLikeTypeScriptTemplate(),
    args: xudtTokenId,
  });
  const xudtCellsGen = await ckbClient.findCellsByLock(
    lock,
    xudtLikeTypeScript
  );
  const xudtCells: ccc.Cell[] = [];
  for await (const cell of xudtCellsGen) {
    xudtCells.push(cell);
  }
  return { xudtCells, xudtLikeTypeScript };
}
