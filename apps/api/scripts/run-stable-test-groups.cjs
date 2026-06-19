#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const path = require("node:path");

const API_ROOT = path.resolve(__dirname, "..");
const DEFAULT_STEP_PAUSE_MS = process.platform === "win32" ? 250 : 0;
const STEP_PAUSE_MS = resolveStepPauseMs(
  process.env.ARENA_STABLE_TEST_STEP_PAUSE_MS,
);

const TEST_SUITES = {
  identity: [
    {
      files: [
        "test/arena/arena-user-identity.service.test.ts",
        "test/arena/auth-user-identity.test.ts",
      ],
      pattern:
        "ArenaUserIdentityService|AuthService user identity persistence",
    },
    {
      files: ["test/arena/requester-mine-http.test.ts"],
    },
    {
      files: ["test/arena/requester-drafts-http.test.ts"],
    },
    {
      files: ["test/arena/respondent-account-http.test.ts"],
    },
    {
      files: ["test/arena/respondent-rewards-http.test.ts"],
    },
    {
      files: ["test/arena/discussion-http.test.ts"],
    },
    {
      files: ["test/arena/discussion-user-identity.test.ts"],
    },
    {
      files: ["test/arena/adjudication-http.test.ts"],
      pattern:
        "adjudication self surfaces keep task and submission views free of internal user ids",
    },
    {
      files: ["test/arena/public-respondent-leaderboard-http.test.ts"],
    },
    {
      files: ["test/arena/public-respondent-leaderboard-identity.test.ts"],
    },
    {
      files: ["test/arena/public-results-http.test.ts"],
    },
    {
      files: ["test/arena/arena.test.ts"],
      patterns: [
        "public controller keeps live reads progress-only and adds published result after settlement",
        "public respondent leaderboard only includes indexing-enabled public respondents and exposes masked aggregate rows",
        "respondent reputation self view only returns the caller summary while internal view keeps audit fields",
        "respondent tag self view only returns safe summary while internal view keeps audit fields",
        "respondent result summary exposes settled outcome for the current user only after settlement",
        "respondent result list aggregates settled outcomes reward amounts and position totals",
        "respondent result overview includes settled results open positions and recent activity",
        "respondent account overview aggregates rewards reputation tags and result overview",
        "respondent account preferences return defaults and persist updates",
        "respondent account exports create and list real export records for the current user",
        "respondent account exports return stored artifact detail for the current user",
      ],
    },
    {
      files: ["test/arena/http-error-mapping.test.ts"],
      patterns: [
        "public and validation market routes keep pre-reveal progress visible without leaking directional fields",
        "public discovery closing-soon route returns urgent and upcoming public market buckets",
        "public discovery category index route returns the real directory slug and pathname list",
        "adjudication task routes keep public progress while hiding market-direction and sentiment fields",
        "creator proposition endpoints expose owned propositions across draft scheduled live and settled lifecycle states",
        "account export detail endpoint returns the stored artifact and keeps ownership boundaries",
        "creator proposition overview aggregates owned proposition portfolio state without leaking unresolved direction",
        "creator proposition analytics endpoint returns longer-horizon requester analytics without leaking unresolved direction",
        "creator proposition export endpoints create and list real owned proposition exports",
        "creator requester report preset CRUD endpoints persist scoped reporting config",
        "creator requester report preset comparison endpoint returns preset-backed analytics cohorts",
        "creator requester comparison set CRUD endpoints persist named preset collections",
        "creator requester comparison set exports create, list, and detail persisted delivery artifacts",
        "creator requester comparison set delivery policy CRUD and manual run create recurring export substrate",
        "requester comparison set delivery runs persist manual and automation run history",
        "deleting a requester comparison set delivery policy preserves historical exports but removes scheduler state",
        "creator proposition export detail backfills analytics for legacy stored requester exports",
      ],
    },
  ],
  "payout-release": [
    {
      files: [
        "test/arena/reward-payout.service.test.ts",
        "test/arena/reward-payout-execution.service.test.ts",
        "test/arena/reward-payout-automation.test.ts",
        "test/arena/internal-ops-listing.test.ts",
        "test/arena/scheduler-queue.test.ts",
        "test/arena/ops-alert-notifier.service.test.ts",
        "test/arena/runtime-contract-alerts.test.ts",
        "test/arena/validation-chain-phase6.test.ts",
      ],
      pattern:
        "internal reward payout ensure control creates a missing payout after wallet binding|internal reward payout controls advance lifecycle with retry audit trail|confirm payout execution completes an executing wallet payout from its recorded transaction hash|confirm payout execution is rejected when the payout never recorded an execution transaction hash|reward payout automation executes approved payouts, confirms recorded executions, and fails stale executions without tx hashes|reward payout automation leaves executing payouts with recorded tx hashes in place when confirmation proof is still unavailable|execution_recover|ensure-payout|ops alert notifier|runtime contract audit records deduped release alerts only when the blocker set changes|runtime contract health checks forward structured release alerts to the configured notifier|forwards validation-chain alerts to the configured notifier|treats reward payout readiness as a release gate without blocking validation rehearsal progress|keeps non-local release readiness blocked when external proof exists but reward payout follow-through is still incomplete|marks non-local release readiness ready when external proof and reward payout follow-through are both complete|allows re-enqueue after a completed reward payout automation job is retained|enqueues reward payout automation from the scheduler cron entrypoint|processes a queued reward payout automation job|USDC reward payout transfer failed: insufficient funds for gas \\* price \\+ value",
    },
    {
      files: ["test/arena/internal-rewards-http.test.ts"],
      patterns: [
        "internal reward payout routes advance from approval to confirmed completion with the recorded execution tx hash",
        "internal reward payout confirm route keeps the payout executing when on-chain verification fails",
        "internal reward payout routes support failed execution retries without leaking stale transfer identifiers",
        "internal reward audit retrigger route preserves ledger history after a review correction",
        "internal reward complete route marks an executing payout completed after verification succeeds",
        "internal reward list filters payout work queues by payout status",
        "internal reward complete route rejects approved wallet payouts that never recorded an execution transaction hash",
        "internal reward list isolates finalized ledgers that are missing payout records",
        "internal reward list isolates stale executing payouts that need operator recovery",
        "internal reward list derives actionable payout queues for operators",
        "internal reward ensure payout route recreates a missing payout after wallet binding",
      ],
    },
  ],
};

