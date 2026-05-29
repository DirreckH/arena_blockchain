import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createServer } from "node:http";

import { createArenaHarness } from "./harness";

async function createWebhookServer() {
  const requests: Array<{
    path: string;
    headers: Record<string, string | string[] | undefined>;
    body: any;
  }> = [];

  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    request.on("end", () => {
      const rawBody = Buffer.concat(chunks).toString("utf8");
      requests.push({
        path: request.url ?? "/",
        headers: Object.fromEntries(
          Object.entries(request.headers).map(([key, value]) => [key, value]),
        ),
        body: rawBody.length > 0 ? JSON.parse(rawBody) : null,
      });
      response.statusCode = 200;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ ok: true }));
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  const port =
    typeof address === "object" && address !== null ? address.port : undefined;
  if (!port) {
    throw new Error("Failed to resolve webhook test port");
  }

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    requests,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  };
}

describe("Requester delivery transport", () => {
  it("uses bearer authentication when a webhook credential key is configured", async () => {
    const harness = createArenaHarness();
    const webhook = await createWebhookServer();

    try {
      const preset = await harness.requesterReportPresetService.createReportPresetForUser(
        "creator_transport_service",
        {
          name: "Transport service preset",
          windowDays: 30,
          categories: ["ai"],
          marketEnabledOnly: true,
          statusScope: "settled",
          defaultExportFormat: "json",
        },
      );
      const comparisonSet =
        await harness.requesterComparisonSetService.createComparisonSetForUser(
          "creator_transport_service",
          {
            name: "Transport service comparison set",
            presetIds: [preset.presetId],
          },
        );
      const exportArtifact =
        await harness.requesterPropositionViewService.createOwnedComparisonSetExport(
          {
            userId: "creator_transport_service",
            comparisonSetId: comparisonSet.comparisonSetId,
            origin: {
              type: "delivery_policy_manual",
              policyId: "policy_1",
              policyName: "Transport service policy",
            },
          },
        );
      const policy =
        await harness.requesterComparisonSetDeliveryPolicyService.createPolicyForUser(
          "creator_transport_service",
          comparisonSet.comparisonSetId,
          {
            name: "Transport service policy",
            cadence: "daily",
            nextRunAt: "2026-04-18T12:00:00.000Z",
            enabled: true,
            transport: {
              type: "webhook",
              targetUrl: `${webhook.baseUrl}/requester-delivery`,
              credentialKey: "delivery_policy",
            },
          },
        );

      const result =
        await harness.requesterComparisonSetDeliveryTransportService.deliverExport(
          {
            policy,
            exportArtifact,
          },
        );

      assert.equal(result?.statusCode, 200);
      assert.equal(result?.authentication.kind, "bearer");
      assert.equal(result?.authentication.credentialKey, "delivery_policy");
      assert.equal(webhook.requests.length, 1);
      assert.equal(
        webhook.requests[0]?.headers.authorization,
        "Bearer token_delivery_policy",
      );
      assert.equal(
        webhook.requests[0]?.body.policy.policyId,
        policy.policyId,
      );
    } finally {
      await webhook.close();
    }
  });

  it("blocks missing webhook credential references in policy health", async () => {
    const harness = createArenaHarness();
    const preset = await harness.requesterReportPresetService.createReportPresetForUser(
      "creator_transport_health_service",
      {
        name: "Transport health service preset",
        windowDays: 30,
        categories: ["ai"],
        marketEnabledOnly: true,
        statusScope: "settled",
        defaultExportFormat: "json",
      },
    );
    const comparisonSet =
      await harness.requesterComparisonSetService.createComparisonSetForUser(
        "creator_transport_health_service",
        {
          name: "Transport health service comparison set",
          presetIds: [preset.presetId],
        },
      );
    const policy =
      await harness.requesterComparisonSetDeliveryPolicyService.createPolicyForUser(
        "creator_transport_health_service",
        comparisonSet.comparisonSetId,
        {
          name: "Transport health service policy",
          cadence: "daily",
          nextRunAt: "2026-04-18T12:00:00.000Z",
          enabled: true,
          transport: {
            type: "webhook",
            targetUrl: "https://example.test/requester-delivery",
            credentialKey: "missing_key",
          },
        },
      );

    const health =
      await harness.requesterPropositionViewService.getOwnedComparisonSetDeliveryPolicyHealth(
        {
          userId: "creator_transport_health_service",
          comparisonSetId: comparisonSet.comparisonSetId,
          policyId: policy.policyId,
          now: "2026-04-18T12:05:00.000Z",
        },
      );

    assert.equal(health.health.transport.status, "blocked");
    assert.equal(
      health.health.transport.blockingReason,
      "transport_credential_missing",
    );
    assert.equal(health.health.transport.credentialKey, "missing_key");
  });

  it("normalizes blank webhook credential keys to no authentication", async () => {
    const harness = createArenaHarness();
    const webhook = await createWebhookServer();

    try {
      const preset = await harness.requesterReportPresetService.createReportPresetForUser(
        "creator_transport_blank_key",
        {
          name: "Transport blank key preset",
          windowDays: 30,
          categories: ["ai"],
          marketEnabledOnly: true,
          statusScope: "settled",
          defaultExportFormat: "json",
        },
      );
      const comparisonSet =
        await harness.requesterComparisonSetService.createComparisonSetForUser(
          "creator_transport_blank_key",
          {
            name: "Transport blank key comparison set",
            presetIds: [preset.presetId],
          },
        );
      const exportArtifact =
        await harness.requesterPropositionViewService.createOwnedComparisonSetExport(
          {
            userId: "creator_transport_blank_key",
            comparisonSetId: comparisonSet.comparisonSetId,
            origin: {
              type: "delivery_policy_manual",
              policyId: "policy_blank_key",
              policyName: "Transport blank key policy",
            },
          },
        );
      const policy =
        await harness.requesterComparisonSetDeliveryPolicyService.createPolicyForUser(
          "creator_transport_blank_key",
          comparisonSet.comparisonSetId,
          {
            name: "Transport blank key policy",
            cadence: "daily",
            nextRunAt: "2026-04-18T12:00:00.000Z",
            enabled: true,
            transport: {
              type: "webhook",
              targetUrl: `${webhook.baseUrl}/requester-delivery`,
              credentialKey: "   ",
            },
          },
        );

      assert.equal(policy.transport?.credentialKey, null);

      const result =
        await harness.requesterComparisonSetDeliveryTransportService.deliverExport(
          {
            policy,
            exportArtifact,
          },
        );

      assert.equal(result?.authentication.kind, "none");
      assert.equal(result?.authentication.credentialKey, null);
      assert.equal(webhook.requests.length, 1);
      assert.equal(webhook.requests[0]?.headers.authorization, undefined);
    } finally {
      await webhook.close();
    }
  });
});
