import { ccc } from "@ckb-ccc/core";

import {
  UtxoSeal,
  leToU128,
  trimHexPrefix,
  u128ToLe,
  ScriptName,
} from "@rgbpp-js/core";

import { RgbppTxLogger } from "../common/logger.js";
import { xudtToken } from "../common/assets.js";
import { collectXudtCells } from "../common/utils.js";
import {
  rgbppXudtLikeClient,
  ckbAddress,
  ckbClient,
  ckbSigner,
} from "../common/env.js";

async function leapFromCkbToBtc({
  utxoSeal,
  xudtTokenId,
  amount,
}: {
  utxoSeal: UtxoSeal;
  xudtTokenId: string;
  amount: bigint;
}) {
  const { xudtCells, xudtLikeTypeScript } = await collectXudtCells(
    ckbAddress,
    xudtTokenId
  );

  const ownedAmount = xudtCells.reduce((acc: bigint, cell: ccc.Cell) => {
    return acc + leToU128(trimHexPrefix(cell.outputData).slice(0, 32));
  }, BigInt(0));
  if (ownedAmount < amount) {
    throw new Error("Not enough xUDT-like token to leap from CKB to BTC");
  }

  const tx = ccc.Transaction.default();
  xudtCells.forEach((cell) => {
    const cellInput = ccc.CellInput.from({
      previousOutput: cell.outPoint,
      since: 0,
    });
    tx.inputs.push(cellInput);
  });

  tx.addOutput(
    {
      lock: rgbppXudtLikeClient.buildRgbppLockScript(utxoSeal),
      type: xudtLikeTypeScript,
    },
    u128ToLe(amount)
  );

  if (ownedAmount > amount) {
    tx.addOutput(
      {
        lock: (await ccc.Address.fromString(ckbAddress, ckbClient)).script,
        type: xudtLikeTypeScript,
      },
      u128ToLe(ownedAmount - amount)
    );
  }

  tx.cellDeps.push(
    rgbppXudtLikeClient.getRgbppScriptsDetail()[ScriptName.XudtLike].cellDep
  );

  await tx.completeFeeBy(ckbSigner);
  const signedTx = await ckbSigner.signTransaction(tx);

  const txHash = await ckbSigner.client.sendTransaction(signedTx);
  await ckbSigner.client.waitTransaction(txHash);
  logger.add("ckbTxId", txHash, true);
}

const logger = new RgbppTxLogger({ opType: "ckb-to-btc" });

leapFromCkbToBtc({
  utxoSeal: {
    txId: "1119178bd233bea78a61b05b52b6e30fd074fca9c1d8ca584a74ea1ec6a51465",
    index: 4,
  },
  xudtTokenId:
    "0xcafc80445e16b49e9b849be4912f93970f80956d62f01fdc0238f1f694bea996",
  amount: BigInt(100) * BigInt(10 ** xudtToken.decimal),
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
pnpm tsx packages/examples/src/xUDT/5-ckb-to-btc.ts
*/