function main() {
  const suiteName = process.argv[2];
  const suite = TEST_SUITES[suiteName];

  if (!suite) {
    const names = Object.keys(TEST_SUITES).join(", ");
    throw new Error(`Unknown test suite "${suiteName}". Expected one of: ${names}`);
  }

  for (const [index, step] of suite.entries()) {
    runStep(step);
    if (index < suite.length - 1 && STEP_PAUSE_MS > 0) {
      sleepMs(STEP_PAUSE_MS);
    }
  }
}

function runStep(step) {
  const args = ["--require", "ts-node/register", "--test", "--test-concurrency=1"];
  const pattern = resolvePattern(step);

  if (pattern) {
    args.push("--test-name-pattern", pattern);
  }

  args.push(...step.files);

  const result = spawnSync(process.execPath, args, {
    cwd: API_ROOT,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (typeof result.status === "number" && result.status !== 0) {
    process.exit(result.status);
  }

  if (result.signal) {
    process.kill(process.pid, result.signal);
  }
}

function resolvePattern(step) {
  if (Array.isArray(step.patterns) && step.patterns.length > 0) {
    return step.patterns.join("|");
  }

  return step.pattern || "";
}

function resolveStepPauseMs(rawValue) {
  if (typeof rawValue !== "string" || rawValue.trim().length === 0) {
    return DEFAULT_STEP_PAUSE_MS;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    return DEFAULT_STEP_PAUSE_MS;
  }

  return parsed;
}

function sleepMs(durationMs) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, durationMs);
}

main();
