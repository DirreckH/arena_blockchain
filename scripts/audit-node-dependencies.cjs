#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { fail, info, pass } = require("./_validation-common.cjs");

function parseArgs(argv) {
  const options = {
    auditLevel: "high",
    ignoreRegistryErrors: true,
    includeDev: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--audit-level") {
      options.auditLevel = argv[index + 1];
      index += 1;
      continue;
    }

    if (argument === "--include-dev") {
      options.includeDev = true;
      continue;
    }

    if (argument === "--output") {
      options.outputPath = path.resolve(process.cwd(), argv[index + 1]);
      index += 1;
      continue;
    }

    if (argument === "--no-ignore-registry-errors") {
      options.ignoreRegistryErrors = false;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

function defaultRunAudit(command) {
  return spawnSync(command.command, command.args, {
    cwd: command.cwd,
    encoding: "utf8",
    env: command.env,
    shell: process.platform === "win32",
    windowsHide: true,
  });
}

function buildAuditCommand(options) {
  const args = [
    "audit",
    "--json",
    "--audit-level",
    options.auditLevel,
  ];

  if (options.includeDev === true) {
    args.push("--dev");
  } else {
    args.push("--prod");
  }

  if (options.ignoreRegistryErrors === true) {
    args.push("--ignore-registry-errors");
  }

  return {
    args,
    command: "pnpm",
    cwd: options.cwd,
    env: {
      ...process.env,
      ...(options.env || {}),
    },
    label:
      options.includeDev === true
        ? "node-dependencies:audit:all"
        : "node-dependencies:audit:prod",
  };
}

function summarizeAdvisories(advisories) {
  return Object.values(advisories || {}).map((advisory) => ({
    cves: advisory.cves || [],
    id: advisory.id,
    moduleName: advisory.module_name,
    recommendation: advisory.recommendation,
    severity: advisory.severity,
    title: advisory.title,
    url: advisory.url,
  }));
}

async function auditNodeDependencies(options = {}) {
  const cwd = options.cwd || process.cwd();
  const logger = options.logger || { fail, info, pass };
  const outputPath =
    options.outputPath ||
    path.resolve(
      cwd,
      "validation-local",
      options.includeDev === true
        ? "dependency-audit-all.json"
        : "dependency-audit-prod.json",
    );
  const command = buildAuditCommand({
    auditLevel: options.auditLevel || "high",
    cwd,
    env: options.env,
    ignoreRegistryErrors: options.ignoreRegistryErrors !== false,
    includeDev: options.includeDev === true,
  });
  const runAudit = options.runAudit || defaultRunAudit;
  const result = await runAudit(command);

  const rawOutput = `${result.stdout || ""}${result.stderr || ""}`.trim();
  let report;
  try {
    report = JSON.parse(rawOutput || "{}");
  } catch (error) {
    logger.fail(
      `Dependency audit returned non-JSON output for ${command.label}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return 1;
  }

  const summarizedAdvisories = summarizeAdvisories(report.advisories || {});
  const summary = {
    auditedAt: (options.now || new Date()).toISOString(),
    command: ["pnpm", ...command.args].join(" "),
    metadata: report.metadata || {},
    summarizedAdvisories,
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  logger.info(`Dependency audit report: ${outputPath}`);
  logger.info(
    `Dependency audit scope: ${options.includeDev === true ? "all dependencies" : "production dependencies only"}`,
  );
  for (const advisory of summarizedAdvisories) {
    logger.info(
      `- [${advisory.severity}] ${advisory.moduleName}: ${advisory.title}`,
    );
  }

  if ((result.status || 0) !== 0 && summarizedAdvisories.length > 0) {
    logger.fail(
      `Dependency audit found ${summarizedAdvisories.length} ${command.label === "node-dependencies:audit:prod" ? "production" : "dependency"} advisories at severity ${options.auditLevel || "high"} or above.`,
    );
    return 1;
  }

  if ((result.status || 0) !== 0) {
    logger.fail(`Dependency audit command failed with exit code ${result.status}.`);
    return 1;
  }

  logger.pass("Dependency audit passed.");
  return 0;
}

async function main() {
  const exitCode = await auditNodeDependencies(parseArgs(process.argv.slice(2)));
  process.exit(exitCode);
}

if (require.main === module) {
  main().catch((error) => {
    fail(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

module.exports = {
  auditNodeDependencies,
  buildAuditCommand,
  parseArgs,
};
