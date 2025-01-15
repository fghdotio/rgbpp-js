import { bytesFrom, ccc, Hex, hexFrom } from "@ckb-ccc/core";

import { blockchain } from "@ckb-lumos/base";
import { blake2b, PERSONAL } from "@nervosnetwork/ckb-sdk-utils";

import { DEFAULT_CONFIRMATIONS } from "../constants/index.js";
import { BTCTimeLock } from "../schemas/generated/rgbpp.js";
import { RgbppXudtLikeToken, UtxoSeal } from "../types/rgbpp.js";
import {
  prependHexPrefix,
  reverseHexByteOrder,
  trimHexPrefix,
  u32ToHex,
  u64ToLe,
  u8ToHex,
  utf8ToHex,
} from "./hex.js";

export const encodeRgbppXudtLikeToken = (token: RgbppXudtLikeToken): string => {
  const decimal = u8ToHex(token.decimal);
  const name = trimHexPrefix(utf8ToHex(token.name));
  const nameSize = u8ToHex(name.length / 2);
  const symbol = trimHexPrefix(utf8ToHex(token.symbol));
  const symbolSize = u8ToHex(symbol.length / 2);
  return `0x${decimal}${nameSize}${name}${symbolSize}${symbol}`;
};

// TODO: FIX THIS
export const calculateRgbppXudtLikeTokenCellCapacity = (
  tokenInfo: RgbppXudtLikeToken,
): bigint => {
  return BigInt(25300000000n);
};

// TODO: FIX THIS
export const calculateRgbppXudtLikeTokenInfoCellCapacity = (
  tokenInfo: RgbppXudtLikeToken,
): bigint => {
  return BigInt(22100000000n);
};

/**
 * https://learnmeabitcoin.com/technical/general/byte-order/
 * Whenever you're working with transaction/block hashes internally (e.g. inside raw bitcoin data), you use the natural byte order.
 * Whenever you're displaying or searching for transaction/block hashes, you use the reverse byte order.
 */
export const buildRgbppLockArgs = (utxoSeal: UtxoSeal): Hex => {
  return prependHexPrefix(
    `${u32ToHex(utxoSeal.index, true)}${trimHexPrefix(
      reverseHexByteOrder(prependHexPrefix(utxoSeal.txHash)),
    )}`,
  );
};

export const buildBtcTimeLockArgs = (
  receiverLock: ccc.Script,
  btcTxId: string,
  confirmations = DEFAULT_CONFIRMATIONS,
): Hex => {
  const btcTxid = blockchain.Byte32.pack(
    reverseHexByteOrder(prependHexPrefix(btcTxId)),
  );
  const lockScript = blockchain.Script.unpack(receiverLock.hash());
  return hexFrom(
    BTCTimeLock.pack({ lockScript, after: confirmations, btcTxid }),
  );
};

export const buildUniqueTypeArgs = (
  firstInput: ccc.CellInput,
  firstOutputIndex: number,
) => {
  const input = bytesFrom(firstInput.hash());
  const s = blake2b(32, null, null, PERSONAL);
  s.update(input);
  s.update(bytesFrom(prependHexPrefix(u64ToLe(BigInt(firstOutputIndex)))));
  return prependHexPrefix(`${s.digest("hex").slice(0, 40)}`);
};
