const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildExternalClosureInputsManifest,
  discoverLivePropositionCandidates,
  discoverPublicDeploymentCandidates,
  parseArgs,
  parseGitHubRepositoryFromOrigin,
  prepareExternalClosureInputs,
  probeBaseUrlAccess,
} = require("./prepare-external-closure-inputs.cjs");

test("parseArgs resolves external closure input paths and force flag", () => {
  const parsed = parseArgs([
    "--staging-env",
    "config/custom-staging.env",
    "--previous-env",
    "config/custom-staging.previous.env",
    "--output",
    "config/custom-staging.closure-inputs.json",
    "--closure-status",
    "artifacts/closure-status.json",
    "--validation-network",
    "sepolia",
    "--probe-public-hosts",
    "--apply-recommended-base-url",
    "--force",
  ]);

  assert.equal(
    parsed.stagingEnvPath,
    path.resolve(process.cwd(), "config/custom-staging.env"),
  );
  assert.equal(
    parsed.previousEnvPath,
    path.resolve(process.cwd(), "config/custom-staging.previous.env"),
  );
  assert.equal(
    parsed.outputPath,
    path.resolve(process.cwd(), "config/custom-staging.closure-inputs.json"),
  );
  assert.equal(
    parsed.closureStatusPath,
    path.resolve(process.cwd(), "artifacts/closure-status.json"),
  );
  assert.equal(parsed.validationNetwork, "sepolia");
  assert.equal(parsed.probePublicHosts, true);
  assert.equal(parsed.applyRecommendedBaseUrl, true);
  assert.equal(parsed.force, true);
});

test("parseGitHubRepositoryFromOrigin understands https and ssh remotes", () => {
  assert.deepEqual(
    parseGitHubRepositoryFromOrigin("https://github.com/example/arena.git"),
    {
      fullName: "example/arena",
      originUrl: "https://github.com/example/arena.git",
      owner: "example",
      repo: "arena",
    },
  );
  assert.deepEqual(
    parseGitHubRepositoryFromOrigin("git@github.com:example/arena.git"),
    {
      fullName: "example/arena",
      originUrl: "git@github.com:example/arena.git",
      owner: "example",
      repo: "arena",
    },
  );
  assert.equal(parseGitHubRepositoryFromOrigin("https://gitlab.com/example/arena"), null);
});

test("discoverPublicDeploymentCandidates captures homepage and deployment probe hints", async () => {
  const responses = new Map([
    [
      "https://api.github.com/repos/example/arena",
      jsonResponse({
        homepage: "https://arena.example",
        html_url: "https://github.com/example/arena",
      }),
    ],
    [
      "https://api.github.com/repos/example/arena/environments",
      jsonResponse({
        environments: [
          {
            created_at: "2026-06-11T00:00:00.000Z",
            html_url: "https://github.com/example/arena/deployments/activity_log?environments_filter=Production",
            name: "Production",
            updated_at: "2026-06-11T00:00:00.000Z",
          },
        ],
      }),
    ],
    [
      "https://api.github.com/repos/example/arena/deployments?per_page=10",
      jsonResponse([
        {
          created_at: "2026-06-11T00:00:00.000Z",
          environment: "Production",
          id: 42,
          statuses_url: "https://api.github.com/repos/example/arena/deployments/42/statuses",
        },
      ]),
    ],
    [
      "https://api.github.com/repos/example/arena/deployments/42/statuses",
      jsonResponse([
        {
          created_at: "2026-06-11T00:00:00.000Z",
          environment: "Production",
          environment_url: "https://arena-prod.example",
          state: "success",
          target_url: "https://arena-prod.example",
        },
      ]),
    ],
    [
      "https://arena.example",
      new Response(
        '<!doctype html><html><head><script type="module" src="/assets/index-demo.js"></script></head></html>',
        { status: 200 },
      ),
    ],
    [
      "https://arena.example/assets/index-demo.js",
      new Response(
        'const MA="http://localhost:3000"; function IA(){const a=gc?.VITE_API_BASE_URL; return typeof a==="string"&&a.trim().length>0?a.replace(/\\/+$/,""):MA}',
        { status: 200 },
      ),
    ],
    [
      "https://arena.example/arena/public/results/settled",
      new Response("", { status: 404 }),
    ],
    [
      "https://arena.example/arena/internal/monitoring/runtime-contract",
      new Response("", { status: 404 }),
    ],
    ["https://arena.example/health/live", new Response("", { status: 404 })],
    ["https://arena-prod.example", new Response("", { status: 401 })],
    [
      "https://arena-prod.example/arena/public/results/settled",
      new Response("", { status: 401 }),
    ],
    [
      "https://arena-prod.example/arena/internal/monitoring/runtime-contract",
      new Response("", { status: 401 }),
    ],
    ["https://arena-prod.example/health/live", new Response("", { status: 401 })],
  ]);

  const discovery = await discoverPublicDeploymentCandidates({
    cwd: process.cwd(),
    execFileSyncImpl: () => "https://github.com/example/arena.git\n",
    fetchImpl: async (url) => {
      const response = responses.get(String(url));
      assert.ok(response, `Unexpected fetch URL: ${url}`);
      return response;
    },
    probePublicHosts: true,
  });

  assert.equal(discovery.repository.fullName, "example/arena");
  assert.equal(discovery.repository.homepageUrl, "https://arena.example");
  assert.equal(discovery.repository.environments[0].name, "Production");
  assert.equal(discovery.baseUrlCandidates.length, 2);
  assert.deepEqual(
    discovery.baseUrlCandidates.map((candidate) => candidate.origin).sort(),
    ["https://arena-prod.example", "https://arena.example"],
  );

  const homepageCandidate = discovery.baseUrlCandidates.find(
    (candidate) => candidate.origin === "https://arena.example",
  );
  assert.equal(
    homepageCandidate.suitability,
    "frontend_bundle_uses_local_api_default",
  );
  assert.equal(homepageCandidate.unauthenticatedProbe.rootStatusCode, 200);
  assert.equal(
    homepageCandidate.unauthenticatedProbe.publicSettledResultsStatusCode,
    404,
  );
  assert.equal(
    homepageCandidate.bundleInspection.defaultLocalApiBaseUrl,
    "http://localhost:3000",
  );
  assert.equal(homepageCandidate.bundleInspection.usesViteApiBaseEnv, true);

  const deploymentCandidate = discovery.baseUrlCandidates.find(
    (candidate) => candidate.origin === "https://arena-prod.example",
  );
  assert.equal(
    deploymentCandidate.suitability,
    "protected_candidate_manual_verification_required",
  );
  assert.equal(deploymentCandidate.unauthenticatedProbe.rootStatusCode, 401);
  assert.equal(deploymentCandidate.sources[0].deploymentId, 42);
});

