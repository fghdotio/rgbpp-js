import { ccc } from "@ckb-ccc/core";
import dotenv from "dotenv";

import { fileURLToPath } from "url";
import { dirname } from "path";

import { BtcWallet, createBtcAccount } from "@rgbpp-js/bitcoin";
import {
  Network,
  AddressType,
  Networks,
  isMainnet,
  Rgbpp,
} from "@rgbpp-js/core";

dotenv.config({ path: dirname(fileURLToPath(import.meta.url)) + "/.env" });

const utxoBasedChainName = process.env
  .UTXO_BASED_CHAIN_NAME! as keyof typeof Networks;
export const utxoBasedNetwork = Networks[utxoBasedChainName];
export const ckbClient = isMainnet(utxoBasedNetwork.name)
  ? new ccc.ClientPublicMainnet()
  : new ccc.ClientPublicTestnet();
export const ckbSigner = new ccc.SignerCkbPrivateKey(
  ckbClient,
  process.env.CKB_SECP256K1_PRIVATE_KEY!
);

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
export const utxoBasedAccountAddress = utxoBasedAccount.from;

export const utxoBasedWallet = new BtcWallet(
  utxoBasedAccount,
  btcAssetsApiUrl,
  btcAssetsApiToken,
  btcAssetsApiOrigin
);

export const rgbppClient = new Rgbpp(utxoBasedNetwork.name, utxoBasedWallet);
