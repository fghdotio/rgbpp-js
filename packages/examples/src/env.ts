import { ccc } from "@ckb-ccc/core";

import dotenv from "dotenv";

import { fileURLToPath } from "url";
import { dirname } from "path";

import {
  RgbppXudtLikeClient,
  isMainnet,
  networkConfigs,
  CkbRgbppUnlockSinger,
} from "@rgbpp-js/core";
import {
  createBtcAccount,
  RgbppBtcWallet,
  AddressType,
} from "@rgbpp-js/bitcoin";

dotenv.config({ path: dirname(fileURLToPath(import.meta.url)) + "/.env" });

const utxoBasedChainName = process.env.UTXO_BASED_CHAIN_NAME!;
export const utxoBasedNetwork = networkConfigs[utxoBasedChainName];
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
  utxoBasedNetwork.name
);
export const utxoBasedAccountAddress = utxoBasedAccount.from;

export const rgbppXudtLikeClient = new RgbppXudtLikeClient(
  utxoBasedNetwork.name,
  ckbClient
);

export const rgbppBtcWallet = new RgbppBtcWallet(
  utxoBasedChainPrivateKey,
  addressType,
  utxoBasedNetwork.name,
  {
    url: btcAssetsApiUrl,
    token: btcAssetsApiToken,
    origin: btcAssetsApiOrigin,
  }
);

export const createCkbRgbppUnlockSinger = (
  btcTxId: string,
  rawBtcTxHex: string,
  committedInputLength: number,
  committedOutputLength: number
) => {
  return new CkbRgbppUnlockSinger(
    ckbClient,
    ckbSigner,
    rgbppBtcWallet,
    rgbppXudtLikeClient.getRgbppScriptsDetail(),
    btcTxId,
    rawBtcTxHex,
    committedInputLength,
    committedOutputLength
  );
};
