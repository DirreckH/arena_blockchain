const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildExternalRerunCommand,
  parseArgs,
  renderCommand,
  runBackendReleaseRehearsal,
} = require("./run-backend-release-rehearsal.cjs");

test("parseArgs resolves an explicit env file path", () => {
  const parsed = parseArgs(["--env-file", "validation-local/custom.env"]);

  assert.equal(
    parsed.envFilePath,
    path.resolve(process.cwd(), "validation-local/custom.env"),
  );
  assert.equal(parsed.mode, "local");
});

test("parseArgs supports the external rehearsal mode with base URL, auth token, and proposition id", () => {
  const parsed = parseArgs([
    "--mode",
    "external",
    "--env-file",
    "config/staging.env",
    "--base-url",
    "https://arena.example",
    "--auth-token",
    "staging-token",
    "--proposition-id",
    "prop_staging_1",
  ]);

  assert.equal(parsed.mode, "external");
  assert.equal(
    parsed.envFilePath,
    path.resolve(process.cwd(), "config/staging.env"),
  );
  assert.equal(parsed.baseUrl, "https://arena.example");
  assert.equal(parsed.authToken, "staging-token");
  assert.equal(parsed.propositionId, "prop_staging_1");
});

test("parseArgs supports optional validation preflight and deploy controls for external rehearsal", () => {
  const parsed = parseArgs([
    "--mode",
    "external",
    "--env-file",
    "config/staging.env",
    "--base-url",
    "https://arena.example",
    "--proposition-id",
    "prop_staging_1",
    "--validation-deploy",
    "--validation-network",
    "sepolia",
  ]);

  assert.equal(parsed.mode, "external");
  assert.equal(parsed.validationDeploy, true);
  assert.equal(parsed.validationPreflight, false);
  assert.equal(parsed.validationNetwork, "sepolia");
});

test("parseArgs supports optional operator monitoring proof for external rehearsal", () => {
  const parsed = parseArgs([
    "--mode",
    "external",
    "--env-file",
    "config/staging.env",
    "--base-url",
    "https://arena.example",
    "--proposition-id",
    "prop_staging_1",
    "--operator-monitoring-proof",
  ]);

  assert.equal(parsed.mode, "external");
  assert.equal(parsed.operatorMonitoringProof, true);
});

test("renderCommand formats the executed command for logs", () => {
  assert.equal(
    renderCommand({
      command: "docker",
      args: ["compose", "build"],
    }),
    "docker compose build",
  );
});

test("renderCommand redacts auth tokens from logged commands", () => {
  assert.equal(
    renderCommand({
      command: "pnpm",
      args: [
        "run",
        "backend:release:check",
        "--",
        "--base-url",
        "https://arena.example",
        "--auth-token",
        "secret-token",
      ],
    }),
    "pnpm run backend:release:check -- --base-url https://arena.example --auth-token <redacted>",
  );
});

test("buildExternalRerunCommand keeps optional validation flags aligned with the external alias", () => {
  assert.equal(
    buildExternalRerunCommand({
      envFilePath: "config/staging.env",
      baseUrl: "https://arena.example",
      authToken: "staging-token",
      propositionId: "prop_staging_1",
      validationDeploy: true,
      validationNetwork: "sepolia",
      validationPreflight: false,
    }),
    "pnpm run backend:release:rehearse:external -- --env-file config/staging.env --base-url https://arena.example --auth-token <operator-token> --proposition-id prop_staging_1 --validation-deploy --validation-network sepolia",
  );
});

test("buildExternalRerunCommand keeps optional operator monitoring proof aligned with the external alias", () => {
  assert.equal(
    buildExternalRerunCommand({
      envFilePath: "config/staging.env",
      baseUrl: "https://arena.example",
      authToken: "staging-token",
      operatorMonitoringProof: true,
      propositionId: "prop_staging_1",
      validationDeploy: false,
      validationNetwork: "validation",
      validationPreflight: false,
    }),
    "pnpm run backend:release:rehearse:external -- --env-file config/staging.env --base-url https://arena.example --auth-token <operator-token> --proposition-id prop_staging_1 --operator-monitoring-proof",
  );
});

