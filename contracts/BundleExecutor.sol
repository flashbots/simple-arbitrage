//SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "./FlashLoanReceiverBase.sol";
import "./Interfaces.sol";
import "./Libraries.sol";

interface IWETH is IERC20 {
    function deposit() external payable;
    function withdraw(uint) external;
}

contract FlashBotsMultiCallFL is FlashLoanReceiverBase {
    using SafeMath for uint256;
    address public constant WETH_address = address(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);
    IWETH private constant WETH = IWETH(WETH_address);

    constructor(ILendingPoolAddressesProvider _addressProvider) FlashLoanReceiverBase(_addressProvider) public payable {
        WETH.approve(address(LENDING_POOL), uint(-1));
    }

    /**
        This function is called after your contract has received the flash loaned amount
     */
    function executeOperation(
        address[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata premiums,
        address initiator,
        bytes calldata params
    )
        external
        override
        returns (bool)
    {
        uint aaveDebt = amounts[0].add(premiums[0]);
        uniswapWethFLParams(amounts[0], params, aaveDebt);

        return true;
    }

    function flashloan(uint256 amountToBorrow, bytes memory _params) external {
        address receiverAddress = address(this);

        address[] memory assets = new address[](1);
        assets[0] = WETH_address;

        uint256[] memory amounts = new uint256[](1);
        amounts[0] = amountToBorrow;

        uint256[] memory modes = new uint256[](1);
        modes[0] = 0;

        address onBehalfOf = address(this);
        uint16 referralCode = 161;

        LENDING_POOL.flashLoan(
            receiverAddress,
            assets,
            amounts,
            modes,
            onBehalfOf,
            _params,
            referralCode
        );
    }

    function uniswapWethFLParams(uint256 _amountToFirstMarket, bytes memory _params, uint256 aaveDebt) internal {
        (uint256 _ethAmountToCoinbase, address[] memory _targets, bytes[] memory _payloads) = abi.decode(_params, (uint256, address[], bytes[]));
        require(_targets.length == _payloads.length);

        WETH.transfer(_targets[0], _amountToFirstMarket);
        for (uint256 i = 0; i < _targets.length; i++) {
            (bool _success, bytes memory _response) = _targets[i].call(_payloads[i]);
            require(_success); 
        }

        uint256 _wethBalanceAfter = WETH.balanceOf(address(this));

        uint256 _profit = _wethBalanceAfter - aaveDebt - _ethAmountToCoinbase;
        
        require(_profit >= 0);

        WETH.withdraw(_ethAmountToCoinbase + _profit);
        block.coinbase.transfer(_ethAmountToCoinbase);
        tx.origin.transfer(_profit);
    }

    function call(address payable _to, uint256 _value, bytes calldata _data) external payable returns (bytes memory) {
        require(_to != address(0));
        (bool _success, bytes memory _result) = _to.call{value: _value}(_data);
        require(_success);
        return _result;
    }

    receive() external payable {
    }
}
