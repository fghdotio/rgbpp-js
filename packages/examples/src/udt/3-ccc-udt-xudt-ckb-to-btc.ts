import { ccc } from "@ckb-ccc/shell";

import { PredefinedScriptName, UtxoSeal } from "@rgbpp-js/core";

import {
  ckbSigner,
  ckbClient,
  rgbppXudtLikeClient,
  rgbppBtcWallet,
} from "../common/env.js";

import { RgbppTxLogger } from "../common/logger.js";

async function ckbUdtToBtc({
  utxoSeal,
  udtId,
  amount,
}: {
  utxoSeal?: UtxoSeal;
  udtId: string;
  amount: bigint;
}) {
  if (!utxoSeal) {
    utxoSeal = await rgbppBtcWallet.prepareUtxoSeal(28);
  }

  const xudtTypeScript = await ccc.Script.fromKnownScript(
    ckbClient,
    ccc.KnownScript.XUdt,
    udtId
  );

  const udt = new ccc.udt.Udt(
    rgbppXudtLikeClient.getRgbppScriptsDetail()[
      PredefinedScriptName.Xudt
    ].cellDep.outPoint,
    xudtTypeScript
  );

  let { res: tx } = await udt.transfer(ckbSigner as unknown as ccc.Signer, [
    {
      to: rgbppXudtLikeClient.buildRgbppLockScript(utxoSeal),
      amount: ccc.fixedPointFrom(amount),
    },
  ]);

  const txWithInputs = await udt.completeBy(tx, ckbSigner);
  await txWithInputs.completeFeeBy(ckbSigner);
  const signedTx = await ckbSigner.signTransaction(txWithInputs);
  const txHash = await ckbSigner.client.sendTransaction(signedTx);
  await ckbSigner.client.waitTransaction(txHash);
  logger.add("ckbTxId", txHash, true);
}

const logger = new RgbppTxLogger({ opType: "ccc-udt-xudt-ckb-to-btc" });

ckbUdtToBtc({
  // utxoSeal: {
  //   txId: "499559be0d125f1387c11844919961fcdbd37c44bdaacab987754fb25d367c8f",
  //   index: 0,
  // },
  udtId: "0xe5f7d179bccb3715fa554a9cce027972549fec7cbe5a75bedef3418c9196e080",
  amount: ccc.fixedPointFrom(11),
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
pnpm tsx packages/examples/src/udt/3-ccc-udt-xudt-ckb-to-btc.ts
*/
