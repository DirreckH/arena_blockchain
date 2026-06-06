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

  loadEnvFile(path.resolve(cwd, ".env"), { override: true });

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
    headers: {
      authorization: `Bearer ${authToken}`,
    },
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
  const publicSettledFound = input.publicResultArtifact?.found === true;
  const publicIntegrityVisible = input.publicIntegrityArtifact?.visible === true;
  const betaGateFailures = buildBetaGateFailures({
    releaseReadiness: input.backendRelease?.releaseReadiness,
    validationRehearsal,
    publicSettledFound,
    publicIntegrityVisible,
  });
  const proofCaptureCommand = `pnpm run validation:proof:capture -- --proposition-id ${input.propositionId} --base-url ${input.baseUrl}`;
  const briefingCommand = `pnpm run validation:ops:brief -- --proposition-id ${input.propositionId} --base-url ${input.baseUrl}`;
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
      `pnpm run backend:release:check -- --base-url ${input.baseUrl}`,
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
        `pnpm run backend:release:check -- --base-url ${input.baseUrl}`,
      ]),
      proofCommands: uniqueStrings([
        `pnpm run backend:release:check -- --base-url ${input.baseUrl}`,
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
};
