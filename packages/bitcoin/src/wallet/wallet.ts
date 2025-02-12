import { Psbt, Transaction } from "bitcoinjs-lib";

import { ccc } from "@ckb-ccc/core";

import {
  calculateCommitment,
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
import { RgbppBtcTxParams } from "../types/rgbpp.js";
import {
  AddressType,
  BtcApiRecommendedFeeRates,
  BtcApiSentTransaction,
  BtcApiTransaction,
  BtcApiUtxo,
  BtcApiUtxoParams,
  TxInputData,
  TxOutput,
  Utxo,
} from "../types/tx.js";
import {
  getAddressType,
  isOpReturnScriptPubkey,
  toNetwork,
  utxoToInputData,
} from "../utils/utils.js";

const DEFAULT_FEE_RATE = 1;
// TODO: use dust limit from network config
const DEFAULT_DUST_LIMIT = 546;
const DEFAULT_VIRTUAL_SIZE_BUFFER = 20;

export class RgbppBtcWallet extends BtcAssetsApiBase {
  private account: BtcAccount;
  private network: string;

  constructor(
    privateKey: string,
    addressType: AddressType,
    networkType: string,
    btcAssetApiConfig: BtcAssetApiConfig,
  ) {
    super(btcAssetApiConfig);
    this.account = createBtcAccount(privateKey, addressType, networkType);

    this.network = networkType;
  }

  async buildPsbt(params: RgbppBtcTxParams): Promise<Psbt> {
    const inputs = await this.buildInputs(params.utxoSeals);

    const { balancedInputs, balancedOutputs } = await this.balanceInputsOutputs(
      inputs,
      params.rgbppOutputs,
      params.feeRate,
    );

    const psbt = new Psbt({ network: toNetwork(this.network) });
    balancedInputs.forEach((input) => {
      psbt.data.addInput(input);
    });
    balancedOutputs.forEach((output) => {
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
    // TODO: parallel
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

  rawTxHex(tx: Transaction): string {
    return transactionToHex(tx, false);
  }

  async balanceInputsOutputs(
    inputs: TxInputData[],
    outputs: TxOutput[],
    feeRate?: number,
  ): Promise<{
    balancedInputs: TxInputData[];
    balancedOutputs: TxOutput[];
  }> {
    const requiredFee = await this.estimateFee(inputs, outputs, feeRate);
    const inputsValue = inputs.reduce(
      (acc, input) => acc + input.witnessUtxo.value,
      0,
    );
    const outputsValue = outputs.reduce((acc, output) => acc + output.value, 0);
    let changeValue = inputsValue - outputsValue - requiredFee;
    if (changeValue < 0) {
      // TODO: verify if any of the required extra inputs are already present in the inputs array
      const { inputs: extraInputs, changeValue: newChangeValue } =
        await this.collectUtxos(-changeValue, {
          only_non_rgbpp_utxos: true,
        });
      inputs.push(...extraInputs);
      changeValue = newChangeValue;
    }

    if (changeValue >= DEFAULT_DUST_LIMIT) {
      outputs.push({
        address: this.account.from,
        value: changeValue,
      });
    }

    return {
      balancedInputs: inputs,
      balancedOutputs: outputs,
    };
  }

  async collectUtxos(
    requiredValue: number,
    params?: BtcApiUtxoParams,
  ): Promise<{ inputs: TxInputData[]; changeValue: number }> {
    // TODO: more pages
    const utxos = await this.getUtxos(this.account.from, params);
    if (utxos.length === 0) {
      throw new Error("Insufficient funds");
    }
    const selectedUtxos: BtcApiUtxo[] = [];
    let totalValue = 0;

    for (const utxo of utxos) {
      selectedUtxos.push(utxo);
      totalValue += utxo.value;

      if (totalValue >= requiredValue) {
        break;
      }
    }

    if (totalValue < requiredValue) {
      throw new Error(
        `Insufficient funds: needed ${requiredValue}, but only found ${totalValue}`,
      );
    }

    return {
      inputs: await this.buildInputs(
        selectedUtxos.map((utxo) => ({
          txId: utxo.txid,
          index: utxo.vout,
        })),
      ),
      changeValue: totalValue - requiredValue,
    };
  }

  async estimateFee(
    inputs: TxInputData[],
    outputs: TxOutput[],
    feeRate?: number,
  ) {
    // Create a temporary PSBT to calculate the fee
    const psbt = new Psbt({ network: toNetwork(this.network) });
    inputs.forEach((input) => psbt.addInput(input));
    outputs.forEach((output) => psbt.addOutput(output));
    // TODO: FIX ME: signTx will fail if inputs value is smaller than outputs value
    const tx = await this.signTx(psbt);

    // Calculate virtual size
    const weightWithWitness = tx.byteLength(true);
    const weightWithoutWitness = tx.byteLength(false);
    const weight = weightWithoutWitness * 3 + weightWithWitness + tx.ins.length;
    const virtualSize = Math.ceil(weight / 4);
    const bufferedVirtualSize = virtualSize + DEFAULT_VIRTUAL_SIZE_BUFFER;

    if (!feeRate) {
      try {
        feeRate = (await this.getRecommendedFee()).fastestFee;
        console.log(`Using recommended fee rate: ${feeRate}`);
      } catch (error) {
        feeRate = DEFAULT_FEE_RATE;
        console.warn(
          `Failed to get recommended fee rate: ${String(error)}, using default fee rate ${DEFAULT_FEE_RATE}`,
        );
      }
    }

    return Math.ceil(bufferedVirtualSize * feeRate);
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

  // TODO: target value as a parameter
  async prepareUtxoSeal(feeRate?: number): Promise<UtxoSeal> {
    const targetValue = DEFAULT_DUST_LIMIT;
    const outputs = [
      {
        address: this.account.from,
        value: targetValue,
      },
    ];

    // TODO: only_non_rgbpp_utxos seems not working
    const utxos = await this.getUtxos(this.account.from, {
      only_non_rgbpp_utxos: true,
    });
    if (utxos.length === 0) {
      throw new Error("Insufficient funds");
    }
    const inputs = await this.buildInputs([
      {
        txId: utxos[0].txid,
        index: utxos[0].vout,
      },
    ]);

    const { balancedInputs, balancedOutputs } = await this.balanceInputsOutputs(
      inputs,
      outputs,
      feeRate,
    );
    const psbt = new Psbt({ network: toNetwork(this.network) });
    balancedInputs.forEach((input) => {
      psbt.data.addInput(input);
    });
    balancedOutputs.forEach((output) => {
      psbt.addOutput(output);
    });

    // TODO: 构建、签名、发送分离
    const signedTx = await this.signTx(psbt);
    const txId = await this.sendTx(signedTx);
    console.log(`[prepareUtxoSeal] Transaction ${txId} sent`);

    let tx = await this.getTransaction(txId);
    while (!tx.status.confirmed) {
      console.log(
        `[prepareUtxoSeal] Transaction ${txId} not confirmed, waiting 30 seconds...`,
      );
      await new Promise((resolve) => setTimeout(resolve, 30 * 1000));
      tx = await this.getTransaction(txId);
    }

    return {
      txId,
      index: 0,
    };
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
