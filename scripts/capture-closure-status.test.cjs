const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  captureClosureStatus,
  collectDiscoveredCandidates,
  evaluateExternalExecution,
  parseArgs,
  probeBaseUrlAccess,
  summarizeRepoGates,
} = require("./capture-closure-status.cjs");

test("parseArgs resolves closure status inputs", () => {
  const parsed = parseArgs([
    "--env-file",
    "config/staging.env",
    "--previous-env",
    "config/staging.previous.env",
    "--base-url",
    "https://arena.example",
    "--auth-token",
    "secret-token",
    "--proposition-id",
    "prop_stage_1",
    "--validation-network",
    "sepolia",
    "--identity-runs",
    "5",
    "--output",
    "artifacts/closure-status.json",
    "--log-dir",
    "artifacts/logs",
  ]);

  assert.equal(parsed.envFilePath, "config/staging.env");
  assert.equal(parsed.previousEnvPath, "config/staging.previous.env");
  assert.equal(parsed.baseUrl, "https://arena.example");
  assert.equal(parsed.authToken, "secret-token");
  assert.equal(parsed.propositionId, "prop_stage_1");
  assert.equal(parsed.validationNetwork, "sepolia");
  assert.equal(parsed.identityRuns, 5);
  assert.equal(parsed.outputPath, "artifacts/closure-status.json");
  assert.equal(parsed.logDir, "artifacts/logs");
});

test("summarizeRepoGates groups repeated identity runs and tracks pass state", () => {
  const summary = summarizeRepoGates([
    {
      gateId: "api:test:identity",
      status: 0,
    },
    {
      gateId: "api:test:identity",
      status: 0,
    },
    {
      gateId: "api:test:payout-release",
      status: 0,
    },
    {
      gateId: "backend:release:repo:test",
      status: 1,
    },
  ]);

  assert.equal(summary.allPassed, false);
  assert.deepEqual(summary.gates["api:test:identity"], {
    passed: true,
    runCount: 2,
  });
  assert.deepEqual(summary.gates["backend:release:repo:test"], {
    passed: false,
    runCount: 1,
  });
});

test("evaluateExternalExecution marks local envs and missing staging inputs as blockers", () => {
  const evaluation = evaluateExternalExecution({
    authToken: "",
    baseUrl: "http://127.0.0.1:4000",
    envExists: true,
    envFilePath: "F:/arena_blockchain/.env",
    loadedEnv: {
      ARENA_VALIDATION_ENVIRONMENT: "local",
      CHAIN_ID: "1337",
      RPC_URL: "http://127.0.0.1:8545",
    },
    previousEnvPath: "",
    propositionId: "",
    validationNetwork: "validation",
  });

  assert.equal(evaluation.ready, false);
  assert.deepEqual(
    evaluation.blockers,
    [
      "previous_env_missing",
      "base_url_is_local",
      "proposition_id_missing",
      "operator_token_missing",
      "release_env_is_local",
      "rpc_url_is_local",
      "chain_id_is_local",
    ],
  );
});

test("evaluateExternalExecution keeps non-local closure blocked when staging infra wiring is still missing", () => {
  const evaluation = evaluateExternalExecution({
    authToken: "staging-token",
    baseUrl: "https://arena.example",
    envExists: true,
    envFilePath: "F:/arena_blockchain/config/staging.env",
    loadedEnv: {
      ARENA_VALIDATION_ENVIRONMENT: "staging",
      CHAIN_ID: "11155111",
      RPC_URL: "https://ethereum-sepolia-rpc.publicnode.com",
    },
    previousEnvPath: "F:/arena_blockchain/config/staging.previous.env",
    propositionId: "prop_stage_1",
    validationNetwork: "validation",
  });

  assert.equal(evaluation.ready, false);
  assert.deepEqual(
    evaluation.blockers,
    [
      "database_url_missing",
      "redis_url_missing",
      "legacy_contract_address_missing",
      "validation_contract_address_missing",
      "reward_payout_token_missing",
      "ops_alert_targets_missing",
    ],
  );
});

