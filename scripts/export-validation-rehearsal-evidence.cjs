#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const {
  fail,
  formatFetchFailure,
  info,
  loadEnvFile,
  mergeRequestHeaders,
  pass,
} = require("./_validation-common.cjs");

async function exportValidationRehearsalEvidence(options = {}) {
  const cwd = options.cwd || process.cwd();
  const logger = options.logger || { fail, info, pass };
  const envFilePath = path.resolve(
    cwd,
    options.envFilePath || ".env",
  );

  loadEnvFile(envFilePath, { override: true });

  const propositionId = options.propositionId || "";
  const baseUrl = stripTrailingSlash(
    options.baseUrl ||
      process.env.ARENA_INTERNAL_API_BASE_URL ||
      process.env.VITE_API_BASE_URL ||
      "http://127.0.0.1:4000",
  );
  const authToken =
    options.authToken || process.env.ARENA_INTERNAL_OPERATOR_BEARER_TOKEN || "";
  const outputPath =
    options.outputPath ||
    path.resolve(cwd, "validation-rehearsal-evidence.json");
  const rewardPayoutSummaryPath =
    options.rewardPayoutSummaryPath ||
    path.resolve(path.dirname(outputPath), "reward-payout-summary.json");
  const fetchImpl = options.fetchImpl || fetch;

  if (!propositionId || propositionId.trim().length === 0) {
    logger.fail(
      "Missing proposition id. Provide --proposition-id <id> when exporting validation rehearsal evidence.",
    );
    return 1;
  }

  if (!authToken || authToken.trim().length === 0) {
    logger.fail(
      "Missing operator bearer token. Provide --auth-token <token> or set ARENA_INTERNAL_OPERATOR_BEARER_TOKEN.",
    );
    return 1;
  }

  const headers = mergeRequestHeaders({
    authorization: `Bearer ${authToken}`,
  }, `${baseUrl}/arena/internal/propositions/${propositionId}/evidence-bundle`, options);

  const bundle =
    (await tryFetchEvidenceBundle(fetchImpl, {
      propositionId,
      baseUrl,
      headers,
    })) ||
    (await fetchEvidenceBundleFromFallbackRoutes(fetchImpl, {
      propositionId,
      baseUrl,
      headers,
    }));

  const rewardPayoutSummary = await captureRewardPayoutSummary(fetchImpl, {
    propositionId,
    baseUrl,
    headers,
  });
  bundle.rewardPayoutSummary = rewardPayoutSummary;

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(bundle, null, 2)}\n`);
  fs.writeFileSync(
    rewardPayoutSummaryPath,
    `${JSON.stringify(rewardPayoutSummary, null, 2)}\n`,
  );
  logger.pass(`Validation rehearsal evidence exported to ${outputPath}`);
  return 0;
}

async function tryFetchEvidenceBundle(fetchImpl, input) {
  const bundleUrl = `${input.baseUrl}/arena/internal/propositions/${input.propositionId}/evidence-bundle`;
  let response;
  try {
    response = await fetchImpl(
      bundleUrl,
      {
        method: "GET",
        headers: input.headers,
      },
    );
  } catch (error) {
    throw new Error(
      formatFetchFailure(error, {
        url: bundleUrl,
        label: "proposition evidence bundle",
      }),
    );
  }

  if (response.ok) {
    const payload = await response.json();
    return {
      ...payload,
      baseUrl: input.baseUrl,
    };
  }

  if (response.status === 404) {
    return null;
  }

  const body = typeof response.text === "function" ? await response.text() : "";
  throw new Error(
    `Unable to fetch proposition evidence bundle: HTTP ${response.status} ${body}`.trim(),
  );
}

async function fetchEvidenceBundleFromFallbackRoutes(fetchImpl, input) {
  const runtimeContract = await fetchJsonOrThrow(fetchImpl, {
    url: `${input.baseUrl}/arena/internal/monitoring/runtime-contract`,
    headers: input.headers,
    label: "runtime-contract",
  });
  const propositionExport = await fetchJsonOrThrow(fetchImpl, {
    url: `${input.baseUrl}/arena/internal/propositions/${input.propositionId}/export`,
    headers: input.headers,
    label: "proposition export",
  });
  const rehearsalCheckpoints = await fetchJsonOrThrow(fetchImpl, {
    url: `${input.baseUrl}/arena/internal/propositions/${input.propositionId}/rehearsal-checkpoints`,
    headers: input.headers,
    label: "rehearsal checkpoints",
  });

  return {
    propositionId: input.propositionId,
    baseUrl: input.baseUrl,
    exportedAt: new Date().toISOString(),
    runtimeContract,
    propositionExport,
    rehearsalCheckpoints,
  };
}

async function captureRewardPayoutSummary(fetchImpl, input) {
  const rewardsPage = await fetchJsonOrThrow(fetchImpl, {
    url: `${input.baseUrl}/arena/internal/rewards?propositionId=${encodeURIComponent(input.propositionId)}&limit=100&offset=0`,
    headers: input.headers,
    label: "reward payout evidence",
  });
  const staleExecutionRecoverPage = await fetchJsonOrThrow(fetchImpl, {
    url: `${input.baseUrl}/arena/internal/rewards?propositionId=${encodeURIComponent(input.propositionId)}&staleExecutionOnly=true&actionQueue=execution_recover&limit=1&offset=0`,
    headers: input.headers,
    label: "stale reward payout recovery evidence",
  });
  const staleExecutionConfirmPage = await fetchJsonOrThrow(fetchImpl, {
    url: `${input.baseUrl}/arena/internal/rewards?propositionId=${encodeURIComponent(input.propositionId)}&staleExecutionOnly=true&actionQueue=execution_confirm&limit=1&offset=0`,
    headers: input.headers,
    label: "stale reward payout confirmation evidence",
  });

  const items = Array.isArray(rewardsPage?.items) ? rewardsPage.items : [];
  const payoutStatusCounts = {
    requested: 0,
    approved: 0,
    executing: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    none: 0,
  };

  let totalPayoutRecords = 0;
  let finalizedWithoutPayoutCount = 0;
  let executingWithoutTxHashCount = 0;
  let completedWithExecutionTxHashCount = 0;
  const staleExecutingWithoutTxHashCount = asCount(
    staleExecutionRecoverPage?.totalCount,
  );
  const staleExecutingAwaitingConfirmationCount = asCount(
    staleExecutionConfirmPage?.totalCount,
  );

  for (const item of items) {
    const payoutStatus =
      typeof item?.payoutStatus === "string" ? item.payoutStatus : null;
    const ledgerStatus = typeof item?.status === "string" ? item.status : null;
    const hasPayoutRecord = Boolean(item?.payoutId);
    const hasExecutionTxHash =
      typeof item?.payoutExecutionTxHash === "string" &&
      item.payoutExecutionTxHash.trim().length > 0;

    if (payoutStatus && Object.hasOwn(payoutStatusCounts, payoutStatus)) {
      payoutStatusCounts[payoutStatus] += 1;
    } else {
      payoutStatusCounts.none += 1;
    }

    if (hasPayoutRecord) {
      totalPayoutRecords += 1;
    }

    if (ledgerStatus === "finalized" && !hasPayoutRecord) {
      finalizedWithoutPayoutCount += 1;
    }

    if (payoutStatus === "executing" && !hasExecutionTxHash) {
      executingWithoutTxHashCount += 1;
    }

    if (payoutStatus === "completed" && hasExecutionTxHash) {
      completedWithExecutionTxHashCount += 1;
    }
  }

  return {
    propositionId: input.propositionId,
    generatedAt: new Date().toISOString(),
    totalLedgerEntries: items.length,
    totalPayoutRecords,
    finalizedWithoutPayoutCount,
    executingWithoutTxHashCount,
    staleExecutingCount:
      staleExecutingWithoutTxHashCount +
      staleExecutingAwaitingConfirmationCount,
    staleExecutingWithoutTxHashCount,
    staleExecutingAwaitingConfirmationCount,
    completedWithExecutionTxHashCount,
    payoutStatusCounts,
  };
}

function asCount(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

async function fetchJsonOrThrow(fetchImpl, input) {
  let response;
  try {
    response = await fetchImpl(input.url, {
      method: "GET",
      headers: input.headers,
    });
  } catch (error) {
    throw new Error(formatFetchFailure(error, input));
  }

  if (!response.ok) {
    const body = typeof response.text === "function" ? await response.text() : "";
    throw new Error(
      `Unable to fetch ${input.label} from ${input.url}: HTTP ${response.status} ${body}`.trim(),
    );
  }

  return response.json();
}

function stripTrailingSlash(value) {
  return String(value).replace(/\/+$/u, "");
}

function parseCliArgs(argv) {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];

    if (token === "--env-file" && next) {
      parsed.envFilePath = next;
      index += 1;
      continue;
    }

    if (token === "--proposition-id" && next) {
      parsed.propositionId = next;
      index += 1;
      continue;
    }

    if (token === "--output" && next) {
      parsed.outputPath = next;
      index += 1;
      continue;
    }

    if (token === "--base-url" && next) {
      parsed.baseUrl = next;
      index += 1;
      continue;
    }

    if (token === "--auth-token" && next) {
      parsed.authToken = next;
      index += 1;
    }
  }

  return parsed;
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2));
  const exitCode = await exportValidationRehearsalEvidence(options);
  process.exit(exitCode);
}

if (require.main === module) {
  main().catch((error) => {
    fail(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

module.exports = {
  exportValidationRehearsalEvidence,
  parseCliArgs,
};
