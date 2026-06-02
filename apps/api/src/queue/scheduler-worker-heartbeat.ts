export const SCHEDULER_WORKER_HEARTBEAT_KEY =
  "arena:scheduler-worker:heartbeat";
export const SCHEDULER_WORKER_HEARTBEAT_TTL_SECONDS = 180;
export const SCHEDULER_WORKER_HEARTBEAT_STALE_AFTER_MS = 120_000;
export const SCHEDULER_WORKER_STARTUP_GRACE_MS = 120_000;
export const SCHEDULER_WORKER_KEEPALIVE_INTERVAL_MS = 30_000;

export type SchedulerWorkerHeartbeatRecord = {
  processRole: "worker" | "all";
  startedAt: string;
  lastSeenAt: string;
  lastJobProcessedAt: string | null;
  lastJobName: string | null;
  lastWorkerErrorAt: string | null;
  lastWorkerErrorMessage: string | null;
};

export type SchedulerWorkerHealthSnapshot = {
  status: "up" | "down";
  checkedAt: string;
  startedAt: string | null;
  lastSeenAt: string | null;
  lastJobProcessedAt: string | null;
  lastJobName: string | null;
  lastWorkerErrorAt: string | null;
  lastWorkerErrorMessage: string | null;
  details?: string;
};

export function createSchedulerWorkerHeartbeatRecord(input: {
  nowIso: string;
  processRole: "worker" | "all";
}): SchedulerWorkerHeartbeatRecord {
  return {
    processRole: input.processRole,
    startedAt: input.nowIso,
    lastSeenAt: input.nowIso,
    lastJobProcessedAt: null,
    lastJobName: null,
    lastWorkerErrorAt: null,
    lastWorkerErrorMessage: null,
  };
}

export function touchSchedulerWorkerHeartbeat(
  record: SchedulerWorkerHeartbeatRecord | null,
  input: {
    nowIso: string;
    processRole: "worker" | "all";
  },
): SchedulerWorkerHeartbeatRecord {
  if (!record) {
    return createSchedulerWorkerHeartbeatRecord(input);
  }

  return {
    ...record,
    processRole: input.processRole,
    lastSeenAt: input.nowIso,
  };
}

export function recordSchedulerWorkerJobProcessed(
  record: SchedulerWorkerHeartbeatRecord | null,
  input: {
    nowIso: string;
    processRole: "worker" | "all";
    jobName: string;
  },
): SchedulerWorkerHeartbeatRecord {
  const nextRecord = touchSchedulerWorkerHeartbeat(record, input);

  return {
    ...nextRecord,
    lastJobProcessedAt: input.nowIso,
    lastJobName: input.jobName,
    lastWorkerErrorAt: null,
    lastWorkerErrorMessage: null,
  };
}

export function recordSchedulerWorkerError(
  record: SchedulerWorkerHeartbeatRecord | null,
  input: {
    nowIso: string;
    processRole: "worker" | "all";
    errorMessage: string;
  },
): SchedulerWorkerHeartbeatRecord {
  const nextRecord = touchSchedulerWorkerHeartbeat(record, input);

  return {
    ...nextRecord,
    lastWorkerErrorAt: input.nowIso,
    lastWorkerErrorMessage: input.errorMessage,
  };
}

export function parseSchedulerWorkerHeartbeatRecord(
  rawValue: string | null,
): SchedulerWorkerHeartbeatRecord | null {
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<SchedulerWorkerHeartbeatRecord>;
    if (
      (parsed.processRole !== "worker" && parsed.processRole !== "all") ||
      typeof parsed.startedAt !== "string" ||
      typeof parsed.lastSeenAt !== "string" ||
      (parsed.lastJobProcessedAt !== null &&
        typeof parsed.lastJobProcessedAt !== "string") ||
      (parsed.lastJobName !== null && typeof parsed.lastJobName !== "string") ||
      (parsed.lastWorkerErrorAt !== null &&
        typeof parsed.lastWorkerErrorAt !== "string") ||
      (parsed.lastWorkerErrorMessage !== null &&
        typeof parsed.lastWorkerErrorMessage !== "string")
    ) {
      return null;
    }

    return {
      processRole: parsed.processRole,
      startedAt: parsed.startedAt,
      lastSeenAt: parsed.lastSeenAt,
      lastJobProcessedAt: parsed.lastJobProcessedAt ?? null,
      lastJobName: parsed.lastJobName ?? null,
      lastWorkerErrorAt: parsed.lastWorkerErrorAt ?? null,
      lastWorkerErrorMessage: parsed.lastWorkerErrorMessage ?? null,
    };
  } catch {
    return null;
  }
}

