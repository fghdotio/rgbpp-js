import {
  IUtxoLikeWallet,
  TxInput,
  Utxo,
  UtxoLikeApiRecommendedFeeRates,
  UtxoLikeApiTransaction,
  UtxoLikeApiUtxo,
  UtxoLikeApiUtxoParams,
  UtxoSeal,
  utxoToInput,
} from "@rgbpp-js/core";
import { RgbppApiSpvProof } from "@rgbpp-js/core/dist/types/spv.js";
import { BtcAssetsApiBase } from "../service/base.js";
import { getAddressType, isOpReturnScriptPubkey } from "../utils.js";

export class BtcWallet extends BtcAssetsApiBase implements IUtxoLikeWallet {
  static fromToken(url: string, token: string, origin?: string) {
    return new BtcWallet({ url, token, origin });
  }

  async getUtxoLikeTxInput(utxoSeal: UtxoSeal): Promise<TxInput | null> {
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
}
