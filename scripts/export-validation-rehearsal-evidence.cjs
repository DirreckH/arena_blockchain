#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const {
  fail,
  formatFetchFailure,
  info,
  loadEnvFile,
  pass,
} = require("./_validation-common.cjs");

async function exportValidationRehearsalEvidence(options = {}) {
  const cwd = options.cwd || process.cwd();
  const logger = options.logger || { fail, info, pass };

  loadEnvFile(path.resolve(cwd, ".env"), { override: true });

  const propositionId = options.propositionId || "";
  const baseUrl = stripTrailingSlash(
    options.baseUrl ||
      process.env.ARENA_INTERNAL_API_BASE_URL ||
      process.env.VITE_API_BASE_URL ||
      "http://127.0.0.1:4000",
  );
  const authToken =
    options.authToken || process.env.ARENA_INTERNAL_OPERATOR_BEARER_TOKEN || "";
  const outputPath =
    options.outputPath ||
    path.resolve(cwd, "validation-rehearsal-evidence.json");
  const fetchImpl = options.fetchImpl || fetch;

  if (!propositionId || propositionId.trim().length === 0) {
    logger.fail(
      "Missing proposition id. Provide --proposition-id <id> when exporting validation rehearsal evidence.",
    );
    return 1;
  }

  if (!authToken || authToken.trim().length === 0) {
    logger.fail(
      "Missing operator bearer token. Provide --auth-token <token> or set ARENA_INTERNAL_OPERATOR_BEARER_TOKEN.",
    );
    return 1;
  }

  const headers = {
    authorization: `Bearer ${authToken}`,
  };

  const bundle =
    (await tryFetchEvidenceBundle(fetchImpl, {
      propositionId,
      baseUrl,
      headers,
    })) ||
    (await fetchEvidenceBundleFromFallbackRoutes(fetchImpl, {
      propositionId,
      baseUrl,
      headers,
    }));

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(bundle, null, 2)}\n`);
  logger.pass(`Validation rehearsal evidence exported to ${outputPath}`);
  return 0;
}

async function tryFetchEvidenceBundle(fetchImpl, input) {
  const bundleUrl = `${input.baseUrl}/arena/internal/propositions/${input.propositionId}/evidence-bundle`;
  let response;
  try {
    response = await fetchImpl(
      bundleUrl,
      {
        method: "GET",
        headers: input.headers,
      },
    );
  } catch (error) {
    throw new Error(
      formatFetchFailure(error, {
        url: bundleUrl,
        label: "proposition evidence bundle",
      }),
    );
  }

  if (response.ok) {
    const payload = await response.json();
    return {
      ...payload,
      baseUrl: input.baseUrl,
    };
  }

  if (response.status === 404) {
    return null;
  }

  const body = typeof response.text === "function" ? await response.text() : "";
  throw new Error(
    `Unable to fetch proposition evidence bundle: HTTP ${response.status} ${body}`.trim(),
  );
}

async function fetchEvidenceBundleFromFallbackRoutes(fetchImpl, input) {
  const runtimeContract = await fetchJsonOrThrow(fetchImpl, {
    url: `${input.baseUrl}/arena/internal/monitoring/runtime-contract`,
    headers: input.headers,
    label: "runtime-contract",
  });
  const propositionExport = await fetchJsonOrThrow(fetchImpl, {
    url: `${input.baseUrl}/arena/internal/propositions/${input.propositionId}/export`,
    headers: input.headers,
    label: "proposition export",
  });
  const rehearsalCheckpoints = await fetchJsonOrThrow(fetchImpl, {
    url: `${input.baseUrl}/arena/internal/propositions/${input.propositionId}/rehearsal-checkpoints`,
    headers: input.headers,
    label: "rehearsal checkpoints",
  });

  return {
    propositionId: input.propositionId,
    baseUrl: input.baseUrl,
    exportedAt: new Date().toISOString(),
    runtimeContract,
    propositionExport,
    rehearsalCheckpoints,
  };
}

async function fetchJsonOrThrow(fetchImpl, input) {
  let response;
  try {
    response = await fetchImpl(input.url, {
      method: "GET",
      headers: input.headers,
    });
  } catch (error) {
    throw new Error(formatFetchFailure(error, input));
  }

  if (!response.ok) {
    const body = typeof response.text === "function" ? await response.text() : "";
    throw new Error(
      `Unable to fetch ${input.label} from ${input.url}: HTTP ${response.status} ${body}`.trim(),
    );
  }

  return response.json();
}

function stripTrailingSlash(value) {
  return String(value).replace(/\/+$/u, "");
}

function parseCliArgs(argv) {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];

    if (token === "--proposition-id" && next) {
      parsed.propositionId = next;
      index += 1;
      continue;
    }

    if (token === "--output" && next) {
      parsed.outputPath = next;
      index += 1;
      continue;
    }

    if (token === "--base-url" && next) {
      parsed.baseUrl = next;
      index += 1;
      continue;
    }

    if (token === "--auth-token" && next) {
      parsed.authToken = next;
      index += 1;
    }
  }

  return parsed;
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2));
  const exitCode = await exportValidationRehearsalEvidence(options);
  process.exit(exitCode);
}

if (require.main === module) {
  main().catch((error) => {
    fail(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

module.exports = {
  exportValidationRehearsalEvidence,
};
