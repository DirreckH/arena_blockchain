#!/usr/bin/env node

const { spawn, spawnSync } = require("node:child_process");
const path = require("node:path");

const {
  fail,
  info,
  loadEnvFile,
  pass,
} = require("./_validation-common.cjs");
const { prepareReleaseRehearsalEnv } = require("./prepare-release-rehearsal-env.cjs");
const {
  emitLocalRemediation,
  inspectContainerRuntime,
  inspectRuntimeDependencies,
} = require("./check-validation-runtime-deps.cjs");

async function prepareValidationLocal(options = {}) {
  const cwd = options.cwd || process.cwd();
  const logger = options.logger || { fail, info, pass };

  loadEnvFile(path.resolve(cwd, ".env"), { override: true });
  Object.assign(process.env, options.env || {});

  const runCommand = options.runCommand || defaultRunCommand;
  const startBackgroundCommand =
    options.startBackgroundCommand || defaultStartBackgroundCommand;
  const isRpcReachable = options.isRpcReachable || defaultIsRpcReachable;
  const inspectRuntimeDependenciesFn =
    options.inspectRuntimeDependencies || inspectRuntimeDependencies;
  const inspectContainerRuntimeFn =
    options.inspectContainerRuntime || inspectContainerRuntime;
  const prepareReleaseRehearsalEnvFn =
    options.prepareReleaseRehearsalEnv || prepareReleaseRehearsalEnv;
  const rpcPollIntervalMs = options.rpcPollIntervalMs ?? 1500;
  const rpcReadyTimeoutMs = options.rpcReadyTimeoutMs ?? 60_000;

  const bootstrapResult = await runCommand(
    createCommand({
      label: "validation:bootstrap:local",
      command: "pnpm",
      args: ["run", "validation:bootstrap:local"],
      cwd,
      env: process.env,
    }),
  );
  if (!isSuccess(bootstrapResult)) {
    return 1;
  }

  const depsUpResult = await runCommand(
    createCommand({
      label: "deps:up",
      command: "pnpm",
      args: ["run", "deps:up"],
      cwd,
      env: process.env,
    }),
  );
  if (!isSuccess(depsUpResult)) {
    logger.info(
      "Local dependency startup failed; running validation dependency diagnostics for exact remediation.",
    );
    const dependencyInspection = await inspectRuntimeDependenciesFn({
      env: process.env,
    });

    emitDependencyDiagnostics(logger, dependencyInspection.results, {
      env: process.env,
      inspectContainerRuntime: inspectContainerRuntimeFn,
    });

    const failedNames = new Set(dependencyInspection.failedNames);
    const onlyRpcMissing =
      failedNames.size === 1 && failedNames.has("rpc");

    if (dependencyInspection.ok) {
      logger.info(
        "Dependency diagnostics passed even though deps:up failed, so local services already appear reachable and bring-up can continue.",
      );
    } else if (onlyRpcMissing) {
      logger.info(
        "Dependency diagnostics show storage services are already reachable and only the local RPC is still missing, so bring-up can continue and try to start Hardhat automatically.",
      );
    } else {
      return 1;
    }
  }

  const compileResult = await runCommand(
    createCommand({
      label: "hardhat:compile",
      command: "pnpm",
      args: ["exec", "hardhat", "compile"],
      cwd,
      env: process.env,
    }),
  );
  if (!isSuccess(compileResult)) {
    return 1;
  }

  const rpcWasReachable = await isRpcReachable({
    env: process.env,
    cwd,
  });

  if (!rpcWasReachable) {
    const hardhatNodeResult = await startBackgroundCommand(
      createCommand({
        label: "hardhat:node",
        command: "pnpm",
        args: ["exec", "hardhat", "node"],
        cwd,
        env: process.env,
      }),
    );

    if (!hardhatNodeResult || hardhatNodeResult.started !== true) {
      logger.fail(
        "Unable to start a local Hardhat RPC automatically. Start `pnpm exec hardhat node` in another terminal and rerun `pnpm run validation:prepare:local`.",
      );
      return 1;
    }

    const rpcNowReachable = await waitForRpcReachable({
      env: process.env,
      cwd,
      isRpcReachable,
      pollIntervalMs: rpcPollIntervalMs,
      timeoutMs: rpcReadyTimeoutMs,
    });

    if (!rpcNowReachable.ok) {
      logger.fail(
        "Local Hardhat RPC still looks unavailable after startup. Wait for the node to finish booting, then rerun `pnpm run validation:prepare:local`.",
      );
      return 1;
    }
  }

  const rewardPayoutTokenResult = await runCommand(
    createCommand({
      label: "validation:reward-payout:deploy",
      command: "pnpm",
      args: ["run", "validation:reward-payout:deploy"],
      cwd,
      env: process.env,
    }),
  );
  if (!isSuccess(rewardPayoutTokenResult)) {
    return 1;
  }

  const chainCheckResult = await runCommand(
    createCommand({
      label: "validation:chain:check",
      command: "pnpm",
      args: ["run", "validation:chain:check"],
      cwd,
      env: process.env,
    }),
  );

  if (!isSuccess(chainCheckResult)) {
    logger.info(
      "Validation chain check is not healthy yet; redeploying the local validation contract before full preflight.",
    );
    const deployResult = await runCommand(
      createCommand({
        label: "validation:deploy",
        command: "pnpm",
        args: [
          "run",
          "validation:deploy",
          "--",
          "--network",
          "localhost",
        ],
        cwd,
        env: process.env,
      }),
    );

    if (!isSuccess(deployResult)) {
      return 1;
    }
  } else {
    logger.pass(
      "Existing local validation deployment already passed chain checks; reusing it.",
    );
  }

  const preflightResult = await runCommand(
    createCommand({
      label: "validation:preflight",
      command: "pnpm",
      args: ["run", "validation:preflight"],
      cwd,
      env: process.env,
    }),
  );
  if (!isSuccess(preflightResult)) {
    return 1;
  }

  const dbDeployResult = await runCommand(
    createCommand({
      label: "validation:db:deploy",
      command: "pnpm",
      args: ["run", "validation:db:deploy"],
      cwd,
      env: process.env,
    }),
  );
  if (!isSuccess(dbDeployResult)) {
    return 1;
  }

  const dbStatusResult = await runCommand(
    createCommand({
      label: "validation:db:status",
      command: "pnpm",
      args: ["run", "validation:db:status"],
      cwd,
      env: process.env,
    }),
  );
  if (!isSuccess(dbStatusResult)) {
    return 1;
  }

  const releaseRehearsalEnvResult = await prepareReleaseRehearsalEnvFn({ cwd });
  if (!releaseRehearsalEnvResult || releaseRehearsalEnvResult.ok !== true) {
    logger.fail(
      `Unable to refresh validation-local/release-rehearsal.env at ${path.resolve(cwd, "validation-local", "release-rehearsal.env")}. Fix the release rehearsal env source values and rerun pnpm run validation:prepare:local.`,
    );
    return 1;
  }

  logger.pass(
    "Local validation rehearsal runtime is prepared. Next: start the API and exercise the proposition -> chain -> sync flow.",
  );
  return 0;
}

