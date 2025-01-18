import { ccc } from "@ckb-ccc/core";

import { IUtxoLikeWallet } from "../interfaces/index.js";
import {
  cellDeps as defaultCellDeps,
  scripts as defaultScripts,
  ScriptName,
} from "../scripts/index.js";
import { Network } from "../types/network.js";
import {
  RgbppXudtLikeToken,
  ScriptInfo,
  UtxoSeal,
} from "../types/rgbpp/rgbpp.js";
import { RgbppXudtLikeIssuance } from "../types/rgbpp/xudt-like.js";
import { RgbppApiSpvProof, SpvProof } from "../types/spv.js";
import {
  InitOutput,
  TxInput,
  TxOutput,
  UtxoLikeTransactionParams,
} from "../types/utxo-like.js";
import {
  buildRgbppLockArgs,
  calculateCommitment,
  calculateRgbppXudtLikeTokenCellCapacity,
  calculateRgbppXudtLikeTokenInfoCellCapacity,
} from "../utils/rgbpp.js";
import { isSameScriptTemplate, isUsingOneOfScripts } from "../utils/script.js";
import { convertToOutput } from "../utils/utxo-like.js";
import { XudtLike } from "../xdut-like/index.js";

export class Rgbpp {
  private network: Network;
  private scripts: Record<string, ccc.Script>;
  private cellDeps: Record<string, ccc.CellDep>;
  private xudtLike: XudtLike;

  private utxoLikeWallet: IUtxoLikeWallet;

  constructor(
    network: Network,
    utxoLikeWallet: IUtxoLikeWallet,
    scriptInfos?: ScriptInfo[],
  ) {
    this.scripts = Object.assign({}, defaultScripts[network]);
    this.cellDeps = Object.assign({}, defaultCellDeps[network]);
    // override default scripts and cellDeps
    scriptInfos?.forEach((scriptInfo) => {
      this.scripts[scriptInfo.name] = scriptInfo.script;
      this.cellDeps[scriptInfo.name] = scriptInfo.cellDep;
    });

    this.xudtLike = new XudtLike(this.scripts, this.cellDeps);
    this.utxoLikeWallet = utxoLikeWallet;

    this.network = network;
  }

  buildRgbppLockScript(utxoSeal: UtxoSeal): ccc.Script {
    return ccc.Script.from({
      ...this.scripts[ScriptName.RgbppLock],
      args: buildRgbppLockArgs({
        txId: utxoSeal.txId,
        index: utxoSeal.index,
      }),
    });
  }

  calculateXudtIssuanceCellCapacity(token: RgbppXudtLikeToken): bigint {
    return (
      calculateRgbppXudtLikeTokenCellCapacity(token) +
      calculateRgbppXudtLikeTokenInfoCellCapacity(token)
    );
  }

  calculateCommitment(tx: ccc.Transaction) {
    return calculateCommitment(tx);
  }

  xudtLikeIssuanceCkbPartialTx(
    params: RgbppXudtLikeIssuance,
  ): Promise<ccc.Transaction> {
    return this.xudtLike.issuanceCkbPartialTx(params);
  }

  assembleFinalRgbppCkbTx(
    partialTx: ccc.Transaction,
    btcLikeTxId: string,
    btcLikeTxBytes: string,
    spvProof: SpvProof,
  ): ccc.Transaction {
    return this.xudtLike.assembleFinalCkbTx(
      partialTx,
      btcLikeTxId,
      btcLikeTxBytes,
      spvProof,
    );
  }

  async getSpvProof(
    txId: string,
    confirmations: number,
  ): Promise<SpvProof | null> {
    const spvProof: RgbppApiSpvProof | null =
      await this.utxoLikeWallet.getRgbppSpvProof(txId, confirmations);
    return spvProof
      ? {
          proof: spvProof.proof as ccc.Hex,
          spvClientOutpoint: ccc.OutPoint.from({
            txHash: spvProof.spv_client.tx_hash,
            index: spvProof.spv_client.index,
          }),
        }
      : null;
  }

  buildUtxoLikeOutputs(params: UtxoLikeTransactionParams): TxOutput[] {
    const { ckbPartialTx, to } = params;
    const outputs: InitOutput[] = [];
    let lastCkbTypedOutputIndex = -1;
    ckbPartialTx.outputs.forEach((output, index) => {
      // If output.type is not null, then the output.lock must be RGB++ Lock or Btc Time Lock
      if (output.type) {
        if (
          !isUsingOneOfScripts(output.lock, [
            this.scripts[ScriptName.RgbppLock],
            this.scripts[ScriptName.BtcTimeLock],
          ])
        ) {
          throw new Error("Invalid cell lock");
        }
        lastCkbTypedOutputIndex = index;
      }

      // If output.lock is RGB++ Lock, generate a corresponding output in outputs
      if (
        isSameScriptTemplate(output.lock, this.scripts[ScriptName.RgbppLock])
      ) {
        outputs.push({
          fixed: true,
          address: to,
          value: 546,
          minUtxoSatoshi: 546,
        });
      }
    });

    if (lastCkbTypedOutputIndex < 0) {
      throw new Error("Invalid outputs");
    }

    if (
      !this.isCommitmentMatched(
        params.commitment,
        ckbPartialTx,
        lastCkbTypedOutputIndex,
      )
    ) {
      throw new Error("Commitment mismatch");
    }

    // place the commitment as the first output
    outputs.unshift({
      data: params.commitment,
      value: 0,
      fixed: true,
    });

    return outputs.map((output) => convertToOutput(output));
  }

  isCommitmentMatched(
    commitment: string,
    ckbPartialTx: ccc.Transaction,
    lastCkbTypedOutputIndex: number,
  ): boolean {
    return (
      commitment ===
      calculateCommitment(
        ccc.Transaction.from({
          inputs: ckbPartialTx.inputs,
          outputs: ckbPartialTx.outputs.slice(0, lastCkbTypedOutputIndex + 1),
          outputsData: ckbPartialTx.outputsData.slice(
            0,
            lastCkbTypedOutputIndex + 1,
          ),
        }),
      )
    );
  }

  async buildUtxoLikeInputsOutputs(
    params: UtxoLikeTransactionParams,
  ): Promise<{ inputs: TxInput[]; outputs: TxOutput[] }> {
    const input = await this.utxoLikeWallet.getTxInput(params.utxoSeal);
    if (!input) {
      throw new Error("Input not found");
    }
    const outputs = this.buildUtxoLikeOutputs(params);

    // TODO FIX ME: hardcoded tx fee
    outputs.push({
      address: params.from,
      value: input.data.witnessUtxo.value - 8400,
      fixed: true,
    });

    return {
      inputs: [input],
      outputs: outputs,
    };
  }

  buildAndSignUtxoLikeTx(
    inputs: TxInput[],
    outputs: TxOutput[],
  ): { txHex: string; rawTxHex: string } {
    return this.utxoLikeWallet.buildAndSignTx(inputs, outputs, this.network);
  }

  async sendUtxoLikeTx(txHex: string): Promise<string> {
    return this.utxoLikeWallet.sendTransaction(txHex);
  }
}

export default Rgbpp;
