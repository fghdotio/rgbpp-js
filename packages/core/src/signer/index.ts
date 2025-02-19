import {
  ccc,
  SignerSignType,
  SignerType,
  Transaction,
  TransactionLike,
} from "@ckb-ccc/core";
import { serializeWitnessArgs } from "@nervosnetwork/ckb-sdk-utils";
import { SpvProofProvider } from "../interfaces/spv.js";
import { ScriptName } from "../scripts/index.js";
import { CommittedLength } from "../types/rgbpp/rgbpp.js";
import { SpvProof } from "../types/spv.js";
import { prependHexPrefix } from "../utils/encoder.js";
import { buildRgbppUnlock, decodeCommittedLength } from "../utils/rgbpp.js";
import { getTxIdFromScriptArgs, isUsingOneOfScripts } from "../utils/script.js";
import { pollForSpvProof } from "../utils/spv.js";

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

    private readonly tmpRawBtcTxHex: string,
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
      this.parseBtcTxIdFromScriptArgs(tx),
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

    const preparedTx = await this.feeSigner.prepareTransaction(txInjected);
    preparedTx.cellDeps = this.sortCellDeps(preparedTx.cellDeps);
    const signedTx = await this.feeSigner.signOnlyTransaction(preparedTx);

    return signedTx;
  }

  parseBtcTxIdFromScriptArgs(tx: ccc.Transaction): string {
    const outputs = tx.outputs.filter((output) => output.lock);
    const rgbppOutput = outputs.find((output) =>
      isUsingOneOfScripts(output.lock, [
        this.scriptsDetail[ScriptName.RgbppLock].script,
        this.scriptsDetail[ScriptName.BtcTimeLock].script,
      ]),
    );
    if (!rgbppOutput) {
      throw new Error("Rgbpp or btcTimeLock output not found");
    }
    return getTxIdFromScriptArgs(rgbppOutput.lock.args);
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

    let committedLength: CommittedLength | undefined;
    const rgbppWitnessIndices = tx.witnesses
      .map((witness, index) => ({ witness, index }))
      .filter(({ witness }) => {
        const { committedLength: cl, hasRgbppWitnessPrefix } =
          decodeCommittedLength(witness);
        if (hasRgbppWitnessPrefix) {
          committedLength = cl;
        }

        return hasRgbppWitnessPrefix;
      })
      .map(({ index }) => index);

    if (!committedLength) {
      throw new Error("Committed length not found");
    }

    console.log("rgbppWitnessIndices:", rgbppWitnessIndices);
    console.log(
      `committed input length: ${committedLength.inputLength[0]}, output length: ${committedLength.outputLength[0]}`,
    );

    const rgbppUnlock = buildRgbppUnlock(
      btcLikeTxBytes,
      spvClient.proof,
      committedLength.inputLength[0],
      committedLength.outputLength[0],
    );

    const rgbppWitness = prependHexPrefix(
      serializeWitnessArgs({
        lock: rgbppUnlock,
        inputType: "",
        outputType: "",
      }),
    );

    rgbppWitnessIndices.forEach((index) => {
      tx.witnesses[index] = rgbppWitness;
    });

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
