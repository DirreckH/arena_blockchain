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

async function checkPublicSettledResult(options = {}) {
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
      "public-settled-result.json",
    );
  const fetchImpl = options.fetchImpl || fetch;

  if (!propositionId || propositionId.trim().length === 0) {
    logger.fail(
      "Missing proposition id. Provide --proposition-id <id> when checking public settled results.",
    );
    return 1;
  }

  const archive = await fetchJsonOrThrow(fetchImpl, {
    url: `${baseUrl}/arena/public/results/settled`,
    label: "public settled results",
  });
  const items = Array.isArray(archive?.items) ? archive.items : [];
  const publicResult =
    items.find((item) => item?.propositionId === propositionId) ?? null;

  const artifact = {
    propositionId,
    baseUrl,
    checkedAt: new Date().toISOString(),
    totalCount:
      typeof archive?.totalCount === "number" ? archive.totalCount : items.length,
    found: publicResult !== null,
    publicResultsRoute: `${baseUrl}/arena/public/results/settled`,
    publicResult,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);

  logger.info(`Public results route: ${artifact.publicResultsRoute}`);
  logger.info(`Archive totalCount: ${artifact.totalCount}`);

  if (!publicResult) {
    logger.fail(
      `Proposition ${propositionId} is not yet visible in the public settled results archive.`,
    );
    return 1;
  }

  logger.info(`Matched proposition: ${publicResult.propositionId}`);
  logger.info(`Title: ${publicResult.title}`);
  logger.info(`Settled at: ${publicResult.settledAt}`);
  logger.info(
    `Result: ${publicResult.resultKind} / ${publicResult.winningOptionLabel ?? "unknown"}`,
  );
  logger.info(`Settlement tx: ${publicResult.settlementTxHash ?? "missing"}`);
  logger.info(`On-chain evidence: ${publicResult.onChain ? "yes" : "no"}`);
  logger.pass(
    `Public settled-result verification passed for proposition ${propositionId}`,
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
  const exitCode = await checkPublicSettledResult(options);
  process.exit(exitCode);
}

if (require.main === module) {
  main().catch((error) => {
    fail(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

module.exports = {
  checkPublicSettledResult,
};
