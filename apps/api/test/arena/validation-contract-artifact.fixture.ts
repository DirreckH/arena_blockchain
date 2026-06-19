import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { utils } from "ethers";

type ValidationContractAbi = ConstructorParameters<typeof utils.Interface>[0];

const validationContractArtifactPath = resolve(
  __dirname,
  "../../../../artifacts/contracts/validation/ArenaValidationMarket.sol/ArenaValidationMarket.json",
);

const validationContractArtifactFixture = JSON.stringify(
  {
    abi: [
      "error MarketNotFound(bytes32 marketId)",
      "event MarketCreated(bytes32 indexed marketId, bytes32 indexed propositionId, uint256 minStake, address indexed operator)",
      "event MarketOpened(bytes32 indexed marketId, uint64 openedAt, address indexed operator)",
      "event BetPlaced(bytes32 indexed marketId, bytes32 indexed propositionId, address indexed user, uint8 selectedOption, uint256 amount)",
      "event MarketFrozen(bytes32 indexed marketId, uint64 frozenAt, address indexed operator)",
      "event MarketResolved(bytes32 indexed marketId, bytes32 indexed propositionId, uint8 resultKind, uint8 winningOption, uint8 voidReason, uint64 resolvedAt, address oracle)",
      "event MarketCancelled(bytes32 indexed marketId, bytes32 indexed propositionId, bytes32 indexed reasonCode, uint64 cancelledAt, address operator)",
      "event Claimed(bytes32 indexed marketId, bytes32 indexed propositionId, address indexed user, uint256 amount)",
      "event Refunded(bytes32 indexed marketId, bytes32 indexed propositionId, address indexed user, uint256 amount)",
      "event Paused(address account)",
      "event Unpaused(address account)",
      "function paused() view returns (bool)",
      "function OPERATOR_ROLE() view returns (bytes32)",
      "function ORACLE_ROLE() view returns (bytes32)",
      "function PAUSER_ROLE() view returns (bytes32)",
      "function hasRole(bytes32 role, address account) view returns (bool)",
      "function createMarket(bytes32 marketId, bytes32 propositionId, uint256 minStake)",
      "function openMarket(bytes32 marketId)",
      "function freezeMarket(bytes32 marketId)",
      "function cancelMarket(bytes32 marketId, bytes32 reasonCode)",
      "function placeBet(bytes32 marketId, uint8 selectedOption) payable",
      "function resolveMarket((bytes32 marketId, bytes32 propositionId, uint8 resultKind, uint8 winningOption, uint8 voidReason) payload)",
      "function claim(bytes32 marketId)",
      "function refund(bytes32 marketId)",
      "function pause()",
      "function unpause()",
      "function getMarket(bytes32 marketId) view returns (tuple(bytes32 marketId, bytes32 propositionId, uint8 state, uint256 minStake, uint8 resultKind, uint8 winningOption, uint8 voidReason, uint64 openedAt, uint64 frozenAt, uint64 resolvedAt, uint64 cancelledAt, bytes32 cancelReasonCode))",
      "function getUserPosition(bytes32 marketId, address user) view returns (tuple(uint8 selectedOption, uint256 stakeAmount, bool claimed, uint256 claimableAmount))",
      "function claimableAmount(bytes32 marketId, address user) view returns (uint256)",
    ],
    deployedBytecode: "0x60006000",
  },
  null,
  2,
);

export function ensureValidationContractArtifact(): string {
  if (!existsSync(validationContractArtifactPath)) {
    mkdirSync(dirname(validationContractArtifactPath), { recursive: true });
    writeFileSync(
      validationContractArtifactPath,
      validationContractArtifactFixture,
      "utf8",
    );
  }

  return validationContractArtifactPath;
}

export function readValidationContractAbi(): ValidationContractAbi {
  const artifactPath = ensureValidationContractArtifact();
  return JSON.parse(readFileSync(artifactPath, "utf8"))
    .abi as ValidationContractAbi;
}