test("runBackendReleaseRehearsal executes the guarded release sequence in order", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-release-rehearsal-run-"),
  );
  const envFilePath = path.join(workspace, "validation-local", "release-rehearsal.env");
  const expectedDockerEnvFilePath = envFilePath.replace(/\\/gu, "/");
  fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
  fs.writeFileSync(
    envFilePath,
    "COMPOSE_PROJECT_NAME=arena-release-rehearsal\n",
    "utf8",
  );

  const calls = [];
  const logger = createLogger();
  const exitCode = await runBackendReleaseRehearsal({
    cwd: workspace,
    envFilePath,
    logger,
    runCommand(command) {
      calls.push({
        label: command.label,
        command: command.command,
        args: [...command.args],
        env: command.env,
      });
      return { status: 0 };
    },
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(
    calls.map((call) => call.label),
    [
      "backend:release:host:check",
      "validation:prepare:local",
      "api:prisma:deploy",
      "validation:db:deploy",
      "docker:compose:down",
      "docker:compose:build",
      "docker:compose:up",
    ],
  );
  assert.deepEqual(
    {
      ...calls.at(-1),
      env: {
        ARENA_ENV_FILE: calls.at(-1).env.ARENA_ENV_FILE,
      },
    },
    {
      label: "docker:compose:up",
      command: "docker",
      args: [
        "compose",
        "--env-file",
        expectedDockerEnvFilePath,
        "-f",
        "docker-compose.prod.yml",
        "up",
        "-d",
        "--no-deps",
        "api",
        "scheduler-worker",
        "nginx",
      ],
      env: {
        ARENA_ENV_FILE: expectedDockerEnvFilePath,
      },
    },
  );
  assert.deepEqual(calls[0].args, [
    "run",
    "backend:release:host:check",
    "--",
    "--allow-local-rehearsal",
    "--env-file",
    envFilePath,
  ]);
  assert.deepEqual(calls[2].args, [
    "run",
    "api:prisma:deploy",
    "--",
    "--env-file",
    envFilePath,
  ]);
  assert.deepEqual(calls[3].args, [
    "run",
    "validation:db:deploy",
    "--",
    "--env-file",
    envFilePath,
  ]);
  for (const call of calls.filter((entry) => entry.command === "docker")) {
    assert.equal(call.env.ARENA_ENV_FILE, expectedDockerEnvFilePath);
  }
  assert.equal(
    logger.passMessages.includes(
      "Local backend release rehearsal completed. Next: inspect container logs and run the smoke checks against /health and /arena/internal/monitoring/runtime-contract.",
    ),
    true,
  );
});

test("runBackendReleaseRehearsal fails honestly when the release env file is missing", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-release-rehearsal-missing-env-"),
  );
  const envFilePath = path.join(workspace, "validation-local", "release-rehearsal.env");
  const logger = createLogger();

  const exitCode = await runBackendReleaseRehearsal({
    cwd: workspace,
    envFilePath,
    logger,
    runCommand() {
      throw new Error("runCommand should not be called when the env file is missing");
    },
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(logger.failMessages, [
    `Release rehearsal env file not found at ${envFilePath}. Run pnpm run backend:release:env:prepare first.`,
  ]);
});

