const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  parseCliArgs,
  captureValidationOperatorBriefing,
} = require("./capture-validation-operator-briefing.cjs");

test("parseCliArgs resolves env-file, proposition id, base-url, auth token, output path, and output dir", () => {
  const parsed = parseCliArgs([
    "--env-file",
    "config/staging.env",
    "--proposition-id",
    "prop_ready",
    "--base-url",
    "https://arena.example",
    "--auth-token",
    "secret-token",
    "--output",
    "artifacts/operator-briefing.json",
    "--output-dir",
    "artifacts/operator-bundle",
  ]);

  assert.equal(parsed.envFilePath, "config/staging.env");
  assert.equal(parsed.propositionId, "prop_ready");
  assert.equal(parsed.baseUrl, "https://arena.example");
  assert.equal(parsed.authToken, "secret-token");
  assert.equal(parsed.outputPath, "artifacts/operator-briefing.json");
  assert.equal(parsed.outputDir, "artifacts/operator-bundle");
});

test("capture-validation-operator-briefing prioritizes release blockers and writes a unified operator artifact", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-validation-operator-release-"),
  );
  const logger = createLogger();

  const exitCode = await captureValidationOperatorBriefing({
    cwd: workspace,
    propositionId: "prop_release_blocked",
    baseUrl: "http://127.0.0.1:4000",
    authToken: "secret-token",
    fetchImpl: async (url, init = {}) => {
      if (String(url).endsWith("/arena/internal/monitoring/runtime-contract")) {
        assert.equal(init.headers.authorization, "Bearer secret-token");
        return jsonResponse({
          status: "degraded",
          generatedAt: "2026-06-03T00:00:00.000Z",
          environment: {
            nodeEnv: "production",
            validationEnvironment: "staging",
            port: 4000,
          },
          releaseReadiness: {
            status: "blocked",
            blockingDependencies: ["scheduler_queue"],
            completedGateCount: 3,
            totalGateCount: 4,
          },
          releaseChecklist: [
            {
              id: "readiness",
              status: "blocked",
              summary: "Restore scheduler worker processing before accepting traffic.",
              blockingDependencies: ["scheduler_queue"],
              commands: ["GET /health/ready", "GET /system/queues/overview"],
            },
          ],
          validationChain: {
            status: "degraded",
            operatorActions: [],
          },
          operatorSummary: {
            status: "action_required",
            requiresActionNow: true,
            focusArea: "readiness",
            summary:
              "Release is blocked at readiness: Restore scheduler worker processing before accepting traffic.",
            operatorActions: [
              "GET /health/ready",
              "GET /system/queues/overview",
            ],
            blockers: ["scheduler_queue"],
            latestRelevantEvidence: {
              action: "runtime_contract.alert.release_blocked",
              entityType: "runtime_contract",
              entityId: "global",
              reason: "scheduler worker heartbeat missing",
              createdAt: "2026-06-03T00:00:00.000Z",
            },
          },
        });
      }

      if (
        String(url).endsWith(
          "/arena/internal/propositions/prop_release_blocked/evidence-bundle",
        )
      ) {
        return jsonResponse({
          propositionId: "prop_release_blocked",
          propositionExport: {
            proposition: {
              id: "prop_release_blocked",
              title: "Release-blocked proposition",
            },
            validationOperatorSummary: {
              status: "ready",
              requiresActionNow: false,
              summary: "No active validation lifecycle drift.",
              plannedCommands: [],
              operatorActions: [],
              latestRelevantAudit: null,
            },
            validationRehearsal: {
              status: "ready",
              runbookPath: "docs/contracts/arena-validation-chain-runbook.md",
              summary: {
                completedStepCount: 5,
                remainingStepCount: 0,
                currentStepId: null,
                currentStepStatus: null,
                nextCommands: [],
                blockingReasons: [],
              },
            },
          },
        });
      }

      if (String(url).endsWith("/arena/internal/monitoring/validation-chain")) {
        assert.equal(init.headers.authorization, "Bearer secret-token");
        return jsonResponse({
          syncStatus: "idle",
          operatorSummary: {
            status: "ready",
            requiresActionNow: false,
            focusArea: "healthy",
            summary:
              "Validation-chain health is green. No operator recovery is required right now.",
            operatorActions: [],
            blockers: [],
            latestRelevantEvidence: null,
          },
        });
      }

      if (
        String(url).endsWith(
          "/arena/internal/rewards?propositionId=prop_release_blocked&limit=100&offset=0",
        )
      ) {
        return jsonResponse({
          items: [
            {
              ledgerId: "ledger_release_1",
              propositionId: "prop_release_blocked",
              status: "finalized",
              finalAmount: "80",
              payoutId: "payout_release_1",
              payoutStatus: "approved",
              payoutAmount: "80",
              payoutAssetSymbol: "USDC",
              payoutRequestedAt: "2026-06-03T00:01:00.000Z",
              payoutApprovedAt: "2026-06-03T00:02:00.000Z",
              payoutCompletedAt: null,
              payoutExecutionTxHash: null,
            },
          ],
          totalCount: 1,
          limit: 100,
          offset: 0,
        });
      }

      if (
        String(url).endsWith(
          "/arena/internal/rewards?propositionId=prop_release_blocked&staleExecutionOnly=true&actionQueue=execution_recover&limit=1&offset=0",
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
          "/arena/internal/rewards?propositionId=prop_release_blocked&staleExecutionOnly=true&actionQueue=execution_confirm&limit=1&offset=0",
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
          totalCount: 1,
          items: [
            {
              propositionId: "prop_release_blocked",
              title: "Release-blocked proposition",
              settledAt: "2026-06-03T00:05:00.000Z",
              settlementTxHash: "0xabc",
              resultKind: "resolved",
              winningOptionLabel: "Yes",
              onChain: true,
            },
          ],
        });
      }

      if (
        String(url).endsWith(
          "/arena/public/integrity/overview?propositionId=prop_release_blocked",
        )
      ) {
        return jsonResponse({
          generatedAt: "2026-06-03T00:06:00.000Z",
          archive: {
            settledCount: 1,
            onChainCount: 1,
            recentItems: [],
          },
          live: {
            totalCount: 0,
            reachedSampleThresholdCount: 0,
            marketEnabledCount: 0,
            phaseBreakdown: [],
          },
          focus: {
            propositionId: "prop_release_blocked",
            visible: true,
            source: "archive",
            archiveItem: {
              settledAt: "2026-06-03T00:05:00.000Z",
              settlementTxHash: "0xabc",
            },
          },
        });
      }

      throw new Error(`Unexpected URL ${url}`);
    },
    logger,
  });

  assert.equal(exitCode, 1);

  const outputPath = path.join(
    workspace,
    "validation-rehearsal",
    "prop_release_blocked",
    "operator-briefing.json",
  );
  assert.equal(fs.existsSync(outputPath), true);

  const briefing = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  assert.equal(briefing.currentOperatorPath.stage, "release");
  assert.equal(briefing.currentOperatorPath.status, "action_required");
  assert.deepEqual(briefing.currentOperatorPath.blockers, ["scheduler_queue"]);
  assert.equal(briefing.lanes.releaseOpsClosure.status, "action_required");
  assert.equal(briefing.lanes.runtimeHardening.status, "ready");
  assert.equal(briefing.lanes.mvpBetaGate.status, "action_required");
  assert.equal(briefing.surfaces.rewardPayout.summary.totalLedgerEntries, 1);
  assert.equal(briefing.surfaces.rewardPayout.summary.payoutStatusCounts.approved, 1);
  assert.equal(
    briefing.currentOperatorPath.runbookPaths.includes(
      "docs/contracts/arena-backend-release-runbook.md",
    ),
    true,
  );
  assert.equal(
    briefing.currentOperatorPath.operatorActions.includes("GET /health/ready"),
    true,
  );
  assert.deepEqual(logger.passMessages, []);
  assert.deepEqual(logger.failMessages, [
    "Validation operator briefing requires action.",
  ]);
  assert.match(logger.infoMessages[0], /Operator focus: release/u);
  assert.match(
    logger.infoMessages[2],
    /Release is blocked at readiness/u,
  );
});

