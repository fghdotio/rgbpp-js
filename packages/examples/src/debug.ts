import {
  ckbClient,
  ckbSigner,
  rgbppXudtLikeClient,
  ckbRgbppUnlockSinger,
} from "./common/env.js";
import { RgbppTxLogger } from "./common/logger.js";

const debug = async (fileName: string) => {
  const logger = RgbppTxLogger.createFromLogFile(fileName);
  const ckbPartialTxRecovered = logger.getCkbTxPartialFromLogFile(true);

  const btcTxId = logger.getLogValue("btcTxId", true) as string;

  const ckbPartialTxInjected = await rgbppXudtLikeClient.injectTxIdToRgbppCkbTx(
    ckbPartialTxRecovered,
    btcTxId
  );

  await ckbPartialTxInjected.completeFeeBy(
    ckbRgbppUnlockSinger.feeSigner,
    5000
  );
  const ckbFinalTx =
    await ckbRgbppUnlockSinger.signTransaction(ckbPartialTxInjected);

  const txHash = await ckbSigner.client.sendTransaction(ckbFinalTx);
  await ckbClient.waitTransaction(txHash);
  console.log(`CKB txHash: ${txHash}`);
};

debug("issuance-1740121017115-logs.json");

/* 
pnpm tsx packages/examples/src/debug.ts
*/
