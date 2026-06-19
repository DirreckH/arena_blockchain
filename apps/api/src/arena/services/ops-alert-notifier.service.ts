import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PinoLogger } from "nestjs-pino";

import { AppConfigService } from "../../config/app-config.service";
import { ArenaIdService } from "../arena-id.service";
import type { ArenaDbClient } from "../prisma.types";
import { SystemKeyValueRepository } from "../repositories/system-key-value.repository";

const OPS_ALERT_DELIVERY_NAMESPACE = "arena.ops.alert_delivery";

type OpsAlertChannelDeliveryState = {
  channelKey: string;
  deliveredAt: string;
  statusCode: number;
  targetUrl: string;
  payloadSignature: string;
};

type OpsAlertDeliveryRecord = {
  alertKey: string;
  channels: OpsAlertChannelDeliveryState[];
  updatedAt: string;
};

export type OpsAlertNotificationEnvelope = {
  source: "runtime_contract" | "validation_chain";
  action: string;
  reason: string;
  entityType: string;
  entityId: string;
  createdAt: string;
  metadata: Record<string, unknown>;
};

const cloneValue = <T>(value: T): T => structuredClone(value);

const parseDeliveryRecord = (value: unknown): OpsAlertDeliveryRecord | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const payload = value as {
    alertKey?: unknown;
    updatedAt?: unknown;
    channels?: unknown;
  };
  if (
    typeof payload.alertKey !== "string" ||
    typeof payload.updatedAt !== "string" ||
    !Array.isArray(payload.channels)
  ) {
    return null;
  }

  const channels = payload.channels.filter(
    (item): item is OpsAlertChannelDeliveryState =>
      Boolean(
        item &&
          typeof item === "object" &&
          typeof (item as { channelKey?: unknown }).channelKey === "string" &&
          typeof (item as { deliveredAt?: unknown }).deliveredAt === "string" &&
          typeof (item as { statusCode?: unknown }).statusCode === "number" &&
          typeof (item as { targetUrl?: unknown }).targetUrl === "string" &&
          typeof (item as { payloadSignature?: unknown }).payloadSignature ===
            "string",
      ),
  );

  return {
    alertKey: payload.alertKey,
    updatedAt: payload.updatedAt,
    channels,
  };
};

@Injectable()
export class OpsAlertNotifierService {
  constructor(
    private readonly config: AppConfigService,
    private readonly ids: ArenaIdService,
    private readonly systemKeyValues: SystemKeyValueRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(OpsAlertNotifierService.name);
  }

  hasConfiguredChannels(): boolean {
    return Object.keys(this.config.opsAlertWebhookTargets).length > 0;
  }

  async notifyAlert(
    envelope: OpsAlertNotificationEnvelope,
    db?: ArenaDbClient,
  ): Promise<void> {
    const channels = Object.entries(this.config.opsAlertWebhookTargets).sort(
      ([left], [right]) => left.localeCompare(right),
    );
    if (channels.length === 0) {
      return;
    }

    const payloadSignature = this.buildPayloadSignature(envelope);
    const alertKey = this.buildAlertKey(envelope);
    const record = await this.readDeliveryRecord(alertKey, db);

    for (const [channelKey, targetUrl] of channels) {
      const existingChannel = record?.channels.find(
        (item) =>
          item.channelKey === channelKey &&
          item.targetUrl === targetUrl &&
          item.payloadSignature === payloadSignature,
      );
      if (existingChannel) {
        continue;
      }

      try {
        const statusCode = await this.postWebhook(channelKey, targetUrl, envelope);
        await this.persistDeliveryRecord(
          alertKey,
          {
            channelKey,
            deliveredAt: envelope.createdAt,
            statusCode,
            targetUrl,
            payloadSignature,
          },
          db,
        );
      } catch (error) {
        this.logger.warn(
          {
            channelKey,
            targetUrl,
            action: envelope.action,
            entityType: envelope.entityType,
            entityId: envelope.entityId,
            error: error instanceof Error ? error.message : "Unknown alert webhook error",
          },
          "Failed to deliver ops alert webhook",
        );
      }
    }
  }

  private async postWebhook(
    channelKey: string,
    targetUrl: string,
    envelope: OpsAlertNotificationEnvelope,
  ): Promise<number> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.opsAlertWebhookTimeoutMs);
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    const bearerToken = this.config.opsAlertWebhookBearerTokens[channelKey];
    if (typeof bearerToken === "string" && bearerToken.length > 0) {
      headers.authorization = `Bearer ${bearerToken}`;
    }

    try {
      const response = await fetch(targetUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          alert: envelope,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Webhook responded with status ${response.status}`);
      }

      return response.status;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async readDeliveryRecord(
    alertKey: string,
    db?: ArenaDbClient,
  ): Promise<OpsAlertDeliveryRecord | null> {
    const record = await this.systemKeyValues.findByKey(
      this.buildStorageKey(alertKey),
      db,
    );
    return parseDeliveryRecord(record?.valueJson ?? null);
  }

  private async persistDeliveryRecord(
    alertKey: string,
    deliveredChannel: OpsAlertChannelDeliveryState,
    db?: ArenaDbClient,
  ): Promise<void> {
    const current =
      (await this.readDeliveryRecord(alertKey, db)) ??
      ({
        alertKey,
        channels: [],
        updatedAt: new Date().toISOString(),
      } satisfies OpsAlertDeliveryRecord);
    const nextRecord: OpsAlertDeliveryRecord = {
      alertKey,
      updatedAt: new Date().toISOString(),
      channels: [
        deliveredChannel,
        ...current.channels.filter(
          (item) => item.channelKey !== deliveredChannel.channelKey,
        ),
      ],
    };
    const key = this.buildStorageKey(alertKey);

    await this.systemKeyValues.upsertByKey(
      key,
      {
        id: this.ids.next("system_key_value"),
        key,
        description: `Arena ops alert delivery state for ${alertKey}`,
        valueJson: cloneValue(nextRecord) as Prisma.InputJsonValue,
      },
      {
        description: `Arena ops alert delivery state for ${alertKey}`,
        valueJson: cloneValue(nextRecord) as Prisma.InputJsonValue,
      },
      db,
    );
  }

  private buildAlertKey(envelope: OpsAlertNotificationEnvelope): string {
    return [
      envelope.source,
      envelope.action,
      envelope.entityType,
      envelope.entityId,
      envelope.createdAt,
    ].join(":");
  }

  private buildStorageKey(alertKey: string): string {
    return `${OPS_ALERT_DELIVERY_NAMESPACE}.${alertKey}`;
  }

  private buildPayloadSignature(envelope: OpsAlertNotificationEnvelope): string {
    return JSON.stringify(envelope);
  }
}
