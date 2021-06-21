simple-arbitrage
================
This repository contains a simple, mechanical system for discovering, evaluating, rating, and submitting arbitrage opportunities to the Flashbots bundle endpoint. This script is very unlikely to be profitable, as many users have access to it, and it is targeting well-known Ethereum opportunities.

simple-arbitrage uses Flashloans to source liquidity to execute on arbitrage opportunities it finds. It attempts to capture them and sends any profits made, net of fees, back to the message sender. We have deployed a contract that anyone can submit trades to here:

You do not need any Ethereum to use this contract.

We hope you will use this repository as an example of how to integrate Flashbots into your own Flashbot searcher (bot). For more information, see the [Flashbots Searcher FAQ](https://github.com/flashbots/pm/blob/main/guides/searcher-onboarding.md)

Environment Variables
=====================
- **ETHEREUM_RPC_URL** - Ethereum RPC endpoint. Can not be the same as FLASHBOTS_RPC_URL
- **PRIVATE_KEY** - Private key for the Ethereum EOA that will be submitting Flashbots Ethereum transactions
- **FLASHBOTS_RELAY_SIGNING_KEY** _[Optional, default: random]_ - Flashbots submissions require an Ethereum private key to sign transaction payloads. This newly-created account does not need to hold any funds or correlate to any on-chain activity, it just needs to be used across multiple Flashbots RPC requests to identify requests related to same searcher. Please see https://docs.flashbots.net/flashbots-auction/searchers/faq#do-i-need-authentication-to-access-the-flashbots-relay
- **HEALTHCHECK_URL** _[Optional]_ - Health check URL, hit only after successfully submitting a bundle.
- **MINER_REWARD_PERCENTAGE** _[Optional, default 80]_ - 0 -> 100, what percentage of overall profitability to send to miner.

Usage
======================
1. Generate a new bot wallet address and extract the private key into a raw 32-byte format.
2. Run simple-arbitage using the new private key from step (1) as an environment varaible.

```
$ npm install
$ ETHEREUM_RPC_URL=__ETHEREUM_RPC_URL_FROM_ABOVE__ \
    PRIVATE_KEY=__PRIVATE_KEY_FROM_ABOVE__ \
    FLASHBOTS_RELAY_SIGNING_KEY=__RANDOM_ETHEREUM_PRIVATE_KEY__ \
      npm run start
```
