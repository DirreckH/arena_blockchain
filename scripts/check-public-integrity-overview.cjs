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

async function checkPublicIntegrityOverview(options = {}) {
  const cwd = options.cwd || process.cwd();
  const logger = options.logger || { fail, info, pass };

  loadEnvFile(path.resolve(cwd, ".env"), { override: true });

  const propositionId = options.propositionId || "";
  const baseUrl = stripTrailingSlash(
    options.baseUrl ||
      process.env.VITE_API_BASE_URL ||
      process.env.ARENA_INTERNAL_API_BASE_URL ||
      "http://127.0.0.1:4000",
  );
  const outputPath =
    options.outputPath ||
    path.resolve(
      cwd,
      "validation-rehearsal",
      propositionId,
      "public-integrity-overview.json",
    );
  const fetchImpl = options.fetchImpl || fetch;

  if (!propositionId || propositionId.trim().length === 0) {
    logger.fail(
      "Missing proposition id. Provide --proposition-id <id> when checking the public integrity overview.",
    );
    return 1;
  }

  const overview = await fetchJsonOrThrow(fetchImpl, {
    url: `${baseUrl}/arena/public/integrity/overview?propositionId=${encodeURIComponent(propositionId)}`,
    label: "public integrity overview",
  });
  const focus = overview?.focus ?? null;
  const archive = overview?.archive ?? {};
  const live = overview?.live ?? {};

  const artifact = {
    propositionId,
    baseUrl,
    checkedAt: new Date().toISOString(),
    publicIntegrityOverviewRoute: `${baseUrl}/arena/public/integrity/overview?propositionId=${encodeURIComponent(propositionId)}`,
    generatedAt: overview?.generatedAt ?? null,
    visible: focus?.visible === true,
    focus,
    archive: {
      settledCount:
        typeof archive?.settledCount === "number" ? archive.settledCount : 0,
      onChainCount:
        typeof archive?.onChainCount === "number" ? archive.onChainCount : 0,
      averageValidSampleCount:
        typeof archive?.averageValidSampleCount === "number"
          ? archive.averageValidSampleCount
          : 0,
      latestSettledAt: archive?.latestSettledAt ?? null,
      recentItems: Array.isArray(archive?.recentItems) ? archive.recentItems : [],
    },
    live: {
      totalCount: typeof live?.totalCount === "number" ? live.totalCount : 0,
      reachedSampleThresholdCount:
        typeof live?.reachedSampleThresholdCount === "number"
          ? live.reachedSampleThresholdCount
          : 0,
      marketEnabledCount:
        typeof live?.marketEnabledCount === "number" ? live.marketEnabledCount : 0,
      phaseBreakdown: Array.isArray(live?.phaseBreakdown) ? live.phaseBreakdown : [],
    },
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);

  logger.info(`Public integrity route: ${artifact.publicIntegrityOverviewRoute}`);
  logger.info(`Overview generatedAt: ${artifact.generatedAt ?? "unknown"}`);
  logger.info(`Live public count: ${artifact.live.totalCount}`);
  logger.info(`Archive settled count: ${artifact.archive.settledCount}`);

  if (!artifact.visible) {
    logger.fail(
      `Proposition ${propositionId} is not yet visible in the public integrity overview.`,
    );
    return 1;
  }

  logger.info(`Focus source: ${focus?.source ?? "unknown"}`);
  logger.info(`Visible proposition: ${focus?.propositionId}`);
  if (focus?.archiveItem) {
    logger.info(`Archive settled at: ${focus.archiveItem.settledAt}`);
    logger.info(
      `Archive settlement tx: ${focus.archiveItem.settlementTxHash ?? "missing"}`,
    );
  }
  if (focus?.liveItem) {
    logger.info(
      `Live progress: ${focus.liveItem.effectiveSampleCount}/${focus.liveItem.requiredSampleCount} (${focus.liveItem.progressPercent}%)`,
    );
    logger.info(
      `Sample threshold reached: ${focus.liveItem.reachedSampleThreshold ? "yes" : "no"}`,
    );
  }

  logger.pass(
    `Public integrity overview verification passed for proposition ${propositionId}`,
  );
  return 0;
}

async function fetchJsonOrThrow(fetchImpl, input) {
  let response;
  try {
    response = await fetchImpl(input.url, {
      method: "GET",
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
    }
  }

  return parsed;
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2));
  const exitCode = await checkPublicIntegrityOverview(options);
  process.exit(exitCode);
}

if (require.main === module) {
  main().catch((error) => {
    fail(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

module.exports = {
  checkPublicIntegrityOverview,
};
