// TX_ID_PLACEHOLDER must be all zeros (see https://github.com/fghdotio/rgbpp/blob/main/contracts/rgbpp-lock/src/main.rs#L228)
export const TX_ID_PLACEHOLDER =
  "0000000000000000000000000000000000000000000000000000000000000000";

export const BTC_TX_PSEUDO_INDEX = 0xffffffff; // 4,294,967,295 (max u32)

export const XUDT_LIKE_ISSUANCE_OUTPUT_INDEX = 1;

export const XUDT_LIKE_LEAP_FROM_BTC_OUTPUT_INDEX = 1;

export const UNIQUE_TYPE_OUTPUT_INDEX = 1;

export const DEFAULT_CONFIRMATIONS = 6;

export const RGBPP_CKB_WITNESS_PLACEHOLDER = "RGBPP_CKB_WITNESS_PLACEHOLDER";

// TODO ? extra is needed to cover spore co-build witness; check this out, in most cases, this value does not matter since fee signer is independent now
export const RGBPP_CKB_WITNESS_LENGTH = 2000;

export const RGBPP_MAX_CELL_NUM = 255;

export const RGBPP_UNLOCK_PARAMS_IDENTIFIER = "RGBPP_UNLOCK_PARAMS";
