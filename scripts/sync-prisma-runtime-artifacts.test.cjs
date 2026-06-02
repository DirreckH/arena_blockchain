const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  syncPrismaRuntimeArtifacts,
} = require("./sync-prisma-runtime-artifacts.cjs");

test("syncPrismaRuntimeArtifacts copies generated Prisma runtime files into the deployed bundle", () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-prisma-runtime-sync-"),
  );
  const packageStoreEntry = "@prisma+client@5.22.0_prisma@5.22.0";
  const sourceRuntimeDir = path.join(
    workspace,
    "build",
    "node_modules",
    ".pnpm",
    packageStoreEntry,
    "node_modules",
    ".prisma",
    "client",
  );
  const deployPackageDir = path.join(
    workspace,
    "deploy",
    "node_modules",
    ".pnpm",
    packageStoreEntry,
    "node_modules",
    "@prisma",
    "client",
  );
  const deployRuntimeDir = path.join(
    workspace,
    "deploy",
    "node_modules",
    ".pnpm",
    packageStoreEntry,
    "node_modules",
    ".prisma",
    "client",
  );

  fs.mkdirSync(sourceRuntimeDir, { recursive: true });
  fs.mkdirSync(deployPackageDir, { recursive: true });
  fs.writeFileSync(
    path.join(sourceRuntimeDir, "default.js"),
    "module.exports = { generated: true };\n",
    "utf8",
  );

  syncPrismaRuntimeArtifacts({
    buildRoot: path.join(workspace, "build"),
    deployRoot: path.join(workspace, "deploy"),
  });

  assert.equal(
    fs.readFileSync(path.join(deployRuntimeDir, "default.js"), "utf8"),
    "module.exports = { generated: true };\n",
  );
});

test("syncPrismaRuntimeArtifacts fails when generated Prisma runtime files are missing from the build workspace", () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-prisma-runtime-sync-missing-"),
  );
  const packageStoreEntry = "@prisma+client@5.22.0_prisma@5.22.0";
  const deployPackageDir = path.join(
    workspace,
    "deploy",
    "node_modules",
    ".pnpm",
    packageStoreEntry,
    "node_modules",
    "@prisma",
    "client",
  );

  fs.mkdirSync(deployPackageDir, { recursive: true });

  assert.throws(
    () =>
      syncPrismaRuntimeArtifacts({
        buildRoot: path.join(workspace, "build"),
        deployRoot: path.join(workspace, "deploy"),
      }),
    /generated Prisma runtime artifacts/i,
  );
});
