import { ccc } from "@ckb-ccc/core";

export interface SpvProof {
  proof: ccc.Hex;
  spvClientOutpoint: ccc.OutPoint;
}

export interface RgbppApiSpvProof {
  proof: string;
  spv_client: {
    tx_hash: string;
    index: string;
  };
}

export interface RgbppUnlockParams {
  spvProof: SpvProof;
  txId: string;
  rawTxHex: string;
  ckbPartialTx: ccc.Transaction;

  rgbppLockScriptTemplate: ccc.Script;
  btcTimeLockScriptTemplate: ccc.Script;
}