function createCommand(command) {
  return command;
}

function isSuccess(result) {
  return !!result && result.status === 0;
}

async function defaultIsRpcReachable({ env }) {
  const url = env.RPC_URL;
  if (!url) {
    return false;
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: 1,
        jsonrpc: "2.0",
        method: "eth_chainId",
        params: [],
      }),
    });

    return response.ok;
  } catch {
    return false;
  }
}

async function waitForRpcReachable({
  env,
  cwd,
  isRpcReachable,
  pollIntervalMs,
  timeoutMs,
}) {
  const deadline = Date.now() + timeoutMs;
  let attempts = 0;

  while (Date.now() <= deadline) {
    attempts += 1;
    if (await isRpcReachable({ env, cwd })) {
      return {
        ok: true,
        attempts,
      };
    }

    if (Date.now() + pollIntervalMs > deadline) {
      break;
    }

    await sleep(pollIntervalMs);
  }

  return {
    ok: false,
    attempts,
  };
}

function emitDependencyDiagnostics(logger, results) {
  const options = arguments[2] || {};

  for (const result of results) {
    if (result.ok) {
      logger.pass(`${result.name}: ${result.message}`);
    } else {
      logger.fail(`${result.name}: ${result.message}`);
    }
  }
  emitLocalRemediation(results, {
    env: options.env || process.env,
    inspectContainerRuntime: options.inspectContainerRuntime,
    logger,
  });
}

function sleep(durationMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

function defaultRunCommand(command) {
  info(`Running ${command.label}: ${renderCommand(command)}`);
  const result = spawnSync(command.command, command.args, {
    cwd: command.cwd,
    env: command.env,
    stdio: "inherit",
    shell: process.platform === "win32",
    windowsHide: true,
  });

  return {
    status: typeof result.status === "number" ? result.status : 1,
  };
}

function defaultStartBackgroundCommand(command) {
  info(`Starting ${command.label}: ${renderCommand(command)}`);

  try {
    const child = spawn(command.command, command.args, {
      cwd: command.cwd,
      env: command.env,
      stdio: "ignore",
      detached: process.platform !== "win32",
      shell: process.platform === "win32",
      windowsHide: true,
    });

    child.unref();

    return {
      started: true,
      pid: child.pid || null,
    };
  } catch (error) {
    return {
      started: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function renderCommand(command) {
  return [command.command, ...command.args].join(" ");
}

async function main() {
  const exitCode = await prepareValidationLocal();
  process.exit(exitCode);
}

if (require.main === module) {
  main().catch((error) => {
    fail(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

module.exports = {
  prepareValidationLocal,
};

