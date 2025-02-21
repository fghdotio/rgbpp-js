import { ccc } from "@ckb-ccc/core";

export enum PredefinedScriptName {
  Xudt = "Xudt",

  RgbppLock = "RgbppLock",
  BtcTimeLock = "BtcTimeLock",
  UniqueType = "UniqueType",
}

export type ScriptName = PredefinedScriptName | string;

export interface ScriptSet {
  [PredefinedScriptName.RgbppLock]: ccc.Script;
  [PredefinedScriptName.BtcTimeLock]: ccc.Script;
  [PredefinedScriptName.Xudt]: ccc.Script;
  [PredefinedScriptName.UniqueType]: ccc.Script;

  [key: string]: ccc.Script;
}

export interface CellDepSet {
  [PredefinedScriptName.RgbppLock]: ccc.CellDep;
  [PredefinedScriptName.BtcTimeLock]: ccc.CellDep;
  [PredefinedScriptName.Xudt]: ccc.CellDep;
  [PredefinedScriptName.UniqueType]: ccc.CellDep;

  [key: string]: ccc.CellDep;
}
