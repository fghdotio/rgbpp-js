import { ccc } from "@ckb-ccc/core";
import {
  RGBPP_CKB_WITNESS_PLACEHOLDER,
  TX_ID_PLACEHOLDER,
  UNIQUE_TYPE_OUTPUT_INDEX,
  XUDT_LIKE_ISSUANCE_OUTPUT_INDEX,
} from "../constants/index.js";

import { ScriptManager } from "../rgbpp/script-manager.js";
import { deadLock, ScriptName } from "../scripts/index.js";
import { UtxoSeal } from "../types/index.js";
import { ScriptInfo } from "../types/rgbpp/rgbpp.js";
import { RgbppXudtLikeIssuance } from "../types/rgbpp/xudt-like.js";
import { prependHexPrefix } from "../utils/encoder.js";
import {
  encodeRgbppXudtLikeToken,
  isUsingOneOfScripts,
  u128ToLe,
} from "../utils/index.js";
import { calculateCommitment } from "../utils/rgbpp.js";
import { updateScriptArgsWithTxId } from "../utils/script.js";

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
            args: updateScriptArgsWithTxId(
              output.lock.args,
              prependHexPrefix(txId),
            ),
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

    tx.witnesses.push(RGBPP_CKB_WITNESS_PLACEHOLDER);
    tx.witnesses.push(RGBPP_CKB_WITNESS_PLACEHOLDER);

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

    return tx;
  }
}