test("runBackendReleaseRehearsal stops on the first failing guarded command", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-release-rehearsal-fail-step-"),
  );
  const envFilePath = path.join(workspace, "validation-local", "release-rehearsal.env");
  fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
  fs.writeFileSync(
    envFilePath,
    "COMPOSE_PROJECT_NAME=arena-release-rehearsal\n",
    "utf8",
  );

  const calls = [];
  const logger = createLogger();
  const exitCode = await runBackendReleaseRehearsal({
    cwd: workspace,
    envFilePath,
    logger,
    runCommand(command) {
      calls.push(command.label);
      return { status: command.label === "docker:compose:build" ? 1 : 0 };
    },
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(calls, [
    "backend:release:host:check",
    "validation:prepare:local",
    "api:prisma:deploy",
    "validation:db:deploy",
    "docker:compose:down",
    "docker:compose:build",
  ]);
  assert.deepEqual(logger.failMessages, [
    "Release rehearsal stopped at docker:compose:build. Fix the failing command above, then rerun pnpm run backend:release:rehearse:local.",
  ]);
});

test("runBackendReleaseRehearsal points host preflight failures at the recovery helper before rerunning local rehearsal", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-release-rehearsal-host-check-fail-"),
  );
  const envFilePath = path.join(workspace, "validation-local", "release-rehearsal.env");
  fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
  fs.writeFileSync(
    envFilePath,
    "COMPOSE_PROJECT_NAME=arena-release-rehearsal\n",
    "utf8",
  );

  const logger = createLogger();
  const exitCode = await runBackendReleaseRehearsal({
    cwd: workspace,
    envFilePath,
    logger,
    runCommand(command) {
      return { status: command.label === "backend:release:host:check" ? 1 : 0 };
    },
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(logger.failMessages, [
    "Release rehearsal stopped at backend:release:host:check. Run pnpm run backend:release:host:recover -- --clean-safe-caches --restart-docker --wait-for-docker-ms 180000, then rerun pnpm run backend:release:rehearse:local.",
  ]);
});

test("runBackendReleaseRehearsal supports an external proof sequence without local Docker compose", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-release-rehearsal-external-"),
  );
  const envFilePath = path.join(workspace, "config", "staging.env");
  fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
  fs.writeFileSync(
    envFilePath,
    [
      "ARENA_VALIDATION_ENVIRONMENT=staging",
      "ARENA_INTERNAL_OPERATOR_BEARER_TOKEN=env-token",
      "",
    ].join("\n"),
    "utf8",
  );

  const calls = [];
  const logger = createLogger();
  const exitCode = await runBackendReleaseRehearsal({
    cwd: workspace,
    envFilePath,
    mode: "external",
    baseUrl: "https://arena.example",
    authToken: "staging-token",
    propositionId: "prop_staging_1",
    logger,
    runCommand(command) {
      calls.push({
        label: command.label,
        command: command.command,
        args: [...command.args],
      });
      return { status: 0 };
    },
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(
    calls.map((call) => call.label),
    [
      "backend:release:host:check",
      "backend:release:check",
      "validation:ops:brief",
      "validation:proof:capture",
    ],
  );
  assert.deepEqual(calls[0].args, [
    "run",
    "backend:release:host:check",
    "--",
    "--env-file",
    envFilePath,
  ]);
  assert.deepEqual(calls[1].args, [
    "run",
    "backend:release:check",
    "--",
    "--base-url",
    "https://arena.example",
    "--auth-token",
    "staging-token",
  ]);
  assert.deepEqual(calls[2].args, [
    "run",
    "validation:ops:brief",
    "--",
    "--proposition-id",
    "prop_staging_1",
    "--env-file",
    envFilePath,
    "--base-url",
    "https://arena.example",
    "--auth-token",
    "staging-token",
  ]);
  assert.deepEqual(calls[3].args, [
    "run",
    "validation:proof:capture",
    "--",
    "--proposition-id",
    "prop_staging_1",
    "--env-file",
    envFilePath,
    "--base-url",
    "https://arena.example",
    "--auth-token",
    "staging-token",
  ]);
  assert.equal(
    logger.passMessages.includes(
      `External backend release rehearsal completed. Next: archive the proof artifacts from ${path.join(workspace, "validation-rehearsal", "prop_staging_1")} and attach them to the staging or clean-VM release evidence set. If this command is running on the same host that controls the staged Docker compose stack, also consider pnpm run backend:release:proof:operator -- --env-file ${envFilePath} --base-url https://arena.example before final proof archival.`,
    ),
    true,
  );
});

