import { ccc } from "@ckb-ccc/core";

import { RgbppXudtLikeToken } from "./rgbpp.js";

export interface RgbppXudtLikeIssuance {
  token: RgbppXudtLikeToken;
  amount: bigint;

  rgbppLiveCells: ccc.Cell[];
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