test("buildExternalClosureInputsManifest includes public candidates and env-specific missing keys", () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-external-closure-manifest-"),
  );
  const closureStatusPath = path.join(workspace, "validation-local", "closure-status.json");
  const stagingEnvPath = path.join(workspace, "config", "staging.env");
  const previousEnvPath = path.join(workspace, "config", "staging.previous.env");

  fs.mkdirSync(path.dirname(closureStatusPath), { recursive: true });
  fs.mkdirSync(path.dirname(stagingEnvPath), { recursive: true });
  fs.writeFileSync(
    closureStatusPath,
    JSON.stringify(
      {
        discoveredCandidates: {
          latestLocalProofPropositionId:
            "proposition_dd7d7739-ac57-40a4-a7c8-8edef5d111e9",
          proofRecordDocs: [
            {
              path: path.join(
                workspace,
                "docs",
                "contracts",
                "validation-proof-record-003.md",
              ),
              propositionId: "proposition_dd7d7739-ac57-40a4-a7c8-8edef5d111e9",
            },
          ],
        },
      },
      null,
      2,
    ),
    "utf8",
  );
  fs.writeFileSync(
    stagingEnvPath,
    [
      "DATABASE_URL=postgres://current",
      "REDIS_URL=redis://current",
      "JWT_SECRET=current-secret",
      "ARENA_INTERNAL_API_BASE_URL=",
      "ARENA_INTERNAL_OPERATOR_BEARER_TOKEN=current-token",
      "RPC_URL=https://rpc.current",
      "ARENA_CONTRACT_ADDRESS=0x123",
      "ARENA_VALIDATION_CONTRACT_ADDRESS=0x456",
      "ARENA_VALIDATION_DEPLOYER_PRIVATE_KEY=current-deployer",
      "ARENA_VALIDATION_OPERATOR_PRIVATE_KEY=current-operator",
      "ARENA_VALIDATION_ORACLE_PRIVATE_KEY=current-oracle",
      "ARENA_VALIDATION_PAUSER_PRIVATE_KEY=current-pauser",
      "ARENA_REWARD_PAYOUT_ERC20_ADDRESS=0x789",
      "ARENA_REWARD_PAYOUT_OPERATOR_PRIVATE_KEY=current-payout",
      "ARENA_OPS_ALERT_WEBHOOK_TARGETS=",
      "ARENA_OPS_ALERT_WEBHOOK_BEARER_TOKENS=current-alert-token",
    ].join("\n"),
    "utf8",
  );
  fs.writeFileSync(
    previousEnvPath,
    "DATABASE_URL=\nARENA_OPS_ALERT_WEBHOOK_BEARER_TOKENS=\n",
    "utf8",
  );

  const manifest = buildExternalClosureInputsManifest({
    closureStatusPath,
    now: new Date("2026-06-11T03:00:00.000Z"),
    previousEnvPath,
    publicDiscovery: {
      baseUrlCandidates: [
        {
          origin: "https://arena.example",
          suitability: "api_routes_detected",
          unauthenticatedProbe: {
            healthLiveStatusCode: 200,
            internalRuntimeContractStatusCode: 401,
            publicSettledResultsStatusCode: 200,
            rootStatusCode: 200,
          },
        },
      ],
      repository: {
        fullName: "example/arena",
        homepageUrl: "https://arena.example",
      },
      warnings: [],
    },
    stagingEnvPath,
    validationNetwork: "validation",
  });

  assert.equal(manifest.targetNetworkName, "validation");
  assert.equal(
    manifest.propositionIdCandidates[0].propositionId,
    "proposition_dd7d7739-ac57-40a4-a7c8-8edef5d111e9",
  );
  assert.equal(
    manifest.baseUrlStatus,
    "candidate_values_discovered_manual_verification_required",
  );
  assert.equal(manifest.baseUrlCandidates[0].origin, "https://arena.example");
  assert.equal(manifest.recommendedBaseUrlCandidate.origin, "https://arena.example");
  assert.equal(manifest.recommendedBaseUrlCandidate.confidence, "high");
  assert.ok(manifest.currentEnvMissingKeys.includes("ARENA_INTERNAL_API_BASE_URL"));
  assert.ok(manifest.currentEnvMissingKeys.includes("ARENA_OPS_ALERT_WEBHOOK_TARGETS"));
  assert.ok(manifest.previousEnvMissingKeys.includes("DATABASE_URL"));
  assert.ok(
    manifest.previousEnvMissingKeys.includes(
      "ARENA_OPS_ALERT_WEBHOOK_BEARER_TOKENS",
    ),
  );
  assert.ok(manifest.runtimeInputsMissing.includes("baseUrl"));
  assert.equal(
    manifest.runtimeInputsMissing.includes("propositionId"),
    false,
  );
  assert.equal(
    manifest.propositionId,
    "proposition_dd7d7739-ac57-40a4-a7c8-8edef5d111e9",
  );
  assert.equal(manifest.closureCriticalMaterials.baseUrl.id, "base_url");
  assert.equal(
    manifest.closureCriticalMaterials.baseUrl.status,
    "candidate_discovered_manual_verification_required",
  );
  assert.equal(
    manifest.closureCriticalMaterials.operatorToken.status,
    "present",
  );
  assert.equal(manifest.closureCriticalMaterials.rpcUrl.status, "present");
  assert.equal(
    manifest.closureCriticalMaterials.propositionId.status,
    "candidate_only",
  );
  assert.equal(
    manifest.closureCriticalMaterials.previousReleaseEnvCompleteness.status,
    "incomplete",
  );
  assert.equal(
    manifest.closureCriticalMaterials.cleanHostIdentityGate.status,
    "pending_clean_host_proof",
  );
  assert.equal(
    manifest.closureCriticalMaterials.baseUrl.candidate.origin,
    "https://arena.example",
  );
  assert.equal(
    manifest.closureCriticalMaterials.baseUrl.candidate.suitability,
    "api_routes_detected",
  );
  assert.match(
    manifest.commands.externalEvidence,
    /backend:release:evidence:external/u,
  );
  assert.match(manifest.commands.validationDeploy, /--network validation/u);
});

