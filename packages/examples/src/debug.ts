import {
  ckbClient,
  ckbRgbppSigner,
  ckbSigner,
  rgbppXudtLikeClient,
} from "./env.js";
import { RgbppTxLogger } from "./logger.js";
import { pollForSpvProof } from "./utils.js";

const debug = async (fileName: string) => {
  const logger = RgbppTxLogger.createFromLogFile(fileName);
  const ckbPartialTxRecovered = logger.parseCkbTxFromLogFile(true);

  const rawBtcTxHex = logger.getLogValue("rawBtcTxHex", true)!;
  const btcTxId = logger.getLogValue("btcTxId", true)!;

  const proof = await pollForSpvProof(btcTxId, 5);
  const ckbTxWithRgbppUnlockParams = await ckbRgbppSigner.setRgbppUnlockParams({
    spvProof: proof!,
    txId: btcTxId,
    rawTxHex: rawBtcTxHex,
    ckbPartialTx: ckbPartialTxRecovered,
    rgbppLockScriptTemplate: rgbppXudtLikeClient.rgbppLockScriptTemplate(),
    btcTimeLockScriptTemplate: rgbppXudtLikeClient.btcTimeLockScriptTemplate(),
  });
  const rgbppSignedCkbTx = await ckbRgbppSigner.signTransaction(
    ckbTxWithRgbppUnlockParams
  );

  await rgbppSignedCkbTx.completeFeeBy(ckbSigner);
  const ckbFinalTx = await ckbSigner.signTransaction(rgbppSignedCkbTx);
  const txHash = await ckbSigner.client.sendTransaction(ckbFinalTx);
  await ckbClient.waitTransaction(txHash);
  console.log(`CKB txHash: ${txHash}`);
};

debug("issuance-1738705736417-logs.json");

/* 
pnpm tsx packages/examples/src/debug.ts
*/
