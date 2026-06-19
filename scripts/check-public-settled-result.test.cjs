const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  parseCliArgs,
  checkPublicSettledResult,
} = require("./check-public-settled-result.cjs");

test("parseCliArgs resolves env-file, proposition id, base-url, and output path", () => {
  const parsed = parseCliArgs([
    "--env-file",
    "config/staging.env",
    "--proposition-id",
    "prop_123",
    "--base-url",
    "https://arena.example",
    "--output",
    "artifacts/public-result.json",
  ]);

  assert.equal(parsed.envFilePath, "config/staging.env");
  assert.equal(parsed.propositionId, "prop_123");
  assert.equal(parsed.baseUrl, "https://arena.example");
  assert.equal(parsed.outputPath, "artifacts/public-result.json");
});

test("check-public-settled-result writes a proposition-scoped public verification artifact when the settled proposition is visible", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-public-settled-found-"),
  );
  const logger = createLogger();

  const exitCode = await checkPublicSettledResult({
    cwd: workspace,
    propositionId: "prop_settled",
    baseUrl: "http://127.0.0.1:4000",
    fetchImpl: async (url) => {
      assert.equal(
        String(url),
        "http://127.0.0.1:4000/arena/public/results/settled",
      );
      return jsonResponse({
        totalCount: 2,
        items: [
          {
            propositionId: "prop_other",
            marketId: "market_other",
            title: "Other proposition",
            category: "general",
            winningOptionLabel: "Yes",
            resultKind: "resolved",
            winningOption: 0,
            voidReason: null,
            validSampleCount: 17,
            winMarginPercent: 58.8,
            settledAt: "2026-05-28T02:40:00.000Z",
            settlementTxHash: "0xabc",
            onChain: true,
          },
          {
            propositionId: "prop_settled",
            marketId: "market_1",
            title: "Settled proposition",
            category: "general",
            winningOptionLabel: "No",
            resultKind: "resolved",
            winningOption: 1,
            voidReason: null,
            validSampleCount: 23,
            winMarginPercent: 61.5,
            settledAt: "2026-05-28T03:30:00.000Z",
            settlementTxHash: "0xdef",
            onChain: true,
          },
        ],
      });
    },
    logger,
  });

  assert.equal(exitCode, 0);

  const outputPath = path.join(
    workspace,
    "validation-rehearsal",
    "prop_settled",
    "public-settled-result.json",
  );

  assert.equal(fs.existsSync(outputPath), true);

  const artifact = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  assert.equal(artifact.propositionId, "prop_settled");
  assert.equal(artifact.baseUrl, "http://127.0.0.1:4000");
  assert.equal(artifact.totalCount, 2);
  assert.equal(artifact.found, true);
  assert.equal(artifact.publicResult.propositionId, "prop_settled");
  assert.equal(artifact.publicResult.settlementTxHash, "0xdef");

  assert.deepEqual(logger.failMessages, []);
  assert.deepEqual(logger.passMessages, [
    "Public settled-result verification passed for proposition prop_settled",
  ]);
  assert.match(
    logger.infoMessages[0],
    /Public results route: http:\/\/127\.0\.0\.1:4000\/arena\/public\/results\/settled/u,
  );
  assert.match(logger.infoMessages[1], /Archive totalCount: 2/u);
  assert.match(logger.infoMessages[2], /Matched proposition: prop_settled/u);
  assert.match(logger.infoMessages[3], /Title: Settled proposition/u);
  assert.match(logger.infoMessages[4], /Settled at: 2026-05-28T03:30:00.000Z/u);
  assert.match(logger.infoMessages[5], /Result: resolved \/ No/u);
  assert.match(logger.infoMessages[6], /Settlement tx: 0xdef/u);
  assert.match(logger.infoMessages[7], /On-chain evidence: yes/u);
});

test("check-public-settled-result fails clearly when the proposition is not yet visible in the public settled archive", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-public-settled-missing-"),
  );
  const logger = createLogger();
  const outputPath = path.join(workspace, "public-proof.json");

  const exitCode = await checkPublicSettledResult({
    cwd: workspace,
    propositionId: "prop_missing",
    outputPath,
    baseUrl: "https://arena.example",
    fetchImpl: async (url) => {
      assert.equal(
        String(url),
        "https://arena.example/arena/public/results/settled",
      );
      return jsonResponse({
        totalCount: 1,
        items: [
          {
            propositionId: "prop_other",
            marketId: "market_other",
            title: "Other proposition",
            category: "general",
            winningOptionLabel: "Yes",
            resultKind: "resolved",
            winningOption: 0,
            voidReason: null,
            validSampleCount: 17,
            winMarginPercent: 58.8,
            settledAt: "2026-05-28T02:40:00.000Z",
            settlementTxHash: "0xabc",
            onChain: true,
          },
        ],
      });
    },
    logger,
  });

  assert.equal(exitCode, 1);
  assert.equal(fs.existsSync(outputPath), true);

  const artifact = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  assert.equal(artifact.propositionId, "prop_missing");
  assert.equal(artifact.found, false);
  assert.equal(artifact.publicResult, null);
  assert.equal(artifact.totalCount, 1);
  assert.deepEqual(logger.passMessages, []);
  assert.deepEqual(logger.failMessages, [
    "Proposition prop_missing is not yet visible in the public settled results archive.",
  ]);
});

test("check-public-settled-result fails clearly when proposition id is missing", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-public-settled-no-id-"),
  );
  const logger = createLogger();

  const exitCode = await checkPublicSettledResult({
    cwd: workspace,
    propositionId: "",
    fetchImpl: async () => {
      throw new Error("fetch should not be called");
    },
    logger,
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(logger.failMessages, [
    "Missing proposition id. Provide --proposition-id <id> when checking public settled results.",
  ]);
});

test("check-public-settled-result surfaces actionable network guidance when the public archive is unreachable", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-public-settled-network-"),
  );
  const logger = createLogger();

  await assert.rejects(
    () =>
      checkPublicSettledResult({
        cwd: workspace,
        propositionId: "prop_network",
        baseUrl: "http://127.0.0.1:4999",
        fetchImpl: async () => {
          const error = new Error("connect ECONNREFUSED 127.0.0.1:4999");
          error.cause = {
            code: "ECONNREFUSED",
          };
          throw error;
        },
        logger,
      }),
    /Unable to reach public settled results at http:\/\/127\.0\.0\.1:4999\/arena\/public\/results\/settled/u,
  );

  assert.deepEqual(logger.failMessages, []);
  assert.deepEqual(logger.passMessages, []);
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
