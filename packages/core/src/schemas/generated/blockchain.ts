// This file is generated by @ckb-lumos/molecule, please do not modify it manually.
/* eslint-disable */
import { bytes, createFixedBytesCodec, molecule } from "@ckb-lumos/codec";
import { Uint128, Uint32, Uint64 } from "../customized.js";

const { array, vector, union, option, struct, table, byteVecOf } = molecule;

const fallbackBytesCodec = byteVecOf({
  pack: bytes.bytify,
  unpack: bytes.hexify,
});

function createFallbackFixedBytesCodec(byteLength: number) {
  return createFixedBytesCodec({
    pack: bytes.bytify,
    unpack: bytes.hexify,
    byteLength,
  });
}

const byte = createFallbackFixedBytesCodec(1);

export const Byte32 = createFallbackFixedBytesCodec(32);

export const Uint256 = createFallbackFixedBytesCodec(32);

export const Bytes = fallbackBytesCodec;

export const BytesOpt = option(Bytes);

export const BytesOptVec = vector(BytesOpt);

export const BytesVec = vector(Bytes);

export const Byte32Vec = vector(Byte32);

export const ProposalShortId = createFallbackFixedBytesCodec(10);

export const ProposalShortIdVec = vector(ProposalShortId);

export const Script = table(
  {
    codeHash: Byte32,
    hashType: byte,
    args: Bytes,
  },
  ["codeHash", "hashType", "args"],
);

export const OutPoint = struct(
  {
    txHash: Byte32,
    index: Uint32,
  },
  ["txHash", "index"],
);

export const CellInput = struct(
  {
    since: Uint64,
    previousOutput: OutPoint,
  },
  ["since", "previousOutput"],
);

export const CellDep = struct(
  {
    outPoint: OutPoint,
    depType: byte,
  },
  ["outPoint", "depType"],
);

export const RawHeader = struct(
  {
    version: Uint32,
    compactTarget: Uint32,
    timestamp: Uint64,
    number: Uint64,
    epoch: Uint64,
    parentHash: Byte32,
    transactionsRoot: Byte32,
    proposalsHash: Byte32,
    extraHash: Byte32,
    dao: Byte32,
  },
  [
    "version",
    "compactTarget",
    "timestamp",
    "number",
    "epoch",
    "parentHash",
    "transactionsRoot",
    "proposalsHash",
    "extraHash",
    "dao",
  ],
);

export const Header = struct(
  {
    raw: RawHeader,
    nonce: Uint128,
  },
  ["raw", "nonce"],
);

export const UncleBlock = table(
  {
    header: Header,
    proposals: ProposalShortIdVec,
  },
  ["header", "proposals"],
);

export const CellbaseWitness = table(
  {
    lock: Script,
    message: Bytes,
  },
  ["lock", "message"],
);

export const WitnessArgs = table(
  {
    lock: BytesOpt,
    inputType: BytesOpt,
    outputType: BytesOpt,
  },
  ["lock", "inputType", "outputType"],
);

export const ScriptOpt = option(Script);

export const UncleBlockVec = vector(UncleBlock);

export const CellDepVec = vector(CellDep);

export const CellInputVec = vector(CellInput);

export const CellOutput = table(
  {
    capacity: Uint64,
    lock: Script,
    type_: ScriptOpt,
  },
  ["capacity", "lock", "type_"],
);

export const CellOutputVec = vector(CellOutput);

export const RawTransaction = table(
  {
    version: Uint32,
    cellDeps: CellDepVec,
    headerDeps: Byte32Vec,
    inputs: CellInputVec,
    outputs: CellOutputVec,
    outputsData: BytesVec,
  },
  ["version", "cellDeps", "headerDeps", "inputs", "outputs", "outputsData"],
);

export const Transaction = table(
  {
    raw: RawTransaction,
    witnesses: BytesVec,
  },
  ["raw", "witnesses"],
);

export const TransactionVec = vector(Transaction);

export const Block = table(
  {
    header: Header,
    uncles: UncleBlockVec,
    transactions: TransactionVec,
    proposals: ProposalShortIdVec,
  },
  ["header", "uncles", "transactions", "proposals"],
);

export const BlockV1 = table(
  {
    header: Header,
    uncles: UncleBlockVec,
    transactions: TransactionVec,
    proposals: ProposalShortIdVec,
    extension: Bytes,
  },
  ["header", "uncles", "transactions", "proposals", "extension"],
);
