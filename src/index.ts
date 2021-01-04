import { FlashbotsBundleProvider } from "@flashbots/ethers-provider-bundle";
import { Contract, providers, Wallet } from "ethers";
import { BUNDLE_EXECUTOR_ABI } from "./abi";
import { UniswappyV2EthPair } from "./UniswappyV2EthPair";
import { FACTORY_ADDRESSES } from "./addresses";
import { Arbitrage } from "./Arbitrage";
import { get } from "https"

const ETHEREUM_RPC_URL = process.env.ETHEREUM_RPC_URL || "http://127.0.0.1:8545"
const FLASHBOTS_RPC_URL = process.env.FLASHBOTS_RPC_URL || ""
const PRIVATE_KEY = process.env.PRIVATE_KEY || ""
const BUNDLE_EXECUTOR_ADDRESS = process.env.BUNDLE_EXECUTOR_ADDRESS || ""

if (FLASHBOTS_RPC_URL === "") {
  console.warn("Must provide FLASHBOTS_RPC_URL environment variable. Please see: INSERT_URL")
  process.exit(1)
}
if (PRIVATE_KEY === "") {
  console.warn("Must provide PRIVATE_KEY environment variable")
  process.exit(1)
}
if (BUNDLE_EXECUTOR_ADDRESS === "") {
  console.warn("Must provide BUNDLE_EXECUTOR_ADDRESS environment variable. Please see README.md")
  process.exit(1)
}

const HEALTHCHECK_URL = process.env.HEALTHCHECK_URL || ""

const NETWORK_INFO = {chainId: 1, ensAddress: '', name: 'mainnet'}
const provider = new providers.JsonRpcProvider(ETHEREUM_RPC_URL);

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
    new FlashbotsBundleProvider(provider, FLASHBOTS_RPC_URL, NETWORK_INFO),
    new Contract(BUNDLE_EXECUTOR_ADDRESS, BUNDLE_EXECUTOR_ABI, provider) )

  provider.on('block', async (blockNumber) => {
    await UniswappyV2EthPair.updateReserves(provider, markets.allMarketPairs);
    const bestCrossedMarkets = await arbitrage.evaluateMarkets(markets.marketsByToken);
    if (bestCrossedMarkets.length === 0) {
      console.log("No crossed markets")
      return
    }
    bestCrossedMarkets.forEach(Arbitrage.printCrossedMarket);
    arbitrage.takeCrossedMarkets(bestCrossedMarkets, blockNumber).then(healthcheck).catch(console.error)
  })
}

main();
