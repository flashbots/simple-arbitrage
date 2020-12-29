import { FlashbotsBundleProvider } from "@flashbots/ethers-provider-bundle";
import { BigNumber, Contract, providers, Wallet } from "ethers";
import { BUNDLE_EXECUTOR_ABI } from "./abi";
import { UniswappyV2EthPair } from "./UniswappyV2EthPair";
import { BUNDLE_EXECUTOR_ADDRESS, FACTORY_ADDRESSES } from "./addresses";
import { Arbitrage } from "./Arbitrage";
import { get } from "https"

const ETHEREUM_URL = process.env.ETHEREUM_URL || "http://127.0.0.1:8545"
const FLASHBOTS_URL = process.env.FLASHBOTS_URL || ""
const PRIVATE_KEY = process.env.PRIVATE_KEY || ""

const HEALTHCHECK_URL = process.env.HEALTHCHECK_URL || ""

const NETWORK_INFO = {chainId: 1, ensAddress: '', name: 'mainnet'}
const provider = new providers.JsonRpcProvider(ETHEREUM_URL);

export function bigNumberToDecimal(value: BigNumber, base = 18): number {
  const divisor = BigNumber.from(10).pow(base)
  return value.mul(10000).div(divisor).toNumber() / 10000
}

function healthcheck() {
  if (HEALTHCHECK_URL === "") {
    return
  }
  get(HEALTHCHECK_URL).on('error', console.error);
}

async function main() {
  const markets = await UniswappyV2EthPair.getUniswapMarketsByToken(provider, FACTORY_ADDRESSES);
  const arbitrage = new Arbitrage(
    new Wallet(PRIVATE_KEY),
    new FlashbotsBundleProvider(provider, FLASHBOTS_URL, NETWORK_INFO),
    new Contract(BUNDLE_EXECUTOR_ADDRESS, BUNDLE_EXECUTOR_ABI, provider) )

  provider.on('block', async (blockNumber) => {
    await UniswappyV2EthPair.updateReserves(provider, markets.allMarketPairs);
    const bestCrossedMarkets = await arbitrage.evaluateMarkets(markets.marketsByToken);
    if (bestCrossedMarkets.length === 0) {
      console.log("No crossed markets")
      return
    }
    bestCrossedMarkets.forEach(Arbitrage.printCrossedMarket);
    await arbitrage.takeCrossedMarkets(bestCrossedMarkets, blockNumber);
    healthcheck()
  })
}

main();
