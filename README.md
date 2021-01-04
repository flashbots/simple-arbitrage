simple-arbitrage
================

This repository contains a simple, mechanical system for discovering, evaluating, rating, and submitting arbitrage opportunities to the Flashbots bundle endpoint.

Environment Variables
=====================
- ETHEREUM_RPC_URL - Ethereum RPC endpoint. Can not be the same as FLASHBOTS_RPC_URL
- PRIVATE_KEY - Private key for the Ethereum EOA that will be submittin Flashbots Ethereum transactions
- FLASHBOTS_RPC_URL - Flashbots bundles are submitted to a specific JSON-RPC endpoint. 
- HEALTHCHECK_URL _[Optional]_ - Health check URL, hit only after successfully submitting a bundle.

Usage
======================
1. Generate a new wallet address and extract the private key into a raw 32-byte format.
2. Deploy the included BundleExecutor.sol to Ethereum, from a secured account, with the address of the newly created wallet as the constructor argument
3. Transfer WETH to the newly deployed BundleExecutor

```
$ npm install
$ PRIVATE_KEY=__PRIVATE_KEY_FROM_ABOVE__ BUNDLE_EXECUTOR_ADDRESS=__DEPLOYED_ADDRESS_FROM_ABOVE__ FLASHBOTS_RPC_URL=__FLASHBOTS_URL__ npm run start
```
