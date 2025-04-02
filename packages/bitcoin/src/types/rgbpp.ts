import { ccc } from "@ckb-ccc/shell";

import { RgbppXudtLikeClient } from "@rgbpp-js/core";

export interface RgbppBtcTxParams {
  ckbPartialTx: ccc.Transaction;
  ckbClient: ccc.Client;
  rgbppXudtLikeClient: RgbppXudtLikeClient;
  receiverBtcAddresses: string[];

  btcChangeAddress: string;

  feeRate?: number;
}
