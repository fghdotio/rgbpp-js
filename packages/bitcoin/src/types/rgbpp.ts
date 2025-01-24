import { ccc } from "@ckb-ccc/core";

import { UtxoSeal } from "@rgbpp-js/core";

export interface RgbppBtcTxParams {
  ckbPartialTx: ccc.Transaction;
  utxoSeals: UtxoSeal[];
  from: string;
  to: string;
  commitment: string;
}

export interface RgbppXudtLikeIssuanceBtcTxParams extends RgbppBtcTxParams {
  rgbppLockScriptTemplate: ccc.Script;
  btcTimeLockScriptTemplate: ccc.Script;
}
