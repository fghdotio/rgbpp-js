import { Network } from "../types/network.js";
import { UtxoSeal } from "../types/rgbpp/rgbpp.js";
import { RgbppApiSpvProof } from "../types/spv.js";
import {
  TxInput,
  TxOutput,
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
  getTxInput(utxoSeal: UtxoSeal): Promise<TxInput | null>;
  buildAndSignTx(
    inputs: TxInput[],
    outputs: TxOutput[],
    network: Network,
  ): { txHex: string; rawTxHex: string };
  sendTransaction(txHex: string): Promise<string>;
}

export interface IUtxoLikeWallet
  extends IUtxoLikeDataSource,
    IUtxoLikeTxBuilder,
    IRgbppSpvProof {}
