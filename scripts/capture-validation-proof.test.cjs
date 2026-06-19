const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildValidationOperatorBriefingCommand,
  buildValidationProofCaptureCommand,
  parseCliArgs,
  captureValidationProof,
} = require("./capture-validation-proof.cjs");

test("parseCliArgs resolves env-file, proposition id, base-url, auth token, and output path", () => {
  const parsed = parseCliArgs([
    "--env-file",
    "config/staging.env",
    "--proposition-id",
    "prop_complete",
    "--base-url",
    "https://arena.example",
    "--auth-token",
    "secret-token",
    "--output",
    "artifacts/proof-summary.json",
  ]);

  assert.equal(parsed.envFilePath, "config/staging.env");
  assert.equal(parsed.propositionId, "prop_complete");
  assert.equal(parsed.baseUrl, "https://arena.example");
  assert.equal(parsed.authToken, "secret-token");
  assert.equal(parsed.outputPath, "artifacts/proof-summary.json");
});

test("proof follow-up command builders keep proposition, env, and base URL aligned while redacting auth tokens", () => {
  const options = {
    propositionId: "prop_123",
    envFilePath: "config/staging.env",
    baseUrl: "https://arena.example",
    authToken: "secret-token",
  };

  assert.equal(
    buildValidationProofCaptureCommand(options),
    "- pnpm run validation:proof:capture -- --proposition-id prop_123 --env-file config/staging.env --base-url https://arena.example --auth-token <operator-token>",
  );
  assert.equal(
    buildValidationOperatorBriefingCommand(options),
    "- pnpm run validation:ops:brief -- --proposition-id prop_123 --env-file config/staging.env --base-url https://arena.example --auth-token <operator-token>",
  );
});

