import { ccc } from "@ckb-ccc/shell";

import { RgbppUdtClient } from "@rgbpp-js/core";

export interface RgbppBtcTxParams {
  ckbPartialTx: ccc.Transaction;
  ckbClient: ccc.Client;
  rgbppUdtClient: RgbppUdtClient;
  receiverBtcAddresses: string[];

  btcChangeAddress: string;

  feeRate?: number;
}
