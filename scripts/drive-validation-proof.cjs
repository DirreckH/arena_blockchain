#!/usr/bin/env node

// Drives ONE proposition through the full local validation rehearsal lifecycle
// so that `pnpm run validation:proof:capture --proposition-id <id>` can turn all
// four verdicts green:
//   1. backend releaseReadiness.status=ready          (already proven by backend:prepare:local)
//   2. internal proposition rehearsal status=ready
//   3. proposition visible in GET /arena/public/results/settled
//   4. proposition visible in GET /arena/public/integrity/overview?propositionId=<id>
//
// Lifecycle (see docs/INTEGRATION_STATUS.md + validation-chain-runtime.test.ts):
//   draft -> submit -> approve -> (scheduler: scheduled->live + auto create/open market)
//   -> sync -> dispatch -> respond -> review -> place ONE on-chain bet -> confirm -> sync
//   -> (scheduler: live->frozen->revealing + auto freeze/resolve) -> sync
//   -> (scheduler: revealing->settled) -> publicly visible.
//
// The only on-chain wallet transaction is the single placeBet, signed by the
// operator wallet (ARENA_VALIDATION_OPERATOR_PRIVATE_KEY) whose address equals the
// JWT `sub` in ARENA_INTERNAL_OPERATOR_BEARER_TOKEN. Everything else is API + the
// scheduler/queue workers + the sync worker. Proposition state transitions have no
// manual HTTP endpoint, so this script polls and nudges (best-effort manual chain
// commands + sync + evm_mine) until each gate is satisfied.
//
// This script ONLY drives state. It does not run the proof capture; run that
// separately afterwards so its verdicts are read cleanly.

const path = require("node:path");
const { ethers } = require("ethers");

const { fail, info, loadEnvFile, pass } = require("./_validation-common.cjs");

const POLL_INTERVAL_MS = 5000;
const LIVE_TIMEOUT_MS = 150000; // scheduler promotes scheduled->live on a ~60s cron
const CHAIN_LIVE_TIMEOUT_MS = 120000; // create+open+sync projection
const SETTLE_TIMEOUT_MS = 360000; // freeze (minDuration) + resolve + settle across cron ticks
const MIN_BET_AMOUNT = "10"; // wei
const STAKE_AMOUNT = "10"; // wei, >= minBetAmount
const SELECTED_OPTION = 0; // both response + bet pick option 0 for a clean resolved result
// Give ourselves a comfortable window between live and freeze so dispatch/respond/
// review/bet all complete before the freeze fires.
const MIN_DURATION_SECONDS = 150;
const MAX_DURATION_SECONDS = 3600;

