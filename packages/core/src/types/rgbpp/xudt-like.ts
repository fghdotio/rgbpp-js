import { ccc } from "@ckb-ccc/core";

import { RgbppXudtLikeToken, ScriptInfo, UtxoSeal } from "./rgbpp.js";

export interface RgbppXudtLikeIssuance {
  token: RgbppXudtLikeToken;
  amount: bigint;
  utxoSeal: UtxoSeal;
  rgbppLiveCell: ccc.Cell;
  customScriptInfo?: ScriptInfo;
}
