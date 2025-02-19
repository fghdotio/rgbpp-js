import { ccc } from "@ckb-ccc/core";

import {
  TX_ID_PLACEHOLDER,
  UNIQUE_TYPE_OUTPUT_INDEX,
  XUDT_LIKE_ISSUANCE_OUTPUT_INDEX,
  XUDT_LIKE_LEAP_FROM_BTC_OUTPUT_INDEX,
} from "../constants/index.js";

import { ScriptManager } from "../rgbpp/script-manager.js";
import { deadLock, ScriptName } from "../scripts/index.js";
import { UtxoSeal } from "../types/index.js";
import { ScriptInfo } from "../types/rgbpp/rgbpp.js";
import {
  RgbppXudtLikeDistribution,
  RgbppXudtLikeIssuance,
  RgbppXudtLikeLeapFromBtcToCkb,
} from "../types/rgbpp/xudt-like.js";
import {
  calculateCommitment,
  encodeCommittedLength,
  encodeRgbppXudtLikeToken,
  isUsingOneOfScripts,
  leToU128,
  trimHexPrefix,
  u128ToLe,
} from "../utils/index.js";

import { updateScriptArgsWithTxId } from "../utils/script.js";

// TODO: rgbppLiveCells, btcTimeLockCells de-duplication
export class RgbppXudtLikeClient {
  private scriptManager: ScriptManager;
  private ckbClient: ccc.Client;

  constructor(
    network: string,
    ckbClient: ccc.Client,
    scriptInfos?: ScriptInfo[],
  ) {
    this.scriptManager = new ScriptManager(network, scriptInfos);
    this.ckbClient = ckbClient;
  }

  getRgbppScripts() {
    return this.scriptManager.getScripts();
  }

  getRgbppScriptsDetail() {
    return this.scriptManager.getScriptsDetail();
  }

  calculateCommitment(ckbPartialTx: ccc.Transaction) {
    return calculateCommitment(ckbPartialTx);
  }

  rgbppLockScriptTemplate() {
    return this.scriptManager.getScripts()[ScriptName.RgbppLock];
  }

  btcTimeLockScriptTemplate() {
    return this.scriptManager.getScripts()[ScriptName.BtcTimeLock];
  }

  xudtLikeTypeScriptTemplate() {
    return this.scriptManager.getScripts()[ScriptName.XudtLike];
  }

  buildRgbppLockScript(utxoSeal: UtxoSeal) {
    return this.scriptManager.buildRgbppLockScript(utxoSeal);
  }

  injectTxIdToRgbppCkbTx = (
    tx: ccc.Transaction,
    txId: string,
  ): ccc.Transaction => {
    const outputs = tx.outputs.map((output) => {
      if (
        isUsingOneOfScripts(output.lock, [
          this.rgbppLockScriptTemplate(),
          this.btcTimeLockScriptTemplate(),
        ])
      ) {
        return ccc.CellOutput.from({
          ...output,
          lock: {
            ...output.lock,
            args: updateScriptArgsWithTxId(output.lock.args, txId),
          },
        });
      }
      return output;
    });

    return ccc.Transaction.from({
      ...tx,
      outputs,
    });
  };

  async issuanceCkbPartialTx(
    params: RgbppXudtLikeIssuance,
  ): Promise<ccc.Transaction> {
    if (params.rgbppLiveCells.length === 0) {
      throw new Error("rgbppLiveCells is empty");
    }

    const tx = ccc.Transaction.default();
    params.rgbppLiveCells.forEach((cell) => {
      const cellInput = ccc.CellInput.from({
        previousOutput: cell.outPoint,
      });
      cellInput.completeExtraInfos(this.ckbClient);

      tx.inputs.push(cellInput);
    });

    tx.addOutput(
      {
        lock: this.scriptManager.buildRgbppLockScript({
          txId: TX_ID_PLACEHOLDER,
          index: XUDT_LIKE_ISSUANCE_OUTPUT_INDEX,
        }),
        type: this.scriptManager.buildXudtLikeTypeScript(
          params.rgbppLiveCells[0].cellOutput.lock.hash(), // unique ID of xUDT-like token
        ),
      },
      u128ToLe(params.amount * BigInt(10 ** params.token.decimal)),
    );

    tx.addOutput(
      {
        lock: this.scriptManager.buildBtcTimeLockScript(
          deadLock,
          TX_ID_PLACEHOLDER,
        ),
        type: this.scriptManager.buildUniqueTypeScript(
          tx.inputs[0],
          UNIQUE_TYPE_OUTPUT_INDEX,
        ),
      },
      encodeRgbppXudtLikeToken(params.token),
    );

    const committedLength = encodeCommittedLength({
      inputLength: new Uint8Array([tx.inputs.length]),
      outputLength: new Uint8Array([tx.outputs.length]),
    });

    tx.witnesses.push(committedLength);

    return tx;
  }

