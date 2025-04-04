import { ccc } from "@ckb-ccc/shell";

import { UtxoSeal, ScriptInfo } from "@rgbpp-js/core";

import { ckbClient, ckbSigner, initializeRgbppEnv } from "../common/env.js";
import { prepareRgbppCells } from "../common/utils.js";
import { issuanceAmount, udtToken, testnetSudtInfo } from "../common/assets.js";
import { RgbppTxLogger } from "../common/logger.js";

async function issueUdt({
  udtScriptInfo,
  utxoSeal,
}: {
  udtScriptInfo: ScriptInfo;
  utxoSeal?: UtxoSeal;
}) {
  const {
    rgbppBtcWallet,
    rgbppUdtClient,
    utxoBasedAccountAddress,
    ckbRgbppUnlockSinger,
  } = initializeRgbppEnv();

  if (!utxoSeal) {
    utxoSeal = await rgbppBtcWallet.prepareUtxoSeal(10);
  }

  const rgbppIssuanceCells = await prepareRgbppCells(utxoSeal, rgbppUdtClient);

  const ckbPartialTx = await rgbppUdtClient.issuanceCkbPartialTx({
    token: udtToken,
    amount: issuanceAmount,
    rgbppLiveCells: rgbppIssuanceCells,
    udtScriptInfo,
  });
  console.log(
    "Unique ID of issued udt token",
    ckbPartialTx.outputs[0].type!.args
  );

  const { psbt, indexedCkbPartialTx } = await rgbppBtcWallet.buildPsbt({
    ckbPartialTx,
    ckbClient,
    rgbppUdtClient,
    btcChangeAddress: utxoBasedAccountAddress,
    receiverBtcAddresses: [utxoBasedAccountAddress],
    feeRate: 28,
  });
  logger.logCkbTx("indexedCkbPartialTx", indexedCkbPartialTx);

  const btcTxId = await rgbppBtcWallet.signAndSendTx(psbt);
  logger.add("btcTxId", btcTxId, true);

  const ckbPartialTxInjected = await rgbppUdtClient.injectTxIdToRgbppCkbTx(
    indexedCkbPartialTx,
    btcTxId
  );
  const rgbppSignedCkbTx =
    await ckbRgbppUnlockSinger.signTransaction(ckbPartialTxInjected);

  // > Commitment must cover all Inputs and Outputs where Type is not null;
  // https://github.com/utxostack/RGBPlusPlus-design/blob/main/docs/lockscript-design-prd-en.md#requirements-and-limitations-on-isomorphic-binding
  // https://github.com/fghdotio/rgbpp/blob/main/contracts/rgbpp-lock/src/main.rs#L197-L200
  await rgbppSignedCkbTx.completeFeeBy(ckbSigner);
  const ckbFinalTx = await ckbSigner.signTransaction(rgbppSignedCkbTx);
  const txHash = await ckbSigner.client.sendTransaction(ckbFinalTx);
  await ckbRgbppUnlockSinger.client.waitTransaction(txHash);
  logger.add("ckbTxId", txHash, true);
}

const logger = new RgbppTxLogger({ opType: "udt-issuance" });

issueUdt({
  udtScriptInfo: {
    name: ccc.KnownScript.XUdt,
    script: await ccc.Script.fromKnownScript(
      ckbClient,
      ccc.KnownScript.XUdt,
      ""
    ),
    cellDep: (await ckbClient.getKnownScript(ccc.KnownScript.XUdt)).cellDeps[0]
      .cellDep,
  },

  // udtScriptInfo: testnetSudtInfo,

  utxoSeal: {
    txId: "4a507c96e99f5459d2c6ca6bd217ee4e9d0d74d15f5a23e77d3c1d01d16f68c9",
    index: 1,
  },
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
pnpm tsx packages/examples/src/udt/1-rgbpp-udt-issuance.ts


xUDT:
Unique ID of issued udt token 0x868c505051f06bb41646bd1b442dbed8035d91abd9ac7acc4bda3bab267e6ac7
btcTxId: 176780899da293f23590f0ddfbf0f8a483b4fdd9938b7a96b9c87b9db9cd2edc
ckbTxId: 0x339509cf2b50c8315324152db9cb239c4b206acd4f7087014f31fd2c61d235f2


sUDT:
Unique ID of issued udt token 0x07bccc105cdd747019a843d8bd0b5424efc33beb20b4f0db0f925e97f30c465f
btcTxId: 5b92a0997ec6b516fa53b1c7521541cd83e0d9697ac40a84dde7b9a8dda5fef7
ckbTxId: 0x9b348bcd77e91219e0d8d69bd06d0e524e58bf261958e41817f1a09d5bae029a
*/
