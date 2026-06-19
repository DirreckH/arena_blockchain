#!/usr/bin/env node

const { spawn } = require("node:child_process");
const path = require("node:path");

const { loadEnvFile } = require("./_validation-common.cjs");

function parseCliArgs(argv) {
  const commandParts = [];
  let envFilePath = path.resolve(process.cwd(), ".env");

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--") {
      continue;
    }

    if (argument === "--env-file") {
      envFilePath = path.resolve(process.cwd(), argv[index + 1]);
      index += 1;
      continue;
    }

    commandParts.push(argument);
  }

  const [targetCwd, ...childCommandParts] = commandParts;

  return {
    childCommandParts,
    envFilePath,
    targetCwd,
  };
}

function main() {
  const { childCommandParts, envFilePath, targetCwd } = parseCliArgs(
    process.argv.slice(2),
  );

  if (!targetCwd || childCommandParts.length === 0) {
    console.error(
      "Usage: node scripts/run-with-root-env.cjs [--env-file <path>] <cwd> <command> [args...]",
    );
    process.exit(1);
  }

  loadEnvFile(envFilePath, { override: true });

  const child = spawn(childCommandParts[0], childCommandParts.slice(1), {
    cwd: path.resolve(process.cwd(), targetCwd),
    env: process.env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 0);
  });
}

if (require.main === module) {
  main();
}

module.exports = {
  parseCliArgs,
};