  async distributionCkbPartialTx(
    params: RgbppXudtLikeDistribution,
  ): Promise<ccc.Transaction> {
    const { rgbppLiveCells, receivers, xudtLikeTypeScript } = params;
    const totalAmount = receivers.reduce((acc, receiver) => {
      return acc + receiver.amount;
    }, BigInt(0));

    // XUDT cell.data = <amount: uint128> <xudt data (optional)>
    // https://blog.cryptape.com/enhance-sudts-programmability-with-xudt#heading-xudt-cell
    const sealedAmount = rgbppLiveCells.reduce(
      (acc: bigint, cell: ccc.Cell) => {
        return acc + leToU128(trimHexPrefix(cell.outputData).slice(0, 32));
      },
      BigInt(0),
    );
    if (sealedAmount < totalAmount) {
      throw new Error("Not enough xUDT-like token to distribute");
    }
    console.log(sealedAmount, totalAmount);

    const tx = ccc.Transaction.default();

    rgbppLiveCells.forEach((cell) => {
      const cellInput = ccc.CellInput.from({
        previousOutput: cell.outPoint,
      });
      cellInput.completeExtraInfos(this.ckbClient);

      tx.inputs.push(cellInput);
    });

    receivers.forEach((receiver, index) => {
      tx.addOutput(
        {
          lock: this.scriptManager.buildRgbppLockScript({
            txId: TX_ID_PLACEHOLDER,
            index: index + 1, // 0 is for OP_RETURN
          }),
          type: xudtLikeTypeScript,
        },
        u128ToLe(receiver.amount),
      );
    });

    if (sealedAmount > totalAmount) {
      tx.addOutput(
        {
          lock: this.scriptManager.buildRgbppLockScript({
            txId: TX_ID_PLACEHOLDER,
            index: receivers.length + 1,
          }),
          type: xudtLikeTypeScript,
        },
        u128ToLe(sealedAmount - totalAmount),
      );
    }

    const committedLength = encodeCommittedLength({
      inputLength: new Uint8Array([tx.inputs.length]),
      outputLength: new Uint8Array([tx.outputs.length]),
    });

    // ? push("0x")
    const lockArgsSet: Set<string> = new Set();
    for (const cell of rgbppLiveCells) {
      if (lockArgsSet.has(cell.cellOutput.lock.args)) {
        tx.witnesses.push("0x");
      } else {
        lockArgsSet.add(cell.cellOutput.lock.args);
        tx.witnesses.push(committedLength);
      }
    }

    return tx;
  }

  async leapFromBtcCkbPartialTx(
    params: RgbppXudtLikeLeapFromBtcToCkb,
  ): Promise<ccc.Transaction> {
    const {
      xudtLikeTypeScript,
      address: ckbAddress,
      amount,
      rgbppLiveCells,
      confirmations,
    } = params;

    // XUDT cell.data = <amount: uint128> <xudt data (optional)>
    // https://blog.cryptape.com/enhance-sudts-programmability-with-xudt#heading-xudt-cell
    const sealedAmount = rgbppLiveCells.reduce(
      (acc: bigint, cell: ccc.Cell) => {
        return acc + leToU128(trimHexPrefix(cell.outputData).slice(0, 32));
      },
      BigInt(0),
    );
    if (sealedAmount < amount) {
      throw new Error("Not enough xUDT-like token to leap from BTC to CKB");
    }
    console.log(sealedAmount, amount);

    const tx = ccc.Transaction.default();

    rgbppLiveCells.forEach((cell) => {
      const cellInput = ccc.CellInput.from({
        previousOutput: cell.outPoint,
      });
      cellInput.completeExtraInfos(this.ckbClient);

      tx.inputs.push(cellInput);
    });

    const receiverLock = (
      await ccc.Address.fromString(ckbAddress, this.ckbClient)
    ).script;

    tx.addOutput(
      {
        lock: this.scriptManager.buildBtcTimeLockScript(
          receiverLock,
          TX_ID_PLACEHOLDER,
          confirmations,
        ),
        type: xudtLikeTypeScript,
      },
      u128ToLe(amount),
    );

    if (sealedAmount > amount) {
      tx.addOutput(
        {
          lock: this.scriptManager.buildRgbppLockScript({
            txId: TX_ID_PLACEHOLDER,
            index: XUDT_LIKE_LEAP_FROM_BTC_OUTPUT_INDEX,
          }),
          type: xudtLikeTypeScript,
        },
        u128ToLe(sealedAmount - amount),
      );
    }

    const committedLength = encodeCommittedLength({
      inputLength: new Uint8Array([tx.inputs.length]),
      outputLength: new Uint8Array([tx.outputs.length]),
    });

    // ? push("0x")
    const lockArgsSet: Set<string> = new Set();
    for (const cell of rgbppLiveCells) {
      if (lockArgsSet.has(cell.cellOutput.lock.args)) {
        tx.witnesses.push("0x");
      } else {
        lockArgsSet.add(cell.cellOutput.lock.args);
        tx.witnesses.push(committedLength);
      }
    }

    return tx;
  }
}
