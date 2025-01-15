import { ccc } from "@ckb-ccc/core";

import {
  cellDeps as defaultCellDeps,
  scripts as defaultScripts,
} from "../scripts/index.js";
import { Network } from "../types/network.js";
import { RgbppXudtLikeIssuance, ScriptInfo } from "../types/rgbpp.js";
import { XudtLike } from "../xdut-like/index.js";

export class Rgbpp {
  private scripts: Record<string, ccc.Script>;
  private cellDeps: Record<string, ccc.CellDep>;
  private xudtLike: XudtLike;

  constructor(network: Network, scriptInfos?: ScriptInfo[]) {
    this.scripts = Object.assign({}, defaultScripts[network]);
    this.cellDeps = Object.assign({}, defaultCellDeps[network]);
    // override default scripts and cellDeps
    scriptInfos?.forEach((scriptInfo) => {
      this.scripts[scriptInfo.name] = scriptInfo.script;
      this.cellDeps[scriptInfo.name] = scriptInfo.cellDep;
    });

    this.xudtLike = new XudtLike(this.scripts, this.cellDeps);
  }

  xudtLikeIssuancePartialTx(
    params: RgbppXudtLikeIssuance,
  ): Promise<ccc.Transaction> {
    return this.xudtLike.issuancePartialTx(params);
  }
}

export default Rgbpp;
