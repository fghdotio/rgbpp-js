import { ccc } from "@ckb-ccc/core";

import { ScriptName } from "../../scripts/index.js";

// xUDT compatible token
export interface RgbppXudtLikeToken {
  decimal: number;
  name: string;
  symbol: string;
}

export interface UtxoSeal {
  txId: string;
  index: number;
}

export interface ScriptInfo {
  name: ScriptName;
  script: ccc.Script;
  cellDep: ccc.CellDep;
}
