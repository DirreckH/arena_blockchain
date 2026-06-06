import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import type {
  BackendRuntimeContractChecklistItemViewModel,
  BackendRuntimeContractViewModel,
  InternalAuditEventViewModel,
} from "../internal-ops.types";
import { InternalAuditService } from "./internal-audit.service";
import { InternalMonitoringService } from "./internal-monitoring.service";
import {
  RUNTIME_CONTRACT_AUDIT_ENTITY_ID,
  RUNTIME_CONTRACT_AUDIT_ENTITY_TYPE,
  RUNTIME_CONTRACT_RELEASE_BLOCKED_ACTION,
  RUNTIME_CONTRACT_RELEASE_READY_ACTION,
} from "./runtime-contract-alert.constants";

const uniqueSorted = (values: string[]): string[] =>
  Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));

type RuntimeContractAlertMetadata = {
  runtimeStatus: BackendRuntimeContractViewModel["status"];
  releaseStatus: BackendRuntimeContractViewModel["releaseReadiness"]["status"];
  generatedAt: string;
  blockingDependencies: string[];
  blockedGateIds: string[];
  blockedGates: Array<{
    id: string;
    blockingDependencies: string[];
    commands: string[];
    operatorActions: string[];
  }>;
  schedulerQueueStatus: string | null;
  schedulerQueuePaused: boolean | null;
  validationChainStatus: BackendRuntimeContractViewModel["validationChain"]["status"];
};

@Injectable()
export class RuntimeContractAlertService {
  constructor(
    private readonly monitoring: InternalMonitoringService,
    private readonly audits: InternalAuditService,
  ) {}

  async runHealthCheck(nowIso = new Date().toISOString()): Promise<void> {
    const snapshot = await this.monitoring.getRuntimeContract();
    const action =
      snapshot.releaseReadiness.status === "blocked"
        ? RUNTIME_CONTRACT_RELEASE_BLOCKED_ACTION
        : RUNTIME_CONTRACT_RELEASE_READY_ACTION;
    const reason =
      snapshot.releaseReadiness.status === "blocked"
        ? "runtime_contract.release_blocked"
        : "runtime_contract.release_ready";
    const metadata = this.buildMetadata(snapshot);
    const latest = (await this.audits.listByEntity(
      RUNTIME_CONTRACT_AUDIT_ENTITY_TYPE,
      RUNTIME_CONTRACT_AUDIT_ENTITY_ID,
    ))[0] as InternalAuditEventViewModel | undefined;

    if (
      latest &&
      latest.action === action &&
      this.buildSignature(latest.metadata) === this.buildSignature(metadata)
    ) {
      return;
    }

    await this.audits.record({
      entityType: RUNTIME_CONTRACT_AUDIT_ENTITY_TYPE,
      entityId: RUNTIME_CONTRACT_AUDIT_ENTITY_ID,
      action,
      reason,
      note: "scheduled_runtime_contract_health_check",
      metadata: metadata as Prisma.InputJsonValue,
      createdAt: new Date(nowIso),
    });
  }

  private buildMetadata(
    snapshot: BackendRuntimeContractViewModel,
  ): RuntimeContractAlertMetadata {
    const blockedGates = snapshot.releaseChecklist
      .filter((item) => item.status === "blocked")
      .map((item) => this.toBlockedGateMetadata(item));
    const schedulerQueue =
      snapshot.health.queues.queues.find((queue) => queue.name === "scheduler") ??
      null;

    return {
      runtimeStatus: snapshot.status,
      releaseStatus: snapshot.releaseReadiness.status,
      generatedAt: snapshot.generatedAt,
      blockingDependencies: uniqueSorted(
        snapshot.releaseReadiness.blockingDependencies,
      ),
      blockedGateIds: uniqueSorted(blockedGates.map((item) => item.id)),
      blockedGates,
      schedulerQueueStatus: schedulerQueue?.status ?? null,
      schedulerQueuePaused: schedulerQueue?.paused ?? null,
      validationChainStatus: snapshot.validationChain.status,
    };
  }

  private toBlockedGateMetadata(
    item: BackendRuntimeContractChecklistItemViewModel,
  ): RuntimeContractAlertMetadata["blockedGates"][number] {
    return {
      id: item.id,
      blockingDependencies: uniqueSorted(item.blockingDependencies),
      commands: uniqueSorted(item.commands),
      operatorActions: uniqueSorted(item.operatorActions),
    };
  }

  private buildSignature(metadata: unknown): string {
    const payload =
      metadata !== null && typeof metadata === "object"
        ? (metadata as Partial<RuntimeContractAlertMetadata>)
        : {};

    return JSON.stringify({
      runtimeStatus: payload.runtimeStatus ?? null,
      releaseStatus: payload.releaseStatus ?? null,
      blockingDependencies: uniqueSorted(payload.blockingDependencies ?? []),
      blockedGateIds: uniqueSorted(payload.blockedGateIds ?? []),
      blockedGates: (payload.blockedGates ?? [])
        .map((gate) => ({
          id: gate.id,
          blockingDependencies: uniqueSorted(gate.blockingDependencies),
          commands: uniqueSorted(gate.commands),
          operatorActions: uniqueSorted(gate.operatorActions),
        }))
        .sort((left, right) => left.id.localeCompare(right.id)),
      schedulerQueueStatus: payload.schedulerQueueStatus ?? null,
      schedulerQueuePaused: payload.schedulerQueuePaused ?? null,
      validationChainStatus: payload.validationChainStatus ?? null,
    });
  }
}
