import { ccc } from "@ckb-ccc/core";

import { inspect } from "util";
import { writeFileSync, readFileSync } from "fs";

import { UtxoSeal } from "@rgbpp-js/core";
import { BtcAssetsApiError } from "@rgbpp-js/bitcoin";

import {
  ckbClient,
  ckbSigner,
  rgbppClient,
  utxoBasedAccountAddress,
} from "./env.js";

const xudtToken = {
  name: "Standard xUDT",
  symbol: "stdXUDT",
  decimal: 8,
};
const issuanceAmount = 2100_0000n;

const issueXudt = async (utxoSeal: UtxoSeal) => {
  const ckbPartialTxBytesRead = readFileSync(
    `/root/ckb/rgbpp-js/ckbPartialTxBytes-${1737187426188}.txt`
  );
  const ckbPartialTxRecovered = ccc.Transaction.fromBytes(
    ckbPartialTxBytesRead
  );
  console.log(
    "ckbPartialTxRecovered\n",
    inspect(ckbPartialTxRecovered, { depth: null, colors: true })
  );

  const rawTxHex =
    "02000000019e302a7322d974aaa6a37ab739895276d8784b1c13daa837c098442671e4aac10200000000ffffffff030000000000000000226a203e26e3348162b3b9af2ed274d50d21569eac992e0827e6c81e42d81cf0c4bdb52202000000000000160014959a091c56d23fe0bb8e535520973a7212ad74728055a70000000000160014959a091c56d23fe0bb8e535520973a7212ad747200000000";
  const txId =
    "d0e3586c5f7d818937f18b9b14b576f0dc1029d5a57cd299c157e37ad42998b1";

  const polling = setInterval(async () => {
    try {
      console.log("Waiting for tx and proof to be ready");

      const proof = await rgbppClient.getSpvProof(txId, 0);
      clearInterval(polling);

      const finalCkbTx = await rgbppClient.assembleFinalRgbppCkbTx(
        ckbPartialTxRecovered,
        txId,
        rawTxHex,
        proof!
      );
      await finalCkbTx.completeFeeBy(ckbSigner);
      const txHash = await ckbSigner.sendTransaction(finalCkbTx);
      await ckbClient.waitTransaction(txHash);
      console.log("xUDT issued, txHash: ", txHash);
    } catch (e) {
      if (!(e instanceof BtcAssetsApiError)) {
        console.error(e);
      }
    }
  }, 3.4 * 1000);
};

issueXudt({
  txId: "c1aae471264498c037a8da131c4b78d876528939b77aa3a6aa74d922732a309e",
  index: 2,
});

/* 
pnpm tsx packages/examples/src/debug.ts

rawTxHex
 02000000019e302a7322d974aaa6a37ab739895276d8784b1c13daa837c098442671e4aac10200000000ffffffff030000000000000000226a203e26e3348162b3b9af2ed274d50d21569eac992e0827e6c81e42d81cf0c4bdb52202000000000000160014959a091c56d23fe0bb8e535520973a7212ad74728055a70000000000160014959a091c56d23fe0bb8e535520973a7212ad747200000000
txId:  d0e3586c5f7d818937f18b9b14b576f0dc1029d5a57cd299c157e37ad42998b1
*/
