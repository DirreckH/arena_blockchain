const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  emitLocalRemediation,
  inspectContainerRuntime,
  inspectRuntimeDependencies,
  locateDockerCli,
  locateDockerCliOnWindows,
  main,
} = require("./check-validation-runtime-deps.cjs");

test("check-validation-runtime-deps reports local container-runtime and RPC remediation when dependencies are down", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-validation-deps-check-"),
  );
  const envFilePath = path.join(workspace, ".env");

  fs.writeFileSync(
    envFilePath,
    [
      "ARENA_VALIDATION_ENVIRONMENT=local",
      "DATABASE_URL=postgresql://arena:arena@127.0.0.1:5432/arena?schema=public&connect_timeout=5",
      "REDIS_URL=redis://127.0.0.1:6379/0",
      "RPC_URL=http://127.0.0.1:8545",
      "CHAIN_ID=1337",
    ].join("\n"),
  );

  const logs = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args) => {
    logs.push(args.join(" "));
  };
  console.error = (...args) => {
    logs.push(args.join(" "));
  };

  const previousExitCode = process.exitCode;
  let observedExitCode = null;
  process.exitCode = 0;

  try {
    await main({
      envFilePath,
      inspectContainerRuntime: () => ({
        status: "engine-unreachable",
        message: "request returned 500 Internal Server Error",
        dockerDataDisk: {
          path: "C:\\Users\\Administrator\\AppData\\Local\\Docker\\wsl\\disk\\docker_data.vhdx",
          sizeBytes: 2768240640,
        },
        recentDockerFailureLines: ["[DEBUG] engine ping timeout"],
        wslDistributions: [
          {
            name: "docker-desktop",
            state: "Running",
          },
        ],
      }),
      inspectRuntimeDependencies: async () => ({
        ok: false,
        failedNames: ["postgres", "redis", "rpc"],
        results: [
          {
            name: "postgres",
            ok: false,
            message: "127.0.0.1:5432 refused: connect ECONNREFUSED 127.0.0.1:5432",
          },
          {
            name: "redis",
            ok: false,
            message: "127.0.0.1:6379 refused: connect ECONNREFUSED 127.0.0.1:6379",
          },
          {
            name: "rpc",
            ok: false,
            message: "fetch failed",
          },
        ],
      }),
    });
    observedExitCode = process.exitCode;
  } finally {
    console.log = originalLog;
    console.error = originalError;
    process.exitCode = previousExitCode;
  }

  assert.equal(observedExitCode, 1);
  const output = logs.join("\n");
  assert.match(output, /Docker CLI is installed but cannot reach the Linux engine/i);
  assert.match(output, /pnpm run deps:up cannot start Postgres or Redis here/i);
  assert.match(output, /Start or recover Docker Desktop/i);
  assert.match(output, /Start it with pnpm exec hardhat node/i);
  assert.match(output, /rerun pnpm run validation:deps:check and pnpm run validation:chain:check/i);
});

test("check-validation-runtime-deps loads a selected env file instead of the workspace root .env", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-validation-deps-check-explicit-file-"),
  );

  fs.writeFileSync(
    path.join(workspace, ".env"),
    [
      "ARENA_VALIDATION_ENVIRONMENT=staging",
      "DATABASE_URL=postgresql://arena:arena@10.0.0.1:5432/arena?schema=public&connect_timeout=5",
      "",
    ].join("\n"),
  );

  const envFilePath = path.join(workspace, "config", "release.env");
  fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
  fs.writeFileSync(
    envFilePath,
    [
      "ARENA_VALIDATION_ENVIRONMENT=local",
      "DATABASE_URL=postgresql://arena:arena@127.0.0.1:5432/arena?schema=public&connect_timeout=5",
      "REDIS_URL=redis://127.0.0.1:6379/0",
      "RPC_URL=http://127.0.0.1:8545",
      "CHAIN_ID=1337",
      "",
    ].join("\n"),
  );

  let observedDatabaseUrl = null;
  let observedValidationEnvironment = null;
  const logs = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args) => {
    logs.push(args.join(" "));
  };
  console.error = (...args) => {
    logs.push(args.join(" "));
  };

  const previousExitCode = process.exitCode;
  let observedExitCode = null;
  process.exitCode = 0;

  try {
    await main({
      envFilePath,
      inspectContainerRuntime: () => ({
        status: "engine-unreachable",
        message: "request returned 500 Internal Server Error",
      }),
      inspectRuntimeDependencies: async () => {
        observedDatabaseUrl = process.env.DATABASE_URL;
        observedValidationEnvironment = process.env.ARENA_VALIDATION_ENVIRONMENT;
        return {
          ok: false,
          failedNames: ["postgres", "redis", "rpc"],
          results: [
            {
              name: "postgres",
              ok: false,
              message: "127.0.0.1:5432 refused: connect ECONNREFUSED 127.0.0.1:5432",
            },
            {
              name: "redis",
              ok: false,
              message: "127.0.0.1:6379 refused: connect ECONNREFUSED 127.0.0.1:6379",
            },
            {
              name: "rpc",
              ok: false,
              message: "fetch failed",
            },
          ],
        };
      },
    });
    observedExitCode = process.exitCode;
  } finally {
    console.log = originalLog;
    console.error = originalError;
    process.exitCode = previousExitCode;
  }

  assert.equal(observedExitCode, 1);
  assert.equal(observedValidationEnvironment, "local");
  assert.equal(
    observedDatabaseUrl,
    "postgresql://arena:arena@127.0.0.1:5432/arena?schema=public&connect_timeout=5",
  );
  const output = logs.join("\n");
  assert.match(output, /Loaded \.env from .*config[\\/]release\.env/u);
  assert.doesNotMatch(output, /10\.0\.0\.1:5432/u);
});

