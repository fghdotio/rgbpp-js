import { BtcAssetsApiContext } from "./types/index.js";

export enum ErrorCodes {
  UNKNOWN,

  ASSETS_API_RESPONSE_ERROR,
  ASSETS_API_UNAUTHORIZED,
  ASSETS_API_INVALID_PARAM,
  ASSETS_API_RESOURCE_NOT_FOUND,
  ASSETS_API_RESPONSE_DECODE_ERROR,

  OFFLINE_DATA_SOURCE_METHOD_NOT_AVAILABLE,
}

export const ErrorMessages = {
  [ErrorCodes.UNKNOWN]: "Unknown error",

  [ErrorCodes.ASSETS_API_UNAUTHORIZED]:
    "BtcAssetsAPI unauthorized, please check your token/origin",
  [ErrorCodes.ASSETS_API_INVALID_PARAM]:
    "Invalid param(s) was provided to the BtcAssetsAPI",
  [ErrorCodes.ASSETS_API_RESPONSE_ERROR]: "BtcAssetsAPI returned an error",
  [ErrorCodes.ASSETS_API_RESOURCE_NOT_FOUND]:
    "Resource not found on the BtcAssetsAPI",
  [ErrorCodes.ASSETS_API_RESPONSE_DECODE_ERROR]:
    "Failed to decode the response of BtcAssetsAPI",

  [ErrorCodes.OFFLINE_DATA_SOURCE_METHOD_NOT_AVAILABLE]:
    "Method not available for offline data source",
};

export class BtcAssetsApiError extends Error {
  public code = ErrorCodes.UNKNOWN;
  public message: string;
  public context?: BtcAssetsApiContext;

  constructor(payload: {
    code: ErrorCodes;
    message?: string;
    context?: BtcAssetsApiContext;
  }) {
    const message =
      payload.message ??
      ErrorMessages[payload.code] ??
      ErrorMessages[ErrorCodes.UNKNOWN];

    super(message);
    this.message = message;
    this.code = payload.code;
    this.context = payload.context;
    Object.setPrototypeOf(this, BtcAssetsApiError.prototype);
  }

  static withComment(
    code: ErrorCodes,
    comment?: string,
    context?: BtcAssetsApiContext,
  ): BtcAssetsApiError {
    const prefixMessage =
      ErrorMessages[code] ?? ErrorMessages[ErrorCodes.UNKNOWN];
    const message = comment ? `${prefixMessage}: ${comment}` : undefined;
    return new BtcAssetsApiError({ code, message, context });
  }
}

export class OfflineBtcAssetsDataSourceError extends Error {
  public code = ErrorCodes.UNKNOWN;

  constructor(errorCode: ErrorCodes, message?: string) {
    const msg =
      message ?? ErrorMessages[errorCode] ?? ErrorMessages[ErrorCodes.UNKNOWN];
    super(msg);
    this.code = errorCode;
    Object.setPrototypeOf(this, OfflineBtcAssetsDataSourceError.prototype);
  }
}
