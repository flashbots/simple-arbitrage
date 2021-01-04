import { UniswappyV2EthPair } from "../src/UniswappyV2EthPair"
import { WETH_ADDRESS } from "../src/addresses"
import { BigNumber } from "ethers";
import { ETHER } from "../src/utils";

const MARKET_ADDRESS = "0x0000000000000000000000000000000000000001"
const TOKEN_ADDRESS = "0x000000000000000000000000000000000000000a"
const PROTOCOL_NAME = "TEST";

describe('UniswappyV2EthPair', function() {
  let wethPair: UniswappyV2EthPair
  beforeEach(() => {
    wethPair = new UniswappyV2EthPair(MARKET_ADDRESS, [TOKEN_ADDRESS, WETH_ADDRESS], PROTOCOL_NAME);
    wethPair.setReservesViaOrderedBalances([ETHER, ETHER.mul(2)])
  })
  it('fetch balances by token address', function() {
    expect(wethPair.getBalance(TOKEN_ADDRESS)).toEqual(ETHER);
    expect(wethPair.getBalance(WETH_ADDRESS)).toEqual(ETHER.mul(2));
  });
  it('get token input required for output', function() {
    expect(wethPair.getTokensIn(TOKEN_ADDRESS, WETH_ADDRESS, ETHER.div(10))).toEqual(BigNumber.from("52789948793749671"));
    expect(wethPair.getTokensIn(WETH_ADDRESS, TOKEN_ADDRESS, ETHER.div(10))).toEqual(BigNumber.from("222890894906943052"));
  });
  it('get token output from input', function() {
    expect(wethPair.getTokensOut(TOKEN_ADDRESS, WETH_ADDRESS, BigNumber.from("52789948793749671"))).toEqual(ETHER.div(10).add(1));
    expect(wethPair.getTokensOut(WETH_ADDRESS, TOKEN_ADDRESS, BigNumber.from("222890894906943052"))).toEqual(ETHER.div(10));
  });
});
