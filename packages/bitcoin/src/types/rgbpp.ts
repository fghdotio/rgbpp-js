import { UtxoSeal } from "@rgbpp-js/core";

import { TxOutput } from "./tx.js";
export interface RgbppBtcTxParams {
  rgbppOutputs: TxOutput[];

  utxoSeals: UtxoSeal[];
  from: string;
  feeRate?: number;
}
