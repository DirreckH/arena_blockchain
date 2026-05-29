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

  loadEnvFile(path.resolve(cwd, ".env"), { override: true });

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
  const publicResultPath =
    options.publicOutputPath ||
    path.resolve(proofDir, "public-settled-result.json");
  const publicIntegrityPath =
    options.publicIntegrityOutputPath ||
    path.resolve(proofDir, "public-integrity-overview.json");
  const summaryPath =
    options.outputPath || path.resolve(proofDir, "proof-summary.json");

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
    artifacts: {
      backendReleaseReadiness: backendPath,
      evidenceBundle: evidencePath,
      publicSettledResult: publicResultPath,
      publicIntegrityOverview: publicIntegrityPath,
      proofSummary: summaryPath,
    },
  };

  fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);

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
  logger.info(`Backend release snapshot: ${backendPath}`);
  logger.info(`Evidence bundle: ${evidencePath}`);
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
  captureValidationProof,
};
