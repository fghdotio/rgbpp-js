import { ccc } from "@ckb-ccc/core";

import { RgbppXudtLikeToken } from "./rgbpp.js";

export interface RgbppXudtLikeIssuance {
  token: RgbppXudtLikeToken;
  amount: bigint;

  // TODO: or cells
  rgbppLiveCell: ccc.Cell;
}