test("capture-validation-proof writes a complete proposition proof when internal rehearsal is ready and the public settled result is visible", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-validation-proof-complete-"),
  );
  const logger = createLogger();
  const recordedRequests = [];

  const exitCode = await captureValidationProof({
    cwd: workspace,
    propositionId: "prop_complete",
    baseUrl: "http://127.0.0.1:4000",
    authToken: "secret-token",
    fetchImpl: async (url, init = {}) => {
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
            completedGateCount: 5,
            totalGateCount: 5,
          },
          releaseChecklist: [],
        });
      }

      if (String(url).endsWith("/arena/internal/validation-chain/proof-record")) {
        recordedRequests.push({
          url: String(url),
          method: init.method,
          authorization: init.headers.authorization,
          vercelBypass: init.headers["x-vercel-protection-bypass"] || null,
          body: JSON.parse(init.body),
        });
        return jsonResponse({ status: "stored" });
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

      if (
        String(url).endsWith(
          "/arena/internal/rewards?propositionId=prop_complete&limit=100&offset=0",
        )
      ) {
        return jsonResponse({
          items: [
            {
              ledgerId: "ledger_complete_1",
              propositionId: "prop_complete",
              status: "finalized",
              finalAmount: "75",
              payoutId: "payout_complete_1",
              payoutStatus: "completed",
              payoutAmount: "75",
              payoutAssetSymbol: "USDC",
              payoutRequestedAt: "2026-05-28T03:56:00.000Z",
              payoutApprovedAt: "2026-05-28T03:57:00.000Z",
              payoutCompletedAt: "2026-05-28T03:58:30.000Z",
              payoutExecutionTxHash:
                "0x2222222222222222222222222222222222222222",
            },
            {
              ledgerId: "ledger_complete_2",
              propositionId: "prop_complete",
              status: "finalized",
              finalAmount: "15",
              payoutId: null,
              payoutStatus: null,
              payoutAmount: null,
              payoutAssetSymbol: null,
              payoutRequestedAt: null,
              payoutApprovedAt: null,
              payoutCompletedAt: null,
              payoutExecutionTxHash: null,
            },
          ],
          totalCount: 2,
          limit: 100,
          offset: 0,
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
          "/arena/internal/rewards?propositionId=prop_complete&staleExecutionOnly=true&actionQueue=execution_recover&limit=1&offset=0",
        )
      ) {
        return jsonResponse({
          items: [],
          totalCount: 0,
          limit: 1,
          offset: 0,
        });
      }

      if (
        String(url).endsWith(
          "/arena/internal/rewards?propositionId=prop_complete&staleExecutionOnly=true&actionQueue=execution_confirm&limit=1&offset=0",
        )
      ) {
        return jsonResponse({
          items: [],
          totalCount: 0,
          limit: 1,
          offset: 0,
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
  const rewardPayoutPath = path.join(proofDir, "reward-payout-summary.json");
  const publicPath = path.join(proofDir, "public-settled-result.json");
  const publicIntegrityPath = path.join(
    proofDir,
    "public-integrity-overview.json",
  );

  assert.equal(fs.existsSync(summaryPath), true);
  assert.equal(fs.existsSync(backendPath), true);
  assert.equal(fs.existsSync(evidencePath), true);
  assert.equal(fs.existsSync(rewardPayoutPath), true);
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
  assert.equal(summary.rewardPayout.totalLedgerEntries, 2);
  assert.equal(summary.rewardPayout.totalPayoutRecords, 1);
  assert.equal(summary.rewardPayout.finalizedWithoutPayoutCount, 1);
  assert.equal(summary.rewardPayout.staleExecutingCount, 0);
  assert.equal(summary.rewardPayout.completedWithExecutionTxHashCount, 1);
  assert.equal(summary.rewardPayout.payoutStatusCounts.completed, 1);
  assert.equal(summary.artifacts.rewardPayoutSummary, rewardPayoutPath);
  assert.equal(recordedRequests.length, 1);
  assert.equal(
    recordedRequests[0].url,
    "http://127.0.0.1:4000/arena/internal/validation-chain/proof-record",
  );
  assert.equal(recordedRequests[0].method, "POST");
  assert.equal(recordedRequests[0].authorization, "Bearer secret-token");
  assert.equal(recordedRequests[0].vercelBypass, null);
  assert.equal(recordedRequests[0].body.propositionId, "prop_complete");
  assert.equal(recordedRequests[0].body.proofComplete, true);
  assert.deepEqual(recordedRequests[0].body.failures, []);
  assert.equal(recordedRequests[0].body.rewardPayoutStaleExecutingCount, 0);
  assert.equal(
    recordedRequests[0].body.rewardPayoutStaleExecutingWithoutTxHashCount,
    0,
  );
  assert.equal(
    recordedRequests[0].body
      .rewardPayoutStaleExecutingAwaitingConfirmationCount,
    0,
  );
  assert.equal(
    recordedRequests[0].body.rewardPayoutArtifactPath,
    rewardPayoutPath,
  );

  assert.deepEqual(logger.failMessages, []);
  assert.deepEqual(logger.passMessages, [
    "Validation proposition proof is complete for prop_complete",
  ]);
  assert.equal(
    logger.infoMessages.some((message) =>
      /Proof status for prop_complete: complete/u.test(message),
    ),
    true,
  );
  assert.equal(
    logger.infoMessages.some((message) => /Release readiness: ready/u.test(message)),
    true,
  );
  assert.equal(
    logger.infoMessages.some((message) =>
      /Validation rehearsal: ready/u.test(message),
    ),
    true,
  );
  assert.equal(
    logger.infoMessages.some((message) =>
      /Public settled result: visible/u.test(message),
    ),
    true,
  );
  assert.equal(
    logger.infoMessages.some((message) =>
      /Public integrity overview: visible/u.test(message),
    ),
    true,
  );
  assert.equal(
    logger.infoMessages.some((message) =>
      /Latest checkpoint: projection_and_settlement \(complete\) at 2026-05-28T03:55:00.000Z/u.test(
        message,
      ),
    ),
    true,
  );
  assert.equal(
    logger.infoMessages.some((message) =>
      /Public settled at: 2026-05-28T03:58:00.000Z/u.test(message),
    ),
    true,
  );
  assert.equal(
    logger.infoMessages.some((message) =>
      /Public settlement tx: 0xdef/u.test(message),
    ),
    true,
  );
  assert.equal(
    logger.infoMessages.some((message) =>
      /Public integrity focus source: archive/u.test(message),
    ),
    true,
  );
  assert.equal(
    logger.infoMessages.some((message) =>
      /Public integrity settled at: 2026-05-28T03:58:00.000Z/u.test(message),
    ),
    true,
  );
  assert.equal(
    logger.infoMessages.some((message) =>
      /Public integrity settlement tx: 0xdef/u.test(message),
    ),
    true,
  );
  assert.equal(
    logger.infoMessages.some((message) =>
      /Reward payouts: 1 completed, 1 finalized rewards still pending payout follow-through, 0 stale executing payouts/u.test(
        message,
      ),
    ),
    true,
  );
  assert.equal(
    logger.infoMessages.some((message) =>
      new RegExp(escapeRegExp(`Backend release snapshot: ${backendPath}`), "u").test(
        message,
      ),
    ),
    true,
  );
  assert.equal(
    logger.infoMessages.some((message) =>
      new RegExp(escapeRegExp(`Evidence bundle: ${evidencePath}`), "u").test(
        message,
      ),
    ),
    true,
  );
  assert.equal(
    logger.infoMessages.some((message) =>
      new RegExp(escapeRegExp(`Public result artifact: ${publicPath}`), "u").test(
        message,
      ),
    ),
    true,
  );
  assert.equal(
    logger.infoMessages.some((message) =>
      new RegExp(
        escapeRegExp(`Public integrity artifact: ${publicIntegrityPath}`),
        "u",
      ).test(message),
    ),
    true,
  );
  assert.equal(
    logger.infoMessages.some((message) =>
      new RegExp(
        escapeRegExp(`Reward payout artifact: ${rewardPayoutPath}`),
        "u",
      ).test(message),
    ),
    true,
  );
  assert.equal(
    logger.infoMessages.some((message) =>
      new RegExp(escapeRegExp(`Proof summary: ${summaryPath}`), "u").test(message),
    ),
    true,
  );
  assert.equal(
    logger.infoMessages.includes(
      "Validation proof record registered for prop_complete.",
    ),
    true,
  );
});

test("capture-validation-proof writes an incomplete proof summary when internal rehearsal is blocked and the public settled result is still missing", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-validation-proof-incomplete-"),
  );
  const logger = createLogger();
  const recordedRequests = [];

  const exitCode = await captureValidationProof({
    cwd: workspace,
    propositionId: "prop_incomplete",
    baseUrl: "https://arena.example",
    authToken: "secret-token",
    fetchImpl: async (url, init = {}) => {
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

      if (
        String(url).endsWith(
          "/arena/internal/rewards?propositionId=prop_incomplete&limit=100&offset=0",
        )
      ) {
        return jsonResponse({
          items: [],
          totalCount: 0,
          limit: 100,
          offset: 0,
        });
      }

      if (
        String(url).endsWith(
          "/arena/internal/rewards?propositionId=prop_incomplete&staleExecutionOnly=true&actionQueue=execution_recover&limit=1&offset=0",
        )
      ) {
        return jsonResponse({
          items: [],
          totalCount: 0,
          limit: 1,
          offset: 0,
        });
      }

      if (
        String(url).endsWith(
          "/arena/internal/rewards?propositionId=prop_incomplete&staleExecutionOnly=true&actionQueue=execution_confirm&limit=1&offset=0",
        )
      ) {
        return jsonResponse({
          items: [],
          totalCount: 0,
          limit: 1,
          offset: 0,
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

      if (String(url).endsWith("/arena/internal/validation-chain/proof-record")) {
        recordedRequests.push({
          url: String(url),
          method: init.method,
          authorization: init.headers.authorization,
          vercelBypass: init.headers["x-vercel-protection-bypass"] || null,
          body: JSON.parse(init.body),
        });
        return jsonResponse({ status: "stored" });
      }

      throw new Error(`Unexpected URL ${url}`);
    },
    logger,
  });

  assert.equal(exitCode, 1);

  const proofDir = path.join(workspace, "validation-rehearsal", "prop_incomplete");
  const summaryPath = path.join(proofDir, "proof-summary.json");
  const rewardPayoutPath = path.join(proofDir, "reward-payout-summary.json");
  assert.equal(fs.existsSync(summaryPath), true);
  assert.equal(fs.existsSync(rewardPayoutPath), true);

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
  assert.equal(summary.rewardPayout.totalLedgerEntries, 0);
  assert.equal(summary.artifacts.rewardPayoutSummary, rewardPayoutPath);
  assert.equal(recordedRequests.length, 1);
  assert.equal(recordedRequests[0].body.propositionId, "prop_incomplete");
  assert.equal(recordedRequests[0].vercelBypass, null);
  assert.equal(recordedRequests[0].body.proofComplete, false);
  assert.deepEqual(recordedRequests[0].body.failures, [
    "releaseReadiness.blocked",
    "validationRehearsal.blocked",
    "publicSettledResult.missing",
    "publicIntegrityOverview.missing",
  ]);
  assert.equal(recordedRequests[0].body.rewardPayoutStaleExecutingCount, 0);
  assert.equal(
    recordedRequests[0].body.rewardPayoutStaleExecutingWithoutTxHashCount,
    0,
  );
  assert.equal(
    recordedRequests[0].body
      .rewardPayoutStaleExecutingAwaitingConfirmationCount,
    0,
  );
  assert.equal(
    recordedRequests[0].body.rewardPayoutArtifactPath,
    rewardPayoutPath,
  );
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
  assert.equal(
    logger.infoMessages.includes("Suggested follow-up commands:"),
    true,
  );
  assert.equal(
    logger.infoMessages.includes(
      `- pnpm run validation:proof:capture -- --proposition-id prop_incomplete --env-file ${path.join(workspace, ".env")} --base-url https://arena.example --auth-token <operator-token>`,
    ),
    true,
  );
  assert.equal(
    logger.infoMessages.includes(
      `- pnpm run validation:ops:brief -- --proposition-id prop_incomplete --env-file ${path.join(workspace, ".env")} --base-url https://arena.example --auth-token <operator-token>`,
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
