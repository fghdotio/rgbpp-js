import * as bitcoin from "bitcoinjs-lib";

import { AddressType, Network } from "@rgbpp-js/core";

/**
 * Check if target string is a valid domain.
 * @exmaple
 * isDomain('google.com') // => true
 * isDomain('https://google.com') // => false
 * isDomain('localhost') // => false
 * isDomain('localhost', true) // => true
 */
export function isDomain(domain: string, allowLocalhost?: boolean): boolean {
  if (allowLocalhost && domain === "localhost") {
    return true;
  }
  const regex = /^(?:[-A-Za-z0-9]+\.)+[A-Za-z]{2,}$/;
  return regex.test(domain);
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

export function getAddressType(address: string): AddressType {
  return decodeAddress(address).addressType;
}

export enum NetworkType {
  MAINNET,
  TESTNET,
  REGTEST, // deprecated
}

export function decodeAddress(address: string): {
  networkType: NetworkType;
  addressType: AddressType;
  dust: number;
} {
  const mainnet = bitcoin.networks.bitcoin;
  const testnet = bitcoin.networks.testnet;
  const regtest = bitcoin.networks.regtest;
  let decodeBase58: bitcoin.address.Base58CheckResult;
  let decodeBech32: bitcoin.address.Bech32Result;
  let networkType: NetworkType | undefined;
  let addressType: AddressType | undefined;
  if (
    address.startsWith("bc1") ||
    address.startsWith("tb1") ||
    address.startsWith("bcrt1")
  ) {
    try {
      decodeBech32 = bitcoin.address.fromBech32(address);
      if (decodeBech32.prefix === mainnet.bech32) {
        networkType = NetworkType.MAINNET;
      } else if (decodeBech32.prefix === testnet.bech32) {
        networkType = NetworkType.TESTNET;
      } else if (decodeBech32.prefix === regtest.bech32) {
        networkType = NetworkType.REGTEST;
      }
      if (decodeBech32.version === 0) {
        if (decodeBech32.data.length === 20) {
          addressType = AddressType.P2WPKH;
        } else if (decodeBech32.data.length === 32) {
          addressType = AddressType.P2WSH;
        }
      } else if (decodeBech32.version === 1) {
        if (decodeBech32.data.length === 32) {
          addressType = AddressType.P2TR;
        }
      }
      if (networkType !== undefined && addressType !== undefined) {
        return {
          networkType,
          addressType,
          dust: getAddressTypeDust(addressType),
        };
      }
    } catch (e) {
      // Do nothing (no need to throw here)
    }
  } else {
    try {
      decodeBase58 = bitcoin.address.fromBase58Check(address);
      if (decodeBase58.version === mainnet.pubKeyHash) {
        networkType = NetworkType.MAINNET;
        addressType = AddressType.P2PKH;
      } else if (decodeBase58.version === testnet.pubKeyHash) {
        networkType = NetworkType.TESTNET;
        addressType = AddressType.P2PKH;
      } else if (decodeBase58.version === regtest.pubKeyHash) {
        // do not work
        networkType = NetworkType.REGTEST;
        addressType = AddressType.P2PKH;
      } else if (decodeBase58.version === mainnet.scriptHash) {
        networkType = NetworkType.MAINNET;
        addressType = AddressType.P2SH_P2WPKH;
      } else if (decodeBase58.version === testnet.scriptHash) {
        networkType = NetworkType.TESTNET;
        addressType = AddressType.P2SH_P2WPKH;
      } else if (decodeBase58.version === regtest.scriptHash) {
        // do not work
        networkType = NetworkType.REGTEST;
        addressType = AddressType.P2SH_P2WPKH;
      }

      if (networkType !== undefined && addressType !== undefined) {
        return {
          networkType,
          addressType,
          dust: getAddressTypeDust(addressType),
        };
      }
    } catch (e) {
      // Do nothing (no need to throw here)
    }
  }

  return {
    addressType: AddressType.UNKNOWN,
    networkType: NetworkType.MAINNET,
    dust: 546,
  };
}

function getAddressTypeDust(addressType: AddressType) {
  if (addressType === AddressType.P2WPKH) {
    return 294;
  } else if (addressType === AddressType.P2TR) {
    return 330;
  } else {
    return 546;
  }
}

export function toNetwork(network: Network): bitcoin.Network {
  if (network === Network.BitcoinMainnet) {
    return bitcoin.networks.bitcoin;
  } else {
    return bitcoin.networks.testnet;
  }
}
