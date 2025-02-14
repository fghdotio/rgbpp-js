export interface SimpleBtcClient {
  getTransactionHex(txId: string): Promise<string>;
}