test("evaluateExternalExecution marks deployment-protected staging hosts as blocked", () => {
  const evaluation = evaluateExternalExecution({
    authToken: "staging-token",
    baseUrl: "https://arena.example",
    baseUrlAccess: {
      protection: "vercel_deployment_protection_required",
      statusCode: 401,
      url: "https://arena.example/health/live",
    },
    envExists: true,
    envFilePath: "F:/arena_blockchain/config/staging.env",
    loadedEnv: {
      ARENA_VALIDATION_ENVIRONMENT: "staging",
      CHAIN_ID: "11155111",
      DATABASE_URL: "postgresql://arena:arena@db.example/arena?schema=public",
      REDIS_URL: "redis://redis.example:6379/0",
      RPC_URL: "https://ethereum-sepolia-rpc.publicnode.com",
      ARENA_CONTRACT_ADDRESS: "0x1111111111111111111111111111111111111111",
      ARENA_VALIDATION_CONTRACT_ADDRESS: "0x2222222222222222222222222222222222222222",
      ARENA_REWARD_PAYOUT_ERC20_ADDRESS: "0x3333333333333333333333333333333333333333",
      ARENA_OPS_ALERT_WEBHOOK_TARGETS: "ops:https://alerts.example/hook",
    },
    previousEnvPath: "F:/arena_blockchain/config/staging.previous.env",
    propositionId: "prop_stage_1",
    validationNetwork: "validation",
  });

  assert.equal(evaluation.ready, false);
  assert.deepEqual(evaluation.blockers, ["base_url_deployment_protected"]);
  assert.equal(evaluation.baseUrlAccess?.protection, "vercel_deployment_protection_required");
});

test("captureClosureStatus auto-detects Vercel deployment protection for non-local base URLs", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-closure-status-vercel-protected-"),
  );
  const envFilePath = path.join(workspace, "config", "staging.env");
  const previousEnvPath = path.join(workspace, "config", "staging.previous.env");
  const outputPath = path.join(workspace, "validation-local", "closure-status.json");

  fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
  fs.writeFileSync(
    envFilePath,
    [
      "DATABASE_URL=postgresql://arena:arena@db.example/arena?schema=public",
      "REDIS_URL=redis://redis.example:6379/0",
      "RPC_URL=https://ethereum-sepolia-rpc.publicnode.com",
      "CHAIN_ID=11155111",
      "ARENA_VALIDATION_ENVIRONMENT=staging",
      "ARENA_INTERNAL_OPERATOR_BEARER_TOKEN=staging-token",
      "ARENA_CONTRACT_ADDRESS=0x1111111111111111111111111111111111111111",
      "ARENA_VALIDATION_CONTRACT_ADDRESS=0x2222222222222222222222222222222222222222",
      "ARENA_REWARD_PAYOUT_ERC20_ADDRESS=0x3333333333333333333333333333333333333333",
      "ARENA_OPS_ALERT_WEBHOOK_TARGETS=ops:https://alerts.example/hook",
      "",
    ].join("\n"),
    "utf8",
  );
  fs.writeFileSync(previousEnvPath, "JWT_SECRET=previous\n", "utf8");

  const logger = createLogger();
  const exitCode = await captureClosureStatus({
    baseUrl: "https://arena.example",
    cwd: workspace,
    envFilePath,
    fetchImpl: async () => ({
      status: 401,
      async text() {
        return "This page requires Vercel authentication";
      },
    }),
    identityRuns: 1,
    logger,
    now: new Date("2026-06-15T08:00:00.000Z"),
    outputPath,
    previousEnvPath,
    propositionId: "",
    runCommand(command) {
      return {
        endedAt: new Date("2026-06-15T08:00:02.000Z"),
        error: null,
        signal: null,
        startedAt: new Date("2026-06-15T08:00:01.000Z"),
        status: 0,
        stderr: "",
        stdout: `ok ${command.label}\n`,
      };
    },
  });

  assert.equal(exitCode, 2);
  const summary = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  assert.deepEqual(summary.externalExecution.blockers, [
    "base_url_deployment_protected",
    "proposition_id_missing",
  ]);
  assert.equal(
    summary.requiredExternalMaterials.baseUrl.status,
    "deployment_protected_requires_vercel_auth",
  );
  assert.equal(summary.requiredExternalMaterials.vercelAccess.status, "missing");
  assert.equal(
    summary.manualActionChecklist.some((item) => item.id === "vercel_access"),
    true,
  );
});

