const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  parseCliArgs,
  checkPublicIntegrityOverview,
} = require("./check-public-integrity-overview.cjs");

test("parseCliArgs resolves env-file, proposition id, base-url, and output path", () => {
  const parsed = parseCliArgs([
    "--env-file",
    "config/staging.env",
    "--proposition-id",
    "prop_integrity",
    "--base-url",
    "https://arena.example",
    "--output",
    "artifacts/public-integrity.json",
  ]);

  assert.equal(parsed.envFilePath, "config/staging.env");
  assert.equal(parsed.propositionId, "prop_integrity");
  assert.equal(parsed.baseUrl, "https://arena.example");
  assert.equal(parsed.outputPath, "artifacts/public-integrity.json");
});

test("check-public-integrity-overview writes a proposition-scoped artifact when the proposition is visible in archive focus", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-public-integrity-archive-"),
  );
  const logger = createLogger();

  const exitCode = await checkPublicIntegrityOverview({
    cwd: workspace,
    propositionId: "prop_archive",
    baseUrl: "http://127.0.0.1:4000",
    fetchImpl: async (url) => {
      assert.equal(
        String(url),
        "http://127.0.0.1:4000/arena/public/integrity/overview?propositionId=prop_archive",
      );
      return jsonResponse({
        generatedAt: "2026-05-29T10:00:00.000Z",
        live: {
          totalCount: 1,
          reachedSampleThresholdCount: 0,
          marketEnabledCount: 1,
          phaseBreakdown: [{ phase: "live", label: "采集中", count: 1 }],
          items: [],
        },
        archive: {
          settledCount: 2,
          onChainCount: 2,
          averageValidSampleCount: 34,
          latestSettledAt: "2026-05-28T08:00:00.000Z",
          recentItems: [
            {
              propositionId: "prop_archive",
              title: "Archive proposition",
              category: "general",
              settledAt: "2026-05-28T08:00:00.000Z",
              settlementTxHash: "0xarchive",
              onChain: true,
            },
          ],
        },
        focus: {
          propositionId: "prop_archive",
          visible: true,
          source: "archive",
          liveItem: null,
          archiveItem: {
            propositionId: "prop_archive",
            title: "Archive proposition",
            category: "general",
            settledAt: "2026-05-28T08:00:00.000Z",
            settlementTxHash: "0xarchive",
            onChain: true,
          },
        },
      });
    },
    logger,
  });

  assert.equal(exitCode, 0);

  const outputPath = path.join(
    workspace,
    "validation-rehearsal",
    "prop_archive",
    "public-integrity-overview.json",
  );
  assert.equal(fs.existsSync(outputPath), true);

  const artifact = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  assert.equal(artifact.propositionId, "prop_archive");
  assert.equal(artifact.visible, true);
  assert.equal(artifact.focus.source, "archive");
  assert.equal(artifact.focus.archiveItem.settlementTxHash, "0xarchive");
  assert.deepEqual(logger.failMessages, []);
  assert.deepEqual(logger.passMessages, [
    "Public integrity overview verification passed for proposition prop_archive",
  ]);
});

test("check-public-integrity-overview writes a proposition-scoped artifact when the proposition is visible in live focus", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-public-integrity-live-"),
  );
  const logger = createLogger();

  const exitCode = await checkPublicIntegrityOverview({
    cwd: workspace,
    propositionId: "prop_live",
    baseUrl: "https://arena.example",
    fetchImpl: async (url) => {
      assert.equal(
        String(url),
        "https://arena.example/arena/public/integrity/overview?propositionId=prop_live",
      );
      return jsonResponse({
        generatedAt: "2026-05-29T10:00:00.000Z",
        live: {
          totalCount: 2,
          reachedSampleThresholdCount: 1,
          marketEnabledCount: 2,
          phaseBreakdown: [{ phase: "live", label: "采集中", count: 2 }],
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
          propositionId: "prop_live",
          visible: true,
          source: "live",
          liveItem: {
            propositionId: "prop_live",
            title: "Live proposition",
            category: "ai",
            phase: "live",
            effectiveSampleCount: 19,
            requiredSampleCount: 40,
            progressPercent: 48,
            reachedSampleThreshold: false,
            marketEnabled: true,
            deadlineAt: "2026-05-30T11:00:00.000Z",
          },
          archiveItem: null,
        },
      });
    },
    logger,
  });

  assert.equal(exitCode, 0);
  const artifact = JSON.parse(
    fs.readFileSync(
      path.join(
        workspace,
        "validation-rehearsal",
        "prop_live",
        "public-integrity-overview.json",
      ),
      "utf8",
    ),
  );
  assert.equal(artifact.visible, true);
  assert.equal(artifact.focus.source, "live");
  assert.equal(artifact.focus.liveItem.progressPercent, 48);
});

test("check-public-integrity-overview fails clearly when the proposition is not yet visible", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-public-integrity-missing-"),
  );
  const logger = createLogger();

  const exitCode = await checkPublicIntegrityOverview({
    cwd: workspace,
    propositionId: "prop_missing",
    fetchImpl: async () =>
      jsonResponse({
        generatedAt: "2026-05-29T10:00:00.000Z",
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
          propositionId: "prop_missing",
          visible: false,
          source: null,
          liveItem: null,
          archiveItem: null,
        },
      }),
    logger,
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(logger.failMessages, [
    "Proposition prop_missing is not yet visible in the public integrity overview.",
  ]);
});

test("check-public-integrity-overview fails clearly when proposition id is missing", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-public-integrity-no-id-"),
  );
  const logger = createLogger();

  const exitCode = await checkPublicIntegrityOverview({
    cwd: workspace,
    propositionId: "",
    fetchImpl: async () => {
      throw new Error("fetch should not be called");
    },
    logger,
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(logger.failMessages, [
    "Missing proposition id. Provide --proposition-id <id> when checking the public integrity overview.",
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
