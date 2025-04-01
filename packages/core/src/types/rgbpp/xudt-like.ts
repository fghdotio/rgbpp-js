import { ccc } from "@ckb-ccc/shell";

import { RgbppXudtLikeToken, ScriptInfo } from "./rgbpp.js";

export interface RgbppUdtIssuance {
  token: RgbppXudtLikeToken;
  amount: bigint;
  rgbppLiveCells: ccc.Cell[];
  udtScriptInfo: ScriptInfo;
}

export interface RgbppXudtLikeDistribution {
  receivers: RgbppBtcReceiver[];

  xudtLikeTypeScript: ccc.Script;
  rgbppLiveCells: ccc.Cell[];
}

export interface RgbppBtcReceiver {
  address: string;
  amount: bigint;
}

export interface RgbppXudtLikeLeapFromBtcToCkb {
  xudtLikeTypeScript: ccc.Script;
  address: string;
  amount: bigint;
  rgbppLiveCells: ccc.Cell[];

  confirmations?: number;
}

export interface RgbppXudtLikeUnlockBtcTimeLock {
  btcTimeLockCells: ccc.Cell[];
}