test("probeBaseUrlAccess falls back to the Windows probe when fetch fails", async () => {
  const probe = await probeBaseUrlAccess({
    baseUrl: "https://arena.example",
    commandRunner(command, args) {
      assert.equal(command, "powershell");
      assert.equal(args.includes("-Command"), true);

      return {
        error: null,
        status: 0,
        stderr: "",
        stdout: JSON.stringify({
          body: "This page requires Vercel authentication",
          error: null,
          statusCode: 401,
        }),
      };
    },
    fetchImpl: async () => {
      throw new Error("fetch failed");
    },
    platform: "win32",
  });

  assert.deepEqual(probe, {
    protection: "vercel_deployment_protection_required",
    statusCode: 401,
    url: "https://arena.example/health/live",
  });
});

test("probeBaseUrlAccess treats 401 on vercel.app hosts as deployment protection even without body text", async () => {
  const probe = await probeBaseUrlAccess({
    baseUrl: "https://arenablockchain-5kx617r63-dirreck-h-s-projects.vercel.app",
    commandRunner() {
      return {
        error: null,
        status: 0,
        stderr: "",
        stdout: JSON.stringify({
          body: "",
          error: null,
          statusCode: 401,
        }),
      };
    },
    fetchImpl: async () => {
      throw new Error("fetch failed");
    },
    platform: "win32",
  });

  assert.deepEqual(probe, {
    protection: "vercel_deployment_protection_required",
    statusCode: 401,
    url: "https://arenablockchain-5kx617r63-dirreck-h-s-projects.vercel.app/health/live",
  });
});

test("captureClosureStatus writes a repo-side green summary while external execution remains blocked", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-closure-status-"),
  );
  const envFilePath = path.join(workspace, ".env");
  const outputPath = path.join(workspace, "validation-local", "closure-status.json");
  const logDir = path.join(workspace, "validation-local", "closure-logs");

  fs.writeFileSync(
    envFilePath,
    [
      "DATABASE_URL=postgresql://arena:arena@127.0.0.1:5432/arena?schema=public",
      "REDIS_URL=redis://127.0.0.1:6379/0",
      "RPC_URL=http://127.0.0.1:8545",
      "CHAIN_ID=1337",
      "ARENA_VALIDATION_ENVIRONMENT=local",
      "ARENA_INTERNAL_OPERATOR_BEARER_TOKEN=local-token",
      "",
    ].join("\n"),
    "utf8",
  );

  const logger = createLogger();
  const exitCode = await captureClosureStatus({
    cwd: workspace,
    envFilePath,
    identityRuns: 2,
    logger,
    now: new Date("2026-06-10T13:49:29.714Z"),
    runCommand(command) {
      return {
        endedAt: new Date("2026-06-10T13:49:31.000Z"),
        error: null,
        signal: null,
        startedAt: new Date("2026-06-10T13:49:30.000Z"),
        status: 0,
        stderr: "",
        stdout: `ok ${command.label}\n`,
      };
    },
  });

  assert.equal(exitCode, 2);
  const summary = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  assert.equal(summary.repoGates.status, "passed");
  assert.equal(summary.repoGates.identityRuns, 2);
  assert.equal(summary.repoGates.allPassed, true);
  assert.equal(summary.externalExecution.ready, false);
  assert.equal(summary.externalExecution.validationEnvironment, "local");
  assert.equal(
    summary.externalExecution.blockers.includes("release_env_is_local"),
    true,
  );
  assert.equal(
    summary.externalExecution.blockers.includes("base_url_missing"),
    true,
  );
  assert.equal(summary.taskStatus.N1.status, "repo_side_verified");
  assert.equal(summary.taskStatus.N3.status, "externally_blocked");
  assert.equal(
    summary.requiredExternalMaterials.cleanHostIdentityGate.status,
    "pending_clean_host_proof",
  );
  assert.equal(summary.requiredExternalMaterials.baseUrl.status, "missing");
  assert.equal(summary.requiredExternalMaterials.vercelAccess.status, "not_required");
  assert.equal(summary.requiredExternalMaterials.operatorToken.status, "present");
  assert.equal(summary.requiredExternalMaterials.databaseUrl.status, "present");
  assert.equal(summary.requiredExternalMaterials.redisUrl.status, "present");
  assert.equal(
    summary.requiredExternalMaterials.rpcUrl.status,
    "invalid_local_value",
  );
  assert.equal(
    summary.requiredExternalMaterials.legacyContractAddress.status,
    "present",
  );
  assert.equal(
    summary.requiredExternalMaterials.validationContractAddress.status,
    "present",
  );
  assert.equal(
    summary.requiredExternalMaterials.rewardPayoutToken.status,
    "present",
  );
  assert.equal(
    summary.requiredExternalMaterials.opsAlertTargets.status,
    "present",
  );
  assert.equal(summary.requiredExternalMaterials.propositionId.status, "missing");
  assert.equal(
    summary.requiredExternalMaterials.previousReleaseEnv.status,
    "missing",
  );
  assert.equal(summary.requiredExternalMaterials.validationSignerFunding.status, "unknown");
  assert.equal(Array.isArray(summary.manualActionChecklist), true);
  assert.equal(summary.manualActionChecklist.some((item) => item.id === "clean_host_identity_gate"), true);
  assert.equal(fs.existsSync(path.join(logDir, "01-api-test-identity-run-1.log")), true);
  assert.equal(fs.existsSync(path.join(logDir, "02-api-test-identity-run-2.log")), true);
  assert.equal(
    logger.passMessages.includes("Closure status captured with green repo-side gates."),
    true,
  );
});

