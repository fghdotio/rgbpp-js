import { ccc } from "@ckb-ccc/shell";

import { bytesToHex, serializeWitnessArgs } from "@nervosnetwork/ckb-sdk-utils";

import { HashType } from "../schemas/customized.js";
import { BTCTimeLock, BTCTimeUnlock } from "../schemas/generated/rgbpp.js";

import { prependHexPrefix, reverseHexByteOrder } from "./encoder.js";

/*
table BTCTimeLock {
  lock_script: Script,
  after: Uint32,
  btc_txid: Byte32,
}
*/
export const parseBtcTimeLockArgs = (
  args: string,
): {
  lock: ccc.Script;
  confirmations: number;
  btcTxId: string;
} => {
  const {
    lockScript,
    after: confirmations,
    btcTxid: btcTxId,
  } = BTCTimeLock.unpack(prependHexPrefix(args));
  return {
    lock: ccc.Script.from({
      ...lockScript,
      hashType: HashType.unpack(lockScript.hashType),
    }),
    confirmations,
    btcTxId: reverseHexByteOrder(prependHexPrefix(btcTxId)),
  };
};

export const buildBtcTimeUnlockWitness = (btcTxProof: string): ccc.Hex => {
  const btcTimeUnlock = BTCTimeUnlock.pack({ btcTxProof });
  return prependHexPrefix(
    serializeWitnessArgs({
      lock: prependHexPrefix(bytesToHex(btcTimeUnlock)),
      inputType: "",
      outputType: "",
    }),
  );
};
