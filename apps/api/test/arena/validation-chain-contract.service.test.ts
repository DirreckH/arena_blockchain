import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ethers } from "ethers";

import { ValidationChainContractService } from "../../src/arena/validation-chain/validation-chain-contract.service";
import { AppConfigService } from "../../src/config/app-config.service";
import { validateEnv } from "../../src/config/env.schema";
import { ensureValidationContractArtifact } from "./validation-contract-artifact.fixture";

ensureValidationContractArtifact();

function createConfigService(overrides: Partial<Record<string, unknown>> = {}) {
  const values = {
    NODE_ENV: "test",
    PORT: 4000,
    DATABASE_URL: "postgresql://arena:arena@127.0.0.1:5432/arena?schema=public",
    REDIS_URL: "redis://127.0.0.1:6379/0",
    JWT_SECRET: "replace-with-a-long-random-secret",
    AUTH_CHALLENGE_TTL: 300,
    RPC_URL: "http://127.0.0.1:8545",
    CHAIN_ID: 1337,
    ARENA_CONTRACT_ADDRESS: "0x0000000000000000000000000000000000000001",
    ARENA_VALIDATION_ENVIRONMENT: "local",
    ARENA_VALIDATION_CONTRACT_ADDRESS: "0x0000000000000000000000000000000000000002",
    ARENA_VALIDATION_SYNC_CONFIRMATIONS: 1,
    ARENA_VALIDATION_SYNC_BATCH_SIZE: 500,
    OPERATOR_WALLET_ADDRESSES: "",
    ADMIN_WALLET_ADDRESSES: "",
    SYSTEM_WALLET_ADDRESSES: "",
    ...overrides,
  };

  const configService = {
    get(key: string) {
      return values[key as keyof typeof values];
    },
  };

  return new AppConfigService(configService as never);
}

