#!/usr/bin/env node

const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { fail, info, pass } = require("./_validation-common.cjs");

function parseArgs(argv) {
  const options = {
    checkApi: false,
    cwd: process.cwd(),
    deployValidation: false,
    envFilePath: path.resolve(process.cwd(), ".env"),
    network: "",
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

    if (argument === "--check-api") {
      options.checkApi = true;
      continue;
    }

    if (argument === "--deploy-validation") {
      options.deployValidation = true;
      continue;
    }

    if (argument === "--network") {
      options.network = String(argv[index + 1] || "").trim();
      index += 1;
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

function buildValidationPreflightRerunCommand(options) {
  const parts = [
    "pnpm run validation:preflight -- --env-file",
    options.envFilePath,
  ];

  if (options.checkApi) {
    parts.push("--check-api");
  }

  if (options.deployValidation) {
    parts.push("--deploy-validation");
    parts.push("--network", options.network);
  }

  return parts.join(" ");
}

async function runValidationPreflight(options = {}) {
  const cwd = options.cwd || process.cwd();
  const envFilePath = options.envFilePath || path.resolve(cwd, ".env");
  const logger = options.logger || { fail, info, pass };
  const runCommand = options.runCommand || defaultRunCommand;
  const deployValidation = options.deployValidation === true;
  const network = String(options.network || "").trim();
  const baseEnv = {
    ...process.env,
    ...(options.env || {}),
  };

  if (deployValidation && !network) {
    logger.fail(
      "Validation preflight with deployment requires --network <name>. Use localhost for local rehearsal or validation for the non-local RPC-backed deploy alias.",
    );
    return 1;
  }

  const commands = [
    createCommand(
      "validation:env:check",
      "pnpm",
      ["run", "validation:env:check", "--", "--env-file", envFilePath],
      cwd,
      baseEnv,
    ),
    createCommand(
      "validation:deps:check",
      "pnpm",
      [
        "run",
        "validation:deps:check",
        "--",
        "--env-file",
        envFilePath,
        ...(options.checkApi ? ["--check-api"] : []),
      ],
      cwd,
      baseEnv,
    ),
  ];

  if (deployValidation) {
    commands.push(
      createCommand(
        "validation:deploy",
        "pnpm",
        [
          "run",
          "validation:deploy",
          "--",
          "--env-file",
          envFilePath,
          "--network",
          network,
        ],
        cwd,
        baseEnv,
      ),
    );
  }

  commands.push(
    createCommand(
      "validation:chain:check",
      "pnpm",
      ["run", "validation:chain:check", "--", "--env-file", envFilePath],
      cwd,
      baseEnv,
    ),
  );

  for (const command of commands) {
    const result = await runCommand(command);
    if (!result || result.status !== 0) {
      logger.fail(
        `Validation preflight stopped at ${command.label}. Fix the failing command above, then rerun ${buildValidationPreflightRerunCommand({
          checkApi: options.checkApi === true,
          deployValidation,
          envFilePath,
          network,
        })}.`,
      );
      return 1;
    }
  }

  logger.pass("Validation preflight completed successfully.");
  return 0;
}

async function main() {
  const exitCode = await runValidationPreflight(parseArgs(process.argv.slice(2)));
  process.exit(exitCode);
}

if (require.main === module) {
  main().catch((error) => {
    fail(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

module.exports = {
  buildValidationPreflightRerunCommand,
  parseArgs,
  runValidationPreflight,
};
