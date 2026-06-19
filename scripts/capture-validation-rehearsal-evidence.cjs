#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const {
  fail,
  info,
  loadEnvFile,
  pass,
} = require("./_validation-common.cjs");
const {
  exportValidationRehearsalEvidence,
} = require("./export-validation-rehearsal-evidence.cjs");

async function captureValidationRehearsalEvidence(options = {}) {
  const cwd = options.cwd || process.cwd();
  const logger = options.logger || { fail, info, pass };
  const envFilePath = path.resolve(
    cwd,
    options.envFilePath || ".env",
  );

  loadEnvFile(envFilePath, { override: true });

  const propositionId = options.propositionId || "";
  if (!propositionId || propositionId.trim().length === 0) {
    logger.fail(
      "Missing proposition id. Provide --proposition-id <id> when capturing validation rehearsal evidence.",
    );
    return 1;
  }

  const outputPath =
    options.outputPath ||
    path.resolve(
      cwd,
      "validation-rehearsal",
      propositionId,
      "evidence-bundle.json",
    );
  const rewardPayoutSummaryPath =
    options.rewardPayoutSummaryPath ||
    path.resolve(path.dirname(outputPath), "reward-payout-summary.json");

  const exportLogger = {
    fail(message) {
      logger.fail(message);
    },
    info(message) {
      logger.info(message);
    },
    pass() {},
  };

  const exitCode = await exportValidationRehearsalEvidence({
    ...options,
    cwd,
    propositionId,
    outputPath,
    logger: exportLogger,
  });

  if (exitCode !== 0) {
    return exitCode;
  }

  const bundle = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  const rehearsal = bundle?.propositionExport?.validationRehearsal;
  const summary = rehearsal?.summary ?? {};
  const steps = Array.isArray(rehearsal?.steps) ? rehearsal.steps : [];
  const totalStepCount =
    typeof summary.completedStepCount === "number" &&
    typeof summary.remainingStepCount === "number"
      ? Math.max(steps.length, summary.completedStepCount + summary.remainingStepCount)
      : steps.length || 5;
  const currentStepId = summary.currentStepId;
  const currentStepStatus = summary.currentStepStatus;

  logger.info(`Rehearsal target: ${rehearsal?.targetOutcome ?? "unknown"}`);
  logger.info(`Rehearsal status for ${propositionId}: ${rehearsal?.status ?? "unknown"}`);
  logger.info(
    currentStepId && currentStepStatus
      ? `Current step: ${currentStepId} (${currentStepStatus})`
      : "Current step: none (all tracked rehearsal steps are complete)",
  );
  logger.info(
    `Completed steps: ${summary.completedStepCount ?? 0}/${totalStepCount}`,
  );
  logger.info(
    summary.latestCheckpointAt && summary.latestCheckpointStepId && summary.latestCheckpointStatus
      ? `Latest checkpoint: ${summary.latestCheckpointStepId} (${summary.latestCheckpointStatus}) at ${summary.latestCheckpointAt}`
      : "Latest checkpoint: none recorded",
  );
  logger.info(`Runbook: ${rehearsal?.runbookPath ?? "unknown"}`);
  logger.info(`Evidence bundle: ${outputPath}`);
  logger.info(`Reward payout artifact: ${rewardPayoutSummaryPath}`);

  const blockingReasons = Array.isArray(summary.blockingReasons)
    ? summary.blockingReasons
    : [];
  if (blockingReasons.length > 0) {
    logger.info("Blocking reasons:");
    for (const reason of blockingReasons) {
      logger.info(`- ${reason}`);
    }
  }

  const nextCommands = Array.isArray(summary.nextCommands)
    ? summary.nextCommands
    : [];
  if (nextCommands.length > 0) {
    logger.info("Next commands:");
    for (const command of nextCommands) {
      logger.info(`- ${command}`);
    }
  } else {
    logger.info("No next commands remain; the tracked rehearsal steps are complete.");
  }

  logger.pass(
    `Validation rehearsal evidence captured for proposition ${propositionId}`,
  );
  return 0;
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
  const exitCode = await captureValidationRehearsalEvidence(options);
  process.exit(exitCode);
}

if (require.main === module) {
  main().catch((error) => {
    fail(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

module.exports = {
  captureValidationRehearsalEvidence,
  parseCliArgs,
};
