import type {
  ValidationChainCommandRecoveryReason,
  ValidationChainContractStateViewModel,
  ValidationLifecycleDriftOperatorGuidanceViewModel,
  ValidationLifecycleDriftMonitoringItemViewModel,
} from "../internal-ops.types";
import type { ValidationLifecycleDriftReason } from "../validation-lifecycle";
import {
  ValidationContractMarketState,
  type ValidationChainAutomaticCommand,
} from "./validation-chain.types";

export const VALIDATION_RUNBOOK_PATH =
  "docs/contracts/arena-validation-chain-runbook.md";

export function buildValidationLifecycleOperatorGuidance(input: {
  propositionId: string;
  marketId: string | null;
  propositionStatus: ValidationLifecycleDriftMonitoringItemViewModel["propositionStatus"];
  marketStatus: ValidationLifecycleDriftMonitoringItemViewModel["marketStatus"];
  localChainStatus: ValidationLifecycleDriftMonitoringItemViewModel["chainStatus"];
  onChainState: ValidationChainContractStateViewModel | null;
  driftReason: ValidationLifecycleDriftReason;
  hasOfficialResult: boolean;
}): ValidationLifecycleDriftOperatorGuidanceViewModel {
  const recoveryRoute = `/arena/internal/validation-chain/propositions/${input.propositionId}/recover-command`;
  const projectionRepairActions =
    input.marketId === null
      ? ["/arena/internal/validation-chain/sync"]
      : [
          "/arena/internal/validation-chain/sync",
          `/arena/internal/validation-chain/markets/${input.marketId}/replay-projection`,
        ];
  const unsafePreLiveActions = [
    `/arena/internal/validation-chain/propositions/${input.propositionId}/cancel-market`,
    `${VALIDATION_RUNBOOK_PATH}#unsafe-pre-live-drift-policy`,
  ];
  const runbookActions = [VALIDATION_RUNBOOK_PATH];

  const queueRecovery = (
    summary: string,
    recoveryReason: ValidationChainCommandRecoveryReason,
    plannedCommands: ValidationChainAutomaticCommand[],
  ): ValidationLifecycleDriftOperatorGuidanceViewModel => ({
    kind: "queue_recovery",
    summary,
    recoveryReason,
    plannedCommands,
    operatorActions: [recoveryRoute],
  });

  const projectionRepair = (
    summary: string,
  ): ValidationLifecycleDriftOperatorGuidanceViewModel => ({
    kind: "projection_repair",
    summary,
    recoveryReason: null,
    plannedCommands: [],
    operatorActions: [...projectionRepairActions],
  });

  const manualIntervention = (
    summary: string,
    operatorActions: string[],
  ): ValidationLifecycleDriftOperatorGuidanceViewModel => ({
    kind: "manual_intervention",
    summary,
    recoveryReason: null,
    plannedCommands: [],
    operatorActions,
  });

  switch (input.driftReason) {
    case "market_missing":
      return manualIntervention(
        "The local validation market row is missing. Reconstruct or investigate local market state before replaying projection or queueing chain commands.",
        [...runbookActions],
      );
    case "chain_market_not_created":
      if (input.onChainState === null) {
        return queueRecovery(
          "Queue create_market and open_market to recreate the missing live chain market.",
          "create_open_missing_market",
          ["create_market", "open_market"],
        );
      }

      return projectionRepair(
        "An on-chain market already exists, but the local validation projection has not caught up. Run sync or replay projection before queueing new chain commands.",
      );
    case "chain_market_not_opened":
      if (input.onChainState === "pre_live") {
        return queueRecovery(
          "Queue open_market to move the pre-live chain market into the live state.",
          "open_pre_live_market",
          ["open_market"],
        );
      }

      if (input.onChainState === "live") {
        return projectionRepair(
          "The on-chain market is already live, but the local validation projection still shows it as pre-live. Run sync or replay projection first.",
        );
      }

      return manualIntervention(
        "The local market is live but the chain market is not in a safe state for automatic open recovery. Investigate chain/runtime drift before queueing more commands.",
        [...runbookActions],
      );
    case "chain_market_not_frozen":
      if (input.onChainState === "live") {
        if (
          input.propositionStatus === "frozen" &&
          input.marketStatus === "frozen_for_reveal"
        ) {
          return queueRecovery(
            "Queue freeze_market to align the live chain market with the local frozen state.",
            "freeze_live_market",
            ["freeze_market"],
          );
        }

        if (
          (input.propositionStatus === "revealing" ||
            input.propositionStatus === "settled") &&
          input.hasOfficialResult
        ) {
          return queueRecovery(
            "Queue freeze_market and resolve_market to align the live chain market with the local adjudicated result.",
            "freeze_resolve_live_market",
            ["freeze_market", "resolve_market"],
          );
        }
      }

      if (input.onChainState === "frozen" || input.onChainState === "resolved") {
        return projectionRepair(
          "The chain market is already past the freeze boundary, but the local projection is stale. Run sync or replay projection before queueing new commands.",
        );
      }

      if (
        input.onChainState === "pre_live" ||
        input.localChainStatus === "pre_live"
      ) {
        return manualIntervention(
          "Do not reopen a pre-live chain market after the local freeze boundary. Cancel the chain market or escalate operator review before any further settlement actions.",
          unsafePreLiveActions,
        );
      }

      return manualIntervention(
        "The local market has crossed the freeze boundary, but no safe automatic recovery plan is available for the current chain state.",
        [...runbookActions],
      );
    case "chain_market_not_resolved":
      if (input.onChainState === "frozen") {
        if (input.propositionStatus === "settled") {
          return queueRecovery(
            "Queue resolve_market to finalize the already-frozen chain market with the local settled result.",
            "resolve_settled_market",
            ["resolve_market"],
          );
        }

        if (input.propositionStatus === "revealing") {
          return queueRecovery(
            "Queue resolve_market to finalize the already-frozen chain market with the local revealing result.",
            "resolve_frozen_market",
            ["resolve_market"],
          );
        }
      }

      if (input.onChainState === "live" && input.hasOfficialResult) {
        return queueRecovery(
          "Queue freeze_market and resolve_market to align the live chain market with the local adjudicated result.",
          "freeze_resolve_live_market",
          ["freeze_market", "resolve_market"],
        );
      }

      if (input.onChainState === "resolved") {
        return projectionRepair(
          "The chain market is already resolved, but the local settlement projection is stale. Run sync or replay projection to catch up.",
        );
      }

      if (
        input.onChainState === "pre_live" ||
        input.localChainStatus === "pre_live"
      ) {
        return manualIntervention(
          "Do not reopen a pre-live chain market after local adjudication or settlement. Cancel the chain market or escalate operator review before any further settlement actions.",
          unsafePreLiveActions,
        );
      }

      if (input.onChainState === "cancelled") {
        return manualIntervention(
          "The chain market was cancelled while the local proposition has already advanced to settlement. Manual incident review is required before any further settlement handling.",
          [...runbookActions],
        );
      }

      return manualIntervention(
        "The local proposition is awaiting resolved chain settlement, but no safe automatic recovery plan is available for the current chain state.",
        [...runbookActions],
      );
  }
}

export function toValidationChainContractStateView(
  state: ValidationContractMarketState | null,
): ValidationChainContractStateViewModel | null {
  switch (state) {
    case null:
      return null;
    case ValidationContractMarketState.Unset:
      return "unset";
    case ValidationContractMarketState.PreLive:
      return "pre_live";
    case ValidationContractMarketState.Live:
      return "live";
    case ValidationContractMarketState.Frozen:
      return "frozen";
    case ValidationContractMarketState.Resolved:
      return "resolved";
    case ValidationContractMarketState.Cancelled:
      return "cancelled";
  }
}
