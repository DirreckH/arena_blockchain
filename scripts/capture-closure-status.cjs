#!/usr/bin/env node

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { fail, info, pass } = require("./_validation-common.cjs");

const DEFAULT_IDENTITY_RUNS = 1;

function parseArgs(argv) {
  const options = {
    identityRuns: DEFAULT_IDENTITY_RUNS,
    resume: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];

    if (token === "--env-file" && next) {
      options.envFilePath = next;
      index += 1;
      continue;
    }

    if (token === "--previous-env" && next) {
      options.previousEnvPath = next;
      index += 1;
      continue;
    }

    if (token === "--base-url" && next) {
      options.baseUrl = next;
      index += 1;
      continue;
    }

    if (token === "--auth-token" && next) {
      options.authToken = next;
      index += 1;
      continue;
    }

    if (token === "--proposition-id" && next) {
      options.propositionId = next;
      index += 1;
      continue;
    }

    if (token === "--validation-network" && next) {
      options.validationNetwork = next;
      index += 1;
      continue;
    }

    if (token === "--identity-runs" && next) {
      options.identityRuns = Number.parseInt(next, 10);
      index += 1;
      continue;
    }

    if (token === "--output" && next) {
      options.outputPath = next;
      index += 1;
      continue;
    }

    if (token === "--log-dir" && next) {
      options.logDir = next;
      index += 1;
      continue;
    }

    if (token === "--resume") {
      options.resume = true;
      continue;
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  return options;
}

function createCommand(input) {
  return {
    args: input.args,
    command: input.command,
    cwd: input.cwd,
    env: input.env,
    gateId: input.gateId,
    label: input.label,
    logFileName: input.logFileName,
  };
}

function buildRepoGateCommands(options) {
  const commands = [];

  for (let runIndex = 1; runIndex <= options.identityRuns; runIndex += 1) {
    commands.push(
      createCommand({
        gateId: "api:test:identity",
        label: `api:test:identity#${runIndex}`,
        logFileName: `${String(runIndex).padStart(2, "0")}-api-test-identity-run-${runIndex}.log`,
        command: "pnpm",
        args: ["run", "api:test:identity"],
        cwd: options.cwd,
        env: options.env,
      }),
    );
  }

  commands.push(
    createCommand({
      gateId: "api:test:payout-release",
      label: "api:test:payout-release",
      logFileName: "10-api-test-payout-release.log",
      command: "pnpm",
      args: ["run", "api:test:payout-release"],
      cwd: options.cwd,
      env: options.env,
    }),
    createCommand({
      gateId: "api:test:hardening",
      label: "api:test:hardening",
      logFileName: "11-api-test-hardening.log",
      command: "pnpm",
      args: ["run", "api:test:hardening"],
      cwd: options.cwd,
      env: options.env,
    }),
    createCommand({
      gateId: "validation:repo:test",
      label: "validation:repo:test",
      logFileName: "12-validation-repo-test.log",
      command: "pnpm",
      args: ["run", "validation:repo:test"],
      cwd: options.cwd,
      env: options.env,
    }),
    createCommand({
      gateId: "backend:release:repo:test",
      label: "backend:release:repo:test",
      logFileName: "13-backend-release-repo-test.log",
      command: "pnpm",
      args: ["run", "backend:release:repo:test"],
      cwd: options.cwd,
      env: options.env,
    }),
  );

  return commands;
}

function renderCommand(command) {
  const renderedArgs = [];

  for (let index = 0; index < command.args.length; index += 1) {
    const argument = command.args[index];
    renderedArgs.push(argument);

    if (argument === "--auth-token" && index + 1 < command.args.length) {
      renderedArgs.push("<redacted>");
      index += 1;
    }
  }

  return [command.command, ...renderedArgs].join(" ");
}

function defaultRunCommand(command) {
  const startedAt = new Date();
  info(`Running ${command.label}: ${renderCommand(command)}`);
  const result = spawnSync(command.command, command.args, {
    cwd: command.cwd,
    env: command.env,
    shell: process.platform === "win32",
    stdio: "pipe",
    windowsHide: true,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
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

function writeCommandLog(logPath, input) {
  const parts = [
    `label: ${input.label}`,
    `gateId: ${input.gateId}`,
    `command: ${input.command}`,
    `startedAt: ${input.startedAt}`,
    `endedAt: ${input.endedAt}`,
    `durationMs: ${input.durationMs}`,
    `status: ${input.status}`,
    `signal: ${input.signal ?? ""}`,
  ];

  if (input.error) {
    parts.push(`error: ${input.error}`);
  }

  parts.push("", "stdout:", input.stdout.trimEnd(), "", "stderr:", input.stderr.trimEnd(), "");

  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.writeFileSync(logPath, `${parts.join("\n")}\n`, "utf8");
}

function readCommandLog(logPath) {
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

  if (!header.label || !header.gateId || !header.command) {
    return null;
  }

  const durationMs = Number.parseInt(header.durationMs || "0", 10);
  const status = Number.parseInt(header.status || "1", 10);

  return {
    command: header.command,
    durationMs: Number.isNaN(durationMs) ? 0 : durationMs,
    endedAt: header.endedAt || null,
    gateId: header.gateId,
    label: header.label,
    logPath,
    startedAt: header.startedAt || null,
    status: Number.isNaN(status) ? 1 : status,
  };
}

function getCommandOutput(options = {}) {
  const result = spawnSync(options.command, options.args || [], {
    cwd: options.cwd,
    env: options.env,
    shell: process.platform === "win32",
    stdio: "pipe",
    windowsHide: true,
    encoding: "utf8",
  });

  if (result.error) {
    return "";
  }

  if (typeof result.status === "number" && result.status !== 0) {
    return "";
  }

  return typeof result.stdout === "string" ? result.stdout.trim() : "";
}

function resolveMetadata(options) {
  return {
    gitCommitSha:
      options.gitCommitSha ||
      getCommandOutput({
        command: "git",
        args: ["rev-parse", "HEAD"],
        cwd: options.cwd,
        env: options.env,
      }) ||
      null,
    host: options.host || os.hostname(),
    nodeVersion: process.version,
    pnpmVersion:
      options.pnpmVersion ||
      getCommandOutput({
        command: "pnpm",
        args: ["--version"],
        cwd: options.cwd,
        env: options.env,
      }) ||
      null,
  };
}

function readEnvFileValues(filePath, cwd = process.cwd()) {
  const resolvedPath = path.resolve(cwd, filePath || ".env");

  if (!fs.existsSync(resolvedPath)) {
    return {
      envPath: resolvedPath,
      exists: false,
      loaded: {},
    };
  }

  const loaded = {};
  const contents = fs.readFileSync(resolvedPath, "utf8");

  for (const rawLine of contents.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const delimiterIndex = line.indexOf("=");
    if (delimiterIndex <= 0) {
      continue;
    }

    const key = line.slice(0, delimiterIndex).trim();
    let value = line.slice(delimiterIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    loaded[key] = value;
  }

  return {
    envPath: resolvedPath,
    exists: true,
    loaded,
  };
}

function stripTrailingSlash(value) {
  return String(value || "").replace(/\/+$/u, "");
}

function classifyUrl(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return {
      hostname: null,
      isLocal: false,
      normalized: null,
      protocol: null,
    };
  }

  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase();
    return {
      hostname,
      isLocal: isLocalHostname(hostname),
      normalized: parsed.toString(),
      protocol: parsed.protocol || null,
    };
  } catch {
    return {
      hostname: null,
      isLocal: false,
      normalized: null,
      protocol: null,
    };
  }
}

function isLocalHostname(hostname) {
  return (
    hostname === "127.0.0.1" ||
    hostname === "localhost" ||
    hostname === "host.docker.internal" ||
    hostname === "::1"
  );
}

function buildExternalEvidenceCommand(options) {
  if (
    !options.envFilePath ||
    !options.previousEnvPath ||
    !options.baseUrl ||
    !options.propositionId
  ) {
    return null;
  }

  const parts = [
    "pnpm run backend:release:evidence:external -- --env-file",
    options.envFilePath,
    "--previous-env",
    options.previousEnvPath,
    "--base-url",
    options.baseUrl,
  ];

  if (options.authToken) {
    parts.push("--auth-token", "<operator-token>");
  }

  parts.push("--proposition-id", options.propositionId, "--yes", "--operator-monitoring-proof");

  if (options.validationNetwork) {
    parts.push("--validation-network", options.validationNetwork);
  }

  return parts.join(" ");
}

function buildDeployCommand(options) {
  if (!options.envFilePath) {
    return null;
  }

  const parts = [
    "pnpm run validation:deploy -- --env-file",
    options.envFilePath,
  ];

  if (options.validationNetwork) {
    parts.push("--network", options.validationNetwork);
  }

  return parts.join(" ");
}

function buildPreflightCommand(options) {
  if (!options.envFilePath) {
    return null;
  }

  const parts = [
    "pnpm run validation:preflight -- --env-file",
    options.envFilePath,
  ];

  if (options.validationNetwork) {
    parts.push("--deploy-validation", "--network", options.validationNetwork);
  }

  return parts.join(" ");
}

function detectVercelDeploymentProtection(body) {
  const text = String(body || "");
  if (!text) {
    return false;
  }

  return (
    text.includes("Vercel Authentication") ||
    text.includes("This page requires Vercel authentication") ||
    text.includes("x-vercel-protection-bypass")
  );
}

function isVercelProtectedHost(hostname) {
  const normalized = String(hostname || "").toLowerCase();
  return normalized.endsWith(".vercel.app") || normalized === "vercel.app";
}

async function probeBaseUrlAccess(options = {}) {
  const baseUrl = stripTrailingSlash(options.baseUrl || "");
  const baseUrlInfo = classifyUrl(baseUrl);
  const platform = String(options.platform || process.platform || "").toLowerCase();

  if (!baseUrl || baseUrlInfo.isLocal) {
    return null;
  }

  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    return null;
  }

  try {
    const response = await fetchImpl(`${baseUrl}/health/live`, {
      method: "GET",
      redirect: "manual",
      signal:
        typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
          ? AbortSignal.timeout(15000)
          : undefined,
    });

    const body = await response.text();
    const vercelProtected =
      detectVercelDeploymentProtection(body)
      || (response.status === 401 && isVercelProtectedHost(baseUrlInfo.hostname));

    return {
      protection:
        response.status === 401 && vercelProtected
          ? "vercel_deployment_protection_required"
          : null,
      statusCode: response.status,
      url: `${baseUrl}/health/live`,
    };
  } catch (error) {
    if (platform === "win32") {
      const fallback = probeBaseUrlAccessWithPowerShell({
        baseUrl,
        commandRunner: options.commandRunner,
      });

      if (fallback) {
        return fallback;
      }
    }

    return {
      error: error instanceof Error ? error.message : String(error),
      protection: null,
      statusCode: null,
      url: `${baseUrl}/health/live`,
    };
  }
}

function probeBaseUrlAccessWithPowerShell(options = {}) {
  const baseUrl = stripTrailingSlash(options.baseUrl || "");
  const baseUrlInfo = classifyUrl(baseUrl);
  if (!baseUrl) {
    return null;
  }

  const commandRunner =
    typeof options.commandRunner === "function"
      ? options.commandRunner
      : defaultPowerShellCommandRunner;
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "$ProgressPreference = 'SilentlyContinue'",
    `$uri = '${baseUrl.replace(/'/g, "''")}/health/live'`,
    "try {",
    "  $response = Invoke-WebRequest -Uri $uri -Method Get -MaximumRedirection 0 -UseBasicParsing -ErrorAction Stop",
    "  $statusCode = [int]$response.StatusCode",
    "  $body = [string]$response.Content",
    "} catch {",
    "  $statusCode = [int]($_.Exception.Response.StatusCode.value__)",
    "  $body = ''",
    "  if ($_.ErrorDetails -and $_.ErrorDetails.Message) {",
    "    $body = [string]$_.ErrorDetails.Message",
    "  } elseif ($_.Exception.Response -and $_.Exception.Response.GetResponseStream()) {",
    "    $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())",
    "    $body = $reader.ReadToEnd()",
    "  }",
    "}",
    "[Console]::Out.WriteLine((ConvertTo-Json @{ statusCode = $statusCode; body = $body; error = $null } -Compress))",
  ].join("\n");
  const result = commandRunner("powershell", [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    script,
  ]);

  if (!result || result.status !== 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(String(result.stdout || "").trim());
    const vercelProtected =
      detectVercelDeploymentProtection(parsed.body)
      || (
        Number.parseInt(String(parsed.statusCode || ""), 10) === 401
        && isVercelProtectedHost(baseUrlInfo.hostname)
      );
    const statusCode = Number.parseInt(String(parsed.statusCode || ""), 10);

    return {
      protection:
        statusCode === 401 && vercelProtected
          ? "vercel_deployment_protection_required"
          : null,
      statusCode: Number.isNaN(statusCode) ? null : statusCode,
      url: `${baseUrl}/health/live`,
    };
  } catch {
    return null;
  }
}

function defaultPowerShellCommandRunner(command, args) {
  const normalizedCommand = String(command || "").toLowerCase();
  const resolvedCommand =
    process.platform === "win32" && normalizedCommand === "powershell"
      ? "powershell.exe"
      : command;
  const useShell = !(process.platform === "win32" && normalizedCommand === "powershell");

  return spawnSync(resolvedCommand, args, {
    encoding: "utf8",
    shell: useShell,
    stdio: "pipe",
    windowsHide: true,
  });
}

function evaluateExternalExecution(options) {
  const blockers = [];
  const validationEnvironment =
    options.loadedEnv.ARENA_VALIDATION_ENVIRONMENT || null;
  const rpcUrl = options.loadedEnv.RPC_URL || "";
  const baseUrl = options.baseUrl || "";
  const authToken = options.authToken || "";
  const previousEnvPath = options.previousEnvPath || "";
  const propositionId = options.propositionId || "";
  const chainId = options.loadedEnv.CHAIN_ID || null;
  const rpcInfo = classifyUrl(rpcUrl);
  const baseUrlInfo = classifyUrl(baseUrl);

  if (!options.envExists) {
    blockers.push("release_env_missing");
  }

  if (!previousEnvPath) {
    blockers.push("previous_env_missing");
  } else if (!fs.existsSync(previousEnvPath)) {
    blockers.push("previous_env_not_found");
  }

  if (!baseUrl) {
    blockers.push("base_url_missing");
  } else if (baseUrlInfo.isLocal) {
    blockers.push("base_url_is_local");
  } else if (options.baseUrlAccess?.protection === "vercel_deployment_protection_required") {
    blockers.push("base_url_deployment_protected");
  }

  if (!propositionId) {
    blockers.push("proposition_id_missing");
  }

  if (!authToken) {
    blockers.push("operator_token_missing");
  }

  if (!validationEnvironment) {
    blockers.push("validation_environment_missing");
  } else if (validationEnvironment === "local") {
    blockers.push("release_env_is_local");
  }

  if (!rpcUrl) {
    blockers.push("rpc_url_missing");
  } else if (rpcInfo.isLocal) {
    blockers.push("rpc_url_is_local");
  }

  if (chainId === "1337") {
    blockers.push("chain_id_is_local");
  }

  if (validationEnvironment && validationEnvironment !== "local") {
    if (!options.loadedEnv.DATABASE_URL) {
      blockers.push("database_url_missing");
    }
    if (!options.loadedEnv.REDIS_URL) {
      blockers.push("redis_url_missing");
    }
    if (!options.loadedEnv.ARENA_CONTRACT_ADDRESS) {
      blockers.push("legacy_contract_address_missing");
    }
    if (!options.loadedEnv.ARENA_VALIDATION_CONTRACT_ADDRESS) {
      blockers.push("validation_contract_address_missing");
    }
    if (!options.loadedEnv.ARENA_REWARD_PAYOUT_ERC20_ADDRESS) {
      blockers.push("reward_payout_token_missing");
    }
    if (!options.loadedEnv.ARENA_OPS_ALERT_WEBHOOK_TARGETS) {
      blockers.push("ops_alert_targets_missing");
    }
  }

  return {
    authTokenPresent: authToken.length > 0,
    baseUrlAccess: options.baseUrlAccess || null,
    baseUrl: baseUrl || null,
    baseUrlHostname: baseUrlInfo.hostname,
    blockers,
    envFilePath: options.envFilePath,
    envExists: options.envExists,
    externalEvidenceCommand: buildExternalEvidenceCommand({
      authToken,
      baseUrl,
      envFilePath: options.envFilePath,
      previousEnvPath,
      propositionId,
      validationNetwork: options.validationNetwork,
    }),
    previousEnvExists: previousEnvPath ? fs.existsSync(previousEnvPath) : false,
    previousEnvPath: previousEnvPath || null,
    propositionId: propositionId || null,
    ready: blockers.length === 0,
    rpcUrl: rpcUrl || null,
    rpcUrlHostname: rpcInfo.hostname,
    validationDeployCommand: buildDeployCommand({
      envFilePath: options.envFilePath,
      validationNetwork: options.validationNetwork,
    }),
    validationEnvironment,
    validationNetwork: options.validationNetwork,
    validationPreflightCommand: buildPreflightCommand({
      envFilePath: options.envFilePath,
      validationNetwork: options.validationNetwork,
    }),
  };
}

function collectExistingArtifacts(cwd) {
  const validationLocalPath = path.resolve(cwd, "validation-local");
  const validationRehearsalPath = path.resolve(cwd, "validation-rehearsal");
  const artifacts = {
    validationLocal: {
      dependencyAuditProd: existingPath(
        path.resolve(validationLocalPath, "dependency-audit-prod.json"),
      ),
      identityCleanHostDockerSummary: existingPath(
        path.resolve(validationLocalPath, "identity-clean-host-docker-summary.json"),
      ),
      operatorMonitoringProof: existingPath(
        path.resolve(validationLocalPath, "runtime-contract-operator-proof.json"),
      ),
      releaseRehearsalEnv: existingPath(
        path.resolve(validationLocalPath, "release-rehearsal.env"),
      ),
      secretRotationAudit: existingPath(
        path.resolve(validationLocalPath, "secret-rotation-audit.json"),
      ),
    },
    validationProofs: [],
  };

  if (!fs.existsSync(validationRehearsalPath)) {
    return artifacts;
  }

  const directories = fs
    .readdirSync(validationRehearsalPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  for (const directoryName of directories) {
    const proofDir = path.resolve(validationRehearsalPath, directoryName);
    const proofSummaryPath = path.resolve(proofDir, "proof-summary.json");
    const evidenceBundlePath = path.resolve(proofDir, "evidence-bundle.json");

    if (!fs.existsSync(proofSummaryPath) && !fs.existsSync(evidenceBundlePath)) {
      continue;
    }

    const artifact = {
      backendReleaseReadiness: existingPath(
        path.resolve(proofDir, "backend-release-readiness.json"),
      ),
      directory: proofDir,
      evidenceBundle: existingPath(evidenceBundlePath),
      operatorBriefing: existingPath(path.resolve(proofDir, "operator-briefing.json")),
      proofSummary: existingPath(proofSummaryPath),
      propositionId: directoryName,
      publicIntegrityOverview: existingPath(
        path.resolve(proofDir, "public-integrity-overview.json"),
      ),
      publicSettledResult: existingPath(
        path.resolve(proofDir, "public-settled-result.json"),
      ),
      rewardPayoutSummary: existingPath(
        path.resolve(proofDir, "reward-payout-summary.json"),
      ),
      validationChainMonitoring: existingPath(
        path.resolve(proofDir, "validation-chain-monitoring.json"),
      ),
    };

    artifacts.validationProofs.push(artifact);
  }

  artifacts.validationProofs.sort((left, right) =>
    String(right.propositionId).localeCompare(String(left.propositionId)),
  );

  return artifacts;
}

function existingPath(filePath) {
  return fs.existsSync(filePath) ? filePath : null;
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function readPreparedClosureManifest(cwd) {
  return readJsonFile(path.resolve(cwd, "config", "staging.closure-inputs.json"));
}

function readAcceptedCleanHostIdentityProof(existingArtifacts) {
  const summaryPath =
    existingArtifacts?.validationLocal?.identityCleanHostDockerSummary || null;
  if (!summaryPath) {
    return null;
  }

  const summary = readJsonFile(summaryPath);
  if (!summary || summary.accepted !== true) {
    return null;
  }

  const requiredConsecutivePasses = Number.parseInt(
    String(summary.requiredConsecutivePasses || "0"),
    10,
  );
  const runsCompleted = Number.parseInt(String(summary.runsCompleted || "0"), 10);
  const consecutivePasses = Number.parseInt(
    String(summary.consecutivePasses || "0"),
    10,
  );

  if (
    Number.isNaN(requiredConsecutivePasses)
    || requiredConsecutivePasses < 1
    || Number.isNaN(runsCompleted)
    || Number.isNaN(consecutivePasses)
    || runsCompleted < requiredConsecutivePasses
    || consecutivePasses < requiredConsecutivePasses
  ) {
    return null;
  }

  return {
    checkedAt: summary.checkedAt || null,
    consecutivePasses,
    requiredConsecutivePasses,
    runsCompleted,
    summaryPath,
  };
}

function parseProofRecordDoc(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const contents = fs.readFileSync(filePath, "utf8");
  const recordMatch = /`Record`:\s*([0-9]+)/u.exec(contents);
  const propositionIdMatch = /`propositionId`:\s*`([^`]+)`/u.exec(contents);
  const capturedAtMatch = /`Captured At`:\s*([^\r\n]+)/u.exec(contents);
  const environmentMatch = /`Environment`:\s*([^\r\n]+)/u.exec(contents);

  return {
    capturedAt: capturedAtMatch ? capturedAtMatch[1].trim() : null,
    environment: environmentMatch ? environmentMatch[1].trim() : null,
    path: filePath,
    propositionId: propositionIdMatch ? propositionIdMatch[1].trim() : null,
    record: recordMatch ? recordMatch[1].trim() : null,
  };
}

function sortProofRecordDocs(left, right) {
  const leftRecord = Number.parseInt(left.record || "0", 10);
  const rightRecord = Number.parseInt(right.record || "0", 10);

  if (!Number.isNaN(leftRecord) && !Number.isNaN(rightRecord) && leftRecord !== rightRecord) {
    return rightRecord - leftRecord;
  }

  return String(right.path).localeCompare(String(left.path));
}

function extractLatestProofProposition(contents) {
  if (typeof contents !== "string" || contents.trim().length === 0) {
    return null;
  }

  const match = /latest proof proposition:\s*(?:\r?\n)+(?:[ \t-]+`([^`]+)`)/iu.exec(contents);
  return match ? match[1].trim() : null;
}

function readLatestProofPropositionHint(cwd) {
  const candidatePaths = [
    path.resolve(cwd, "docs", "NEXT_SLICES.md"),
    path.resolve(cwd, "docs", "INTEGRATION_STATUS.md"),
  ];

  for (const candidatePath of candidatePaths) {
    if (!fs.existsSync(candidatePath)) {
      continue;
    }

    const propositionId = extractLatestProofProposition(
      fs.readFileSync(candidatePath, "utf8"),
    );
    if (propositionId) {
      return {
        path: candidatePath,
        propositionId,
      };
    }
  }

  return null;
}

function collectMatchingFiles(rootPath, matcher, options = {}) {
  const maxDepth = Number.isInteger(options.maxDepth) ? options.maxDepth : 4;
  const skipDirectories = new Set(
    options.skipDirectories || [
      ".git",
      ".codex-temp",
      "node_modules",
      "dist",
      "build",
      "coverage",
      "validation-rehearsal",
    ],
  );
  const matches = [];

  function walk(currentPath, depth) {
    if (depth > maxDepth || !fs.existsSync(currentPath)) {
      return;
    }

    const entries = fs.readdirSync(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.resolve(currentPath, entry.name);

      if (entry.isDirectory()) {
        if (skipDirectories.has(entry.name)) {
          continue;
        }
        walk(entryPath, depth + 1);
        continue;
      }

      if (entry.isFile() && matcher(entryPath, entry.name)) {
        matches.push(entryPath);
      }
    }
  }

  walk(rootPath, 0);
  matches.sort((left, right) => String(left).localeCompare(String(right)));
  return matches;
}

function collectEnvFileCandidates(cwd) {
  const envFiles = collectMatchingFiles(
    cwd,
    (entryPath, entryName) =>
      entryName.includes(".env") &&
      !entryName.endsWith(".example") &&
      !entryName.endsWith(".sample"),
    {
      maxDepth: 3,
    },
  );

  return envFiles
    .filter((candidatePath) => !/previous/i.test(path.basename(candidatePath)))
    .map((candidatePath) => {
      const envResult = readEnvFileValues(candidatePath, cwd);
      const rpcUrl = envResult.loaded.RPC_URL || envResult.loaded.ARENA_COMPOSE_RPC_URL || null;
      const rpcInfo = classifyUrl(rpcUrl || "");
      const chainId = envResult.loaded.CHAIN_ID || null;
      const validationEnvironment =
        envResult.loaded.ARENA_VALIDATION_ENVIRONMENT || null;

      return {
        chainId,
        isLocal:
          validationEnvironment === "local" ||
          rpcInfo.isLocal ||
          chainId === "1337",
        path: candidatePath,
        rpcUrl,
        rpcUrlHostname: rpcInfo.hostname,
        validationEnvironment,
      };
    });
}

function collectPreviousEnvFileCandidates(cwd) {
  const envFiles = collectMatchingFiles(
    cwd,
    (entryPath, entryName) =>
      entryName.includes(".env") &&
      /previous/i.test(entryName) &&
      !entryName.endsWith(".example") &&
      !entryName.endsWith(".sample"),
    {
      maxDepth: 3,
    },
  );

  return envFiles.map((candidatePath) => {
    const envResult = readEnvFileValues(candidatePath, cwd);
    return {
      path: candidatePath,
      validationEnvironment:
        envResult.loaded.ARENA_VALIDATION_ENVIRONMENT || null,
    };
  });
}

function collectUrlOrigins(value, sourcePath, collector) {
  if (typeof value === "string") {
    const urlInfo = classifyUrl(value);
    if (
      urlInfo.normalized &&
      (urlInfo.protocol === "http:" || urlInfo.protocol === "https:")
    ) {
      const origin = new URL(urlInfo.normalized).origin;
      const existing = collector.get(origin) || {
        hostname: urlInfo.hostname,
        isLocal: urlInfo.isLocal,
        origin,
        sourcePaths: [],
      };

      if (!existing.sourcePaths.includes(sourcePath)) {
        existing.sourcePaths.push(sourcePath);
      }

      collector.set(origin, existing);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectUrlOrigins(item, sourcePath, collector);
    }
    return;
  }

  if (value && typeof value === "object") {
    for (const nested of Object.values(value)) {
      collectUrlOrigins(nested, sourcePath, collector);
    }
  }
}

function collectBaseUrlCandidates(existingArtifacts) {
  const origins = new Map();
  const candidatePaths = new Set();

  for (const artifact of existingArtifacts.validationProofs) {
    for (const artifactPath of [
      artifact.operatorBriefing,
      artifact.publicIntegrityOverview,
      artifact.publicSettledResult,
      artifact.proofSummary,
      artifact.evidenceBundle,
    ]) {
      if (artifactPath) {
        candidatePaths.add(artifactPath);
      }
    }
  }

  for (const artifactPath of candidatePaths) {
    const parsed = readJsonFile(artifactPath);
    if (parsed) {
      collectUrlOrigins(parsed, artifactPath, origins);
    }
  }

  return Array.from(origins.values()).sort((left, right) =>
    String(left.origin).localeCompare(String(right.origin)),
  );
}

function collectPreparedClosureBaseUrlCandidates(cwd) {
  const manifestPath = path.resolve(cwd, "config", "staging.closure-inputs.json");
  const manifest = readJsonFile(manifestPath);
  if (!manifest || !Array.isArray(manifest.baseUrlCandidates)) {
    return [];
  }

  const recommendedOrigin = (() => {
    try {
      return manifest.recommendedBaseUrlCandidate?.origin
        ? new URL(manifest.recommendedBaseUrlCandidate.origin).origin
        : null;
    } catch {
      return null;
    }
  })();

  return manifest.baseUrlCandidates
    .map((candidate) => {
      const normalized = classifyUrl(candidate.origin || "").normalized;
      if (!normalized) {
        return null;
      }

      const urlInfo = classifyUrl(normalized);
      const origin = new URL(normalized).origin;
      return {
        hostname: urlInfo.hostname,
        isLocal: urlInfo.isLocal,
        origin,
        recommended: recommendedOrigin === origin,
        sourcePaths: [manifestPath],
        suitability: candidate.suitability || null,
      };
    })
    .filter(Boolean);
}

function mergeBaseUrlCandidates(...candidateGroups) {
  const merged = new Map();

  for (const group of candidateGroups) {
    for (const candidate of Array.isArray(group) ? group : []) {
      if (!candidate?.origin) {
        continue;
      }

      const existing = merged.get(candidate.origin) || {
        hostname: candidate.hostname || classifyUrl(candidate.origin).hostname,
        isLocal: candidate.isLocal === true,
        origin: candidate.origin,
        recommended: false,
        sourcePaths: [],
        suitability: null,
      };

      existing.isLocal = existing.isLocal || candidate.isLocal === true;
      existing.recommended =
        existing.recommended || candidate.recommended === true;
      existing.suitability = existing.suitability || candidate.suitability || null;

      for (const sourcePath of candidate.sourcePaths || []) {
        if (!existing.sourcePaths.includes(sourcePath)) {
          existing.sourcePaths.push(sourcePath);
        }
      }

      merged.set(candidate.origin, existing);
    }
  }

  return Array.from(merged.values()).sort((left, right) => {
    if (left.recommended !== right.recommended) {
      return left.recommended ? -1 : 1;
    }

    return String(left.origin).localeCompare(String(right.origin));
  });
}

function collectDiscoveredCandidates(cwd, existingArtifacts) {
  const proofRecordPaths = collectMatchingFiles(
    path.resolve(cwd, "docs", "contracts"),
    (entryPath, entryName) => /^validation-proof-record-\d+\.md$/u.test(entryName),
    {
      maxDepth: 1,
      skipDirectories: [],
    },
  );
  const proofRecordDocs = proofRecordPaths
    .map((filePath) => parseProofRecordDoc(filePath))
    .filter(Boolean)
    .sort(sortProofRecordDocs);
  const latestProofHint = readLatestProofPropositionHint(cwd);
  const latestLocalProofPropositionId =
    latestProofHint?.propositionId || proofRecordDocs[0]?.propositionId || null;
  const proofDocsByPropositionId = new Map();

  for (const proofRecordDoc of proofRecordDocs) {
    if (!proofRecordDoc.propositionId) {
      continue;
    }

    const entries = proofDocsByPropositionId.get(proofRecordDoc.propositionId) || [];
    entries.push(proofRecordDoc.path);
    proofDocsByPropositionId.set(proofRecordDoc.propositionId, entries);
  }

  const localProofPropositionCandidates = existingArtifacts.validationProofs.map(
    (artifact) => ({
      backendReleaseReadiness: artifact.backendReleaseReadiness,
      directory: artifact.directory,
      evidenceBundle: artifact.evidenceBundle,
      isLatestDocumentedLocalProof:
        artifact.propositionId === latestLocalProofPropositionId,
      operatorBriefing: artifact.operatorBriefing,
      proofRecordDocs:
        proofDocsByPropositionId.get(artifact.propositionId) || [],
      proofSummary: artifact.proofSummary,
      propositionId: artifact.propositionId,
      publicIntegrityOverview: artifact.publicIntegrityOverview,
      publicSettledResult: artifact.publicSettledResult,
      rewardPayoutSummary: artifact.rewardPayoutSummary,
      validationChainMonitoring: artifact.validationChainMonitoring,
    }),
  );

  localProofPropositionCandidates.sort((left, right) => {
    if (
      left.isLatestDocumentedLocalProof !== right.isLatestDocumentedLocalProof
    ) {
      return left.isLatestDocumentedLocalProof ? -1 : 1;
    }

    return String(right.propositionId).localeCompare(String(left.propositionId));
  });

  return {
    baseUrlCandidates: mergeBaseUrlCandidates(
      collectPreparedClosureBaseUrlCandidates(cwd),
      collectBaseUrlCandidates(existingArtifacts),
    ),
    envFileCandidates: collectEnvFileCandidates(cwd),
    latestLocalProofHintPath: latestProofHint?.path || null,
    latestLocalProofPropositionId,
    localProofPropositionCandidates,
    previousEnvFileCandidates: collectPreviousEnvFileCandidates(cwd),
    proofRecordDocs,
  };
}

function choosePreferredBaseUrlCandidate(discoveredCandidates, externalExecution) {
  const candidates = Array.isArray(discoveredCandidates?.baseUrlCandidates)
    ? discoveredCandidates.baseUrlCandidates.filter(Boolean)
    : [];
  if (candidates.length === 0) {
    return null;
  }

  const nonLocalCandidates = candidates.filter((candidate) => candidate.isLocal !== true);
  if (nonLocalCandidates.length === 0) {
    return candidates[0] || null;
  }

  const externalBaseUrl = classifyUrl(externalExecution?.baseUrl || "").normalized;
  if (externalBaseUrl) {
    const exactMatch = nonLocalCandidates.find(
      (candidate) => classifyUrl(candidate.origin || "").normalized === externalBaseUrl,
    );
    if (exactMatch) {
      return exactMatch;
    }
  }

  const recommended = nonLocalCandidates.find(
    (candidate) => candidate.recommended === true,
  );
  return recommended || nonLocalCandidates[0] || candidates[0] || null;
}

function isLocalOnlyPropositionFallback(
  preparedClosureManifest,
  propositionCandidates,
  propositionId,
) {
  if (!propositionId) {
    return false;
  }

  if (
    preparedClosureManifest?.propositionIdStatus
    !== "local_candidate_only_replace_with_real_staging_proposition"
  ) {
    return false;
  }

  return propositionCandidates.some(
    (candidate) => candidate?.propositionId === propositionId,
  );
}

function summarizeRepoGates(results) {
  const gateMap = new Map();

  for (const result of results) {
    const entry = gateMap.get(result.gateId) || {
      passed: true,
      runCount: 0,
    };
    entry.passed = entry.passed && result.status === 0;
    entry.runCount += 1;
    gateMap.set(result.gateId, entry);
  }

  return {
    allPassed: results.every((result) => result.status === 0),
    gates: Object.fromEntries(
      Array.from(gateMap.entries()).map(([gateId, value]) => [gateId, value]),
    ),
  };
}

function buildTaskStatus(input) {
  const repoGates = input.repoGates;
  const external = input.externalExecution;
  const existingArtifacts = input.existingArtifacts;
  const hasRewardPayoutArtifact = existingArtifacts.validationProofs.some(
    (artifact) => artifact.rewardPayoutSummary !== null,
  );
  const cleanHostIdentityProof = readAcceptedCleanHostIdentityProof(existingArtifacts);

  return {
    N1: {
      blockers:
        repoGates.gates["api:test:identity"]?.passed === true
          ? cleanHostIdentityProof
            ? []
            : ["clean_host_identity_stability_proof_pending"]
          : ["repo_identity_gate_failed"],
      cleanHostIdentityProof,
      localIdentityRunCount: repoGates.gates["api:test:identity"]?.runCount ?? 0,
      status:
        repoGates.gates["api:test:identity"]?.passed === true
          ? cleanHostIdentityProof
            ? "clean_host_verified"
            : "repo_side_verified"
          : "repo_side_failed",
    },
    N2: {
      blockers:
        repoGates.gates["api:test:payout-release"]?.passed === true
          ? ["non_local_payout_execution_proof_pending"]
          : ["repo_payout_release_gate_failed"],
      localRewardPayoutArtifactPresent: hasRewardPayoutArtifact,
      status:
        repoGates.gates["api:test:payout-release"]?.passed === true
          ? "repo_side_verified"
          : "repo_side_failed",
    },
    N3: {
      blockers: external.ready
        ? []
        : external.blockers.filter((blocker) =>
            [
              "release_env_missing",
              "release_env_is_local",
              "rpc_url_missing",
              "rpc_url_is_local",
              "chain_id_is_local",
              "database_url_missing",
              "redis_url_missing",
              "legacy_contract_address_missing",
              "validation_contract_address_missing",
              "reward_payout_token_missing",
            ].includes(blocker),
          ),
      status: external.ready ? "ready_to_execute" : "externally_blocked",
    },
    N4: {
      blockers: external.ready ? [] : external.blockers,
      status: external.ready ? "ready_to_execute" : "externally_blocked",
    },
    N8: {
      blockers: external.ready ? [] : external.blockers,
      status: external.ready ? "ready_to_execute" : "externally_blocked",
    },
    N10: {
      blockers: external.ready ? [] : external.blockers,
      status: external.ready ? "ready_to_execute" : "externally_blocked",
    },
    N11: {
      blockers: external.ready ? [] : external.blockers,
      status: external.ready ? "ready_to_execute" : "externally_blocked",
    },
  };
}

function buildRequiredExternalMaterials(input) {
  const external = input.externalExecution;
  const discoveredCandidates = input.discoveredCandidates || {};
  const preparedClosureManifest = input.preparedClosureManifest || null;
  const preparedClosureCriticalMaterials =
    preparedClosureManifest?.closureCriticalMaterials || {};
  const repoGates = input.repoGates;
  const cleanHostIdentityProof = readAcceptedCleanHostIdentityProof(
    input.existingArtifacts,
  );
  const vercelBypassTokenPresent =
    typeof process.env.VERCEL_PROTECTION_BYPASS_TOKEN === "string"
    && process.env.VERCEL_PROTECTION_BYPASS_TOKEN.trim().length > 0;
  const vercelTrustedOidcTokenPresent =
    typeof process.env.VERCEL_TRUSTED_OIDC_TOKEN === "string"
    && process.env.VERCEL_TRUSTED_OIDC_TOKEN.trim().length > 0;
  const propositionCandidates = Array.isArray(
    discoveredCandidates.localProofPropositionCandidates,
  )
    ? discoveredCandidates.localProofPropositionCandidates.map((candidate) => ({
        isLatestDocumentedLocalProof:
          candidate.isLatestDocumentedLocalProof === true,
        propositionId: candidate.propositionId,
        proofRecordDocs: candidate.proofRecordDocs || [],
      }))
    : [];
  const baseUrlCandidate = choosePreferredBaseUrlCandidate(
    discoveredCandidates,
    external,
  );
  const propositionIdStatus = !external.propositionId
    ? propositionCandidates.length > 0
      ? "candidate_only"
      : "missing"
    : isLocalOnlyPropositionFallback(
      preparedClosureManifest,
      propositionCandidates,
      external.propositionId,
    )
      ? "candidate_only"
      : "present";

  return {
    cleanHostIdentityGate: {
      acceptance:
        "Run pnpm run api:test:identity 5 consecutive times on a clean VM or staging-capable host and archive the logs.",
      id: "clean_host_identity_gate",
      localIdentityRunCount: repoGates.gates["api:test:identity"]?.runCount ?? 0,
      proof: cleanHostIdentityProof,
      status:
        repoGates.gates["api:test:identity"]?.passed === true
          ? cleanHostIdentityProof
            ? "present"
            : "pending_clean_host_proof"
          : "repo_gate_not_green",
      tasks: ["N1"],
      usedByCommands: ["pnpm run api:test:identity"],
    },
    baseUrl: {
      acceptedInputs: [
        "--base-url <https://host>",
        "ARENA_INTERNAL_API_BASE_URL in the current release env file",
      ],
      candidate: baseUrlCandidate,
      envFilePath: external.envFilePath,
      envKey: "ARENA_INTERNAL_API_BASE_URL",
      id: "base_url",
      status: !external.baseUrl
        ? "missing"
        : external.blockers.includes("base_url_is_local")
          ? "invalid_local_value"
          : external.blockers.includes("base_url_deployment_protected")
            ? "deployment_protected_requires_vercel_auth"
          : "present",
      tasks: ["N2", "N4", "N8", "N10", "N11"],
    },
    vercelAccess: {
      acceptedInputs: [
        "VERCEL_PROTECTION_BYPASS_TOKEN for x-vercel-protection-bypass",
        "VERCEL_TRUSTED_OIDC_TOKEN for x-vercel-trusted-oidc-idp-token",
      ],
      baseUrl: external.baseUrl,
      envKeys: ["VERCEL_PROTECTION_BYPASS_TOKEN", "VERCEL_TRUSTED_OIDC_TOKEN"],
      id: "vercel_access",
      status: external.blockers.includes("base_url_deployment_protected")
        ? (vercelBypassTokenPresent || vercelTrustedOidcTokenPresent
          ? "present"
          : "missing")
        : "not_required",
      tasks: ["N2", "N4", "N8", "N10", "N11"],
    },
    operatorToken: {
      acceptedInputs: [
        "--auth-token <operator-token>",
        "ARENA_INTERNAL_OPERATOR_BEARER_TOKEN in the current release env file",
      ],
      envFilePath: external.envFilePath,
      envKey: "ARENA_INTERNAL_OPERATOR_BEARER_TOKEN",
      id: "operator_token",
      status: external.authTokenPresent ? "present" : "missing",
      tasks: ["N2", "N4", "N8", "N10", "N11"],
    },
    databaseUrl: {
      acceptedInputs: [
        "DATABASE_URL in the current release env file",
        "Reachable staging or production-like PostgreSQL connection string",
      ],
      envFilePath: external.envFilePath,
      envKey: "DATABASE_URL",
      id: "database_url",
      status: external.blockers.includes("database_url_missing") ? "missing" : "present",
      tasks: ["N3", "N4", "N10", "N11"],
    },
    redisUrl: {
      acceptedInputs: [
        "REDIS_URL in the current release env file",
        "Reachable staging or production-like Redis connection string",
      ],
      envFilePath: external.envFilePath,
      envKey: "REDIS_URL",
      id: "redis_url",
      status: external.blockers.includes("redis_url_missing") ? "missing" : "present",
      tasks: ["N3", "N4", "N10", "N11"],
    },
    rpcUrl: {
      acceptedInputs: [
        "RPC_URL in the current release env file",
        "Non-local validation-chain RPC endpoint for the target network",
      ],
      envFilePath: external.envFilePath,
      envKey: "RPC_URL",
      id: "rpc_url",
      network: external.validationNetwork,
      status: !external.rpcUrl
        ? "missing"
        : external.blockers.includes("rpc_url_is_local")
          ? "invalid_local_value"
          : "present",
      tasks: ["N2", "N3", "N4"],
    },
    legacyContractAddress: {
      acceptedInputs: [
        "ARENA_CONTRACT_ADDRESS in the current release env file",
        "Real non-local legacy Arena contract address for the selected network",
      ],
      envFilePath: external.envFilePath,
      envKey: "ARENA_CONTRACT_ADDRESS",
      id: "legacy_contract_address",
      status: external.blockers.includes("legacy_contract_address_missing")
        ? "missing"
        : "present",
      tasks: ["N3", "N4"],
    },
    validationContractAddress: {
      acceptedInputs: [
        "ARENA_VALIDATION_CONTRACT_ADDRESS in the current release env file",
        "Real non-local validation contract address for the selected network",
      ],
      envFilePath: external.envFilePath,
      envKey: "ARENA_VALIDATION_CONTRACT_ADDRESS",
      id: "validation_contract_address",
      status: external.blockers.includes("validation_contract_address_missing")
        ? "missing"
        : "present",
      tasks: ["N3", "N4"],
    },
    rewardPayoutToken: {
      acceptedInputs: [
        "ARENA_REWARD_PAYOUT_ERC20_ADDRESS in the current release env file",
        "Real payout asset contract address for the selected network",
      ],
      envFilePath: external.envFilePath,
      envKey: "ARENA_REWARD_PAYOUT_ERC20_ADDRESS",
      id: "reward_payout_token",
      status: external.blockers.includes("reward_payout_token_missing")
        ? "missing"
        : "present",
      tasks: ["N2", "N3", "N4"],
    },
    opsAlertTargets: {
      acceptedInputs: [
        "ARENA_OPS_ALERT_WEBHOOK_TARGETS in the current release env file",
        "Real non-local alert delivery target mappings",
      ],
      envFilePath: external.envFilePath,
      envKey: "ARENA_OPS_ALERT_WEBHOOK_TARGETS",
      id: "ops_alert_targets",
      status: external.blockers.includes("ops_alert_targets_missing")
        ? "missing"
        : "present",
      tasks: ["N8", "N11"],
    },
    propositionId: {
      acceptedInputs: [
        "--proposition-id <id>",
        "Real staging proposition suitable for proof capture and payout follow-through",
      ],
      candidates: propositionCandidates,
      id: "proposition_id",
      status: propositionIdStatus,
      tasks: ["N2", "N4", "N8", "N10", "N11"],
    },
    previousReleaseEnv: {
      acceptedInputs: [
        "--previous-env <path>",
        "Previous release env snapshot or secret export for fingerprint-safe rotation comparison",
      ],
      envFilePath: external.previousEnvPath,
      id: "previous_release_env",
      status:
        external.previousEnvExists === true
          ? "present_file_manual_content_verification_required"
          : "missing",
      tasks: ["N11"],
      usedByCommands: ["pnpm run backend:secrets:rotate:check"],
    },
    validationSignerFunding: preparedClosureCriticalMaterials.validationSignerFunding || {
      description:
        "Signer balances for deploy, operator, oracle, pauser, and payout execution on the selected non-local validation network.",
      id: "validation_signer_funding",
      network: null,
      signerChecks: [],
      status: "unknown",
      tasks: ["N2", "N3", "N4"],
      usedByCommands: [
        "pnpm run validation:deploy",
        "pnpm run validation:preflight",
        "pnpm run validation:chain:check",
      ],
    },
  };
}

function buildManualActionChecklist(input) {
  const requiredExternalMaterials = input.requiredExternalMaterials || {};
  const checklist = [];

  if (requiredExternalMaterials.cleanHostIdentityGate?.status === "pending_clean_host_proof") {
    checklist.push({
      command: "pnpm run api:test:identity",
      details:
        "Archive 5 consecutive green runs on a clean VM or staging-capable host for N1 closure.",
      id: "clean_host_identity_gate",
      tasks: ["N1"],
      title: "Run clean-host identity gate 5 times",
    });
  }

  if (requiredExternalMaterials.validationSignerFunding?.status === "pending_funding") {
    checklist.push({
      details:
        "Provide native token funding before non-local deploy, preflight, or payout follow-through can start.",
      id: "fund_validation_signers",
      network: requiredExternalMaterials.validationSignerFunding.network || null,
      signerChecks: requiredExternalMaterials.validationSignerFunding.signerChecks || [],
      tasks: ["N2", "N3", "N4"],
      title: "Fund validation signers",
    });
  }

  if (requiredExternalMaterials.vercelAccess?.status === "missing") {
    checklist.push({
      details:
        "Provide either VERCEL_PROTECTION_BYPASS_TOKEN or VERCEL_TRUSTED_OIDC_TOKEN so protected staging endpoints can be reached non-interactively.",
      envKeys: requiredExternalMaterials.vercelAccess.envKeys || [],
      id: "vercel_access",
      tasks: ["N2", "N4", "N8", "N10", "N11"],
      title: "Provide Vercel access",
    });
  }

  return checklist;
}

async function captureClosureStatus(options = {}) {
  const cwd = options.cwd || process.cwd();
  const logger = options.logger || { fail, info, pass };
  const envFilePath = path.resolve(cwd, options.envFilePath || ".env");
  const previousEnvPath = options.previousEnvPath
    ? path.resolve(cwd, options.previousEnvPath)
    : "";
  const outputPath =
    options.outputPath ||
    path.resolve(cwd, "validation-local", "closure-status.json");
  const logDir =
    options.logDir || path.resolve(cwd, "validation-local", "closure-logs");
  const validationNetwork =
    String(options.validationNetwork || "validation").trim() || "validation";
  const resume = options.resume === true;
  const identityRuns = Number.isInteger(options.identityRuns)
    ? options.identityRuns
    : Number.parseInt(String(options.identityRuns || DEFAULT_IDENTITY_RUNS), 10);

  if (!Number.isInteger(identityRuns) || identityRuns < 1) {
    logger.fail("Identity runs must be a positive integer.");
    return 1;
  }

  const envResult = readEnvFileValues(envFilePath, cwd);
  const propositionId = String(options.propositionId || "").trim();
  const now = options.now instanceof Date ? options.now : new Date();
  const commandEnv = {
    ...process.env,
    ...(options.env || {}),
  };
  const metadata = resolveMetadata({
    cwd,
    env: commandEnv,
    gitCommitSha: options.gitCommitSha,
    host: options.host,
    pnpmVersion: options.pnpmVersion,
  });
  const runCommand = options.runCommand || defaultRunCommand;
  const commands = buildRepoGateCommands({
    cwd,
    env: commandEnv,
    identityRuns,
  });
  const commandResults = [];

  for (const command of commands) {
    const logPath = path.resolve(logDir, command.logFileName);
    if (resume) {
      const existingResult = readCommandLog(logPath);
      if (existingResult && existingResult.status === 0) {
        logger.info(`Reusing ${command.label} from ${logPath}`);
        commandResults.push(existingResult);
        continue;
      }
    }

    const result = await runCommand(command);
    const startedAt =
      result.startedAt instanceof Date ? result.startedAt : new Date();
    const endedAt =
      result.endedAt instanceof Date ? result.endedAt : new Date();
    const durationMs = endedAt.getTime() - startedAt.getTime();
    writeCommandLog(logPath, {
      command: renderCommand(command),
      durationMs,
      endedAt: endedAt.toISOString(),
      error: result.error,
      gateId: command.gateId,
      label: command.label,
      signal: result.signal,
      startedAt: startedAt.toISOString(),
      status: result.status,
      stderr: result.stderr || "",
      stdout: result.stdout || "",
    });

    commandResults.push({
      command: renderCommand(command),
      durationMs,
      endedAt: endedAt.toISOString(),
      gateId: command.gateId,
      label: command.label,
      logPath,
      startedAt: startedAt.toISOString(),
      status: result.status,
    });
  }

  const runtimeEnv = {
    ...process.env,
    ...envResult.loaded,
  };
  const baseUrl = stripTrailingSlash(
    options.baseUrl ||
      runtimeEnv.ARENA_INTERNAL_API_BASE_URL ||
      runtimeEnv.VITE_API_BASE_URL ||
      "",
  );
  const authToken =
    options.authToken ||
    runtimeEnv.ARENA_INTERNAL_OPERATOR_BEARER_TOKEN ||
    "";
  const baseUrlAccess =
    options.baseUrlAccess || (await probeBaseUrlAccess({
      baseUrl,
      fetchImpl: options.fetchImpl,
    }));
  const repoGates = summarizeRepoGates(commandResults);
  const externalExecution = evaluateExternalExecution({
    authToken,
    baseUrl,
    baseUrlAccess,
    envExists: envResult.exists,
    envFilePath,
    loadedEnv: envResult.loaded,
    previousEnvPath,
    propositionId,
    validationNetwork,
  });
  const existingArtifacts = collectExistingArtifacts(cwd);
  const discoveredCandidates = collectDiscoveredCandidates(cwd, existingArtifacts);
  const preparedClosureManifest = readPreparedClosureManifest(cwd);
  const tasks = buildTaskStatus({
    existingArtifacts,
    externalExecution,
    repoGates,
  });
  const requiredExternalMaterials = buildRequiredExternalMaterials({
    discoveredCandidates,
    existingArtifacts,
    externalExecution,
    preparedClosureManifest,
    repoGates,
  });
  const manualActionChecklist =
    Array.isArray(preparedClosureManifest?.manualActionChecklist)
      ? preparedClosureManifest.manualActionChecklist.filter((item) => {
          if (item?.id !== "clean_host_identity_gate") {
            return true;
          }

          return requiredExternalMaterials.cleanHostIdentityGate?.status === "pending_clean_host_proof";
        })
      : buildManualActionChecklist({
          requiredExternalMaterials,
        });
  const summary = {
    checkedAt: now.toISOString(),
    commandResults,
    cwd,
    discoveredCandidates,
    existingArtifacts,
    externalExecution,
    gitCommitSha: metadata.gitCommitSha,
    host: metadata.host,
    nodeVersion: metadata.nodeVersion,
    pnpmVersion: metadata.pnpmVersion,
    repoGates: {
      allPassed: repoGates.allPassed,
      identityRuns,
      resume,
      status: repoGates.allPassed ? "passed" : "failed",
    },
    manualActionChecklist,
    requiredExternalMaterials,
    taskStatus: tasks,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  logger.info(`Closure summary: ${outputPath}`);
  logger.info(`Host: ${metadata.host}`);
  logger.info(`Commit: ${metadata.gitCommitSha ?? "unknown"}`);
  logger.info(`Repo gates: ${repoGates.allPassed ? "passed" : "failed"}`);
  logger.info(
    `External execution: ${externalExecution.ready ? "ready" : `blocked (${externalExecution.blockers.join(", ")})`}`,
  );

  if (externalExecution.validationDeployCommand) {
    logger.info(`Validation deploy command: ${externalExecution.validationDeployCommand}`);
  }
  if (externalExecution.validationPreflightCommand) {
    logger.info(
      `Validation preflight command: ${externalExecution.validationPreflightCommand}`,
    );
  }
  if (externalExecution.externalEvidenceCommand) {
    logger.info(
      `External evidence command: ${externalExecution.externalEvidenceCommand}`,
    );
  }
  if (discoveredCandidates.latestLocalProofPropositionId) {
    logger.info(
      `Latest local proof proposition candidate: ${discoveredCandidates.latestLocalProofPropositionId}`,
    );
  }
  if (discoveredCandidates.envFileCandidates.length > 0) {
    logger.info(
      `Env file candidates: ${discoveredCandidates.envFileCandidates
        .map((candidate) => `${candidate.path}${candidate.isLocal ? " (local)" : ""}`)
        .join(", ")}`,
    );
  }
  if (discoveredCandidates.previousEnvFileCandidates.length > 0) {
    logger.info(
      `Previous env candidates: ${discoveredCandidates.previousEnvFileCandidates
        .map((candidate) => candidate.path)
        .join(", ")}`,
    );
  }
  if (discoveredCandidates.baseUrlCandidates.length > 0) {
    logger.info(
      `Base URL candidates: ${discoveredCandidates.baseUrlCandidates
        .map((candidate) => `${candidate.origin}${candidate.isLocal ? " (local)" : ""}`)
        .join(", ")}`,
    );
  }
  logger.info(
    `Required external materials: ${[
      requiredExternalMaterials.cleanHostIdentityGate.status,
      requiredExternalMaterials.baseUrl.status,
      requiredExternalMaterials.vercelAccess.status,
      requiredExternalMaterials.operatorToken.status,
      requiredExternalMaterials.databaseUrl.status,
      requiredExternalMaterials.redisUrl.status,
      requiredExternalMaterials.rpcUrl.status,
      requiredExternalMaterials.legacyContractAddress.status,
      requiredExternalMaterials.validationContractAddress.status,
      requiredExternalMaterials.rewardPayoutToken.status,
      requiredExternalMaterials.opsAlertTargets.status,
      requiredExternalMaterials.propositionId.status,
      requiredExternalMaterials.previousReleaseEnv.status,
    ].join(", ")}`,
  );

  if (repoGates.allPassed) {
    logger.pass("Closure status captured with green repo-side gates.");
    return externalExecution.ready ? 0 : 2;
  }

  logger.fail("Closure status captured, but one or more repo-side gates failed.");
  return 1;
}

async function main() {
  const exitCode = await captureClosureStatus(parseArgs(process.argv.slice(2)));
  process.exit(exitCode);
}

if (require.main === module) {
  main().catch((error) => {
    fail(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

module.exports = {
  buildDeployCommand,
  buildExternalEvidenceCommand,
  buildPreflightCommand,
  buildRepoGateCommands,
  buildTaskStatus,
  captureClosureStatus,
  classifyUrl,
  collectExistingArtifacts,
  collectDiscoveredCandidates,
  detectVercelDeploymentProtection,
  evaluateExternalExecution,
  parseArgs,
  probeBaseUrlAccess,
  renderCommand,
  summarizeRepoGates,
  buildRequiredExternalMaterials,
};
