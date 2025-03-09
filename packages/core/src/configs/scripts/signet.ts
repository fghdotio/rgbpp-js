import { ccc } from "@ckb-ccc/shell";

import {
  CellDepSet,
  PredefinedScriptName,
  ScriptSet,
} from "../../types/script.js";

export const signetScripts: ScriptSet = {
  [PredefinedScriptName.RgbppLock]: ccc.Script.from({
    codeHash:
      "0xd07598deec7ce7b5665310386b4abd06a6d48843e953c5cc2112ad0d5a220364",
    hashType: "type",
    args: "",
  }),
  [PredefinedScriptName.BtcTimeLock]: ccc.Script.from({
    codeHash:
      "0x80a09eca26d77cea1f5a69471c59481be7404febf40ee90f886c36a948385b55",
    hashType: "type",
    args: "",
  }),
  [PredefinedScriptName.Xudt]: ccc.Script.from({
    codeHash:
      "0x25c29dc317811a6f6f3985a7a9ebc4838bd388d19d0feeecf0bcd60f6c0975bb",
    hashType: "type",
    args: "",
  }),
  [PredefinedScriptName.UniqueType]: ccc.Script.from({
    codeHash:
      "0x8e341bcfec6393dcd41e635733ff2dca00a6af546949f70c57a706c0f344df8b",
    hashType: "type",
    args: "",
  }),
};

export const signetCellDeps: CellDepSet = {
  [PredefinedScriptName.RgbppLock]: ccc.CellDep.from({
    outPoint: {
      txHash:
        "0x61efdeddbaa0bb4132c0eb174b3e8002ff5ec430f61ba46f30768d683c516eec",
      index: "0x0",
    },
    depType: "code",
  }),
  [PredefinedScriptName.BtcTimeLock]: ccc.CellDep.from({
    outPoint: {
      txHash:
        "0x5364b3535965e9eac9a35dd7af8e9e45a61d30a16e115923c032f80b28783e21",
      index: "0x0",
    },
    depType: "code",
  }),
  [PredefinedScriptName.Xudt]: ccc.CellDep.from({
    outPoint: {
      txHash:
        "0xbf6fb538763efec2a70a6a3dcb7242787087e1030c4e7d86585bc63a9d337f5f",
      index: "0x0",
    },
    depType: "code",
  }),
  [PredefinedScriptName.UniqueType]: ccc.CellDep.from({
    outPoint: {
      txHash:
        "0xff91b063c78ed06f10a1ed436122bd7d671f9a72ef5f5fa28d05252c17cf4cef",
      index: "0x0",
    },
    depType: "code",
  }),
};
