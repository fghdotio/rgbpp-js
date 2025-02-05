import {
  ccc,
  SignerSignType,
  SignerType,
  Transaction,
  TransactionLike,
} from "@ckb-ccc/core";
import { serializeWitnessArgs } from "@nervosnetwork/ckb-sdk-utils";
import { RGBPP_CKB_WITNESS_PLACEHOLDER } from "../constants/index.js";
import { ScriptName } from "../scripts/index.js";
import { RgbppUnlockParams, SpvProof } from "../types/spv.js";
import { prependHexPrefix } from "../utils/encoder.js";
import { buildRgbppUnlock } from "../utils/rgbpp.js";
import {
  isUsingOneOfScripts,
  updateScriptArgsWithTxId,
} from "../utils/script.js";

// Each RGB++ transaction requires its own instance of CkbRgbppUnlockSinger
export class CkbRgbppUnlockSinger extends ccc.Signer {
  // map of script code hash to script name
  private readonly scriptMap: Record<string, ScriptName>;

  constructor(
    ckbClient: ccc.Client,
    private readonly unlockParams: RgbppUnlockParams,
    private readonly scriptsDetail: Record<
      ScriptName,
      { script: ccc.Script; cellDep: ccc.CellDep }
    >,
  ) {
    super(ckbClient);

    this.scriptMap = Object.fromEntries(
      Object.entries(this.scriptsDetail).map(([key, value]) => [
        value.script.codeHash,
        key as ScriptName,
      ]),
    );
  }

  get type(): SignerType {
    return SignerType.CKB;
  }

  get signType(): SignerSignType {
    return SignerSignType.Unknown;
  }

  /* 
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
  */

  getScriptName(script?: ccc.Script): ScriptName | undefined {
    return script && this.scriptMap[script.codeHash];
  }

  collectCellDeps(tx: Transaction): ccc.CellDep[] {
    const scriptNames = new Set<ScriptName>(
      [
        ...tx.inputs.flatMap((input) =>
          // ? Will cellOutput always exist?
          input.cellOutput
            ? [
                this.getScriptName(input.cellOutput.lock),
                this.getScriptName(input.cellOutput.type),
              ]
            : [],
        ),
        ...tx.outputs.map((output) => this.getScriptName(output.type)),
      ].filter((name): name is ScriptName => !!name),
    );

    const cellDeps = Array.from(scriptNames).flatMap((name) => {
      if (name === ScriptName.RgbppLock || name === ScriptName.BtcTimeLock) {
        return [
          this.scriptsDetail[name].cellDep,
          ccc.CellDep.from({
            outPoint: {
              ...this.scriptsDetail[name].cellDep.outPoint,
              index: "0x1",
            },
            depType: this.scriptsDetail[name].cellDep.depType,
          }),
        ];
      }
      return [this.scriptsDetail[name].cellDep];
    });

    cellDeps.push(
      ccc.CellDep.from({
        outPoint: this.unlockParams.spvProof.spvClientOutpoint,
        depType: "code",
      }),
    );

    return cellDeps;
  }

  async prepareTransaction(txLike: TransactionLike): Promise<Transaction> {
    const tx = ccc.Transaction.from(txLike);
    tx.addCellDeps(this.collectCellDeps(tx));
    return Promise.resolve(ccc.Transaction.from(txLike));
  }

  async signOnlyTransaction(txLike: TransactionLike): Promise<Transaction> {
    const tx = ccc.Transaction.from(txLike);
    const {
      rgbppLockScriptTemplate,
      btcTimeLockScriptTemplate,
      spvProof,
      txId,
      rawTxHex,
    } = this.unlockParams;

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
