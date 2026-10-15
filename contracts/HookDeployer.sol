// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title HookDeployer — CREATE2 deployer for ThookFeeHook
/// @notice A Uniswap v4 hook's ADDRESS encodes its permissions in its low 14
///         bits, so the hook must be deployed at a mined CREATE2 address. This
///         contract holds no funds, no state and no privileges.
contract HookDeployer {
    error DeployFailed();

    event Deployed(address indexed addr, bytes32 salt);

    function deploy(bytes32 salt, bytes memory initCode) external returns (address addr) {
        assembly {
            addr := create2(0, add(initCode, 0x20), mload(initCode), salt)
        }
        if (addr == address(0)) revert DeployFailed();
        emit Deployed(addr, salt);
    }

    function predict(bytes32 salt, bytes32 initCodeHash) external view returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, initCodeHash)))));
    }
}
