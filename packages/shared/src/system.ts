export interface HealthSnapshot {
  status: "ok";
  timestamp: string;
}

export interface ReadinessDependency {
  name: "database" | "redis" | "rpc" | "scheduler_queue";
  status: "up" | "down";
  details?: string;
}

export interface ReadinessSnapshot {
  status: "ok" | "degraded";
  timestamp: string;
  dependencies: ReadinessDependency[];
}

export interface ChainSnapshot {
  rpcUrl: string;
  configuredChainId: number;
  connectedChainId: number;
  contractAddress: string;
  artifactPath: string;
}

export interface EnqueuedJobSnapshot {
  queue: string;
  name: string;
  jobId: string;
}

export interface QueueJobCountsSnapshot {
  waiting: number;
  active: number;
  delayed: number;
  completed: number;
  failed: number;
}

export interface QueueJobPolicySnapshot {
  retryable: boolean;
  attempts: number;
  backoffType?: "fixed" | "exponential";
  backoffDelayMs?: number;
}

export interface QueueStatusSnapshot {
  name: string;
  status: "up" | "down";
  policy: QueueJobPolicySnapshot;
  paused?: boolean;
  counts?: QueueJobCountsSnapshot;
  details?: string;
}

export interface QueueOverviewSnapshot {
  status: "ok" | "degraded";
  timestamp: string;
  redis: {
    status: "up" | "down";
    details?: string;
  };
  queues: QueueStatusSnapshot[];
}
