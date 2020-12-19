import { FlashbotsBundleProvider } from "@flashbots/ethers-provider-bundle";
import { providers, Contract, BigNumber, Wallet , ContractInterface } from "ethers";
import { Interface } from "@ethersproject/abi";
import * as _ from "lodash"
import { exec } from "child_process";

const provider = new providers.JsonRpcProvider("http://127.0.0.1:8545");

provider.on('block', (a) => {
  console.log("FFFFF", a)
})

const flashbotsProvider = new FlashbotsBundleProvider(provider, "http://127.0.0.1:8545");

const WETH_ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';

interface CrossedMarketDetails {
  profit: BigNumber,
  volume: BigNumber,
  tokenAddress: string,
  buyFromMarket: UniswappyV2EthPair,
  sellToMarket: UniswappyV2EthPair,
}

const PRIVATE_KEY = "0xeee0739021f9f3dcc77a7c20cad4f1b6c1518d6e913b61e4ad7dc3d441d47b65" // BAD
let executorWallet = new Wallet(PRIVATE_KEY);

console.log(executorWallet.address)

const BUNDLE_EXECUTOR_ADDRESS = '0xc35D77d25d81be78Ad60Ce14FEA7c92D438782E3' //
const BUNDLE_EXECUTOR_ABI: ContractInterface = []
const bundleExecutorContract = new Contract(BUNDLE_EXECUTOR_ADDRESS, BUNDLE_EXECUTOR_ABI, provider);

const SUSHISWAP_FACTORY_ADDRESS = '0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac';
const UNISWAP_FACTORY_ADDRESS = '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f';
const CONTRACT_ADDRESS = '0x5EF1009b9FCD4fec3094a5564047e190D72Bd511'

const ABI = [{"inputs": [{"internalType": "contract UniswapV2Factory", "name": "_uniswapFactory", "type": "address"}, {"internalType": "uint256", "name": "_start", "type": "uint256"}, {"internalType": "uint256", "name": "_stop", "type": "uint256"}], "name": "getPairsByIndexRange", "outputs": [{"internalType": "address[3][]", "name": "", "type": "address[3][]"}], "stateMutability": "view", "type": "function"}, {"inputs": [{"internalType": "contract IUniswapV2Pair[]", "name": "_pairs", "type": "address[]"}], "name": "getReservesByPairs", "outputs": [{"internalType": "uint256[3][]", "name": "", "type": "uint256[3][]"}], "stateMutability": "view", "type": "function"}]

const uniswapQuery = new Contract(CONTRACT_ADDRESS, ABI, provider);

const BATCH_SIZE = 1000
const ETHER = BigNumber.from(10).pow(18);

const allMarketPairs = new Array<UniswappyV2EthPair>()

const marketsByToken: {[tokenAddress: string]: Array<UniswappyV2EthPair>} = {}

async function getUniswappyMarkets(factoryAddress: string): Promise<Array<UniswappyV2EthPair>> {
  const marketPairs = new Array<UniswappyV2EthPair>()
  for (let i = 0; i < 3 * BATCH_SIZE; i += BATCH_SIZE) {
    const pairs: Array<Array<string>> = (await uniswapQuery.functions.getPairsByIndexRange(factoryAddress, i, i + BATCH_SIZE))[0];
    const pairAddress = pairs.map(f => f[2])
    const reserves: Array<Array<BigNumber>> = (await uniswapQuery.functions.getReservesByPairs(pairAddress))[0];

    for (let i = 0; i < pairs.length; i++) {
      const pair = pairs[i];
      const balances = reserves[i];
      const marketAddress = pair[2];
      let tokenAddress: string;

      if (pair[0] === WETH_ADDRESS) {
        if (balances[0].lt(ETHER)) {
          continue
        }
        tokenAddress = pair[1]
      } else if (pair[1] === WETH_ADDRESS) {
        if (balances[1].lt(ETHER)) {
          continue
        }
        tokenAddress = pair[0]
      } else {
        continue;
      }
      let uniswappyV2EthPair = new UniswappyV2EthPair(marketAddress, [pair[0], pair[1]], [balances[0], balances[1]]);
      allMarketPairs.push(uniswappyV2EthPair);
      marketPairs.push(uniswappyV2EthPair);
      if (marketsByToken[tokenAddress] === undefined) marketsByToken[tokenAddress] = new Array<UniswappyV2EthPair>()
      marketsByToken[tokenAddress].push(uniswappyV2EthPair)
    }
    if (pairs.length < BATCH_SIZE) {
      break
    }
  }

  return marketPairs
}

