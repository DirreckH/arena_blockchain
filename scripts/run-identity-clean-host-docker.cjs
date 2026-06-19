#!/usr/bin/env node

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { fail, info, pass } = require("./_validation-common.cjs");

const REQUIRED_CONSECUTIVE_PASSES = 5;
const DEFAULT_RUNS = REQUIRED_CONSECUTIVE_PASSES;
const DEFAULT_IMAGE_TAG = "arena-api-identity-gate:local";

function buildAcceptedOutputPath(cwd) {
  return path.resolve(
    cwd,
    "validation-local",
    "identity-clean-host-docker-summary.accepted.json",
  );
}

function buildRunLogPath(logDir, runIndex) {
  return path.join(
    logDir,
    `${String(runIndex).padStart(2, "0")}-api-test-identity-docker-run-${runIndex}.log`,
  );
}

function parseArgs(argv) {
  const cwd = process.cwd();
  const options = {
    acceptedOutputPath: buildAcceptedOutputPath(cwd),
    buildNoCache: false,
    cwd,
    dockerfilePath: path.resolve(cwd, "apps", "api", "Dockerfile.identity-gate"),
    imageTag: DEFAULT_IMAGE_TAG,
    logDir: path.resolve(cwd, "validation-local", "identity-clean-host-logs"),
    outputPath: path.resolve(
      cwd,
      "validation-local",
      "identity-clean-host-docker-summary.json",
    ),
    resume: false,
    runs: DEFAULT_RUNS,
    skipBuild: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--runs") {
      options.runs = Number.parseInt(argv[index + 1], 10);
      index += 1;
      continue;
    }

    if (argument === "--image-tag") {
      options.imageTag = String(argv[index + 1] || "").trim();
      index += 1;
      continue;
    }

    if (argument === "--output") {
      options.outputPath = path.resolve(cwd, argv[index + 1]);
      index += 1;
      continue;
    }

    if (argument === "--log-dir") {
      options.logDir = path.resolve(cwd, argv[index + 1]);
      index += 1;
      continue;
    }

    if (argument === "--accepted-output") {
      options.acceptedOutputPath = path.resolve(cwd, argv[index + 1]);
      index += 1;
      continue;
    }

    if (argument === "--dockerfile") {
      options.dockerfilePath = path.resolve(cwd, argv[index + 1]);
      index += 1;
      continue;
    }

    if (argument === "--skip-build") {
      options.skipBuild = true;
      continue;
    }

    if (argument === "--resume") {
      options.resume = true;
      continue;
    }

    if (argument === "--build-no-cache") {
      options.buildNoCache = true;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

function buildDockerBuildCommand(options) {
  const args = ["build"];
  if (options.buildNoCache) {
    args.push("--no-cache");
  }
  args.push("-f", options.dockerfilePath, "-t", options.imageTag, ".");

  return createCommand(
    "docker:build:identity-clean-host",
    "docker",
    args,
    options.cwd,
    process.env,
  );
}

function buildDockerRunCommand(options) {
  return createCommand(
    `docker:run:identity-clean-host#${options.runIndex}`,
    "docker",
    [
      "run",
      "--rm",
      "--name",
      `arena-identity-clean-host-run-${options.runIndex}`,
      "-e",
      "CI=true",
      "-e",
      "ARENA_STABLE_TEST_STEP_PAUSE_MS=0",
      options.imageTag,
      "pnpm",
      "run",
      "api:test:identity",
    ],
    options.cwd,
    process.env,
  );
}

function buildDockerCleanupCommand(options) {
  return createCommand(
    `docker:cleanup:identity-clean-host#${options.runIndex}`,
    "docker",
    ["rm", "-f", `arena-identity-clean-host-run-${options.runIndex}`],
    options.cwd,
    process.env,
  );
}

function isMissingContainerCleanup(result) {
  const stderr = String(result.stderr || "").toLowerCase();
  return result.status === 1 && stderr.includes("no such container");
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

function renderCommand(command) {
  return [command.command, ...command.args].join(" ");
}

function defaultRunCommand(command) {
  const startedAt = new Date();
  info(`Running ${command.label}: ${renderCommand(command)}`);
  const result = spawnSync(command.command, command.args, {
    cwd: command.cwd,
    env: command.env,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    shell: false,
    stdio: "pipe",
    windowsHide: true,
  });
  const endedAt = new Date();

  return {
    endedAt,
    error: result.error
      ? result.error instanceof Error
        ? result.error.message
        : String(result.error)
      : null,
    signal: result.signal ?? null,
    startedAt,
    status: typeof result.status === "number" ? result.status : 1,
    stderr: typeof result.stderr === "string" ? result.stderr : "",
    stdout: typeof result.stdout === "string" ? result.stdout : "",
  };
}

function ensureParentDirectory(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function writeRunLog(logPath, input) {
  ensureParentDirectory(logPath);
  const parts = [
    `label: ${input.label}`,
    `command: ${input.command}`,
    `startedAt: ${input.startedAt.toISOString()}`,
    `endedAt: ${input.endedAt.toISOString()}`,
    `durationMs: ${input.durationMs}`,
    `status: ${input.status}`,
    input.signal ? `signal: ${input.signal}` : null,
    input.error ? `error: ${input.error}` : null,
    "",
    "stdout:",
    input.stdout.trimEnd(),
    "",
    "stderr:",
    input.stderr.trimEnd(),
    "",
  ].filter((value) => value !== null);

  fs.writeFileSync(logPath, parts.join("\n"), "utf8");
}

function readRunLog(logPath) {
  if (!fs.existsSync(logPath)) {
    return null;
  }

  const contents = fs.readFileSync(logPath, "utf8");
  const header = {};
  for (const line of contents.split(/\r?\n/u)) {
    if (!line.trim()) {
      break;
    }

    const separatorIndex = line.indexOf(":");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    header[key] = value;
  }

  if (!header.label || !header.startedAt || !header.endedAt) {
    return null;
  }

  const durationMs = Number.parseInt(header.durationMs || "0", 10);
  const status = Number.parseInt(header.status || "1", 10);

  return {
    durationMs: Number.isNaN(durationMs) ? 0 : durationMs,
    endedAt: header.endedAt,
    label: header.label,
    logPath,
    startedAt: header.startedAt,
    status: Number.isNaN(status) ? 1 : status,
  };
}

function collectReusableSequentialRuns(options = {}) {
  if (options.resume !== true) {
    return [];
  }

  const logger = options.logger || { info };
  const reusableRuns = [];
  const logDir = options.logDir;
  const runs = normalizeRuns(
    options.runs === undefined ? DEFAULT_RUNS : options.runs,
  );

  for (let runIndex = 1; runIndex <= runs; runIndex += 1) {
    const logPath = buildRunLogPath(logDir, runIndex);
    const existingRun = readRunLog(logPath);
    if (!existingRun || existingRun.label !== `docker:run:identity-clean-host#${runIndex}`) {
      break;
    }

    if (existingRun.status !== 0) {
      break;
    }

    reusableRuns.push(existingRun);
    logger.info(`Reusing ${existingRun.label} from ${logPath}`);
  }

  return reusableRuns;
}

function getCommitSha(cwd) {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd,
    encoding: "utf8",
    shell: false,
    stdio: "pipe",
    windowsHide: true,
  });

  if (typeof result.status === "number" && result.status === 0) {
    return String(result.stdout || "").trim() || null;
  }

  return null;
}

function normalizeRuns(value) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`--runs must be a positive integer. Received: ${value}`);
  }

  return value;
}

