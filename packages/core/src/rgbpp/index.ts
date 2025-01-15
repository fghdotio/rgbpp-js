import { ccc } from "@ckb-ccc/core";

import { IUtxoLikeWallet } from "../interfaces/index.js";
import {
  cellDeps as defaultCellDeps,
  scripts as defaultScripts,
} from "../scripts/index.js";
import { Network } from "../types/network.js";
import { ScriptInfo } from "../types/rgbpp/rgbpp.js";
import { RgbppXudtLikeIssuance } from "../types/rgbpp/xudt-like.js";
import { RgbppApiSpvProof } from "../types/spv.js";
import { XudtLike } from "../xdut-like/index.js";

export class Rgbpp {
  private scripts: Record<string, ccc.Script>;
  private cellDeps: Record<string, ccc.CellDep>;
  private xudtLike: XudtLike;

  private utxoLikeWallet: IUtxoLikeWallet;

  constructor(
    network: Network,
    utxoLikeWallet: IUtxoLikeWallet,
    scriptInfos?: ScriptInfo[],
  ) {
    this.scripts = Object.assign({}, defaultScripts[network]);
    this.cellDeps = Object.assign({}, defaultCellDeps[network]);
    // override default scripts and cellDeps
    scriptInfos?.forEach((scriptInfo) => {
      this.scripts[scriptInfo.name] = scriptInfo.script;
      this.cellDeps[scriptInfo.name] = scriptInfo.cellDep;
    });

    this.xudtLike = new XudtLike(this.scripts, this.cellDeps);
    this.utxoLikeWallet = utxoLikeWallet;
  }

  xudtLikeIssuancePartialTx(
    params: RgbppXudtLikeIssuance,
  ): Promise<ccc.Transaction> {
    return this.xudtLike.issuancePartialTx(params);
  }

  getSpvProof(txId: string): Promise<RgbppApiSpvProof | null> {
    return this.utxoLikeWallet.getSpvProof(txId);
  }
}

export default Rgbpp;
