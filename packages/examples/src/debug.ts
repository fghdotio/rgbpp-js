import {
  ckbClient,
  ckbSigner,
  rgbppXudtLikeClient,
  createCkbRgbppUnlockSinger,
} from "./env.js";
import { RgbppTxLogger } from "./logger.js";

const debug = async (fileName: string) => {
  const logger = RgbppTxLogger.createFromLogFile(fileName);
  const ckbPartialTxRecovered = logger.getCkbTxFromLogFile(true);

  const rawBtcTxHex = logger.getLogValue("rawBtcTxHex", true) as string;
  const btcTxId = logger.getLogValue("btcTxId", true) as string;

  const ckbPartialTxInjected = await rgbppXudtLikeClient.injectTxIdToRgbppCkbTx(
    ckbPartialTxRecovered,
    btcTxId
  );

  const ckbRgbppUnlockSinger = createCkbRgbppUnlockSinger(rawBtcTxHex);

  await ckbPartialTxInjected.completeFeeBy(ckbRgbppUnlockSinger.feeSigner);
  const ckbFinalTx =
    await ckbRgbppUnlockSinger.signTransaction(ckbPartialTxInjected);

  const txHash = await ckbSigner.client.sendTransaction(ckbFinalTx);
  await ckbClient.waitTransaction(txHash);
  console.log(`CKB txHash: ${txHash}`);
};

debug("issuance-1739901307259-logs.json");

/* 
pnpm tsx packages/examples/src/debug.ts
*/
