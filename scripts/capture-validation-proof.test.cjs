const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  captureValidationProof,
} = require("./capture-validation-proof.cjs");

test("capture-validation-proof writes a complete proposition proof when internal rehearsal is ready and the public settled result is visible", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-validation-proof-complete-"),
  );
  const logger = createLogger();

  const exitCode = await captureValidationProof({
    cwd: workspace,
    propositionId: "prop_complete",
    baseUrl: "http://127.0.0.1:4000",
    authToken: "secret-token",
    fetchImpl: async (url) => {
      if (String(url).endsWith("/arena/internal/monitoring/runtime-contract")) {
        return jsonResponse({
          status: "ok",
          generatedAt: "2026-05-28T03:50:00.000Z",
          environment: {
            nodeEnv: "production",
            validationEnvironment: "staging",
            port: 4000,
          },
          validationChain: {
            status: "ok",
            operatorActions: [],
          },
          releaseReadiness: {
            status: "ready",
            blockingDependencies: [],
            completedGateCount: 4,
            totalGateCount: 4,
          },
          releaseChecklist: [],
        });
      }

      if (
        String(url).endsWith(
          "/arena/internal/propositions/prop_complete/evidence-bundle",
        )
      ) {
        return jsonResponse({
          propositionId: "prop_complete",
          exportedAt: "2026-05-28T04:00:00.000Z",
          runtimeContract: {
            status: "ok",
            commands: {
              validationLocalPrepare: ["pnpm run validation:prepare:local"],
            },
          },
          propositionExport: {
            proposition: {
              id: "prop_complete",
              title: "Complete proposition",
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
                latestCheckpointAt: "2026-05-28T03:55:00.000Z",
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

      if (String(url).endsWith("/arena/public/results/settled")) {
        return jsonResponse({
          totalCount: 1,
          items: [
            {
              propositionId: "prop_complete",
              marketId: "market_1",
              title: "Complete proposition",
              category: "general",
              winningOptionLabel: "No",
              resultKind: "resolved",
              winningOption: 1,
              voidReason: null,
              validSampleCount: 23,
              winMarginPercent: 61.5,
              settledAt: "2026-05-28T03:58:00.000Z",
              settlementTxHash: "0xdef",
              onChain: true,
            },
          ],
        });
      }

      if (
        String(url).endsWith(
          "/arena/public/integrity/overview?propositionId=prop_complete",
        )
      ) {
        return jsonResponse({
          generatedAt: "2026-05-28T04:01:00.000Z",
          live: {
            totalCount: 0,
            reachedSampleThresholdCount: 0,
            marketEnabledCount: 0,
            phaseBreakdown: [],
            items: [],
          },
          archive: {
            settledCount: 1,
            onChainCount: 1,
            averageValidSampleCount: 23,
            latestSettledAt: "2026-05-28T03:58:00.000Z",
            recentItems: [
              {
                propositionId: "prop_complete",
                title: "Complete proposition",
                category: "general",
                settledAt: "2026-05-28T03:58:00.000Z",
                settlementTxHash: "0xdef",
                onChain: true,
              },
            ],
          },
          focus: {
            propositionId: "prop_complete",
            visible: true,
            source: "archive",
            liveItem: null,
            archiveItem: {
              propositionId: "prop_complete",
              title: "Complete proposition",
              category: "general",
              settledAt: "2026-05-28T03:58:00.000Z",
              settlementTxHash: "0xdef",
              onChain: true,
            },
          },
        });
      }

      throw new Error(`Unexpected URL ${url}`);
    },
    logger,
  });

  assert.equal(exitCode, 0);

  const proofDir = path.join(workspace, "validation-rehearsal", "prop_complete");
  const summaryPath = path.join(proofDir, "proof-summary.json");
  const backendPath = path.join(proofDir, "backend-release-readiness.json");
  const evidencePath = path.join(proofDir, "evidence-bundle.json");
  const publicPath = path.join(proofDir, "public-settled-result.json");
  const publicIntegrityPath = path.join(
    proofDir,
    "public-integrity-overview.json",
  );

  assert.equal(fs.existsSync(summaryPath), true);
  assert.equal(fs.existsSync(backendPath), true);
  assert.equal(fs.existsSync(evidencePath), true);
  assert.equal(fs.existsSync(publicPath), true);
  assert.equal(fs.existsSync(publicIntegrityPath), true);

  const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
  assert.equal(summary.propositionId, "prop_complete");
  assert.equal(summary.proofComplete, true);
  assert.equal(summary.failures.length, 0);
  assert.equal(summary.releaseReadiness.status, "ready");
  assert.equal(summary.validationRehearsal.status, "ready");
  assert.equal(summary.publicSettledResult.found, true);
  assert.equal(summary.publicSettledResult.settlementTxHash, "0xdef");
  assert.equal(summary.publicIntegrityOverview.visible, true);
  assert.equal(summary.publicIntegrityOverview.focusSource, "archive");
  assert.equal(summary.publicIntegrityOverview.focusSettlementTxHash, "0xdef");

  assert.deepEqual(logger.failMessages, []);
  assert.deepEqual(logger.passMessages, [
    "Validation proposition proof is complete for prop_complete",
  ]);
  assert.match(logger.infoMessages[0], /Proof status for prop_complete: complete/u);
  assert.match(logger.infoMessages[1], /Release readiness: ready/u);
  assert.match(logger.infoMessages[2], /Validation rehearsal: ready/u);
  assert.match(logger.infoMessages[3], /Public settled result: visible/u);
  assert.match(logger.infoMessages[4], /Public integrity overview: visible/u);
  assert.match(
    logger.infoMessages[5],
    /Latest checkpoint: projection_and_settlement \(complete\) at 2026-05-28T03:55:00.000Z/u,
  );
  assert.match(logger.infoMessages[6], /Public settled at: 2026-05-28T03:58:00.000Z/u);
  assert.match(logger.infoMessages[7], /Public settlement tx: 0xdef/u);
  assert.match(logger.infoMessages[8], /Public integrity focus source: archive/u);
  assert.match(logger.infoMessages[9], /Public integrity settled at: 2026-05-28T03:58:00.000Z/u);
  assert.match(logger.infoMessages[10], /Public integrity settlement tx: 0xdef/u);
  assert.match(
    logger.infoMessages[11],
    new RegExp(escapeRegExp(`Backend release snapshot: ${backendPath}`), "u"),
  );
  assert.match(
    logger.infoMessages[12],
    new RegExp(escapeRegExp(`Evidence bundle: ${evidencePath}`), "u"),
  );
  assert.match(
    logger.infoMessages[13],
    new RegExp(escapeRegExp(`Public result artifact: ${publicPath}`), "u"),
  );
  assert.match(
    logger.infoMessages[14],
    new RegExp(escapeRegExp(`Public integrity artifact: ${publicIntegrityPath}`), "u"),
  );
  assert.match(
    logger.infoMessages[15],
    new RegExp(escapeRegExp(`Proof summary: ${summaryPath}`), "u"),
  );
});

test("capture-validation-proof writes an incomplete proof summary when internal rehearsal is blocked and the public settled result is still missing", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-validation-proof-incomplete-"),
  );
  const logger = createLogger();

  const exitCode = await captureValidationProof({
    cwd: workspace,
    propositionId: "prop_incomplete",
    baseUrl: "https://arena.example",
    authToken: "secret-token",
    fetchImpl: async (url) => {
      if (String(url).endsWith("/arena/internal/monitoring/runtime-contract")) {
        return jsonResponse({
          status: "degraded",
          generatedAt: "2026-05-28T04:00:00.000Z",
          environment: {
            nodeEnv: "production",
            validationEnvironment: "prod",
            port: 4000,
          },
          validationChain: {
            status: "degraded",
            operatorActions: [
              {
                dependency: "scheduler_queue",
                summary: "Restore scheduler queue connectivity.",
                envKeys: [],
                commands: ["GET /system/queues/overview"],
              },
            ],
          },
          releaseReadiness: {
            status: "blocked",
            blockingDependencies: ["scheduler_queue"],
            completedGateCount: 3,
            totalGateCount: 4,
          },
          releaseChecklist: [],
        });
      }

      if (
        String(url).endsWith(
          "/arena/internal/propositions/prop_incomplete/evidence-bundle",
        )
      ) {
        return jsonResponse({
          propositionId: "prop_incomplete",
          exportedAt: "2026-05-28T04:10:00.000Z",
          runtimeContract: {
            status: "degraded",
            commands: {
              validationLocalPrepare: ["pnpm run validation:prepare:local"],
            },
          },
          propositionExport: {
            proposition: {
              id: "prop_incomplete",
              title: "Incomplete proposition",
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
                nextCommands: ["POST /arena/internal/validation-chain/sync"],
                blockingReasons: [
                  "no local validation bet has been persisted",
                ],
                latestCheckpointAt: "2026-05-28T04:05:00.000Z",
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

      if (String(url).endsWith("/arena/public/results/settled")) {
        return jsonResponse({
          totalCount: 0,
          items: [],
        });
      }

      if (
        String(url).endsWith(
          "/arena/public/integrity/overview?propositionId=prop_incomplete",
        )
      ) {
        return jsonResponse({
          generatedAt: "2026-05-28T04:11:00.000Z",
          live: {
            totalCount: 0,
            reachedSampleThresholdCount: 0,
            marketEnabledCount: 0,
            phaseBreakdown: [],
            items: [],
          },
          archive: {
            settledCount: 0,
            onChainCount: 0,
            averageValidSampleCount: 0,
            latestSettledAt: null,
            recentItems: [],
          },
          focus: {
            propositionId: "prop_incomplete",
            visible: false,
            source: null,
            liveItem: null,
            archiveItem: null,
          },
        });
      }

      throw new Error(`Unexpected URL ${url}`);
    },
    logger,
  });

  assert.equal(exitCode, 1);

  const proofDir = path.join(workspace, "validation-rehearsal", "prop_incomplete");
  const summaryPath = path.join(proofDir, "proof-summary.json");
  assert.equal(fs.existsSync(summaryPath), true);

  const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
  assert.equal(summary.proofComplete, false);
  assert.deepEqual(summary.failures, [
    "releaseReadiness.blocked",
    "validationRehearsal.blocked",
    "publicSettledResult.missing",
    "publicIntegrityOverview.missing",
  ]);
  assert.equal(summary.releaseReadiness.status, "blocked");
  assert.equal(summary.validationRehearsal.status, "blocked");
  assert.equal(summary.publicSettledResult.found, false);
  assert.equal(summary.publicIntegrityOverview.visible, false);
  assert.deepEqual(logger.passMessages, []);
  assert.deepEqual(logger.failMessages, [
    "Validation proposition proof is incomplete.",
  ]);
  assert.equal(
    logger.infoMessages.includes("Release blocking dependencies:"),
    true,
  );
  assert.equal(
    logger.infoMessages.includes("- scheduler_queue"),
    true,
  );
  assert.equal(
    logger.infoMessages.includes("Current blocked rehearsal step: local_bet_and_sync"),
    true,
  );
  assert.equal(
    logger.infoMessages.includes("Rehearsal blocking reasons:"),
    true,
  );
  assert.equal(
    logger.infoMessages.includes("- no local validation bet has been persisted"),
    true,
  );
  assert.equal(
    logger.infoMessages.includes(
      "Public integrity note: Proposition prop_incomplete is not yet visible in the public integrity overview.",
    ),
    true,
  );
});

test("capture-validation-proof fails clearly when proposition id is missing", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-validation-proof-missing-"),
  );
  const logger = createLogger();

  const exitCode = await captureValidationProof({
    cwd: workspace,
    propositionId: "",
    fetchImpl: async () => {
      throw new Error("fetch should not be called");
    },
    logger,
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(logger.failMessages, [
    "Missing proposition id. Provide --proposition-id <id> when capturing validation proof.",
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
