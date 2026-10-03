// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {MockUSDC} from "./MockUSDC.sol";

/// @dev Test-only stand-in for a Tempo TIP-20 stablecoin: an ERC-20 with transfer memos.
contract MockTIP20 is MockUSDC {
    event TransferWithMemo(address indexed from, address indexed to, uint256 amount, bytes32 indexed memo);

    function transferWithMemo(address to, uint256 amount, bytes32 memo) external {
        _transfer(msg.sender, to, amount);
        emit TransferWithMemo(msg.sender, to, amount, memo);
    }
}
