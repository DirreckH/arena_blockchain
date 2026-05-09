// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/introspection/IERC165.sol";

interface IArenaValidationMarket is IERC165 {
    enum MarketState {
        Unset,
        PreLive,
        Live,
        Frozen,
        Resolved,
        Cancelled
    }

    enum ResultKind {
        None,
        Resolved,
        Void
    }

    enum VoidReason {
        None,
        InsufficientSample,
        Tie
    }

    struct Market {
        bytes32 propositionId;
        MarketState state;
        uint256 minStake;
        uint256 poolOption0;
        uint256 poolOption1;
        uint64 openedAt;
        uint64 frozenAt;
        uint64 resolvedAt;
        uint64 cancelledAt;
        ResultKind resultKind;
        uint8 winningOption;
        VoidReason voidReason;
        bytes32 cancelReasonCode;
        uint256 claimedWinningStake;
        uint256 claimedPayout;
    }

    struct Position {
        uint8 selectedOption;
        uint256 stakeAmount;
        bool claimed;
    }

    struct ResultPayload {
        bytes32 marketId;
        bytes32 propositionId;
        ResultKind resultKind;
        uint8 winningOption;
        VoidReason voidReason;
    }

    struct MarketView {
        bytes32 marketId;
        bytes32 propositionId;
        MarketState state;
        uint256 minStake;
        ResultKind resultKind;
        uint8 winningOption;
        VoidReason voidReason;
        uint64 openedAt;
        uint64 frozenAt;
        uint64 resolvedAt;
        uint64 cancelledAt;
        bytes32 cancelReasonCode;
    }

    struct PositionView {
        uint8 selectedOption;
        uint256 stakeAmount;
        bool claimed;
        uint256 claimableAmount;
    }

    error ZeroAddress();
    error ZeroIdentifier();
    error MarketAlreadyExists(bytes32 marketId);
    error PropositionAlreadyLinked(bytes32 propositionId);
    error MarketNotFound(bytes32 marketId);
    error MarketNotCancellable(bytes32 marketId, MarketState currentState);
    error InvalidMarketState(MarketState expected, MarketState actual);
    error InvalidOption(uint8 option);
    error StakeBelowMinimum(uint256 provided, uint256 minimum);
    error PositionAlreadyExists(bytes32 marketId, address user);
    error PositionNotFound(bytes32 marketId, address user);
    error PositionAlreadyClaimed(bytes32 marketId, address user);
    error ResultPayloadMismatch(bytes32 marketId, bytes32 propositionId);
    error InvalidResultKind(ResultKind resultKind);
    error InvalidResolvedPayload();
    error InvalidVoidPayload();
    error NoWinningPositions(bytes32 marketId, uint8 winningOption);
    error NoClaimableAmount(bytes32 marketId, address user);
    error TransferFailed(address recipient, uint256 amount);
    error DirectTransferDisabled();

    event MarketCreated(
        bytes32 indexed marketId,
        bytes32 indexed propositionId,
        uint256 minStake,
        address indexed operator
    );
    event MarketOpened(
        bytes32 indexed marketId,
        uint64 openedAt,
        address indexed operator
    );
    event BetPlaced(
        bytes32 indexed marketId,
        bytes32 indexed propositionId,
        address indexed user,
        uint8 selectedOption,
        uint256 amount
    );
    event MarketFrozen(
        bytes32 indexed marketId,
        uint64 frozenAt,
        address indexed operator
    );
    event MarketResolved(
        bytes32 indexed marketId,
        bytes32 indexed propositionId,
        ResultKind resultKind,
        uint8 winningOption,
        VoidReason voidReason,
        uint64 resolvedAt,
        address oracle
    );
    event MarketCancelled(
        bytes32 indexed marketId,
        bytes32 indexed propositionId,
        bytes32 indexed reasonCode,
        uint64 cancelledAt,
        address operator
    );
    event Claimed(
        bytes32 indexed marketId,
        bytes32 indexed propositionId,
        address indexed user,
        uint256 amount
    );
    event Refunded(
        bytes32 indexed marketId,
        bytes32 indexed propositionId,
        address indexed user,
        uint256 amount
    );

    function createMarket(
        bytes32 marketId,
        bytes32 propositionId,
        uint256 minStake
    ) external;

    function openMarket(bytes32 marketId) external;

    function freezeMarket(bytes32 marketId) external;

    function cancelMarket(bytes32 marketId, bytes32 reasonCode) external;

    function placeBet(bytes32 marketId, uint8 selectedOption) external payable;

    function resolveMarket(ResultPayload calldata payload) external;

    function claim(bytes32 marketId) external;

    function refund(bytes32 marketId) external;

    function pause() external;

    function unpause() external;

    function getMarket(bytes32 marketId) external view returns (MarketView memory);

    function getUserPosition(
        bytes32 marketId,
        address user
    ) external view returns (PositionView memory);

    function claimableAmount(
        bytes32 marketId,
        address user
    ) external view returns (uint256);
}
