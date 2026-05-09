import type { Job } from "bullmq";

export function buildJobLogContext(
  queue: string,
  job?: Job,
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    queue,
    jobName: job?.name,
    jobId: job?.id ? String(job.id) : undefined,
    attempt: job ? job.attemptsMade + 1 : undefined,
    attemptsConfigured:
      typeof job?.opts.attempts === "number" ? job.opts.attempts : undefined,
    requestId:
      typeof job?.data?.requestId === "string" ? job.data.requestId : undefined,
    traceId:
      typeof job?.data?.traceId === "string" ? job.data.traceId : undefined,
    requestedBy:
      typeof job?.data?.requestedBy === "string" ? job.data.requestedBy : undefined,
    ...extra,
  };
}
