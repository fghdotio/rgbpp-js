import { ccc } from "@ckb-ccc/shell";

export interface RgbppUdtToken {
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