test("capture-validation-operator-briefing prioritizes proposition rehearsal follow-through when global monitoring is green", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-validation-operator-proposition-"),
  );
  const logger = createLogger();

  const exitCode = await captureValidationOperatorBriefing({
    cwd: workspace,
    propositionId: "prop_rehearsal_blocked",
    baseUrl: "http://127.0.0.1:4000",
    authToken: "secret-token",
    fetchImpl: async (url, init = {}) => {
      if (String(url).endsWith("/arena/internal/monitoring/runtime-contract")) {
        assert.equal(init.headers.authorization, "Bearer secret-token");
        return jsonResponse({
          status: "ok",
          generatedAt: "2026-06-03T01:00:00.000Z",
          environment: {
            nodeEnv: "production",
            validationEnvironment: "staging",
            port: 4000,
          },
          releaseReadiness: {
            status: "ready",
            blockingDependencies: [],
            completedGateCount: 4,
            totalGateCount: 4,
          },
          releaseChecklist: [],
          validationChain: {
            status: "ok",
            operatorActions: [],
          },
          operatorSummary: {
            status: "ready",
            requiresActionNow: false,
            focusArea: "healthy",
            summary:
              "Release readiness is green. No operator release action is required right now.",
            operatorActions: [],
            blockers: [],
            latestRelevantEvidence: null,
          },
        });
      }

      if (
        String(url).endsWith(
          "/arena/internal/propositions/prop_rehearsal_blocked/evidence-bundle",
        )
      ) {
        return jsonResponse({
          propositionId: "prop_rehearsal_blocked",
          propositionExport: {
            proposition: {
              id: "prop_rehearsal_blocked",
              title: "Rehearsal-blocked proposition",
            },
            validationOperatorSummary: {
              status: "ready",
              requiresActionNow: false,
              summary:
                "No active validation lifecycle drift. No operator recovery is required right now.",
              plannedCommands: [],
              operatorActions: [],
              latestRelevantAudit: null,
            },
            validationRehearsal: {
              status: "blocked",
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
                ],
              },
            },
          },
        });
      }

      if (
        String(url).endsWith("/arena/internal/monitoring/validation-chain")
      ) {
        assert.equal(init.headers.authorization, "Bearer secret-token");
        return jsonResponse({
          syncStatus: "idle",
          operatorSummary: {
            status: "ready",
            requiresActionNow: false,
            focusArea: "healthy",
            summary:
              "Validation-chain health is green. No operator recovery is required right now.",
            operatorActions: [],
            blockers: [],
            latestRelevantEvidence: null,
          },
        });
      }

      if (
        String(url).endsWith(
          "/arena/internal/rewards?propositionId=prop_rehearsal_blocked&limit=100&offset=0",
        )
      ) {
        return jsonResponse({
          items: [
            {
              ledgerId: "ledger_rehearsal_1",
              propositionId: "prop_rehearsal_blocked",
              status: "finalized",
              finalAmount: "55",
              payoutId: "payout_rehearsal_1",
              payoutStatus: "executing",
              payoutAmount: "55",
              payoutAssetSymbol: "USDC",
              payoutRequestedAt: "2026-06-03T01:01:00.000Z",
              payoutApprovedAt: "2026-06-03T01:02:00.000Z",
              payoutCompletedAt: null,
              payoutExecutionTxHash: null,
            },
          ],
          totalCount: 1,
          limit: 100,
          offset: 0,
        });
      }

      if (
        String(url).endsWith(
          "/arena/internal/rewards?propositionId=prop_rehearsal_blocked&staleExecutionOnly=true&actionQueue=execution_recover&limit=1&offset=0",
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
          "/arena/internal/rewards?propositionId=prop_rehearsal_blocked&staleExecutionOnly=true&actionQueue=execution_confirm&limit=1&offset=0",
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
          "/arena/public/integrity/overview?propositionId=prop_rehearsal_blocked",
        )
      ) {
        return jsonResponse({
          generatedAt: "2026-06-03T01:06:00.000Z",
          archive: {
            settledCount: 0,
            onChainCount: 0,
            recentItems: [],
          },
          live: {
            totalCount: 1,
            reachedSampleThresholdCount: 0,
            marketEnabledCount: 1,
            phaseBreakdown: [],
          },
          focus: {
            propositionId: "prop_rehearsal_blocked",
            visible: true,
            source: "live",
            liveItem: {
              effectiveSampleCount: 12,
              requiredSampleCount: 20,
              progressPercent: 60,
              reachedSampleThreshold: false,
            },
          },
        });
      }

      throw new Error(`Unexpected URL ${url}`);
    },
    logger,
  });

  assert.equal(exitCode, 1);

  const outputPath = path.join(
    workspace,
    "validation-rehearsal",
    "prop_rehearsal_blocked",
    "operator-briefing.json",
  );
  const briefing = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  assert.equal(briefing.currentOperatorPath.stage, "proposition_rehearsal");
  assert.equal(briefing.lanes.releaseOpsClosure.status, "ready");
  assert.equal(briefing.lanes.runtimeHardening.status, "ready");
  assert.equal(briefing.lanes.mvpBetaGate.status, "action_required");
  assert.equal(
    briefing.surfaces.rewardPayout.summary.executingWithoutTxHashCount,
    1,
  );
  assert.equal(
    briefing.currentOperatorPath.operatorActions.includes(
      "POST /arena/internal/validation-chain/sync",
    ),
    true,
  );
  assert.equal(
    briefing.currentOperatorPath.blockers.includes(
      "no local validation bet has been persisted",
    ),
    true,
  );
  assert.deepEqual(logger.failMessages, [
    "Validation operator briefing requires action.",
  ]);
  assert.match(logger.infoMessages[0], /Operator focus: proposition_rehearsal/u);
});

