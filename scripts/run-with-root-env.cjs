#!/usr/bin/env node

const { spawn } = require("node:child_process");
const path = require("node:path");

const { loadEnvFile } = require("./_validation-common.cjs");

function main() {
  const [, , targetCwd, ...commandParts] = process.argv;
  if (!targetCwd || commandParts.length === 0) {
    console.error(
      "Usage: node scripts/run-with-root-env.cjs <cwd> <command> [args...]",
    );
    process.exit(1);
  }

  loadEnvFile(path.resolve(process.cwd(), ".env"));

  const child = spawn(commandParts[0], commandParts.slice(1), {
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

main();
