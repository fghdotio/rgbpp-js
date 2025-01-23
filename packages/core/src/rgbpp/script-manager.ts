import { ccc } from "@ckb-ccc/core";

import { DEFAULT_CONFIRMATIONS } from "../constants/index.js";
import {
  cellDeps as defaultCellDeps,
  scripts as defaultScripts,
  ScriptName,
} from "../scripts/index.js";
import { Network } from "../types/network.js";
import { ScriptInfo, UtxoSeal } from "../types/rgbpp/rgbpp.js";
import {
  buildBtcTimeLockArgs,
  buildRgbppLockArgs,
  buildUniqueTypeArgs,
} from "../utils/rgbpp.js";

export class ScriptManager {
  private scripts: Record<string, ccc.Script>;
  private cellDeps: Record<string, ccc.CellDep>;

  constructor(network: Network, scriptInfos?: ScriptInfo[]) {
    this.scripts = Object.assign({}, defaultScripts[network]);
    this.cellDeps = Object.assign({}, defaultCellDeps[network]);

    // override default scripts and cellDeps
    scriptInfos?.forEach((scriptInfo) => {
      this.scripts[scriptInfo.name] = scriptInfo.script;
      this.cellDeps[scriptInfo.name] = scriptInfo.cellDep;
    });
  }

  buildRgbppLockScript(utxoSeal: UtxoSeal): ccc.Script {
    return ccc.Script.from({
      ...this.scripts[ScriptName.RgbppLock],
      args: buildRgbppLockArgs({
        txId: utxoSeal.txId,
        index: utxoSeal.index,
      }),
    });
  }

  buildBtcTimeLockScript(
    receiverLock: ccc.Script,
    btcTxId: string,
    confirmations = DEFAULT_CONFIRMATIONS,
  ): ccc.Script {
    return ccc.Script.from({
      ...this.scripts[ScriptName.BtcTimeLock],
      args: buildBtcTimeLockArgs(receiverLock, btcTxId, confirmations),
    });
  }

  buildXudtLikeTypeScript(args: string): ccc.Script {
    return ccc.Script.from({
      ...this.scripts[ScriptName.XudtLike],
      args,
    });
  }

  /* 
  https://github.com/nervosnetwork/rfcs/blob/master/rfcs/0022-transaction-structure/0022-transaction-structure.md#type-id

  There are two ways to create a new cell with a specific type id.

    1. Create a transaction which uses any out point as tx.inputs[0] and has a output cell whose type script is Type ID. The output cell's type script args is the hash of tx.inputs[0] and its output index. Because any out point can only be used once as an input, tx.inputs[0] and thus the new type id must be different in each creation transaction.
    2. Destroy an old cell with a specific type id and create a new cell with the same type id in the same transaction.
  */
  buildUniqueTypeScript(
    firstInput: ccc.CellInput,
    outputIndex: number,
  ): ccc.Script {
    return ccc.Script.from({
      ...this.scripts[ScriptName.UniqueType],
      args: buildUniqueTypeArgs(firstInput, outputIndex),
    });
  }
}