test("capture-validation-operator-briefing reports a green operator path when all four lanes are ready", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-validation-operator-ready-"),
  );
  const logger = createLogger();

  const exitCode = await captureValidationOperatorBriefing({
    cwd: workspace,
    propositionId: "prop_ready",
    baseUrl: "http://127.0.0.1:4000",
    authToken: "secret-token",
    fetchImpl: async (url, init = {}) => {
      if (String(url).endsWith("/arena/internal/monitoring/runtime-contract")) {
        assert.equal(init.headers.authorization, "Bearer secret-token");
        return jsonResponse({
          status: "ok",
          generatedAt: "2026-06-03T02:00:00.000Z",
          environment: {
            nodeEnv: "production",
            validationEnvironment: "staging",
            port: 4000,
          },
          releaseReadiness: {
            status: "ready",
            blockingDependencies: [],
            completedGateCount: 4,
            totalGateCount: 4,
          },
          releaseChecklist: [],
          validationChain: {
            status: "ok",
            operatorActions: [],
          },
          operatorSummary: {
            status: "ready",
            requiresActionNow: false,
            focusArea: "healthy",
            summary:
              "Release readiness is green. No operator release action is required right now.",
            operatorActions: [],
            blockers: [],
            latestRelevantEvidence: null,
          },
        });
      }

      if (
        String(url).endsWith("/arena/internal/monitoring/validation-chain")
      ) {
        assert.equal(init.headers.authorization, "Bearer secret-token");
        return jsonResponse({
          syncStatus: "idle",
          operatorSummary: {
            status: "ready",
            requiresActionNow: false,
            focusArea: "healthy",
            summary:
              "Validation-chain health is green. No operator recovery is required right now.",
            operatorActions: [],
            blockers: [],
            latestRelevantEvidence: null,
          },
        });
      }

      if (
        String(url).endsWith("/arena/internal/propositions/prop_ready/evidence-bundle")
      ) {
        return jsonResponse({
          propositionId: "prop_ready",
          propositionExport: {
            proposition: {
              id: "prop_ready",
              title: "Ready proposition",
            },
            validationOperatorSummary: {
              status: "ready",
              requiresActionNow: false,
              summary:
                "No active validation lifecycle drift. No operator recovery is required right now.",
              plannedCommands: [],
              operatorActions: [],
              latestRelevantAudit: null,
            },
            validationRehearsal: {
              status: "ready",
              runbookPath: "docs/contracts/arena-validation-chain-runbook.md",
              summary: {
                completedStepCount: 5,
                remainingStepCount: 0,
                currentStepId: null,
                currentStepStatus: null,
                nextCommands: [],
                blockingReasons: [],
              },
            },
          },
        });
      }

      if (
        String(url).endsWith(
          "/arena/internal/rewards?propositionId=prop_ready&limit=100&offset=0",
        )
      ) {
        return jsonResponse({
          items: [
            {
              ledgerId: "ledger_ready_1",
              propositionId: "prop_ready",
              status: "finalized",
              finalAmount: "45",
              payoutId: "payout_ready_1",
              payoutStatus: "completed",
              payoutAmount: "45",
              payoutAssetSymbol: "USDC",
              payoutRequestedAt: "2026-06-03T02:01:00.000Z",
              payoutApprovedAt: "2026-06-03T02:02:00.000Z",
              payoutCompletedAt: "2026-06-03T02:03:00.000Z",
              payoutExecutionTxHash:
                "0x3333333333333333333333333333333333333333",
            },
          ],
          totalCount: 1,
          limit: 100,
          offset: 0,
        });
      }

      if (
        String(url).endsWith(
          "/arena/internal/rewards?propositionId=prop_ready&staleExecutionOnly=true&actionQueue=execution_recover&limit=1&offset=0",
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
          "/arena/internal/rewards?propositionId=prop_ready&staleExecutionOnly=true&actionQueue=execution_confirm&limit=1&offset=0",
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
          totalCount: 1,
          items: [
            {
              propositionId: "prop_ready",
              title: "Ready proposition",
              settledAt: "2026-06-03T02:05:00.000Z",
              settlementTxHash: "0xdef",
              resultKind: "resolved",
              winningOptionLabel: "No",
              onChain: true,
            },
          ],
        });
      }

      if (
        String(url).endsWith(
          "/arena/public/integrity/overview?propositionId=prop_ready",
        )
      ) {
        return jsonResponse({
          generatedAt: "2026-06-03T02:06:00.000Z",
          archive: {
            settledCount: 1,
            onChainCount: 1,
            recentItems: [],
          },
          live: {
            totalCount: 0,
            reachedSampleThresholdCount: 0,
            marketEnabledCount: 0,
            phaseBreakdown: [],
          },
          focus: {
            propositionId: "prop_ready",
            visible: true,
            source: "archive",
            archiveItem: {
              settledAt: "2026-06-03T02:05:00.000Z",
              settlementTxHash: "0xdef",
            },
          },
        });
      }

      throw new Error(`Unexpected URL ${url}`);
    },
    logger,
  });

  assert.equal(exitCode, 0);

  const outputPath = path.join(
    workspace,
    "validation-rehearsal",
    "prop_ready",
    "operator-briefing.json",
  );
  const briefing = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  assert.equal(briefing.currentOperatorPath.stage, "healthy");
  assert.equal(briefing.currentOperatorPath.status, "ready");
  assert.equal(briefing.lanes.releaseOpsClosure.status, "ready");
  assert.equal(briefing.lanes.runtimeHardening.status, "ready");
  assert.equal(briefing.lanes.mvpBetaGate.status, "ready");
  assert.equal(briefing.lanes.internalOpsClosure.status, "ready");
  assert.equal(briefing.surfaces.rewardPayout.summary.payoutStatusCounts.completed, 1);
  assert.equal(
    briefing.currentOperatorPath.proofCommands.includes(
      "pnpm run validation:proof:capture -- --proposition-id prop_ready --env-file " +
        path.join(workspace, ".env") +
        " --base-url http://127.0.0.1:4000 --auth-token <operator-token>",
    ),
    true,
  );
  assert.deepEqual(logger.failMessages, []);
  assert.deepEqual(logger.passMessages, [
    "Validation operator briefing captured for proposition prop_ready.",
  ]);
  assert.match(logger.infoMessages[0], /Operator focus: healthy/u);
});