test("buildExternalClosureInputsManifest keeps the env-provided base URL visible when public discovery has no candidates", () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-external-closure-manifest-explicit-base-url-"),
  );
  const closureStatusPath = path.join(workspace, "validation-local", "closure-status.json");
  const stagingEnvPath = path.join(workspace, "config", "staging.env");
  const previousEnvPath = path.join(workspace, "config", "staging.previous.env");

  fs.mkdirSync(path.dirname(closureStatusPath), { recursive: true });
  fs.mkdirSync(path.dirname(stagingEnvPath), { recursive: true });
  fs.writeFileSync(
    closureStatusPath,
    JSON.stringify(
      {
        discoveredCandidates: {
          latestLocalProofPropositionId: "proposition_local_only",
          proofRecordDocs: [],
        },
      },
      null,
      2,
    ),
    "utf8",
  );
  fs.writeFileSync(
    stagingEnvPath,
    [
      "ARENA_INTERNAL_API_BASE_URL=https://arena-existing.example",
      "ARENA_INTERNAL_OPERATOR_BEARER_TOKEN=current-token",
      "RPC_URL=https://rpc.current",
      "CHAIN_ID=11155111",
      "ARENA_VALIDATION_ENVIRONMENT=staging",
      "",
    ].join("\n"),
    "utf8",
  );
  fs.writeFileSync(previousEnvPath, "ARENA_INTERNAL_OPERATOR_BEARER_TOKEN=previous-token\n", "utf8");

  const manifest = buildExternalClosureInputsManifest({
    baseUrl: "https://arena-existing.example",
    closureStatusPath,
    now: new Date("2026-06-16T00:00:00.000Z"),
    previousEnvPath,
    propositionDiscovery: { candidates: [], warnings: [] },
    publicDiscovery: { baseUrlCandidates: [], repository: null, warnings: [] },
    stagingEnvPath,
    validationNetwork: "validation",
  });

  assert.equal(manifest.baseUrlCandidates.length, 1);
  assert.equal(manifest.baseUrlCandidates[0].origin, "https://arena-existing.example");
  assert.equal(
    manifest.recommendedBaseUrlCandidate.origin,
    "https://arena-existing.example",
  );
  assert.equal(
    manifest.recommendedBaseUrlCandidate.suitability,
    "provided_in_env_manual_verification_required",
  );
  assert.equal(
    manifest.closureCriticalMaterials.baseUrl.candidate.origin,
    "https://arena-existing.example",
  );
  assert.equal(
    manifest.manualActionChecklist.find((item) => item.id === "confirm_real_base_url")?.candidate?.origin,
    "https://arena-existing.example",
  );
});
test("buildExternalClosureInputsManifest carries forward clean-host verified N1 proof from closure status", () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-external-closure-manifest-clean-host-proof-"),
  );
  const closureStatusPath = path.join(workspace, "validation-local", "closure-status.json");
  const stagingEnvPath = path.join(workspace, "config", "staging.env");
  const previousEnvPath = path.join(workspace, "config", "staging.previous.env");

  fs.mkdirSync(path.dirname(closureStatusPath), { recursive: true });
  fs.mkdirSync(path.dirname(stagingEnvPath), { recursive: true });
  fs.writeFileSync(
    closureStatusPath,
    JSON.stringify(
      {
        discoveredCandidates: {
          latestLocalProofPropositionId: "proposition_dd7d7739-ac57-40a4-a7c8-8edef5d111e9",
          proofRecordDocs: [],
        },
        requiredExternalMaterials: {
          cleanHostIdentityGate: {
            status: "present",
            proof: {
              checkedAt: "2026-06-15T19:53:43.369Z",
              consecutivePasses: 5,
              requiredConsecutivePasses: 5,
              runsCompleted: 5,
              summaryPath: "F:\\arena_blockchain\\validation-local\\identity-clean-host-docker-summary.json",
            },
          },
        },
        taskStatus: {
          N1: {
            blockers: [],
            status: "clean_host_verified",
          },
        },
      },
      null,
      2,
    ),
    "utf8",
  );
  fs.writeFileSync(
    stagingEnvPath,
    [
      "ARENA_INTERNAL_OPERATOR_BEARER_TOKEN=current-token",
      "RPC_URL=https://rpc.current",
      "CHAIN_ID=11155111",
      "ARENA_VALIDATION_ENVIRONMENT=staging",
      "",
    ].join("\n"),
    "utf8",
  );
  fs.writeFileSync(previousEnvPath, "ARENA_INTERNAL_OPERATOR_BEARER_TOKEN=previous-token\n", "utf8");

  const manifest = buildExternalClosureInputsManifest({
    baseUrl: "https://arena.example",
    closureStatusPath,
    now: new Date("2026-06-16T00:00:00.000Z"),
    previousEnvPath,
    propositionDiscovery: { candidates: [], warnings: [] },
    publicDiscovery: { baseUrlCandidates: [], repository: null, warnings: [] },
    stagingEnvPath,
    validationNetwork: "validation",
  });

  assert.equal(manifest.closureCriticalMaterials.cleanHostIdentityGate.status, "present");
  assert.equal(
    manifest.manualActionChecklist.some((item) => item.id === "clean_host_identity_gate"),
    false,
  );
  assert.equal(
    manifest.closureCriticalMaterials.cleanHostIdentityGate.proof.runsCompleted,
    5,
  );
});
test("discoverLivePropositionCandidates returns latest operator-visible proposition ids", async () => {
  const discovery = await discoverLivePropositionCandidates({
    authToken: "secret-token",
    baseUrl: "https://arena.example",
    fetchImpl: async (url, options) => {
      assert.equal(String(url), "https://arena.example/arena/internal/propositions?limit=5&sortBy=createdAt&sortDirection=desc");
      assert.equal(options.headers.authorization, "Bearer secret-token");
      return jsonResponse({
        items: [
          {
            createdAt: "2026-06-15T00:00:00.000Z",
            propositionId: "prop_live_1",
            status: "approved",
            title: "Latest proposition",
          },
          {
            createdAt: "2026-06-14T00:00:00.000Z",
            propositionId: "prop_live_2",
            status: "published",
            title: "Older proposition",
          },
        ],
      });
    },
  });

  assert.deepEqual(discovery.warnings, []);
  assert.equal(discovery.candidates.length, 2);
  assert.deepEqual(discovery.candidates[0], {
    createdAt: "2026-06-15T00:00:00.000Z",
    propositionId: "prop_live_1",
    source: "live_internal_listing",
    status: "approved",
    suitability: "live_staging_candidate",
    title: "Latest proposition",
  });
});

