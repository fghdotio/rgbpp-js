import { IUtxoLikeWallet } from "@rgbpp-js/core";
import { RgbppApiSpvProof } from "@rgbpp-js/core/dist/types/spv.js";

export class BtcWallet implements IUtxoLikeWallet {
  getSpvProof(txId: string): Promise<RgbppApiSpvProof | null> {
    console.log("getSpvProof", txId);
    return Promise.resolve(null);
  }
}