test("capture-validation-operator-briefing prioritizes reward payout follow-through after the four proof verdicts are green", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-validation-operator-reward-payout-"),
  );
  const logger = createLogger();

  const exitCode = await captureValidationOperatorBriefing({
    cwd: workspace,
    propositionId: "prop_reward_followthrough",
    baseUrl: "http://127.0.0.1:4000",
    authToken: "secret-token",
    fetchImpl: async (url, init = {}) => {
      if (String(url).endsWith("/arena/internal/monitoring/runtime-contract")) {
        assert.equal(init.headers.authorization, "Bearer secret-token");
        return jsonResponse({
          status: "ok",
          generatedAt: "2026-06-08T02:00:00.000Z",
          environment: {
            nodeEnv: "production",
            validationEnvironment: "staging",
            port: 4000,
          },
          releaseReadiness: {
            status: "ready",
            blockingDependencies: [],
            completedGateCount: 4,
            totalGateCount: 4,
          },
          releaseChecklist: [],
          validationChain: {
            status: "ok",
            operatorActions: [],
          },
          operatorSummary: {
            status: "ready",
            requiresActionNow: false,
            focusArea: "healthy",
            summary:
              "Release readiness is green. No operator release action is required right now.",
            operatorActions: [],
            blockers: [],
            latestRelevantEvidence: null,
          },
        });
      }

      if (
        String(url).endsWith("/arena/internal/monitoring/validation-chain")
      ) {
        assert.equal(init.headers.authorization, "Bearer secret-token");
        return jsonResponse({
          syncStatus: "idle",
          operatorSummary: {
            status: "ready",
            requiresActionNow: false,
            focusArea: "healthy",
            summary:
              "Validation-chain health is green. No operator recovery is required right now.",
            operatorActions: [],
            blockers: [],
            latestRelevantEvidence: null,
          },
        });
      }

      if (
        String(url).endsWith(
          "/arena/internal/propositions/prop_reward_followthrough/evidence-bundle",
        )
      ) {
        return jsonResponse({
          propositionId: "prop_reward_followthrough",
          propositionExport: {
            proposition: {
              id: "prop_reward_followthrough",
              title: "Reward follow-through proposition",
            },
            validationOperatorSummary: {
              status: "ready",
              requiresActionNow: false,
              summary:
                "No active validation lifecycle drift. No operator recovery is required right now.",
              plannedCommands: [],
              operatorActions: [],
              latestRelevantAudit: null,
            },
            validationRehearsal: {
              status: "ready",
              runbookPath: "docs/contracts/arena-validation-chain-runbook.md",
              summary: {
                completedStepCount: 5,
                remainingStepCount: 0,
                currentStepId: null,
                currentStepStatus: null,
                nextCommands: [],
                blockingReasons: [],
              },
            },
          },
        });
      }

      if (
        String(url).endsWith(
          "/arena/internal/rewards?propositionId=prop_reward_followthrough&limit=100&offset=0",
        )
      ) {
        return jsonResponse({
          items: [
            {
              ledgerId: "ledger_reward_1",
              propositionId: "prop_reward_followthrough",
              status: "finalized",
              finalAmount: "35",
              payoutId: "payout_reward_1",
              payoutStatus: "approved",
              payoutAmount: "35",
              payoutAssetSymbol: "USDC",
              payoutRequestedAt: "2026-06-08T02:01:00.000Z",
              payoutApprovedAt: "2026-06-08T02:02:00.000Z",
              payoutCompletedAt: null,
              payoutExecutionTxHash: null,
            },
          ],
          totalCount: 1,
          limit: 100,
          offset: 0,
        });
      }

      if (
        String(url).endsWith(
          "/arena/internal/rewards?propositionId=prop_reward_followthrough&staleExecutionOnly=true&actionQueue=execution_recover&limit=1&offset=0",
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
          "/arena/internal/rewards?propositionId=prop_reward_followthrough&staleExecutionOnly=true&actionQueue=execution_confirm&limit=1&offset=0",
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
          totalCount: 1,
          items: [
            {
              propositionId: "prop_reward_followthrough",
              title: "Reward follow-through proposition",
              settledAt: "2026-06-08T02:05:00.000Z",
              settlementTxHash: "0x444",
              resultKind: "resolved",
              winningOptionLabel: "Yes",
              onChain: true,
            },
          ],
        });
      }

      if (
        String(url).endsWith(
          "/arena/public/integrity/overview?propositionId=prop_reward_followthrough",
        )
      ) {
        return jsonResponse({
          generatedAt: "2026-06-08T02:06:00.000Z",
          archive: {
            settledCount: 1,
            onChainCount: 1,
            recentItems: [],
          },
          live: {
            totalCount: 0,
            reachedSampleThresholdCount: 0,
            marketEnabledCount: 0,
            phaseBreakdown: [],
          },
          focus: {
            propositionId: "prop_reward_followthrough",
            visible: true,
            source: "archive",
            archiveItem: {
              settledAt: "2026-06-08T02:05:00.000Z",
              settlementTxHash: "0x444",
            },
          },
        });
      }

      throw new Error(`Unexpected URL ${url}`);
    },
    logger,
  });

  assert.equal(exitCode, 1);

  const outputPath = path.join(
    workspace,
    "validation-rehearsal",
    "prop_reward_followthrough",
    "operator-briefing.json",
  );
  const briefing = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  assert.equal(briefing.currentOperatorPath.stage, "reward_payout");
  assert.equal(briefing.currentOperatorPath.status, "action_required");
  assert.equal(
    briefing.currentOperatorPath.blockers.includes(
      "reward_payouts_pending_execution",
    ),
    true,
  );
  assert.equal(
    briefing.currentOperatorPath.operatorActions.includes(
      "GET /arena/internal/rewards?propositionId=prop_reward_followthrough",
    ),
    true,
  );
  assert.equal(briefing.lanes.mvpBetaGate.status, "ready");
  assert.equal(briefing.lanes.internalOpsClosure.status, "action_required");
  assert.deepEqual(logger.passMessages, []);
  assert.deepEqual(logger.failMessages, [
    "Validation operator briefing requires action.",
  ]);
  assert.match(logger.infoMessages[0], /Operator focus: reward_payout/u);
});