test("discoverLivePropositionCandidates falls back to powershell when fetch fails on Windows", async () => {
  const discovery = await discoverLivePropositionCandidates({
    allowShellFallback: true,
    authToken: "secret-token",
    baseUrl: "https://arena.example",
    fetchImpl: async () => {
      throw new Error("fetch failed");
    },
    spawnSyncImpl: (_command, _args, options) => {
      const output = JSON.stringify({
        items: [
          {
            createdAt: "2026-06-15T00:00:00.000Z",
            propositionId: "prop_shell_1",
            status: "approved",
            title: "Shell discovered proposition",
          },
        ],
      });

      return {
        status: 0,
        stdout: output,
      };
    },
  });

  assert.equal(discovery.candidates[0].propositionId, "prop_shell_1");
  assert.deepEqual(discovery.warnings, []);
});

test("buildExternalClosureInputsManifest prefers live proposition candidates over local proof hints", () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-external-closure-manifest-live-proposition-"),
  );
  const closureStatusPath = path.join(workspace, "validation-local", "closure-status.json");
  const stagingEnvPath = path.join(workspace, "config", "staging.env");
  const previousEnvPath = path.join(workspace, "config", "staging.previous.env");

  fs.mkdirSync(path.dirname(closureStatusPath), { recursive: true });
  fs.mkdirSync(path.dirname(stagingEnvPath), { recursive: true });
  fs.writeFileSync(
    closureStatusPath,
    JSON.stringify(
      {
        discoveredCandidates: {
          latestLocalProofPropositionId: "proposition_local_only",
          proofRecordDocs: [
            {
              path: path.join(workspace, "docs", "contracts", "validation-proof-record-003.md"),
              propositionId: "proposition_local_only",
            },
          ],
        },
      },
      null,
      2,
    ),
    "utf8",
  );
  fs.writeFileSync(stagingEnvPath, "ARENA_INTERNAL_OPERATOR_BEARER_TOKEN=current-token\n", "utf8");
  fs.writeFileSync(previousEnvPath, "ARENA_INTERNAL_OPERATOR_BEARER_TOKEN=previous-token\n", "utf8");

  const manifest = buildExternalClosureInputsManifest({
    baseUrl: "https://arena.example",
    closureStatusPath,
    now: new Date("2026-06-15T00:00:00.000Z"),
    previousEnvPath,
    propositionDiscovery: {
      candidates: [
        {
          createdAt: "2026-06-15T00:00:00.000Z",
          propositionId: "prop_live_1",
          source: "live_internal_listing",
          status: "approved",
          suitability: "live_staging_candidate",
          title: "Live proposition",
        },
      ],
      warnings: [],
    },
    publicDiscovery: {
      baseUrlCandidates: [],
      repository: null,
      warnings: [],
    },
    stagingEnvPath,
    validationNetwork: "validation",
  });

  assert.equal(manifest.propositionId, "prop_live_1");
  assert.equal(manifest.propositionIdStatus, "live_candidate_selected");
  assert.equal(manifest.runtimeInputsMissing.includes("propositionId"), false);
  assert.equal(manifest.closureCriticalMaterials.propositionId.status, "complete");
  assert.equal(manifest.propositionIdCandidates[0].propositionId, "prop_live_1");
});

