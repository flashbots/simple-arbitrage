import * as _ from "lodash";
import { BigNumber, Contract, Wallet, utils, ethers } from "ethers";
import { FlashbotsBundleProvider } from "@flashbots/ethers-provider-bundle";
import { WETH_ADDRESS } from "./addresses";
import { EthMarket } from "./EthMarket";
import { ETHER, bigNumberToDecimal } from "./utils";

export interface CrossedMarketDetails {
  profit: BigNumber,
  volume: BigNumber,
  tokenAddress: string,
  buyFromMarket: EthMarket,
  sellToMarket: EthMarket,
}

export type MarketsByToken = { [tokenAddress: string]: Array<EthMarket> }

// TODO: implement binary search (assuming linear/exponential global maximum profitability)
const TEST_VOLUMES = [
  ETHER.mul(5),
  ETHER.mul(10),
  ETHER.mul(15),
  ETHER.mul(20),
  ETHER.mul(25),
  ETHER.mul(30),
  ETHER.mul(35),
  ETHER.mul(40),
  ETHER.mul(45),
  ETHER.mul(50),
  ETHER.mul(75),
  ETHER.mul(100),
  ETHER.mul(150),
  ETHER.mul(200),
  ETHER.mul(250),
  ETHER.mul(300),
  ETHER.mul(350),
  ETHER.mul(400),
  ETHER.mul(450),
  ETHER.mul(500),
  ETHER.mul(750),
  ETHER.mul(1000)
]

const flashloanFeePercentage = 9 // (0.09%) or 9/10000
export function getBestCrossedMarket(crossedMarkets: Array<EthMarket>[], tokenAddress: string): CrossedMarketDetails | undefined {
  let bestCrossedMarket: CrossedMarketDetails | undefined = undefined;
  for (const crossedMarket of crossedMarkets) {
    const sellToMarket = crossedMarket[0]
    const buyFromMarket = crossedMarket[1]
    for (const size of TEST_VOLUMES) {
      const tokensOutFromBuyingSize = buyFromMarket.getTokensOut(WETH_ADDRESS, tokenAddress, size);
      const proceedsFromSellingTokens = sellToMarket.getTokensOut(tokenAddress, WETH_ADDRESS, tokensOutFromBuyingSize)
      const profit = proceedsFromSellingTokens.sub(size);
      if (bestCrossedMarket !== undefined && profit.lt(bestCrossedMarket.profit)) {
        // If the next size up lost value, meet halfway. TODO: replace with real binary search
        const trySize = size.add(bestCrossedMarket.volume).div(2)
        const tryTokensOutFromBuyingSize = buyFromMarket.getTokensOut(WETH_ADDRESS, tokenAddress, trySize);
        const tryProceedsFromSellingTokens = sellToMarket.getTokensOut(tokenAddress, WETH_ADDRESS, tryTokensOutFromBuyingSize)
        const tryProfit = tryProceedsFromSellingTokens.sub(trySize);
        if (tryProfit.gt(bestCrossedMarket.profit)) {
          bestCrossedMarket = {
            volume: trySize,
            profit: tryProfit,
            tokenAddress,
            sellToMarket,
            buyFromMarket
          }
        }
        break;
      }
      bestCrossedMarket = {
        volume: size,
        profit: profit,
        tokenAddress,
        sellToMarket,
        buyFromMarket
      }
    }
  }
  return bestCrossedMarket;
}

export class Arbitrage {
  private flashbotsProvider: FlashbotsBundleProvider;
  private bundleExecutorContract: Contract;
  private executorWallet: Wallet;

  constructor(executorWallet: Wallet, flashbotsProvider: FlashbotsBundleProvider, bundleExecutorContract: Contract) {
    this.executorWallet = executorWallet;
    this.flashbotsProvider = flashbotsProvider;
    this.bundleExecutorContract = bundleExecutorContract;
  }

  static printCrossedMarket(crossedMarket: CrossedMarketDetails): void {
    const buyTokens = crossedMarket.buyFromMarket.tokens
    const sellTokens = crossedMarket.sellToMarket.tokens
    console.log(
      `Profit: ${bigNumberToDecimal(crossedMarket.profit)} Volume: ${bigNumberToDecimal(crossedMarket.volume)}\n` +
      `${crossedMarket.buyFromMarket.protocol} (${crossedMarket.buyFromMarket.marketAddress})\n` +
      `  ${buyTokens[0]} => ${buyTokens[1]}\n` +
      `${crossedMarket.sellToMarket.protocol} (${crossedMarket.sellToMarket.marketAddress})\n` +
      `  ${sellTokens[0]} => ${sellTokens[1]}\n` +
      `\n`
    )
  }