test("capture-validation-operator-briefing adds a stale execution recovery action when payout follow-through is blocked by stale executing payouts", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-validation-operator-stale-reward-payout-"),
  );
  const logger = createLogger();

  const exitCode = await captureValidationOperatorBriefing({
    cwd: workspace,
    propositionId: "prop_reward_stale_execution",
    baseUrl: "http://127.0.0.1:4000",
    authToken: "secret-token",
    fetchImpl: async (url, init = {}) => {
      if (String(url).endsWith("/arena/internal/monitoring/runtime-contract")) {
        assert.equal(init.headers.authorization, "Bearer secret-token");
        return jsonResponse({
          status: "ok",
          generatedAt: "2026-06-08T03:00:00.000Z",
          environment: {
            nodeEnv: "production",
            validationEnvironment: "staging",
            port: 4000,
          },
          releaseReadiness: {
            status: "ready",
            blockingDependencies: [],
            completedGateCount: 4,
            totalGateCount: 4,
          },
          releaseChecklist: [],
          validationChain: {
            status: "ok",
            operatorActions: [],
          },
          operatorSummary: {
            status: "ready",
            requiresActionNow: false,
            focusArea: "healthy",
            summary:
              "Release readiness is green. No operator release action is required right now.",
            operatorActions: [],
            blockers: [],
            latestRelevantEvidence: null,
          },
        });
      }

      if (
        String(url).endsWith("/arena/internal/monitoring/validation-chain")
      ) {
        assert.equal(init.headers.authorization, "Bearer secret-token");
        return jsonResponse({
          syncStatus: "idle",
          operatorSummary: {
            status: "ready",
            requiresActionNow: false,
            focusArea: "healthy",
            summary:
              "Validation-chain health is green. No operator recovery is required right now.",
            operatorActions: [],
            blockers: [],
            latestRelevantEvidence: null,
          },
        });
      }

      if (
        String(url).endsWith(
          "/arena/internal/propositions/prop_reward_stale_execution/evidence-bundle",
        )
      ) {
        return jsonResponse({
          propositionId: "prop_reward_stale_execution",
          propositionExport: {
            proposition: {
              id: "prop_reward_stale_execution",
              title: "Reward stale execution proposition",
            },
            validationOperatorSummary: {
              status: "ready",
              requiresActionNow: false,
              summary:
                "No active validation lifecycle drift. No operator recovery is required right now.",
              plannedCommands: [],
              operatorActions: [],
              latestRelevantAudit: null,
            },
            validationRehearsal: {
              status: "ready",
              runbookPath: "docs/contracts/arena-validation-chain-runbook.md",
              summary: {
                completedStepCount: 5,
                remainingStepCount: 0,
                currentStepId: null,
                currentStepStatus: null,
                nextCommands: [],
                blockingReasons: [],
              },
            },
          },
        });
      }

      if (
        String(url).endsWith(
          "/arena/internal/rewards?propositionId=prop_reward_stale_execution&limit=100&offset=0",
        )
      ) {
        return jsonResponse({
          items: [
            {
              ledgerId: "ledger_reward_stale_1",
              propositionId: "prop_reward_stale_execution",
              status: "finalized",
              finalAmount: "35",
              payoutId: "payout_reward_stale_1",
              payoutStatus: "executing",
              payoutAmount: "35",
              payoutAssetSymbol: "USDC",
              payoutRequestedAt: "2026-06-08T03:01:00.000Z",
              payoutApprovedAt: "2026-06-08T03:02:00.000Z",
              payoutCompletedAt: null,
              payoutExecutionTxHash: null,
            },
          ],
          totalCount: 1,
          limit: 100,
          offset: 0,
        });
      }

      if (
        String(url).endsWith(
          "/arena/internal/rewards?propositionId=prop_reward_stale_execution&staleExecutionOnly=true&actionQueue=execution_recover&limit=1&offset=0",
        )
      ) {
        return jsonResponse({
          items: [{ ledgerId: "ledger_reward_stale_1" }],
          totalCount: 1,
          limit: 1,
          offset: 0,
        });
      }

      if (
        String(url).endsWith(
          "/arena/internal/rewards?propositionId=prop_reward_stale_execution&staleExecutionOnly=true&actionQueue=execution_confirm&limit=1&offset=0",
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
          totalCount: 1,
          items: [
            {
              propositionId: "prop_reward_stale_execution",
              title: "Reward stale execution proposition",
              settledAt: "2026-06-08T03:05:00.000Z",
              settlementTxHash: "0x555",
              resultKind: "resolved",
              winningOptionLabel: "Yes",
              onChain: true,
            },
          ],
        });
      }

      if (
        String(url).endsWith(
          "/arena/public/integrity/overview?propositionId=prop_reward_stale_execution",
        )
      ) {
        return jsonResponse({
          generatedAt: "2026-06-08T03:06:00.000Z",
          archive: {
            settledCount: 1,
            onChainCount: 1,
            recentItems: [],
          },
          live: {
            totalCount: 0,
            reachedSampleThresholdCount: 0,
            marketEnabledCount: 0,
            phaseBreakdown: [],
          },
          focus: {
            propositionId: "prop_reward_stale_execution",
            visible: true,
            source: "archive",
            archiveItem: {
              settledAt: "2026-06-08T03:05:00.000Z",
              settlementTxHash: "0x555",
            },
          },
        });
      }

      throw new Error(`Unexpected URL ${url}`);
    },
    logger,
  });

  assert.equal(exitCode, 1);

  const outputPath = path.join(
    workspace,
    "validation-rehearsal",
    "prop_reward_stale_execution",
    "operator-briefing.json",
  );
  const briefing = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  assert.equal(briefing.currentOperatorPath.stage, "reward_payout");
  assert.equal(
    briefing.surfaces.rewardPayout.summary.staleExecutingCount,
    1,
  );
  assert.equal(
    briefing.surfaces.rewardPayout.summary.staleExecutingWithoutTxHashCount,
    1,
  );
  assert.equal(
    briefing.currentOperatorPath.blockers.includes(
      "stale_executing_reward_payouts_missing_tx_hash",
    ),
    true,
  );
  assert.equal(
    briefing.currentOperatorPath.operatorActions.includes(
      "GET /arena/internal/rewards?propositionId=prop_reward_stale_execution&staleExecutionOnly=true",
    ),
    true,
  );
  assert.deepEqual(logger.passMessages, []);
  assert.deepEqual(logger.failMessages, [
    "Validation operator briefing requires action.",
  ]);
  assert.match(logger.infoMessages[0], /Operator focus: reward_payout/u);
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