test("runBackendReleaseRehearsal can preflight and deploy validation before external proof capture", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-release-rehearsal-external-deploy-"),
  );
  const envFilePath = path.join(workspace, "config", "staging.env");
  fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
  fs.writeFileSync(
    envFilePath,
    [
      "ARENA_VALIDATION_ENVIRONMENT=staging",
      "ARENA_INTERNAL_OPERATOR_BEARER_TOKEN=env-token",
      "",
    ].join("\n"),
    "utf8",
  );

  const calls = [];
  const logger = createLogger();
  const exitCode = await runBackendReleaseRehearsal({
    cwd: workspace,
    envFilePath,
    mode: "external",
    baseUrl: "https://arena.example",
    propositionId: "prop_staging_deploy",
    validationDeploy: true,
    validationNetwork: "validation",
    logger,
    runCommand(command) {
      calls.push({
        label: command.label,
        args: [...command.args],
      });
      return { status: 0 };
    },
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(
    calls.map((call) => call.label),
    [
      "backend:release:host:check",
      "validation:preflight",
      "backend:release:check",
      "validation:ops:brief",
      "validation:proof:capture",
    ],
  );
  assert.deepEqual(calls[1].args, [
    "run",
    "validation:preflight",
    "--",
    "--env-file",
    envFilePath,
    "--deploy-validation",
    "--network",
    "validation",
  ]);
  assert.equal(
    logger.passMessages.includes(
      `External backend release rehearsal completed. Next: archive the proof artifacts from ${path.join(workspace, "validation-rehearsal", "prop_staging_deploy")} and attach them to the staging or clean-VM release evidence set. Validation deploy evidence for network validation is expected at ${path.join(workspace, "validation-rehearsal", "deployments", "deployment.validation.validation.json")}. If this command is running on the same host that controls the staged Docker compose stack, also consider pnpm run backend:release:proof:operator -- --env-file ${envFilePath} --base-url https://arena.example before final proof archival.`,
    ),
    true,
  );
});

test("runBackendReleaseRehearsal can include operator monitoring proof in the external sequence", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-release-rehearsal-external-operator-proof-"),
  );
  const envFilePath = path.join(workspace, "config", "staging.env");
  fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
  fs.writeFileSync(
    envFilePath,
    [
      "ARENA_VALIDATION_ENVIRONMENT=staging",
      "ARENA_INTERNAL_OPERATOR_BEARER_TOKEN=env-token",
      "",
    ].join("\n"),
    "utf8",
  );

  const calls = [];
  const logger = createLogger();
  const exitCode = await runBackendReleaseRehearsal({
    cwd: workspace,
    envFilePath,
    mode: "external",
    baseUrl: "https://arena.example",
    propositionId: "prop_staging_operator",
    operatorMonitoringProof: true,
    logger,
    runCommand(command) {
      calls.push({
        label: command.label,
        args: [...command.args],
      });
      return { status: 0 };
    },
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(
    calls.map((call) => call.label),
    [
      "backend:release:host:check",
      "backend:release:check",
      "backend:release:proof:operator",
      "validation:ops:brief",
      "validation:proof:capture",
    ],
  );
  assert.deepEqual(calls[2].args, [
    "run",
    "backend:release:proof:operator",
    "--",
    "--env-file",
    envFilePath,
    "--base-url",
    "https://arena.example",
  ]);
  assert.equal(
    logger.passMessages.includes(
      `External backend release rehearsal completed. Next: archive the proof artifacts from ${path.join(workspace, "validation-rehearsal", "prop_staging_operator")} plus ${path.join(workspace, "validation-local", "runtime-contract-operator-proof.json")} and attach them to the staging or clean-VM release evidence set.`,
    ),
    true,
  );
});

