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
    address private immutable owner;
    address private immutable executor;
    IWETH private constant WETH = IWETH(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);
    address private constant ETH_address = address(0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE);

    modifier onlyExecutor() {
        require(msg.sender == executor);
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner);
        _;
    }

    constructor(address _executor, ILendingPoolAddressesProvider _addressProvider) FlashLoanReceiverBase(_addressProvider) public payable {
        owner = msg.sender;
        executor = _executor;
        if (msg.value > 0) {
            WETH.deposit{value: msg.value}();
        }
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
        uint amountOwing = amounts[0].add(premiums[0]);
        uniswapWethFLParams(amounts[0], params, amountOwing);
        WETH.approve(address(LENDING_POOL), amountOwing);

        return true;
    }

    function flashloan(address borrowedTokenAddress, uint256 amountToBorrow, bytes memory _params) external onlyExecutor() {
        address receiverAddress = address(this);

        address[] memory assets = new address[](1);
        assets[0] = borrowedTokenAddress;

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

    function uniswapWethFLParams(uint256 _amountToFirstMarket, bytes memory _params, uint256 totalAaveDebt) internal {
        (uint256 _ethAmountToCoinbase, address[] memory _targets, bytes[] memory _payloads) = abi.decode(_params, (uint256, address[], bytes[]));
        require(_targets.length == _payloads.length);

        WETH.transfer(_targets[0], _amountToFirstMarket);
        for (uint256 i = 0; i < _targets.length; i++) {
            (bool _success, bytes memory _response) = _targets[i].call(_payloads[i]);
            require(_success); 
        }

        uint256 _wethBalanceAfter = WETH.balanceOf(address(this));
        require(_wethBalanceAfter > totalAaveDebt + _ethAmountToCoinbase);

        uint256 _ethBalance = address(this).balance;
        if (_ethBalance < _ethAmountToCoinbase) {
            WETH.withdraw(_ethAmountToCoinbase - _ethBalance);
        }
        block.coinbase.transfer(_ethAmountToCoinbase);
    }

    function call(address payable _to, uint256 _value, bytes calldata _data) external onlyOwner payable returns (bytes memory) {
        require(_to != address(0));
        (bool _success, bytes memory _result) = _to.call{value: _value}(_data);
        require(_success);
        return _result;
    }

    function withdraw(address token) external onlyOwner {
        if (token == ETH_address) {
            uint256 bal = address(this).balance;
            msg.sender.transfer(bal);
        } else if (token != ETH_address) {
            uint256 bal = IERC20(token).balanceOf(address(this));
            IERC20(token).transfer(address(msg.sender), bal);
        }
    }

    receive() external payable {
    }
}
