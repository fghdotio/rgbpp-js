import { ccc } from "@ckb-ccc/core";

import { inspect } from "util";
import { readFileSync } from "fs";

import { BtcAssetsApiError } from "@rgbpp-js/bitcoin";

import {
  ckbClient,
  ckbRgbppSigner,
  ckbSigner,
  rgbppXudtLikeClient,
  rgbppBtcWallet,
} from "./env.js";

const issueXudt = async () => {
  const ckbPartialTxBytesRead = readFileSync(
    `/root/ckb/rgbpp-js/issuance-ckbPartialTxBytes-${1737871127553}.txt`
  );
  const ckbPartialTxRecovered = ccc.Transaction.fromBytes(
    ckbPartialTxBytesRead
  );
  console.log(
    "issuance ckbPartialTx Recovered\n",
    inspect(ckbPartialTxRecovered, { depth: null, colors: true })
  );

  const rawBtcTxHex =
    "0200000001d1d69d799f9d66c2ce3c065b6376109592b2e6645b698a3fde67d841651f02960200000000ffffffff030000000000000000226a20445f46ac59a0bb38ff392392c0ca130f1609291ae4eca16578d14adb51806b6d2202000000000000160014959a091c56d23fe0bb8e535520973a7212ad7472e4d9c50000000000160014959a091c56d23fe0bb8e535520973a7212ad747200000000";
  const btcTxId =
    "f97ce80d69f3c3db75abb191c824ceca6589b11151c7cabd3ed5615950b22d20";

  // const polling = setInterval(async () => {
  try {
    console.log("Waiting for btc tx and proof to be ready");

    const proof = await rgbppBtcWallet.getRgbppSpvProof(btcTxId, 0);
    // clearInterval(polling);

    const semiFinalCkbTx = await ckbRgbppSigner.setRgbppUnlockParams(
      ckbPartialTxRecovered,
      {
        spvProof: proof!,
        txId: btcTxId,
        rawTxHex: rawBtcTxHex,
        ckbPartialTx: ckbPartialTxRecovered,
        rgbppLockScriptTemplate: rgbppXudtLikeClient.rgbppLockScriptTemplate(),
        btcTimeLockScriptTemplate:
          rgbppXudtLikeClient.btcTimeLockScriptTemplate(),
      }
    );
    // ? ckbRgbppSigner 是否要做普通 signer 的事
    const finalCkbTx = await ckbRgbppSigner.signTransaction(semiFinalCkbTx);

    await finalCkbTx.completeFeeBy(ckbSigner);
    const txHash = await ckbSigner.sendTransaction(finalCkbTx);
    await ckbClient.waitTransaction(txHash);
    console.log("xUDT issued, txHash: ", txHash);
  } catch (e) {
    if (!(e instanceof BtcAssetsApiError)) {
      console.error(e);
    }
  }
  // }, 3.4 * 1000);
};

issueXudt();

/* 
pnpm tsx packages/examples/src/debug.ts
*/