test("runBackendReleaseRehearsal reuses the operator bearer token from the external env file", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-release-rehearsal-external-env-token-"),
  );
  const envFilePath = path.join(workspace, "config", "staging.env");
  fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
  fs.writeFileSync(
    envFilePath,
    [
      "ARENA_VALIDATION_ENVIRONMENT=staging",
      "ARENA_INTERNAL_OPERATOR_BEARER_TOKEN=env-token",
      "",
    ].join("\n"),
    "utf8",
  );

  const calls = [];
  const logger = createLogger();
  const exitCode = await runBackendReleaseRehearsal({
    cwd: workspace,
    envFilePath,
    mode: "external",
    baseUrl: "https://arena.example",
    propositionId: "prop_staging_2",
    logger,
    runCommand(command) {
      calls.push({
        label: command.label,
        args: [...command.args],
      });
      return { status: 0 };
    },
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(calls[1].args, [
    "run",
    "backend:release:check",
    "--",
    "--base-url",
    "https://arena.example",
    "--auth-token",
    "env-token",
  ]);
  assert.deepEqual(calls[2].args, [
    "run",
    "validation:ops:brief",
    "--",
    "--proposition-id",
    "prop_staging_2",
    "--env-file",
    envFilePath,
    "--base-url",
    "https://arena.example",
    "--auth-token",
    "env-token",
  ]);
  assert.deepEqual(calls[3].args, [
    "run",
    "validation:proof:capture",
    "--",
    "--proposition-id",
    "prop_staging_2",
    "--env-file",
    envFilePath,
    "--base-url",
    "https://arena.example",
    "--auth-token",
    "env-token",
  ]);
});

test("runBackendReleaseRehearsal points external failures at the dedicated external alias", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-release-rehearsal-external-fail-step-"),
  );
  const envFilePath = path.join(workspace, "config", "staging.env");
  fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
  fs.writeFileSync(
    envFilePath,
    [
      "ARENA_VALIDATION_ENVIRONMENT=staging",
      "ARENA_INTERNAL_OPERATOR_BEARER_TOKEN=env-token",
      "",
    ].join("\n"),
    "utf8",
  );

  const calls = [];
  const logger = createLogger();
  const exitCode = await runBackendReleaseRehearsal({
    cwd: workspace,
    envFilePath,
    mode: "external",
    baseUrl: "https://arena.example",
    propositionId: "prop_staging_3",
    logger,
    runCommand(command) {
      calls.push(command.label);
      return { status: command.label === "validation:ops:brief" ? 1 : 0 };
    },
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(calls, [
    "backend:release:host:check",
    "backend:release:check",
    "validation:ops:brief",
  ]);
  assert.deepEqual(logger.failMessages, [
    `Release rehearsal stopped at validation:ops:brief. Fix the failing command above, then rerun pnpm run backend:release:rehearse:external -- --env-file ${envFilePath} --base-url https://arena.example --auth-token <operator-token> --proposition-id prop_staging_3.`,
  ]);
});

test("runBackendReleaseRehearsal preserves operator monitoring proof in external rerun guidance", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-release-rehearsal-external-operator-proof-fail-"),
  );
  const envFilePath = path.join(workspace, "config", "staging.env");
  fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
  fs.writeFileSync(
    envFilePath,
    [
      "ARENA_VALIDATION_ENVIRONMENT=staging",
      "ARENA_INTERNAL_OPERATOR_BEARER_TOKEN=env-token",
      "",
    ].join("\n"),
    "utf8",
  );

  const calls = [];
  const logger = createLogger();
  const exitCode = await runBackendReleaseRehearsal({
    cwd: workspace,
    envFilePath,
    mode: "external",
    baseUrl: "https://arena.example",
    propositionId: "prop_staging_3b",
    operatorMonitoringProof: true,
    logger,
    runCommand(command) {
      calls.push(command.label);
      return { status: command.label === "backend:release:proof:operator" ? 1 : 0 };
    },
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(calls, [
    "backend:release:host:check",
    "backend:release:check",
    "backend:release:proof:operator",
  ]);
  assert.deepEqual(logger.failMessages, [
    `Release rehearsal stopped at backend:release:proof:operator. Fix the failing command above, then rerun pnpm run backend:release:rehearse:external -- --env-file ${envFilePath} --base-url https://arena.example --auth-token <operator-token> --proposition-id prop_staging_3b --operator-monitoring-proof.`,
  ]);
});

