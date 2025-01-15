import { ccc } from "@ckb-ccc/core";

import { ScriptName } from "../scripts/index.js";

// xUDT compatible token
export interface RgbppXudtLikeToken {
  decimal: number;
  name: string;
  symbol: string;
}

export interface UtxoSeal {
  txHash: string;
  index: number;
}

export type ScriptInfo = {
  name: ScriptName;
  script: ccc.Script;
  cellDep: ccc.CellDep;
};

export interface RgbppXudtLikeIssuance {
  token: RgbppXudtLikeToken;
  amount: bigint;
  utxoSeal: UtxoSeal;
  rgbppLiveCell: ccc.Cell;
  customScriptInfo?: ScriptInfo;
  txHashPlaceholder?: string;
}

export interface RgbppApiSpvProof {
  proof: string;
  spv_client: {
    tx_hash: string;
    index: string;
  };
}
