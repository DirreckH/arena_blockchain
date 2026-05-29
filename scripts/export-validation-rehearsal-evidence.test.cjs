const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  exportValidationRehearsalEvidence,
} = require("./export-validation-rehearsal-evidence.cjs");

test("export-validation-rehearsal-evidence writes a proposition-scoped operator bundle with runtime contract and checkpoint ledger", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-validation-evidence-"),
  );
  const outputPath = path.join(workspace, "bundle.json");
  const requested = [];

  const exitCode = await exportValidationRehearsalEvidence({
    propositionId: "prop_123",
    outputPath,
    baseUrl: "http://127.0.0.1:4000",
    authToken: "secret-token",
    fetchImpl: async (url, init = {}) => {
      requested.push({
        url,
        method: init.method || "GET",
        authorization: init.headers?.authorization || init.headers?.Authorization,
      });

      if (
        String(url).endsWith("/arena/internal/propositions/prop_123/evidence-bundle")
      ) {
        return jsonResponse({
          propositionId: "prop_123",
          exportedAt: "2026-05-28T00:01:00.000Z",
          runtimeContract: {
            status: "degraded",
            commands: {
              validationLocalPrepare: ["pnpm run validation:prepare:local"],
            },
          },
          propositionExport: {
            proposition: {
              id: "prop_123",
              title: "Evidence proposition",
            },
            validationRehearsal: {
              status: "blocked",
              summary: {
                currentStepId: "publish_and_open",
              },
            },
            exportedAt: "2026-05-28T00:00:00.000Z",
          },
          rehearsalCheckpoints: [
            {
              propositionId: "prop_123",
              stepId: "publish_and_open",
              status: "complete",
              evidence: ["tx:0xabc"],
            },
          ],
        });
      }

      if (String(url).endsWith("/arena/internal/monitoring/runtime-contract")) {
        return jsonResponse({
          status: "degraded",
          commands: {
            validationLocalPrepare: ["pnpm run validation:prepare:local"],
          },
        });
      }

      if (String(url).endsWith("/arena/internal/propositions/prop_123/export")) {
        return jsonResponse({
          proposition: {
            id: "prop_123",
            title: "Evidence proposition",
          },
          validationRehearsal: {
            status: "blocked",
            summary: {
              currentStepId: "publish_and_open",
            },
          },
          exportedAt: "2026-05-28T00:00:00.000Z",
        });
      }

      if (
        String(url).endsWith(
          "/arena/internal/propositions/prop_123/rehearsal-checkpoints",
        )
      ) {
        return jsonResponse([
          {
            propositionId: "prop_123",
            stepId: "publish_and_open",
            status: "complete",
            evidence: ["tx:0xabc"],
          },
        ]);
      }

      throw new Error(`Unexpected URL ${url}`);
    },
    logger: createLogger(),
  });

  assert.equal(exitCode, 0);
  assert.equal(fs.existsSync(outputPath), true);

  const bundle = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  assert.equal(bundle.propositionId, "prop_123");
  assert.equal(bundle.baseUrl, "http://127.0.0.1:4000");
  assert.equal(typeof bundle.exportedAt, "string");
  assert.equal(bundle.runtimeContract.status, "degraded");
  assert.equal(bundle.propositionExport.proposition.id, "prop_123");
  assert.equal(bundle.propositionExport.validationRehearsal.status, "blocked");
  assert.equal(bundle.rehearsalCheckpoints.length, 1);
  assert.equal(
    bundle.runtimeContract.commands.validationLocalPrepare[0],
    "pnpm run validation:prepare:local",
  );
  assert.deepEqual(
    requested.map((item) => item.url),
    [
      "http://127.0.0.1:4000/arena/internal/propositions/prop_123/evidence-bundle",
    ],
  );
  assert.equal(
    requested.every((item) => item.authorization === "Bearer secret-token"),
    true,
  );
});

test("export-validation-rehearsal-evidence falls back to individual operator routes when the bundle route is unavailable", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-validation-evidence-fallback-"),
  );
  const outputPath = path.join(workspace, "bundle.json");
  const requested = [];

  const exitCode = await exportValidationRehearsalEvidence({
    propositionId: "prop_456",
    outputPath,
    baseUrl: "http://127.0.0.1:4000",
    authToken: "secret-token",
    fetchImpl: async (url, init = {}) => {
      requested.push(String(url));

      if (
        String(url).endsWith("/arena/internal/propositions/prop_456/evidence-bundle")
      ) {
        return {
          ok: false,
          status: 404,
          async text() {
            return "not found";
          },
        };
      }

      if (String(url).endsWith("/arena/internal/monitoring/runtime-contract")) {
        return jsonResponse({
          status: "ok",
          commands: {
            validationLocalPrepare: ["pnpm run validation:prepare:local"],
          },
        });
      }

      if (String(url).endsWith("/arena/internal/propositions/prop_456/export")) {
        return jsonResponse({
          proposition: {
            id: "prop_456",
          },
          validationRehearsal: {
            status: "ready",
          },
          exportedAt: "2026-05-28T00:00:00.000Z",
        });
      }

      if (
        String(url).endsWith(
          "/arena/internal/propositions/prop_456/rehearsal-checkpoints",
        )
      ) {
        return jsonResponse([]);
      }

      throw new Error(`Unexpected URL ${url}`);
    },
    logger: createLogger(),
  });

  assert.equal(exitCode, 0);
  const bundle = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  assert.equal(bundle.propositionId, "prop_456");
  assert.equal(bundle.runtimeContract.status, "ok");
  assert.equal(bundle.propositionExport.proposition.id, "prop_456");
  assert.deepEqual(bundle.rehearsalCheckpoints, []);
  assert.deepEqual(requested, [
    "http://127.0.0.1:4000/arena/internal/propositions/prop_456/evidence-bundle",
    "http://127.0.0.1:4000/arena/internal/monitoring/runtime-contract",
    "http://127.0.0.1:4000/arena/internal/propositions/prop_456/export",
    "http://127.0.0.1:4000/arena/internal/propositions/prop_456/rehearsal-checkpoints",
  ]);
});

test("export-validation-rehearsal-evidence fails clearly when proposition id is missing", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-validation-evidence-missing-"),
  );
  const outputPath = path.join(workspace, "bundle.json");

  const exitCode = await exportValidationRehearsalEvidence({
    propositionId: "",
    outputPath,
    baseUrl: "http://127.0.0.1:4000",
    authToken: "secret-token",
    fetchImpl: async () => {
      throw new Error("fetch should not be called");
    },
    logger: createLogger(),
  });

  assert.equal(exitCode, 1);
  assert.equal(fs.existsSync(outputPath), false);
});

test("export-validation-rehearsal-evidence surfaces actionable network guidance when the operator API is unreachable", async () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-validation-evidence-network-"),
  );

  await assert.rejects(
    () =>
      exportValidationRehearsalEvidence({
        propositionId: "prop_network",
        outputPath: path.join(workspace, "bundle.json"),
        baseUrl: "http://127.0.0.1:4999",
        authToken: "secret-token",
        fetchImpl: async () => {
          const error = new Error("connect ECONNREFUSED 127.0.0.1:4999");
          error.cause = {
            code: "ECONNREFUSED",
          };
          throw error;
        },
        logger: createLogger(),
      }),
    /Unable to reach proposition evidence bundle at http:\/\/127\.0\.0\.1:4999\/arena\/internal\/propositions\/prop_network\/evidence-bundle/u,
  );
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
    fail() {},
    info() {},
    pass() {},
  };
}