test("prepareExternalClosureInputs writes a live discovered proposition into the closure manifest and degrades to warnings on lookup failure", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-external-closure-inputs-live-proposition-"),
  );
  const configDir = path.join(workspace, "config");
  const closureStatusPath = path.join(workspace, "validation-local", "closure-status.json");
  const stagingEnvPath = path.join(configDir, "staging.env");
  const previousEnvPath = path.join(configDir, "staging.previous.env");
  const outputPath = path.join(configDir, "staging.closure-inputs.json");

  fs.mkdirSync(configDir, { recursive: true });
  fs.mkdirSync(path.dirname(closureStatusPath), { recursive: true });
  fs.writeFileSync(
    path.join(configDir, "staging.env.example"),
    [
      "ARENA_INTERNAL_API_BASE_URL=https://arena.example",
      "ARENA_INTERNAL_OPERATOR_BEARER_TOKEN=current-token",
      "DATABASE_URL=",
      "",
    ].join("\n"),
    "utf8",
  );
  fs.writeFileSync(
    path.join(configDir, "staging.previous.env.example"),
    [
      "ARENA_INTERNAL_API_BASE_URL=https://arena.example",
      "ARENA_INTERNAL_OPERATOR_BEARER_TOKEN=previous-token",
      "DATABASE_URL=",
      "",
    ].join("\n"),
    "utf8",
  );
  fs.writeFileSync(
    closureStatusPath,
    JSON.stringify(
      {
        discoveredCandidates: {
          latestLocalProofPropositionId: "proposition_local_candidate",
          proofRecordDocs: [
            {
              path: path.join(configDir, "proof-record.md"),
              propositionId: "proposition_local_candidate",
            },
          ],
        },
      },
      null,
      2,
    ),
    "utf8",
  );

  const logger = createLogger();
  const exitCode = await prepareExternalClosureInputs({
    closureStatusPath,
    cwd: workspace,
    discoverLivePropositionCandidatesImpl: async () => ({
      candidates: [
        {
          createdAt: "2026-06-15T00:00:00.000Z",
          propositionId: "prop_live_selected",
          source: "live_internal_listing",
          status: "approved",
          suitability: "live_staging_candidate",
          title: "Live proposition",
        },
      ],
      warnings: ["operator proposition discovery succeeded"],
    }),
    discoverPublicDeploymentCandidatesImpl: async () => ({
      baseUrlCandidates: [],
      repository: null,
      warnings: [],
    }),
    logger,
    now: new Date("2026-06-15T00:10:00.000Z"),
    outputPath,
    previousEnvPath,
    stagingEnvPath,
  });

  assert.equal(exitCode, 0);
  const manifest = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  assert.equal(manifest.propositionId, "prop_live_selected");
  assert.equal(manifest.runtimeInputsMissing.includes("propositionId"), false);
  assert.equal(manifest.discoveryWarnings.includes("operator proposition discovery succeeded"), true);
});

test("buildExternalClosureInputsManifest recommends the latest successful protected production deployment when no public api route is visible", () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-external-closure-manifest-protected-"),
  );
  const closureStatusPath = path.join(workspace, "validation-local", "closure-status.json");
  const stagingEnvPath = path.join(workspace, "config", "staging.env");
  const previousEnvPath = path.join(workspace, "config", "staging.previous.env");

  fs.mkdirSync(path.dirname(closureStatusPath), { recursive: true });
  fs.mkdirSync(path.dirname(stagingEnvPath), { recursive: true });
  fs.writeFileSync(closureStatusPath, JSON.stringify({}, null, 2), "utf8");
  fs.writeFileSync(stagingEnvPath, "", "utf8");
  fs.writeFileSync(previousEnvPath, "", "utf8");

  const manifest = buildExternalClosureInputsManifest({
    closureStatusPath,
    now: new Date("2026-06-11T03:05:00.000Z"),
    previousEnvPath,
    publicDiscovery: {
      baseUrlCandidates: [
        {
          origin: "https://arena-old.example",
          sources: [
            {
              createdAt: "2026-05-01T00:00:00.000Z",
              environment: "Production",
              source: "github_deployment_status",
              state: "success",
            },
          ],
          suitability: "protected_candidate_manual_verification_required",
          unauthenticatedProbe: {
            publicSettledResultsStatusCode: 401,
            rootStatusCode: 401,
          },
        },
        {
          origin: "https://arena-new.example",
          sources: [
            {
              createdAt: "2026-06-01T00:00:00.000Z",
              environment: "Production",
              source: "github_deployment_status",
              state: "success",
            },
          ],
          suitability: "protected_candidate_manual_verification_required",
          unauthenticatedProbe: {
            publicSettledResultsStatusCode: 401,
            rootStatusCode: 401,
          },
        },
      ],
      repository: {
        fullName: "example/arena",
      },
      warnings: [],
    },
    stagingEnvPath,
    validationNetwork: "validation",
  });

  assert.equal(manifest.recommendedBaseUrlCandidate.origin, "https://arena-new.example");
  assert.equal(manifest.recommendedBaseUrlCandidate.confidence, "medium");
});

