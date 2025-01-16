import { BtcWallet, createBtcAccount } from "@rgbpp-js/bitcoin";
import { Network, AddressType } from "@rgbpp-js/core";

import { fileURLToPath } from "url";
import { dirname } from "path";

import dotenv from "dotenv";

dotenv.config({ path: dirname(fileURLToPath(import.meta.url)) + "/.env" });

export const utxoBasedChainName = process.env.UTXO_BASED_CHAIN_NAME!;

const utxoBasedChainPrivateKey = process.env.UTXO_BASED_CHAIN_PRIVATE_KEY!;
const utxoBasedChainAddressType = process.env.UTXO_BASED_CHAIN_ADDRESS_TYPE!;
const btcAssetsApiUrl = process.env.BTC_ASSETS_API_URL!;
const btcAssetsApiToken = process.env.BTC_ASSETS_API_TOKEN!;
const btcAssetsApiOrigin = process.env.BTC_ASSETS_API_ORIGIN!;

const addressType =
  utxoBasedChainAddressType === "P2TR" ? AddressType.P2TR : AddressType.P2WPKH;

const utxoBasedAccount = createBtcAccount(
  utxoBasedChainPrivateKey,
  addressType,
  Network.BitcoinSignet
);

export const utxoBasedWallet = new BtcWallet(
  utxoBasedAccount,
  btcAssetsApiUrl,
  btcAssetsApiToken,
  btcAssetsApiOrigin
);
