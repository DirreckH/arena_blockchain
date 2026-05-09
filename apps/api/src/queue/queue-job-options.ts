import type { JobsOptions } from "bullmq";

export interface QueueJobPolicy {
  retryable: boolean;
  attempts: number;
  backoff?: {
    type: "fixed" | "exponential";
    delay: number;
  };
  removeOnComplete: number;
  removeOnFail: number;
}

const KEEP_COMPLETED_JOB_COUNT = 100;
const KEEP_FAILED_JOB_COUNT = 200;

export const SAFE_RETRY_JOB_POLICY: QueueJobPolicy = {
  retryable: true,
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 1000,
  },
  removeOnComplete: KEEP_COMPLETED_JOB_COUNT,
  removeOnFail: KEEP_FAILED_JOB_COUNT,
};

export const NO_RETRY_JOB_POLICY: QueueJobPolicy = {
  retryable: false,
  attempts: 1,
  removeOnComplete: KEEP_COMPLETED_JOB_COUNT,
  removeOnFail: KEEP_FAILED_JOB_COUNT,
};

export function toJobOptions(
  policy: QueueJobPolicy,
  overrides?: Partial<JobsOptions>,
): JobsOptions {
  return {
    attempts: policy.attempts,
    backoff: policy.backoff,
    removeOnComplete: policy.removeOnComplete,
    removeOnFail: policy.removeOnFail,
    ...overrides,
  };
}
