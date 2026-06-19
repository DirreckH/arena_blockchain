const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { spawnSync } = require("node:child_process");
const crypto = require("node:crypto");

const SCRIPT_PATH = path.resolve(
  __dirname,
  "bootstrap-validation-local.cjs",
);
const ENV_EXAMPLE_SOURCE = path.resolve(
  __dirname,
  "..",
  ".env.example",
);

test("bootstrap-validation-local creates a runnable local validation env", () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-validation-bootstrap-"),
  );
  fs.copyFileSync(
    ENV_EXAMPLE_SOURCE,
    path.join(workspace, ".env.example"),
  );

  const result = spawnSync(process.execPath, [SCRIPT_PATH], {
    cwd: workspace,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);

  const envPath = path.join(workspace, ".env");
  assert.equal(fs.existsSync(envPath), true);
  const envContents = fs.readFileSync(envPath, "utf8");

  assert.match(
    envContents,
    /^DATABASE_URL=postgresql:\/\/arena:arena@127\.0\.0\.1:5432\/arena\?schema=public&connect_timeout=5$/m,
  );
  assert.match(
    envContents,
    /^ARENA_VALIDATION_ENVIRONMENT=local$/m,
  );
  assert.match(
    envContents,
    /^ARENA_VALIDATION_OPERATOR_PRIVATE_KEY=0x[a-f0-9]{64}$/m,
  );
  assert.match(
    envContents,
    /^ARENA_VALIDATION_OPERATOR_ADDRESS=0x[a-fA-F0-9]{40}$/m,
  );
  assert.match(
    envContents,
    /^ARENA_REWARD_PAYOUT_ASSET_SYMBOL=USDC$/m,
  );
  assert.match(
    envContents,
    /^ARENA_REWARD_PAYOUT_ERC20_ADDRESS=0x[a-fA-F0-9]{40}$/m,
  );
  assert.match(
    envContents,
    /^ARENA_REWARD_PAYOUT_OPERATOR_PRIVATE_KEY=0x[a-f0-9]{64}$/m,
  );
  assert.match(
    envContents,
    /^ADMIN_WALLET_ADDRESSES=0x[a-f0-9]{40}$/m,
  );
  assert.match(
    envContents,
    /^ARENA_INTERNAL_OPERATOR_BEARER_TOKEN=[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/m,
  );

  const env = parseEnv(envContents);
  const payload = verifyHs256Jwt(
    env.ARENA_INTERNAL_OPERATOR_BEARER_TOKEN,
    env.JWT_SECRET,
  );
  const nowSeconds = Math.floor(Date.now() / 1000);

  assert.equal(payload.sub, env.ARENA_VALIDATION_OPERATOR_ADDRESS.toLowerCase());
  assert.equal(payload.walletAddress, env.ARENA_VALIDATION_OPERATOR_ADDRESS);
  assert.equal(payload.chainId, Number(env.CHAIN_ID));
  assert.deepEqual(payload.roles, ["admin", "operator", "user"]);
  assert.equal(typeof payload.iat, "number");
  assert.equal(typeof payload.exp, "number");
  assert.equal(payload.exp - payload.iat, 60 * 60 * 24);
  assert.ok(payload.iat <= nowSeconds);
  assert.ok(payload.exp > nowSeconds);
});

test("bootstrap-validation-local reuses deployment.validation.json when present", () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-validation-bootstrap-deploy-"),
  );
  fs.copyFileSync(
    ENV_EXAMPLE_SOURCE,
    path.join(workspace, ".env.example"),
  );
  fs.writeFileSync(
    path.join(workspace, "deployment.validation.json"),
    JSON.stringify({
      contractAddress: "0x00000000000000000000000000000000000000B0",
    }),
  );

  const result = spawnSync(process.execPath, [SCRIPT_PATH], {
    cwd: workspace,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);

  const envContents = fs.readFileSync(
    path.join(workspace, ".env"),
    "utf8",
  );
  assert.match(
    envContents,
    /^ARENA_VALIDATION_CONTRACT_ADDRESS=0x00000000000000000000000000000000000000B0$/m,
  );
});

test("bootstrap-validation-local preserves an existing valid local operator bearer token on rerun", () => {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-validation-bootstrap-rerun-"),
  );
  fs.copyFileSync(
    ENV_EXAMPLE_SOURCE,
    path.join(workspace, ".env.example"),
  );

  const firstRun = spawnSync(process.execPath, [SCRIPT_PATH], {
    cwd: workspace,
    encoding: "utf8",
  });
  assert.equal(firstRun.status, 0, firstRun.stderr || firstRun.stdout);

  const firstEnv = parseEnv(
    fs.readFileSync(path.join(workspace, ".env"), "utf8"),
  );

  const secondRun = spawnSync(process.execPath, [SCRIPT_PATH], {
    cwd: workspace,
    encoding: "utf8",
  });
  assert.equal(secondRun.status, 0, secondRun.stderr || secondRun.stdout);

  const secondEnv = parseEnv(
    fs.readFileSync(path.join(workspace, ".env"), "utf8"),
  );

  assert.equal(
    secondEnv.ARENA_INTERNAL_OPERATOR_BEARER_TOKEN,
    firstEnv.ARENA_INTERNAL_OPERATOR_BEARER_TOKEN,
  );
});

function parseEnv(contents) {
  return contents
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line.includes("="))
    .reduce((env, line) => {
      const separatorIndex = line.indexOf("=");
      env[line.slice(0, separatorIndex)] = line.slice(separatorIndex + 1);
      return env;
    }, {});
}

function verifyHs256Jwt(token, secret) {
  const [encodedHeader, encodedPayload, encodedSignature] = String(token).split(".");

  assert.ok(encodedHeader);
  assert.ok(encodedPayload);
  assert.ok(encodedSignature);

  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(signingInput)
    .digest("base64url");

  assert.equal(encodedSignature, expectedSignature);

  const header = JSON.parse(
    Buffer.from(encodedHeader, "base64url").toString("utf8"),
  );
  assert.deepEqual(header, {
    alg: "HS256",
    typ: "JWT",
  });

  return JSON.parse(
    Buffer.from(encodedPayload, "base64url").toString("utf8"),
  );
}