test("captureClosureStatus recognizes accepted Docker clean-host identity proof", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-closure-status-clean-host-proof-"),
  );
  const envFilePath = path.join(workspace, ".env");
  const outputPath = path.join(workspace, "validation-local", "closure-status.json");
  const proofPath = path.join(
    workspace,
    "validation-local",
    "identity-clean-host-docker-summary.json",
  );

  fs.mkdirSync(path.dirname(proofPath), { recursive: true });
  fs.writeFileSync(
    envFilePath,
    [
      "DATABASE_URL=postgresql://arena:arena@127.0.0.1:5432/arena?schema=public",
      "REDIS_URL=redis://127.0.0.1:6379/0",
      "RPC_URL=http://127.0.0.1:8545",
      "CHAIN_ID=1337",
      "ARENA_VALIDATION_ENVIRONMENT=local",
      "ARENA_INTERNAL_OPERATOR_BEARER_TOKEN=local-token",
      "",
    ].join("\n"),
    "utf8",
  );
  fs.writeFileSync(
    proofPath,
    JSON.stringify(
      {
        accepted: true,
        checkedAt: "2026-06-16T02:33:00.000Z",
        consecutivePasses: 5,
        requiredConsecutivePasses: 5,
        runsCompleted: 5,
        runsRequested: 5,
        runs: Array.from({ length: 5 }, (_, index) => ({
          endedAt: `2026-06-16T02:3${index}:59.000Z`,
          label: `docker:run:identity-clean-host#${index + 1}`,
          startedAt: `2026-06-16T02:2${index}:00.000Z`,
          status: 0,
        })),
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  const logger = createLogger();
  const exitCode = await captureClosureStatus({
    cwd: workspace,
    envFilePath,
    identityRuns: 2,
    logger,
    now: new Date("2026-06-16T03:20:00.000Z"),
    outputPath,
    runCommand(command) {
      return {
        endedAt: new Date("2026-06-16T03:20:02.000Z"),
        error: null,
        signal: null,
        startedAt: new Date("2026-06-16T03:20:01.000Z"),
        status: 0,
        stderr: "",
        stdout: `ok ${command.label}\n`,
      };
    },
  });

  assert.equal(exitCode, 2);
  const summary = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  assert.equal(summary.taskStatus.N1.status, "clean_host_verified");
  assert.deepEqual(summary.taskStatus.N1.blockers, []);
  assert.equal(summary.requiredExternalMaterials.cleanHostIdentityGate.status, "present");
  assert.equal(
    summary.manualActionChecklist.some((item) => item.id === "clean_host_identity_gate"),
    false,
  );
  assert.equal(
    summary.existingArtifacts.validationLocal.identityCleanHostDockerSummary,
    proofPath,
  );
});
test("captureClosureStatus ignores non-accepted Docker clean-host summaries", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-closure-status-clean-host-summary-false-"),
  );
  const envFilePath = path.join(workspace, ".env");
  const outputPath = path.join(workspace, "validation-local", "closure-status.json");
  const proofPath = path.join(
    workspace,
    "validation-local",
    "identity-clean-host-docker-summary.json",
  );

  fs.mkdirSync(path.dirname(proofPath), { recursive: true });
  fs.writeFileSync(
    envFilePath,
    [
      "DATABASE_URL=postgresql://arena:arena@127.0.0.1:5432/arena?schema=public",
      "REDIS_URL=redis://127.0.0.1:6379/0",
      "RPC_URL=http://127.0.0.1:8545",
      "CHAIN_ID=1337",
      "ARENA_VALIDATION_ENVIRONMENT=local",
      "ARENA_INTERNAL_OPERATOR_BEARER_TOKEN=local-token",
      "",
    ].join("\n"),
    "utf8",
  );
  fs.writeFileSync(
    proofPath,
    JSON.stringify(
      {
        accepted: false,
        checkedAt: "2026-06-16T02:33:00.000Z",
        consecutivePasses: 1,
        requiredConsecutivePasses: 5,
        runsCompleted: 1,
        runsRequested: 1,
        runs: [
          {
            endedAt: "2026-06-16T02:33:59.000Z",
            label: "docker:run:identity-clean-host#1",
            startedAt: "2026-06-16T02:33:00.000Z",
            status: 0,
          },
        ],
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  const logger = createLogger();
  const exitCode = await captureClosureStatus({
    cwd: workspace,
    envFilePath,
    identityRuns: 1,
    logger,
    now: new Date("2026-06-16T03:20:00.000Z"),
    outputPath,
    runCommand(command) {
      return {
        endedAt: new Date("2026-06-16T03:20:02.000Z"),
        error: null,
        signal: null,
        startedAt: new Date("2026-06-16T03:20:01.000Z"),
        status: 0,
        stderr: "",
        stdout: `ok ${command.label}\n`,
      };
    },
  });

  assert.equal(exitCode, 2);
  const summary = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  assert.equal(summary.taskStatus.N1.status, "repo_side_verified");
  assert.equal(
    summary.requiredExternalMaterials.cleanHostIdentityGate.status,
    "pending_clean_host_proof",
  );
  assert.equal(
    summary.manualActionChecklist.some((item) => item.id === "clean_host_identity_gate"),
    true,
  );
});
test("captureClosureStatus can resume from existing successful gate logs", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-closure-status-resume-"),
  );
  const envFilePath = path.join(workspace, ".env");
  const outputPath = path.join(workspace, "validation-local", "closure-status.json");
  const logDir = path.join(workspace, "validation-local", "closure-logs");

  fs.mkdirSync(logDir, { recursive: true });
  fs.writeFileSync(
    envFilePath,
    [
      "DATABASE_URL=postgresql://arena:arena@127.0.0.1:5432/arena?schema=public",
      "REDIS_URL=redis://127.0.0.1:6379/0",
      "RPC_URL=http://127.0.0.1:8545",
      "CHAIN_ID=1337",
      "ARENA_VALIDATION_ENVIRONMENT=local",
      "",
    ].join("\n"),
    "utf8",
  );
  fs.writeFileSync(
    path.join(logDir, "01-api-test-identity-run-1.log"),
    [
      "label: api:test:identity#1",
      "gateId: api:test:identity",
      "command: pnpm run api:test:identity",
      "startedAt: 2026-06-10T13:00:00.000Z",
      "endedAt: 2026-06-10T13:10:00.000Z",
      "durationMs: 600000",
      "status: 0",
      "signal: ",
      "",
      "stdout:",
      "ok",
      "",
      "stderr:",
      "",
    ].join("\n"),
    "utf8",
  );

  const executed = [];
  const logger = createLogger();
  const exitCode = await captureClosureStatus({
    cwd: workspace,
    envFilePath,
    identityRuns: 1,
    logger,
    now: new Date("2026-06-10T13:49:29.714Z"),
    resume: true,
    runCommand(command) {
      executed.push(command.label);
      return {
        endedAt: new Date("2026-06-10T13:49:31.000Z"),
        error: null,
        signal: null,
        startedAt: new Date("2026-06-10T13:49:30.000Z"),
        status: 0,
        stderr: "",
        stdout: `ok ${command.label}\n`,
      };
    },
  });

  assert.equal(exitCode, 2);
  assert.deepEqual(executed, [
    "api:test:payout-release",
    "api:test:hardening",
    "validation:repo:test",
    "backend:release:repo:test",
  ]);

  const summary = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  assert.equal(summary.repoGates.resume, true);
  assert.equal(summary.commandResults[0].label, "api:test:identity#1");
  assert.equal(summary.commandResults[0].status, 0);
  assert.equal(
    logger.infoMessages.some((message) =>
      message.includes("Reusing api:test:identity#1"),
    ),
    true,
  );
});

