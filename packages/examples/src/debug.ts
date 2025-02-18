import {
  ckbClient,
  ckbSigner,
  rgbppXudtLikeClient,
  createCkbRgbppUnlockSinger,
} from "./env.js";
import { RgbppTxLogger } from "./logger.js";
import { pollForSpvProof } from "./utils.js";

const debug = async (fileName: string) => {
  const logger = RgbppTxLogger.createFromLogFile(fileName);
  const ckbPartialTxRecovered = logger.getCkbTxFromLogFile(true);

  const rawBtcTxHex = logger.getLogValue("rawBtcTxHex", true) as string;
  const btcTxId = logger.getLogValue("btcTxId", true) as string;

  const ckbPartialTxInjected = await rgbppXudtLikeClient.injectTxIdToRgbppCkbTx(
    ckbPartialTxRecovered,
    btcTxId
  );

  const ckbRgbppUnlockSinger = createCkbRgbppUnlockSinger(
    btcTxId,
    rawBtcTxHex,
    ckbPartialTxRecovered.inputs.length,
    ckbPartialTxRecovered.outputs.length
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

debug("issuance-1739844013398-logs.json");

/* 
pnpm tsx packages/examples/src/debug.ts
*/
