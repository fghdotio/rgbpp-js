import * as bitcoin from "bitcoinjs-lib";
import lodash from "lodash";

import {
  AddressType,
  InitOutput,
  TxInput,
  TxOutput,
  Utxo,
} from "../types/utxo-like.js";
import { trimHexPrefix } from "./encoder.js";

const { cloneDeep } = lodash;

/**
 * Convert data to OP_RETURN script pubkey.
 * The data size should be ranged in 1 to 80 bytes.
 *
 * @example
 * const data = Buffer.from('01020304', 'hex');
 * const scriptPk = dataToOpReturnScriptPubkey(data); // <Buffer 6a 04 01 02 03 04>
 * const scriptPkHex = scriptPk.toString('hex'); // 6a0401020304
 */
export function dataToOpReturnScriptPubkey(data: Buffer | string): Buffer {
  if (typeof data === "string") {
    data = Buffer.from(trimHexPrefix(data), "hex");
  }

  const payment = bitcoin.payments.embed({ data: [data] });
  return payment.output!;
}

/**
 * Check if a script pubkey is an OP_RETURN script.
 *
 * A valid OP_RETURN script should have the following structure:
 * - <OP_RETURN code> <size: n> <data of n bytes>
 * - <OP_RETURN code> <OP_PUSHDATA1> <size: n> <data of n bytes>
 *
 * @example
 * // <OP_RETURN> <size: 0x04> <data: 01020304>
 * isOpReturnScriptPubkey(Buffer.from('6a0401020304', 'hex')); // true
 * // <OP_RETURN> <OP_PUSHDATA1> <size: 0x0f> <data: 746573742d636f6d6d69746d656e74>
 * isOpReturnScriptPubkey(Buffer.from('6a4c0f746573742d636f6d6d69746d656e74', 'hex')); // true
 * // <OP_RETURN> <OP_PUSHDATA1>
 * isOpReturnScriptPubkey(Buffer.from('6a4c', 'hex')); // false
 * // <OP_RETURN> <size: 0x01>
 * isOpReturnScriptPubkey(Buffer.from('6a01', 'hex')); // false
 * // <OP_DUP> ... (not an OP_RETURN script)
 * isOpReturnScriptPubkey(Buffer.from('76a914a802fc56c704ce87c42d7c92eb75e7896bdc41e788ac', 'hex')); // false
 */
export function isOpReturnScriptPubkey(script: Buffer): boolean {
  const scripts = bitcoin.script.decompile(script);
  if (!scripts || scripts.length !== 2) {
    return false;
  }

  const [op, data] = scripts!;
  // OP_RETURN opcode is 0x6a in hex or 106 in integer
  if (op !== bitcoin.opcodes.OP_RETURN) {
    return false;
  }
  // Standard OP_RETURN data size is up to 80 bytes
  if (
    !(data instanceof Buffer) ||
    data.byteLength < 1 ||
    data.byteLength > 80
  ) {
    return false;
  }

  // No false condition matched, it's an OP_RETURN script
  return true;
}

export function utxoToInput(utxo: Utxo): TxInput {
  if (utxo.addressType === AddressType.P2WPKH) {
    const data = {
      hash: utxo.txid,
      index: utxo.vout,
      witnessUtxo: {
        value: utxo.value,
        script: Buffer.from(trimHexPrefix(utxo.scriptPk), "hex"),
      },
    };

    return {
      data,
      utxo,
    };
  }
  if (utxo.addressType === AddressType.P2TR) {
    if (!utxo.pubkey) {
      throw new Error("Missing pubkey");
    }
    const data = {
      hash: utxo.txid,
      index: utxo.vout,
      witnessUtxo: {
        value: utxo.value,
        script: Buffer.from(trimHexPrefix(utxo.scriptPk), "hex"),
      },
      tapInternalKey: toXOnly(Buffer.from(trimHexPrefix(utxo.pubkey), "hex")),
    };
    return {
      data,
      utxo,
    };
  }

  throw new Error("Unsupported address type");
}

export function toXOnly(pubKey: Buffer): Buffer {
  return pubKey.length === 32 ? pubKey : pubKey.subarray(1, 33);
}

export function convertToOutput(output: InitOutput): TxOutput {
  let result: TxOutput | undefined;

  if ("data" in output) {
    result = {
      script: dataToOpReturnScriptPubkey(output.data),
      value: output.value,
      fixed: output.fixed,
      protected: output.protected,
      minUtxoSatoshi: output.minUtxoSatoshi,
    };
  }
  if ("address" in output || "script" in output) {
    result = cloneDeep(output);
  }
  if (!result) {
    throw new Error("Unsupported output");
  }

  const minUtxoSatoshi = 546;
  const isOpReturnOutput =
    "script" in result && isOpReturnScriptPubkey(result.script);
  if (!isOpReturnOutput && result.value < minUtxoSatoshi) {
    throw new Error("value is less than minUtxoSatoshi");
  }

  return result;
}