async function extracted() {
  const croSwapPairs = await getUniswappyMarkets("0x9DEB29c9a4c7A88a3C0257393b7f3335338D9A9D");
  // console.log(croSwapPairs);
  // croSwapPairs[0].exchangeCall("", ETHER, "0x0000000000000000000000000000000000000000")
  const zeusSwapPairs = await getUniswappyMarkets("0xbdda21dd8da31d5bee0c9bb886c044ebb9b8906a");
  // console.log(zeusSwapPairs);
  const luaSwapPairs = await getUniswappyMarkets("0x0388c1e0f210abae597b7de712b9510c6c36c857");
  // console.log(luaSwapPairs);

  const sushiSwapPairs = await getUniswappyMarkets(SUSHISWAP_FACTORY_ADDRESS);
  // console.log(sushiSwapPairs);
  const uniSwapPairs = await getUniswappyMarkets(UNISWAP_FACTORY_ADDRESS);
  console.log("uniswaps: ", uniSwapPairs.length);

  const f = _.pickBy(marketsByToken, i => i.length > 1);
  // console.log(f)

  const bestCrossedMarkets = new Array<CrossedMarketDetails>()

  for (const tokenAddress in f) {
    const markets = marketsByToken[tokenAddress]
    // let bestBuy
    let pricedMarkets = _.map(markets, (uniswapPair: UniswappyV2EthPair) => {
      return {
        uniswapPair,
        buyTokenPrice: uniswapPair.getTokensIn(tokenAddress, WETH_ADDRESS, ETHER.div(100)),
        sellTokenPrice: uniswapPair.getTokensOut(WETH_ADDRESS, tokenAddress, ETHER.div(100)),
      }
    });

    const crossedMarkets = new Array<Array<UniswappyV2EthPair>>()
    for (const pricedMarket of pricedMarkets) {
        _.forEach(pricedMarkets, pm => {
          if (pm.sellTokenPrice.gt(pricedMarket.buyTokenPrice)) {
            // console.log(pm, pricedMarket)
            crossedMarkets.push([pricedMarket.uniswapPair, pm.uniswapPair])
          }
        })
    }

    const SIZES = [
      ETHER.div(100),
      ETHER.div(10),
      ETHER.div(6),
      ETHER.div(4),
      ETHER.div(2),
      ETHER.div(1),
      ETHER.mul(2),
      ETHER.mul(5),
      ETHER.mul(10),
    ]

    let bestCrossedMarket: CrossedMarketDetails|undefined = undefined
    // let currentBestProfit = BigNumber.from(0)
    // let currentVolume = BigNumber.from(0)
    // let bestBuyFromMarket: UniswappyV2EthPair|undefined = undefined
    // let bestSellToMarket: UniswappyV2EthPair|undefined = undefined
    for (const crossedMarket of crossedMarkets) {
      // console.log("crossed market ", tokenAddress, JSON.stringify(crossedMarkets, null, 2))
      const sellToMarket = crossedMarket[0]
      const buyFromMarket = crossedMarket[1]
      for (const size of SIZES) {
        const tokensOutFromBuyingSize = buyFromMarket.getTokensOut(WETH_ADDRESS, tokenAddress, size);
        const proceedsFromSellingTokens = sellToMarket.getTokensOut(tokenAddress, WETH_ADDRESS, tokensOutFromBuyingSize)
        const profit = proceedsFromSellingTokens.sub(size);
        console.log(size.toString(), profit.toString());
        // bestBuyFromMarket = buyFromMarket
        // bestSellToMarket = sellToMarket
        if (bestCrossedMarket !== undefined && profit.lt(bestCrossedMarket.profit)) {
          console.log("profit went down, meet half way");
          const trySize = size.add(bestCrossedMarket.volume).div(2)
          const tryTokensOutFromBuyingSize = buyFromMarket.getTokensOut(WETH_ADDRESS, tokenAddress, trySize);
          const tryProceedsFromSellingTokens = sellToMarket.getTokensOut(tokenAddress, WETH_ADDRESS, tryTokensOutFromBuyingSize)
          const tryProfit = tryProceedsFromSellingTokens.sub(trySize);
          if (tryProfit.gt(bestCrossedMarket!.profit)) {
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
    if (bestCrossedMarket !== undefined && bestCrossedMarket.profit.gt(ETHER.div(500))) {
      bestCrossedMarkets.push(bestCrossedMarket)
    }
  }
  if (bestCrossedMarkets.length === 0) return
  let globalBestCrossedMarket = _.reduce(bestCrossedMarkets, (crossedMarket, acc) => {
    return crossedMarket.profit.gt(acc.profit) ? crossedMarket : acc
  }, bestCrossedMarkets[0]);
  console.log(globalBestCrossedMarket)

  console.log("take this", globalBestCrossedMarket.profit.div(1e9).toNumber() / 1e9, globalBestCrossedMarket);
  console.log("Send this much WETH", globalBestCrossedMarket.volume.toString(), "get this much profit",globalBestCrossedMarket.profit.toString() )
  let buyCallData = await globalBestCrossedMarket.buyFromMarket.exchangeCall(WETH_ADDRESS, globalBestCrossedMarket.volume, globalBestCrossedMarket.sellToMarket.marketAddress);
  console.log(globalBestCrossedMarket.buyFromMarket.marketAddress , buyCallData)
  const inter = globalBestCrossedMarket.buyFromMarket.getTokensOut(WETH_ADDRESS, globalBestCrossedMarket.tokenAddress, globalBestCrossedMarket.volume)
  let sellCallData = await globalBestCrossedMarket.sellToMarket.exchangeCall(globalBestCrossedMarket.tokenAddress, inter, bundleExecutorContract.address);
  console.log(globalBestCrossedMarket.sellToMarket.marketAddress, sellCallData)
  console.log(`["${globalBestCrossedMarket.buyFromMarket.marketAddress}","${globalBestCrossedMarket.sellToMarket.marketAddress}"]` )
  console.log(`["${buyCallData}","${sellCallData}"]` )
}

extracted();

// console.log(flashbotsProvider)


abstract class EthMarket {
  get tokens(): Array<string> {
    return this._tokens;
  }

  get marketAddress(): string {
    return this._marketAddress;
  }

  protected readonly _tokens: Array<string>;
  protected readonly _marketAddress: string;

  constructor(marketAddress: string, tokens: Array<string>) {
    this._marketAddress = marketAddress;
    this._tokens = tokens
  }

  // abstract getBestPrice(token: string): BigNumber;
}

const UNISWAP_PAIR_ABI = [{"inputs":[],"payable":false,"stateMutability":"nonpayable","type":"constructor"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"owner","type":"address"},{"indexed":true,"internalType":"address","name":"spender","type":"address"},{"indexed":false,"internalType":"uint256","name":"value","type":"uint256"}],"name":"Approval","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"sender","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount0","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"amount1","type":"uint256"},{"indexed":true,"internalType":"address","name":"to","type":"address"}],"name":"Burn","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"sender","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount0","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"amount1","type":"uint256"}],"name":"Mint","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"sender","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount0In","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"amount1In","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"amount0Out","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"amount1Out","type":"uint256"},{"indexed":true,"internalType":"address","name":"to","type":"address"}],"name":"Swap","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint112","name":"reserve0","type":"uint112"},{"indexed":false,"internalType":"uint112","name":"reserve1","type":"uint112"}],"name":"Sync","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"from","type":"address"},{"indexed":true,"internalType":"address","name":"to","type":"address"},{"indexed":false,"internalType":"uint256","name":"value","type":"uint256"}],"name":"Transfer","type":"event"},{"constant":true,"inputs":[],"name":"DOMAIN_SEPARATOR","outputs":[{"internalType":"bytes32","name":"","type":"bytes32"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"MINIMUM_LIQUIDITY","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"PERMIT_TYPEHASH","outputs":[{"internalType":"bytes32","name":"","type":"bytes32"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"internalType":"address","name":"","type":"address"},{"internalType":"address","name":"","type":"address"}],"name":"allowance","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"internalType":"address","name":"spender","type":"address"},{"internalType":"uint256","name":"value","type":"uint256"}],"name":"approve","outputs":[{"internalType":"bool","name":"","type":"bool"}],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"balanceOf","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"internalType":"address","name":"to","type":"address"}],"name":"burn","outputs":[{"internalType":"uint256","name":"amount0","type":"uint256"},{"internalType":"uint256","name":"amount1","type":"uint256"}],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"decimals","outputs":[{"internalType":"uint8","name":"","type":"uint8"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"factory","outputs":[{"internalType":"address","name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"getReserves","outputs":[{"internalType":"uint112","name":"_reserve0","type":"uint112"},{"internalType":"uint112","name":"_reserve1","type":"uint112"},{"internalType":"uint32","name":"_blockTimestampLast","type":"uint32"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"internalType":"address","name":"_token0","type":"address"},{"internalType":"address","name":"_token1","type":"address"}],"name":"initialize","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"kLast","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"internalType":"address","name":"to","type":"address"}],"name":"mint","outputs":[{"internalType":"uint256","name":"liquidity","type":"uint256"}],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"name","outputs":[{"internalType":"string","name":"","type":"string"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"nonces","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"internalType":"address","name":"owner","type":"address"},{"internalType":"address","name":"spender","type":"address"},{"internalType":"uint256","name":"value","type":"uint256"},{"internalType":"uint256","name":"deadline","type":"uint256"},{"internalType":"uint8","name":"v","type":"uint8"},{"internalType":"bytes32","name":"r","type":"bytes32"},{"internalType":"bytes32","name":"s","type":"bytes32"}],"name":"permit","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"price0CumulativeLast","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"price1CumulativeLast","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"internalType":"address","name":"to","type":"address"}],"name":"skim","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"internalType":"uint256","name":"amount0Out","type":"uint256"},{"internalType":"uint256","name":"amount1Out","type":"uint256"},{"internalType":"address","name":"to","type":"address"},{"internalType":"bytes","name":"data","type":"bytes"}],"name":"swap","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"symbol","outputs":[{"internalType":"string","name":"","type":"string"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[],"name":"sync","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"token0","outputs":[{"internalType":"address","name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"token1","outputs":[{"internalType":"address","name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"totalSupply","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"value","type":"uint256"}],"name":"transfer","outputs":[{"internalType":"bool","name":"","type":"bool"}],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"internalType":"address","name":"from","type":"address"},{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"value","type":"uint256"}],"name":"transferFrom","outputs":[{"internalType":"bool","name":"","type":"bool"}],"payable":false,"stateMutability":"nonpayable","type":"function"}]

interface TokenBalances {[tokenAddress: string]: BigNumber}

// const uniswapInterface = new Interface(UNISWAP_PAIR_ABI);
const uniswapInterface = new Contract(WETH_ADDRESS, UNISWAP_PAIR_ABI);

class UniswappyV2EthPair extends EthMarket {
  private _tokenBalances: TokenBalances

  // constructor(tokenBalances: TokenBalances) {
  //   this._tokenBalances = tokenBalances
  //   // this._ethReserve = BigNumber.from(0);
  //   // this._tokenReserve = BigNumber.from(0);
  // }

  constructor(marketAddress: string, tokens: Array<string>, balances: Array<BigNumber>) {
    super(marketAddress, tokens);
    this._tokenBalances = _.zipObject(tokens, balances)
  }

  setReserves(tokenBalances: TokenBalances): void {
    this._tokenBalances = tokenBalances
  }

  setReservesViaOrderedBalances(balances: Array<BigNumber>): void {
    this.setReservesViaMatchingArray(this._tokens, balances)
  }

  setReservesViaMatchingArray(tokens: Array<string>, balances: Array<BigNumber>): void {
    this._tokenBalances = _.zipObject(tokens, balances)
  }


  getTokensIn(tokenIn: string, tokenOut: string, amountOut: BigNumber): BigNumber {
    const reserveIn = this._tokenBalances[tokenIn]
    const reserveOut = this._tokenBalances[tokenOut]
    let amountIn = this.getAmountIn(reserveIn, reserveOut, amountOut);
    return amountIn;
  }

  getTokensOut(tokenIn: string, tokenOut: string, amountIn: BigNumber): BigNumber {
    const reserveIn = this._tokenBalances[tokenIn]
    const reserveOut = this._tokenBalances[tokenOut]
    return this.getAmountOut(reserveIn, reserveOut, amountIn);
  }

  getAmountIn(reserveIn: BigNumber, reserveOut: BigNumber, amountOut: BigNumber) {
    const numerator: BigNumber = reserveIn.mul(amountOut).mul(1000);
    const denominator: BigNumber = reserveOut.sub(amountOut).mul(997);
    return numerator.div(denominator).add(1);
  }

  getAmountOut(reserveIn: BigNumber, reserveOut: BigNumber, amountIn: BigNumber) {
    const amountInWithFee: BigNumber = amountIn.mul(997);
    const numerator = amountInWithFee.mul(reserveOut);
    const denominator = reserveIn.mul(1000).add(amountInWithFee);
    return numerator.div(denominator);
  }

  async exchangeCall(tokenIn: string, amountIn: BigNumber, recipient: string): Promise<string> {
    // function swap(uint amount0Out, uint amount1Out, address to, bytes calldata data) external lock {
    let amount0Out = BigNumber.from(0)
    let amount1Out = BigNumber.from(0)
    let tokenOut: string;
    if (tokenIn === this.tokens[0]) {
      tokenOut = this.tokens[1]
      amount1Out = this.getTokensOut(tokenIn, tokenOut, amountIn)
    } else if (tokenIn === this.tokens[1]) {
      tokenOut = this.tokens[0]
      amount0Out = this.getTokensOut(tokenIn, tokenOut, amountIn)
    } else {
      throw new Error("BADZ")
    }
    // const [amount0Out, amount1Out] = tokenIn === this.tokens[0] ? [0, 0]
    let populatedTransaction = await uniswapInterface.populateTransaction.swap(amount0Out, amount1Out, recipient, []);
    if (populatedTransaction === undefined || populatedTransaction.data === undefined ) throw new Error("HI")
    return populatedTransaction.data;
  }
}
