#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { fail, info, pass } = require("./_validation-common.cjs");
const {
  defaultBackupOutputPath,
  renderCommand,
} = require("./_postgres-admin.cjs");

function parseArgs(argv) {
  const options = {
    backupLabel: "rollback-rehearsal",
    envFilePath: path.resolve(process.cwd(), ".env"),
    yes: false,
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

    if (argument === "--backup-file") {
      options.backupPath = path.resolve(process.cwd(), argv[index + 1]);
      index += 1;
      continue;
    }

    if (argument === "--backup-label") {
      options.backupLabel = argv[index + 1];
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
    error: result.error,
    status: typeof result.status === "number" ? result.status : 1,
  };
}

async function runDatabaseRollbackRehearsal(options = {}) {
  const cwd = options.cwd || process.cwd();
  const logger = options.logger || { fail, info, pass };
  const envFilePath = options.envFilePath || path.resolve(cwd, ".env");
  const baseEnv = {
    ...process.env,
    ...(options.env || {}),
  };

  if (options.yes !== true) {
    logger.fail(
      "Rollback rehearsal will restore the target database snapshot. Re-run with --yes after confirming the environment is safe for a destructive drill.",
    );
    return 1;
  }

  if (!fs.existsSync(envFilePath)) {
    logger.fail(
      `Rollback rehearsal env file not found at ${envFilePath}. Provide --env-file <path> for the target host env before rerunning pnpm run backend:db:rollback:rehearse -- --yes.`,
    );
    return 1;
  }

  const backupPath =
    options.backupPath ||
    defaultBackupOutputPath(
      cwd,
      options.backupLabel || "rollback-rehearsal",
      options.now || new Date(),
    );
  const runCommand = options.runCommand || defaultRunCommand;

  const rehearsalCommands = [
    createCommand(
      "backend:db:backup",
      "pnpm",
      [
        "run",
        "backend:db:backup",
        "--",
        "--env-file",
        envFilePath,
        "--output",
        backupPath,
        "--label",
        options.backupLabel || "rollback-rehearsal",
        "--overwrite",
      ],
      cwd,
      baseEnv,
    ),
    createCommand(
      "api:prisma:deploy",
      "pnpm",
      ["run", "api:prisma:deploy", "--", "--env-file", envFilePath],
      cwd,
      baseEnv,
    ),
    createCommand(
      "validation:db:deploy",
      "pnpm",
      ["run", "validation:db:deploy", "--", "--env-file", envFilePath],
      cwd,
      baseEnv,
    ),
    createCommand(
      "validation:db:status",
      "pnpm",
      ["run", "validation:db:status", "--", "--env-file", envFilePath],
      cwd,
      baseEnv,
    ),
  ];
  const restoreCommand = createCommand(
    "backend:db:restore",
    "pnpm",
    [
      "run",
      "backend:db:restore",
      "--",
      "--env-file",
      envFilePath,
      "--input",
      backupPath,
      "--yes",
    ],
    cwd,
    baseEnv,
  );

  let backupCompleted = false;
  for (const command of rehearsalCommands) {
    const result = await runCommand(command);
    if (!result || result.status !== 0) {
      if (!backupCompleted) {
        logger.fail(
          `Rollback rehearsal stopped at ${command.label} before a restorable snapshot was captured. Fix the failing command above, then rerun pnpm run backend:db:rollback:rehearse -- --yes.`,
        );
        return 1;
      }

      logger.info(
        `Rollback rehearsal hit a failure at ${command.label}. Attempting to restore snapshot ${backupPath} before exiting.`,
      );
      const restoreResult = await runCommand(restoreCommand);
      if (!restoreResult || restoreResult.status !== 0) {
        logger.fail(
          `Rollback rehearsal failed at ${command.label}, and snapshot restore also failed. Resolve both command failures before promoting migrations.`,
        );
        return 1;
      }

      logger.fail(
        `Rollback rehearsal failed at ${command.label}, but the pre-rehearsal snapshot was restored from ${backupPath}. Fix the migration issue before release.`,
      );
      return 1;
    }

    if (command.label === "backend:db:backup") {
      backupCompleted = true;
    }
  }

  logger.info(
    `Rollback rehearsal migration sequence passed. Restoring snapshot ${backupPath} to prove recovery before release.`,
  );
  const restoreResult = await runCommand(restoreCommand);
  if (!restoreResult || restoreResult.status !== 0) {
    logger.fail(
      `Rollback rehearsal completed the migration sequence but failed while restoring ${backupPath}. Do not promote migrations until restore succeeds.`,
    );
    return 1;
  }

  logger.pass(
    `Rollback rehearsal completed and restored the pre-rehearsal snapshot from ${backupPath}.`,
  );
  return 0;
}

async function main() {
  const exitCode = await runDatabaseRollbackRehearsal(
    parseArgs(process.argv.slice(2)),
  );
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
  runDatabaseRollbackRehearsal,
};
