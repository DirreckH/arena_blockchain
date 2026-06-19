#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const {
  fail,
  info,
  loadEnvFile,
  mergeRequestHeaders,
  pass,
} = require("./_validation-common.cjs");
const {
  checkBackendReleaseReadiness,
} = require("./check-backend-release-readiness.cjs");
const {
  captureValidationRehearsalEvidence,
} = require("./capture-validation-rehearsal-evidence.cjs");
const {
  checkPublicSettledResult,
} = require("./check-public-settled-result.cjs");
const {
  checkPublicIntegrityOverview,
} = require("./check-public-integrity-overview.cjs");

async function captureValidationProof(options = {}) {
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
      "Missing proposition id. Provide --proposition-id <id> when capturing validation proof.",
    );
    return 1;
  }

  const proofDir =
    options.outputDir ||
    path.resolve(cwd, "validation-rehearsal", propositionId);
  const backendPath =
    options.backendOutputPath ||
    path.resolve(proofDir, "backend-release-readiness.json");
  const evidencePath =
    options.evidenceOutputPath || path.resolve(proofDir, "evidence-bundle.json");
  const rewardPayoutPath =
    options.rewardPayoutOutputPath ||
    path.resolve(proofDir, "reward-payout-summary.json");
  const publicResultPath =
    options.publicOutputPath ||
    path.resolve(proofDir, "public-settled-result.json");
  const publicIntegrityPath =
    options.publicIntegrityOutputPath ||
    path.resolve(proofDir, "public-integrity-overview.json");
  const summaryPath =
    options.outputPath || path.resolve(proofDir, "proof-summary.json");
  const fetchImpl = options.fetchImpl || fetch;
  const baseUrl = stripTrailingSlash(
    options.baseUrl ||
      process.env.ARENA_INTERNAL_API_BASE_URL ||
      process.env.VITE_API_BASE_URL ||
      "http://127.0.0.1:4000",
  );
  const authToken =
    options.authToken || process.env.ARENA_INTERNAL_OPERATOR_BEARER_TOKEN || "";

  const releaseLogger = createBufferedLogger();
  await checkBackendReleaseReadiness({
    ...options,
    cwd,
    outputPath: backendPath,
    logger: releaseLogger,
  });

  if (!fs.existsSync(backendPath)) {
    replayBufferedFailures(releaseLogger, logger);
    if (releaseLogger.infoMessages.length > 0) {
      for (const message of releaseLogger.infoMessages) {
        logger.info(message);
      }
    }
    logger.fail(
      `Unable to capture backend release readiness for proposition ${propositionId}.`,
    );
    return 1;
  }

  const internalLogger = createBufferedLogger();
  const internalExitCode = await captureValidationRehearsalEvidence({
    ...options,
    cwd,
    propositionId,
    outputPath: evidencePath,
    logger: internalLogger,
  });

  if (internalExitCode !== 0) {
    replayBufferedFailures(internalLogger, logger);
    if (internalLogger.infoMessages.length > 0) {
      for (const message of internalLogger.infoMessages) {
        logger.info(message);
      }
    }
    logger.fail(
      `Unable to capture internal validation rehearsal evidence for proposition ${propositionId}.`,
    );
    return 1;
  }

  const publicLogger = createBufferedLogger();
  const publicExitCode = await checkPublicSettledResult({
    ...options,
    cwd,
    propositionId,
    outputPath: publicResultPath,
    logger: publicLogger,
  });
  const publicIntegrityLogger = createBufferedLogger();
  const publicIntegrityExitCode = await checkPublicIntegrityOverview({
    ...options,
    cwd,
    propositionId,
    outputPath: publicIntegrityPath,
    logger: publicIntegrityLogger,
  });

  const backendRelease = JSON.parse(fs.readFileSync(backendPath, "utf8"));
  const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
  const publicResultArtifact = JSON.parse(fs.readFileSync(publicResultPath, "utf8"));
  const publicIntegrityArtifact = JSON.parse(
    fs.readFileSync(publicIntegrityPath, "utf8"),
  );
  const rewardPayoutSummary = evidence?.rewardPayoutSummary ?? null;
  const releaseReady = backendRelease?.releaseReadiness?.status === "ready";
  const rehearsal = evidence?.propositionExport?.validationRehearsal;
  const rehearsalSummary = rehearsal?.summary ?? {};
  const validationReady = rehearsal?.status === "ready";
  const publicVisible = publicResultArtifact?.found === true;
  const publicIntegrityVisible = publicIntegrityArtifact?.visible === true;
  const failures = [];

  if (!releaseReady) {
    failures.push("releaseReadiness.blocked");
  }
  if (!validationReady) {
    failures.push("validationRehearsal.blocked");
  }
  if (!publicVisible) {
    failures.push("publicSettledResult.missing");
  }
  if (!publicIntegrityVisible) {
    failures.push("publicIntegrityOverview.missing");
  }

  const summary = {
    propositionId,
    baseUrl:
      backendRelease?.baseUrl ??
      evidence?.baseUrl ??
      publicResultArtifact?.baseUrl ??
      null,
    checkedAt: new Date().toISOString(),
    proofComplete: failures.length === 0,
    failures,
    releaseReadiness: {
      status: backendRelease?.releaseReadiness?.status ?? "unknown",
      blockingDependencies: Array.isArray(
        backendRelease?.releaseReadiness?.blockingDependencies,
      )
        ? backendRelease.releaseReadiness.blockingDependencies
        : [],
      completedGateCount:
        backendRelease?.releaseReadiness?.completedGateCount ?? 0,
      totalGateCount: backendRelease?.releaseReadiness?.totalGateCount ?? 0,
      generatedAt: backendRelease?.generatedAt ?? null,
      runbookPath:
        backendRelease?.releaseReadiness?.runbookPath ??
        "docs/contracts/arena-backend-release-runbook.md",
    },
    validationRehearsal: {
      status: rehearsal?.status ?? "unknown",
      currentStepId: rehearsalSummary.currentStepId ?? null,
      currentStepStatus: rehearsalSummary.currentStepStatus ?? null,
      completedStepCount: rehearsalSummary.completedStepCount ?? 0,
      remainingStepCount: rehearsalSummary.remainingStepCount ?? 0,
      latestCheckpointStepId: rehearsalSummary.latestCheckpointStepId ?? null,
      latestCheckpointStatus: rehearsalSummary.latestCheckpointStatus ?? null,
      latestCheckpointAt: rehearsalSummary.latestCheckpointAt ?? null,
      blockingReasons: Array.isArray(rehearsalSummary.blockingReasons)
        ? rehearsalSummary.blockingReasons
        : [],
      nextCommands: Array.isArray(rehearsalSummary.nextCommands)
        ? rehearsalSummary.nextCommands
        : [],
      runbookPath: rehearsal?.runbookPath ?? null,
    },
    publicSettledResult: {
      found: publicVisible,
      settledAt: publicResultArtifact?.publicResult?.settledAt ?? null,
      settlementTxHash:
        publicResultArtifact?.publicResult?.settlementTxHash ?? null,
      resultKind: publicResultArtifact?.publicResult?.resultKind ?? null,
      winningOptionLabel:
        publicResultArtifact?.publicResult?.winningOptionLabel ?? null,
      onChain: publicResultArtifact?.publicResult?.onChain ?? false,
      archiveTotalCount: publicResultArtifact?.totalCount ?? 0,
    },
    publicIntegrityOverview: {
      visible: publicIntegrityVisible,
      focusSource: publicIntegrityArtifact?.focus?.source ?? null,
      generatedAt: publicIntegrityArtifact?.generatedAt ?? null,
      archiveSettledCount: publicIntegrityArtifact?.archive?.settledCount ?? 0,
      archiveOnChainCount: publicIntegrityArtifact?.archive?.onChainCount ?? 0,
      liveTotalCount: publicIntegrityArtifact?.live?.totalCount ?? 0,
      focusSettledAt:
        publicIntegrityArtifact?.focus?.archiveItem?.settledAt ?? null,
      focusSettlementTxHash:
        publicIntegrityArtifact?.focus?.archiveItem?.settlementTxHash ?? null,
      liveProgressPercent:
        publicIntegrityArtifact?.focus?.liveItem?.progressPercent ?? null,
      liveReachedSampleThreshold:
        publicIntegrityArtifact?.focus?.liveItem?.reachedSampleThreshold ?? null,
    },
    rewardPayout: {
      propositionId: rewardPayoutSummary?.propositionId ?? propositionId,
      generatedAt: rewardPayoutSummary?.generatedAt ?? null,
      totalLedgerEntries: rewardPayoutSummary?.totalLedgerEntries ?? 0,
      totalPayoutRecords: rewardPayoutSummary?.totalPayoutRecords ?? 0,
      finalizedWithoutPayoutCount:
        rewardPayoutSummary?.finalizedWithoutPayoutCount ?? 0,
      executingWithoutTxHashCount:
        rewardPayoutSummary?.executingWithoutTxHashCount ?? 0,
      staleExecutingCount: rewardPayoutSummary?.staleExecutingCount ?? 0,
      staleExecutingWithoutTxHashCount:
        rewardPayoutSummary?.staleExecutingWithoutTxHashCount ?? 0,
      staleExecutingAwaitingConfirmationCount:
        rewardPayoutSummary?.staleExecutingAwaitingConfirmationCount ?? 0,
      completedWithExecutionTxHashCount:
        rewardPayoutSummary?.completedWithExecutionTxHashCount ?? 0,
      payoutStatusCounts: {
        requested: rewardPayoutSummary?.payoutStatusCounts?.requested ?? 0,
        approved: rewardPayoutSummary?.payoutStatusCounts?.approved ?? 0,
        executing: rewardPayoutSummary?.payoutStatusCounts?.executing ?? 0,
        completed: rewardPayoutSummary?.payoutStatusCounts?.completed ?? 0,
        failed: rewardPayoutSummary?.payoutStatusCounts?.failed ?? 0,
        cancelled: rewardPayoutSummary?.payoutStatusCounts?.cancelled ?? 0,
        none: rewardPayoutSummary?.payoutStatusCounts?.none ?? 0,
      },
    },
    artifacts: {
      backendReleaseReadiness: backendPath,
      evidenceBundle: evidencePath,
      rewardPayoutSummary: rewardPayoutPath,
      publicSettledResult: publicResultPath,
      publicIntegrityOverview: publicIntegrityPath,
      proofSummary: summaryPath,
    },
  };

  fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);

  if (authToken && authToken.trim().length > 0) {
    await registerValidationProofRecord({
      fetchImpl,
      baseUrl,
      authToken,
      summary,
      logger,
    });
  }

  logger.info(
    `Proof status for ${propositionId}: ${summary.proofComplete ? "complete" : "incomplete"}`,
  );
  logger.info(`Release readiness: ${summary.releaseReadiness.status}`);
  logger.info(`Validation rehearsal: ${summary.validationRehearsal.status}`);
  logger.info(`Public settled result: ${publicVisible ? "visible" : "missing"}`);
  logger.info(
    `Public integrity overview: ${publicIntegrityVisible ? "visible" : "missing"}`,
  );
  if (summary.validationRehearsal.latestCheckpointStepId) {
    logger.info(
      `Latest checkpoint: ${summary.validationRehearsal.latestCheckpointStepId} (${summary.validationRehearsal.latestCheckpointStatus ?? "unknown"}) at ${summary.validationRehearsal.latestCheckpointAt}`,
    );
  }
  if (publicVisible) {
    logger.info(`Public settled at: ${summary.publicSettledResult.settledAt}`);
    logger.info(
      `Public settlement tx: ${summary.publicSettledResult.settlementTxHash ?? "missing"}`,
    );
  }
  if (publicIntegrityVisible) {
    logger.info(
      `Public integrity focus source: ${summary.publicIntegrityOverview.focusSource ?? "unknown"}`,
    );
    if (summary.publicIntegrityOverview.focusSource === "archive") {
      logger.info(
        `Public integrity settled at: ${summary.publicIntegrityOverview.focusSettledAt}`,
      );
      logger.info(
        `Public integrity settlement tx: ${summary.publicIntegrityOverview.focusSettlementTxHash ?? "missing"}`,
      );
    }
    if (summary.publicIntegrityOverview.focusSource === "live") {
      logger.info(
        `Public integrity live progress: ${summary.publicIntegrityOverview.liveProgressPercent ?? "unknown"}%`,
      );
    }
  }
  logger.info(
    `Reward payouts: ${summary.rewardPayout.payoutStatusCounts.completed} completed, ${summary.rewardPayout.finalizedWithoutPayoutCount} finalized rewards still pending payout follow-through, ${summary.rewardPayout.staleExecutingCount} stale executing payouts`,
  );
  logger.info(`Backend release snapshot: ${backendPath}`);
  logger.info(`Evidence bundle: ${evidencePath}`);
  logger.info(`Reward payout artifact: ${rewardPayoutPath}`);
  logger.info(`Public result artifact: ${publicResultPath}`);
  logger.info(`Public integrity artifact: ${publicIntegrityPath}`);
  logger.info(`Proof summary: ${summaryPath}`);

  if (summary.releaseReadiness.blockingDependencies.length > 0) {
    logger.info("Release blocking dependencies:");
    for (const dependency of summary.releaseReadiness.blockingDependencies) {
      logger.info(`- ${dependency}`);
    }
  }
  if (!validationReady && summary.validationRehearsal.currentStepId) {
    logger.info(
      `Current blocked rehearsal step: ${summary.validationRehearsal.currentStepId}`,
    );
  }
  if (summary.validationRehearsal.blockingReasons.length > 0) {
    logger.info("Rehearsal blocking reasons:");
    for (const reason of summary.validationRehearsal.blockingReasons) {
      logger.info(`- ${reason}`);
    }
  }

  if (summary.proofComplete) {
    logger.pass(`Validation proposition proof is complete for ${propositionId}`);
    return 0;
  }

  if (publicExitCode !== 0 && publicLogger.failMessages.length > 0) {
    for (const message of publicLogger.failMessages) {
      logger.info(`Public result note: ${message}`);
    }
  }
  if (
    publicIntegrityExitCode !== 0 &&
    publicIntegrityLogger.failMessages.length > 0
  ) {
    for (const message of publicIntegrityLogger.failMessages) {
      logger.info(`Public integrity note: ${message}`);
    }
  }

  logSuggestedFollowUpCommands(logger, {
    authToken,
    baseUrl,
    envFilePath,
    propositionId,
  });

  logger.fail("Validation proposition proof is incomplete.");
  return 1;
}

