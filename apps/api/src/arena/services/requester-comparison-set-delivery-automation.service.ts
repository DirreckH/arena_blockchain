import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../database/prisma.service";
import { withArenaTransaction } from "../arena-transaction.utils";
import { ArenaDomainError } from "../arena.errors";
import type { ArenaDbClient } from "../prisma.types";
import { RequesterComparisonSetDeliveryPolicyService } from "./requester-comparison-set-delivery-policy.service";
import { RequesterComparisonSetDeliveryRunService } from "./requester-comparison-set-delivery-run.service";
import { RequesterComparisonSetDeliveryTransportService } from "./requester-comparison-set-delivery-transport.service";
import { RequesterPropositionViewService } from "./requester-proposition-view.service";

interface RunDuePoliciesInput {
  now: string;
}

interface RequesterComparisonSetDeliveryAutomationResult {
  processedCount: number;
  completedCount: number;
  failedCount: number;
  items: Array<{
    policyId: string;
    comparisonSetId: string;
    status: "completed" | "failed";
    export:
      | Awaited<
          ReturnType<RequesterPropositionViewService["createOwnedComparisonSetExport"]>
        >
      | null;
    delivery:
      | Awaited<
          ReturnType<RequesterComparisonSetDeliveryTransportService["deliverExport"]>
        >
      | null;
    error: {
      code: string;
      message: string;
    } | null;
  }>;
}

@Injectable()
export class RequesterComparisonSetDeliveryAutomationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly deliveryPolicies: RequesterComparisonSetDeliveryPolicyService,
    private readonly deliveryRuns: RequesterComparisonSetDeliveryRunService,
    private readonly deliveryTransport: RequesterComparisonSetDeliveryTransportService,
    private readonly requesterViews: RequesterPropositionViewService,
  ) {}

  async runDuePolicies(
    input: RunDuePoliciesInput,
    db?: ArenaDbClient,
  ): Promise<RequesterComparisonSetDeliveryAutomationResult> {
    const duePolicies = await this.deliveryPolicies.listDuePolicies(
      input.now,
      db ?? this.prisma,
    );
    const items = await Promise.all(
      duePolicies.map((policy) =>
        this.runSingleDuePolicy(
          policy,
          input.now,
          db,
        ),
      ),
    );

    return {
      processedCount: items.length,
      completedCount: items.filter((item) => item.status === "completed").length,
      failedCount: items.filter((item) => item.status === "failed").length,
      items,
    };
  }

  private async runSingleDuePolicy(
    policy: Awaited<
      ReturnType<RequesterComparisonSetDeliveryPolicyService["getPolicyForUser"]>
    >,
    now: string,
    db?: ArenaDbClient,
  ): Promise<RequesterComparisonSetDeliveryAutomationResult["items"][number]> {
    const startedAt = now;

    try {
      const exportArtifact = await withArenaTransaction(this.prisma, db, async (tx) =>
        this.requesterViews.createOwnedComparisonSetExport(
          {
            userId: policy.userId,
            comparisonSetId: policy.comparisonSetId,
            now,
            origin: {
              type: "delivery_policy_automation",
              policyId: policy.policyId,
              policyName: policy.name,
            },
            retainedExportCount: policy.retainedExportCount,
          },
          tx,
        ),
      );
      const delivery = await this.deliveryTransport.deliverExport({
        policy,
        exportArtifact,
      });

      return await withArenaTransaction(this.prisma, db, async (tx) => {
        await this.deliveryPolicies.recordPolicyRun(
          policy.userId,
          policy.comparisonSetId,
          policy.policyId,
          now,
          tx,
        );
        await this.deliveryRuns.createRunRecord(
          {
            userId: policy.userId,
            comparisonSetId: policy.comparisonSetId,
            policyId: policy.policyId,
            retriedRunId: null,
            triggerType: "automation",
            status: "completed",
            startedAt,
            completedAt: exportArtifact.completedAt,
            exportId: exportArtifact.exportId,
            origin: {
              type: "delivery_policy_automation",
              policyId: policy.policyId,
              policyName: policy.name,
            },
            delivery,
          },
          tx,
        );

        return {
          policyId: policy.policyId,
          comparisonSetId: policy.comparisonSetId,
          status: "completed" as const,
          export: exportArtifact,
          delivery,
          error: null,
        };
      });
    } catch (error) {
      const normalizedError = this.normalizeDeliveryRunError(error);
      const exportId =
        await this.requesterViews.findLatestMatchingComparisonSetExportId({
          userId: policy.userId,
          comparisonSetId: policy.comparisonSetId,
          policyId: policy.policyId,
          originType: "delivery_policy_automation",
        });
      await this.deliveryPolicies.recordPolicyFailure(
        policy.userId,
        policy.comparisonSetId,
        policy.policyId,
        normalizedError,
      );
      await this.deliveryRuns.createRunRecord({
        userId: policy.userId,
        comparisonSetId: policy.comparisonSetId,
        policyId: policy.policyId,
        retriedRunId: null,
        triggerType: "automation",
        status: "failed",
        startedAt,
        completedAt: new Date().toISOString(),
        exportId,
        origin: {
          type: "delivery_policy_automation",
          policyId: policy.policyId,
          policyName: policy.name,
        },
        error: normalizedError,
      });

      return {
        policyId: policy.policyId,
        comparisonSetId: policy.comparisonSetId,
        status: "failed" as const,
        export: null,
        delivery: null,
        error: normalizedError,
      };
    }
  }

  private normalizeDeliveryRunError(error: unknown): {
    code: string;
    message: string;
  } {
    if (error instanceof ArenaDomainError) {
      return {
        code: error.code,
        message: error.message,
      };
    }

    if (error instanceof Error) {
      return {
        code: "INTERNAL_SERVER_ERROR",
        message: error.message || "Unexpected delivery automation error",
      };
    }

    return {
      code: "INTERNAL_SERVER_ERROR",
      message: "Unexpected delivery automation error",
    };
  }
}
