// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {ModifyLiquidityParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";

interface IThookFeeHook {
    function initializer() external view returns (address);
    function token() external view returns (address);
}

/// @title ThookSeeder — launches $THOOK into its locked-LP Uniswap v4 pool
/// @notice 100% of the THOOK supply goes in as SINGLE-SIDED liquidity (zero ETH
///         seed) from a floor FDV, in a native-ETH / THOOK pool with
///         ThookFeeHook. Same pattern gazz.fun used for GAZZ (GazzV4Seeder).
///
///         LOCKED BY CONSTRUCTION: this contract owns the position and has NO
///         function that removes liquidity. The LP can never be pulled.
///
///         The pool's LP fee is 0, so the ONLY trading tax is the hook's 4%
///         (paid in ETH to ThookFeeVault).
///
/// @dev    Flow (signed by the deployer in the admin portal):
///         new ThookSeeder → (mine + deploy hook with initializer = seeder) →
///         seeder.setHook(hook) → token.transfer(seeder, supply) → seeder.seed().
contract ThookSeeder is IUnlockCallback, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using PoolIdLibrary for PoolKey;

    IPoolManager public immutable poolManager;
    IERC20 public immutable token;
    address public immutable deployer;
    /// @notice FDV (in ETH) at the launch price. Sets the curve's virtual depth.
    uint256 public immutable startFdvEth;

    uint24 public constant LP_FEE = 0;
    int24 public constant TICK_SPACING = 60;

    IHooks public hook;
    PoolKey private _poolKey;
    bool public seeded;
    uint256 public seededSupply;

    event HookSet(address hook);
    event Seeded(bytes32 poolId, uint256 supply, uint256 startFdvEth, int24 tickLower, int24 tickUpper);

    error OnlyDeployer();
    error AlreadySeeded();
    error NotSeeded();
    error NothingToSeed();
    error NotPoolManager();
    error StartFdvTooLow();
    error HookAlreadySet();
    error BadHook();

    constructor(IPoolManager _poolManager, IERC20 _token, uint256 _startFdvEth) {
        if (_startFdvEth < 0.1 ether) revert StartFdvTooLow(); // anti-snipe floor
        poolManager = _poolManager;
        token = _token;
        startFdvEth = _startFdvEth;
        deployer = msg.sender;
    }

    /// @notice One-time: bind the mined ThookFeeHook (it must name this seeder).
    function setHook(IHooks _hook) external {
        if (msg.sender != deployer) revert OnlyDeployer();
        if (address(hook) != address(0)) revert HookAlreadySet();
        if (
            IThookFeeHook(address(_hook)).initializer() != address(this)
                || IThookFeeHook(address(_hook)).token() != address(token)
        ) revert BadHook();
        hook = _hook;
        emit HookSet(address(_hook));
    }

    /// @notice Put the seeder's entire THOOK balance in as locked liquidity.
    function seed() external nonReentrant {
        if (msg.sender != deployer) revert OnlyDeployer();
        if (seeded) revert AlreadySeeded();
        if (address(hook) == address(0)) revert BadHook();
        uint256 supply = token.balanceOf(address(this));
        if (supply == 0) revert NothingToSeed();
        seeded = true;
        seededSupply = supply;

        _poolKey = PoolKey({
            currency0: Currency.wrap(address(0)),
            currency1: Currency.wrap(address(token)),
            fee: LP_FEE,
            tickSpacing: TICK_SPACING,
            hooks: hook
        });

        (int24 lo, int24 hi) = _bondRange();
        poolManager.initialize(_poolKey, TickMath.getSqrtPriceAtTick(hi));
        poolManager.unlock("");

        emit Seeded(PoolId.unwrap(_poolKey.toId()), supply, startFdvEth, lo, hi);
    }

    function unlockCallback(bytes calldata) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        (int24 tickLower, int24 tickUpper) = _bondRange();
        uint160 sqrtLower = TickMath.getSqrtPriceAtTick(tickLower);
        uint160 sqrtUpper = TickMath.getSqrtPriceAtTick(tickUpper);
        // Single-sided (token1 only) at the upper tick: L = supply * 2^96 / (sqrtUpper - sqrtLower).
        uint256 liquidity = FullMath.mulDiv(seededSupply, 1 << 96, sqrtUpper - sqrtLower);
        if (liquidity > 1000) liquidity -= 1000; // margin: never owe more THOOK than held

        (BalanceDelta mod,) = poolManager.modifyLiquidity(
            _poolKey,
            ModifyLiquidityParams({
                tickLower: tickLower,
                tickUpper: tickUpper,
                liquidityDelta: int256(liquidity),
                salt: bytes32(0)
            }),
            ""
        );
        if (mod.amount1() < 0) {
            poolManager.sync(_poolKey.currency1);
            token.safeTransfer(address(poolManager), uint256(uint128(-mod.amount1())));
            poolManager.settle();
        }
        return "";
    }

    function poolKey() external view returns (PoolKey memory) {
        if (!seeded) revert NotSeeded();
        return _poolKey;
    }

    function poolId() external view returns (bytes32) {
        if (!seeded) revert NotSeeded();
        return PoolId.unwrap(_poolKey.toId());
    }

    /// @dev Price = token1/token0 = THOOK per ETH. THOOK appreciating = tick DOWN.
    function _bondRange() internal view returns (int24 tickLower, int24 tickUpper) {
        tickLower = TickMath.minUsableTick(TICK_SPACING);
        uint256 ratioX192 = FullMath.mulDiv(seededSupply, 1 << 192, startFdvEth);
        int24 raw = TickMath.getTickAtSqrtPrice(uint160(_sqrt(ratioX192)));
        int24 q = raw / TICK_SPACING;
        if (raw < 0 && raw % TICK_SPACING != 0) q--;
        tickUpper = q * TICK_SPACING;
    }

    function _sqrt(uint256 x) internal pure returns (uint256 y) {
        if (x == 0) return 0;
        uint256 z = (x + 1) / 2;
        y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
    }
}
