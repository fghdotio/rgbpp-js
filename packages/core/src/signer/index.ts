import {
  ccc,
  SignerSignType,
  SignerType,
  Transaction,
  TransactionLike,
} from "@ckb-ccc/core";
import { serializeWitnessArgs } from "@nervosnetwork/ckb-sdk-utils";
import {
  RGBPP_CKB_WITNESS_PLACEHOLDER,
  RGBPP_UNLOCK_PARAMS_IDENTIFIER,
} from "../constants/index.js";
import { ScriptName } from "../scripts/index.js";
import { RgbppUnlockParams, SpvProof } from "../types/spv.js";
import { prependHexPrefix, trimHexPrefix } from "../utils/encoder.js";
import { buildRgbppUnlock } from "../utils/rgbpp.js";
import {
  isUsingOneOfScripts,
  updateScriptArgsWithTxId,
} from "../utils/script.js";

export class CkbRgbppSigner extends ccc.Signer {
  constructor(
    private readonly ckbClient: ccc.Client,
    private readonly scriptsDetail: Record<
      ScriptName,
      { script: ccc.Script; cellDep: ccc.CellDep }
    >,
  ) {
    super(ckbClient);
  }

  get type(): SignerType {
    return SignerType.CKB;
  }

  get signType(): SignerSignType {
    return SignerSignType.Unknown;
  }

  setRgbppUnlockParams(params: RgbppUnlockParams): Transaction {
    const tx = ccc.Transaction.from(params.ckbPartialTx);
    tx.witnesses.push(
      prependHexPrefix(
        JSON.stringify(params, (_, value) =>
          typeof value === "bigint" ? ccc.numToHex(value) : value,
        ) + RGBPP_UNLOCK_PARAMS_IDENTIFIER,
      ),
    );

    return tx;
  }

  popUnlockParamsFromWitnesses(tx: Transaction): RgbppUnlockParams {
    const witnesses = tx.witnesses;
    if (!witnesses || witnesses.length === 0) {
      throw new Error("No witnesses found");
    }

    const lastWitness = witnesses[witnesses.length - 1];
    if (!lastWitness.endsWith(RGBPP_UNLOCK_PARAMS_IDENTIFIER)) {
      throw new Error("Unlock params not found");
    }
    tx.witnesses.pop();

    const unlockParams = trimHexPrefix(
      lastWitness.slice(
        0,
        lastWitness.length - RGBPP_UNLOCK_PARAMS_IDENTIFIER.length,
      ),
    );
    return JSON.parse(unlockParams);
  }

  getRelatedCellDeps(tx: Transaction): ccc.CellDep[] {
    // TODO: add cell deps of RGB++-related scripts from this.scriptsDetail
    return [
      this.scriptsDetail[ScriptName.RgbppLock].cellDep,
      // RGB++ config cell dep
      ccc.CellDep.from({
        outPoint: {
          ...this.scriptsDetail[ScriptName.RgbppLock].cellDep.outPoint,
          index: "0x1",
        },
        depType: "code",
      }),
      this.scriptsDetail[ScriptName.UniqueType].cellDep,
      this.scriptsDetail[ScriptName.XudtLike].cellDep,
    ];
  }

  async prepareTransaction(txLike: TransactionLike): Promise<Transaction> {
    const tx = ccc.Transaction.from(txLike);
    tx.addCellDeps(this.getRelatedCellDeps(tx));
    return Promise.resolve(ccc.Transaction.from(txLike));
  }

  async signOnlyTransaction(txLike: TransactionLike): Promise<Transaction> {
    const tx = ccc.Transaction.from(txLike);
    const unlockParams = this.popUnlockParamsFromWitnesses(tx);
    const {
      rgbppLockScriptTemplate,
      btcTimeLockScriptTemplate,
      spvProof,
      txId,
      rawTxHex,
    } = unlockParams;
    tx.addCellDeps(
      ccc.CellDep.from({
        outPoint: spvProof.spvClientOutpoint,
        depType: "code",
      }),
    );

    return Promise.resolve(
      this.injectWitnesses(
        this.injectTxId(
          tx,
          txId,
          rgbppLockScriptTemplate,
          btcTimeLockScriptTemplate,
        ),
        rawTxHex,
        spvProof,
      ),
    );
  }

  injectTxId(
    tx: ccc.Transaction,
    txId: string,
    rgbppLockScriptTemplate: ccc.Script,
    btcTimeLockScriptTemplate: ccc.Script,
  ): ccc.Transaction {
    const outputs = tx.outputs.map((output) => {
      if (
        isUsingOneOfScripts(output.lock, [
          rgbppLockScriptTemplate,
          btcTimeLockScriptTemplate,
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

  async connect(): Promise<void> {}

  async isConnected(): Promise<boolean> {
    return true;
  }

  async getInternalAddress(): Promise<string> {
    return this.getRecommendedAddress();
  }

  async getAddressObjs(): Promise<ccc.Address[]> {
    return [await this.getAddressObj()];
  }

  async getAddressObj(): Promise<ccc.Address> {
    return await ccc.Address.fromString(
      await this.getInternalAddress(),
      this.client,
    );
  }
}
