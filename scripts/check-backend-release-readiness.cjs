#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const {
  fail,
  formatFetchFailure,
  info,
  loadEnvFile,
  pass,
} = require("./_validation-common.cjs");

const BACKEND_RELEASE_RUNBOOK_PATH =
  "docs/contracts/arena-backend-release-runbook.md";

async function checkBackendReleaseReadiness(options = {}) {
  const cwd = options.cwd || process.cwd();
  const logger = options.logger || { fail, info, pass };

  loadEnvFile(path.resolve(cwd, ".env"), { override: true });

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
    headers: {
      authorization: `Bearer ${authToken}`,
    },
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

  if (runtimeContract.releaseReadiness?.status === "blocked") {
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

function stripTrailingSlash(value) {
  return String(value).replace(/\/+$/u, "");
}

function parseCliArgs(argv) {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];

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
};
