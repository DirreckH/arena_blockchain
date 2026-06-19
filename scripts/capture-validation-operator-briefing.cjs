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
const {
  BACKEND_RELEASE_RUNBOOK_PATH,
  checkBackendReleaseReadiness,
} = require("./check-backend-release-readiness.cjs");
const {
  exportValidationRehearsalEvidence,
} = require("./export-validation-rehearsal-evidence.cjs");
const {
  checkPublicSettledResult,
} = require("./check-public-settled-result.cjs");
const {
  checkPublicIntegrityOverview,
} = require("./check-public-integrity-overview.cjs");

const VALIDATION_RUNBOOK_PATH =
  "docs/contracts/arena-validation-chain-runbook.md";

async function captureValidationOperatorBriefing(options = {}) {
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
      "Missing proposition id. Provide --proposition-id <id> when capturing the validation operator briefing.",
    );
    return 1;
  }

  const baseUrl = stripTrailingSlash(
    options.baseUrl ||
      process.env.ARENA_INTERNAL_API_BASE_URL ||
      process.env.VITE_API_BASE_URL ||
      "http://127.0.0.1:4000",
  );
  const authToken =
    options.authToken || process.env.ARENA_INTERNAL_OPERATOR_BEARER_TOKEN || "";
  if (!authToken || authToken.trim().length === 0) {
    logger.fail(
      "Missing operator bearer token. Provide --auth-token <token> or set ARENA_INTERNAL_OPERATOR_BEARER_TOKEN.",
    );
    return 1;
  }

  const proofDir =
    options.outputDir ||
    path.resolve(cwd, "validation-rehearsal", propositionId);
  const backendPath =
    options.backendOutputPath ||
    path.resolve(proofDir, "backend-release-readiness.json");
  const validationChainPath =
    options.validationChainOutputPath ||
    path.resolve(proofDir, "validation-chain-monitoring.json");
  const evidencePath =
    options.evidenceOutputPath || path.resolve(proofDir, "evidence-bundle.json");
  const publicResultPath =
    options.publicOutputPath ||
    path.resolve(proofDir, "public-settled-result.json");
  const publicIntegrityPath =
    options.publicIntegrityOutputPath ||
    path.resolve(proofDir, "public-integrity-overview.json");
  const outputPath =
    options.outputPath || path.resolve(proofDir, "operator-briefing.json");
  const fetchImpl = options.fetchImpl || fetch;

  const backendLogger = createBufferedLogger();
  await checkBackendReleaseReadiness({
    ...options,
    cwd,
    baseUrl,
    authToken,
    outputPath: backendPath,
    fetchImpl,
    logger: backendLogger,
  });
  if (!fs.existsSync(backendPath)) {
    replayBufferedLogger(backendLogger, logger);
    logger.fail(
      `Unable to capture backend release readiness while briefing proposition ${propositionId}.`,
    );
    return 1;
  }

  const evidenceLogger = createBufferedLogger();
  const evidenceExitCode = await exportValidationRehearsalEvidence({
    ...options,
    cwd,
    propositionId,
    baseUrl,
    authToken,
    outputPath: evidencePath,
    fetchImpl,
    logger: evidenceLogger,
  });
  if (evidenceExitCode !== 0 || !fs.existsSync(evidencePath)) {
    replayBufferedLogger(evidenceLogger, logger);
    logger.fail(
      `Unable to capture proposition evidence while briefing proposition ${propositionId}.`,
    );
    return 1;
  }

  const validationChain = await fetchJsonOrThrow(fetchImpl, {
    url: `${baseUrl}/arena/internal/monitoring/validation-chain`,
    headers: mergeRequestHeaders({
      authorization: `Bearer ${authToken}`,
    }, `${baseUrl}/arena/internal/monitoring/validation-chain`, options),
    label: "validation-chain monitoring",
  });
  fs.mkdirSync(path.dirname(validationChainPath), { recursive: true });
  fs.writeFileSync(
    validationChainPath,
    `${JSON.stringify(
      {
        ...validationChain,
        baseUrl,
      },
      null,
      2,
    )}\n`,
  );

  const publicResultLogger = createBufferedLogger();
  const publicResultExitCode = await checkPublicSettledResult({
    ...options,
    cwd,
    propositionId,
    baseUrl,
    outputPath: publicResultPath,
    fetchImpl,
    logger: publicResultLogger,
  });
  if (!fs.existsSync(publicResultPath)) {
    replayBufferedLogger(publicResultLogger, logger);
    logger.fail(
      `Unable to capture the public settled-result artifact for proposition ${propositionId}.`,
    );
    return 1;
  }

  const publicIntegrityLogger = createBufferedLogger();
  const publicIntegrityExitCode = await checkPublicIntegrityOverview({
    ...options,
    cwd,
    propositionId,
    baseUrl,
    outputPath: publicIntegrityPath,
    fetchImpl,
    logger: publicIntegrityLogger,
  });
  if (!fs.existsSync(publicIntegrityPath)) {
    replayBufferedLogger(publicIntegrityLogger, logger);
    logger.fail(
      `Unable to capture the public integrity artifact for proposition ${propositionId}.`,
    );
    return 1;
  }

  const backendRelease = JSON.parse(fs.readFileSync(backendPath, "utf8"));
  const evidenceBundle = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
  const validationChainArtifact = JSON.parse(
    fs.readFileSync(validationChainPath, "utf8"),
  );
  const publicResultArtifact = JSON.parse(
    fs.readFileSync(publicResultPath, "utf8"),
  );
  const publicIntegrityArtifact = JSON.parse(
    fs.readFileSync(publicIntegrityPath, "utf8"),
  );

  const briefing = buildOperatorBriefing({
    propositionId,
    baseUrl,
    authToken,
    envFilePath,
    proofDir,
    backendPath,
    validationChainPath,
    evidencePath,
    publicResultPath,
    publicIntegrityPath,
    outputPath,
    backendRelease,
    validationChain: validationChainArtifact,
    evidenceBundle,
    publicResultArtifact,
    publicIntegrityArtifact,
    publicResultNotes: [...publicResultLogger.failMessages],
    publicIntegrityNotes: [...publicIntegrityLogger.failMessages],
  });

  fs.writeFileSync(outputPath, `${JSON.stringify(briefing, null, 2)}\n`);

  logBriefingSummary(logger, briefing);

  if (briefing.currentOperatorPath.status === "ready") {
    logger.pass(
      `Validation operator briefing captured for proposition ${propositionId}.`,
    );
    return 0;
  }

  if (publicResultExitCode !== 0 || publicIntegrityExitCode !== 0) {
    for (const note of briefing.surfaces.publicProof.notes) {
      logger.info(`Public proof note: ${note}`);
    }
  }
  logger.fail("Validation operator briefing requires action.");
  return 1;
}

