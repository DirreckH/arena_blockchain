#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { loadEnvFile } = require("./_validation-common.cjs");
const { fail, info, pass } = require("./_validation-common.cjs");
const {
  defaultValidationDeployOutputPath,
} = require("./run-validation-deploy.cjs");

function parseArgs(argv) {
  const options = {
    authToken: "",
    baseUrl: "",
    envFilePath: path.resolve(
      process.cwd(),
      "validation-local",
      "release-rehearsal.env",
    ),
    mode: "local",
    operatorMonitoringProof: false,
    propositionId: "",
    validationDeploy: false,
    validationNetwork: "validation",
    validationPreflight: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--mode") {
      options.mode = String(argv[index + 1] || "");
      index += 1;
      continue;
    }

    if (argument === "--env-file") {
      options.envFilePath = path.resolve(process.cwd(), argv[index + 1]);
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

    throw new Error(`Unknown argument: ${argument}`);
  }

  if (!["local", "external"].includes(options.mode)) {
    throw new Error(`Unknown rehearsal mode: ${options.mode}`);
  }

  return options;
}

function createCommand(label, command, args, cwd, env) {
  return {
    label,
    command,
    args,
    cwd,
    env,
  };
}

function defaultRunCommand(command) {
  info(`Running ${command.label}: ${renderCommand(command)}`);
  const result = spawnSync(command.command, command.args, {
    cwd: command.cwd,
    env: command.env,
    stdio: "inherit",
    shell: process.platform === "win32",
    windowsHide: true,
  });

  return {
    status: typeof result.status === "number" ? result.status : 1,
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

function buildExternalRerunCommand(options) {
  const hasOperatorToken =
    typeof options.authToken === "string" && options.authToken.trim().length > 0;
  const parts = [
    "pnpm run backend:release:rehearse:external -- --env-file",
    options.envFilePath,
    "--base-url",
    options.baseUrl,
    ...(hasOperatorToken ? ["--auth-token", "<operator-token>"] : []),
    "--proposition-id",
    options.propositionId,
  ];

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

  return parts.join(" ");
}

async function runBackendReleaseRehearsal(options = {}) {
  const cwd = options.cwd || process.cwd();
  const logger = options.logger || { fail, info, pass };
  const mode = options.mode || "local";
  const envFilePath =
    options.envFilePath ||
    path.resolve(cwd, "validation-local", "release-rehearsal.env");
  const composeEnvFilePath = envFilePath.replace(/\\/gu, "/");
  const baseCommandEnv = {
    ...process.env,
    ...(options.env || {}),
  };
  const dockerComposeEnv = {
    ...baseCommandEnv,
    ARENA_ENV_FILE: composeEnvFilePath,
  };
  const runCommand = options.runCommand || defaultRunCommand;

  if (!fs.existsSync(envFilePath)) {
    logger.fail(
      `Release rehearsal env file not found at ${envFilePath}. Run pnpm run backend:release:env:prepare first.`,
    );
    return 1;
  }

  const loadedEnv = loadEnvFile(envFilePath, { override: false }).loaded;

  if (mode === "external") {
    return runExternalBackendReleaseRehearsal({
      authToken: options.authToken,
      baseUrl: options.baseUrl,
      cwd,
      envFilePath,
      loadedEnv,
      logger,
      propositionId: options.propositionId,
      runCommand,
      env: baseCommandEnv,
      operatorMonitoringProof: options.operatorMonitoringProof,
      validationDeploy: options.validationDeploy,
      validationNetwork: options.validationNetwork,
      validationPreflight: options.validationPreflight,
    });
  }

  const composeArgs = [
    "compose",
    "--env-file",
    composeEnvFilePath,
    "-f",
    "docker-compose.prod.yml",
  ];
  const commands = [
    createCommand(
      "backend:release:host:check",
      "pnpm",
      [
        "run",
        "backend:release:host:check",
        "--",
        "--allow-local-rehearsal",
        "--env-file",
        envFilePath,
      ],
      cwd,
      baseCommandEnv,
    ),
    createCommand(
      "validation:prepare:local",
      "pnpm",
      ["run", "validation:prepare:local"],
      cwd,
      baseCommandEnv,
    ),
    createCommand(
      "api:prisma:deploy",
      "pnpm",
      ["run", "api:prisma:deploy", "--", "--env-file", envFilePath],
      cwd,
      baseCommandEnv,
    ),
    createCommand(
      "validation:db:deploy",
      "pnpm",
      ["run", "validation:db:deploy", "--", "--env-file", envFilePath],
      cwd,
      baseCommandEnv,
    ),
    createCommand(
      "docker:compose:down",
      "docker",
      [...composeArgs, "down", "--remove-orphans"],
      cwd,
      dockerComposeEnv,
    ),
    createCommand(
      "docker:compose:build",
      "docker",
      [...composeArgs, "build"],
      cwd,
      dockerComposeEnv,
    ),
    createCommand(
      "docker:compose:up",
      "docker",
      [
        ...composeArgs,
        "up",
        "-d",
        "--no-deps",
        "api",
        "scheduler-worker",
        "nginx",
      ],
      cwd,
      dockerComposeEnv,
    ),
  ];

  for (const command of commands) {
    const result = await runCommand(command);
    if (!result || result.status !== 0) {
      if (command.label === "backend:release:host:check") {
        logger.fail(
          "Release rehearsal stopped at backend:release:host:check. Run pnpm run backend:release:host:recover -- --clean-safe-caches --restart-docker --wait-for-docker-ms 180000, then rerun pnpm run backend:release:rehearse:local.",
        );
        return 1;
      }

      logger.fail(
        `Release rehearsal stopped at ${command.label}. Fix the failing command above, then rerun pnpm run backend:release:rehearse:local.`,
      );
      return 1;
    }
  }

  logger.pass(
    "Local backend release rehearsal completed. Next: inspect container logs and run the smoke checks against /health and /arena/internal/monitoring/runtime-contract.",
  );
  return 0;
}

async function runExternalBackendReleaseRehearsal(options = {}) {
  const logger = options.logger || { fail, info, pass };
  const authToken =
    String(
      options.authToken ||
        options.loadedEnv?.ARENA_INTERNAL_OPERATOR_BEARER_TOKEN ||
        options.env?.ARENA_INTERNAL_OPERATOR_BEARER_TOKEN ||
        "",
    ).trim();
  const baseUrl = String(options.baseUrl || "").trim();
  const propositionId = String(options.propositionId || "").trim();
  const operatorMonitoringProof = options.operatorMonitoringProof === true;
  const validationPreflight = options.validationPreflight === true;
  const validationDeploy = options.validationDeploy === true;
  const validationNetwork = String(options.validationNetwork || "validation").trim() ||
    "validation";

  if (!baseUrl) {
    logger.fail(
      "External release rehearsal requires --base-url <url> so the running staging or clean-VM backend can be inspected.",
    );
    return 1;
  }

  if (!authToken) {
    logger.fail(
      "External release rehearsal requires --auth-token <token> or ARENA_INTERNAL_OPERATOR_BEARER_TOKEN in the env file.",
    );
    return 1;
  }

  if (!propositionId) {
    logger.fail(
      "External release rehearsal requires --proposition-id <id> so validation proof and operator briefing can be captured against the target staging proposition.",
    );
    return 1;
  }

  const commands = [
    createCommand(
      "backend:release:host:check",
      "pnpm",
      [
        "run",
        "backend:release:host:check",
        "--",
        "--env-file",
        options.envFilePath,
      ],
      options.cwd,
      options.env,
    ),
  ];

  if (validationDeploy || validationPreflight) {
    const preflightArgs = [
      "run",
      "validation:preflight",
      "--",
      "--env-file",
      options.envFilePath,
      ...(validationDeploy
        ? ["--deploy-validation", "--network", validationNetwork]
        : []),
    ];
    commands.push(
      createCommand(
        "validation:preflight",
        "pnpm",
        preflightArgs,
        options.cwd,
        options.env,
      ),
    );
  }

  commands.push(
    createCommand(
      "backend:release:check",
      "pnpm",
      [
        "run",
        "backend:release:check",
        "--",
        "--base-url",
        baseUrl,
        "--auth-token",
        authToken,
      ],
      options.cwd,
      options.env,
    ),
  );

  if (operatorMonitoringProof) {
    commands.push(
      createCommand(
        "backend:release:proof:operator",
        "pnpm",
        [
          "run",
          "backend:release:proof:operator",
          "--",
          "--env-file",
          options.envFilePath,
          "--base-url",
          baseUrl,
        ],
        options.cwd,
        options.env,
      ),
    );
  }

  commands.push(
    createCommand(
      "validation:ops:brief",
      "pnpm",
      [
        "run",
        "validation:ops:brief",
        "--",
        "--proposition-id",
        propositionId,
        "--env-file",
        options.envFilePath,
        "--base-url",
        baseUrl,
        "--auth-token",
        authToken,
      ],
      options.cwd,
      options.env,
    ),
    createCommand(
      "validation:proof:capture",
      "pnpm",
      [
        "run",
        "validation:proof:capture",
        "--",
        "--proposition-id",
        propositionId,
        "--env-file",
        options.envFilePath,
        "--base-url",
        baseUrl,
        "--auth-token",
        authToken,
      ],
      options.cwd,
      options.env,
    ),
  );

  for (const command of commands) {
    const result = await options.runCommand(command);
    if (!result || result.status !== 0) {
      if (command.label === "backend:release:host:check") {
        logger.fail(
          `Release rehearsal stopped at backend:release:host:check. If the current host is blocked by Docker Desktop, WSL, or low C: capacity, run pnpm run backend:release:host:recover -- --clean-safe-caches --restart-docker --wait-for-docker-ms 180000, then rerun ${buildExternalRerunCommand({
            authToken,
            envFilePath: options.envFilePath,
            baseUrl,
            operatorMonitoringProof,
            propositionId,
            validationDeploy,
            validationNetwork,
            validationPreflight,
          })}.`,
        );
        return 1;
      }

      logger.fail(
        `Release rehearsal stopped at ${command.label}. Fix the failing command above, then rerun ${buildExternalRerunCommand({
          authToken,
          envFilePath: options.envFilePath,
          baseUrl,
          operatorMonitoringProof,
          propositionId,
          validationDeploy,
          validationNetwork,
          validationPreflight,
        })}.`,
      );
      return 1;
    }
  }

  const proofArtifactDir = path.resolve(
    options.cwd,
    "validation-rehearsal",
    propositionId,
  );
  const operatorProofArtifactPath = path.resolve(
    options.cwd,
    "validation-local",
    "runtime-contract-operator-proof.json",
  );
  const successMessage =
    validationDeploy
      ? `External backend release rehearsal completed. Next: archive the proof artifacts from ${proofArtifactDir}${operatorMonitoringProof ? ` plus ${operatorProofArtifactPath}` : ""} and attach them to the staging or clean-VM release evidence set. Validation deploy evidence for network ${validationNetwork} is expected at ${defaultValidationDeployOutputPath(
          options.cwd,
          validationNetwork,
        )}.${operatorMonitoringProof ? "" : ` If this command is running on the same host that controls the staged Docker compose stack, also consider pnpm run backend:release:proof:operator -- --env-file ${options.envFilePath} --base-url ${baseUrl} before final proof archival.`}`
      : `External backend release rehearsal completed. Next: archive the proof artifacts from ${proofArtifactDir}${operatorMonitoringProof ? ` plus ${operatorProofArtifactPath}` : ""} and attach them to the staging or clean-VM release evidence set.${operatorMonitoringProof ? "" : ` If this command is running on the same host that controls the staged Docker compose stack, also consider pnpm run backend:release:proof:operator -- --env-file ${options.envFilePath} --base-url ${baseUrl} before final proof archival.`}`;
  logger.pass(successMessage);
  return 0;
}

async function main() {
  const exitCode = await runBackendReleaseRehearsal(parseArgs(process.argv.slice(2)));
  process.exit(exitCode);
}

if (require.main === module) {
  main().catch((error) => {
    fail(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

module.exports = {
  buildExternalRerunCommand,
  parseArgs,
  renderCommand,
  runBackendReleaseRehearsal,
};
