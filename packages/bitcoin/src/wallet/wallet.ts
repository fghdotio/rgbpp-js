import { Psbt, Transaction } from "bitcoinjs-lib";

import { ccc } from "@ckb-ccc/core";

import {
  calculateCommitment,
  isSameScriptTemplate,
  isUsingOneOfScripts,
  Network,
  RgbppApiSpvProof,
  UtxoSeal,
} from "@rgbpp-js/core";

import {
  BtcAccount,
  createBtcAccount,
  signPsbt,
  transactionToHex,
} from "../index.js";
import { BtcAssetsApiBase } from "../service/base.js";
import { BtcAssetApiConfig } from "../types/btc-assets-api.js";
import { RgbppXudtLikeIssuanceBtcTxParams } from "../types/rgbpp.js";
import {
  AddressType,
  BtcApiRecommendedFeeRates,
  BtcApiSentTransaction,
  BtcApiTransaction,
  BtcApiUtxo,
  BtcApiUtxoParams,
  InitOutput,
  TxInputData,
  Utxo,
} from "../types/tx.js";
import {
  convertToOutput,
  getAddressType,
  isOpReturnScriptPubkey,
  toNetwork,
  utxoToInputData,
} from "../utils/utils.js";

export class RgbppBtcWallet extends BtcAssetsApiBase {
  private account: BtcAccount;
  private network: Network;

  constructor(
    privateKey: string,
    addressType: AddressType,
    networkType: Network,
    btcAssetApiConfig: BtcAssetApiConfig,
  ) {
    super(btcAssetApiConfig);
    this.account = createBtcAccount(privateKey, addressType, networkType);

    this.network = networkType;
  }

  async buildPsbt(params: RgbppXudtLikeIssuanceBtcTxParams): Promise<Psbt> {
    const inputs = await this.buildInputs(params.utxoSeals);
    const outputs = this.buildRgbppOutputs(params);

    // TODO: complete fee logic
    outputs.push({
      address: params.from,
      value: inputs[0].witnessUtxo.value - 8400,
      fixed: true,
    });

    const psbt = new Psbt({ network: toNetwork(this.network) });
    inputs.forEach((input) => {
      psbt.data.addInput(input);
    });
    outputs.forEach((output) => {
      psbt.addOutput(output);
    });
    return psbt;
  }

  async signTx(psbt: Psbt): Promise<Transaction> {
    signPsbt(psbt, this.account);
    psbt.finalizeAllInputs();
    return psbt.extractTransaction(true);
  }

  async buildInputs(utxoSeals: UtxoSeal[]): Promise<TxInputData[]> {
    const inputs: TxInputData[] = [];
    for (const utxoSeal of utxoSeals) {
      const tx = await this.getTransaction(utxoSeal.txId);
      if (!tx) {
        continue;
      }
      const vout = tx.vout[utxoSeal.index];
      if (!vout) {
        continue;
      }

      const scriptBuffer = Buffer.from(vout.scriptpubkey, "hex");
      if (isOpReturnScriptPubkey(scriptBuffer)) {
        inputs.push(
          utxoToInputData({
            txid: utxoSeal.txId,
            vout: utxoSeal.index,
            value: vout.value,
            scriptPk: vout.scriptpubkey,
          } as Utxo),
        );
        continue;
      }

      inputs.push(
        utxoToInputData({
          txid: utxoSeal.txId,
          vout: utxoSeal.index,
          value: vout.value,
          scriptPk: vout.scriptpubkey,
          address: vout.scriptpubkey_address,
          addressType: getAddressType(vout.scriptpubkey_address),
        } as Utxo),
      );
    }
    return inputs;
  }

  async sendTx(tx: Transaction): Promise<string> {
    const txHex = tx.toHex();
    return this.sendTransaction(txHex);
  }

  async rawTxHex(tx: Transaction): Promise<string> {
    return transactionToHex(tx, false);
  }

  // RGB++ related outputs
  buildRgbppOutputs(params: RgbppXudtLikeIssuanceBtcTxParams) {
    const {
      ckbPartialTx,
      to,
      rgbppLockScriptTemplate,
      btcTimeLockScriptTemplate,
    } = params;
    const outputs: InitOutput[] = [];
    let lastCkbTypedOutputIndex = -1;
    ckbPartialTx.outputs.forEach((output, index) => {
      // If output.type is not null, then the output.lock must be RGB++ Lock or BTC Time Lock
      if (output.type) {
        if (
          !isUsingOneOfScripts(output.lock, [
            rgbppLockScriptTemplate,
            btcTimeLockScriptTemplate,
          ])
        ) {
          throw new Error("Invalid cell lock");
        }
        lastCkbTypedOutputIndex = index;
      }

      // If output.lock is RGB++ Lock, generate a corresponding output in outputs
      if (isSameScriptTemplate(output.lock, rgbppLockScriptTemplate)) {
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

  getTransaction(txId: string) {
    return this.request<BtcApiTransaction>(`/bitcoin/v1/transaction/${txId}`);
  }

  getUtxos(address: string, params?: BtcApiUtxoParams) {
    return this.request<BtcApiUtxo[]>(
      `/bitcoin/v1/address/${address}/unspent`,
      {
        params,
      },
    );
  }

  async getRgbppSpvProof(btcTxId: string, confirmations: number) {
    const spvProof: RgbppApiSpvProof | null =
      await this.request<RgbppApiSpvProof>("/rgbpp/v1/btc-spv/proof", {
        params: {
          btc_txid: btcTxId,
          confirmations,
        },
      });

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

  getRecommendedFee() {
    return this.request<BtcApiRecommendedFeeRates>(
      `/bitcoin/v1/fees/recommended`,
    );
  }

  async sendTransaction(txHex: string): Promise<string> {
    const { txid: txId } = await this.post<BtcApiSentTransaction>(
      "/bitcoin/v1/transaction",
      {
        body: JSON.stringify({
          txhex: txHex,
        }),
      },
    );
    return txId;
  }
}
