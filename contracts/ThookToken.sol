// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title ThookToken — $THOOK (Tax Hook)
/// @notice A plain, ownerless ERC-20. Fixed 1,000,000,000 supply minted once to
///         the deployer, who moves it straight into ThookSeeder (locked LP).
///         No owner, no mint, no blacklist, no transfer tax in the token itself:
///         the 4% tax lives in the Uniswap v4 pool hook (ThookFeeHook) and is
///         always taken in ETH, never in THOOK.
contract ThookToken is ERC20 {
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 ether;

    constructor() ERC20("Tax Hook", "THOOK") {
        _mint(msg.sender, TOTAL_SUPPLY);
    }
}
