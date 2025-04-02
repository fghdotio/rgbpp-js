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
import { PredefinedScriptName } from "../types/script.js";
import { SpvProof } from "../types/spv.js";
import { prependHexPrefix } from "../utils/encoder.js";
import { buildRgbppUnlock } from "../utils/rgbpp.js";
import { getTxIdFromScriptArgs, isUsingOneOfScripts } from "../utils/script.js";
import {
  insertClusterCreationWitness,
  insertSporeCreationWitness,
  insertSporeTransferWitness,
} from "../utils/spore.js";
import { pollForSpvProof } from "../utils/spv.js";

export class CkbRgbppUnlockSinger extends ccc.Signer {
  // map of script code hash to script name
  private readonly scriptMap: Record<string, PredefinedScriptName>;
  private readonly rgbppScriptInfos: {
    [PredefinedScriptName.RgbppLock]: {
      script: ccc.Script;
      cellDep: ccc.CellDep;
    };
    [PredefinedScriptName.BtcTimeLock]: {
      script: ccc.Script;
      cellDep: ccc.CellDep;
    };
  };

  private spvProofCache = new Map<string, Promise<SpvProof>>();
  private cacheExpiryTime = 600_000;
  private spvPollInterval = 10_000;

  constructor(
    ckbClient: ccc.Client,
    private readonly rgbppBtcAddress: string,
    private readonly spvProofProvider: SpvProofProvider,
    private readonly simpleBtcClient: SimpleBtcClient,
    scriptInfos: Record<
      PredefinedScriptName,
      { script: ccc.Script; cellDep: ccc.CellDep }
    >,
  ) {
    super(ckbClient);
    this.scriptMap = Object.fromEntries(
      Object.entries(scriptInfos).map(([key, value]) => [
        value.script.codeHash,
        key as PredefinedScriptName,
      ]),
    );
    this.rgbppScriptInfos = {
      [PredefinedScriptName.RgbppLock]:
        scriptInfos[PredefinedScriptName.RgbppLock],
      [PredefinedScriptName.BtcTimeLock]:
        scriptInfos[PredefinedScriptName.BtcTimeLock],
    };
  }

  get type(): SignerType {
    return SignerType.CKB;
  }

  get signType(): SignerSignType {
    return SignerSignType.Unknown;
  }

  getScriptName(script?: ccc.Script): PredefinedScriptName | undefined {
    return script ? this.scriptMap[script.codeHash] : undefined;
  }

  async collectCellDeps(tx: Transaction): Promise<ccc.CellDep[]> {
    const scriptNames = new Set<PredefinedScriptName>(
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
      ].filter((name): name is PredefinedScriptName => !!name),
    );

    let cellDeps = Array.from(scriptNames).flatMap((name) => {
      if (
        name === PredefinedScriptName.RgbppLock ||
        name === PredefinedScriptName.BtcTimeLock
      ) {
        return [
          this.rgbppScriptInfos[name].cellDep,
          ccc.CellDep.from({
            outPoint: {
              ...this.rgbppScriptInfos[name].cellDep.outPoint,
              index: "0x1",
            },
            depType: this.rgbppScriptInfos[name].cellDep.depType,
          }),
        ];
      }
      return [];
    });

    // TODO: extract into a method
    // ? * handle cluster transfer in spore transfer because of not being able to use cluster mode
    const clusterScriptInfos = Object.values(
      ccc.spore.getClusterScriptInfos(this.client),
    );
    const clusterIndicesInInputs: number[] = [];
    const clusterIndicesInOutputs: number[] = [];
    await Promise.all(
      tx.inputs.map(async (input, index) => {
        await input.completeExtraInfos(this.client);
        if (input.cellOutput?.type) {
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
    });

    if (
      clusterIndicesInInputs.length > 0 &&
      clusterIndicesInOutputs.length > 0
    ) {
      if (
        clusterIndicesInInputs.length !== 1 ||
        clusterIndicesInOutputs.length !== 1
      ) {
        throw new Error("Invalid cluster indices");
      }
      const inputCluster = tx.inputs[clusterIndicesInInputs[0]];
      await inputCluster.completeExtraInfos(this.client);
      const inputClusterId = inputCluster.cellOutput!.type!.args;
      const { cell: inputClusterCell } = await ccc.spore.assertCluster(
        this.client,
        inputClusterId,
      );
      cellDeps.push(
        ccc.CellDep.from({
          outPoint: inputClusterCell.outPoint,
          depType: "code",
        }),
      );
    }

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

    tx.cellDeps = await this.collectCellDeps(tx);

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
        this.rgbppScriptInfos[PredefinedScriptName.RgbppLock].script,
        this.rgbppScriptInfos[PredefinedScriptName.BtcTimeLock].script,
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

    // let committedLength: CommittedLength | undefined;
    // const rgbppWitnessIndices = tx.witnesses
    //   .map((witness, index) => ({ witness, index }))
    //   .filter(({ witness }) => {
    //     const { committedLength: cl, hasRgbppWitnessPrefix } =
    //       decodeCommittedLength(witness);
    //     if (hasRgbppWitnessPrefix) {
    //       committedLength = cl;
    //     }

    //     return hasRgbppWitnessPrefix;
    //   })
    //   .map(({ index }) => index);

    // if (!committedLength) {
    //   throw new Error("Committed length not found");
    // }

    // console.log("rgbppWitnessIndices:", rgbppWitnessIndices);
    // console.log(
    //   `committed input length: ${committedLength.inputLength[0]}, output length: ${committedLength.outputLength[0]}`,
    // );

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

    tx.inputs.forEach((_, index) => {
      tx.setWitnessAt(index, rgbppWitness);
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
      clusterIndicesInOutputs.length === 0 &&
      sporeIndicesInInputs.length === 0 &&
      sporeIndicesInOutputs.length === 0
    ) {
      console.log("Not spore related transaction");
      return;
    }

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
