#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { fail, info, pass } = require("./_validation-common.cjs");
const { defaultBackupOutputPath } = require("./_postgres-admin.cjs");
const {
  defaultValidationDeployOutputPath,
} = require("./run-validation-deploy.cjs");

const DEFAULT_BACKUP_LABEL = "external-release-evidence";

function parseArgs(argv) {
  const options = {
    authToken: "",
    backupLabel: DEFAULT_BACKUP_LABEL,
    baseUrl: "",
    envFilePath: path.resolve(process.cwd(), ".env"),
    operatorMonitoringProof: false,
    previousEnvPath: "",
    propositionId: "",
    skipDatabaseRollback: false,
    skipSecretRotation: false,
    skipSecurityAudits: false,
    validationDeploy: false,
    validationNetwork: "validation",
    validationPreflight: false,
    yes: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--env-file") {
      options.envFilePath = path.resolve(process.cwd(), argv[index + 1]);
      index += 1;
      continue;
    }

    if (argument === "--previous-env") {
      options.previousEnvPath = path.resolve(process.cwd(), argv[index + 1]);
      index += 1;
      continue;
    }

    if (argument === "--base-url") {
      options.baseUrl = String(argv[index + 1] || "");
      index += 1;
      continue;
    }

    if (argument === "--auth-token") {
      options.authToken = String(argv[index + 1] || "");
      index += 1;
      continue;
    }

    if (argument === "--proposition-id") {
      options.propositionId = String(argv[index + 1] || "");
      index += 1;
      continue;
    }

    if (argument === "--operator-monitoring-proof") {
      options.operatorMonitoringProof = true;
      continue;
    }

    if (argument === "--validation-preflight") {
      options.validationPreflight = true;
      continue;
    }

    if (argument === "--validation-deploy") {
      options.validationDeploy = true;
      continue;
    }

    if (argument === "--validation-network") {
      options.validationNetwork = String(argv[index + 1] || "").trim();
      index += 1;
      continue;
    }

    if (argument === "--backup-file") {
      options.backupPath = path.resolve(process.cwd(), argv[index + 1]);
      index += 1;
      continue;
    }

    if (argument === "--backup-label") {
      options.backupLabel = String(argv[index + 1] || "").trim();
      index += 1;
      continue;
    }

    if (argument === "--skip-database-rollback") {
      options.skipDatabaseRollback = true;
      continue;
    }

    if (argument === "--skip-secret-rotation") {
      options.skipSecretRotation = true;
      continue;
    }

    if (argument === "--skip-security-audits") {
      options.skipSecurityAudits = true;
      continue;
    }

    if (argument === "--output") {
      options.outputPath = path.resolve(process.cwd(), argv[index + 1]);
      index += 1;
      continue;
    }

    if (argument === "--yes") {
      options.yes = true;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

function createCommand(label, command, args, cwd, env) {
  return {
    args,
    command,
    cwd,
    env,
    label,
  };
}

function renderCommand(command) {
  const renderedArgs = [];

  for (let index = 0; index < command.args.length; index += 1) {
    const argument = command.args[index];
    renderedArgs.push(argument);
    if (argument === "--auth-token" && index + 1 < command.args.length) {
      renderedArgs.push("<redacted>");
      index += 1;
    }
  }

  return [command.command, ...renderedArgs].join(" ");
}

function defaultRunCommand(command) {
  info(`Running ${command.label}: ${renderCommand(command)}`);
  const result = spawnSync(command.command, command.args, {
    cwd: command.cwd,
    env: command.env,
    shell: process.platform === "win32",
    stdio: "inherit",
    windowsHide: true,
  });

  return {
    status: typeof result.status === "number" ? result.status : 1,
  };
}

function buildExternalReleaseEvidenceRerunCommand(options) {
  const hasOperatorToken =
    typeof options.authToken === "string" && options.authToken.trim().length > 0;
  const parts = [
    "pnpm run backend:release:evidence:external -- --env-file",
    options.envFilePath,
  ];

  if (options.previousEnvPath) {
    parts.push("--previous-env", options.previousEnvPath);
  }

  parts.push("--base-url", options.baseUrl);

  if (hasOperatorToken) {
    parts.push("--auth-token", "<operator-token>");
  }

  parts.push("--proposition-id", options.propositionId);

  if (options.operatorMonitoringProof) {
    parts.push("--operator-monitoring-proof");
  }

  if (options.validationDeploy) {
    parts.push("--validation-deploy");
  } else if (options.validationPreflight) {
    parts.push("--validation-preflight");
  }

  if (options.validationDeploy || options.validationNetwork !== "validation") {
    parts.push("--validation-network", options.validationNetwork);
  }

  if (options.backupPath) {
    parts.push("--backup-file", options.backupPath);
  }

  if (
    options.backupLabel &&
    String(options.backupLabel).trim() !== DEFAULT_BACKUP_LABEL
  ) {
    parts.push("--backup-label", options.backupLabel);
  }

  if (options.skipDatabaseRollback) {
    parts.push("--skip-database-rollback");
  }

  if (options.skipSecretRotation) {
    parts.push("--skip-secret-rotation");
  }

  if (options.skipSecurityAudits) {
    parts.push("--skip-security-audits");
  }

  if (options.outputPath) {
    parts.push("--output", options.outputPath);
  }

  if (options.yes) {
    parts.push("--yes");
  }

  return parts.join(" ");
}

async function runExternalReleaseEvidence(options = {}) {
  const cwd = options.cwd || process.cwd();
  const logger = options.logger || { fail, info, pass };
  const runCommand = options.runCommand || defaultRunCommand;
  const envFilePath = options.envFilePath || path.resolve(cwd, ".env");
  const propositionId = String(options.propositionId || "").trim();
  const baseUrl = String(options.baseUrl || "").trim();
  const authToken = String(options.authToken || "").trim();
  const previousEnvPath = options.previousEnvPath || "";
  const operatorMonitoringProof = options.operatorMonitoringProof === true;
  const validationPreflight = options.validationPreflight === true;
  const validationDeploy = options.validationDeploy === true;
  const validationNetwork =
    String(options.validationNetwork || "validation").trim() || "validation";
  const skipDatabaseRollback = options.skipDatabaseRollback === true;
  const skipSecretRotation = options.skipSecretRotation === true;
  const skipSecurityAudits = options.skipSecurityAudits === true;
  const outputPath =
    options.outputPath ||
    path.resolve(
      cwd,
      "validation-rehearsal",
      propositionId || "external-release",
      "external-release-evidence-summary.json",
    );
  const backupPath =
    options.backupPath ||
    defaultBackupOutputPath(
      cwd,
      options.backupLabel || DEFAULT_BACKUP_LABEL,
      options.now || new Date(),
    );
  const backupLabel =
    String(options.backupLabel || DEFAULT_BACKUP_LABEL).trim() ||
    DEFAULT_BACKUP_LABEL;
  const secretRotationOutputPath = path.resolve(
    cwd,
    "validation-local",
    "secret-rotation-audit.json",
  );
  const dependencyAuditProdOutputPath = path.resolve(
    cwd,
    "validation-local",
    "dependency-audit-prod.json",
  );
  const dependencyAuditAllOutputPath = path.resolve(
    cwd,
    "validation-local",
    "dependency-audit-all.json",
  );
  const propositionProofDir = path.resolve(cwd, "validation-rehearsal", propositionId);
  const operatorMonitoringProofPath = path.resolve(
    cwd,
    "validation-local",
    "runtime-contract-operator-proof.json",
  );
  const baseEnv = {
    ...process.env,
    ...(options.env || {}),
  };

  if (!propositionId) {
    logger.fail(
      "External release evidence capture requires --proposition-id <id>.",
    );
    return 1;
  }

  if (!baseUrl) {
    logger.fail(
      "External release evidence capture requires --base-url <url>.",
    );
    return 1;
  }

  if (!skipSecretRotation && !previousEnvPath) {
    logger.fail(
      "External release evidence capture requires --previous-env <path> unless --skip-secret-rotation is set.",
    );
    return 1;
  }

  if (!skipDatabaseRollback && options.yes !== true) {
    logger.fail(
      "External release evidence capture includes a destructive rollback rehearsal. Re-run with --yes or add --skip-database-rollback for a proof-only pass.",
    );
    return 1;
  }

  const commands = [
    createCommand(
      "backend:release:rehearse:external",
      "pnpm",
      [
        "run",
        "backend:release:rehearse:external",
        "--",
        "--env-file",
        envFilePath,
        "--base-url",
        baseUrl,
        ...(authToken ? ["--auth-token", authToken] : []),
        "--proposition-id",
        propositionId,
        ...(operatorMonitoringProof ? ["--operator-monitoring-proof"] : []),
        ...(validationDeploy
          ? ["--validation-deploy"]
          : validationPreflight
            ? ["--validation-preflight"]
            : []),
        ...(validationDeploy || validationNetwork !== "validation"
          ? ["--validation-network", validationNetwork]
          : []),
      ],
      cwd,
      baseEnv,
    ),
  ];

  if (!skipDatabaseRollback) {
    commands.push(
      createCommand(
        "backend:db:rollback:rehearse",
        "pnpm",
        [
          "run",
          "backend:db:rollback:rehearse",
          "--",
          "--env-file",
          envFilePath,
          "--backup-file",
          backupPath,
          "--backup-label",
          backupLabel,
          "--yes",
        ],
        cwd,
        baseEnv,
      ),
    );
  }

  if (!skipSecretRotation) {
    commands.push(
      createCommand(
        "backend:secrets:rotate:check",
        "pnpm",
        [
          "run",
          "backend:secrets:rotate:check",
          "--",
          "--previous-env",
          previousEnvPath,
          "--current-env",
          envFilePath,
          "--output",
          secretRotationOutputPath,
        ],
        cwd,
        baseEnv,
      ),
    );
  }

  if (!skipSecurityAudits) {
    commands.push(
      createCommand(
        "backend:security:audit:prod",
        "pnpm",
        [
          "run",
          "backend:security:audit:prod",
          "--",
          "--output",
          dependencyAuditProdOutputPath,
        ],
        cwd,
        baseEnv,
      ),
      createCommand(
        "backend:security:audit:all",
        "pnpm",
        [
          "run",
          "backend:security:audit:all",
          "--",
          "--output",
          dependencyAuditAllOutputPath,
        ],
        cwd,
        baseEnv,
      ),
    );
  }

  for (const command of commands) {
    const result = await runCommand(command);
    if (!result || result.status !== 0) {
      logger.fail(
        `External release evidence capture stopped at ${command.label}. Fix the failing command above, then rerun ${buildExternalReleaseEvidenceRerunCommand({
          authToken,
          backupLabel,
          backupPath,
          baseUrl,
          envFilePath,
          operatorMonitoringProof,
          outputPath: options.outputPath,
          previousEnvPath,
          propositionId,
          skipDatabaseRollback,
          skipSecretRotation,
          skipSecurityAudits,
          validationDeploy,
          validationNetwork,
          validationPreflight,
          yes: options.yes === true,
        })}.`,
      );
      return 1;
    }
  }

  const summary = {
    propositionId,
    baseUrl,
    checkedAt: (options.now || new Date()).toISOString(),
    envFilePath,
    previousEnvPath: skipSecretRotation ? null : previousEnvPath,
    steps: {
      externalReleaseRehearsal: true,
      databaseRollbackRehearsal: !skipDatabaseRollback,
      secretRotationAudit: !skipSecretRotation,
      dependencyAuditProd: !skipSecurityAudits,
      dependencyAuditAll: !skipSecurityAudits,
    },
    artifacts: {
      propositionProofDir,
      proofSummary: path.resolve(propositionProofDir, "proof-summary.json"),
      evidenceBundle: path.resolve(propositionProofDir, "evidence-bundle.json"),
      rewardPayoutSummary: path.resolve(
        propositionProofDir,
        "reward-payout-summary.json",
      ),
      publicSettledResult: path.resolve(
        propositionProofDir,
        "public-settled-result.json",
      ),
      publicIntegrityOverview: path.resolve(
        propositionProofDir,
        "public-integrity-overview.json",
      ),
      validationDeploy:
        validationDeploy
          ? defaultValidationDeployOutputPath(cwd, validationNetwork)
          : null,
      operatorMonitoringProof: operatorMonitoringProof
        ? operatorMonitoringProofPath
        : null,
      rollbackBackup: skipDatabaseRollback ? null : backupPath,
      secretRotationAudit: skipSecretRotation ? null : secretRotationOutputPath,
      dependencyAuditProd: skipSecurityAudits
        ? null
        : dependencyAuditProdOutputPath,
      dependencyAuditAll: skipSecurityAudits
        ? null
        : dependencyAuditAllOutputPath,
    },
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  logger.info(`Evidence summary: ${outputPath}`);
  logger.pass(
    `External release evidence capture completed for proposition ${propositionId}. Summary: ${outputPath}`,
  );
  return 0;
}

async function main() {
  const exitCode = await runExternalReleaseEvidence(parseArgs(process.argv.slice(2)));
  process.exit(exitCode);
}

if (require.main === module) {
  main().catch((error) => {
    fail(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

module.exports = {
  buildExternalReleaseEvidenceRerunCommand,
  parseArgs,
  runExternalReleaseEvidence,
};
