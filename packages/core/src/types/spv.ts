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
