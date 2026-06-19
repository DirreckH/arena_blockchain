#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { ethers } = require("ethers");

const {
  addressFromPrivateKey,
  fail,
  formatFetchFailure,
  info,
  loadEnvFile,
  mergeRequestHeaders,
  normalizeAddress,
  pass,
} = require("./_validation-common.cjs");

function parseCliArgs(argv) {
  const cwd = process.cwd();

  return argv.reduce(
    (options, token, index) => {
      const next = argv[index + 1];

      if (token === "--env-file" && next) {
        options.envFilePath = path.resolve(cwd, next);
      }

      if (token === "--base-url" && next) {
        options.baseUrl = next;
      }

      if (token === "--output" && next) {
        options.outputPath = path.resolve(cwd, next);
      }

      if (token === "--degraded-timeout-ms" && next) {
        options.degradedTimeoutMs = Number(next);
      }

      if (token === "--recovered-timeout-ms" && next) {
        options.recoveredTimeoutMs = Number(next);
      }

      if (token === "--poll-interval-ms" && next) {
        options.pollIntervalMs = Number(next);
      }

      return options;
    },
    {
      envFilePath: path.resolve(cwd, "validation-local", "release-rehearsal.env"),
      baseUrl: "http://127.0.0.1:4000",
      outputPath: path.resolve(
        cwd,
        "validation-local",
        "runtime-contract-operator-proof.json",
      ),
      degradedTimeoutMs: 6 * 60 * 1000,
      recoveredTimeoutMs: 4 * 60 * 1000,
      pollIntervalMs: 15 * 1000,
    },
  );
}

function createCommand(label, command, args, cwd, env) {
  return {
    label,
    command,
    args,
    cwd,
    env,
  };
}

function renderCommand(command) {
  return [command.command, ...command.args].join(" ");
}

function runCommand(command, logger) {
  logger.info(`Running ${command.label}: ${renderCommand(command)}`);
  const result = spawnSync(command.command, command.args, {
    cwd: command.cwd,
    env: command.env,
    stdio: "inherit",
    shell: process.platform === "win32",
    windowsHide: true,
  });

  if (result.status !== 0) {
    throw new Error(`${command.label} failed with exit code ${result.status ?? 1}`);
  }
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function createAuthClient(baseUrl, env, options = {}) {
  let accessToken = null;
  let identity = null;
  const fetchJsonImpl = options.fetchJsonImpl || fetchJson;
  const signMessageImpl =
    options.signMessageImpl ||
    (async (privateKey, message) => new ethers.Wallet(privateKey).signMessage(message));

  async function authenticate() {
    const privateKey = env.ARENA_VALIDATION_OPERATOR_PRIVATE_KEY;
    const walletAddress = normalizeAddress(addressFromPrivateKey(privateKey));
    const challengeResponse = await fetchJsonImpl(`${baseUrl}/auth/challenge`, {
      method: "POST",
      body: {
        walletAddress,
        chainId: Number(env.CHAIN_ID),
      },
      label: "auth challenge",
    });
    const signature = await signMessageImpl(privateKey, challengeResponse.message);
    const verifyResponse = await fetchJsonImpl(`${baseUrl}/auth/verify`, {
      method: "POST",
      body: {
        walletAddress,
        chainId: Number(env.CHAIN_ID),
        signature,
      },
      label: "auth verify",
    });

    accessToken = verifyResponse.accessToken;
    identity = verifyResponse.identity;
    return {
      accessToken,
      identity,
    };
  }

  async function authorizedJson(targetPath) {
    if (!accessToken) {
      await authenticate();
    }

    try {
      return await fetchJsonImpl(`${baseUrl}${targetPath}`, {
        method: "GET",
        token: accessToken,
        label: targetPath,
      });
    } catch (error) {
      if (
        error instanceof HttpError &&
        error.status === 401
      ) {
        await authenticate();
        return fetchJsonImpl(`${baseUrl}${targetPath}`, {
          method: "GET",
          token: accessToken,
          label: targetPath,
        });
      }

      throw error;
    }
  }

  return {
    authenticate,
    authorizedJson,
    getIdentity() {
      return identity;
    },
  };
}

class HttpError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.payload = payload;
  }
}

