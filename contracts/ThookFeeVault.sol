// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title ThookFeeVault — holds the 4% ETH tax and pays the weekly "top loser"
/// @notice ThookFeeHook sends every fee here in ETH. Once per 7-day epoch the
///         keeper (a hot wallet run by the THOOK agent on Railway) airdrops the
///         pot to the THOOK holder(s) whose WHOLE portfolio lost the most that
///         week. The ranking is computed off-chain by the agent and published as
///         a report; its hash is stored on-chain with the payout.
///
///         Roles:
///         - owner  = the Safe (safe.global). Sets the keeper and limits, pauses,
///                    and can move funds (rescue). Ownable2Step: the Safe must
///                    acceptOwnership().
///         - keeper = Railway hot wallet. Can ONLY call payEpoch(), which is
///                    bounded on-chain: one payout per ended epoch, at most
///                    `maxWinners` recipients, at most `maxPayoutBps` of the
///                    balance, and every recipient must hold ≥ `minHold` THOOK.
contract ThookFeeVault is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant EPOCH_LENGTH = 7 days;
    uint256 public constant MAX_WINNERS_CAP = 50;

    IERC20 public immutable thook;
    /// @notice Start of epoch 0 (unix seconds).
    uint256 public immutable genesis;

    address public keeper;
    bool public paused;
    uint256 public minHold;       // THOOK (18 decimals) a winner must hold at payout
    uint16 public maxWinners;     // recipients per epoch
    uint16 public maxPayoutBps;   // share of the vault balance one epoch may pay

    uint256 public totalReceived; // all ETH ever received (fees + donations)
    uint256 public totalPaid;     // all ETH ever airdropped
    uint256 public lastPaidEpoch; // highest epoch paid (+1; 0 = none yet)

    mapping(uint256 => bool) public epochPaid;
    mapping(address => uint256) public wonTotal;

    event FeeReceived(address indexed from, uint256 amount);
    event EpochPaid(uint256 indexed epoch, uint256 total, uint256 winners, bytes32 reportHash);
    event Airdrop(uint256 indexed epoch, address indexed winner, uint256 amount, uint256 rank);
    event AirdropFailed(uint256 indexed epoch, address indexed winner, uint256 amount);
    event KeeperSet(address keeper);
    event LimitsSet(uint256 minHold, uint16 maxWinners, uint16 maxPayoutBps);
    event Paused(bool paused);
    event Rescued(address indexed to, uint256 amount);

    error NotKeeper();
    error IsPaused();
    error EpochNotEnded();
    error EpochAlreadyPaid();
    error BadLength();
    error TooManyWinners();
    error OverPayoutCap();
    error NotEligible(address winner);
    error BadLimits();
    error ZeroAddress();

    constructor(address _owner, address _keeper, IERC20 _thook, uint256 _minHold) Ownable(_owner) {
        if (address(_thook) == address(0)) revert ZeroAddress();
        thook = _thook;
        genesis = block.timestamp;
        keeper = _keeper;
        minHold = _minHold;
        maxWinners = 10;
        maxPayoutBps = 10_000;
        emit KeeperSet(_keeper);
        emit LimitsSet(_minHold, 10, 10_000);
    }

    receive() external payable {
        totalReceived += msg.value;
        emit FeeReceived(msg.sender, msg.value);
    }

    // ------------------------------------------------------------------ views

    function currentEpoch() public view returns (uint256) {
        return (block.timestamp - genesis) / EPOCH_LENGTH;
    }

    function epochStart(uint256 epoch) public view returns (uint256) {
        return genesis + epoch * EPOCH_LENGTH;
    }

    function epochEnd(uint256 epoch) public view returns (uint256) {
        return genesis + (epoch + 1) * EPOCH_LENGTH;
    }

    function pot() external view returns (uint256) {
        return address(this).balance;
    }

    // ----------------------------------------------------------------- keeper

    /// @notice Airdrop an ended epoch's prize. `winners` are ranked (index 0 =
    ///         biggest loser). `reportHash` = keccak256 of the published report.
    function payEpoch(uint256 epoch, address[] calldata winners, uint256[] calldata amounts, bytes32 reportHash)
        external
        nonReentrant
    {
        if (msg.sender != keeper) revert NotKeeper();
        if (paused) revert IsPaused();
        if (epoch >= currentEpoch()) revert EpochNotEnded();
        if (epochPaid[epoch]) revert EpochAlreadyPaid();
        if (winners.length != amounts.length) revert BadLength();
        if (winners.length > maxWinners) revert TooManyWinners();

        uint256 sum;
        for (uint256 i; i < amounts.length; ++i) sum += amounts[i];
        if (sum > (address(this).balance * maxPayoutBps) / 10_000) revert OverPayoutCap();

        epochPaid[epoch] = true;
        if (epoch + 1 > lastPaidEpoch) lastPaidEpoch = epoch + 1;

        uint256 paid;
        for (uint256 i; i < winners.length; ++i) {
            address w = winners[i];
            if (w == address(0) || thook.balanceOf(w) < minHold) revert NotEligible(w);
            uint256 amt = amounts[i];
            if (amt == 0) continue;
            // A recipient that rejects ETH must not block the others; its share
            // simply stays in the vault for the next epoch.
            (bool ok,) = payable(w).call{value: amt, gas: 50_000}("");
            if (ok) {
                paid += amt;
                wonTotal[w] += amt;
                emit Airdrop(epoch, w, amt, i + 1);
            } else {
                emit AirdropFailed(epoch, w, amt);
            }
        }
        totalPaid += paid;
        emit EpochPaid(epoch, paid, winners.length, reportHash);
    }

    // ------------------------------------------------------------------ owner

    function setKeeper(address _keeper) external onlyOwner {
        keeper = _keeper;
        emit KeeperSet(_keeper);
    }

    function setLimits(uint256 _minHold, uint16 _maxWinners, uint16 _maxPayoutBps) external onlyOwner {
        if (_maxWinners == 0 || _maxWinners > MAX_WINNERS_CAP || _maxPayoutBps > 10_000) revert BadLimits();
        minHold = _minHold;
        maxWinners = _maxWinners;
        maxPayoutBps = _maxPayoutBps;
        emit LimitsSet(_minHold, _maxWinners, _maxPayoutBps);
    }

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit Paused(_paused);
    }

    /// @notice Owner (Safe) can move ETH out, e.g. to migrate to a new vault.
    function rescueETH(address payable to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        (bool ok,) = to.call{value: amount}("");
        require(ok, "send failed");
        emit Rescued(to, amount);
    }

    /// @notice Recover ERC-20s sent here by mistake.
    function rescueToken(IERC20 tok, address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        tok.safeTransfer(to, amount);
    }
}
