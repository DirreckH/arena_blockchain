const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  parseCliArgs,
  runValidationProofDrive,
} = require("./drive-validation-proof.cjs");

const VALID_OPERATOR_PRIVATE_KEY = `0x${"11".repeat(32)}`;

test("parseCliArgs resolves env-file and base-url overrides", () => {
  const parsed = parseCliArgs([
    "--env-file",
    "config/local-proof.env",
    "--base-url",
    "http://127.0.0.1:4100",
  ]);

  assert.equal(
    parsed.envFilePath,
    path.resolve(process.cwd(), "config/local-proof.env"),
  );
  assert.equal(parsed.baseUrl, "http://127.0.0.1:4100");
});

test("runValidationProofDrive fails clearly when the required local env values are missing", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-drive-proof-missing-env-"),
  );
  const envFilePath = path.join(workspace, "config", "local-proof.env");
  const logger = createLogger();

  const exitCode = await runValidationProofDrive({
    cwd: workspace,
    envFilePath,
    env: {
      ARENA_INTERNAL_OPERATOR_BEARER_TOKEN: "",
      RPC_URL: "",
      CHAIN_ID: "",
      ARENA_VALIDATION_OPERATOR_PRIVATE_KEY: "",
      ARENA_VALIDATION_CONTRACT_ADDRESS: "",
    },
    loadEnvFileImpl() {
      return {
        envPath: envFilePath,
        exists: false,
        loaded: {},
      };
    },
    logger,
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(logger.failMessages, [
    "Missing required env value: ARENA_INTERNAL_OPERATOR_BEARER_TOKEN. Run pnpm run validation:bootstrap:local first.",
  ]);
});

test("runValidationProofDrive fails honestly when backend readiness is unavailable", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-drive-proof-health-fail-"),
  );
  const logger = createLogger();

  const exitCode = await runValidationProofDrive({
    cwd: workspace,
    env: createRequiredEnv(),
    loadEnvFileImpl() {
      return {
        envPath: path.join(workspace, ".env"),
        exists: true,
        loaded: {},
      };
    },
    fetchImpl: async (url) => {
      assert.equal(String(url), "http://127.0.0.1:4000/health/ready");
      return jsonResponse({ status: "down" }, 503);
    },
    providerFactory() {
      return {
        async getNetwork() {
          return { chainId: 1337 };
        },
        async send() {
          return null;
        },
      };
    },
    walletFactory() {
      return {
        address: "0xAbCdEfabcdefABCDEFabcdefABCDEFabcdefabcd",
        async sendTransaction() {
          throw new Error("sendTransaction should not be called when health is down");
        },
      };
    },
    logger,
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(logger.failMessages, [
    "Backend /health/ready not ok (HTTP 503). Start it with pnpm run backend:prepare:local.",
  ]);
});

test("runValidationProofDrive fails honestly when the RPC is unreachable", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-drive-proof-rpc-fail-"),
  );
  const logger = createLogger();

  const exitCode = await runValidationProofDrive({
    cwd: workspace,
    env: createRequiredEnv(),
    loadEnvFileImpl() {
      return {
        envPath: path.join(workspace, ".env"),
        exists: true,
        loaded: {},
      };
    },
    fetchImpl: async (url) => {
      assert.equal(String(url), "http://127.0.0.1:4000/health/ready");
      return jsonResponse({ status: "ok" });
    },
    providerFactory() {
      return {
        async getNetwork() {
          throw new Error("connect ECONNREFUSED 127.0.0.1:8545");
        },
        async send() {
          return null;
        },
      };
    },
    walletFactory() {
      return {
        address: "0xAbCdEfabcdefABCDEFabcdefABCDEFabcdefabcd",
        async sendTransaction() {
          throw new Error("sendTransaction should not be called when RPC is down");
        },
      };
    },
    logger,
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(logger.failMessages, [
    "RPC unreachable: connect ECONNREFUSED 127.0.0.1:8545",
  ]);
});