async function fetchJson(url, input) {
  const response = await fetchJsonResponse(url, input);

  if (!response.ok) {
    throw new HttpError(
      `${input.label} returned ${response.status}`,
      response.status,
      response.payload,
    );
  }

  return response.payload;
}

async function fetchJsonResponse(url, input) {
  const fetchImpl = input.fetchImpl || fetch;
  const response = await fetchImpl(url, {
    method: input.method,
    headers: mergeRequestHeaders({
      "content-type": "application/json",
      ...(input.token
        ? {
            authorization: `Bearer ${input.token}`,
          }
        : {}),
    }, url, input),
    body: input.body ? JSON.stringify(input.body) : undefined,
  }).catch((error) => {
    throw new Error(
      formatFetchFailure(error, {
        url,
        label: input.label,
      }),
    );
  });

  const rawText = await response.text();
  const payload = rawText.length > 0 ? JSON.parse(rawText) : null;

  return {
    ok: response.ok,
    status: response.status,
    payload,
  };
}

async function fetchReadinessSnapshot(baseUrl) {
  return fetchReadinessSnapshotWithFetch(baseUrl, fetch);
}

async function fetchReadinessSnapshotWithFetch(baseUrl, fetchImpl) {
  const response = await fetchJsonResponse(`${baseUrl}/health/ready`, {
    method: "GET",
    label: "health ready",
    fetchImpl,
  });

  if (response.ok) {
    return response.payload;
  }

  if (
    response.status === 503 &&
    response.payload &&
    typeof response.payload === "object" &&
    response.payload.error &&
    typeof response.payload.error === "object" &&
    response.payload.error.details
  ) {
    return response.payload.error.details;
  }

  throw new HttpError(
    "health ready returned an unexpected response",
    response.status,
    response.payload,
  );
}

