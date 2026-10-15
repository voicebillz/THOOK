// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

// Test-only: a contract that refuses ETH.
contract RejectEth {
    receive() external payable { revert("no"); }
}