test("prepareExternalClosureInputs creates local staging materials without overwriting existing envs", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-external-closure-inputs-"),
  );
  const configDir = path.join(workspace, "config");
  const closureStatusPath = path.join(workspace, "validation-local", "closure-status.json");
  const stagingEnvPath = path.join(configDir, "staging.env");
  const previousEnvPath = path.join(configDir, "staging.previous.env");
  const outputPath = path.join(configDir, "staging.closure-inputs.json");

  fs.mkdirSync(configDir, { recursive: true });
  fs.mkdirSync(path.dirname(closureStatusPath), { recursive: true });
  fs.writeFileSync(
    path.join(configDir, "staging.env.example"),
    "ARENA_VALIDATION_ENVIRONMENT=staging\nDATABASE_URL=\n",
    "utf8",
  );
  fs.writeFileSync(
    path.join(configDir, "staging.previous.env.example"),
    "ARENA_VALIDATION_ENVIRONMENT=staging\nDATABASE_URL=\n",
    "utf8",
  );
  fs.writeFileSync(
    closureStatusPath,
    JSON.stringify(
      {
        discoveredCandidates: {
          latestLocalProofPropositionId: "proposition_local_candidate",
          proofRecordDocs: [
            {
              path: path.join(configDir, "proof-record.md"),
              propositionId: "proposition_local_candidate",
            },
          ],
        },
      },
      null,
      2,
    ),
    "utf8",
  );

  const logger = createLogger();
  const firstExitCode = await prepareExternalClosureInputs({
    closureStatusPath,
    cwd: workspace,
    discoverPublicDeploymentCandidatesImpl: async () => ({
      baseUrlCandidates: [
        {
          origin: "https://arena.example",
          suitability: "manual_verification_required",
          unauthenticatedProbe: {
            healthLiveStatusCode: null,
            internalRuntimeContractStatusCode: null,
            publicSettledResultsStatusCode: null,
            rootStatusCode: 200,
          },
        },
      ],
      repository: {
        fullName: "example/arena",
        homepageUrl: "https://arena.example",
      },
      warnings: [],
    }),
    logger,
    now: new Date("2026-06-11T03:10:00.000Z"),
  });

  assert.equal(firstExitCode, 0);
  assert.equal(fs.existsSync(stagingEnvPath), true);
  assert.equal(fs.existsSync(previousEnvPath), true);
  assert.equal(fs.existsSync(outputPath), true);

  fs.writeFileSync(stagingEnvPath, "JWT_SECRET=keep-me\n", "utf8");
  const secondExitCode = await prepareExternalClosureInputs({
    closureStatusPath,
    cwd: workspace,
    discoverPublicDeploymentCandidatesImpl: async () => ({
      baseUrlCandidates: [],
      repository: null,
      warnings: ["no public candidates"],
    }),
    logger,
    now: new Date("2026-06-11T03:11:00.000Z"),
  });

  assert.equal(secondExitCode, 0);
  assert.equal(fs.readFileSync(stagingEnvPath, "utf8"), "JWT_SECRET=keep-me\n");

  const manifest = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  assert.equal(manifest.releaseEnvFilePath, stagingEnvPath);
  assert.equal(manifest.previousEnvFilePath, previousEnvPath);
  assert.equal(manifest.targetNetworkName, "validation");
  assert.equal(manifest.recommendedBaseUrlCandidate, null);
  assert.equal(
    manifest.propositionIdCandidates[0].propositionId,
    "proposition_local_candidate",
  );
  assert.equal(
    logger.passMessages.includes("External closure input materials are prepared."),
    true,
  );
  assert.equal(
    logger.infoMessages.some((message) =>
      message.includes("Discovered external base-url candidates"),
    ),
    true,
  );
});

test("prepareExternalClosureInputs can apply the recommended current base-url candidate into staging env", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-external-closure-inputs-apply-base-url-"),
  );
  const configDir = path.join(workspace, "config");
  const closureStatusPath = path.join(workspace, "validation-local", "closure-status.json");
  const stagingEnvPath = path.join(configDir, "staging.env");
  const previousEnvPath = path.join(configDir, "staging.previous.env");
  const outputPath = path.join(configDir, "staging.closure-inputs.json");

  fs.mkdirSync(configDir, { recursive: true });
  fs.mkdirSync(path.dirname(closureStatusPath), { recursive: true });
  fs.writeFileSync(
    path.join(configDir, "staging.env.example"),
    "ARENA_INTERNAL_API_BASE_URL=\nDATABASE_URL=\n",
    "utf8",
  );
  fs.writeFileSync(
    path.join(configDir, "staging.previous.env.example"),
    "ARENA_INTERNAL_API_BASE_URL=\nDATABASE_URL=\n",
    "utf8",
  );
  fs.writeFileSync(closureStatusPath, JSON.stringify({}, null, 2), "utf8");

  const logger = createLogger();
  const exitCode = await prepareExternalClosureInputs({
    applyRecommendedBaseUrl: true,
    closureStatusPath,
    cwd: workspace,
    discoverPublicDeploymentCandidatesImpl: async () => ({
      baseUrlCandidates: [
        {
          origin: "https://arena-prod.example",
          sources: [
            {
              createdAt: "2026-06-11T00:00:00.000Z",
              environment: "Production",
              source: "github_deployment_status",
              state: "success",
            },
          ],
          suitability: "protected_candidate_manual_verification_required",
          unauthenticatedProbe: {
            publicSettledResultsStatusCode: 401,
            rootStatusCode: 401,
          },
        },
      ],
      repository: {
        fullName: "example/arena",
      },
      warnings: [],
    }),
    logger,
    outputPath,
  });

  assert.equal(exitCode, 0);
  assert.match(
    fs.readFileSync(stagingEnvPath, "utf8"),
    /ARENA_INTERNAL_API_BASE_URL=https:\/\/arena-prod\.example/u,
  );

  const manifest = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  assert.equal(manifest.baseUrl, "https://arena-prod.example");
  assert.equal(
    manifest.baseUrlStatus,
    "recommended_candidate_applied_to_current_env_manual_verification_required",
  );
  assert.equal(manifest.runtimeInputsMissing.includes("baseUrl"), false);
  assert.equal(
    manifest.closureCriticalMaterials.baseUrl.status,
    "candidate_applied_manual_verification_required",
  );
});