export function evaluateSchedulerWorkerHealth(
  record: SchedulerWorkerHeartbeatRecord | null,
  nowIso = new Date().toISOString(),
): SchedulerWorkerHealthSnapshot {
  if (!record) {
    return {
      status: "down",
      checkedAt: nowIso,
      startedAt: null,
      lastSeenAt: null,
      lastJobProcessedAt: null,
      lastJobName: null,
      lastWorkerErrorAt: null,
      lastWorkerErrorMessage: null,
      details: "scheduler worker heartbeat is missing",
    };
  }

  const nowMs = new Date(nowIso).getTime();
  const lastSeenAgeMs = nowMs - new Date(record.lastSeenAt).getTime();

  if (lastSeenAgeMs > SCHEDULER_WORKER_HEARTBEAT_STALE_AFTER_MS) {
    return {
      status: "down",
      checkedAt: nowIso,
      startedAt: record.startedAt,
      lastSeenAt: record.lastSeenAt,
      lastJobProcessedAt: record.lastJobProcessedAt,
      lastJobName: record.lastJobName,
      lastWorkerErrorAt: record.lastWorkerErrorAt,
      lastWorkerErrorMessage: record.lastWorkerErrorMessage,
      details: `scheduler worker heartbeat is stale (${lastSeenAgeMs}ms old)`,
    };
  }

  if (
    record.lastWorkerErrorAt &&
    (!record.lastJobProcessedAt ||
      new Date(record.lastWorkerErrorAt).getTime() >
        new Date(record.lastJobProcessedAt).getTime())
  ) {
    const errorAgeMs = nowMs - new Date(record.lastWorkerErrorAt).getTime();
    if (errorAgeMs <= SCHEDULER_WORKER_HEARTBEAT_STALE_AFTER_MS) {
      return {
        status: "down",
        checkedAt: nowIso,
        startedAt: record.startedAt,
        lastSeenAt: record.lastSeenAt,
        lastJobProcessedAt: record.lastJobProcessedAt,
        lastJobName: record.lastJobName,
        lastWorkerErrorAt: record.lastWorkerErrorAt,
        lastWorkerErrorMessage: record.lastWorkerErrorMessage,
        details:
          record.lastWorkerErrorMessage ??
          "scheduler worker reported a queue error",
      };
    }
  }

  if (record.lastJobProcessedAt) {
    const lastJobAgeMs = nowMs - new Date(record.lastJobProcessedAt).getTime();
    if (lastJobAgeMs <= SCHEDULER_WORKER_HEARTBEAT_STALE_AFTER_MS) {
      return {
        status: "up",
        checkedAt: nowIso,
        startedAt: record.startedAt,
        lastSeenAt: record.lastSeenAt,
        lastJobProcessedAt: record.lastJobProcessedAt,
        lastJobName: record.lastJobName,
        lastWorkerErrorAt: record.lastWorkerErrorAt,
        lastWorkerErrorMessage: record.lastWorkerErrorMessage,
      };
    }
  }

  const startupAgeMs = nowMs - new Date(record.startedAt).getTime();
  if (startupAgeMs <= SCHEDULER_WORKER_STARTUP_GRACE_MS) {
    return {
      status: "up",
      checkedAt: nowIso,
      startedAt: record.startedAt,
      lastSeenAt: record.lastSeenAt,
      lastJobProcessedAt: record.lastJobProcessedAt,
      lastJobName: record.lastJobName,
      lastWorkerErrorAt: record.lastWorkerErrorAt,
      lastWorkerErrorMessage: record.lastWorkerErrorMessage,
      details: "scheduler worker is starting and awaiting its first completed job",
    };
  }

  return {
    status: "down",
    checkedAt: nowIso,
    startedAt: record.startedAt,
    lastSeenAt: record.lastSeenAt,
    lastJobProcessedAt: record.lastJobProcessedAt,
    lastJobName: record.lastJobName,
    lastWorkerErrorAt: record.lastWorkerErrorAt,
    lastWorkerErrorMessage: record.lastWorkerErrorMessage,
    details:
      "scheduler worker has not completed a scheduler job within the allowed window",
  };
}
