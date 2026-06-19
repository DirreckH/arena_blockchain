#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { fail, info, loadEnvFile, pass } = require("./_validation-common.cjs");

function parseArgs(argv) {
  const options = {
    cwd: process.cwd(),
    envFilePath: path.resolve(process.cwd(), ".env"),
    network: "",
    writeEnv: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--") {
      continue;
    }

    if (argument === "--env-file") {
      options.envFilePath = path.resolve(process.cwd(), argv[index + 1]);
      index += 1;
      continue;
    }

    if (argument === "--network") {
      options.network = String(argv[index + 1] || "").trim();
      index += 1;
      continue;
    }

    if (argument === "--output") {
      options.outputPath = path.resolve(process.cwd(), argv[index + 1]);
      index += 1;
      continue;
    }

    if (argument === "--write-env") {
      options.writeEnv = true;
      continue;
    }

    if (argument === "--no-write-env") {
      options.writeEnv = false;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

function defaultValidationDeployOutputPath(cwd, network) {
  if (network === "localhost") {
    return path.resolve(cwd, "deployment.validation.json");
  }

  return path.resolve(
    cwd,
    "validation-rehearsal",
    "deployments",
    `deployment.validation.${network}.json`,
  );
}

function defaultShouldWriteEnvFile(options) {
  return (
    options.network === "localhost" &&
    path.resolve(options.envFilePath) === path.resolve(options.cwd, ".env")
  );
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

function defaultRunCommand(command) {
  info(`Running ${command.label}: ${command.command} ${command.args.join(" ")}`);
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

function buildValidationDeployRerunCommand(options) {
  const parts = [
    "pnpm run validation:deploy -- --env-file",
    options.envFilePath,
    "--network",
    options.network,
  ];

  if (options.outputPath) {
    parts.push("--output", options.outputPath);
  }

  if (options.writeEnv === true) {
    parts.push("--write-env");
  } else if (options.writeEnv === false) {
    parts.push("--no-write-env");
  }

  return parts.join(" ");
}

async function runValidationDeploy(options = {}) {
  const cwd = options.cwd || process.cwd();
  const logger = options.logger || { fail, info, pass };
  const envFilePath = options.envFilePath || path.resolve(cwd, ".env");
  const network = String(options.network || "").trim();
  const requireEnvFile = options.requireEnvFile !== false;
  const loadedEnv = loadEnvFile(envFilePath, { override: false });
  const baseEnv = {
    ...process.env,
    ...loadedEnv.loaded,
    ...(options.env || {}),
  };
  const explicitDeployerKey = String(
    options.env?.ARENA_VALIDATION_DEPLOYER_PRIVATE_KEY ||
      options.env?.PRIVATE_KEY ||
      loadedEnv.loaded.ARENA_VALIDATION_DEPLOYER_PRIVATE_KEY ||
      loadedEnv.loaded.PRIVATE_KEY ||
      "",
  ).trim();

  if (!network) {
    logger.fail(
      "Validation deployment requires --network <name>. Use localhost for local rehearsal or validation for the non-local RPC-backed deploy alias.",
    );
    return 1;
  }

  if (requireEnvFile && !fs.existsSync(envFilePath)) {
    logger.fail(
      `Validation deploy env file not found at ${envFilePath}. Provide --env-file <path> for the target environment before rerunning pnpm run validation:deploy.`,
    );
    return 1;
  }

  if (
    network !== "localhost" &&
    !explicitDeployerKey
  ) {
    logger.fail(
      "Validation deployment for non-local networks requires ARENA_VALIDATION_DEPLOYER_PRIVATE_KEY or PRIVATE_KEY in the selected env file.",
    );
    return 1;
  }

  const outputPath =
    options.outputPath || defaultValidationDeployOutputPath(cwd, network);
  const writeEnv =
    typeof options.writeEnv === "boolean"
      ? options.writeEnv
      : defaultShouldWriteEnvFile({
          cwd,
          envFilePath,
          network,
        });

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const command = createCommand(
    "validation:deploy",
    "pnpm",
    [
      "exec",
      "hardhat",
      "run",
      "scripts/deploy-validation-market.cjs",
      "--network",
      network,
    ],
    cwd,
    {
      ...baseEnv,
      ARENA_VALIDATION_DEPLOY_ENV_FILE: envFilePath,
      ARENA_VALIDATION_DEPLOY_OUTPUT_PATH: outputPath,
      ARENA_VALIDATION_DEPLOY_WRITE_ENV: writeEnv ? "1" : "0",
    },
  );
  const runCommand = options.runCommand || defaultRunCommand;
  const result = await runCommand(command);

  if (!result || result.status !== 0) {
    logger.fail(
      `Validation deploy failed for network ${network}. Fix the failing command above, then rerun ${buildValidationDeployRerunCommand({
        envFilePath,
        network,
        outputPath,
        writeEnv,
      })}.`,
    );
    return 1;
  }

  logger.info(`Validation deploy artifact: ${outputPath}`);
  logger.pass(`Validation deploy completed for network ${network}.`);
  return 0;
}

async function main() {
  const exitCode = await runValidationDeploy(parseArgs(process.argv.slice(2)));
  process.exit(exitCode);
}

if (require.main === module) {
  main().catch((error) => {
    fail(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

module.exports = {
  buildValidationDeployRerunCommand,
  defaultShouldWriteEnvFile,
  defaultValidationDeployOutputPath,
  parseArgs,
  runValidationDeploy,
};
