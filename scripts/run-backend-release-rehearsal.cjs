#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { fail, info, pass } = require("./_validation-common.cjs");

function parseArgs(argv) {
  const options = {
    envFilePath: path.resolve(
      process.cwd(),
      "validation-local",
      "release-rehearsal.env",
    ),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--env-file") {
      options.envFilePath = path.resolve(process.cwd(), argv[index + 1]);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
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
  return [command.command, ...command.args].join(" ");
}

async function runBackendReleaseRehearsal(options = {}) {
  const cwd = options.cwd || process.cwd();
  const logger = options.logger || { fail, info, pass };
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
      ["run", "backend:release:host:check"],
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
      ["run", "api:prisma:deploy"],
      cwd,
      baseCommandEnv,
    ),
    createCommand(
      "validation:db:deploy",
      "pnpm",
      ["run", "validation:db:deploy"],
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
  parseArgs,
  renderCommand,
  runBackendReleaseRehearsal,
};