test("captureClosureStatus prefers non-local base-url candidates and keeps local proof fallbacks candidate-only", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-closure-status-staging-candidate-selection-"),
  );
  const envFilePath = path.join(workspace, "config", "staging.env");
  const previousEnvPath = path.join(workspace, "config", "staging.previous.env");
  const manifestPath = path.join(
    workspace,
    "config",
    "staging.closure-inputs.json",
  );
  const proofDir = path.join(
    workspace,
    "validation-rehearsal",
    "proposition_dd7d7739-ac57-40a4-a7c8-8edef5d111e9",
  );
  const operatorBriefingPath = path.join(proofDir, "operator-briefing.json");
  const proofSummaryPath = path.join(proofDir, "proof-summary.json");
  const outputPath = path.join(
    workspace,
    "validation-local",
    "closure-status.json",
  );
  const propositionId = "proposition_dd7d7739-ac57-40a4-a7c8-8edef5d111e9";

  fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
  fs.mkdirSync(proofDir, { recursive: true });
  fs.writeFileSync(
    envFilePath,
    [
      "DATABASE_URL=postgresql://arena:arena@db.example/arena?schema=public",
      "REDIS_URL=redis://redis.example:6379/0",
      "RPC_URL=https://ethereum-sepolia-rpc.publicnode.com",
      "CHAIN_ID=11155111",
      "ARENA_VALIDATION_ENVIRONMENT=staging",
      "ARENA_INTERNAL_API_BASE_URL=https://arenablockchain-5kx617r63-dirreck-h-s-projects.vercel.app",
      "ARENA_INTERNAL_OPERATOR_BEARER_TOKEN=staging-token",
      "ARENA_CONTRACT_ADDRESS=0x1111111111111111111111111111111111111111",
      "ARENA_VALIDATION_CONTRACT_ADDRESS=0x2222222222222222222222222222222222222222",
      "ARENA_REWARD_PAYOUT_ERC20_ADDRESS=0x3333333333333333333333333333333333333333",
      "ARENA_OPS_ALERT_WEBHOOK_TARGETS=ops:https://alerts.example/hook",
      "",
    ].join("\n"),
    "utf8",
  );
  fs.writeFileSync(previousEnvPath, "JWT_SECRET=previous\n", "utf8");
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        baseUrlCandidates: [
          {
            origin: "https://arenablockchain-4nehm2u0g-dirreck-h-s-projects.vercel.app",
            suitability: "deployment_candidate_requires_access_and_api_route_verification",
          },
          {
            origin: "https://arenablockchain-5kx617r63-dirreck-h-s-projects.vercel.app",
            suitability: "deployment_candidate_requires_access_and_api_route_verification",
          },
        ],
        propositionId,
        propositionIdCandidates: [
          {
            propositionId,
            suitability: "local_proof_candidate_only_replace_with_real_staging_proposition",
          },
        ],
        propositionIdStatus: "local_candidate_only_replace_with_real_staging_proposition",
      },
      null,
      2,
    ),
    "utf8",
  );
  fs.writeFileSync(
    operatorBriefingPath,
    JSON.stringify(
      {
        propositionEvidence: {
          route: `http://127.0.0.1:4000/arena/internal/propositions/${propositionId}/evidence-bundle`,
        },
      },
      null,
      2,
    ),
    "utf8",
  );
  fs.writeFileSync(
    proofSummaryPath,
    JSON.stringify(
      {
        propositionId,
        proofComplete: true,
      },
      null,
      2,
    ),
    "utf8",
  );

  const logger = createLogger();
  const exitCode = await captureClosureStatus({
    cwd: workspace,
    envFilePath,
    logger,
    outputPath,
    previousEnvPath,
    propositionId,
    baseUrlAccess: {
      protection: "vercel_deployment_protection_required",
      statusCode: 401,
      url: "https://arenablockchain-5kx617r63-dirreck-h-s-projects.vercel.app/health/live",
    },
    runCommand(command) {
      return {
        endedAt: new Date("2026-06-15T12:00:02.000Z"),
        error: null,
        signal: null,
        startedAt: new Date("2026-06-15T12:00:01.000Z"),
        status: 0,
        stderr: "",
        stdout: `ok ${command.label}\n`,
      };
    },
  });

  assert.equal(exitCode, 2);
  const summary = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  assert.equal(
    summary.requiredExternalMaterials.baseUrl.candidate.origin,
    "https://arenablockchain-5kx617r63-dirreck-h-s-projects.vercel.app",
  );
  assert.equal(summary.requiredExternalMaterials.baseUrl.candidate.isLocal, false);
  assert.equal(summary.requiredExternalMaterials.propositionId.status, "candidate_only");
});

