import {
  ccc,
  SignerSignType,
  SignerType,
  Transaction,
  TransactionLike,
} from "@ckb-ccc/core";
import { serializeWitnessArgs } from "@nervosnetwork/ckb-sdk-utils";
import { RGBPP_CKB_WITNESS_PLACEHOLDER } from "../constants/index.js";
import { SpvProofProvider } from "../interfaces/spv.js";
import { ScriptName } from "../scripts/index.js";
import { SpvProof } from "../types/spv.js";
import { prependHexPrefix } from "../utils/encoder.js";
import { buildRgbppUnlock } from "../utils/rgbpp.js";
import { pollForSpvProof } from "../utils/spv.js";

// Each RGB++ transaction requires its own instance of CkbRgbppUnlockSinger
export class CkbRgbppUnlockSinger extends ccc.Signer {
  // map of script code hash to script name
  private readonly scriptMap: Record<string, ScriptName>;

  constructor(
    ckbClient: ccc.Client,
    private readonly _feeSigner: ccc.SignerCkbPrivateKey,
    private readonly spvProofProvider: SpvProofProvider,
    private readonly scriptsDetail: Record<
      ScriptName,
      { script: ccc.Script; cellDep: ccc.CellDep }
    >,

    private readonly tmpBtcTxId: string,
    private readonly tmpRawBtcTxHex: string,
    private readonly committedInputLength: number,
    private readonly committedOutputLength: number,
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

  get feeSigner(): ccc.SignerCkbPrivateKey {
    return this._feeSigner;
  }

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

    return cellDeps;
  }

  async prepareTransaction(txLike: TransactionLike): Promise<Transaction> {
    const tx = ccc.Transaction.from(txLike);
    tx.addCellDeps(this.collectCellDeps(tx));
    return Promise.resolve(ccc.Transaction.from(txLike));
  }

  async signOnlyTransaction(txLike: TransactionLike): Promise<Transaction> {
    const tx = ccc.Transaction.from(txLike);
    const spvProof = await pollForSpvProof(
      this.spvProofProvider,
      this.tmpBtcTxId,
    );
    if (!spvProof) {
      throw new Error("Spv proof not found");
    }
    tx.cellDeps.push(
      ccc.CellDep.from({
        outPoint: spvProof.spvClientOutpoint,
        depType: "code",
      }),
    );

    const txInjected = await Promise.resolve(
      this.injectWitnesses(tx, this.tmpRawBtcTxHex, spvProof),
    );
    txInjected.cellDeps = this.sortCellDeps(txInjected.cellDeps);
    return txInjected;
  }

  // all cell deps with depType of `code` should be at the start of the array
  sortCellDeps(cellDeps: ccc.CellDep[]): ccc.CellDep[] {
    return cellDeps.sort((a, b) => {
      if (a.depType === "code" && b.depType !== "code") {
        return -1;
      }
      if (a.depType !== "code" && b.depType === "code") {
        return 1;
      }
      return 0;
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
      this.committedInputLength,
      this.committedOutputLength,
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

  getCommittedInputLength(tx: Transaction): number {
    return tx.inputs.filter((input) => input.cellOutput?.type).length;
  }

  getCommittedOutputLength(tx: Transaction): number {
    return tx.outputs.filter((output) => output.type).length;
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