function nowIso() {
  return new Date().toISOString();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function mineQuietBlock(provider) {
  try {
    await provider.send("evm_mine", []);
  } catch {
    // Best effort only. The local rehearsal chain is expected to support evm_mine,
    // but the drive flow should keep going if it does not.
  }
}

function createApi({ baseUrl, token }) {
  const root = String(baseUrl).replace(/\/+$/u, "");
  async function call(method, route, body) {
    const url = `${root}${route}`;
    let response;
    try {
      response = await fetch(url, {
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
    const text = await response.text();
    let parsed = null;
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }
    return { ok: response.ok, status: response.status, body: parsed };
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

// Best-effort POST: log + swallow non-2xx (e.g. a precondition already satisfied
// by the automation). Used for manual chain-command nudges and sync.
async function nudge(api, route, label) {
  try {
    const result = await api.post(route, { reason: "validation_rehearsal.drive" });
    if (result.ok) {
      info(`${label}: ok`);
    } else {
      info(`${label}: skipped (HTTP ${result.status})`);
    }
  } catch (error) {
    info(`${label}: skipped (${error instanceof Error ? error.message : String(error)})`);
  }
}

async function main() {
  const cwd = process.cwd();
  loadEnvFile(path.resolve(cwd, ".env"), { override: true });

  const baseUrl =
    process.env.ARENA_INTERNAL_API_BASE_URL ||
    process.env.VITE_API_BASE_URL ||
    "http://127.0.0.1:4000";
  const token = process.env.ARENA_INTERNAL_OPERATOR_BEARER_TOKEN || "";
  const rpcUrl = process.env.RPC_URL || "http://127.0.0.1:8545";
  const chainId = Number(process.env.CHAIN_ID || 0);
  const operatorKey = process.env.ARENA_VALIDATION_OPERATOR_PRIVATE_KEY || "";
  const contractAddress = process.env.ARENA_VALIDATION_CONTRACT_ADDRESS || "";

  for (const [name, value] of [
    ["ARENA_INTERNAL_OPERATOR_BEARER_TOKEN", token],
    ["RPC_URL", rpcUrl],
    ["CHAIN_ID", chainId],
    ["ARENA_VALIDATION_OPERATOR_PRIVATE_KEY", operatorKey],
    ["ARENA_VALIDATION_CONTRACT_ADDRESS", contractAddress],
  ]) {
    if (!value) {
      fail(`Missing required env value: ${name}. Run pnpm run validation:bootstrap:local first.`);
      return 1;
    }
  }

  const api = createApi({ baseUrl, token });
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(operatorKey, provider);
  const operatorAddress = wallet.address.toLowerCase();

  info(`API base: ${baseUrl}`);
  info(`RPC: ${rpcUrl} (chainId ${chainId})`);
  info(`Operator wallet (== JWT sub == bettor): ${operatorAddress}`);

  // --- Preflight -----------------------------------------------------------
  const health = await api.get("/health/ready");
  if (!health.ok) {
    fail(`Backend /health/ready not ok (HTTP ${health.status}). Start it with pnpm run backend:prepare:local.`);
    return 1;
  }
  info("Backend /health/ready: ok");
  try {
    const net = await provider.getNetwork();
    info(`RPC reachable, chainId ${net.chainId}`);
  } catch (error) {
    fail(`RPC unreachable: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }

  // --- 1. Create draft -----------------------------------------------------
  const draft = await expectOk(
    api.post("/arena/propositions/drafts", {
      title: `Rehearsal proof ${new Date().toISOString().slice(0, 19)}`,
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
    fail(`Draft created but no propositionId in response: ${JSON.stringify(draft)}`);
    return 1;
  }
  pass(`PROPOSITION_ID=${propositionId}`);

  // --- 2. Submit -----------------------------------------------------------
  await expectOk(api.post(`/arena/propositions/drafts/${propositionId}/submit`, {}), "submit draft");
  info("Draft submitted (status -> submitted).");

  // --- 3. Approve ----------------------------------------------------------
  await expectOk(
    api.post(`/arena/internal/propositions/${propositionId}/approve`, {
      publishedAt: nowIso(),
      reason: "validation rehearsal proof",
    }),
    "approve proposition",
  );
  info("Proposition approved (status -> scheduled, publishedAt = now).");

  // --- 4. Wait for scheduler to take it live + chain market live -----------
  info("Waiting for scheduler to promote scheduled -> live and project the chain market...");
  const liveDeadline = Date.now() + LIVE_TIMEOUT_MS + CHAIN_LIVE_TIMEOUT_MS;
  let market = null;
  let nudgedCreate = false;
  while (Date.now() < liveDeadline) {
    await mineQuietBlock(provider);
    await nudge(api, "/arena/internal/validation-chain/sync", "sync");
    const markets = await api.get("/arena/validation/markets");
    if (markets.ok && Array.isArray(markets.body)) {
      market = markets.body.find((m) => m.propositionId === propositionId) || null;
    }
    if (market) {
      const readiness = market.executionReadiness || {};
      const chainStatus = readiness.chainStatus;
      info(
        `market ${market.marketId}: status=${market.marketStatus} chainStatus=${chainStatus ?? "null"} ready=${readiness.ready === true}`,
      );
      // If live locally but chain market not created yet, nudge create+open once.
      if (!nudgedCreate && (chainStatus === null || chainStatus === undefined)) {
        await nudge(api, `/arena/internal/validation-chain/propositions/${propositionId}/create-market`, "create-market");
        await nudge(api, `/arena/internal/validation-chain/propositions/${propositionId}/open-market`, "open-market");
        nudgedCreate = true;
      } else if (chainStatus === "created" || chainStatus === "pre_live") {
        await nudge(api, `/arena/internal/validation-chain/propositions/${propositionId}/open-market`, "open-market");
      }
      if (readiness.ready === true || chainStatus === "live") {
        break;
      }
    }
    await sleep(POLL_INTERVAL_MS);
  }
  if (!market || !(market.executionReadiness && (market.executionReadiness.ready === true || market.executionReadiness.chainStatus === "live"))) {
    fail(`Chain market never became live for proposition ${propositionId}. Last market: ${JSON.stringify(market)}`);
    return 1;
  }
  const marketId = market.marketId;
  pass(`Chain market live. marketId=${marketId}`);

  // --- 5. Dispatch a task to the operator user, respond, review ------------
  // (Provides one effective sample so freeze produces a clean resolved result.)
  await expectOk(
    api.post(`/arena/internal/propositions/${propositionId}/dispatch`, {
      userIds: [operatorAddress],
      assignedAt: nowIso(),
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    }),
    "dispatch task",
  );
  info("Dispatched adjudication task to operator user.");

  // find the taskId
  let taskId = null;
  for (let i = 0; i < 6 && !taskId; i += 1) {
    const tasks = await api.get("/arena/adjudication/tasks");
    if (tasks.ok && Array.isArray(tasks.body)) {
      const task = tasks.body.find((t) => t.propositionId === propositionId);
      if (task) {
        taskId = task.taskId;
      }
    }
    if (!taskId) {
      await sleep(2000);
    }
  }
  if (!taskId) {
    fail("Dispatched task did not appear in GET /arena/adjudication/tasks.");
    return 1;
  }
  info(`taskId=${taskId}`);

  const responseResult = await expectOk(
    api.post(`/arena/adjudication/tasks/${taskId}/responses`, {
      propositionId,
      selectedOption: SELECTED_OPTION,
      confirmationOption: SELECTED_OPTION,
      clientStartedAt: nowIso(),
      clientSubmittedAt: nowIso(),
      understandingAck: true,
      submittedAt: nowIso(),
    }),
    "submit response",
  );
  const responseId = responseResult.responseId;
  if (!responseId) {
    fail(`Response submitted but no responseId: ${JSON.stringify(responseResult)}`);
    return 1;
  }
  info(`responseId=${responseId}`);

  await expectOk(
    api.post(`/arena/internal/responses/${responseId}/review`, { reviewedAt: nowIso() }),
    "review response",
  );
  info("Response reviewed (counts toward effective sample).");

  // --- 6. Place the ONE on-chain bet ---------------------------------------
  const prepare = await expectOk(
    api.post(`/arena/validation/markets/${marketId}/bets/prepare`, {
      propositionId,
      selectedOption: SELECTED_OPTION,
      stakeAmount: STAKE_AMOUNT,
      placedAt: nowIso(),
    }),
    "prepare bet",
  );
  const tx = prepare.transaction;
  info(`Prepared placeBet tx -> to=${tx.to} value=${tx.value} chainMarketId=${tx.chainMarketId}`);

  const sent = await wallet.sendTransaction({
    to: tx.to,
    data: tx.data,
    value: ethers.BigNumber.from(tx.value),
  });
  info(`placeBet tx sent: ${sent.hash}`);
  const receipt = await sent.wait(1);
  if (receipt.status !== 1) {
    fail(`placeBet tx reverted: ${sent.hash}`);
    return 1;
  }
  pass(`placeBet confirmed in block ${receipt.blockNumber}`);
  // mine one extra block so BetPlaced clears ARENA_VALIDATION_SYNC_CONFIRMATIONS
  await mineQuietBlock(provider);

  await expectOk(
    api.post(`/arena/validation/markets/${marketId}/bets/confirm`, {
      propositionId,
      selectedOption: SELECTED_OPTION,
      stakeAmount: STAKE_AMOUNT,
      placedAt: nowIso(),
      txHash: sent.hash,
    }),
    "confirm bet",
  );
  info("Bet confirmed and local position recorded.");
  await nudge(api, "/arena/internal/validation-chain/sync", "sync (project BetPlaced)");

  // --- 7. Wait for freeze -> resolve -> settle -----------------------------
  info("Waiting for scheduler to freeze/reveal/resolve/settle. This spans several cron ticks...");
  const settleDeadline = Date.now() + SETTLE_TIMEOUT_MS;
  let settled = false;
  while (Date.now() < settleDeadline) {
    // mine a block so freshly-emitted chain events clear confirmations, then sync
    await mineQuietBlock(provider);
    await nudge(api, "/arena/internal/validation-chain/sync", "sync");
    // best-effort manual freeze/resolve nudges (no-ops if automation already did them
    // or preconditions not yet met)
    await nudge(api, `/arena/internal/validation-chain/propositions/${propositionId}/freeze-market`, "freeze-market");
    await nudge(api, `/arena/internal/validation-chain/propositions/${propositionId}/resolve-market`, "resolve-market");

    const settledList = await api.get("/arena/public/results/settled");
    if (settledList.ok) {
      const items = Array.isArray(settledList.body)
        ? settledList.body
        : Array.isArray(settledList.body?.items)
          ? settledList.body.items
          : [];
      if (items.some((it) => it.propositionId === propositionId || it.id === propositionId)) {
        settled = true;
        break;
      }
      info(`not yet settled-public (${items.length} settled items so far)...`);
    }
    await sleep(POLL_INTERVAL_MS);
  }

  if (!settled) {
    fail(
      `Proposition ${propositionId} did not become publicly settled within the timeout. ` +
        `Inspect GET /arena/internal/propositions/${propositionId} and the rehearsal status.`,
    );
    info(`PROPOSITION_ID=${propositionId}  (state was driven but settlement did not complete)`);
    return 1;
  }

  pass(`Proposition ${propositionId} is publicly settled.`);
  info("");
  info("NEXT: capture the four-verdict proof with:");
  info(`  pnpm run validation:proof:capture -- --proposition-id ${propositionId}`);
  info("");
  pass(`PROPOSITION_ID=${propositionId}`);
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    fail(error instanceof Error ? error.stack || error.message : String(error));
    process.exit(1);
  });
