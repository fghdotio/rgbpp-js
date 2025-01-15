import { RgbppApiSpvProof } from "../types/spv.js";
import {
  UtxoLikeApiRecommendedFeeRates,
  UtxoLikeApiTransaction,
  UtxoLikeApiUtxo,
} from "../types/utxo-like.js";

export interface IUtxoLikeDataSource {
  getTransaction(txId: string): Promise<UtxoLikeApiTransaction>;
  getUtxos(address: string): Promise<UtxoLikeApiUtxo>;
  getRecommendedFee(): Promise<UtxoLikeApiRecommendedFeeRates>;
}

export interface IRgbppSpvProof {
  getSpvProof(txId: string): Promise<RgbppApiSpvProof | null>;
}

export interface IUtxoLikeTxBuilder {
  signTransaction(tx: any): Promise<any>;
  sendTransaction(signedTx: any): Promise<string>;
}

export interface IUtxoLikeWallet extends IRgbppSpvProof {}
