#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

function syncPrismaRuntimeArtifacts(options) {
  const buildRoot = path.resolve(options.buildRoot);
  const deployRoot = path.resolve(options.deployRoot);
  const buildStoreDir = path.join(buildRoot, "node_modules", ".pnpm");
  const deployStoreDir = path.join(deployRoot, "node_modules", ".pnpm");

  assertDirectoryExists(
    deployStoreDir,
    `Unable to find deployed pnpm store at ${deployStoreDir}. Run pnpm deploy before syncing Prisma runtime artifacts.`,
  );

  const deployEntries = fs
    .readdirSync(deployStoreDir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() && entry.name.startsWith("@prisma+client@"),
    )
    .map((entry) => entry.name);

  if (deployEntries.length === 0) {
    throw new Error(
      `Unable to find a deployed @prisma/client store entry under ${deployStoreDir}.`,
    );
  }

  const syncedEntries = [];
  const missingArtifacts = [];

  for (const entryName of deployEntries) {
    const sourceRuntimeDir = path.join(
      buildStoreDir,
      entryName,
      "node_modules",
      ".prisma",
    );
    const deployNodeModulesDir = path.join(
      deployStoreDir,
      entryName,
      "node_modules",
    );
    const deployClientDir = path.join(
      deployNodeModulesDir,
      "@prisma",
      "client",
    );
    const targetRuntimeDir = path.join(deployNodeModulesDir, ".prisma");

    if (!fs.existsSync(deployClientDir)) {
      continue;
    }

    if (!fs.existsSync(sourceRuntimeDir)) {
      missingArtifacts.push(
        `Missing generated Prisma runtime artifacts for ${entryName} at ${sourceRuntimeDir}.`,
      );
      continue;
    }

    fs.rmSync(targetRuntimeDir, {
      force: true,
      recursive: true,
    });
    fs.cpSync(sourceRuntimeDir, targetRuntimeDir, {
      recursive: true,
    });
    syncedEntries.push(entryName);
  }

  if (missingArtifacts.length > 0) {
    throw new Error(missingArtifacts.join("\n"));
  }

  if (syncedEntries.length === 0) {
    throw new Error(
      `Unable to match any deployed @prisma/client package directories under ${deployStoreDir}.`,
    );
  }

  return syncedEntries;
}

function assertDirectoryExists(directoryPath, errorMessage) {
  if (!fs.existsSync(directoryPath)) {
    throw new Error(errorMessage);
  }
}

function parseArgs(argv) {
  const options = {
    buildRoot: process.cwd(),
    deployRoot: process.cwd(),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--build-root") {
      options.buildRoot = argv[index + 1];
      index += 1;
      continue;
    }

    if (argument === "--deploy-root") {
      options.deployRoot = argv[index + 1];
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

if (require.main === module) {
  try {
    const syncedEntries = syncPrismaRuntimeArtifacts(parseArgs(process.argv.slice(2)));
    console.log(
      `Synced Prisma runtime artifacts for ${syncedEntries.length} deployed package store entr${syncedEntries.length === 1 ? "y" : "ies"}.`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

module.exports = {
  syncPrismaRuntimeArtifacts,
};
