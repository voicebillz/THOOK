// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {BaseHook} from "@uniswap/v4-periphery/src/utils/BaseHook.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, toBeforeSwapDelta, BeforeSwapDeltaLibrary} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";

/// @title ThookFeeHook — the 4% ETH tax on the $THOOK Uniswap v4 pool
/// @notice Charges a flat 4% (400 bps) on EVERY swap in the ETH/THOOK pool,
///         buys and sells alike, ALWAYS in native ETH, and sends it straight to
///         ThookFeeVault. THOOK is never taken or sold by the hook, so the tax
///         creates zero sell pressure on the token.
///
///         Fully immutable: no owner, no setters. The fee can never change.
///
/// @dev    Fee mechanics are a straight port of gazz.fun's GazzFeeHook (itself
///         ported from HOODX's audited LaunchFeeHook). ETH is currency0 in a
///         native pool (address(0) sorts first):
///
///           | Swap                       | ETH is…     | fee taken in |
///           |----------------------------|-------------|--------------|
///           | exactInput  ETH  -> token  | specified   | beforeSwap   |
///           | exactInput  token -> ETH   | unspecified | afterSwap    |
///           | exactOutput ETH  -> token  | unspecified | afterSwap    |
///           | exactOutput token -> ETH   | specified   | beforeSwap   |
///
///         beforeInitialize only lets `initializer` (ThookSeeder) create a pool,
///         and only for native-ETH / THOOK — nobody can attach the hook to any
///         other pool or front-run the launch pool with a bad price.
///
/// @dev    DEPLOY: CREATE2-mined so the address' low bits encode
///         BEFORE_INITIALIZE | BEFORE_SWAP | BEFORE_SWAP_RETURNS_DELTA |
///         AFTER_SWAP | AFTER_SWAP_RETURNS_DELTA (= 0x20CC).
contract ThookFeeHook is BaseHook {
    /// @notice 400 = 4.00%. Constant — can never change.
    uint128 public constant FEE_BPS = 400;
    uint128 internal constant BPS_DENOMINATOR = 10_000;

    /// @notice The only token this hook serves.
    address public immutable token;
    /// @notice Receives 100% of the fee, in ETH.
    address payable public immutable vault;
    /// @notice The only address allowed to initialize a pool (ThookSeeder).
    address public immutable initializer;

    event FeeTaken(uint256 ethAmount, bool isBuy);

    error PoolMustBeNativeEthThook();
    error NotInitializer();

    constructor(IPoolManager _poolManager, address _token, address payable _vault, address _initializer)
        BaseHook(_poolManager)
    {
        token = _token;
        vault = _vault;
        initializer = _initializer;
    }

    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: true,
            afterInitialize: false,
            beforeAddLiquidity: false,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: false,
            beforeSwap: true,
            afterSwap: true,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: true,
            afterSwapReturnDelta: true,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    function _beforeInitialize(address sender, PoolKey calldata key, uint160) internal view override returns (bytes4) {
        if (sender != initializer) revert NotInitializer();
        if (!key.currency0.isAddressZero() || Currency.unwrap(key.currency1) != token) {
            revert PoolMustBeNativeEthThook();
        }
        return BaseHook.beforeInitialize.selector;
    }

    function _takeFee(PoolKey calldata key, uint256 ethBase, bool isBuy) internal returns (uint256 fee) {
        fee = (ethBase * FEE_BPS) / BPS_DENOMINATOR;
        if (fee > 0) {
            poolManager.take(key.currency0, vault, fee);
            emit FeeTaken(fee, isBuy);
        }
    }

    function _beforeSwap(address, PoolKey calldata key, SwapParams calldata params, bytes calldata)
        internal
        override
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        bool exactInput = params.amountSpecified < 0;
        bool ethIsSpecified = exactInput ? params.zeroForOne : !params.zeroForOne;
        if (!ethIsSpecified) {
            return (BaseHook.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
        }
        uint256 absSpecified = exactInput ? uint256(-params.amountSpecified) : uint256(params.amountSpecified);
        uint256 fee = _takeFee(key, absSpecified, params.zeroForOne);
        if (fee == 0) return (BaseHook.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
        return (BaseHook.beforeSwap.selector, toBeforeSwapDelta(int128(uint128(fee)), 0), 0);
    }

    function _afterSwap(address, PoolKey calldata key, SwapParams calldata params, BalanceDelta delta, bytes calldata)
        internal
        override
        returns (bytes4, int128)
    {
        bool exactInput = params.amountSpecified < 0;
        bool ethIsSpecified = exactInput ? params.zeroForOne : !params.zeroForOne;
        if (ethIsSpecified) return (BaseHook.afterSwap.selector, 0); // taken in beforeSwap

        int128 ethAmount = delta.amount0();
        if (ethAmount < 0) ethAmount = -ethAmount;
        uint256 fee = _takeFee(key, uint256(uint128(ethAmount)), params.zeroForOne);
        if (fee == 0) return (BaseHook.afterSwap.selector, 0);
        return (BaseHook.afterSwap.selector, int128(uint128(fee)));
    }
}