test("runBackendReleaseRehearsal preserves optional validation preflight flags in external rerun guidance", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-release-rehearsal-external-preflight-fail-"),
  );
  const envFilePath = path.join(workspace, "config", "staging.env");
  fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
  fs.writeFileSync(
    envFilePath,
    [
      "ARENA_VALIDATION_ENVIRONMENT=staging",
      "ARENA_INTERNAL_OPERATOR_BEARER_TOKEN=env-token",
      "",
    ].join("\n"),
    "utf8",
  );

  const logger = createLogger();
  const exitCode = await runBackendReleaseRehearsal({
    cwd: workspace,
    envFilePath,
    mode: "external",
    baseUrl: "https://arena.example",
    propositionId: "prop_staging_5",
    validationDeploy: true,
    validationNetwork: "sepolia",
    logger,
    runCommand(command) {
      return { status: command.label === "validation:preflight" ? 1 : 0 };
    },
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(logger.failMessages, [
    `Release rehearsal stopped at validation:preflight. Fix the failing command above, then rerun pnpm run backend:release:rehearse:external -- --env-file ${envFilePath} --base-url https://arena.example --auth-token <operator-token> --proposition-id prop_staging_5 --validation-deploy --validation-network sepolia.`,
  ]);
});

test("runBackendReleaseRehearsal points external host preflight failures at the recovery helper", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-release-rehearsal-external-host-check-fail-"),
  );
  const envFilePath = path.join(workspace, "config", "staging.env");
  fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
  fs.writeFileSync(
    envFilePath,
    [
      "ARENA_VALIDATION_ENVIRONMENT=staging",
      "ARENA_INTERNAL_OPERATOR_BEARER_TOKEN=env-token",
      "",
    ].join("\n"),
    "utf8",
  );

  const logger = createLogger();
  const exitCode = await runBackendReleaseRehearsal({
    cwd: workspace,
    envFilePath,
    mode: "external",
    baseUrl: "https://arena.example",
    propositionId: "prop_staging_4",
    logger,
    runCommand(command) {
      return { status: command.label === "backend:release:host:check" ? 1 : 0 };
    },
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(logger.failMessages, [
    `Release rehearsal stopped at backend:release:host:check. If the current host is blocked by Docker Desktop, WSL, or low C: capacity, run pnpm run backend:release:host:recover -- --clean-safe-caches --restart-docker --wait-for-docker-ms 180000, then rerun pnpm run backend:release:rehearse:external -- --env-file ${envFilePath} --base-url https://arena.example --auth-token <operator-token> --proposition-id prop_staging_4.`,
  ]);
});

test("runBackendReleaseRehearsal fails honestly when external mode omits a proposition id", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-release-rehearsal-external-missing-prop-"),
  );
  const envFilePath = path.join(workspace, "config", "staging.env");
  fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
  fs.writeFileSync(
    envFilePath,
    "ARENA_VALIDATION_ENVIRONMENT=staging\n",
    "utf8",
  );
  const logger = createLogger();

  const exitCode = await runBackendReleaseRehearsal({
    cwd: workspace,
    envFilePath,
    mode: "external",
    baseUrl: "https://arena.example",
    authToken: "staging-token",
    logger,
    runCommand() {
      throw new Error("runCommand should not be called when external mode validation fails");
    },
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(logger.failMessages, [
    "External release rehearsal requires --proposition-id <id> so validation proof and operator briefing can be captured against the target staging proposition.",
  ]);
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