function createBufferedLogger() {
  return {
    failMessages: [],
    infoMessages: [],
    passMessages: [],
    fail(message) {
      this.failMessages.push(message);
    },
    info(message) {
      this.infoMessages.push(message);
    },
    pass(message) {
      this.passMessages.push(message);
    },
  };
}

function replayBufferedFailures(buffer, logger) {
  for (const message of buffer.failMessages) {
    logger.fail(message);
  }
}

function logSuggestedFollowUpCommands(logger, options) {
  logger.info("Suggested follow-up commands:");
  logger.info(buildValidationProofCaptureCommand(options));
  logger.info(buildValidationOperatorBriefingCommand(options));
}

function buildValidationProofCaptureCommand(options) {
  const envFileArgs = options.envFilePath
    ? ` --env-file ${options.envFilePath}`
    : "";
  const authTokenArgs = options.authToken ? " --auth-token <operator-token>" : "";
  return `- pnpm run validation:proof:capture -- --proposition-id ${options.propositionId}${envFileArgs} --base-url ${options.baseUrl}${authTokenArgs}`;
}

function buildValidationOperatorBriefingCommand(options) {
  const envFileArgs = options.envFilePath
    ? ` --env-file ${options.envFilePath}`
    : "";
  const authTokenArgs = options.authToken ? " --auth-token <operator-token>" : "";
  return `- pnpm run validation:ops:brief -- --proposition-id ${options.propositionId}${envFileArgs} --base-url ${options.baseUrl}${authTokenArgs}`;
}