describe("validation chain config and contract service", () => {
  it("reads validation-specific config without reusing the legacy contract address", () => {
    const config = createConfigService();
    const service = new ValidationChainContractService(config);

    assert.equal(config.arenaContractAddress, "0x0000000000000000000000000000000000000001");
    assert.equal(
      config.validationContractAddress,
      "0x0000000000000000000000000000000000000002",
    );
    assert.equal(
      service.getContractAddress(),
      "0x0000000000000000000000000000000000000002",
    );
    assert.notEqual(service.getContractAddress(), config.arenaContractAddress);
    assert.equal(
      service.getReadOnlyContract().address,
      config.validationContractAddress,
    );
  });

  it("exposes validation sync config and parses validation logs", () => {
    const config = createConfigService({
      ARENA_VALIDATION_SYNC_CONFIRMATIONS: 12,
      ARENA_VALIDATION_SYNC_BATCH_SIZE: 250,
    });
    const service = new ValidationChainContractService(config);
    const snapshot = service.getSnapshot();

    assert.equal(snapshot.confirmations, 12);
    assert.equal(snapshot.batchSize, 250);
    assert.match(snapshot.artifactPath, /ArenaValidationMarket\.json$/);

    const iface = service.getInterface();
    const marketId = ethers.utils.hexZeroPad("0x01", 32);
    const propositionId = ethers.utils.hexZeroPad("0x02", 32);
    const operator = "0x00000000000000000000000000000000000000aa";
    const encoded = iface.encodeEventLog(iface.getEvent("MarketCreated"), [
      marketId,
      propositionId,
      100,
      operator,
    ]);

    const parsed = service.parseLog(encoded);

    assert.equal(parsed.name, "MarketCreated");
    assert.equal(parsed.args.marketId, marketId);
    assert.equal(parsed.args.propositionId, propositionId);
    assert.equal(parsed.args.operator, ethers.utils.getAddress(operator));
  });

  it("fails env validation when the validation contract address is missing", () => {
    assert.throws(
      () =>
        validateEnv({
          NODE_ENV: "test",
          PORT: 4000,
          DATABASE_URL:
            "postgresql://arena:arena@127.0.0.1:5432/arena?schema=public",
          REDIS_URL: "redis://127.0.0.1:6379/0",
          JWT_SECRET: "replace-with-a-long-random-secret",
          AUTH_CHALLENGE_TTL: 300,
          RPC_URL: "http://127.0.0.1:8545",
          CHAIN_ID: 1337,
          ARENA_CONTRACT_ADDRESS: "0x0000000000000000000000000000000000000001",
          ARENA_VALIDATION_ENVIRONMENT: "local",
          ARENA_VALIDATION_SYNC_CONFIRMATIONS: 1,
          ARENA_VALIDATION_SYNC_BATCH_SIZE: 500,
          OPERATOR_WALLET_ADDRESSES: "",
          ADMIN_WALLET_ADDRESSES: "",
          SYSTEM_WALLET_ADDRESSES: "",
        }),
      /ARENA_VALIDATION_CONTRACT_ADDRESS/,
    );
  });

  it("fails env validation when the validation address reuses the legacy arena address", () => {
    assert.throws(
      () =>
        validateEnv({
          NODE_ENV: "test",
          PORT: 4000,
          DATABASE_URL:
            "postgresql://arena:arena@127.0.0.1:5432/arena?schema=public",
          REDIS_URL: "redis://127.0.0.1:6379/0",
          JWT_SECRET: "replace-with-a-long-random-secret",
          AUTH_CHALLENGE_TTL: 300,
          RPC_URL: "http://127.0.0.1:8545",
          CHAIN_ID: 1337,
          ARENA_CONTRACT_ADDRESS: "0x0000000000000000000000000000000000000001",
          ARENA_VALIDATION_ENVIRONMENT: "local",
          ARENA_VALIDATION_CONTRACT_ADDRESS:
            "0x0000000000000000000000000000000000000001",
          ARENA_VALIDATION_SYNC_CONFIRMATIONS: 1,
          ARENA_VALIDATION_SYNC_BATCH_SIZE: 500,
          OPERATOR_WALLET_ADDRESSES: "",
          ADMIN_WALLET_ADDRESSES: "",
          SYSTEM_WALLET_ADDRESSES: "",
        }),
      /must be different from the legacy ARENA_CONTRACT_ADDRESS/i,
    );
  });

  it("fails env validation when a validation signer key is malformed", () => {
    assert.throws(
      () =>
        validateEnv({
          NODE_ENV: "test",
          PORT: 4000,
          DATABASE_URL:
            "postgresql://arena:arena@127.0.0.1:5432/arena?schema=public",
          REDIS_URL: "redis://127.0.0.1:6379/0",
          JWT_SECRET: "replace-with-a-long-random-secret",
          AUTH_CHALLENGE_TTL: 300,
          RPC_URL: "http://127.0.0.1:8545",
          CHAIN_ID: 1337,
          ARENA_CONTRACT_ADDRESS: "0x0000000000000000000000000000000000000001",
          ARENA_VALIDATION_ENVIRONMENT: "local",
          ARENA_VALIDATION_CONTRACT_ADDRESS:
            "0x0000000000000000000000000000000000000002",
          ARENA_VALIDATION_SYNC_CONFIRMATIONS: 1,
          ARENA_VALIDATION_SYNC_BATCH_SIZE: 500,
          ARENA_VALIDATION_OPERATOR_PRIVATE_KEY: "bad-key",
          OPERATOR_WALLET_ADDRESSES: "",
          ADMIN_WALLET_ADDRESSES: "",
          SYSTEM_WALLET_ADDRESSES: "",
        }),
      /32-byte hex private key/i,
    );
  });

  it("fails env validation when webhook bearer token mappings are malformed", () => {
    assert.throws(
      () =>
        validateEnv({
          NODE_ENV: "test",
          PORT: 4000,
          DATABASE_URL:
            "postgresql://arena:arena@127.0.0.1:5432/arena?schema=public",
          REDIS_URL: "redis://127.0.0.1:6379/0",
          JWT_SECRET: "replace-with-a-long-random-secret",
          AUTH_CHALLENGE_TTL: 300,
          RPC_URL: "http://127.0.0.1:8545",
          CHAIN_ID: 1337,
          ARENA_CONTRACT_ADDRESS: "0x0000000000000000000000000000000000000001",
          ARENA_VALIDATION_ENVIRONMENT: "local",
          ARENA_VALIDATION_CONTRACT_ADDRESS:
            "0x0000000000000000000000000000000000000002",
          ARENA_VALIDATION_SYNC_CONFIRMATIONS: 1,
          ARENA_VALIDATION_SYNC_BATCH_SIZE: 500,
          REQUESTER_DELIVERY_WEBHOOK_BEARER_TOKENS:
            "delivery_policy:token_ok,missing_separator",
          OPERATOR_WALLET_ADDRESSES: "",
          ADMIN_WALLET_ADDRESSES: "",
          SYSTEM_WALLET_ADDRESSES: "",
        }),
      /REQUESTER_DELIVERY_WEBHOOK_BEARER_TOKENS/i,
    );
  });

  it("parses webhook bearer token mappings from config", () => {
    const config = createConfigService({
      REQUESTER_DELIVERY_WEBHOOK_BEARER_TOKENS:
        "delivery_policy:token_one, retry_delivery:token_two ",
    });

    assert.deepEqual(config.requesterDeliveryWebhookBearerTokens, {
      delivery_policy: "token_one",
      retry_delivery: "token_two",
    });
  });

  it("fails env validation when ops alert webhook target mappings are malformed", () => {
    assert.throws(
      () =>
        validateEnv({
          NODE_ENV: "test",
          PORT: 4000,
          DATABASE_URL:
            "postgresql://arena:arena@127.0.0.1:5432/arena?schema=public",
          REDIS_URL: "redis://127.0.0.1:6379/0",
          JWT_SECRET: "replace-with-a-long-random-secret",
          AUTH_CHALLENGE_TTL: 300,
          RPC_URL: "http://127.0.0.1:8545",
          CHAIN_ID: 1337,
          ARENA_CONTRACT_ADDRESS: "0x0000000000000000000000000000000000000001",
          ARENA_VALIDATION_ENVIRONMENT: "local",
          ARENA_VALIDATION_CONTRACT_ADDRESS:
            "0x0000000000000000000000000000000000000002",
          ARENA_VALIDATION_SYNC_CONFIRMATIONS: 1,
          ARENA_VALIDATION_SYNC_BATCH_SIZE: 500,
          ARENA_OPS_ALERT_WEBHOOK_TARGETS: "pagerduty-no-separator",
          OPERATOR_WALLET_ADDRESSES: "",
          ADMIN_WALLET_ADDRESSES: "",
          SYSTEM_WALLET_ADDRESSES: "",
        }),
      /ARENA_OPS_ALERT_WEBHOOK_TARGETS/i,
    );
  });

  it("parses ops alert webhook config from AppConfigService", () => {
    const config = createConfigService({
      ARENA_OPS_ALERT_WEBHOOK_TARGETS:
        "pager=https://alerts.example.test/runtime, ops=https://alerts.example.test/validation ",
      ARENA_OPS_ALERT_WEBHOOK_BEARER_TOKENS:
        "pager:token_one, ops:token_two ",
      ARENA_OPS_ALERT_WEBHOOK_TIMEOUT_MS: 9000,
    });

    assert.deepEqual(config.opsAlertWebhookTargets, {
      pager: "https://alerts.example.test/runtime",
      ops: "https://alerts.example.test/validation",
    });
    assert.deepEqual(config.opsAlertWebhookBearerTokens, {
      pager: "token_one",
      ops: "token_two",
    });
    assert.equal(config.opsAlertWebhookTimeoutMs, 9000);
  });
});
