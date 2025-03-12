import { ccc } from "@ckb-ccc/shell";

import { inspect } from "util";

import {
  ckbClient,
  ckbSigner,
  rgbppXudtLikeClient,
  ckbRgbppUnlockSinger,
} from "./common/env.js";
import { RgbppTxLogger } from "./common/logger.js";
import { generateClusterCreateCoBuild } from "./common/spore.js";

const debug = async (fileName: string) => {
  const logger = RgbppTxLogger.createFromLogFile(fileName);

  const ckbPartialTxRecovered = logger.getCkbTxPartialFromLogFile(false);

  const btcTxId = logger.getLogValue("btcTxId", true) as string;

  const ckbPartialTxInjected = await rgbppXudtLikeClient.injectTxIdToRgbppCkbTx(
    ckbPartialTxRecovered,
    btcTxId
  );

  const rgbppSignedCkbTx =
    await ckbRgbppUnlockSinger.signTransaction(ckbPartialTxInjected);

  // rgbppSignedCkbTx.witnesses[rgbppSignedCkbTx.witnesses.length - 1] =
  //   generateClusterCreateCoBuild(
  //     rgbppSignedCkbTx.outputs[0],
  //     rgbppSignedCkbTx.outputsData[0]
  //   ) as ccc.Hex;
  // console.log(
  //   rgbppSignedCkbTx.witnesses[rgbppSignedCkbTx.witnesses.length - 1]
  // );

  // console.log(rgbppSignedCkbTx.witnesses);

  rgbppSignedCkbTx.witnesses.pop();
  await rgbppSignedCkbTx.completeFeeBy(ckbSigner, 2000);
  rgbppSignedCkbTx.witnesses.push(
    generateClusterCreateCoBuild(
      rgbppSignedCkbTx.outputs[0],
      rgbppSignedCkbTx.outputsData[0]
    ) as ccc.Hex
  );
  const ckbFinalTx = await ckbSigner.signTransaction(rgbppSignedCkbTx);
  const txHash = await ckbSigner.client.sendTransaction(ckbFinalTx);
  await ckbRgbppUnlockSinger.client.waitTransaction(txHash);
  logger.add("ckbTxId", txHash, true);
};

debug("cluster-creation-1741745372114-logs.json");

/* 
pnpm tsx packages/examples/src/debug.ts
*/