test("runValidationProofDrive completes a minimal happy path and prints the next capture command with env-file", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-drive-proof-success-"),
  );
  const envFilePath = path.join(workspace, "config", "local-proof.env");
  const logger = createLogger();
  const requests = [];
  const minedMethods = [];
  const sentTransactions = [];

  const exitCode = await runValidationProofDrive({
    cwd: workspace,
    envFilePath,
    env: createRequiredEnv(),
    loadEnvFileImpl() {
      return {
        envPath: envFilePath,
        exists: true,
        loaded: {},
      };
    },
    fetchImpl: async (url, init = {}) => {
      const parsedUrl = new URL(String(url));
      const route = `${String(init.method || "GET").toUpperCase()} ${parsedUrl.pathname}${parsedUrl.search}`;
      const requestBody = init.body ? JSON.parse(init.body) : null;
      requests.push({
        body: requestBody,
        route,
      });

      switch (route) {
        case "GET /health/ready":
          return jsonResponse({ status: "ok" });
        case "POST /arena/propositions/drafts":
          return jsonResponse({ propositionId: "prop_drive_1" });
        case "POST /arena/propositions/drafts/prop_drive_1/submit":
          return jsonResponse({ status: "submitted" });
        case "POST /arena/internal/propositions/prop_drive_1/approve":
          return jsonResponse({ status: "approved" });
        case "POST /arena/internal/validation-chain/sync":
          return jsonResponse({ status: "synced" });
        case "GET /arena/validation/markets":
          return jsonResponse([
            {
              propositionId: "prop_drive_1",
              marketId: "market_drive_1",
              marketStatus: "live",
              executionReadiness: {
                ready: true,
                chainStatus: "live",
              },
            },
          ]);
        case "POST /arena/internal/propositions/prop_drive_1/dispatch":
          return jsonResponse({ status: "dispatched" });
        case "GET /arena/adjudication/tasks":
          return jsonResponse([
            {
              propositionId: "prop_drive_1",
              taskId: "task_drive_1",
            },
          ]);
        case "POST /arena/adjudication/tasks/task_drive_1/responses":
          return jsonResponse({ responseId: "response_drive_1" });
        case "POST /arena/internal/responses/response_drive_1/review":
          return jsonResponse({ status: "reviewed" });
        case "POST /arena/validation/markets/market_drive_1/bets/prepare":
          return jsonResponse({
            transaction: {
              to: "0x0000000000000000000000000000000000000100",
              data: "0x1234",
              value: "10",
              chainMarketId: "chain_market_1",
            },
          });
        case "POST /arena/validation/markets/market_drive_1/bets/confirm":
          return jsonResponse({ status: "confirmed" });
        case "POST /arena/internal/validation-chain/propositions/prop_drive_1/freeze-market":
          return jsonResponse({ status: "frozen" });
        case "POST /arena/internal/validation-chain/propositions/prop_drive_1/resolve-market":
          return jsonResponse({ status: "resolved" });
        case "GET /arena/public/results/settled":
          return jsonResponse({
            items: [
              {
                propositionId: "prop_drive_1",
              },
            ],
          });
        default:
          throw new Error(`Unexpected route ${route}`);
      }
    },
    providerFactory(rpcUrl) {
      assert.equal(rpcUrl, "http://127.0.0.1:8545");
      return {
        async getNetwork() {
          return { chainId: 1337 };
        },
        async send(method) {
          minedMethods.push(method);
          return null;
        },
      };
    },
    walletFactory(privateKey) {
      assert.equal(privateKey, VALID_OPERATOR_PRIVATE_KEY);
      return {
        address: "0xAbCdEfabcdefABCDEFabcdefABCDEFabcdefabcd",
        async sendTransaction(transaction) {
          sentTransactions.push(transaction);
          return {
            hash: "0xfeedbeef",
            async wait(confirmations) {
              assert.equal(confirmations, 1);
              return {
                status: 1,
                blockNumber: 123,
              };
            },
          };
        },
      };
    },
    logger,
  });

  assert.equal(exitCode, 0);
  assert.equal(minedMethods.length >= 3, true);
  assert.equal(sentTransactions.length, 1);
  assert.equal(
    sentTransactions[0].value.toString(),
    "10",
  );
  assert.equal(
    requests.some(
      (request) =>
        request.route === "POST /arena/internal/propositions/prop_drive_1/dispatch" &&
        request.body?.userIds?.[0] === "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
    ),
    true,
  );
  assert.equal(
    logger.infoMessages.includes(
      `  pnpm run validation:proof:capture -- --proposition-id prop_drive_1 --env-file ${envFilePath}`,
    ),
    true,
  );
  assert.equal(
    logger.infoMessages.includes(
      `  pnpm run validation:ops:brief -- --proposition-id prop_drive_1 --env-file ${envFilePath}`,
    ),
    true,
  );
  assert.equal(
    logger.infoMessages.includes(
      `  ${path.join(workspace, "validation-rehearsal", "prop_drive_1")}`,
    ),
    true,
  );
  assert.equal(
    logger.passMessages.includes("Proposition prop_drive_1 is publicly settled."),
    true,
  );
  assert.equal(
    logger.passMessages.filter((message) => message === "PROPOSITION_ID=prop_drive_1").length,
    2,
  );
});

function createRequiredEnv() {
  return {
    ARENA_INTERNAL_API_BASE_URL: "http://127.0.0.1:4000",
    ARENA_INTERNAL_OPERATOR_BEARER_TOKEN: "secret-token",
    RPC_URL: "http://127.0.0.1:8545",
    CHAIN_ID: "1337",
    ARENA_VALIDATION_OPERATOR_PRIVATE_KEY: VALID_OPERATOR_PRIVATE_KEY,
    ARENA_VALIDATION_CONTRACT_ADDRESS:
      "0x0000000000000000000000000000000000000002",
  };
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
    async text() {
      return JSON.stringify(body);
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
