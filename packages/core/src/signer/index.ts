import * as bitcoin from "bitcoinjs-lib";

import { serializeWitnessArgs } from "@nervosnetwork/ckb-sdk-utils";

import {
  ccc,
  SignerSignType,
  SignerType,
  Transaction,
  TransactionLike,
} from "@ckb-ccc/shell";

import { transactionToHex } from "@rgbpp-js/bitcoin";

import { SimpleBtcClient } from "../interfaces/btc.js";
import { SpvProofProvider } from "../interfaces/spv.js";
import { CommittedLength } from "../types/rgbpp/rgbpp.js";
import { PredefinedScriptName, ScriptName } from "../types/script.js";
import { SpvProof } from "../types/spv.js";
import { prependHexPrefix } from "../utils/encoder.js";
import { buildRgbppUnlock, decodeCommittedLength } from "../utils/rgbpp.js";
import { getTxIdFromScriptArgs, isUsingOneOfScripts } from "../utils/script.js";
import {
  insertClusterCreationWitness,
  insertSporeCreationWitness,
  insertSporeTransferWitness,
} from "../utils/spore.js";
import { pollForSpvProof } from "../utils/spv.js";

export class CkbRgbppUnlockSinger extends ccc.Signer {
  // map of script code hash to script name
  private readonly scriptMap: Record<string, ScriptName>;

  private spvProofCache = new Map<string, Promise<SpvProof>>();
  private cacheExpiryTime = 600_000;
  private spvPollInterval = 10_000;

