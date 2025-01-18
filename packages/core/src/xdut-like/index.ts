import { ccc, Hex } from "@ckb-ccc/core";

import { serializeWitnessArgs } from "@nervosnetwork/ckb-sdk-utils";
import {
  RGBPP_CKB_WITNESS_PLACEHOLDER,
  TX_ID_PLACEHOLDER,
  XUDT_LIKE_ISSUANCE_OUTPUT_INDEX,
} from "../constants/index.js";
import { deadLock, ScriptName } from "../scripts/index.js";
import { UtxoSeal } from "../types/rgbpp/rgbpp.js";
import { RgbppXudtLikeIssuance } from "../types/rgbpp/xudt-like.js";
import { SpvProof } from "../types/spv.js";
import { prependHexPrefix, u128ToLe } from "../utils/encoder.js";
import {
  buildBtcTimeLockArgs,
  buildRgbppLockArgs,
  buildRgbppUnlock,
  buildUniqueTypeArgs,
  calculateRgbppXudtLikeTokenCellCapacity,
  calculateRgbppXudtLikeTokenInfoCellCapacity,
  encodeRgbppXudtLikeToken,
} from "../utils/rgbpp.js";
import {
  isUsingOneOfScripts,
  updateScriptArgsWithTxId,
} from "../utils/script.js";

export class XudtLike {
  constructor(
    private scripts: Record<string, ccc.Script>,
    private cellDeps: Record<string, ccc.CellDep>,
  ) {}

  rgbppLockArgs(utxoSeal: UtxoSeal): Hex {
    return buildRgbppLockArgs(utxoSeal);
  }

  async issuanceCkbPartialTx(
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
            txId: TX_ID_PLACEHOLDER,
            index: XUDT_LIKE_ISSUANCE_OUTPUT_INDEX,
          }),
        },
        type: {
          ...xudtScript,
          args: params.rgbppLiveCell.cellOutput.lock.hash(), // xUDT unique ID
        },
        capacity: calculateRgbppXudtLikeTokenCellCapacity(params.token),
      },
      u128ToLe(params.amount * BigInt(10 ** params.token.decimal)),
    );

    tx.addOutput(
      {
        lock: {
          ...this.scripts[ScriptName.BtcTimeLock],
          args: buildBtcTimeLockArgs(deadLock, TX_ID_PLACEHOLDER),
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
      this.cellDeps[ScriptName.RgbppLockConfig],
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

  injectTxId(partialTx: ccc.Transaction, txId: string): ccc.Transaction {
    const outputs = partialTx.outputs.map((output) => {
      if (
        isUsingOneOfScripts(output.lock, [
          this.scripts[ScriptName.RgbppLock],
          this.scripts[ScriptName.BtcTimeLock],
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
      ...partialTx,
      outputs,
    });
  }

  injectWitnesses(
    partialTx: ccc.Transaction,
    btcLikeTxBytes: string,
    spvClient: SpvProof,
  ): ccc.Transaction {
    const tx = partialTx.clone();

    const rgbppUnlock = buildRgbppUnlock(
      btcLikeTxBytes,
      spvClient.proof,
      tx.inputs.length,
      tx.outputs.length,
    );

    // const rgbppWitnessArgs = ccc.WitnessArgs.from({
    //   lock: rgbppUnlock,
    // });
    const rgbppWitness = prependHexPrefix(
      serializeWitnessArgs({
        lock: rgbppUnlock,
        inputType: "",
        outputType: "",
      }),
    );
    tx.witnesses = tx.witnesses.map((witness) =>
      witness.startsWith(RGBPP_CKB_WITNESS_PLACEHOLDER)
        ? rgbppWitness
        : witness,
    );

    return tx;
  }

  assembleFinalCkbTx(
    partialTx: ccc.Transaction,
    btcLikeTxId: string,
    btcLikeTxBytes: string,
    spvProof: SpvProof,
  ): ccc.Transaction {
    const tx = this.injectWitnesses(
      this.injectTxId(partialTx, btcLikeTxId),
      btcLikeTxBytes,
      spvProof,
    );

    tx.addCellDeps(
      ccc.CellDep.from({
        outPoint: spvProof.spvClientOutpoint,
        depType: "code",
      }),
    );
    return tx;
  }
}