test("prepareExternalClosureInputs honors an existing ARENA_INTERNAL_API_BASE_URL in staging env without requiring apply-recommended-base-url", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-external-closure-inputs-existing-base-url-"),
  );
  const configDir = path.join(workspace, "config");
  const closureStatusPath = path.join(workspace, "validation-local", "closure-status.json");
  const stagingEnvPath = path.join(configDir, "staging.env");
  const previousEnvPath = path.join(configDir, "staging.previous.env");
  const outputPath = path.join(configDir, "staging.closure-inputs.json");

  fs.mkdirSync(configDir, { recursive: true });
  fs.mkdirSync(path.dirname(closureStatusPath), { recursive: true });
  fs.writeFileSync(
    path.join(configDir, "staging.env.example"),
    "ARENA_INTERNAL_API_BASE_URL=https://arena-existing.example\nDATABASE_URL=\n",
    "utf8",
  );
  fs.writeFileSync(
    path.join(configDir, "staging.previous.env.example"),
    "ARENA_INTERNAL_API_BASE_URL=https://arena-existing.example\nDATABASE_URL=\n",
    "utf8",
  );
  fs.writeFileSync(
    stagingEnvPath,
    "ARENA_INTERNAL_API_BASE_URL=https://arena-existing.example\nDATABASE_URL=\n",
    "utf8",
  );
  fs.writeFileSync(
    previousEnvPath,
    "ARENA_INTERNAL_API_BASE_URL=https://arena-existing.example\nDATABASE_URL=\n",
    "utf8",
  );
  fs.writeFileSync(closureStatusPath, JSON.stringify({}, null, 2), "utf8");

  const logger = createLogger();
  const exitCode = await prepareExternalClosureInputs({
    closureStatusPath,
    cwd: workspace,
    discoverPublicDeploymentCandidatesImpl: async () => ({
      baseUrlCandidates: [
        {
          origin: "https://arena-candidate.example",
          suitability: "manual_verification_required",
          unauthenticatedProbe: {
            healthLiveStatusCode: null,
            internalRuntimeContractStatusCode: null,
            publicSettledResultsStatusCode: null,
            rootStatusCode: 200,
          },
        },
      ],
      repository: {
        fullName: "example/arena",
      },
      warnings: [],
    }),
    logger,
    now: new Date("2026-06-15T00:00:00.000Z"),
    outputPath,
    previousEnvPath,
    stagingEnvPath,
  });

  assert.equal(exitCode, 0);
  const manifest = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  assert.equal(manifest.baseUrl, "https://arena-existing.example");
  assert.equal(manifest.baseUrlStatus, "provided_in_env_manual_verification_required");
  assert.equal(manifest.runtimeInputsMissing.includes("baseUrl"), false);
  assert.equal(
    manifest.closureCriticalMaterials.baseUrl.status,
    "present_manual_verification_required",
  );
});
test("prepareExternalClosureInputs records Vercel access as a first-class blocker when the current staging host is protected", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-external-closure-inputs-vercel-protected-"),
  );
  const configDir = path.join(workspace, "config");
  const closureStatusPath = path.join(workspace, "validation-local", "closure-status.json");
  const stagingEnvPath = path.join(configDir, "staging.env");
  const previousEnvPath = path.join(configDir, "staging.previous.env");
  const outputPath = path.join(configDir, "staging.closure-inputs.json");

  fs.mkdirSync(configDir, { recursive: true });
  fs.mkdirSync(path.dirname(closureStatusPath), { recursive: true });
  fs.writeFileSync(
    path.join(configDir, "staging.env.example"),
    "ARENA_INTERNAL_API_BASE_URL=https://arenablockchain-5kx617r63-dirreck-h-s-projects.vercel.app\nDATABASE_URL=\n",
    "utf8",
  );
  fs.writeFileSync(
    path.join(configDir, "staging.previous.env.example"),
    "ARENA_INTERNAL_API_BASE_URL=https://arenablockchain-5kx617r63-dirreck-h-s-projects.vercel.app\nDATABASE_URL=\n",
    "utf8",
  );
  fs.writeFileSync(
    stagingEnvPath,
    "ARENA_INTERNAL_API_BASE_URL=https://arenablockchain-5kx617r63-dirreck-h-s-projects.vercel.app\nARENA_INTERNAL_OPERATOR_BEARER_TOKEN=current-token\nDATABASE_URL=\n",
    "utf8",
  );
  fs.writeFileSync(
    previousEnvPath,
    "ARENA_INTERNAL_API_BASE_URL=https://arenablockchain-5kx617r63-dirreck-h-s-projects.vercel.app\nARENA_INTERNAL_OPERATOR_BEARER_TOKEN=previous-token\nDATABASE_URL=\n",
    "utf8",
  );
  fs.writeFileSync(closureStatusPath, JSON.stringify({}, null, 2), "utf8");

  const logger = createLogger();
  const exitCode = await prepareExternalClosureInputs({
    closureStatusPath,
    cwd: workspace,
    discoverLivePropositionCandidatesImpl: async () => ({
      candidates: [],
      warnings: [],
    }),
    discoverPublicDeploymentCandidatesImpl: async () => ({
      baseUrlCandidates: [],
      repository: {
        fullName: "example/arena",
      },
      warnings: [],
    }),
    fetchImpl: async () => ({
      ok: false,
      redirected: false,
      status: 401,
      async text() {
        return "This page requires Vercel authentication";
      },
    }),
    inspectNetworkExecutionReadinessImpl: async () => null,
    logger,
    now: new Date("2026-06-16T00:00:00.000Z"),
    outputPath,
    previousEnvPath,
    stagingEnvPath,
  });

  assert.equal(exitCode, 0);

  const manifest = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  assert.deepEqual(manifest.baseUrlAccess, {
    protection: "vercel_deployment_protection_required",
    statusCode: 401,
    url: "https://arenablockchain-5kx617r63-dirreck-h-s-projects.vercel.app/health/live",
  });
  assert.equal(
    manifest.closureCriticalMaterials.baseUrl.status,
    "present_manual_verification_required",
  );
  assert.equal(manifest.closureCriticalMaterials.vercelAccess.status, "missing");
  assert.deepEqual(
    manifest.closureCriticalMaterials.vercelAccess.envKeys,
    ["VERCEL_PROTECTION_BYPASS_TOKEN", "VERCEL_TRUSTED_OIDC_TOKEN"],
  );
  assert.equal(
    manifest.manualActionChecklist.some((item) => item.id === "vercel_access"),
    true,
  );
});

