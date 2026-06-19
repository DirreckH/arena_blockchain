import assert from "node:assert/strict";
import test from "node:test";

import { ArenaIdService } from "../../src/arena/arena-id.service";
import { OpsAlertNotifierService } from "../../src/arena/services/ops-alert-notifier.service";

type StoredSystemKeyValue = {
  id: string;
  key: string;
  description: string | null;
  valueJson: unknown;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

class FakeSystemKeyValueRepository {
  readonly records = new Map<string, StoredSystemKeyValue>();

  async findByKey(key: string): Promise<StoredSystemKeyValue | null> {
    return this.records.get(key) ?? null;
  }

  async upsertByKey(
    key: string,
    create: {
      id: string;
      key: string;
      description?: string | null;
      valueJson?: unknown;
      createdAt?: Date;
      updatedAt?: Date;
      deletedAt?: Date | null;
    },
    update: {
      description?: string | null;
      valueJson?: unknown;
      updatedAt?: Date;
      deletedAt?: Date | null;
    },
  ): Promise<StoredSystemKeyValue> {
    const existing = this.records.get(key);
    if (existing) {
      const next: StoredSystemKeyValue = {
        ...existing,
        description: update.description ?? existing.description,
        valueJson: structuredClone(update.valueJson ?? existing.valueJson),
        updatedAt: update.updatedAt ?? new Date(),
        deletedAt: update.deletedAt ?? null,
      };
      this.records.set(key, next);
      return next;
    }

    const created: StoredSystemKeyValue = {
      id: create.id,
      key: create.key,
      description: create.description ?? null,
      valueJson: structuredClone(create.valueJson ?? null),
      createdAt: create.createdAt ?? new Date(),
      updatedAt: create.updatedAt ?? new Date(),
      deletedAt: create.deletedAt ?? null,
    };
    this.records.set(key, created);
    return created;
  }
}

const createNotifier = (
  repository: FakeSystemKeyValueRepository,
  overrides?: {
    targets?: Record<string, string>;
    tokens?: Record<string, string>;
    timeoutMs?: number;
  },
): OpsAlertNotifierService =>
  new OpsAlertNotifierService(
    {
      get opsAlertWebhookTargets() {
        return overrides?.targets ?? { pager: "https://alerts.example.test/runtime" };
      },
      get opsAlertWebhookBearerTokens() {
        return overrides?.tokens ?? { pager: "ops-secret" };
      },
      get opsAlertWebhookTimeoutMs() {
        return overrides?.timeoutMs ?? 5000;
      },
    } as never,
    new ArenaIdService(),
    repository as never,
    {
      setContext() {},
      warn() {},
    } as never,
  );

const withFetchMock = async (
  handler: (input: string | URL | Request, init?: RequestInit) => Promise<Response>,
  callback: () => Promise<void>,
): Promise<void> => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = handler;

  try {
    await callback();
  } finally {
    globalThis.fetch = originalFetch;
  }
};

test("ops alert notifier dedupes already delivered payloads per configured channel", async () => {
  const repository = new FakeSystemKeyValueRepository();
  const notifier = createNotifier(repository);
  const requests: Array<{ url: string; authorization: string | null; body: string | null }> = [];

  await withFetchMock(
    async (input, init) => {
      requests.push({
        url: String(input),
        authorization:
          init?.headers && "authorization" in (init.headers as Record<string, string>)
            ? String((init.headers as Record<string, string>).authorization)
            : null,
        body: typeof init?.body === "string" ? init.body : null,
      });
      return new Response(null, {
        status: 202,
      });
    },
    async () => {
      const envelope = {
        source: "runtime_contract" as const,
        action: "runtime_contract.alert.release_blocked",
        reason: "runtime_contract.release_blocked",
        entityType: "runtime_contract",
        entityId: "release",
        createdAt: "2026-06-07T12:00:00.000Z",
        metadata: {
          blockingDependencies: ["scheduler_queue"],
        },
      };

      await notifier.notifyAlert(envelope);
      await notifier.notifyAlert(envelope);
    },
  );

  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.url, "https://alerts.example.test/runtime");
  assert.equal(requests[0]?.authorization, "Bearer ops-secret");
  assert.equal(
    requests[0]?.body?.includes("runtime_contract.alert.release_blocked"),
    true,
  );
  assert.equal(repository.records.size, 1);
});

test("ops alert notifier retries a channel when the previous delivery never persisted success", async () => {
  const repository = new FakeSystemKeyValueRepository();
  const notifier = createNotifier(repository);
  let attempts = 0;

  await withFetchMock(
    async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error("webhook offline");
      }

      return new Response(null, {
        status: 204,
      });
    },
    async () => {
      const envelope = {
        source: "validation_chain" as const,
        action: "validation_chain.alert.sync_worker_unhealthy",
        reason: "validation_chain.sync.worker_heartbeat_down",
        entityType: "validation_chain_stream",
        entityId: "validation_market_main",
        createdAt: "2026-06-07T12:05:00.000Z",
        metadata: {
          schedulerWorkerStatus: "down",
        },
      };

      await notifier.notifyAlert(envelope);
      await notifier.notifyAlert(envelope);
    },
  );

  assert.equal(attempts, 2);
  assert.equal(repository.records.size, 1);
});
