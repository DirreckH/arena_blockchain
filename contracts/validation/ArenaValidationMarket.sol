// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

import "./IArenaValidationMarket.sol";

contract ArenaValidationMarket is
    AccessControl,
    ReentrancyGuard,
    Pausable,
    IArenaValidationMarket
{
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    uint8 public constant OPTION_NONE = 2;

    mapping(bytes32 marketId => Market market) private _markets;
    mapping(bytes32 marketId => mapping(address user => Position position))
        private _positions;
    mapping(bytes32 propositionId => bytes32 marketId)
        private _propositionMarkets;

    constructor(address admin) {
        if (admin == address(0)) {
            revert ZeroAddress();
        }

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, admin);
        _grantRole(ORACLE_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
    }

    function createMarket(
        bytes32 marketId,
        bytes32 propositionId,
        uint256 minStake
    ) external override onlyRole(OPERATOR_ROLE) whenNotPaused {
        if (marketId == bytes32(0) || propositionId == bytes32(0)) {
            revert ZeroIdentifier();
        }
        if (minStake == 0) {
            revert StakeBelowMinimum(0, 1);
        }
        if (_markets[marketId].state != MarketState.Unset) {
            revert MarketAlreadyExists(marketId);
        }
        if (_propositionMarkets[propositionId] != bytes32(0)) {
            revert PropositionAlreadyLinked(propositionId);
        }

        _propositionMarkets[propositionId] = marketId;
        _markets[marketId] = Market({
            propositionId: propositionId,
            state: MarketState.PreLive,
            minStake: minStake,
            poolOption0: 0,
            poolOption1: 0,
            openedAt: 0,
            frozenAt: 0,
            resolvedAt: 0,
            cancelledAt: 0,
            resultKind: ResultKind.None,
            winningOption: OPTION_NONE,
            voidReason: VoidReason.None,
            cancelReasonCode: bytes32(0),
            claimedWinningStake: 0,
            claimedPayout: 0
        });

        emit MarketCreated(marketId, propositionId, minStake, msg.sender);
    }

    function openMarket(
        bytes32 marketId
    ) external override onlyRole(OPERATOR_ROLE) whenNotPaused {
        Market storage market = _requireExistingMarket(marketId);
        _requireState(market.state, MarketState.PreLive);

        market.state = MarketState.Live;
        market.openedAt = uint64(block.timestamp);

        emit MarketOpened(marketId, market.openedAt, msg.sender);
    }

    function freezeMarket(
        bytes32 marketId
    ) external override onlyRole(OPERATOR_ROLE) whenNotPaused {
        Market storage market = _requireExistingMarket(marketId);
        _requireState(market.state, MarketState.Live);

        market.state = MarketState.Frozen;
        market.frozenAt = uint64(block.timestamp);

        emit MarketFrozen(marketId, market.frozenAt, msg.sender);
    }

    function cancelMarket(
        bytes32 marketId,
        bytes32 reasonCode
    ) external override onlyRole(OPERATOR_ROLE) whenNotPaused {
        Market storage market = _requireExistingMarket(marketId);
        MarketState currentState = market.state;
        if (
            currentState != MarketState.PreLive &&
            currentState != MarketState.Live &&
            currentState != MarketState.Frozen
        ) {
            revert MarketNotCancellable(marketId, currentState);
        }

        market.state = MarketState.Cancelled;
        market.cancelledAt = uint64(block.timestamp);
        market.cancelReasonCode = reasonCode;

        emit MarketCancelled(
            marketId,
            market.propositionId,
            reasonCode,
            market.cancelledAt,
            msg.sender
        );
    }

    function placeBet(
        bytes32 marketId,
        uint8 selectedOption
    ) external payable override nonReentrant whenNotPaused {
        _requireBinaryOption(selectedOption);

        Market storage market = _requireExistingMarket(marketId);
        _requireState(market.state, MarketState.Live);

        if (msg.value < market.minStake) {
            revert StakeBelowMinimum(msg.value, market.minStake);
        }

        Position storage position = _positions[marketId][msg.sender];
        if (position.stakeAmount != 0) {
            revert PositionAlreadyExists(marketId, msg.sender);
        }

        position.selectedOption = selectedOption;
        position.stakeAmount = msg.value;
        position.claimed = false;

        if (selectedOption == 0) {
            market.poolOption0 += msg.value;
        } else {
            market.poolOption1 += msg.value;
        }

        emit BetPlaced(
            marketId,
            market.propositionId,
            msg.sender,
            selectedOption,
            msg.value
        );
    }

    function resolveMarket(
        ResultPayload calldata payload
    ) external override onlyRole(ORACLE_ROLE) whenNotPaused {
        Market storage market = _requireExistingMarket(payload.marketId);
        _requireState(market.state, MarketState.Frozen);

        if (market.propositionId != payload.propositionId) {
            revert ResultPayloadMismatch(payload.marketId, payload.propositionId);
        }
        if (payload.resultKind == ResultKind.None) {
            revert InvalidResultKind(payload.resultKind);
        }

        if (payload.resultKind == ResultKind.Resolved) {
            _requireBinaryOption(payload.winningOption);
            if (payload.voidReason != VoidReason.None) {
                revert InvalidResolvedPayload();
            }

            uint256 winningPool = payload.winningOption == 0
                ? market.poolOption0
                : market.poolOption1;
            if (winningPool == 0) {
                revert NoWinningPositions(payload.marketId, payload.winningOption);
            }
        } else if (payload.resultKind == ResultKind.Void) {
            if (
                payload.winningOption != OPTION_NONE ||
                payload.voidReason == VoidReason.None
            ) {
                revert InvalidVoidPayload();
            }
        } else {
            revert InvalidResultKind(payload.resultKind);
        }

        market.state = MarketState.Resolved;
        market.resultKind = payload.resultKind;
        market.winningOption = payload.winningOption;
        market.voidReason = payload.voidReason;
        market.resolvedAt = uint64(block.timestamp);

        emit MarketResolved(
            payload.marketId,
            payload.propositionId,
            payload.resultKind,
            payload.winningOption,
            payload.voidReason,
            market.resolvedAt,
            msg.sender
        );
    }

    function claim(
        bytes32 marketId
    ) external override nonReentrant whenNotPaused {
        Market storage market = _requireExistingMarket(marketId);
        _requireState(market.state, MarketState.Resolved);

        Position storage position = _positions[marketId][msg.sender];
        if (position.stakeAmount == 0) {
            revert PositionNotFound(marketId, msg.sender);
        }
        if (position.claimed) {
            revert PositionAlreadyClaimed(marketId, msg.sender);
        }

        uint256 amount = _resolvedClaimAmount(market, position, marketId, msg.sender);
        if (amount == 0) {
            revert NoClaimableAmount(marketId, msg.sender);
        }

        position.claimed = true;

        if (market.resultKind == ResultKind.Resolved) {
            market.claimedWinningStake += position.stakeAmount;
            market.claimedPayout += amount;
        }

        _transferValue(msg.sender, amount);
        emit Claimed(marketId, market.propositionId, msg.sender, amount);
    }

    function refund(
        bytes32 marketId
    ) external override nonReentrant whenNotPaused {
        Market storage market = _requireExistingMarket(marketId);
        _requireState(market.state, MarketState.Cancelled);

        Position storage position = _positions[marketId][msg.sender];
        if (position.stakeAmount == 0) {
            revert PositionNotFound(marketId, msg.sender);
        }
        if (position.claimed) {
            revert PositionAlreadyClaimed(marketId, msg.sender);
        }

        uint256 amount = position.stakeAmount;
        position.claimed = true;

        _transferValue(msg.sender, amount);
        emit Refunded(marketId, market.propositionId, msg.sender, amount);
    }

    function pause() external override onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external override onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function getMarket(
        bytes32 marketId
    ) external view override returns (MarketView memory) {
        Market storage market = _requireExistingMarket(marketId);

        return
            MarketView({
                marketId: marketId,
                propositionId: market.propositionId,
                state: market.state,
                minStake: market.minStake,
                resultKind: market.resultKind,
                winningOption: market.winningOption,
                voidReason: market.voidReason,
                openedAt: market.openedAt,
                frozenAt: market.frozenAt,
                resolvedAt: market.resolvedAt,
                cancelledAt: market.cancelledAt,
                cancelReasonCode: market.cancelReasonCode
            });
    }

    function getUserPosition(
        bytes32 marketId,
        address user
    ) external view override returns (PositionView memory) {
        _requireExistingMarket(marketId);
        Position storage position = _positions[marketId][user];

        return
            PositionView({
                selectedOption: position.selectedOption,
                stakeAmount: position.stakeAmount,
                claimed: position.claimed,
                claimableAmount: _claimableAmount(marketId, user)
            });
    }

    function claimableAmount(
        bytes32 marketId,
        address user
    ) external view override returns (uint256) {
        return _claimableAmount(marketId, user);
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view override(AccessControl, IERC165) returns (bool) {
        return
            interfaceId == type(IArenaValidationMarket).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    receive() external payable {
        revert DirectTransferDisabled();
    }

    fallback() external payable {
        revert DirectTransferDisabled();
    }

    function _claimableAmount(
        bytes32 marketId,
        address user
    ) internal view returns (uint256) {
        Market storage market = _requireExistingMarket(marketId);
        Position storage position = _positions[marketId][user];

        if (position.stakeAmount == 0 || position.claimed) {
            return 0;
        }

        if (market.state == MarketState.Cancelled) {
            return position.stakeAmount;
        }

        if (market.state != MarketState.Resolved) {
            return 0;
        }

        return _resolvedClaimAmount(market, position, marketId, user);
    }

    function _resolvedClaimAmount(
        Market storage market,
        Position storage position,
        bytes32 marketId,
        address user
    ) internal view returns (uint256) {
        if (position.stakeAmount == 0) {
            revert PositionNotFound(marketId, user);
        }

        if (market.resultKind == ResultKind.Void) {
            return position.stakeAmount;
        }

        if (
            market.resultKind != ResultKind.Resolved ||
            position.selectedOption != market.winningOption
        ) {
            return 0;
        }

        uint256 winningPool = market.winningOption == 0
            ? market.poolOption0
            : market.poolOption1;
        if (winningPool == 0) {
            return 0;
        }

        uint256 totalPool = market.poolOption0 + market.poolOption1;
        uint256 nextClaimedWinningStake = market.claimedWinningStake +
            position.stakeAmount;

        if (nextClaimedWinningStake == winningPool) {
            return totalPool - market.claimedPayout;
        }

        return (position.stakeAmount * totalPool) / winningPool;
    }

    function _requireExistingMarket(
        bytes32 marketId
    ) internal view returns (Market storage market) {
        market = _markets[marketId];
        if (market.state == MarketState.Unset) {
            revert MarketNotFound(marketId);
        }
    }

    function _requireState(
        MarketState actual,
        MarketState expected
    ) internal pure {
        if (actual != expected) {
            revert InvalidMarketState(expected, actual);
        }
    }

    function _requireBinaryOption(uint8 option) internal pure {
        if (option > 1) {
            revert InvalidOption(option);
        }
    }

    function _transferValue(address recipient, uint256 amount) internal {
        (bool success, ) = recipient.call{value: amount}("");
        if (!success) {
            revert TransferFailed(recipient, amount);
        }
    }
}
