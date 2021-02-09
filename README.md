simple-arbitrage
================
This repository contains a simple, mechanical system for discovering, evaluating, rating, and submitting arbitrage opportunities to the Flashbots bundle endpoint. This script is very unlikely to be profitable, as many users have access to it, and it is targeting well-known Ethereum opportunities.

We hope you will use this repository as an example of how to integrate Flashbots into your own Flashbot searcher (bot). For more information, see the [Flashbots Searcher FAQ](https://hackmd.io/@flashbots/rk-qzgzCD)

Environment Variables
=====================
- ETHEREUM_RPC_URL - Ethereum RPC endpoint. Can not be the same as FLASHBOTS_RPC_URL
- PRIVATE_KEY - Private key for the Ethereum EOA that will be submitting Flashbots Ethereum transactions
- BUNDLE_EXECUTOR_ADDRESS - The address for the BundledExecutor.sol that you have deployed (see "Usage" below for details).
- FLASHBOTS_KEY_ID / FLASHBOTS_SECRET - Flashbots submissions requires an API key. [Apply for an API key here](https://docs.google.com/forms/d/e/1FAIpQLSd4AKrS-vcfW1X-dQvkFY73HysoKfkhcd-31Tj8frDAU6D6aQ/viewform) 
- HEALTHCHECK_URL _[Optional]_ - Health check URL, hit only after successfully submitting a bundle.
- MINER_REWARD_PERCENTAGE _[Optional, default 80]_ - 0 -> 100, what percentage of overall profitability to send to miner.

Usage
======================
1. Generate a new bot wallet address and extract the private key into a raw 32-byte format.
2. Deploy the included BundleExecutor.sol to Ethereum, from a secured account, with the address of the newly created wallet as the constructor argument
3. Transfer WETH to the newly deployed BundleExecutor

_It is important to keep both the bot wallet private key and bundleExecutor owner private key secure. The bot wallet attempts to not lose WETH inside an arbitrage, but a malicious user would be able to drain the contract._

```
$ npm install
$ ETHEREUM_RPC_URL=__ETHEREUM_RPC_URL_FROM_ABOVE__ \
    PRIVATE_KEY=__PRIVATE_KEY_FROM_ABOVE__ \
    BUNDLE_EXECUTOR_ADDRESS=__DEPLOYED_ADDRESS_FROM_ABOVE__ \
    FLASHBOTS_KEY_ID=__YOUR_PERSONAL_KEY_ID__ \
    FLASHBOTS_SECRET=__YOUR_PERSONAL_SECRET__ \
    npm run start
```
