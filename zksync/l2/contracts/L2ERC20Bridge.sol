// SPDX-License-Identifier: MIT

pragma solidity ^0.8.10;

import {IL1ERC20Bridge} from "./interfaces/IL1ERC20Bridge.sol";
import {IL2ERC20Bridge} from "./interfaces/IL2ERC20Bridge.sol";
import {IERC20BridgedUpgradeable} from "../../common/token/interfaces/IERC20BridgedUpgradeable.sol";

import {BridgingManager} from "../../common/BridgingManager.sol";
import {BridgeableTokensUpgradable} from "../../common/BridgeableTokensUpgradable.sol";
import {L2CrossDomainEnabled} from "./L2CrossDomainEnabled.sol";

/// @notice The L2 token bridge works with the L1 token bridge to enable ERC20 token bridging
///     between L1 and L2. Mints tokens during deposits and burns tokens during withdrawals. 
///     Additionally, adds the methods for bridging management: enabling and disabling withdrawals/deposits
contract L2ERC20Bridge is
    IL2ERC20Bridge,
    BridgingManager,
    BridgeableTokensUpgradable,
    L2CrossDomainEnabled
{
    /// @inheritdoc IL2ERC20Bridge
    address public override l1Bridge;

    /// @dev Contract is expected to be used as proxy implementation.
    /// @dev Disable the initialization to prevent Parity hack.
    constructor() {
        _disableInitializers();
    }

    /// @notice Initializes the contract with parameters needed for its functionality.
    /// @param l1TokenBridge_ Address of the corresponding L1 bridge
    /// @param l1Token_ Address of the bridged token in the L1 chain
    /// @param l2Token_ Address of the token minted on the L2 chain when token bridged
    /// @dev The function can only be called once during contract deployment due to the 'initializer' modifier.
    function initialize(
        address l1TokenBridge_,
        address l1Token_,
        address l2Token_
    )
        external
        initializer
        onlyNonZeroAccount(l1TokenBridge_)
    {
        require(l1Token_ != address(0), "L1 token address cannot be zero");
        require(l2Token_ != address(0), "L2 token address cannot be zero");

        __BridgeableTokens_init(l1Token_, l2Token_);
        l1Bridge = l1TokenBridge_;
    }

    /// @inheritdoc IL2ERC20Bridge
    function finalizeDeposit(
        address l1Sender_,
        address l2Receiver_,
        address l1Token_,
        uint256 amount_,
        bytes calldata data_
    ) 
        external
        payable
        override
        whenDepositsEnabled
        onlySupportedL1Token(l1Token_)
        onlyFromCrossDomainAccount(l1Bridge)
    {
        require(msg.value == 0, "Value should be 0 for ERC20 bridge");

        IERC20BridgedUpgradeable(l2Token).bridgeMint(l2Receiver_, amount_);

        emit FinalizeDeposit(l1Sender_, l2Receiver_, l2Token, amount_, data_);
    }

    /// @inheritdoc IL2ERC20Bridge
    function withdraw(
        address l1Receiver_,
        address l2Token_,
        uint256 amount_
    ) 
        external
        override
        whenWithdrawalsEnabled
        onlySupportedL2Token(l2Token_)
    {
        IERC20BridgedUpgradeable(l2Token).bridgeBurn(msg.sender, amount_);

        bytes memory message = _getL1WithdrawMessage(l1Receiver_, l1Token, amount_);
        sendCrossDomainMessage(message);

        emit WithdrawalInitiated(msg.sender, l1Receiver_, l2Token_, amount_);
    }

    /// @notice Encode the message for l2ToL1log sent with withdraw initialization
    /// @param to_ Address that will receive tokens on L1 after finalizeWithdrawal
    /// @param l1Token_ The address of the token that was locked on the L1
    /// @param amount_ The total amount of tokens to be withdrawn
    function _getL1WithdrawMessage(
        address to_,
        address l1Token_,
        uint256 amount_
    ) internal pure returns (bytes memory) {
        return abi.encodePacked(
            IL1ERC20Bridge.finalizeWithdrawal.selector,
            to_,
            l1Token_,
            amount_
        );
    }

    /// @inheritdoc IL2ERC20Bridge
    function l1TokenAddress(address l2Token_) public view override returns (address l1TokenAddr) {
        l1TokenAddr = l2Token_ == l2Token ? l1Token : address(0);
    }

    /// @inheritdoc IL2ERC20Bridge
    function l2TokenAddress(address l1Token_) public view override returns (address l2TokenAddr) {
        l2TokenAddr = l1Token_ == l1Token ? l2Token : address(0);
    }
}
