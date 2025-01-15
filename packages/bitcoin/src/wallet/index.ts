import {
  IUtxoLikeWallet,
  UtxoLikeApiRecommendedFeeRates,
  UtxoLikeApiTransaction,
  UtxoLikeApiUtxo,
  UtxoLikeApiUtxoParams,
} from "@rgbpp-js/core";
import { RgbppApiSpvProof } from "@rgbpp-js/core/dist/types/spv.js";
import { BtcAssetsApiBase } from "../service/base.js";

export class BtcWallet extends BtcAssetsApiBase implements IUtxoLikeWallet {
  static fromToken(url: string, token: string, origin?: string) {
    return new BtcWallet({ url, token, origin });
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
