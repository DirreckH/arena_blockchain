#!/usr/bin/env node

const { spawn } = require("node:child_process");
const path = require("node:path");

const { info, loadEnvFile } = require("./_validation-common.cjs");

const FALLBACK_DATABASE_URL =
  "postgresql://prisma:prisma@127.0.0.1:5432/prisma?schema=public";

function main() {
  loadEnvFile(path.resolve(process.cwd(), ".env"));

  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = FALLBACK_DATABASE_URL;
    info("DATABASE_URL not set, using placeholder for prisma generate");
  }

  const child = spawn("pnpm", ["run", "prisma:generate"], {
    cwd: path.resolve(process.cwd(), "apps/api"),
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
