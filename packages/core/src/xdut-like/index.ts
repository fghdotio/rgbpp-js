import { ccc, Hex } from "@ckb-ccc/core";

import {
  RGBPP_CKB_WITNESS_PLACEHOLDER,
  TX_HASH_PLACEHOLDER,
  XUDT_LIKE_ISSUANCE_OUTPUT_INDEX,
} from "../constants/index.js";
import { deadLock, ScriptName } from "../scripts/index.js";
import { RgbppXudtLikeIssuance, UtxoSeal } from "../types/rgbpp.js";
import { u128ToLe } from "../utils/hex.js";
import {
  buildBtcTimeLockArgs,
  buildRgbppLockArgs,
  buildUniqueTypeArgs,
  calculateRgbppXudtLikeTokenCellCapacity,
  calculateRgbppXudtLikeTokenInfoCellCapacity,
  encodeRgbppXudtLikeToken,
} from "../utils/rgbpp.js";

export class XudtLike {
  constructor(
    private scripts: Record<string, ccc.Script>,
    private cellDeps: Record<string, ccc.CellDep>,
  ) {}

  rgbppLockArgs(utxoSeal: UtxoSeal): Hex {
    return buildRgbppLockArgs(utxoSeal);
  }

  async issuancePartialTx(
    params: RgbppXudtLikeIssuance,
  ): Promise<ccc.Transaction> {
    const xudtScript =
      params.customScriptInfo?.script ?? this.scripts[ScriptName.XUdt];
    const xudtCellDep =
      params.customScriptInfo?.cellDep ?? this.cellDeps[ScriptName.XUdt];

    const tx = ccc.Transaction.default();

    tx.inputs.push(
      ccc.CellInput.from({
        previousOutput: params.rgbppLiveCell.outPoint,
      }),
    );
    tx.witnesses.push(RGBPP_CKB_WITNESS_PLACEHOLDER);

    tx.addOutput(
      {
        lock: {
          ...this.scripts[ScriptName.RgbppLock],
          args: buildRgbppLockArgs({
            txHash: params.txHashPlaceholder ?? TX_HASH_PLACEHOLDER,
            index: XUDT_LIKE_ISSUANCE_OUTPUT_INDEX,
          }),
        },
        type: {
          ...xudtScript,
          args: params.rgbppLiveCell.cellOutput.lock.hash(), // xUDT unique ID
        },
        capacity: calculateRgbppXudtLikeTokenCellCapacity(params.token),
      },
      u128ToLe(params.amount),
    );

    tx.addOutput(
      {
        lock: {
          ...this.scripts[ScriptName.BtcTimeLock],
          args: buildBtcTimeLockArgs(deadLock, TX_HASH_PLACEHOLDER),
        },
        type: {
          ...this.scripts[ScriptName.UniqueType],
          args: buildUniqueTypeArgs(
            ccc.CellInput.from({
              previousOutput: params.rgbppLiveCell.outPoint,
            }),
            1,
          ),
        },
        capacity: calculateRgbppXudtLikeTokenInfoCellCapacity(params.token),
      },
      encodeRgbppXudtLikeToken(params.token),
    );

    tx.addCellDeps(
      xudtCellDep,
      this.cellDeps[ScriptName.RgbppLock],
      this.cellDeps[ScriptName.UniqueType],
    );
    if (
      params.rgbppLiveCell.cellOutput.capacity < (await tx.getOutputsCapacity())
    ) {
      tx.addCellDeps(this.cellDeps[ScriptName.Secp256k1Blake160]);
    }

    return tx;
  }

  // transferPartialTx: RgbppPartialTx;
}
