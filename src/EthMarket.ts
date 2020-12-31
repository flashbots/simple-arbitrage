import { BigNumber } from "ethers";

export interface TokenBalances {
  [tokenAddress: string]: BigNumber
}

export interface MultipleCallData {
  targets: Array<string>
  data: Array<string>
}

export interface CallDetails {
  target: string;
  data: string;
  value?: BigNumber;
}

export abstract class EthMarket {
  get tokens(): Array<string> {
    return this._tokens;
  }

  get marketAddress(): string {
    return this._marketAddress;
  }

  get protocol(): string {
    return this._protocol;
  }

  protected readonly _tokens: Array<string>;
  protected readonly _marketAddress: string;
  protected readonly _protocol: string;

  constructor(marketAddress: string, tokens: Array<string>, protocol: string) {
    this._marketAddress = marketAddress;
    this._tokens = tokens
    this._protocol = protocol;
  }


  abstract getTokensOut(tokenIn: string, tokenOut: string, amountIn: BigNumber): BigNumber;

  abstract getTokensIn(tokenIn: string, tokenOut: string, amountOut: BigNumber): BigNumber;

  abstract sellTokensToNextMarket(tokenIn: string, amountIn: BigNumber, ethMarket: EthMarket): Promise<MultipleCallData>

  abstract sellTokens(tokenIn: string, amountIn: BigNumber, recipient: string): Promise<string>

  abstract receiveDirectly(tokenAddress: string): boolean;

  abstract prepareReceive(tokenAddress: string, amountIn: BigNumber): Promise<Array<CallDetails>>
}