test("buildExternalClosureInputsManifest includes network execution readiness notes when provided", () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-external-closure-manifest-network-readiness-"),
  );
  const closureStatusPath = path.join(workspace, "validation-local", "closure-status.json");
  const stagingEnvPath = path.join(workspace, "config", "staging.env");
  const previousEnvPath = path.join(workspace, "config", "staging.previous.env");

  fs.mkdirSync(path.dirname(closureStatusPath), { recursive: true });
  fs.mkdirSync(path.dirname(stagingEnvPath), { recursive: true });
  fs.writeFileSync(closureStatusPath, JSON.stringify({}, null, 2), "utf8");
  fs.writeFileSync(stagingEnvPath, "ARENA_INTERNAL_OPERATOR_BEARER_TOKEN=current-token\nRPC_URL=https://rpc.example\n", "utf8");
  fs.writeFileSync(previousEnvPath, "ARENA_INTERNAL_OPERATOR_BEARER_TOKEN=previous-token\n", "utf8");

  const manifest = buildExternalClosureInputsManifest({
    baseUrl: "https://arena.example",
    closureStatusPath,
    networkExecutionReadiness: {
      network: {
        chainId: 11155111,
        name: "sepolia",
        rpcUrl: "https://rpc.example",
      },
      signerChecks: [
        {
          address: "0x1111111111111111111111111111111111111111",
          balanceEth: "0.0",
          balanceWei: "0",
          key: "ARENA_VALIDATION_DEPLOYER_PRIVATE_KEY",
          label: "deployer",
          needsFunding: true,
        },
      ],
    },
    now: new Date("2026-06-15T00:00:00.000Z"),
    previousEnvPath,
    publicDiscovery: {
      baseUrlCandidates: [],
      repository: null,
      warnings: [],
    },
    stagingEnvPath,
    validationNetwork: "validation",
  });

  assert.equal(manifest.networkExecutionReadiness.network.chainId, 11155111);
  assert.equal(manifest.networkExecutionReadiness.signerChecks[0].label, "deployer");
  assert.equal(manifest.networkExecutionReadiness.signerChecks[0].needsFunding, true);
  assert.equal(manifest.closureCriticalMaterials.validationSignerFunding.status, "pending_funding");
  assert.equal(manifest.closureCriticalMaterials.validationSignerFunding.signerChecks[0].label, "deployer");
  assert.equal(Array.isArray(manifest.manualActionChecklist), true);
  assert.equal(manifest.manualActionChecklist.some((item) => item.id === "fund_validation_signers"), true);
  assert.equal(manifest.manualActionChecklist.some((item) => item.id === "fill_release_env_values"), true);
});


test("probeBaseUrlAccess flags protected vercel.app hosts from a 401 probe", async () => {
  const access = await probeBaseUrlAccess({
    baseUrl: "https://arenablockchain-5kx617r63-dirreck-h-s-projects.vercel.app",
    fetchImpl: async () => ({
      ok: false,
      redirected: false,
      status: 401,
    }),
  });

  assert.deepEqual(access, {
    protection: "vercel_deployment_protection_required",
    statusCode: 401,
    url: "https://arenablockchain-5kx617r63-dirreck-h-s-projects.vercel.app/health/live",
  });
});function createLogger() {
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

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    headers: {
      "content-type": "application/json",
    },
    status,
  });
}