async function waitForState(label, timeoutMs, pollIntervalMs, probe) {
  const startedAt = Date.now();
  let lastSnapshot = null;

  while (Date.now() - startedAt <= timeoutMs) {
    try {
      lastSnapshot = await probe();
      if (lastSnapshot.done) {
        return lastSnapshot;
      }
    } catch (error) {
      lastSnapshot = {
        done: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    await sleep(pollIntervalMs);
  }

  const error = new Error(`Timed out waiting for ${label}`);
  error.lastSnapshot = lastSnapshot;
  throw error;
}

function summarizeRuntimeContract(snapshot) {
  const schedulerQueue =
    snapshot?.health?.queues?.queues?.find((queue) => queue.name === "scheduler") ??
    null;
  const readinessDependency =
    snapshot?.health?.readiness?.dependencies?.find(
      (dependency) => dependency.name === "scheduler_queue",
    ) ?? null;

  return {
    status: snapshot?.status ?? null,
    generatedAt: snapshot?.generatedAt ?? null,
    releaseReadiness: snapshot?.releaseReadiness ?? null,
    schedulerQueue: schedulerQueue
      ? {
          status: schedulerQueue.status,
          paused: schedulerQueue.paused,
          details: schedulerQueue.details ?? null,
          worker: schedulerQueue.worker ?? null,
        }
      : null,
    readinessDependency,
    releaseChecklist: Array.isArray(snapshot?.releaseChecklist)
      ? snapshot.releaseChecklist.map((item) => ({
          id: item.id,
          status: item.status,
          blockingDependencies: item.blockingDependencies,
          operatorActions: item.operatorActions,
        }))
      : [],
    recentAlerts: Array.isArray(snapshot?.recentAlerts)
      ? snapshot.recentAlerts.map((alert) => ({
          action: alert.action,
          reason: alert.reason,
          createdAt: alert.createdAt,
          metadata: alert.metadata,
        }))
      : [],
  };
}

function buildPropositionFollowUpCommand(scriptName, envFilePath, baseUrl) {
  return [
    "pnpm run",
    scriptName,
    "--",
    "--proposition-id",
    "<id>",
    "--env-file",
    envFilePath,
    "--base-url",
    baseUrl,
    "--auth-token",
    "<operator-token>",
  ].join(" ");
}

async function captureRuntimeContractOperatorMonitoringProof(options = {}) {
  const cwd = options.cwd || process.cwd();
  const logger = options.logger || { fail, info, pass };
  const loadEnvFileImpl = options.loadEnvFileImpl || loadEnvFile;
  const runCommandImpl = options.runCommandImpl || runCommand;
  const fetchImpl = options.fetchImpl || fetch;
  const waitForStateImpl = options.waitForStateImpl || waitForState;
  const envFilePath =
    options.envFilePath ||
    path.resolve(cwd, "validation-local", "release-rehearsal.env");

  if (!fs.existsSync(envFilePath)) {
    logger.fail(
      `Release rehearsal env file not found at ${envFilePath}. Run pnpm run backend:release:env:prepare first.`,
    );
    return 1;
  }

  const loadedEnv = loadEnvFileImpl(envFilePath, { override: true }).loaded;
  const composeEnvFilePath = envFilePath.replace(/\\/gu, "/");
  const baseUrl = options.baseUrl || "http://127.0.0.1:4000";
  const dockerComposeEnv = {
    ...process.env,
    ARENA_ENV_FILE: composeEnvFilePath,
  };
  const composeArgs = [
    "compose",
    "--env-file",
    composeEnvFilePath,
    "-f",
    "docker-compose.prod.yml",
  ];
  const authClient = createAuthClient(baseUrl, loadedEnv, {
    fetchJsonImpl: (url, input) =>
      fetchJson(url, {
        ...input,
        fetchImpl,
      }),
    signMessageImpl: options.signMessageImpl,
  });

  runCommandImpl(
    createCommand(
      "docker:compose:up",
      "docker",
      [...composeArgs, "up", "-d", "--no-deps", "api", "scheduler-worker", "nginx"],
      cwd,
      dockerComposeEnv,
    ),
    logger,
  );

  await waitForStateImpl(
    "api live startup",
    3 * 60 * 1000,
    options.pollIntervalMs ?? 15 * 1000,
    async () => {
      const healthLive = await fetchJson(`${baseUrl}/health/live`, {
        method: "GET",
        label: "health live",
        fetchImpl,
      });

      return {
        done: healthLive.status === "ok",
        healthLive,
      };
    },
  );

  await waitForStateImpl(
    "initial readiness recovery",
    3 * 60 * 1000,
    options.pollIntervalMs ?? 15 * 1000,
    async () => {
      const healthReady = await fetchReadinessSnapshotWithFetch(baseUrl, fetchImpl);

      return {
        done: healthReady.status === "ok",
        healthReady,
      };
    },
  );

  const authIdentity = (await authClient.authenticate()).identity;
  const initialRuntimeContract = await authClient.authorizedJson(
    "/arena/internal/monitoring/runtime-contract",
  );
  const initialReady = await fetchReadinessSnapshotWithFetch(baseUrl, fetchImpl);

  runCommandImpl(
    createCommand(
      "docker:compose:stop:scheduler-worker",
      "docker",
      [...composeArgs, "stop", "scheduler-worker"],
      cwd,
      dockerComposeEnv,
    ),
    logger,
  );

  const degraded = await waitForStateImpl(
    "scheduler worker degradation proof",
    options.degradedTimeoutMs ?? 6 * 60 * 1000,
    options.pollIntervalMs ?? 15 * 1000,
    async () => {
      const healthReady = await fetchReadinessSnapshotWithFetch(baseUrl, fetchImpl);
      const runtimeContract = await authClient.authorizedJson(
        "/arena/internal/monitoring/runtime-contract",
      );
      const summary = summarizeRuntimeContract(runtimeContract);
      const hasBlockedAlert = summary.recentAlerts.some(
        (alert) => alert.action === "runtime_contract.alert.release_blocked",
      );

      return {
        done:
          healthReady.status !== "ok" &&
          summary.releaseReadiness?.status === "blocked" &&
          summary.schedulerQueue?.status === "down" &&
          hasBlockedAlert,
        healthReady,
        runtimeContract: summary,
      };
    },
  );

  runCommandImpl(
    createCommand(
      "docker:compose:restart:scheduler-worker",
      "docker",
      [...composeArgs, "up", "-d", "--no-deps", "scheduler-worker"],
      cwd,
      dockerComposeEnv,
    ),
    logger,
  );

  const recovered = await waitForStateImpl(
    "scheduler worker recovery proof",
    options.recoveredTimeoutMs ?? 4 * 60 * 1000,
    options.pollIntervalMs ?? 15 * 1000,
    async () => {
      const healthReady = await fetchReadinessSnapshotWithFetch(baseUrl, fetchImpl);
      const runtimeContract = await authClient.authorizedJson(
        "/arena/internal/monitoring/runtime-contract",
      );
      const summary = summarizeRuntimeContract(runtimeContract);
      const hasReadyAlert = summary.recentAlerts.some(
        (alert) => alert.action === "runtime_contract.alert.release_ready",
      );

      return {
        done:
          healthReady.status === "ok" &&
          summary.releaseReadiness?.status === "ready" &&
          summary.schedulerQueue?.status === "up" &&
          hasReadyAlert,
        healthReady,
        runtimeContract: summary,
      };
    },
  );

  const outputPath =
    options.outputPath ||
    path.resolve(cwd, "validation-local", "runtime-contract-operator-proof.json");
  const proof = {
    checkedAt: new Date().toISOString(),
    baseUrl,
    operatorIdentity: authIdentity,
    envFilePath,
    initial: {
      healthReady: initialReady,
      runtimeContract: summarizeRuntimeContract(initialRuntimeContract),
    },
    degraded: {
      healthReady: degraded.healthReady,
      runtimeContract: degraded.runtimeContract,
    },
    recovered: {
      healthReady: recovered.healthReady,
      runtimeContract: recovered.runtimeContract,
    },
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(proof, null, 2)}\n`);

  logger.info(`Operator identity: ${authIdentity.walletAddress}`);
  logger.info(`Operator roles: ${authIdentity.roles.join(", ")}`);
  logger.info(
    `Degraded release status: ${proof.degraded.runtimeContract.releaseReadiness?.status}`,
  );
  logger.info(
    `Recovered release status: ${proof.recovered.runtimeContract.releaseReadiness?.status}`,
  );
  logger.info(`Proof artifact: ${outputPath}`);
  logger.info(
    `Next: archive ${outputPath} alongside the matching proposition-scoped validation evidence set, then rerun proposition proof closure with:`,
  );
  logger.info(
    `  ${buildPropositionFollowUpCommand(
      "validation:ops:brief",
      envFilePath,
      baseUrl,
    )}`,
  );
  logger.info(
    `  ${buildPropositionFollowUpCommand(
      "validation:proof:capture",
      envFilePath,
      baseUrl,
    )}`,
  );
  logger.pass(
    "Runtime-contract operator monitoring proof captured across degraded and recovered scheduler-worker states.",
  );
  return 0;
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2));
  const exitCode = await captureRuntimeContractOperatorMonitoringProof(options);
  process.exit(exitCode);
}

if (require.main === module) {
  main().catch((error) => {
    fail(error instanceof Error ? error.message : String(error));
    if (error && typeof error === "object" && error.lastSnapshot) {
      info(`Last snapshot: ${JSON.stringify(error.lastSnapshot, null, 2)}`);
    }
    process.exit(1);
  });
}

module.exports = {
  captureRuntimeContractOperatorMonitoringProof,
  parseCliArgs,
};
