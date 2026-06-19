const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  auditNodeDependencies,
  buildAuditCommand,
  parseArgs,
} = require("./audit-node-dependencies.cjs");

test("parseArgs resolves audit level, output path, and include-dev flag", () => {
  const parsed = parseArgs([
    "--audit-level",
    "critical",
    "--include-dev",
    "--output",
    "reports/audit.json",
    "--no-ignore-registry-errors",
  ]);

  assert.equal(parsed.auditLevel, "critical");
  assert.equal(parsed.includeDev, true);
  assert.equal(parsed.ignoreRegistryErrors, false);
  assert.equal(parsed.outputPath, path.resolve(process.cwd(), "reports/audit.json"));
});

test("buildAuditCommand targets prod-only audit by default", () => {
  const command = buildAuditCommand({
    auditLevel: "high",
    cwd: path.resolve(__dirname, ".."),
    ignoreRegistryErrors: true,
    includeDev: false,
  });

  assert.equal(command.command, "pnpm");
  assert.deepEqual(command.args, [
    "audit",
    "--json",
    "--audit-level",
    "high",
    "--prod",
    "--ignore-registry-errors",
  ]);
});

test("auditNodeDependencies writes a summarized report and passes when audit is clean", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-dependency-audit-pass-"),
  );
  const outputPath = path.join(workspace, "reports", "prod-audit.json");
  const logger = createLogger();

  const exitCode = await auditNodeDependencies({
    cwd: workspace,
    logger,
    now: new Date("2026-06-07T15:00:00.000Z"),
    outputPath,
    runAudit(command) {
      assert.deepEqual(command.args, [
        "audit",
        "--json",
        "--audit-level",
        "high",
        "--prod",
        "--ignore-registry-errors",
      ]);
      return {
        status: 0,
        stdout: JSON.stringify({
          advisories: {},
          metadata: {
            vulnerabilities: {
              high: 0,
              critical: 0,
            },
          },
        }),
        stderr: "",
      };
    },
  });

  assert.equal(exitCode, 0);
  const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  assert.deepEqual(report.summarizedAdvisories, []);
  assert.equal(
    logger.passMessages.includes("Dependency audit passed."),
    true,
  );
});

test("auditNodeDependencies fails with summarized advisory output when vulnerabilities are present", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-dependency-audit-fail-"),
  );
  const logger = createLogger();

  const exitCode = await auditNodeDependencies({
    cwd: workspace,
    logger,
    runAudit() {
      return {
        status: 1,
        stdout: JSON.stringify({
          advisories: {
            "1102901": {
              id: 1102901,
              module_name: "elliptic",
              recommendation: "Upgrade to version 6.6.1 or later",
              severity: "critical",
              title: "Private key extraction",
              url: "https://github.com/advisories/GHSA-vjh7-7g9h-fjfh",
              cves: [],
            },
          },
          metadata: {
            vulnerabilities: {
              critical: 1,
              high: 0,
            },
          },
        }),
        stderr: "",
      };
    },
  });

  assert.equal(exitCode, 1);
  assert.equal(
    logger.failMessages.includes(
      "Dependency audit found 1 production advisories at severity high or above.",
    ),
    true,
  );
  assert.equal(
    logger.infoMessages.includes(
      "- [critical] elliptic: Private key extraction",
    ),
    true,
  );
});

function createLogger() {
  return {
    failMessages: [],
    infoMessages: [],
    passMessages: [],
    fail(message) {
      this.failMessages.push(message);
    },
    info(message) {
      this.infoMessages.push(message);
    },
    pass(message) {
      this.passMessages.push(message);
    },
  };
}