test("collectDiscoveredCandidates surfaces local proof, proof-record, env, and base-url hints", () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-closure-discovery-"),
  );
  const propositionId = "proposition_dd7d7739-ac57-40a4-a7c8-8edef5d111e9";
  const proofDir = path.join(workspace, "validation-rehearsal", propositionId);
  const proofRecordPath = path.join(
    workspace,
    "docs",
    "contracts",
    "validation-proof-record-003.md",
  );
  const nextSlicesPath = path.join(workspace, "docs", "NEXT_SLICES.md");
  const rootEnvPath = path.join(workspace, ".env");
  const releaseEnvPath = path.join(
    workspace,
    "validation-local",
    "release-rehearsal.env",
  );
  const operatorBriefingPath = path.join(proofDir, "operator-briefing.json");
  const proofSummaryPath = path.join(proofDir, "proof-summary.json");

  fs.mkdirSync(path.dirname(proofRecordPath), { recursive: true });
  fs.mkdirSync(path.dirname(releaseEnvPath), { recursive: true });
  fs.mkdirSync(proofDir, { recursive: true });

  fs.writeFileSync(
    proofRecordPath,
    [
      "# Validation Proof Record 003",
      "",
      "`Record`: 003",
      "`Captured At`: 2026-06-03",
      "`Environment`: local Hardhat + local API(all role) + Postgres + Redis",
      "",
      "## Proven proposition",
      "",
      `- \`propositionId\`: \`${propositionId}\``,
      "",
    ].join("\n"),
    "utf8",
  );
  fs.writeFileSync(
    nextSlicesPath,
    [
      "## Proof pointer",
      "",
      "- latest proof proposition:",
      `  - \`${propositionId}\``,
      "",
    ].join("\n"),
    "utf8",
  );
  fs.writeFileSync(
    rootEnvPath,
    [
      "ARENA_VALIDATION_ENVIRONMENT=local",
      "RPC_URL=http://127.0.0.1:8545",
      "CHAIN_ID=1337",
      "ARENA_INTERNAL_OPERATOR_BEARER_TOKEN=local-token",
      "",
    ].join("\n"),
    "utf8",
  );
  fs.writeFileSync(
    releaseEnvPath,
    [
      "ARENA_VALIDATION_ENVIRONMENT=local",
      "RPC_URL=http://127.0.0.1:8545",
      "ARENA_COMPOSE_RPC_URL=http://host.docker.internal:8545",
      "CHAIN_ID=1337",
      "",
    ].join("\n"),
    "utf8",
  );
  fs.writeFileSync(
    operatorBriefingPath,
    JSON.stringify(
      {
        propositionEvidence: {
          route: `http://127.0.0.1:4000/arena/internal/propositions/${propositionId}/evidence-bundle`,
        },
      },
      null,
      2,
    ),
    "utf8",
  );
  fs.writeFileSync(
    proofSummaryPath,
    JSON.stringify(
      {
        propositionId,
        proofComplete: true,
      },
      null,
      2,
    ),
    "utf8",
  );

  const existingArtifacts = {
    validationLocal: {
      dependencyAuditProd: null,
      operatorMonitoringProof: null,
      releaseRehearsalEnv: releaseEnvPath,
      secretRotationAudit: null,
    },
    validationProofs: [
      {
        backendReleaseReadiness: null,
        directory: proofDir,
        evidenceBundle: null,
        operatorBriefing: operatorBriefingPath,
        proofSummary: proofSummaryPath,
        propositionId,
        publicIntegrityOverview: null,
        publicSettledResult: null,
        rewardPayoutSummary: null,
        validationChainMonitoring: null,
      },
    ],
  };

  const discovered = collectDiscoveredCandidates(workspace, existingArtifacts);

  assert.equal(discovered.latestLocalProofPropositionId, propositionId);
  assert.equal(discovered.localProofPropositionCandidates[0].propositionId, propositionId);
  assert.equal(
    discovered.localProofPropositionCandidates[0].proofRecordDocs[0],
    proofRecordPath,
  );
  assert.equal(
    discovered.localProofPropositionCandidates[0].isLatestDocumentedLocalProof,
    true,
  );
  assert.equal(discovered.proofRecordDocs[0].propositionId, propositionId);
  assert.equal(discovered.proofRecordDocs[0].record, "003");
  assert.equal(discovered.envFileCandidates.length, 2);
  assert.deepEqual(
    discovered.envFileCandidates.map((candidate) => candidate.path),
    [rootEnvPath, releaseEnvPath],
  );
  assert.equal(discovered.envFileCandidates[0].isLocal, true);
  assert.equal(discovered.baseUrlCandidates[0].origin, "http://127.0.0.1:4000");
  assert.equal(discovered.baseUrlCandidates[0].isLocal, true);
  assert.deepEqual(
    discovered.baseUrlCandidates.map((candidate) => candidate.origin),
    ["http://127.0.0.1:4000"],
  );
  assert.deepEqual(discovered.previousEnvFileCandidates, []);
});

