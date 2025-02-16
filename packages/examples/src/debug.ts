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

  const proof = await pollForSpvProof(btcTxId, 5);
  const ckbRgbppUnlockSinger = createCkbRgbppUnlockSinger(rawBtcTxHex, proof);

  const rgbppSignedCkbTx =
    await ckbRgbppUnlockSinger.signTransaction(ckbPartialTxInjected);

  await rgbppSignedCkbTx.completeFeeBy(ckbSigner);
  const ckbFinalTx = await ckbSigner.signTransaction(rgbppSignedCkbTx);
  const txHash = await ckbSigner.client.sendTransaction(ckbFinalTx);
  await ckbClient.waitTransaction(txHash);
  console.log(`CKB txHash: ${txHash}`);
};

debug("issuance-1739664022580-logs.json");

/* 
pnpm tsx packages/examples/src/debug.ts
*/
