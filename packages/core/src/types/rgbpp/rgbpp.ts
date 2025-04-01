import { ccc } from "@ckb-ccc/shell";

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
  name: string;
  script: ccc.Script;
  cellDep: ccc.CellDep;
}

export interface CommittedLength {
  inputLength: Uint8Array;
  outputLength: Uint8Array;
}
