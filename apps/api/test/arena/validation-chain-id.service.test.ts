import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ValidationChainIdService } from "../../src/arena/validation-chain/validation-chain-id.service";
import type { AppConfigService } from "../../src/config/app-config.service";

function createConfigStub(
  overrides: Partial<Pick<AppConfigService, "chainId" | "validationEnvironment">> = {},
): AppConfigService {
  return {
    chainId: overrides.chainId ?? 1337,
    validationEnvironment: overrides.validationEnvironment ?? "local",
  } as AppConfigService;
}

describe("ValidationChainIdService", () => {
  it("produces a stable proposition id for the same input", () => {
    const service = new ValidationChainIdService(createConfigStub());

    const first = service.buildChainPropositionId("prop_123");
    const second = service.buildChainPropositionId("prop_123");

    assert.equal(first, second);
    assert.match(first, /^0x[a-f0-9]{64}$/);
  });

  it("separates proposition and market namespaces", () => {
    const service = new ValidationChainIdService(createConfigStub());

    const propositionId = service.buildChainPropositionId("shared-id");
    const marketId = service.buildChainMarketId("shared-id");

    assert.notEqual(propositionId, marketId);
  });

  it("changes output when validation environment changes", () => {
    const localService = new ValidationChainIdService(
      createConfigStub({ validationEnvironment: "local" }),
    );
    const prodService = new ValidationChainIdService(
      createConfigStub({ validationEnvironment: "prod" }),
    );

    const localValue = localService.buildChainMarketId("market_123");
    const prodValue = prodService.buildChainMarketId("market_123");

    assert.notEqual(localValue, prodValue);
  });

  it("changes output when chain id changes", () => {
    const devnetService = new ValidationChainIdService(
      createConfigStub({ chainId: 1337 }),
    );
    const testnetService = new ValidationChainIdService(
      createConfigStub({ chainId: 11155111 }),
    );

    const devnetValue = devnetService.buildChainPropositionId("prop_123");
    const testnetValue = testnetService.buildChainPropositionId("prop_123");

    assert.notEqual(devnetValue, testnetValue);
  });
});