test("inspectRuntimeDependencies returns structured failed dependency names", async () => {
  const result = await inspectRuntimeDependencies({
    env: {
      DATABASE_URL:
        "postgresql://arena:arena@127.0.0.1:5432/arena?schema=public&connect_timeout=5",
      REDIS_URL: "redis://127.0.0.1:6379/0",
      RPC_URL: "http://127.0.0.1:8545",
      CHAIN_ID: "1337",
    },
    checkTcpUrl: async (name) => ({
      name,
      ok: name !== "redis",
      message: name === "redis" ? "down" : "up",
    }),
    checkRpc: async () => ({
      name: "rpc",
      ok: false,
      message: "fetch failed",
    }),
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.failedNames, ["redis", "rpc"]);
  assert.equal(result.results.length, 3);
});

test("inspectContainerRuntime classifies a missing Docker CLI separately from an engine outage", () => {
  const runtime = inspectContainerRuntime({
    locateDockerCli() {
      return {
        available: false,
        message: "spawn where.exe ENOENT",
      };
    },
    runCommand() {
      return {
        status: 1,
        error: new Error("spawn docker ENOENT"),
        stdout: "",
        stderr: "",
      };
    },
  });

  assert.equal(runtime.status, "missing-cli");
  assert.equal(runtime.cliAvailable, false);
  assert.equal(runtime.engineReachable, false);
  assert.match(runtime.message, /ENOENT/i);
});

test("inspectContainerRuntime reports engine-unreachable when docker CLI exists but the Linux engine is down", () => {
  let callCount = 0;
  const runtime = inspectContainerRuntime({
    locateDockerCli() {
      return {
        available: true,
        path: "C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe",
      };
    },
    runCommand(command, args) {
      callCount += 1;
      assert.equal(command, "docker");
      assert.deepEqual(args, ["version", "--format", "{{.Server.Version}}"]);
      return {
        status: 1,
        stdout: "",
        stderr: "request returned 500 Internal Server Error",
      };
    },
  });

  assert.equal(runtime.status, "engine-unreachable");
  assert.equal(runtime.cliAvailable, true);
  assert.equal(runtime.engineReachable, false);
  assert.equal(runtime.composeAvailable, false);
  assert.match(runtime.message, /500 Internal Server Error/i);
});

test("inspectContainerRuntime reports compose-unavailable when engine is reachable but docker compose is missing", () => {
  const calls = [];
  const runtime = inspectContainerRuntime({
    locateDockerCli() {
      return {
        available: true,
        path: "C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe",
      };
    },
    runCommand(command, args) {
      calls.push([command, args]);
      if (calls.length === 1) {
        return {
          status: 0,
          stdout: "29.5.2\n",
          stderr: "",
        };
      }

      return {
        status: 1,
        stdout: "",
        stderr: "docker: 'compose' is not a docker command.",
      };
    },
  });

  assert.equal(runtime.status, "compose-unavailable");
  assert.equal(runtime.cliAvailable, true);
  assert.equal(runtime.engineReachable, true);
  assert.equal(runtime.composeAvailable, false);
  assert.equal(runtime.engineVersion, "29.5.2");
  assert.match(runtime.message, /not a docker command/i);
});

test("locateDockerCli uses where.exe on Windows and returns the first resolved executable", () => {
  const calls = [];
  const location = locateDockerCli({
    platform: "win32",
    runCommand(command, args) {
      calls.push([command, args]);
      return {
        status: 0,
        stdout: [
          "C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe",
          "C:\\Users\\Administrator\\scoop\\shims\\docker.exe",
        ].join("\n"),
        stderr: "",
      };
    },
  });

  assert.deepEqual(calls, [["where.exe", ["docker"]]]);
  assert.equal(location.available, true);
  assert.equal(
    location.path,
    "C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe",
  );
});

test("locateDockerCliOnWindows falls back to Get-Command when where.exe times out", () => {
  const calls = [];
  const location = locateDockerCliOnWindows((command, args) => {
    calls.push([command, args]);
    if (command === "where.exe") {
      return {
        status: 1,
        error: new Error("spawnSync where.exe ETIMEDOUT"),
        stdout: "",
        stderr: "",
      };
    }

    return {
      status: 0,
      stdout: "C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe\n",
      stderr: "",
    };
  });

  assert.equal(location.available, true);
  assert.equal(
    location.path,
    "C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe",
  );
  assert.deepEqual(calls, [
    ["where.exe", ["docker"]],
    [
      "powershell",
      [
        "-NoProfile",
        "-Command",
        "(Get-Command docker -ErrorAction Stop).Source",
      ],
    ],
  ]);
});

test("emitLocalRemediation explains an engine outage separately from a missing CLI", () => {
  const logger = createLogger();

  emitLocalRemediation(
    [
      { name: "postgres", ok: false, message: "down" },
      { name: "redis", ok: false, message: "down" },
    ],
    {
      env: {
        ARENA_VALIDATION_ENVIRONMENT: "local",
      },
      inspectContainerRuntime: () => ({
        status: "engine-unreachable",
        message: "request returned 500 Internal Server Error",
      }),
      logger,
    },
  );

  assert.equal(logger.messages.length, 2);
  assert.match(logger.messages[0], /installed but cannot reach the Linux engine/i);
  assert.match(logger.messages[0], /500 Internal Server Error/i);
  assert.match(logger.messages[1], /Start or recover Docker Desktop/i);
});

test("inspectContainerRuntime captures WSL and Docker data-disk diagnostics when the engine is unreachable", () => {
  const runtime = inspectContainerRuntime({
    env: {
      LOCALAPPDATA: "C:\\Users\\Administrator\\AppData\\Local",
    },
    locateDockerCli() {
      return {
        available: true,
        path: "C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe",
      };
    },
    readDockerDataDiskInfo() {
      return {
        path: "C:\\Users\\Administrator\\AppData\\Local\\Docker\\wsl\\disk\\docker_data.vhdx",
        sizeBytes: 22.17 * 1024 ** 3,
      };
    },
    readWslDistributionStates() {
      return {
        ok: true,
        entries: [
          { name: "Ubuntu-24.04", state: "Stopped", version: 2 },
          { name: "docker-desktop", state: "Running", version: 2 },
        ],
      };
    },
    runCommand(command, args) {
      assert.equal(command, "docker");
      assert.deepEqual(args, ["version", "--format", "{{.Server.Version}}"]);
      return {
        status: 1,
        stdout: "",
        stderr: "request returned 500 Internal Server Error",
      };
    },
    summarizeRecentDockerFailureLines() {
      return [
        "[2026-06-08T01:00:08Z] context deadline exceeded while awaiting headers",
      ];
    },
  });

  assert.equal(runtime.status, "engine-unreachable");
  assert.deepEqual(runtime.wslDistributions, [
    { name: "Ubuntu-24.04", state: "Stopped", version: 2 },
    { name: "docker-desktop", state: "Running", version: 2 },
  ]);
  assert.deepEqual(runtime.recentDockerFailureLines, [
    "[2026-06-08T01:00:08Z] context deadline exceeded while awaiting headers",
  ]);
  assert.deepEqual(runtime.dockerDataDisk, {
    path: "C:\\Users\\Administrator\\AppData\\Local\\Docker\\wsl\\disk\\docker_data.vhdx",
    sizeBytes: 22.17 * 1024 ** 3,
  });
});

test("emitLocalRemediation adds WSL-running, Docker failure, and data-disk hints for engine outages", () => {
  const logger = createLogger();

  emitLocalRemediation(
    [
      { name: "postgres", ok: false, message: "down" },
      { name: "redis", ok: false, message: "down" },
    ],
    {
      env: {
        ARENA_VALIDATION_ENVIRONMENT: "local",
      },
      inspectContainerRuntime: () => ({
        status: "engine-unreachable",
        message: "request returned 500 Internal Server Error",
        dockerDataDisk: {
          path: "C:\\Users\\Administrator\\AppData\\Local\\Docker\\wsl\\disk\\docker_data.vhdx",
          sizeBytes: 22.17 * 1024 ** 3,
        },
        recentDockerFailureLines: [
          "[2026-06-08T01:00:08Z] context deadline exceeded while awaiting headers",
        ],
        wslDistributions: [
          { name: "Ubuntu-24.04", state: "Stopped", version: 2 },
          { name: "docker-desktop", state: "Running", version: 2 },
        ],
      }),
      logger,
    },
  );

  assert.equal(logger.messages.length, 5);
  assert.match(logger.messages[0], /installed but cannot reach the Linux engine/i);
  assert.match(logger.messages[1], /docker_data\.vhdx/i);
  assert.match(logger.messages[1], /22\.17 GiB/i);
  assert.match(logger.messages[2], /docker-desktop` still reports Running/i);
  assert.match(logger.messages[3], /context deadline exceeded/i);
  assert.match(logger.messages[4], /Start or recover Docker Desktop/i);
});

function createLogger() {
  return {
    messages: [],
    info(message) {
      this.messages.push(message);
    },
  };
}