async function registerValidationProofRecord(input) {
  const proofRecordUrl = `${input.baseUrl}/arena/internal/validation-chain/proof-record`;
  const response = await input.fetchImpl(
    proofRecordUrl,
    {
      method: "POST",
      headers: mergeRequestHeaders({
        authorization: `Bearer ${input.authToken}`,
        "content-type": "application/json",
      }, proofRecordUrl, input),
      body: JSON.stringify({
        propositionId: input.summary.propositionId,
        proofComplete: input.summary.proofComplete,
        failures: input.summary.failures,
        releaseReadinessStatus: input.summary.releaseReadiness.status,
        releaseBlockingDependencies:
          input.summary.releaseReadiness.blockingDependencies,
        validationRehearsalStatus: input.summary.validationRehearsal.status,
        validationCurrentStepId:
          input.summary.validationRehearsal.currentStepId ?? null,
        validationCurrentStepStatus:
          input.summary.validationRehearsal.currentStepStatus ?? null,
        completedStepCount:
          input.summary.validationRehearsal.completedStepCount ?? 0,
        remainingStepCount:
          input.summary.validationRehearsal.remainingStepCount ?? 0,
        latestCheckpointStepId:
          input.summary.validationRehearsal.latestCheckpointStepId ?? null,
        latestCheckpointStatus:
          input.summary.validationRehearsal.latestCheckpointStatus ?? null,
        latestCheckpointAt:
          input.summary.validationRehearsal.latestCheckpointAt ?? null,
        publicSettledResultVisible: input.summary.publicSettledResult.found,
        publicIntegrityOverviewVisible:
          input.summary.publicIntegrityOverview.visible,
        rewardPayoutLedgerEntryCount:
          input.summary.rewardPayout.totalLedgerEntries ?? 0,
        rewardPayoutRecordCount:
          input.summary.rewardPayout.totalPayoutRecords ?? 0,
        rewardPayoutFinalizedWithoutPayoutCount:
          input.summary.rewardPayout.finalizedWithoutPayoutCount ?? 0,
        rewardPayoutExecutingWithoutTxHashCount:
          input.summary.rewardPayout.executingWithoutTxHashCount ?? 0,
        rewardPayoutStaleExecutingCount:
          input.summary.rewardPayout.staleExecutingCount ?? 0,
        rewardPayoutStaleExecutingWithoutTxHashCount:
          input.summary.rewardPayout.staleExecutingWithoutTxHashCount ?? 0,
        rewardPayoutStaleExecutingAwaitingConfirmationCount:
          input.summary.rewardPayout
            .staleExecutingAwaitingConfirmationCount ?? 0,
        rewardPayoutCompletedWithExecutionTxHashCount:
          input.summary.rewardPayout.completedWithExecutionTxHashCount ?? 0,
        rewardPayoutStatusCounts:
          input.summary.rewardPayout.payoutStatusCounts ?? null,
        summaryArtifactPath: input.summary.artifacts.proofSummary,
        evidenceArtifactPath: input.summary.artifacts.evidenceBundle,
        rewardPayoutArtifactPath: input.summary.artifacts.rewardPayoutSummary,
        publicResultArtifactPath: input.summary.artifacts.publicSettledResult,
        publicIntegrityArtifactPath:
          input.summary.artifacts.publicIntegrityOverview,
        checkedAt: input.summary.checkedAt,
      }),
    },
  );

  if (!response.ok) {
    const body = typeof response.text === "function" ? await response.text() : "";
    throw new Error(
      `Unable to register validation proof record: HTTP ${response.status} ${body}`.trim(),
    );
  }

  input.logger.info(
    `Validation proof record registered for ${input.summary.propositionId}.`,
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
  const exitCode = await captureValidationProof(options);
  process.exit(exitCode);
}

if (require.main === module) {
  main().catch((error) => {
    fail(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

module.exports = {
  buildValidationOperatorBriefingCommand,
  buildValidationProofCaptureCommand,
  captureValidationProof,
  parseCliArgs,
};
