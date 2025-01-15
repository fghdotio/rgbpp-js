import { ccc } from "@ckb-ccc/core";

import {
  prependHexPrefix,
  reverseHexByteOrder,
  trimHexPrefix,
} from "./encoder.js";

export const isSameScriptTemplate = (
  lock1: ccc.Script,
  lock2: ccc.Script,
): boolean => {
  return lock1.codeHash === lock2.codeHash && lock1.hashType === lock2.hashType;
};

export const isUsingOneOfScripts = (
  script: ccc.Script,
  scripts: ccc.Script[],
): boolean => {
  return (
    scripts.length > 0 && scripts.some((s) => isSameScriptTemplate(s, script))
  );
};

export const updateScriptArgsWithTxId = (
  args: ccc.Hex,
  txId: ccc.Hex,
): string => {
  const argsLength = trimHexPrefix(args).length;
  if (argsLength < (32 + 2) * 2) {
    throw new Error("Lock args length is invalid");
  }
  return prependHexPrefix(
    `${trimHexPrefix(args).substring(0, argsLength - 32 * 2)}${trimHexPrefix(
      reverseHexByteOrder(txId),
    )}`,
  );
};
