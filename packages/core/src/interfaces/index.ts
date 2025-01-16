import { UtxoSeal } from "../types/rgbpp/rgbpp.js";
import { RgbppApiSpvProof } from "../types/spv.js";
import {
  TxInput,
  UtxoLikeApiRecommendedFeeRates,
  UtxoLikeApiTransaction,
  UtxoLikeApiUtxo,
} from "../types/utxo-like.js";
export interface IUtxoLikeDataSource {
  getTransaction(txId: string): Promise<UtxoLikeApiTransaction>;
  getUtxos(address: string): Promise<UtxoLikeApiUtxo[]>;
  getRecommendedFee(): Promise<UtxoLikeApiRecommendedFeeRates>;
}

export interface IRgbppSpvProof {
  getRgbppSpvProof(
    txId: string,
    confirmations: number,
  ): Promise<RgbppApiSpvProof | null>;
}

export interface IUtxoLikeTxBuilder {
  getUtxoLikeTxInput(utxoSeal: UtxoSeal): Promise<TxInput | null>;

  // buildInputsOutputs(
  //   ckbPartialTx: ccc.Transaction,
  //   utxoSeal: UtxoSeal,
  // ): Promise<any>;

  // signTransaction(tx: any): Promise<any>;
  // sendTransaction(signedTx: any): Promise<string>;
}

export interface IUtxoLikeWallet
  extends IUtxoLikeDataSource,
    IUtxoLikeTxBuilder,
    IRgbppSpvProof {}