  constructor(
    ckbClient: ccc.Client,
    private readonly rgbppBtcAddress: string,
    private readonly spvProofProvider: SpvProofProvider,
    private readonly simpleBtcClient: SimpleBtcClient,
    // TODO comment required scripts
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

  getScriptName(script?: ccc.Script): ScriptName | undefined {
    return script && this.scriptMap[script.codeHash];
  }

  collectCellDeps(tx: Transaction): ccc.CellDep[] {
    const scriptNames = new Set<ScriptName>(
      [
        ...tx.inputs.flatMap((input) =>
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

    let cellDeps = Array.from(scriptNames).flatMap((name) => {
      if (
        name === PredefinedScriptName.RgbppLock ||
        name === PredefinedScriptName.BtcTimeLock
      ) {
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

    cellDeps = [...cellDeps, ...tx.cellDeps];

    const uniqueCellDepsMap = new Map<string, ccc.CellDep>();

    cellDeps.forEach((cellDep) => {
      const key = `${cellDep.outPoint.txHash}-${cellDep.outPoint.index}`;
      uniqueCellDepsMap.set(key, cellDep);
    });

    return Array.from(uniqueCellDepsMap.values());
  }

  async prepareTransaction(txLike: TransactionLike): Promise<Transaction> {
    const tx = ccc.Transaction.from(txLike);

    tx.cellDeps = this.collectCellDeps(tx);

    const btcTxId = this.parseBtcTxIdFromScriptArgs(tx);
    const spvProof = await this.getSpvProof(btcTxId);
    tx.cellDeps.push(
      ccc.CellDep.from({
        outPoint: spvProof.spvClientOutpoint,
        depType: "code",
      }),
    );

    return tx;
  }

  async signOnlyTransaction(txLike: TransactionLike): Promise<Transaction> {
    const tx = ccc.Transaction.from(txLike);

    const btcTxId = this.parseBtcTxIdFromScriptArgs(tx);
    const spvProof = await this.getSpvProof(btcTxId);

    const rawBtcTxHex = await this.getRawBtcTxHex(btcTxId);
    return Promise.resolve(this.insertWitnesses(tx, rawBtcTxHex, spvProof));
  }

  private async getSpvProof(btcTxId: string): Promise<SpvProof> {
    let spvProof = this.spvProofCache.get(btcTxId);

    if (spvProof) {
      return spvProof;
    }

    const proofPromise = pollForSpvProof(
      this.spvProofProvider,
      btcTxId,
      0,
      this.spvPollInterval,
    );
    // Store the promise in cache so concurrent requests can share it
    this.spvProofCache.set(btcTxId, proofPromise);
    try {
      const proof = await proofPromise;
      if (!proof) {
        throw new Error(`SPV proof not found for transaction ${btcTxId}`);
      }

      setTimeout(() => {
        if (this.spvProofCache.get(btcTxId) === proofPromise) {
          this.spvProofCache.delete(btcTxId);
        }
      }, this.cacheExpiryTime);

      return proof;
    } catch (error) {
      if (this.spvProofCache.get(btcTxId) === proofPromise) {
        this.spvProofCache.delete(btcTxId);
      }
      throw error;
    }
  }

  async getRawBtcTxHex(txId: string): Promise<string> {
    const hex = await this.simpleBtcClient.getTransactionHex(txId);
    const parseTx = bitcoin.Transaction.fromHex(hex);
    return transactionToHex(parseTx, false);
  }

  parseBtcTxIdFromScriptArgs(tx: ccc.Transaction): string {
    const outputs = tx.outputs.filter((output) => output.lock);
    const rgbppOutput = outputs.find((output) =>
      isUsingOneOfScripts(output.lock, [
        this.scriptsDetail[PredefinedScriptName.RgbppLock].script,
        this.scriptsDetail[PredefinedScriptName.BtcTimeLock].script,
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

  async insertWitnesses(
    partialTx: ccc.Transaction,
    btcLikeTxBytes: string,
    spvClient: SpvProof,
  ): Promise<ccc.Transaction> {
    const tx = partialTx.clone();
    console.log(
      `==== input length: ${tx.inputs.length}, witness length: ${tx.witnesses.length} ====`,
    );

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

    await this.handleSporeWitness(tx);

    return tx;
  }

  async handleSporeWitness(tx: ccc.Transaction): Promise<void> {
    const clusterScriptInfos = Object.values(
      ccc.spore.getClusterScriptInfos(this.client),
    );
    const sporeScriptInfos = Object.values(
      ccc.spore.getSporeScriptInfos(this.client),
    );

    const clusterIndicesInInputs: number[] = [];
    const sporeIndicesInInputs: number[] = [];
    const clusterIndicesInOutputs: number[] = [];
    const sporeIndicesInOutputs: number[] = [];

    await Promise.all(
      tx.inputs.map(async (input, index) => {
        await input.completeExtraInfos(this.client);
        if (input.cellOutput?.type) {
          sporeScriptInfos.forEach((si) => {
            if (si && si.codeHash === input.cellOutput?.type?.codeHash) {
              sporeIndicesInInputs.push(index);
            }
          });
          clusterScriptInfos.forEach((si) => {
            if (si && si.codeHash === input.cellOutput?.type?.codeHash) {
              clusterIndicesInInputs.push(index);
            }
          });
        }
      }),
    );

    tx.outputs.forEach((output, index) => {
      clusterScriptInfos.forEach((si) => {
        if (si && si.codeHash === output.type?.codeHash) {
          clusterIndicesInOutputs.push(index);
        }
      });
      const sporeScriptInfos = Object.values(
        ccc.spore.getSporeScriptInfos(this.client),
      );
      sporeScriptInfos.forEach((si) => {
        if (si && si.codeHash === output.type?.codeHash) {
          sporeIndicesInOutputs.push(index);
        }
      });
    });

    // print all the indices length
    console.log(
      "clusterIndicesInInputs",
      clusterIndicesInInputs.length,
      "clusterIndicesInOutputs",
      clusterIndicesInOutputs.length,
      "sporeIndicesInInputs",
      sporeIndicesInInputs.length,
      "sporeIndicesInOutputs",
      sporeIndicesInOutputs.length,
    );

    if (
      clusterIndicesInInputs.length === 0 &&
      clusterIndicesInOutputs.length === 1 &&
      sporeIndicesInInputs.length === 0 &&
      sporeIndicesInOutputs.length === 0
    ) {
      console.log("cluster creation");
      await insertClusterCreationWitness(
        tx,
        clusterIndicesInOutputs[0],
        this.client,
      );
      return;
    }

    if (
      clusterIndicesInInputs.length === 1 &&
      clusterIndicesInOutputs.length === 1 &&
      sporeIndicesInInputs.length === 0 &&
      sporeIndicesInOutputs.length > 0
    ) {
      console.log("spore creation");
      await insertSporeCreationWitness(
        tx,
        clusterIndicesInInputs[0],
        clusterIndicesInOutputs[0],
        sporeIndicesInOutputs,
        this.client,
      );
      return;
    }

    // ? multiple spore transfer in one transaction
    if (
      clusterIndicesInInputs.length === 0 &&
      clusterIndicesInOutputs.length === 0 &&
      sporeIndicesInInputs.length === 1 &&
      sporeIndicesInOutputs.length === 1
    ) {
      console.log("spore transfer");
      await insertSporeTransferWitness(
        tx,
        sporeIndicesInInputs[0],
        sporeIndicesInOutputs[0],
        this.client,
      );
      return;
    }

    throw new Error("Unsupported transaction");
  }

  async connect(): Promise<void> {}

  async isConnected(): Promise<boolean> {
    return true;
  }

  async getInternalAddress(): Promise<string> {
    return this.getRecommendedAddress();
  }

  async getAddressObjs(): Promise<ccc.Address[]> {
    const rgbppCellOutputs = await this.simpleBtcClient.getRgbppCellOutputs(
      this.rgbppBtcAddress,
    );

    // output.type in each cell output must be present except for issuance
    // if (rgbppCellOutputs.some((output) => !output.type)) {
    //   throw new Error("Rgbpp cell output type not found");
    // }

    const ckbAddresses = rgbppCellOutputs.map((output) => {
      return ccc.Address.from({
        script: output.lock,
        prefix: this.client.addressPrefix,
      });
    });

    return ckbAddresses;
  }

  async getAddressObj(): Promise<ccc.Address> {
    return await ccc.Address.fromString(
      await this.getInternalAddress(),
      this.client,
    );
  }
}
