import { ccc } from "@ckb-ccc/shell";

import {
  buildBtcRgbppOutputs,
  TX_ID_PLACEHOLDER,
  parseUtxoSealFromScriptArgs,
  UtxoSeal,
  XUDT_LIKE_LEAP_FROM_BTC_OUTPUT_INDEX,
} from "@rgbpp-js/core";

import {
  ckbSigner,
  ckbClient,
  ckbRgbppUnlockSinger,
  rgbppXudtLikeClient,
  utxoBasedAccountAddress,
  rgbppBtcWallet,
  ckbAddress,
} from "../common/env.js";

import { RgbppTxLogger } from "../common/logger.js";
import { collectRgbppCells } from "../common/utils.js";
import { testnetSudt, testnetSudtCellDep } from "../common/assets.js";

async function btcUdtToCkb({
  utxoSeals,
  udtId,
  receivers,
}: {
  utxoSeals?: UtxoSeal[];
  udtId: string;
  receivers: { address: string; amount: bigint }[];
}) {
  const sudtTypeScript = ccc.Script.from({
    ...testnetSudt,
    args: udtId,
  });

  const udt = new ccc.udt.Udt(testnetSudtCellDep.outPoint, sudtTypeScript);

  let { res: tx } = await udt.transfer(
    ckbSigner as unknown as ccc.Signer,
    await Promise.all(
      receivers.map(async (receiver) => ({
        to: await rgbppXudtLikeClient.buildBtcTimeLockScript(receiver.address),
        amount: ccc.fixedPointFrom(receiver.amount),
      }))
    )
  );

  let txWithInputs: ccc.Transaction;
  if (!utxoSeals) {
    txWithInputs = await udt.completeChangeToLock(
      tx,
      ckbRgbppUnlockSinger,
      rgbppXudtLikeClient.buildRgbppLockScript({
        txId: TX_ID_PLACEHOLDER,
        index: XUDT_LIKE_LEAP_FROM_BTC_OUTPUT_INDEX,
      })
    );

    // console.log(inspect(txWithInputs, { depth: null, colors: true }));

    utxoSeals = await Promise.all(
      txWithInputs.inputs.map(async (input) => {
        await input.completeExtraInfos(ckbClient);
        return parseUtxoSealFromScriptArgs(input.cellOutput!.lock.args);
      })
    );
    console.log(utxoSeals);
  } else {
    const rgbppLiveCells = await collectRgbppCells(utxoSeals, sudtTypeScript);
    tx.inputs.push(
      ...rgbppLiveCells.map(({ outPoint, outputData, cellOutput }) =>
        ccc.CellInput.from({
          previousOutput: outPoint,
          outputData,
          cellOutput,
        })
      )
    );

    const balanceDiff =
      (await tx.getInputsUdtBalance(
        ckbClient as unknown as ccc.Client,
        sudtTypeScript
      )) - tx.getOutputsUdtBalance(sudtTypeScript);
    if (balanceDiff < ccc.Zero) {
      throw new Error("Insufficient balance");
    } else if (balanceDiff > ccc.Zero) {
      tx.addOutput(
        {
          lock: rgbppXudtLikeClient.buildRgbppLockScript({
            txId: TX_ID_PLACEHOLDER,
            index: XUDT_LIKE_LEAP_FROM_BTC_OUTPUT_INDEX,
          }),
          type: sudtTypeScript,
        },
        ccc.numLeToBytes(balanceDiff, 16)
      );
    }
    txWithInputs = tx;
  }

  const txWithRgbppWitnessPlaceholder =
    await rgbppXudtLikeClient.injectRgbppWitnessPlaceholder(txWithInputs);
  const psbt = await rgbppBtcWallet.buildPsbt({
    rgbppOutputs: buildBtcRgbppOutputs(
      txWithRgbppWitnessPlaceholder,
      utxoBasedAccountAddress,
      [],
      rgbppXudtLikeClient
    ),

    utxoSeals,
    from: utxoBasedAccountAddress,
    feeRate: 28,
  });

  const signedBtcTx = await rgbppBtcWallet.signTx(psbt);
  const rawBtcTxHex = rgbppBtcWallet.rawTxHex(signedBtcTx);
  logger.add("rawBtcTxHex", rawBtcTxHex);

  const btcTxId = await rgbppBtcWallet.sendTx(signedBtcTx);
  logger.add("btcTxId", btcTxId, true);

  const ckbPartialTxInjected = await rgbppXudtLikeClient.injectTxIdToRgbppCkbTx(
    txWithRgbppWitnessPlaceholder,
    btcTxId
  );
  logger.logCkbTx("ckbPartialTxInjected", ckbPartialTxInjected);

  const rgbppSignedCkbTx =
    await ckbRgbppUnlockSinger.signTransaction(ckbPartialTxInjected);
  await rgbppSignedCkbTx.completeFeeBy(ckbSigner);
  logger.logCkbTx("ckbPartialTxWithFee", rgbppSignedCkbTx);
  const ckbFinalTx = await ckbSigner.signTransaction(rgbppSignedCkbTx);
  logger.logCkbTx("ckbFinalTx", ckbFinalTx);
  const txHash = await ckbSigner.client.sendTransaction(ckbFinalTx);
  await ckbRgbppUnlockSinger.client.waitTransaction(txHash);
  logger.add("ckbTxId", txHash, true);
}

const logger = new RgbppTxLogger({ opType: "ccc-udt-sudt-btc-to-ckb" });

btcUdtToCkb({
  utxoSeals: [
    {
      txId: "19b23725452ef195b91e204a3cec0277d2e0ff607fce8cb5e7be9540384e209d",
      index: 1,
    },
  ],
  udtId: "0x93bdbdb7027bfde1d01ebc10e33f522fdeb504cc975b69802b60e4f49090792b",
  receivers: [
    {
      address: ckbAddress,
      amount: ccc.fixedPointFrom(1),
    },
    {
      address: ckbAddress,
      amount: ccc.fixedPointFrom(10),
    },
  ],
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
pnpm tsx packages/examples/src/udt/ccc-udt-sudt-btc-to-ckb.ts

https://mempool.space/testnet/tx/19b23725452ef195b91e204a3cec0277d2e0ff607fce8cb5e7be9540384e209d
https://testnet.explorer.nervos.org/transaction/0x3c73eea5d92f427ce99a9b44671889093d354872edecfb16800d085dfff19f0a

https://mempool.space/testnet/tx/f67edadf903b7558a4e77fe5e2855effe169372a795c9092225556e2d4f9567d
https://testnet.explorer.nervos.org/transaction/0xa0a184e8dd359d8a14f7acd4c40774b8ea01d77f45dc2e14f6584c90f4e8e85c
*/
