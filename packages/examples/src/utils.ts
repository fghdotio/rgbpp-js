import { ccc } from "@ckb-ccc/core";

import { mkdirSync, existsSync, writeFileSync, readFileSync } from "fs";
import { inspect } from "util";

import { UtxoSeal } from "@rgbpp-js/core";
import { BtcAssetsApiError } from "@rgbpp-js/bitcoin";

import {
  ckbClient,
  ckbSigner,
  rgbppBtcWallet,
  rgbppXudtLikeClient,
} from "./env.js";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { json } from "stream/consumers";

// TODO: prepare utxo seal
export async function prepareRgbppCell(
  utxoSeal: UtxoSeal
): Promise<ccc.Cell[]> {
  const rgbppLockScript = rgbppXudtLikeClient.buildRgbppLockScript(utxoSeal);

  const rgbppCellGen = await ckbClient.findCellsByLock(rgbppLockScript);
  const rgbppCells: ccc.Cell[] = [];
  for await (const cell of rgbppCellGen) {
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
  await ckbClient.waitTransaction(txHash);
  console.log("RGB++ cell created, txHash: ", txHash);

  const cell = await ckbClient.getCellLive({
    txHash,
    index: 0,
  });
  if (!cell) {
    throw new Error("Cell not found");
  }

  return [cell];
}

// * using ccc.Transaction.toBytes() would lose optional fields of CellInput
export function saveCkbTx(
  ckbTx: ccc.Transaction,
  opType: string,
  dir = dirname(fileURLToPath(import.meta.url)) + "/tmp"
) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const timestamp = Date.now();
  const fileName = `${opType}-ckbTx-${timestamp}`;
  const filePath = join(dir, fileName);

  const ckbTxJson = JSON.stringify(
    ckbTx,
    (_, value) => (typeof value === "bigint" ? ccc.numToHex(value) : value),
    2
  );

  writeFileSync(filePath, ckbTxJson);
}

export function readCkbTx(
  fileName: string,
  doPrint = false,
  dir = dirname(fileURLToPath(import.meta.url)) + "/tmp"
): ccc.Transaction {
  const filePath = join(dir, fileName);
  // read from file and JSON.parse
  const ckbTxJson = readFileSync(filePath, "utf8");
  const tx = ccc.Transaction.from(JSON.parse(ckbTxJson));

  if (doPrint) {
    console.log(inspect(tx, { depth: null, colors: true }));
  }

  return tx;
}

export async function pollForSpvProof(
  btcTxId: string,
  intervalInSeconds: number
): Promise<any> {
  return new Promise((resolve, reject) => {
    const polling = setInterval(async () => {
      try {
        console.log("Waiting for btc tx and proof to be ready");
        const proof = await rgbppBtcWallet.getRgbppSpvProof(btcTxId, 0);

        if (proof) {
          clearInterval(polling);
          resolve(proof);
        }
      } catch (e) {
        if (!(e instanceof BtcAssetsApiError)) {
          clearInterval(polling);
          reject(e);
        }
      }
    }, intervalInSeconds * 1000);
  });
}
