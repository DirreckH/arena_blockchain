const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  captureValidationRehearsalEvidence,
} = require("./capture-validation-rehearsal-evidence.cjs");

test("capture-validation-rehearsal-evidence exports the bundle and prints the current blocked step guidance", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-validation-capture-blocked-"),
  );
  const logger = createLogger();

  const exitCode = await captureValidationRehearsalEvidence({
    propositionId: "prop_blocked",
    cwd: workspace,
    baseUrl: "http://127.0.0.1:4000",
    authToken: "secret-token",
    fetchImpl: async (url) => {
      if (
        String(url).endsWith(
          "/arena/internal/propositions/prop_blocked/evidence-bundle",
        )
      ) {
        return jsonResponse({
          propositionId: "prop_blocked",
          exportedAt: "2026-05-28T01:00:00.000Z",
          runtimeContract: {
            status: "degraded",
            commands: {
              validationLocalPrepare: ["pnpm run validation:prepare:local"],
            },
          },
          propositionExport: {
            proposition: {
              id: "prop_blocked",
              title: "Blocked proposition",
            },
            validationRehearsal: {
              status: "blocked",
              targetOutcome: "One proposition reaches settled verification.",
              runbookPath: "docs/contracts/arena-validation-chain-runbook.md",
              summary: {
                completedStepCount: 2,
                remainingStepCount: 3,
                currentStepId: "local_bet_and_sync",
                currentStepStatus: "blocked",
                nextCommands: [
                  "POST /arena/internal/validation-chain/sync",
                  "POST /arena/internal/validation-chain/backlog/reconcile",
                ],
                blockingReasons: [
                  "no local validation bet has been persisted",
                  "no BetPlaced event has been persisted",
                ],
                latestCheckpointAt: "2026-05-28T00:45:00.000Z",
                latestCheckpointStepId: "publish_and_open",
                latestCheckpointStatus: "complete",
              },
              steps: [
                { id: "preflight", status: "complete" },
                { id: "publish_and_open", status: "complete" },
                { id: "local_bet_and_sync", status: "blocked" },
              ],
            },
          },
        });
      }

      throw new Error(`Unexpected URL ${url}`);
    },
    logger,
  });

  assert.equal(exitCode, 0);

  const expectedOutputPath = path.join(
    workspace,
    "validation-rehearsal",
    "prop_blocked",
    "evidence-bundle.json",
  );

  assert.equal(fs.existsSync(expectedOutputPath), true);
  assert.match(logger.infoMessages[0], /Rehearsal target: One proposition reaches settled verification\./u);
  assert.match(logger.infoMessages[1], /Rehearsal status for prop_blocked: blocked/u);
  assert.match(logger.infoMessages[2], /Current step: local_bet_and_sync \(blocked\)/u);
  assert.match(logger.infoMessages[3], /Completed steps: 2\/5/u);
  assert.match(
    logger.infoMessages[4],
    /Latest checkpoint: publish_and_open \(complete\) at 2026-05-28T00:45:00.000Z/u,
  );
  assert.match(
    logger.infoMessages[5],
    /Runbook: docs\/contracts\/arena-validation-chain-runbook\.md/u,
  );
  assert.match(
    logger.infoMessages[6],
    new RegExp(escapeRegExp(`Evidence bundle: ${expectedOutputPath}`), "u"),
  );
  assert.deepEqual(logger.infoMessages.slice(7), [
    "Blocking reasons:",
    "- no local validation bet has been persisted",
    "- no BetPlaced event has been persisted",
    "Next commands:",
    "- POST /arena/internal/validation-chain/sync",
    "- POST /arena/internal/validation-chain/backlog/reconcile",
  ]);
  assert.deepEqual(logger.passMessages, [
    "Validation rehearsal evidence captured for proposition prop_blocked",
  ]);
});

test("capture-validation-rehearsal-evidence reports a completed rehearsal without next commands", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-validation-capture-ready-"),
  );
  const outputPath = path.join(workspace, "custom-bundle.json");
  const logger = createLogger();

  const exitCode = await captureValidationRehearsalEvidence({
    propositionId: "prop_ready",
    outputPath,
    cwd: workspace,
    baseUrl: "http://127.0.0.1:4000",
    authToken: "secret-token",
    fetchImpl: async (url) => {
      if (
        String(url).endsWith("/arena/internal/propositions/prop_ready/evidence-bundle")
      ) {
        return jsonResponse({
          propositionId: "prop_ready",
          exportedAt: "2026-05-28T02:00:00.000Z",
          runtimeContract: {
            status: "ok",
            commands: {
              validationLocalPrepare: ["pnpm run validation:prepare:local"],
            },
          },
          propositionExport: {
            proposition: {
              id: "prop_ready",
              title: "Ready proposition",
            },
            validationRehearsal: {
              status: "ready",
              targetOutcome: "One proposition reaches settled verification.",
              runbookPath: "docs/contracts/arena-validation-chain-runbook.md",
              summary: {
                completedStepCount: 5,
                remainingStepCount: 0,
                currentStepId: null,
                currentStepStatus: null,
                nextCommands: [],
                blockingReasons: [],
                latestCheckpointAt: "2026-05-28T01:55:00.000Z",
                latestCheckpointStepId: "projection_and_settlement",
                latestCheckpointStatus: "complete",
              },
              steps: [
                { id: "preflight", status: "complete" },
                { id: "publish_and_open", status: "complete" },
                { id: "local_bet_and_sync", status: "complete" },
                { id: "freeze_and_resolve", status: "complete" },
                { id: "projection_and_settlement", status: "complete" },
              ],
            },
          },
        });
      }

      throw new Error(`Unexpected URL ${url}`);
    },
    logger,
  });

  assert.equal(exitCode, 0);
  assert.equal(fs.existsSync(outputPath), true);
  assert.match(logger.infoMessages[1], /Rehearsal status for prop_ready: ready/u);
  assert.match(
    logger.infoMessages[2],
    /Current step: none \(all tracked rehearsal steps are complete\)/u,
  );
  assert.match(logger.infoMessages[3], /Completed steps: 5\/5/u);
  assert.match(
    logger.infoMessages.at(-1),
    /No next commands remain; the tracked rehearsal steps are complete\./u,
  );
  assert.deepEqual(logger.passMessages, [
    "Validation rehearsal evidence captured for proposition prop_ready",
  ]);
});

function jsonResponse(payload) {
  return {
    ok: true,
    status: 200,
    async json() {
      return payload;
    },
    async text() {
      return JSON.stringify(payload);
    },
  };
}

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

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