function buildOperatorBriefing(input) {
  const propositionExport = input.evidenceBundle?.propositionExport ?? {};
  const proposition = propositionExport?.proposition ?? {
    id: input.propositionId,
    title: null,
  };
  const validationRehearsal = propositionExport?.validationRehearsal ?? {};
  const validationRehearsalSummary = validationRehearsal?.summary ?? {};
  const validationOperatorSummary =
    propositionExport?.validationOperatorSummary ?? {};
  const runtimeOperatorSummary = input.backendRelease?.operatorSummary ?? {};
  const validationChainOperatorSummary =
    input.validationChain?.operatorSummary ?? {};
  const rewardPayoutSummary = input.evidenceBundle?.rewardPayoutSummary ?? {};
  const publicSettledFound = input.publicResultArtifact?.found === true;
  const publicIntegrityVisible = input.publicIntegrityArtifact?.visible === true;
  const envFileArgs = input.envFilePath
    ? ` --env-file ${input.envFilePath}`
    : "";
  const authTokenArgs = input.authToken
    ? " --auth-token <operator-token>"
    : "";
  const betaGateFailures = buildBetaGateFailures({
    releaseReadiness: input.backendRelease?.releaseReadiness,
    validationRehearsal,
    publicSettledFound,
    publicIntegrityVisible,
  });
  const proofCaptureCommand =
    `pnpm run validation:proof:capture -- --proposition-id ${input.propositionId}${envFileArgs} --base-url ${input.baseUrl}${authTokenArgs}`;
  const briefingCommand =
    `pnpm run validation:ops:brief -- --proposition-id ${input.propositionId}${envFileArgs} --base-url ${input.baseUrl}${authTokenArgs}`;
  const healthySummary =
    "Release readiness, validation runtime, proposition rehearsal, and public beta proof signals are all green.";

  const releaseOpsClosure = {
    status:
      input.backendRelease?.releaseReadiness?.status === "ready"
        ? "ready"
        : "action_required",
    summary:
      runtimeOperatorSummary.summary ??
      "Release readiness still needs operator review.",
    blockers: uniqueStrings(
      input.backendRelease?.releaseReadiness?.blockingDependencies,
    ),
    nextCommands: uniqueStrings([
      "GET /arena/internal/monitoring/runtime-contract",
      "GET /health/ready",
      ...runtimeOperatorSummary.operatorActions,
      `pnpm run backend:release:check --${envFileArgs} --base-url ${input.baseUrl}${authTokenArgs}`,
    ]),
    runbookPath: BACKEND_RELEASE_RUNBOOK_PATH,
    artifactPath: input.backendPath,
  };

  const runtimeHardeningNeedsAction =
    validationChainOperatorSummary.requiresActionNow === true ||
    validationOperatorSummary.requiresActionNow === true;
  const runtimeHardeningSummary = validationChainOperatorSummary.requiresActionNow
    ? validationChainOperatorSummary.summary
    : validationOperatorSummary.requiresActionNow
      ? validationOperatorSummary.summary
      : "Validation-chain sync, recovery, and proposition-scoped lifecycle guidance are green.";
  const runtimeHardening = {
    status: runtimeHardeningNeedsAction ? "action_required" : "ready",
    summary: runtimeHardeningSummary,
    blockers: uniqueStrings([
      ...asStringArray(validationChainOperatorSummary.blockers),
      ...(validationOperatorSummary.requiresActionNow === true
        ? ["proposition_validation_state"]
        : []),
    ]),
    nextCommands: uniqueStrings([
      "GET /arena/internal/monitoring/validation-chain",
      `GET /arena/internal/propositions/${input.propositionId}/evidence-bundle`,
      ...asStringArray(validationChainOperatorSummary.operatorActions),
      ...asStringArray(validationOperatorSummary.plannedCommands),
      ...asStringArray(validationOperatorSummary.operatorActions),
      proofCaptureCommand,
    ]),
    runbookPath: validationRehearsal?.runbookPath || VALIDATION_RUNBOOK_PATH,
    artifacts: {
      validationChain: input.validationChainPath,
      evidenceBundle: input.evidencePath,
    },
  };

  const mvpBetaGate = {
    status: betaGateFailures.length === 0 ? "ready" : "action_required",
    summary:
      betaGateFailures.length === 0
        ? "The four-verdict MVP beta gate is green for this proposition."
        : `The four-verdict MVP beta gate is still incomplete: ${betaGateFailures.join(", ")}`,
    failures: betaGateFailures,
    nextCommands: uniqueStrings([
      briefingCommand,
      proofCaptureCommand,
      "GET /arena/public/results/settled",
      `GET /arena/public/integrity/overview?propositionId=${encodeURIComponent(input.propositionId)}`,
    ]),
    artifacts: {
      publicSettledResult: input.publicResultPath,
      publicIntegrityOverview: input.publicIntegrityPath,
      proofSummary: path.resolve(input.proofDir, "proof-summary.json"),
    },
  };

  const currentOperatorPath = buildCurrentOperatorPath({
    propositionId: input.propositionId,
    baseUrl: input.baseUrl,
    validationRehearsal,
    validationRehearsalSummary,
    validationOperatorSummary,
    runtimeOperatorSummary,
    validationChainOperatorSummary,
    rewardPayoutSummary,
    publicSettledFound,
    publicIntegrityVisible,
    proofCaptureCommand,
    briefingCommand,
    healthySummary,
  });

  const internalOpsClosure = {
    status: currentOperatorPath.status,
    summary: currentOperatorPath.summary,
    focusArea: currentOperatorPath.stage,
    blockers: [...currentOperatorPath.blockers],
    nextCommands: [...currentOperatorPath.operatorActions],
    proofCommands: [...currentOperatorPath.proofCommands],
    runbookPaths: [...currentOperatorPath.runbookPaths],
    artifactPath: input.outputPath,
  };

  return {
    propositionId: input.propositionId,
    propositionTitle: proposition?.title ?? null,
    baseUrl: input.baseUrl,
    generatedAt: new Date().toISOString(),
    currentOperatorPath,
    lanes: {
      releaseOpsClosure,
      runtimeHardening,
      mvpBetaGate,
      internalOpsClosure,
    },
    surfaces: {
      runtimeContract: {
        route: `${input.baseUrl}/arena/internal/monitoring/runtime-contract`,
        artifactPath: input.backendPath,
        releaseReadiness: input.backendRelease?.releaseReadiness ?? null,
        operatorSummary: runtimeOperatorSummary,
      },
      validationChain: {
        route: `${input.baseUrl}/arena/internal/monitoring/validation-chain`,
        artifactPath: input.validationChainPath,
        syncStatus: input.validationChain?.syncStatus ?? null,
        operatorSummary: validationChainOperatorSummary,
      },
      propositionEvidence: {
        route: `${input.baseUrl}/arena/internal/propositions/${input.propositionId}/evidence-bundle`,
        artifactPath: input.evidencePath,
        validationRehearsal,
        validationOperatorSummary,
      },
      rewardPayout: {
        route: `${input.baseUrl}/arena/internal/rewards?propositionId=${encodeURIComponent(input.propositionId)}`,
        artifactPath: path.resolve(input.proofDir, "reward-payout-summary.json"),
        summary: {
          propositionId: rewardPayoutSummary?.propositionId ?? input.propositionId,
          generatedAt: rewardPayoutSummary?.generatedAt ?? null,
          totalLedgerEntries: rewardPayoutSummary?.totalLedgerEntries ?? 0,
          totalPayoutRecords: rewardPayoutSummary?.totalPayoutRecords ?? 0,
          finalizedWithoutPayoutCount:
            rewardPayoutSummary?.finalizedWithoutPayoutCount ?? 0,
          executingWithoutTxHashCount:
            rewardPayoutSummary?.executingWithoutTxHashCount ?? 0,
          staleExecutingCount:
            rewardPayoutSummary?.staleExecutingCount ?? 0,
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
      },
      publicProof: {
        settledResultsRoute: `${input.baseUrl}/arena/public/results/settled`,
        integrityOverviewRoute: `${input.baseUrl}/arena/public/integrity/overview?propositionId=${encodeURIComponent(input.propositionId)}`,
        publicSettledResultArtifact: input.publicResultPath,
        publicIntegrityArtifact: input.publicIntegrityPath,
        settledResultFound: publicSettledFound,
        integrityVisible: publicIntegrityVisible,
        notes: uniqueStrings([
          ...input.publicResultNotes,
          ...input.publicIntegrityNotes,
        ]),
      },
      briefingArtifact: input.outputPath,
    },
  };
}

function buildCurrentOperatorPath(input) {
  const envFileArgs = input.envFilePath
    ? ` --env-file ${input.envFilePath}`
    : "";
  const authTokenArgs = input.authToken
    ? " --auth-token <operator-token>"
    : "";

  if (input.runtimeOperatorSummary.requiresActionNow === true) {
    return {
      status: "action_required",
      stage: "release",
      summary: input.runtimeOperatorSummary.summary,
      blockers: asStringArray(input.runtimeOperatorSummary.blockers),
      operatorActions: uniqueStrings([
        "GET /arena/internal/monitoring/runtime-contract",
        "GET /health/ready",
        ...asStringArray(input.runtimeOperatorSummary.operatorActions),
        `pnpm run backend:release:check --${envFileArgs} --base-url ${input.baseUrl}${authTokenArgs}`,
      ]),
      proofCommands: uniqueStrings([
        `pnpm run backend:release:check --${envFileArgs} --base-url ${input.baseUrl}${authTokenArgs}`,
        input.briefingCommand,
      ]),
      routeChecks: [
        `${input.baseUrl}/arena/internal/monitoring/runtime-contract`,
        `${input.baseUrl}/health/ready`,
      ],
      runbookPaths: [BACKEND_RELEASE_RUNBOOK_PATH],
    };
  }

  if (input.validationChainOperatorSummary.requiresActionNow === true) {
    return {
      status: "action_required",
      stage: "validation_chain",
      summary: input.validationChainOperatorSummary.summary,
      blockers: asStringArray(input.validationChainOperatorSummary.blockers),
      operatorActions: uniqueStrings([
        "GET /arena/internal/monitoring/validation-chain",
        "GET /arena/internal/monitoring/runtime-contract",
        ...asStringArray(input.validationChainOperatorSummary.operatorActions),
        input.briefingCommand,
      ]),
      proofCommands: uniqueStrings([
        input.proofCaptureCommand,
        input.briefingCommand,
      ]),
      routeChecks: [
        `${input.baseUrl}/arena/internal/monitoring/validation-chain`,
        `${input.baseUrl}/arena/internal/monitoring/runtime-contract`,
      ],
      runbookPaths: [VALIDATION_RUNBOOK_PATH, BACKEND_RELEASE_RUNBOOK_PATH],
    };
  }

  if (input.validationOperatorSummary.requiresActionNow === true) {
    return {
      status: "action_required",
      stage: "proposition_validation",
      summary: input.validationOperatorSummary.summary,
      blockers: ["proposition_validation_state"],
      operatorActions: uniqueStrings([
        `GET /arena/internal/propositions/${input.propositionId}/evidence-bundle`,
        ...asStringArray(input.validationOperatorSummary.plannedCommands),
        ...asStringArray(input.validationOperatorSummary.operatorActions),
        input.briefingCommand,
      ]),
      proofCommands: uniqueStrings([
        input.proofCaptureCommand,
        input.briefingCommand,
      ]),
      routeChecks: [
        `${input.baseUrl}/arena/internal/propositions/${input.propositionId}/evidence-bundle`,
        `${input.baseUrl}/arena/internal/monitoring/validation-chain`,
      ],
      runbookPaths: [VALIDATION_RUNBOOK_PATH],
    };
  }

  if (input.validationRehearsal?.status !== "ready") {
    const currentStepId = input.validationRehearsalSummary.currentStepId ?? "unknown";
    const currentStepStatus =
      input.validationRehearsalSummary.currentStepStatus ?? "pending";
    return {
      status: "action_required",
      stage: "proposition_rehearsal",
      summary: `Validation rehearsal is ${input.validationRehearsal?.status ?? "blocked"}. Current step ${currentStepId} is ${currentStepStatus}.`,
      blockers: asStringArray(input.validationRehearsalSummary.blockingReasons),
      operatorActions: uniqueStrings([
        `GET /arena/internal/propositions/${input.propositionId}/evidence-bundle`,
        ...asStringArray(input.validationRehearsalSummary.nextCommands),
        input.briefingCommand,
      ]),
      proofCommands: uniqueStrings([
        input.proofCaptureCommand,
        input.briefingCommand,
      ]),
      routeChecks: [
        `${input.baseUrl}/arena/internal/propositions/${input.propositionId}/evidence-bundle`,
      ],
      runbookPaths: [
        input.validationRehearsal?.runbookPath || VALIDATION_RUNBOOK_PATH,
      ],
    };
  }

  if (!input.publicSettledFound || !input.publicIntegrityVisible) {
    return {
      status: "action_required",
      stage: "beta_gate",
      summary:
        "Internal monitoring is green, but the proposition is not yet fully proven on the two public beta surfaces.",
      blockers: uniqueStrings([
        ...(input.publicSettledFound ? [] : ["public_settled_result_missing"]),
        ...(input.publicIntegrityVisible
          ? []
          : ["public_integrity_overview_missing"]),
      ]),
      operatorActions: uniqueStrings([
        "GET /arena/public/results/settled",
        `GET /arena/public/integrity/overview?propositionId=${encodeURIComponent(input.propositionId)}`,
        input.proofCaptureCommand,
        input.briefingCommand,
      ]),
      proofCommands: uniqueStrings([
        input.proofCaptureCommand,
        input.briefingCommand,
      ]),
      routeChecks: [
        `${input.baseUrl}/arena/public/results/settled`,
        `${input.baseUrl}/arena/public/integrity/overview?propositionId=${encodeURIComponent(input.propositionId)}`,
      ],
      runbookPaths: [BACKEND_RELEASE_RUNBOOK_PATH, VALIDATION_RUNBOOK_PATH],
    };
  }

  const rewardPayoutFollowThrough = buildRewardPayoutFollowThrough(input);
  if (rewardPayoutFollowThrough.requiresAction) {
    return {
      status: "action_required",
      stage: "reward_payout",
      summary: rewardPayoutFollowThrough.summary,
      blockers: rewardPayoutFollowThrough.blockers,
      operatorActions: uniqueStrings([
        `GET /arena/internal/rewards?propositionId=${encodeURIComponent(input.propositionId)}`,
        `GET /arena/internal/propositions/${input.propositionId}/evidence-bundle`,
        ...rewardPayoutFollowThrough.operatorActions,
        input.briefingCommand,
      ]),
      proofCommands: uniqueStrings([
        input.proofCaptureCommand,
        input.briefingCommand,
      ]),
      routeChecks: [
        `${input.baseUrl}/arena/internal/rewards?propositionId=${encodeURIComponent(input.propositionId)}`,
        `${input.baseUrl}/arena/internal/propositions/${input.propositionId}/evidence-bundle`,
      ],
      runbookPaths: [BACKEND_RELEASE_RUNBOOK_PATH],
    };
  }

  return {
    status: "ready",
    stage: "healthy",
    summary: input.healthySummary,
    blockers: [],
    operatorActions: [],
    proofCommands: uniqueStrings([
      input.proofCaptureCommand,
      input.briefingCommand,
    ]),
    routeChecks: [
      `${input.baseUrl}/arena/internal/monitoring/runtime-contract`,
      `${input.baseUrl}/arena/internal/monitoring/validation-chain`,
      `${input.baseUrl}/arena/internal/propositions/${input.propositionId}/evidence-bundle`,
      `${input.baseUrl}/arena/public/results/settled`,
      `${input.baseUrl}/arena/public/integrity/overview?propositionId=${encodeURIComponent(input.propositionId)}`,
    ],
    runbookPaths: [BACKEND_RELEASE_RUNBOOK_PATH, VALIDATION_RUNBOOK_PATH],
  };
}

function buildRewardPayoutFollowThrough(input) {
  const summary = input.rewardPayoutSummary ?? {};
  const payoutStatusCounts = summary.payoutStatusCounts ?? {};
  const finalizedWithoutPayoutCount = asCount(
    summary.finalizedWithoutPayoutCount,
  );
  const requestedCount = asCount(payoutStatusCounts.requested);
  const approvedCount = asCount(payoutStatusCounts.approved);
  const executingCount = asCount(payoutStatusCounts.executing);
  const executingWithoutTxHashCount = asCount(
    summary.executingWithoutTxHashCount,
  );
  const staleExecutingCount = asCount(summary.staleExecutingCount);
  const staleExecutingWithoutTxHashCount = asCount(
    summary.staleExecutingWithoutTxHashCount,
  );
  const staleExecutingAwaitingConfirmationCount = asCount(
    summary.staleExecutingAwaitingConfirmationCount,
  );
  const failedCount = asCount(payoutStatusCounts.failed);
  const cancelledCount = asCount(payoutStatusCounts.cancelled);
  const executingAwaitingConfirmationCount = Math.max(
    0,
    executingCount - executingWithoutTxHashCount,
  );
  const freshExecutingWithoutTxHashCount = Math.max(
    0,
    executingWithoutTxHashCount - staleExecutingWithoutTxHashCount,
  );
  const freshExecutingAwaitingConfirmationCount = Math.max(
    0,
    executingAwaitingConfirmationCount - staleExecutingAwaitingConfirmationCount,
  );

  const issues = [];
  const blockers = [];
  const operatorActions = [];

  if (finalizedWithoutPayoutCount > 0) {
    issues.push(
      `${finalizedWithoutPayoutCount} finalized rewards still lack payout records`,
    );
    blockers.push("finalized_rewards_without_payout_records");
  }

  if (requestedCount > 0) {
    issues.push(`${requestedCount} payouts are still waiting for approval`);
    blockers.push("reward_payouts_pending_approval");
  }

  if (approvedCount > 0) {
    issues.push(`${approvedCount} approved payouts are still waiting for execution`);
    blockers.push("reward_payouts_pending_execution");
  }

  if (staleExecutingWithoutTxHashCount > 0) {
    issues.push(
      `${staleExecutingWithoutTxHashCount} executing payouts have gone stale without recorded transaction hashes`,
    );
    blockers.push("stale_executing_reward_payouts_missing_tx_hash");
  }

  if (freshExecutingWithoutTxHashCount > 0) {
    issues.push(
      `${freshExecutingWithoutTxHashCount} executing payouts still lack recorded transaction hashes`,
    );
    blockers.push("executing_reward_payouts_missing_tx_hash");
  }

  if (staleExecutingAwaitingConfirmationCount > 0) {
    issues.push(
      `${staleExecutingAwaitingConfirmationCount} executing payouts have gone stale while awaiting confirmation`,
    );
    blockers.push("stale_reward_payouts_pending_confirmation");
  }

  if (freshExecutingAwaitingConfirmationCount > 0) {
    issues.push(
      `${freshExecutingAwaitingConfirmationCount} executing payouts still await confirmation`,
    );
    blockers.push("executing_reward_payouts_pending_confirmation");
  }

  if (failedCount > 0) {
    issues.push(`${failedCount} payouts are currently failed and need retry or resolution`);
    blockers.push("failed_reward_payouts");
  }

  if (cancelledCount > 0) {
    issues.push(`${cancelledCount} payouts are cancelled and still need operator review`);
    blockers.push("cancelled_reward_payouts");
  }

  if (staleExecutingCount > 0) {
    operatorActions.push(
      `GET /arena/internal/rewards?propositionId=${encodeURIComponent(input.propositionId)}&staleExecutionOnly=true`,
    );
  }

  if (issues.length === 0) {
    return {
      requiresAction: false,
      summary: "Reward payout follow-through is green.",
      blockers: [],
      operatorActions: [],
    };
  }

  return {
    requiresAction: true,
    summary: `Reward payout follow-through is incomplete: ${issues.join("; ")}.`,
    blockers,
    operatorActions,
  };
}

function asCount(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function buildBetaGateFailures(input) {
  const failures = [];

  if (input.releaseReadiness?.status !== "ready") {
    failures.push("releaseReadiness.blocked");
  }

  if (input.validationRehearsal?.status !== "ready") {
    failures.push("validationRehearsal.blocked");
  }

  if (!input.publicSettledFound) {
    failures.push("publicSettledResult.missing");
  }

  if (!input.publicIntegrityVisible) {
    failures.push("publicIntegrityOverview.missing");
  }

  return failures;
}

function logBriefingSummary(logger, briefing) {
  logger.info(`Operator focus: ${briefing.currentOperatorPath.stage}`);
  logger.info(`Operator status: ${briefing.currentOperatorPath.status}`);
  logger.info(`Operator summary: ${briefing.currentOperatorPath.summary}`);
  logger.info(
    `Lane 1 release ops: ${briefing.lanes.releaseOpsClosure.status}`,
  );
  logger.info(
    `Lane 2 runtime hardening: ${briefing.lanes.runtimeHardening.status}`,
  );
  logger.info(`Lane 3 MVP beta gate: ${briefing.lanes.mvpBetaGate.status}`);
  logger.info(
    `Lane 4 internal ops closure: ${briefing.lanes.internalOpsClosure.status}`,
  );
  logger.info(`Briefing artifact: ${briefing.surfaces.briefingArtifact}`);
  logger.info(
    `Runtime contract artifact: ${briefing.surfaces.runtimeContract.artifactPath}`,
  );
  logger.info(
    `Validation-chain artifact: ${briefing.surfaces.validationChain.artifactPath}`,
  );
  logger.info(
    `Proposition evidence artifact: ${briefing.surfaces.propositionEvidence.artifactPath}`,
  );
  logger.info(
    `Reward payout artifact: ${briefing.surfaces.rewardPayout.artifactPath}`,
  );
  logger.info(
    `Public settled-result artifact: ${briefing.surfaces.publicProof.publicSettledResultArtifact}`,
  );
  logger.info(
    `Public integrity artifact: ${briefing.surfaces.publicProof.publicIntegrityArtifact}`,
  );

  if (briefing.currentOperatorPath.blockers.length > 0) {
    logger.info("Current blockers:");
    for (const blocker of briefing.currentOperatorPath.blockers) {
      logger.info(`- ${blocker}`);
    }
  }

  if (briefing.currentOperatorPath.operatorActions.length > 0) {
    logger.info("Operator actions:");
    for (const action of briefing.currentOperatorPath.operatorActions) {
      logger.info(`- ${action}`);
    }
  }

  if (briefing.currentOperatorPath.proofCommands.length > 0) {
    logger.info("Proof commands:");
    for (const command of briefing.currentOperatorPath.proofCommands) {
      logger.info(`- ${command}`);
    }
  }

  if (briefing.currentOperatorPath.runbookPaths.length > 0) {
    logger.info("Runbooks:");
    for (const runbookPath of briefing.currentOperatorPath.runbookPaths) {
      logger.info(`- ${runbookPath}`);
    }
  }
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

function asStringArray(values) {
  return Array.isArray(values)
    ? values.filter((value) => typeof value === "string" && value.length > 0)
    : [];
}

function uniqueStrings(values) {
  return Array.from(new Set(asStringArray(values)));
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

function replayBufferedLogger(bufferedLogger, logger) {
  for (const message of bufferedLogger.infoMessages) {
    logger.info(message);
  }
  for (const message of bufferedLogger.failMessages) {
    logger.fail(message);
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

    if (token === "--output-dir" && next) {
      parsed.outputDir = next;
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
  const exitCode = await captureValidationOperatorBriefing(options);
  process.exit(exitCode);
}

if (require.main === module) {
  main().catch((error) => {
    fail(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

module.exports = {
  captureValidationOperatorBriefing,
  parseCliArgs,
};
