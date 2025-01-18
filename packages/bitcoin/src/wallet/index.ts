import {
  IUtxoLikeWallet,
  Network,
  TxInput,
  TxOutput,
  Utxo,
  UtxoLikeApiRecommendedFeeRates,
  UtxoLikeApiSentTransaction,
  UtxoLikeApiTransaction,
  UtxoLikeApiUtxo,
  UtxoLikeApiUtxoParams,
  UtxoSeal,
  utxoToInput,
} from "@rgbpp-js/core";
import { RgbppApiSpvProof } from "@rgbpp-js/core/dist/types/spv.js";
import { Psbt } from "bitcoinjs-lib";
import { BtcAssetsApiBase } from "../service/base.js";
import { getAddressType, isOpReturnScriptPubkey, toNetwork } from "../utils.js";
import { BtcAccount, signPsbt, transactionToHex } from "./account.js";

export class BtcWallet extends BtcAssetsApiBase implements IUtxoLikeWallet {
  private account: BtcAccount;

  constructor(
    account: BtcAccount,
    url: string,
    token: string,
    origin?: string,
  ) {
    super({ url, token, origin });
    this.account = account;
  }

  async getTxInput(utxoSeal: UtxoSeal): Promise<TxInput | null> {
    const utxoLikeTx = await this.getTransaction(utxoSeal.txId);
    if (!utxoLikeTx) {
      return null;
    }
    const vout = utxoLikeTx.vout[utxoSeal.index];
    if (!vout) {
      return null;
    }
    const scriptBuffer = Buffer.from(vout.scriptpubkey, "hex");
    if (isOpReturnScriptPubkey(scriptBuffer)) {
      return utxoToInput({
        txid: utxoSeal.txId,
        vout: utxoSeal.index,
        value: vout.value,
        scriptPk: vout.scriptpubkey,
      } as Utxo);
    }

    return utxoToInput({
      txid: utxoSeal.txId,
      vout: utxoSeal.index,
      value: vout.value,
      scriptPk: vout.scriptpubkey,
      address: vout.scriptpubkey_address,
      addressType: getAddressType(vout.scriptpubkey_address),
    } as Utxo);
  }

  buildAndSignTx(
    inputs: TxInput[],
    outputs: TxOutput[],
    network: Network,
  ): { txHex: string; rawTxHex: string } {
    const psbt = new Psbt({ network: toNetwork(network) });
    inputs.forEach((input) => {
      psbt.data.addInput(input.data);
    });
    outputs.forEach((output) => {
      psbt.addOutput(output);
    });

    signPsbt(psbt, this.account);
    psbt.finalizeAllInputs();
    const tx = psbt.extractTransaction(true);

    return {
      txHex: tx.toHex(),
      // Exclude witness from the BTC_TX for unlocking RGBPP assets
      rawTxHex: transactionToHex(tx, false),
    };
  }

  getTransaction(txId: string) {
    return this.request<UtxoLikeApiTransaction>(
      `/bitcoin/v1/transaction/${txId}`,
    );
  }

  getUtxos(address: string, params?: UtxoLikeApiUtxoParams) {
    return this.request<UtxoLikeApiUtxo[]>(
      `/bitcoin/v1/address/${address}/unspent`,
      {
        params,
      },
    );
  }

  getRgbppSpvProof(btcTxId: string, confirmations: number) {
    return this.request<RgbppApiSpvProof>("/rgbpp/v1/btc-spv/proof", {
      params: {
        btc_txid: btcTxId,
        confirmations,
      },
    });
  }

  getRecommendedFee() {
    return this.request<UtxoLikeApiRecommendedFeeRates>(
      `/bitcoin/v1/fees/recommended`,
    );
  }

  async sendTransaction(txHex: string): Promise<string> {
    const { txid: txId } = await this.post<UtxoLikeApiSentTransaction>(
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