  async evaluateMarkets(marketsByToken: MarketsByToken): Promise<Array<CrossedMarketDetails>> {
    const bestCrossedMarkets = new Array<CrossedMarketDetails>()

    for (const tokenAddress in marketsByToken) {
      const markets = marketsByToken[tokenAddress]
      const pricedMarkets = _.map(markets, (ethMarket: EthMarket) => {
        return {
          ethMarket: ethMarket,
          buyTokenPrice: ethMarket.getTokensIn(tokenAddress, WETH_ADDRESS, ETHER.div(100)),
          sellTokenPrice: ethMarket.getTokensOut(WETH_ADDRESS, tokenAddress, ETHER.div(100)),
        }
      });

      const crossedMarkets = new Array<Array<EthMarket>>()
      for (const pricedMarket of pricedMarkets) {
        _.forEach(pricedMarkets, pm => {
          if (pm.sellTokenPrice.gt(pricedMarket.buyTokenPrice)) {
            crossedMarkets.push([pricedMarket.ethMarket, pm.ethMarket])
          }
        })
      }

      const bestCrossedMarket = getBestCrossedMarket(crossedMarkets, tokenAddress);
      if (bestCrossedMarket !== undefined && bestCrossedMarket.profit.gt(ETHER.div(100))) {
        bestCrossedMarkets.push(bestCrossedMarket)
      }
    }
    bestCrossedMarkets.sort((a, b) => a.profit.lt(b.profit) ? 1 : a.profit.gt(b.profit) ? -1 : 0)
    return bestCrossedMarkets
  }

  // TODO: take more than 1
  async takeCrossedMarkets(bestCrossedMarkets: CrossedMarketDetails[], blockNumber: number, minerRewardPercentage: number): Promise<void> {
    for (const bestCrossedMarket of bestCrossedMarkets) {
      const buyCalls = await bestCrossedMarket.buyFromMarket.sellTokensToNextMarket(WETH_ADDRESS, bestCrossedMarket.volume, bestCrossedMarket.sellToMarket);
      const inter = bestCrossedMarket.buyFromMarket.getTokensOut(WETH_ADDRESS, bestCrossedMarket.tokenAddress, bestCrossedMarket.volume)
      const sellCallData = await bestCrossedMarket.sellToMarket.sellTokens(bestCrossedMarket.tokenAddress, inter, this.bundleExecutorContract.address);

      const targets: Array<string> = [...buyCalls.targets, bestCrossedMarket.sellToMarket.marketAddress]
      const payloads: Array<string> = [...buyCalls.data, sellCallData]
      const flashloanFee = bestCrossedMarket.volume.mul(flashloanFeePercentage).div(10000);
      if (flashloanFee.lt(bestCrossedMarket.profit)){
        const profitMinusFee = bestCrossedMarket.profit.sub(flashloanFee)
        
        try {
          const minerReward = profitMinusFee.mul(minerRewardPercentage).div(100);
          const profitMinusFeeMinusMinerReward = profitMinusFee.sub(minerReward)
          console.log("Send this much WETH", bestCrossedMarket.volume.toString(), "get this much profit after fees", profitMinusFeeMinusMinerReward.toString())
      
          const ethersAbiCoder = new utils.AbiCoder()
          const typeParams = ['uint256', 'address[]', 'bytes[]']
          const inputParams = [minerReward.toString(), targets, payloads]
          const params = ethersAbiCoder.encode(typeParams, inputParams)
          console.log({targets, payloads})
        
          if (profitMinusFeeMinusMinerReward.gt(0)){
  
            const transaction = await this.bundleExecutorContract.populateTransaction.flashloan(WETH_ADDRESS, bestCrossedMarket.volume, params, {
              gasPrice: BigNumber.from(0),
              gasLimit: BigNumber.from(1400000),
            });
      
            try {
              const estimateGas = await this.bundleExecutorContract.provider.estimateGas(
                {
                  ...transaction,
                  from: this.executorWallet.address
                })
              if (estimateGas.gt(1400000)) {
                console.log("EstimateGas succeeded, but suspiciously large: " + estimateGas.toString())
                continue
              }
              transaction.gasLimit = estimateGas.mul(2)
            } catch (e) {
              console.warn(`Estimate gas failure for ${JSON.stringify(bestCrossedMarket)}`)
              continue
            }
            const bundlePromises = _.map([blockNumber + 1, blockNumber + 2], targetBlockNumber =>
              this.flashbotsProvider.sendBundle(
                [
                  {
                    signer: this.executorWallet,
                    transaction: transaction
                  }
                ],
                targetBlockNumber
              )
            )
            await Promise.all(bundlePromises)
  
          } else {
            console.log("Transaction would be unprofitable after the flashloan fee and miner reward.")
            continue
          }
        
        } catch (e) {
          console.warn("Error setting miner and flashloan payment:", e);
        }
      } else {
        console.log("Flashloan fee is greater than profit.")
      }

      return
    }
    throw new Error("No arbitrage submitted to relay")
  }

}
