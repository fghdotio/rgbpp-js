import { ccc } from "@ckb-ccc/core";

import { Networks } from "../types/network.js";

export enum ScriptName {
  RgbppLock = "RgbppLock",
  // RgbppLockConfig = "RgbppLockConfig",
  BtcTimeLock = "BtcTimeLock",
  // BtcTimeLockConfig = "BtcTimeLockConfig",
  XudtLike = "XudtLike",
  UniqueType = "UniqueType",
  Secp256k1Blake160 = "Secp256k1Blake160",
}

const signetScripts = {
  [ScriptName.RgbppLock]: ccc.Script.from({
    codeHash:
      "0xd07598deec7ce7b5665310386b4abd06a6d48843e953c5cc2112ad0d5a220364",
    hashType: "type",
    args: "",
  }),
  [ScriptName.BtcTimeLock]: ccc.Script.from({
    codeHash:
      "0x80a09eca26d77cea1f5a69471c59481be7404febf40ee90f886c36a948385b55",
    hashType: "type",
    args: "",
  }),
  [ScriptName.XudtLike]: ccc.Script.from({
    codeHash:
      "0x25c29dc317811a6f6f3985a7a9ebc4838bd388d19d0feeecf0bcd60f6c0975bb",
    hashType: "type",
    args: "",
  }),
  [ScriptName.UniqueType]: ccc.Script.from({
    codeHash:
      "0x8e341bcfec6393dcd41e635733ff2dca00a6af546949f70c57a706c0f344df8b",
    hashType: "type",
    args: "",
  }),
  [ScriptName.Secp256k1Blake160]: {} as ccc.Script,
} as const;

const signetCellDeps = {
  [ScriptName.RgbppLock]: ccc.CellDep.from({
    outPoint: {
      txHash:
        "0x61efdeddbaa0bb4132c0eb174b3e8002ff5ec430f61ba46f30768d683c516eec",
      index: "0x0",
    },
    depType: "code",
  }),
  [ScriptName.BtcTimeLock]: ccc.CellDep.from({
    outPoint: {
      txHash:
        "0x5364b3535965e9eac9a35dd7af8e9e45a61d30a16e115923c032f80b28783e21",
      index: "0x0",
    },
    depType: "code",
  }),
  [ScriptName.XudtLike]: ccc.CellDep.from({
    outPoint: {
      txHash:
        "0xbf6fb538763efec2a70a6a3dcb7242787087e1030c4e7d86585bc63a9d337f5f",
      index: "0x0",
    },
    depType: "code",
  }),
  [ScriptName.UniqueType]: ccc.CellDep.from({
    outPoint: {
      txHash:
        "0xff91b063c78ed06f10a1ed436122bd7d671f9a72ef5f5fa28d05252c17cf4cef",
      index: "0x0",
    },
    depType: "code",
  }),
  [ScriptName.Secp256k1Blake160]: ccc.CellDep.from({
    outPoint: {
      txHash:
        "0xf8de3bb47d055cdf460d93a2a6e1b05f7432f9777c8c474abf4eec1d4aee5d37",
      index: "0x0",
    },
    depType: "depGroup",
  }),
} as const;

export const scripts = {
  [Networks.BitcoinSignet.name]: signetScripts,
  [Networks.BitcoinTestnet3.name]: {
    ...signetScripts,
    [ScriptName.RgbppLock]: ccc.Script.from({
      codeHash:
        "0x61ca7a4796a4eb19ca4f0d065cb9b10ddcf002f10f7cbb810c706cb6bb5c3248",
      hashType: "type",
      args: "",
    }),
    [ScriptName.BtcTimeLock]: ccc.Script.from({
      codeHash:
        "0x00cdf8fab0f8ac638758ebf5ea5e4052b1d71e8a77b9f43139718621f6849326",
      hashType: "type",
      args: "",
    }),
  },

  [Networks.BitcoinMainnet.name]: {},
  [Networks.DogecoinMainnet.name]: {},
  [Networks.DogecoinTestnet.name]: {},
} as const;

export const cellDeps = {
  [Networks.BitcoinSignet.name]: signetCellDeps,
  [Networks.BitcoinTestnet3.name]: {
    ...signetCellDeps,
    [ScriptName.RgbppLock]: ccc.CellDep.from({
      outPoint: {
        txHash:
          "0xf1de59e973b85791ec32debbba08dff80c63197e895eb95d67fc1e9f6b413e00",
        index: "0x0",
      },
      depType: "code",
    }),
    [ScriptName.BtcTimeLock]: ccc.CellDep.from({
      outPoint: {
        txHash:
          "0xde0f87878a97500f549418e5d46d2f7704c565a262aa17036c9c1c13ad638529",
        index: "0x0",
      },
      depType: "code",
    }),
  },

  [Networks.BitcoinMainnet.name]: {},
  [Networks.DogecoinMainnet.name]: {},
  [Networks.DogecoinTestnet.name]: {},
} as const;

export const deadLock = ccc.Script.from({
  codeHash:
    "0x0000000000000000000000000000000000000000000000000000000000000000",
  hashType: "data",
  args: "0x",
});
