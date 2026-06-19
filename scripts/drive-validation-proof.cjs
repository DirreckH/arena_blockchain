#!/usr/bin/env node

// Drives ONE proposition through the full local validation rehearsal lifecycle
// so that `pnpm run validation:proof:capture --proposition-id <id>` can turn all
// four verdicts green:
//   1. backend releaseReadiness.status=ready
//   2. internal proposition rehearsal status=ready
//   3. proposition visible in GET /arena/public/results/settled
//   4. proposition visible in GET /arena/public/integrity/overview?propositionId=<id>

const path = require("node:path");
const { ethers } = require("ethers");

const { fail, info, loadEnvFile, pass } = require("./_validation-common.cjs");

const POLL_INTERVAL_MS = 5000;
const LIVE_TIMEOUT_MS = 150000;
const CHAIN_LIVE_TIMEOUT_MS = 120000;
const SETTLE_TIMEOUT_MS = 360000;
const MIN_BET_AMOUNT = "10";
const STAKE_AMOUNT = "10";
const SELECTED_OPTION = 0;
const MIN_DURATION_SECONDS = 150;
const MAX_DURATION_SECONDS = 3600;

function nowIso(nowFn = Date.now) {
  return new Date(nowFn()).toISOString();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseCliArgs(argv) {
  const options = {
    baseUrl: "",
    cwd: process.cwd(),
    envFilePath: path.resolve(process.cwd(), ".env"),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--env-file") {
      options.envFilePath = path.resolve(process.cwd(), argv[index + 1]);
      index += 1;
      continue;
    }

    if (argument === "--base-url") {
      options.baseUrl = String(argv[index + 1] || "").trim();
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

async function mineQuietBlock(provider) {
  try {
    await provider.send("evm_mine", []);
  } catch {
    // Best effort only.
  }
}

function createApi({ baseUrl, token, fetchImpl }) {
  const root = String(baseUrl).replace(/\/+$/u, "");
  const effectiveFetch = fetchImpl || fetch;

  async function call(method, route, body) {
    const url = `${root}${route}`;
    let response;
    try {
      response = await effectiveFetch(url, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (error) {
      throw new Error(
        `${method} ${route} failed to connect: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const text = typeof response.text === "function" ? await response.text() : "";
    let parsed = null;
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }

    return {
      ok: response.ok,
      status: response.status,
      body: parsed,
    };
  }

  return {
    get: (route) => call("GET", route),
    post: (route, body) => call("POST", route, body),
  };
}

async function expectOk(promise, label) {
  const result = await promise;
  if (!result.ok) {
    throw new Error(
      `${label} -> HTTP ${result.status}: ${typeof result.body === "string" ? result.body : JSON.stringify(result.body)}`,
    );
  }

  return result.body;
}

async function nudge(api, route, label, logger) {
  try {
    const result = await api.post(route, { reason: "validation_rehearsal.drive" });
    if (result.ok) {
      logger.info(`${label}: ok`);
    } else {
      logger.info(`${label}: skipped (HTTP ${result.status})`);
    }
  } catch (error) {
    logger.info(
      `${label}: skipped (${error instanceof Error ? error.message : String(error)})`,
    );
  }
}

function createRequiredEnvEntries(envSource) {
  return [
    ["ARENA_INTERNAL_OPERATOR_BEARER_TOKEN", envSource.ARENA_INTERNAL_OPERATOR_BEARER_TOKEN || ""],
    ["RPC_URL", envSource.RPC_URL || ""],
    ["CHAIN_ID", envSource.CHAIN_ID || ""],
    [
      "ARENA_VALIDATION_OPERATOR_PRIVATE_KEY",
      envSource.ARENA_VALIDATION_OPERATOR_PRIVATE_KEY || "",
    ],
    [
      "ARENA_VALIDATION_CONTRACT_ADDRESS",
      envSource.ARENA_VALIDATION_CONTRACT_ADDRESS || "",
    ],
  ];
}

async function runValidationProofDrive(options = {}) {
  const cwd = options.cwd || process.cwd();
  const logger = options.logger || { fail, info, pass };
  const envFilePath = options.envFilePath || path.resolve(cwd, ".env");
  const loadEnvFileImpl = options.loadEnvFileImpl || loadEnvFile;
  const loadedEnv = loadEnvFileImpl(envFilePath, { override: true }) || {
    envPath: envFilePath,
    exists: false,
    loaded: {},
  };
  const envSource = {
    ...process.env,
    ...(loadedEnv.loaded || {}),
    ...(options.env || {}),
  };
  const baseUrl =
    String(options.baseUrl || "").trim() ||
    envSource.ARENA_INTERNAL_API_BASE_URL ||
    envSource.VITE_API_BASE_URL ||
    "http://127.0.0.1:4000";
  const token = String(envSource.ARENA_INTERNAL_OPERATOR_BEARER_TOKEN || "").trim();
  const rpcUrl = String(envSource.RPC_URL || "http://127.0.0.1:8545").trim();
  const chainId = Number(envSource.CHAIN_ID || 0);
  const operatorKey = String(
    envSource.ARENA_VALIDATION_OPERATOR_PRIVATE_KEY || "",
  ).trim();
  const contractAddress = String(
    envSource.ARENA_VALIDATION_CONTRACT_ADDRESS || "",
  ).trim();
  const fetchImpl = options.fetchImpl || fetch;
  const providerFactory =
    options.providerFactory ||
    ((currentRpcUrl) => new ethers.providers.JsonRpcProvider(currentRpcUrl));
  const walletFactory =
    options.walletFactory ||
    ((privateKey, provider) => new ethers.Wallet(privateKey, provider));
  const bigNumberFrom = options.bigNumberFrom || ethers.BigNumber.from;
  const sleepFn = options.sleepFn || sleep;
  const nowFn = options.nowFn || Date.now;

  for (const [name, value] of createRequiredEnvEntries(envSource)) {
    if (!value) {
      logger.fail(
        `Missing required env value: ${name}. Run pnpm run validation:bootstrap:local first.`,
      );
      return 1;
    }
  }

  const api = createApi({ baseUrl, token, fetchImpl });
  const provider = providerFactory(rpcUrl, {
    chainId,
    contractAddress,
    envFilePath,
  });
  const wallet = walletFactory(operatorKey, provider, {
    chainId,
    contractAddress,
    envFilePath,
  });
  const operatorAddress = String(wallet.address || "").toLowerCase();

  logger.info(`API base: ${baseUrl}`);
  logger.info(`RPC: ${rpcUrl} (chainId ${chainId})`);
  logger.info(`Operator wallet (== JWT sub == bettor): ${operatorAddress}`);

  const health = await api.get("/health/ready");
  if (!health.ok) {
    logger.fail(
      `Backend /health/ready not ok (HTTP ${health.status}). Start it with pnpm run backend:prepare:local.`,
    );
    return 1;
  }
  logger.info("Backend /health/ready: ok");

  try {
    const net = await provider.getNetwork();
    logger.info(`RPC reachable, chainId ${net.chainId}`);
  } catch (error) {
    logger.fail(
      `RPC unreachable: ${error instanceof Error ? error.message : String(error)}`,
    );
    return 1;
  }

  const draft = await expectOk(
    api.post("/arena/propositions/drafts", {
      title: `Rehearsal proof ${new Date(nowFn()).toISOString().slice(0, 19)}`,
      summary: "Local validation rehearsal proof proposition.",
      optionA: "Yes",
      optionB: "No",
      marketEnabled: true,
      minEffectiveSample: 1,
      minBetAmount: MIN_BET_AMOUNT,
      minDurationSeconds: MIN_DURATION_SECONDS,
      maxDurationSeconds: MAX_DURATION_SECONDS,
    }),
    "create draft",
  );
  const propositionId = draft.propositionId || draft.id;
  if (!propositionId) {
    logger.fail(`Draft created but no propositionId in response: ${JSON.stringify(draft)}`);
    return 1;
  }
  logger.pass(`PROPOSITION_ID=${propositionId}`);

  await expectOk(api.post(`/arena/propositions/drafts/${propositionId}/submit`, {}), "submit draft");
  logger.info("Draft submitted (status -> submitted).");

  await expectOk(
    api.post(`/arena/internal/propositions/${propositionId}/approve`, {
      publishedAt: nowIso(nowFn),
      reason: "validation rehearsal proof",
    }),
    "approve proposition",
  );
  logger.info("Proposition approved (status -> scheduled, publishedAt = now).");

  logger.info("Waiting for scheduler to promote scheduled -> live and project the chain market...");
  const liveDeadline = Date.now() + LIVE_TIMEOUT_MS + CHAIN_LIVE_TIMEOUT_MS;
  let market = null;
  let nudgedCreate = false;
  while (Date.now() < liveDeadline) {
    await mineQuietBlock(provider);
    await nudge(api, "/arena/internal/validation-chain/sync", "sync", logger);
    const markets = await api.get("/arena/validation/markets");
    if (markets.ok && Array.isArray(markets.body)) {
      market = markets.body.find((item) => item.propositionId === propositionId) || null;
    }

    if (market) {
      const readiness = market.executionReadiness || {};
      const chainStatus = readiness.chainStatus;
      logger.info(
        `market ${market.marketId}: status=${market.marketStatus} chainStatus=${chainStatus ?? "null"} ready=${readiness.ready === true}`,
      );

      if (!nudgedCreate && (chainStatus === null || chainStatus === undefined)) {
        await nudge(
          api,
          `/arena/internal/validation-chain/propositions/${propositionId}/create-market`,
          "create-market",
          logger,
        );
        await nudge(
          api,
          `/arena/internal/validation-chain/propositions/${propositionId}/open-market`,
          "open-market",
          logger,
        );
        nudgedCreate = true;
      } else if (chainStatus === "created" || chainStatus === "pre_live") {
        await nudge(
          api,
          `/arena/internal/validation-chain/propositions/${propositionId}/open-market`,
          "open-market",
          logger,
        );
      }

      if (readiness.ready === true || chainStatus === "live") {
        break;
      }
    }

    await sleepFn(POLL_INTERVAL_MS);
  }

  if (
    !market ||
    !(
      market.executionReadiness &&
      (market.executionReadiness.ready === true ||
        market.executionReadiness.chainStatus === "live")
    )
  ) {
    logger.fail(
      `Chain market never became live for proposition ${propositionId}. Last market: ${JSON.stringify(market)}`,
    );
    return 1;
  }

  const marketId = market.marketId;
  logger.pass(`Chain market live. marketId=${marketId}`);

  await expectOk(
    api.post(`/arena/internal/propositions/${propositionId}/dispatch`, {
      userIds: [operatorAddress],
      assignedAt: nowIso(nowFn),
      expiresAt: new Date(nowFn() + 3600 * 1000).toISOString(),
    }),
    "dispatch task",
  );
  logger.info("Dispatched adjudication task to operator user.");

  let taskId = null;
  for (let index = 0; index < 6 && !taskId; index += 1) {
    const tasks = await api.get("/arena/adjudication/tasks");
    if (tasks.ok && Array.isArray(tasks.body)) {
      const task = tasks.body.find((item) => item.propositionId === propositionId);
      if (task) {
        taskId = task.taskId;
      }
    }
    if (!taskId) {
      await sleepFn(2000);
    }
  }

  if (!taskId) {
    logger.fail("Dispatched task did not appear in GET /arena/adjudication/tasks.");
    return 1;
  }
  logger.info(`taskId=${taskId}`);

  const responseResult = await expectOk(
    api.post(`/arena/adjudication/tasks/${taskId}/responses`, {
      propositionId,
      selectedOption: SELECTED_OPTION,
      confirmationOption: SELECTED_OPTION,
      clientStartedAt: nowIso(nowFn),
      clientSubmittedAt: nowIso(nowFn),
      understandingAck: true,
      submittedAt: nowIso(nowFn),
    }),
    "submit response",
  );
  const responseId = responseResult.responseId;
  if (!responseId) {
    logger.fail(`Response submitted but no responseId: ${JSON.stringify(responseResult)}`);
    return 1;
  }
  logger.info(`responseId=${responseId}`);

  await expectOk(
    api.post(`/arena/internal/responses/${responseId}/review`, {
      reviewedAt: nowIso(nowFn),
    }),
    "review response",
  );
  logger.info("Response reviewed (counts toward effective sample).");

  const prepare = await expectOk(
    api.post(`/arena/validation/markets/${marketId}/bets/prepare`, {
      propositionId,
      selectedOption: SELECTED_OPTION,
      stakeAmount: STAKE_AMOUNT,
      placedAt: nowIso(nowFn),
    }),
    "prepare bet",
  );
  const transaction = prepare.transaction;
  logger.info(
    `Prepared placeBet tx -> to=${transaction.to} value=${transaction.value} chainMarketId=${transaction.chainMarketId}`,
  );

  const sent = await wallet.sendTransaction({
    to: transaction.to,
    data: transaction.data,
    value: bigNumberFrom(transaction.value),
  });
  logger.info(`placeBet tx sent: ${sent.hash}`);
  const receipt = await sent.wait(1);
  if (receipt.status !== 1) {
    logger.fail(`placeBet tx reverted: ${sent.hash}`);
    return 1;
  }
  logger.pass(`placeBet confirmed in block ${receipt.blockNumber}`);
  await mineQuietBlock(provider);

  await expectOk(
    api.post(`/arena/validation/markets/${marketId}/bets/confirm`, {
      propositionId,
      selectedOption: SELECTED_OPTION,
      stakeAmount: STAKE_AMOUNT,
      placedAt: nowIso(nowFn),
      txHash: sent.hash,
    }),
    "confirm bet",
  );
  logger.info("Bet confirmed and local position recorded.");
  await nudge(api, "/arena/internal/validation-chain/sync", "sync (project BetPlaced)", logger);

  logger.info("Waiting for scheduler to freeze/reveal/resolve/settle. This spans several cron ticks...");
  const settleDeadline = Date.now() + SETTLE_TIMEOUT_MS;
  let settled = false;
  while (Date.now() < settleDeadline) {
    await mineQuietBlock(provider);
    await nudge(api, "/arena/internal/validation-chain/sync", "sync", logger);
    await nudge(
      api,
      `/arena/internal/validation-chain/propositions/${propositionId}/freeze-market`,
      "freeze-market",
      logger,
    );
    await nudge(
      api,
      `/arena/internal/validation-chain/propositions/${propositionId}/resolve-market`,
      "resolve-market",
      logger,
    );

    const settledList = await api.get("/arena/public/results/settled");
    if (settledList.ok) {
      const items = Array.isArray(settledList.body)
        ? settledList.body
        : Array.isArray(settledList.body?.items)
          ? settledList.body.items
          : [];
      if (
        items.some(
          (item) => item.propositionId === propositionId || item.id === propositionId,
        )
      ) {
        settled = true;
        break;
      }
      logger.info(`not yet settled-public (${items.length} settled items so far)...`);
    }

    await sleepFn(POLL_INTERVAL_MS);
  }

  if (!settled) {
    logger.fail(
      `Proposition ${propositionId} did not become publicly settled within the timeout. Inspect GET /arena/internal/propositions/${propositionId} and the rehearsal status.`,
    );
    logger.info(`PROPOSITION_ID=${propositionId}  (state was driven but settlement did not complete)`);
    return 1;
  }

  logger.pass(`Proposition ${propositionId} is publicly settled.`);
  const proofArtifactDir = path.resolve(cwd, "validation-rehearsal", propositionId);
  logger.info("");
  logger.info("NEXT: capture the four-verdict proof with:");
  logger.info(
    `  pnpm run validation:proof:capture -- --proposition-id ${propositionId} --env-file ${envFilePath}`,
  );
  logger.info(
    `  pnpm run validation:ops:brief -- --proposition-id ${propositionId} --env-file ${envFilePath}`,
  );
  logger.info("Artifacts will accumulate under:");
  logger.info(`  ${proofArtifactDir}`);
  logger.info("");
  logger.pass(`PROPOSITION_ID=${propositionId}`);
  return 0;
}

async function main() {
  const exitCode = await runValidationProofDrive(parseCliArgs(process.argv.slice(2)));
  process.exit(exitCode);
}

if (require.main === module) {
  main().catch((error) => {
    fail(error instanceof Error ? error.stack || error.message : String(error));
    process.exit(1);
  });
}

module.exports = {
  parseCliArgs,
  runValidationProofDrive,
};
