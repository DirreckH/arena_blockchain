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

const BACKEND_RELEASE_RUNBOOK_PATH =
  "docs/contracts/arena-backend-release-runbook.md";

async function checkBackendReleaseReadiness(options = {}) {
  const cwd = options.cwd || process.cwd();
  const logger = options.logger || { fail, info, pass };
  const envFilePath = path.resolve(
    cwd,
    options.envFilePath || ".env",
  );

  loadEnvFile(envFilePath, { override: true });

  const baseUrl = stripTrailingSlash(
    options.baseUrl ||
      process.env.ARENA_INTERNAL_API_BASE_URL ||
      process.env.VITE_API_BASE_URL ||
      "http://127.0.0.1:4000",
  );
  const authToken =
    options.authToken || process.env.ARENA_INTERNAL_OPERATOR_BEARER_TOKEN || "";
  const outputPath =
    options.outputPath || path.resolve(cwd, "backend-release-readiness.json");
  const fetchImpl = options.fetchImpl || fetch;

  if (!authToken || authToken.trim().length === 0) {
    logger.fail(
      "Missing operator bearer token. Provide --auth-token <token> or set ARENA_INTERNAL_OPERATOR_BEARER_TOKEN.",
    );
    return 1;
  }

  const runtimeContract = await fetchJsonOrThrow(fetchImpl, {
    url: `${baseUrl}/arena/internal/monitoring/runtime-contract`,
    headers: mergeRequestHeaders({
      authorization: `Bearer ${authToken}`,
    }, `${baseUrl}/arena/internal/monitoring/runtime-contract`, options),
    label: "backend runtime contract",
  });

  const snapshot = {
    ...runtimeContract,
    baseUrl,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);

  logger.info(
    `Environment: ${runtimeContract.environment?.nodeEnv ?? "unknown"} / ${runtimeContract.environment?.validationEnvironment ?? "unknown"} / port ${runtimeContract.environment?.port ?? "unknown"}`,
  );
  logger.info(`Base URL: ${baseUrl}`);
  logger.info(`Generated at: ${runtimeContract.generatedAt ?? "unknown"}`);
  logger.info(`Runtime contract status: ${runtimeContract.status ?? "unknown"}`);
  logger.info(
    `Release readiness: ${runtimeContract.releaseReadiness?.status ?? "unknown"} (${runtimeContract.releaseReadiness?.completedGateCount ?? 0}/${runtimeContract.releaseReadiness?.totalGateCount ?? 0} gates complete)`,
  );
  logger.info(`Runbook: ${BACKEND_RELEASE_RUNBOOK_PATH}`);
  logger.info(`Runtime contract snapshot: ${outputPath}`);

  const blockingDependencies = Array.isArray(
    runtimeContract.releaseReadiness?.blockingDependencies,
  )
    ? runtimeContract.releaseReadiness.blockingDependencies
    : [];

  if (blockingDependencies.length === 0) {
    logger.info("Blocking dependencies: none");
  } else {
    logger.info("Blocking dependencies:");
    for (const dependency of blockingDependencies) {
      logger.info(`- ${dependency}`);
    }
  }

  const checklist = Array.isArray(runtimeContract.releaseChecklist)
    ? runtimeContract.releaseChecklist
    : [];
  logger.info("Release checklist:");
  for (const gate of checklist) {
    logger.info(`- [${gate.status}] ${gate.id}: ${gate.summary}`);
  }

  const blockedGates = checklist.filter((gate) => gate.status === "blocked");
  if (blockedGates.length > 0) {
    logger.info("Blocked gate commands:");
    for (const gate of blockedGates) {
      logger.info(`- ${gate.id}`);
      for (const command of uniqueStrings(gate.commands)) {
        logger.info(`  - ${command}`);
      }
    }
  }

  if (blockedGates.some((gate) => uniqueStrings(gate.operatorActions).length > 0)) {
    logger.info("Blocked gate operator actions:");
    for (const gate of blockedGates) {
      const operatorActions = uniqueStrings(gate.operatorActions);
      if (operatorActions.length === 0) {
        continue;
      }
      logger.info(`- ${gate.id}`);
      for (const action of operatorActions) {
        logger.info(`  - ${action}`);
      }
    }
  }

  const operatorActions = Array.isArray(runtimeContract.validationChain?.operatorActions)
    ? runtimeContract.validationChain.operatorActions
    : [];
  const relevantOperatorActions = operatorActions.filter((action) =>
    blockingDependencies.includes(action.dependency),
  );
  if (relevantOperatorActions.length > 0) {
    logger.info("Validation operator actions:");
    for (const action of relevantOperatorActions) {
      logger.info(`- ${action.dependency}: ${action.summary}`);
      if (Array.isArray(action.envKeys) && action.envKeys.length > 0) {
        logger.info(`  envKeys: ${action.envKeys.join(", ")}`);
      }
      for (const command of uniqueStrings(action.commands)) {
        logger.info(`  - ${command}`);
      }
    }
  }

  if (runtimeContract.validationProofRecord) {
    logValidationProofRecordSummary(logger, runtimeContract.validationProofRecord);
  } else {
    logger.info("Validation proof record: missing");
  }

  if (runtimeContract.releaseReadiness?.status === "blocked") {
    logSuggestedRerunCommands(logger, {
      baseUrl,
      propositionId: runtimeContract.validationProofRecord?.propositionId,
    });
    logger.fail("Backend release readiness is blocked.");
    return 1;
  }

  logger.pass("Backend release readiness passed.");
  return 0;
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

function uniqueStrings(values) {
  return Array.from(
    new Set(Array.isArray(values) ? values.filter((value) => typeof value === "string") : []),
  );
}

function logValidationProofRecordSummary(logger, proofRecord) {
  logger.info(
    `Validation proof record: ${proofRecord.proofComplete ? "complete" : "incomplete"} / ${proofRecord.environment ?? "unknown"} / chain ${proofRecord.chainId ?? "unknown"} / proposition ${proofRecord.propositionId ?? "unknown"}`,
  );
  logger.info(
    `Validation proof release status: ${proofRecord.releaseReadinessStatus ?? "unknown"}`,
  );
  logger.info(
    `Validation proof payout summary: ledgers=${proofRecord.rewardPayoutLedgerEntryCount ?? 0}, payouts=${proofRecord.rewardPayoutRecordCount ?? 0}, finalizedWithoutPayout=${proofRecord.rewardPayoutFinalizedWithoutPayoutCount ?? 0}, executingWithoutTxHash=${proofRecord.rewardPayoutExecutingWithoutTxHashCount ?? 0}, staleExecuting=${proofRecord.rewardPayoutStaleExecutingCount ?? 0}`,
  );

  const payoutStatusCounts = proofRecord.rewardPayoutStatusCounts || {};
  logger.info(
    `Validation proof payout statuses: requested=${payoutStatusCounts.requested ?? 0}, approved=${payoutStatusCounts.approved ?? 0}, executing=${payoutStatusCounts.executing ?? 0}, completed=${payoutStatusCounts.completed ?? 0}, failed=${payoutStatusCounts.failed ?? 0}, cancelled=${payoutStatusCounts.cancelled ?? 0}, none=${payoutStatusCounts.none ?? 0}`,
  );

  const proofBlockingDependencies = uniqueStrings(
    proofRecord.releaseBlockingDependencies,
  );
  if (proofBlockingDependencies.length === 0) {
    logger.info("Validation proof blocking dependencies: none");
  } else {
    logger.info(
      `Validation proof blocking dependencies: ${proofBlockingDependencies.join(", ")}`,
    );
  }

  if (typeof proofRecord.summaryArtifactPath === "string" && proofRecord.summaryArtifactPath.length > 0) {
    logger.info(`Validation proof summary artifact: ${proofRecord.summaryArtifactPath}`);
  }
  if (typeof proofRecord.evidenceArtifactPath === "string" && proofRecord.evidenceArtifactPath.length > 0) {
    logger.info(`Validation proof evidence artifact: ${proofRecord.evidenceArtifactPath}`);
  }
  if (
    typeof proofRecord.rewardPayoutArtifactPath === "string" &&
    proofRecord.rewardPayoutArtifactPath.length > 0
  ) {
    logger.info(
      `Validation proof reward payout artifact: ${proofRecord.rewardPayoutArtifactPath}`,
    );
  }
}

function logSuggestedRerunCommands(logger, options) {
  logger.info("Suggested rerun commands after remediation:");
  logger.info(
    `- pnpm run backend:release:check -- --base-url ${options.baseUrl} --auth-token <operator-token>`,
  );
  if (typeof options.propositionId === "string" && options.propositionId.length > 0) {
    logger.info(
      `- pnpm run validation:proof:capture -- --proposition-id ${options.propositionId} --base-url ${options.baseUrl} --env-file <path-to-release-env> --auth-token <operator-token>`,
    );
  }
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
  const exitCode = await checkBackendReleaseReadiness(options);
  process.exit(exitCode);
}

if (require.main === module) {
  main().catch((error) => {
    fail(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

module.exports = {
  BACKEND_RELEASE_RUNBOOK_PATH,
  checkBackendReleaseReadiness,
  parseCliArgs,
};
