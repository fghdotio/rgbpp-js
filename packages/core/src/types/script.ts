import { ccc } from "@ckb-ccc/shell";

export enum PredefinedScriptName {
  RgbppLock = "RgbppLock",
  BtcTimeLock = "BtcTimeLock",

  UniqueType = "UniqueType",
}

export type ScriptName = PredefinedScriptName | ccc.KnownScript | string;

export interface ScriptSet {
  [PredefinedScriptName.RgbppLock]: ccc.Script;
  [PredefinedScriptName.BtcTimeLock]: ccc.Script;

  [PredefinedScriptName.UniqueType]: ccc.Script;

  [key: string]: ccc.Script;
}

export interface CellDepSet {
  [PredefinedScriptName.RgbppLock]: ccc.CellDep;
  [PredefinedScriptName.BtcTimeLock]: ccc.CellDep;

  [PredefinedScriptName.UniqueType]: ccc.CellDep;

  [key: string]: ccc.CellDep;
}
