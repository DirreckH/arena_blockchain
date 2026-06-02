import { Injectable } from "@nestjs/common";
import type { RequesterDeliveryCredentialDirectoryViewModel } from "@arena/shared";

import { ArenaValidationError } from "../arena.errors";
import { AppConfigService } from "../../config/app-config.service";
import type { RequesterOwnedComparisonSetExportArtifactViewModel } from "./requester-proposition-view.service";
import type { RequesterComparisonSetDeliveryPolicyViewModel } from "./requester-comparison-set-delivery-policy.service";
import type { RequesterComparisonSetDeliveryTransportResult } from "./requester-comparison-set-delivery-transport.types";

@Injectable()
export class RequesterComparisonSetDeliveryTransportService {
  constructor(private readonly config: AppConfigService) {}

  listAvailableCredentials(): RequesterDeliveryCredentialDirectoryViewModel {
    const items = Object.keys(this.config.requesterDeliveryWebhookBearerTokens)
      .sort((left, right) => left.localeCompare(right))
      .map((credentialKey) => ({
        credentialKey,
        label: credentialKey,
        transportType: "webhook" as const,
        authenticationKind: "bearer" as const,
      }));

    return {
      totalCount: items.length,
      items,
    };
  }

  getWebhookCredentialStatus(credentialKey: string | null | undefined): {
    status: "ready" | "blocked";
    blockingReason: "transport_credential_missing" | null;
    credentialKey: string | null;
  } {
    if (!credentialKey || credentialKey.trim().length === 0) {
      return {
        status: "ready",
        blockingReason: null,
        credentialKey: null,
      };
    }

    const token = this.config.requesterDeliveryWebhookBearerTokens[credentialKey];
    if (typeof token === "string" && token.length > 0) {
      return {
        status: "ready",
        blockingReason: null,
        credentialKey,
      };
    }

    return {
      status: "blocked",
      blockingReason: "transport_credential_missing",
      credentialKey,
    };
  }

  async deliverExport(input: {
    policy: RequesterComparisonSetDeliveryPolicyViewModel;
    exportArtifact: RequesterOwnedComparisonSetExportArtifactViewModel;
  }): Promise<RequesterComparisonSetDeliveryTransportResult | null> {
    if (!input.policy.transport) {
      return null;
    }

    if (input.policy.transport.type !== "webhook") {
      throw new ArenaValidationError(
        "requester_comparison_set_delivery.transport_not_supported",
        `Requester comparison set delivery transport ${String(
          (input.policy.transport as { type?: unknown }).type,
        )} is not supported`,
      );
    }

    const deliveredAt = new Date().toISOString();
    const credentialStatus = this.getWebhookCredentialStatus(
      input.policy.transport.credentialKey,
    );
    if (credentialStatus.status === "blocked") {
      throw new ArenaValidationError(
        "requester_comparison_set_delivery.transport_credential_missing",
        `Requester comparison set delivery credential ${credentialStatus.credentialKey} is not configured`,
      );
    }
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (credentialStatus.credentialKey) {
      headers.authorization = `Bearer ${this.config.requesterDeliveryWebhookBearerTokens[credentialStatus.credentialKey]}`;
    }
    const response = await fetch(input.policy.transport.targetUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        policy: {
          policyId: input.policy.policyId,
          comparisonSetId: input.policy.comparisonSetId,
          name: input.policy.name,
          cadence: input.policy.cadence,
        },
        export: input.exportArtifact,
      }),
    });

    if (!response.ok) {
      throw new ArenaValidationError(
        "requester_comparison_set_delivery.transport_failed",
        `Requester comparison set delivery transport failed with status ${response.status}`,
      );
    }

    return {
      deliveredAt,
      statusCode: response.status,
      authentication: {
        kind: credentialStatus.credentialKey ? "bearer" : "none",
        credentialKey: credentialStatus.credentialKey,
      },
    };
  }
}
