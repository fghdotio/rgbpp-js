import { ccc } from "@ckb-ccc/core";

import { PredefinedNetwork } from "../../types/network.js";
import { signetCellDeps, signetScripts } from "./signet.js";
import { testnet3CellDeps, testnet3Scripts } from "./testnet3.js";

export const predefinedScripts = {
  [PredefinedNetwork.BitcoinSignet]: signetScripts,
  [PredefinedNetwork.BitcoinTestnet3]: testnet3Scripts,
};

export const predefinedCellDeps = {
  [PredefinedNetwork.BitcoinSignet]: signetCellDeps,
  [PredefinedNetwork.BitcoinTestnet3]: testnet3CellDeps,
};

export const deadLock = ccc.Script.from({
  codeHash:
    "0x0000000000000000000000000000000000000000000000000000000000000000",
  hashType: "data",
  args: "0x",
});

// const xUDTCompatibleScripts = new Map<string, Map<string, ScriptInfo>>();

// getSupportedNetworks().forEach((network) => {
//   xUDTCompatibleScripts.set(network, new Map());
// });

// export function registerXudtCompatibleScript(
//   network: string,
//   scriptName: string,
//   scriptInfo: ScriptInfo,
// ) {
//   const scriptInfos = xUDTCompatibleScripts.get(network);
//   if (!scriptInfos || !getSupportedNetworks().includes(network)) {
//     throw new Error(
//       `Network ${network} not supported, call registerNetwork() first`,
//     );
//   }

//   scriptInfos.set(scriptName, scriptInfo);
//   scripts[network][scriptName] = scriptInfo.script;
//   cellDeps[network][scriptName] = scriptInfo.cellDep;
// }

// export function getXudtCompatibleScriptNames(network: string) {
//   return Array.from(xUDTCompatibleScripts.get(network)?.keys() ?? []);
// }