test("collectDiscoveredCandidates merges prepared public base-url candidates ahead of local artifact hints", () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-closure-discovery-prepared-base-url-"),
  );
  const propositionId = "proposition_dd7d7739-ac57-40a4-a7c8-8edef5d111e9";
  const proofDir = path.join(workspace, "validation-rehearsal", propositionId);
  const manifestPath = path.join(
    workspace,
    "config",
    "staging.closure-inputs.json",
  );
  const operatorBriefingPath = path.join(proofDir, "operator-briefing.json");

  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.mkdirSync(proofDir, { recursive: true });
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        baseUrlCandidates: [
          {
            origin: "https://arena.example",
            suitability: "protected_candidate_manual_verification_required",
          },
        ],
        recommendedBaseUrlCandidate: {
          origin: "https://arena.example",
        },
      },
      null,
      2,
    ),
    "utf8",
  );
  fs.writeFileSync(
    operatorBriefingPath,
    JSON.stringify(
      {
        propositionEvidence: {
          route: `http://127.0.0.1:4000/arena/internal/propositions/${propositionId}/evidence-bundle`,
        },
      },
      null,
      2,
    ),
    "utf8",
  );

  const existingArtifacts = {
    validationLocal: {
      dependencyAuditProd: null,
      operatorMonitoringProof: null,
      releaseRehearsalEnv: null,
      secretRotationAudit: null,
    },
    validationProofs: [
      {
        backendReleaseReadiness: null,
        directory: proofDir,
        evidenceBundle: null,
        operatorBriefing: operatorBriefingPath,
        proofSummary: null,
        propositionId,
        publicIntegrityOverview: null,
        publicSettledResult: null,
        rewardPayoutSummary: null,
        validationChainMonitoring: null,
      },
    ],
  };

  const discovered = collectDiscoveredCandidates(workspace, existingArtifacts);

  assert.equal(discovered.baseUrlCandidates[0].origin, "https://arena.example");
  assert.equal(discovered.baseUrlCandidates[0].recommended, true);
  assert.equal(
    discovered.baseUrlCandidates[0].sourcePaths.includes(manifestPath),
    true,
  );
  assert.equal(discovered.baseUrlCandidates[1].origin, "http://127.0.0.1:4000");
});

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
