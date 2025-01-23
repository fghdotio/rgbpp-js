import { ccc } from "@ckb-ccc/core";
import {
  RGBPP_CKB_WITNESS_PLACEHOLDER,
  TX_ID_PLACEHOLDER,
  UNIQUE_TYPE_OUTPUT_INDEX,
  XUDT_LIKE_ISSUANCE_OUTPUT_INDEX,
} from "../constants/index.js";

import { ScriptManager } from "../rgbpp/script-manager.js";
import { deadLock } from "../scripts/index.js";
import { Network } from "../types/network.js";
import { ScriptInfo } from "../types/rgbpp/rgbpp.js";
import { RgbppXudtLikeIssuance } from "../types/rgbpp/xudt-like.js";
import { encodeRgbppXudtLikeToken, u128ToLe } from "../utils/index.js";
import { calculateCommitment } from "../utils/rgbpp.js";

export class RgbppXudtLike {
  private scriptManager: ScriptManager;

  constructor(network: Network, scriptInfos?: ScriptInfo[]) {
    this.scriptManager = new ScriptManager(network, scriptInfos);
  }

  calculateCommitment(ckbPartialTx: ccc.Transaction) {
    return calculateCommitment(ckbPartialTx);
  }

  async issuanceCkbPartialTx(
    params: RgbppXudtLikeIssuance,
  ): Promise<ccc.Transaction> {
    const tx = ccc.Transaction.default();

    tx.inputs.push(
      ccc.CellInput.from({
        previousOutput: params.rgbppLiveCell.outPoint,
      }),
    );
    tx.witnesses.push(RGBPP_CKB_WITNESS_PLACEHOLDER);

    tx.addOutput(
      {
        lock: this.scriptManager.buildRgbppLockScript({
          txId: TX_ID_PLACEHOLDER,
          index: XUDT_LIKE_ISSUANCE_OUTPUT_INDEX,
        }),
        type: this.scriptManager.buildXudtLikeTypeScript(
          params.rgbppLiveCell.cellOutput.lock.hash(), // unique ID of xUDT-like token
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