async function runIdentityCleanHostDocker(options = {}) {
  const cwd = path.resolve(options.cwd || process.cwd());
  const runs = normalizeRuns(
    options.runs === undefined ? DEFAULT_RUNS : options.runs,
  );
  const logger = options.logger || { fail, info, pass };
  const nowFactory = options.nowFactory || (() => new Date());
  const outputPath =
    options.outputPath ||
    path.resolve(cwd, "validation-local", "identity-clean-host-docker-summary.json");
  const logDir =
    options.logDir ||
    path.resolve(cwd, "validation-local", "identity-clean-host-logs");
  const acceptedOutputPath =
    options.acceptedOutputPath || buildAcceptedOutputPath(cwd);
  const dockerfilePath =
    options.dockerfilePath ||
    path.resolve(cwd, "apps", "api", "Dockerfile.identity-gate");
  const imageTag = options.imageTag || DEFAULT_IMAGE_TAG;
  const runCommand = options.runCommand || defaultRunCommand;
  const commitShaResolver = options.getCommitSha || getCommitSha;
  const summary = {
    acceptance:
      "Five consecutive green Linux container runs of pnpm run api:test:identity.",
    accepted: false,
    acceptedOutputPath,
    requiredConsecutivePasses: REQUIRED_CONSECUTIVE_PASSES,
    build: null,
    checkedAt: nowFactory().toISOString(),
    commitSha: commitShaResolver(cwd),
    cwd,
    dockerfilePath,
    host: {
      arch: os.arch(),
      hostname: os.hostname(),
      platform: os.platform(),
      release: os.release(),
    },
    imageTag,
    logDir,
    outputPath,
    runs: [],
    runsCompleted: 0,
    runsRequested: runs,
    consecutivePasses: 0,
  };

  ensureParentDirectory(outputPath);
  fs.mkdirSync(logDir, { recursive: true });

  if (!options.skipBuild) {
    const buildCommand = buildDockerBuildCommand({
      buildNoCache: options.buildNoCache === true,
      cwd,
      dockerfilePath,
      imageTag,
    });
    const buildResult = runCommand(buildCommand);
    const buildDurationMs =
      buildResult.endedAt.getTime() - buildResult.startedAt.getTime();
    const buildLogPath = path.join(logDir, "00-docker-build.log");
    writeRunLog(buildLogPath, {
      command: renderCommand(buildCommand),
      durationMs: buildDurationMs,
      endedAt: buildResult.endedAt,
      error: buildResult.error,
      label: buildCommand.label,
      signal: buildResult.signal,
      startedAt: buildResult.startedAt,
      status: buildResult.status,
      stderr: buildResult.stderr,
      stdout: buildResult.stdout,
    });
    summary.build = {
      durationMs: buildDurationMs,
      logPath: buildLogPath,
      status: buildResult.status,
    };

    if (buildResult.status !== 0) {
      logger.fail(
        `Docker clean-host identity image build failed. See ${buildLogPath}`,
      );
      fs.writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
      return 1;
    }
  }

  const reusableRuns = collectReusableSequentialRuns({
    logDir,
    logger,
    resume: options.resume === true,
    runs,
  });

  for (const reusableRun of reusableRuns) {
    summary.runs.push({
      durationMs: reusableRun.durationMs,
      endedAt: reusableRun.endedAt,
      label: reusableRun.label,
      logPath: reusableRun.logPath,
      startedAt: reusableRun.startedAt,
      status: reusableRun.status,
    });
    summary.runsCompleted += 1;
    summary.consecutivePasses += 1;
  }

  for (let runIndex = reusableRuns.length + 1; runIndex <= runs; runIndex += 1) {
    const cleanupCommand = buildDockerCleanupCommand({
      cwd,
      runIndex,
    });
    const cleanupResult = runCommand(cleanupCommand);

    if (cleanupResult.status !== 0 && !isMissingContainerCleanup(cleanupResult)) {
      const cleanupDurationMs =
        cleanupResult.endedAt.getTime() - cleanupResult.startedAt.getTime();
      const cleanupLogPath = path.join(
        logDir,
        `${String(runIndex).padStart(2, "0")}-docker-cleanup-${runIndex}.log`,
      );

      writeRunLog(cleanupLogPath, {
        command: renderCommand(cleanupCommand),
        durationMs: cleanupDurationMs,
        endedAt: cleanupResult.endedAt,
        error: cleanupResult.error,
        label: cleanupCommand.label,
        signal: cleanupResult.signal,
        startedAt: cleanupResult.startedAt,
        status: cleanupResult.status,
        stderr: cleanupResult.stderr,
        stdout: cleanupResult.stdout,
      });

      logger.fail(
        `Failed to clear stale identity container before ${cleanupCommand.label}. See ${cleanupLogPath}`,
      );
      fs.writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
      return 1;
    }

    const command = buildDockerRunCommand({
      cwd,
      imageTag,
      runIndex,
    });
    const result = runCommand(command);
    const durationMs = result.endedAt.getTime() - result.startedAt.getTime();
    const logPath = buildRunLogPath(logDir, runIndex);

    writeRunLog(logPath, {
      command: renderCommand(command),
      durationMs,
      endedAt: result.endedAt,
      error: result.error,
      label: command.label,
      signal: result.signal,
      startedAt: result.startedAt,
      status: result.status,
      stderr: result.stderr,
      stdout: result.stdout,
    });

    summary.runs.push({
      durationMs,
      endedAt: result.endedAt.toISOString(),
      label: command.label,
      logPath,
      startedAt: result.startedAt.toISOString(),
      status: result.status,
    });

    if (result.status !== 0) {
      logger.fail(
        `${command.label} failed inside the Linux container. See ${logPath}`,
      );
      fs.writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
      return 1;
    }

    summary.runsCompleted += 1;
    summary.consecutivePasses += 1;
  }

  summary.accepted =
    summary.consecutivePasses >= REQUIRED_CONSECUTIVE_PASSES &&
    summary.runsCompleted >= REQUIRED_CONSECUTIVE_PASSES;
  fs.writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  if (summary.accepted && acceptedOutputPath) {
    ensureParentDirectory(acceptedOutputPath);
    fs.writeFileSync(
      acceptedOutputPath,
      `${JSON.stringify(summary, null, 2)}\n`,
      "utf8",
    );
  }

  logger.pass(
    `Docker clean-host identity gate completed with ${summary.consecutivePasses}/${runs} consecutive passes (acceptance requires ${REQUIRED_CONSECUTIVE_PASSES}). Summary: ${outputPath}`,
  );

  return 0;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const exitCode = await runIdentityCleanHostDocker(options);
    process.exitCode = exitCode;
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main();
}

module.exports = {
  buildDockerBuildCommand,
  buildDockerCleanupCommand,
  buildDockerRunCommand,
  collectReusableSequentialRuns,
  parseArgs,
  readRunLog,
  runIdentityCleanHostDocker,
};
