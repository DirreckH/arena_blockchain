const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  loadFixture,
} = require("@nomicfoundation/hardhat-network-helpers");

const MARKET_STATE = {
  Unset: 0,
  PreLive: 1,
  Live: 2,
  Frozen: 3,
  Resolved: 4,
  Cancelled: 5,
};

const RESULT_KIND = {
  None: 0,
  Resolved: 1,
  Void: 2,
};

const VOID_REASON = {
  None: 0,
  InsufficientSample: 1,
  Tie: 2,
};

const OPTION_NONE = 2;

const toId = (value) => ethers.utils.keccak256(ethers.utils.toUtf8Bytes(value));
const toNum = (value) => (value.toNumber ? value.toNumber() : Number(value));

describe("ArenaValidationMarket", function () {
  async function deployFixture() {
    const [admin, operator, oracle, pauser, bettorA, bettorB, bettorC, outsider] =
      await ethers.getSigners();

    const ArenaValidationMarket = await ethers.getContractFactory(
      "ArenaValidationMarket",
    );
    const contract = await ArenaValidationMarket.deploy(admin.address);
    await contract.deployed();

    const operatorRole = await contract.OPERATOR_ROLE();
    const oracleRole = await contract.ORACLE_ROLE();
    const pauserRole = await contract.PAUSER_ROLE();

    await contract.grantRole(operatorRole, operator.address);
    await contract.grantRole(oracleRole, oracle.address);
    await contract.grantRole(pauserRole, pauser.address);

    return {
      contract,
      admin,
      operator,
      oracle,
      pauser,
      bettorA,
      bettorB,
      bettorC,
      outsider,
    };
  }

  async function createPreLiveMarket(fixture, suffix = "1", minStake = "1") {
    const marketId = toId(`market-${suffix}`);
    const propositionId = toId(`proposition-${suffix}`);

    await fixture.contract
      .connect(fixture.operator)
      .createMarket(marketId, propositionId, ethers.utils.parseEther(minStake));

    return { marketId, propositionId };
  }

  async function createLiveMarket(fixture, suffix = "1", minStake = "1") {
    const ids = await createPreLiveMarket(fixture, suffix, minStake);
    await fixture.contract.connect(fixture.operator).openMarket(ids.marketId);
    return ids;
  }

  async function createFrozenMarket(fixture, suffix = "1", minStake = "1") {
    const ids = await createLiveMarket(fixture, suffix, minStake);
    await fixture.contract.connect(fixture.operator).freezeMarket(ids.marketId);
    return ids;
  }

  async function createResolvedMarket(fixture, suffix = "1") {
    const ids = await createLiveMarket(fixture, suffix);
    await fixture.contract
      .connect(fixture.bettorA)
      .placeBet(ids.marketId, 0, { value: ethers.utils.parseEther("2") });
    await fixture.contract
      .connect(fixture.bettorB)
      .placeBet(ids.marketId, 1, { value: ethers.utils.parseEther("1") });
    await fixture.contract.connect(fixture.operator).freezeMarket(ids.marketId);
    await fixture.contract.connect(fixture.oracle).resolveMarket({
      marketId: ids.marketId,
      propositionId: ids.propositionId,
      resultKind: RESULT_KIND.Resolved,
      winningOption: 0,
      voidReason: VOID_REASON.None,
    });

    return ids;
  }

  async function createCancelledMarket(fixture, suffix = "1") {
    const ids = await createLiveMarket(fixture, suffix);
    await fixture.contract
      .connect(fixture.bettorA)
      .placeBet(ids.marketId, 0, { value: ethers.utils.parseEther("1") });
    await fixture.contract.connect(fixture.operator).freezeMarket(ids.marketId);
    await fixture.contract
      .connect(fixture.operator)
      .cancelMarket(ids.marketId, toId(`reason-${suffix}`));
    return ids;
  }

  describe("lifecycle", function () {
    it("supports create -> open -> freeze -> resolve -> claim", async function () {
      const fixture = await loadFixture(deployFixture);
      const { contract, operator, oracle, bettorA, bettorB } = fixture;
      const { marketId, propositionId } = await createLiveMarket(fixture, "lifecycle");

      await contract
        .connect(bettorA)
        .placeBet(marketId, 0, { value: ethers.utils.parseEther("2") });
      await contract
        .connect(bettorB)
        .placeBet(marketId, 1, { value: ethers.utils.parseEther("1") });

      await expect(contract.connect(operator).freezeMarket(marketId))
        .to.emit(contract, "MarketFrozen");

      await expect(
        contract.connect(oracle).resolveMarket({
          marketId,
          propositionId,
          resultKind: RESULT_KIND.Resolved,
          winningOption: 0,
          voidReason: VOID_REASON.None,
        }),
      ).to.emit(contract, "MarketResolved");

      await expect(() => contract.connect(bettorA).claim(marketId)).to.changeEtherBalances(
        [contract, bettorA],
        [ethers.utils.parseEther("-3"), ethers.utils.parseEther("3")],
      );

      const market = await contract.getMarket(marketId);
      const position = await contract.getUserPosition(marketId, bettorA.address);

      expect(toNum(market.state)).to.equal(MARKET_STATE.Resolved);
      expect(toNum(market.resultKind)).to.equal(RESULT_KIND.Resolved);
      expect(toNum(position.claimableAmount)).to.equal(0);
      expect(position.claimed).to.equal(true);
    });

    it("supports create/live/frozen -> cancel -> refund", async function () {
      const fixture = await loadFixture(deployFixture);
      const { contract, bettorA } = fixture;
      const { marketId } = await createCancelledMarket(fixture, "cancel-lifecycle");

      await expect(() => contract.connect(bettorA).refund(marketId)).to.changeEtherBalances(
        [contract, bettorA],
        [ethers.utils.parseEther("-1"), ethers.utils.parseEther("1")],
      );

      const market = await contract.getMarket(marketId);
      const position = await contract.getUserPosition(marketId, bettorA.address);

      expect(toNum(market.state)).to.equal(MARKET_STATE.Cancelled);
      expect(position.claimed).to.equal(true);
    });
  });

  describe("access control", function () {
    it("rejects create/open/freeze/cancel for non-operator", async function () {
      const fixture = await loadFixture(deployFixture);
      const { contract, outsider } = fixture;
      const marketId = toId("market-access");
      const propositionId = toId("proposition-access");

      await expect(
        contract
          .connect(outsider)
          .createMarket(marketId, propositionId, ethers.utils.parseEther("1")),
      ).to.be.revertedWithCustomError(contract, "AccessControlUnauthorizedAccount");

      const ids = await createPreLiveMarket(fixture, "access-open");
      await expect(contract.connect(outsider).openMarket(ids.marketId)).to.be.revertedWithCustomError(
        contract,
        "AccessControlUnauthorizedAccount",
      );

      const liveIds = await createLiveMarket(fixture, "access-freeze");
      await expect(
        contract.connect(outsider).freezeMarket(liveIds.marketId),
      ).to.be.revertedWithCustomError(contract, "AccessControlUnauthorizedAccount");

      const frozenIds = await createFrozenMarket(fixture, "access-cancel");
      await expect(
        contract
          .connect(outsider)
          .cancelMarket(frozenIds.marketId, toId("cancel")),
      ).to.be.revertedWithCustomError(contract, "AccessControlUnauthorizedAccount");
    });

    it("rejects resolve for non-oracle", async function () {
      const fixture = await loadFixture(deployFixture);
      const { contract, outsider } = fixture;
      const { marketId, propositionId } = await createFrozenMarket(fixture, "non-oracle");

      await expect(
        contract.connect(outsider).resolveMarket({
          marketId,
          propositionId,
          resultKind: RESULT_KIND.Void,
          winningOption: OPTION_NONE,
          voidReason: VOID_REASON.Tie,
        }),
      ).to.be.revertedWithCustomError(contract, "AccessControlUnauthorizedAccount");
    });

    it("rejects pause for non-pauser", async function () {
      const fixture = await loadFixture(deployFixture);
      const { contract, outsider } = fixture;

      await expect(contract.connect(outsider).pause()).to.be.revertedWithCustomError(
        contract,
        "AccessControlUnauthorizedAccount",
      );
    });
  });

  describe("betting", function () {
    it("allows betting while market is live", async function () {
      const fixture = await loadFixture(deployFixture);
      const { contract, bettorA } = fixture;
      const { marketId } = await createLiveMarket(fixture, "live-bet");

      await expect(
        contract
          .connect(bettorA)
          .placeBet(marketId, 1, { value: ethers.utils.parseEther("1") }),
      ).to.emit(contract, "BetPlaced");

      const position = await contract.getUserPosition(marketId, bettorA.address);
      expect(toNum(position.selectedOption)).to.equal(1);
      expect(position.stakeAmount).to.equal(ethers.utils.parseEther("1"));
    });

    it("rejects betting when market is not live", async function () {
      const fixture = await loadFixture(deployFixture);
      const { contract, bettorA } = fixture;
      const preLiveIds = await createPreLiveMarket(fixture, "pre-live-bet");

      await expect(
        contract
          .connect(bettorA)
          .placeBet(preLiveIds.marketId, 0, { value: ethers.utils.parseEther("1") }),
      ).to.be.revertedWithCustomError(contract, "InvalidMarketState");

      const frozenIds = await createFrozenMarket(fixture, "frozen-bet");
      await expect(
        contract
          .connect(bettorA)
          .placeBet(frozenIds.marketId, 0, { value: ethers.utils.parseEther("1") }),
      ).to.be.revertedWithCustomError(contract, "InvalidMarketState");
    });

    it("rejects bets below minStake", async function () {
      const fixture = await loadFixture(deployFixture);
      const { contract, bettorA } = fixture;
      const { marketId } = await createLiveMarket(fixture, "min-stake", "2");

      await expect(
        contract
          .connect(bettorA)
          .placeBet(marketId, 0, { value: ethers.utils.parseEther("1") }),
      ).to.be.revertedWithCustomError(contract, "StakeBelowMinimum");
    });

    it("rejects invalid options", async function () {
      const fixture = await loadFixture(deployFixture);
      const { contract, bettorA } = fixture;
      const { marketId } = await createLiveMarket(fixture, "invalid-option");

      await expect(
        contract
          .connect(bettorA)
          .placeBet(marketId, 2, { value: ethers.utils.parseEther("1") }),
      ).to.be.revertedWithCustomError(contract, "InvalidOption");
    });

    it("rejects duplicate positions for the same user", async function () {
      const fixture = await loadFixture(deployFixture);
      const { contract, bettorA } = fixture;
      const { marketId } = await createLiveMarket(fixture, "duplicate-position");

      await contract
        .connect(bettorA)
        .placeBet(marketId, 0, { value: ethers.utils.parseEther("1") });

      await expect(
        contract
          .connect(bettorA)
          .placeBet(marketId, 1, { value: ethers.utils.parseEther("1") }),
      ).to.be.revertedWithCustomError(contract, "PositionAlreadyExists");
    });
  });

  describe("resolve", function () {
    it("only allows resolve from Frozen", async function () {
      const fixture = await loadFixture(deployFixture);
      const { contract, oracle } = fixture;
      const liveIds = await createLiveMarket(fixture, "resolve-live");

      await expect(
        contract.connect(oracle).resolveMarket({
          marketId: liveIds.marketId,
          propositionId: liveIds.propositionId,
          resultKind: RESULT_KIND.Void,
          winningOption: OPTION_NONE,
          voidReason: VOID_REASON.Tie,
        }),
      ).to.be.revertedWithCustomError(contract, "InvalidMarketState");
    });

    it("rejects repeated resolve", async function () {
      const fixture = await loadFixture(deployFixture);
      const { contract, oracle } = fixture;
      const { marketId, propositionId } = await createFrozenMarket(fixture, "resolve-once");

      await contract.connect(oracle).resolveMarket({
        marketId,
        propositionId,
        resultKind: RESULT_KIND.Void,
        winningOption: OPTION_NONE,
        voidReason: VOID_REASON.InsufficientSample,
      });

      await expect(
        contract.connect(oracle).resolveMarket({
          marketId,
          propositionId,
          resultKind: RESULT_KIND.Void,
          winningOption: OPTION_NONE,
          voidReason: VOID_REASON.Tie,
        }),
      ).to.be.revertedWithCustomError(contract, "InvalidMarketState");
    });

    it("rejects mismatched market and proposition payloads", async function () {
      const fixture = await loadFixture(deployFixture);
      const { contract, oracle } = fixture;
      const { marketId } = await createFrozenMarket(fixture, "resolve-mismatch");

      await expect(
        contract.connect(oracle).resolveMarket({
          marketId,
          propositionId: toId("wrong-proposition"),
          resultKind: RESULT_KIND.Void,
          winningOption: OPTION_NONE,
          voidReason: VOID_REASON.Tie,
        }),
      ).to.be.revertedWithCustomError(contract, "ResultPayloadMismatch");
    });

    it("enforces void payload rules", async function () {
      const fixture = await loadFixture(deployFixture);
      const { contract, oracle } = fixture;
      const { marketId, propositionId } = await createFrozenMarket(fixture, "void-payload");

      await expect(
        contract.connect(oracle).resolveMarket({
          marketId,
          propositionId,
          resultKind: RESULT_KIND.Void,
          winningOption: 0,
          voidReason: VOID_REASON.Tie,
        }),
      ).to.be.revertedWithCustomError(contract, "InvalidVoidPayload");

      await expect(
        contract.connect(oracle).resolveMarket({
          marketId,
          propositionId,
          resultKind: RESULT_KIND.Void,
          winningOption: OPTION_NONE,
          voidReason: VOID_REASON.None,
        }),
      ).to.be.revertedWithCustomError(contract, "InvalidVoidPayload");
    });

    it("enforces normal result payload rules", async function () {
      const fixture = await loadFixture(deployFixture);
      const { contract, oracle, bettorA } = fixture;
      const { marketId, propositionId } = await createLiveMarket(fixture, "normal-payload");

      await contract
        .connect(bettorA)
        .placeBet(marketId, 0, { value: ethers.utils.parseEther("1") });
      await contract.connect(fixture.operator).freezeMarket(marketId);

      await expect(
        contract.connect(oracle).resolveMarket({
          marketId,
          propositionId,
          resultKind: RESULT_KIND.Resolved,
          winningOption: OPTION_NONE,
          voidReason: VOID_REASON.None,
        }),
      ).to.be.revertedWithCustomError(contract, "InvalidOption");

      await expect(
        contract.connect(oracle).resolveMarket({
          marketId,
          propositionId,
          resultKind: RESULT_KIND.Resolved,
          winningOption: 0,
          voidReason: VOID_REASON.Tie,
        }),
      ).to.be.revertedWithCustomError(contract, "InvalidResolvedPayload");
    });

    it("supports official void without routing through cancel", async function () {
      const fixture = await loadFixture(deployFixture);
      const { contract, oracle, bettorA } = fixture;
      const { marketId, propositionId } = await createLiveMarket(fixture, "official-void");

      await contract
        .connect(bettorA)
        .placeBet(marketId, 0, { value: ethers.utils.parseEther("1") });
      await contract.connect(fixture.operator).freezeMarket(marketId);
      await contract.connect(oracle).resolveMarket({
        marketId,
        propositionId,
        resultKind: RESULT_KIND.Void,
        winningOption: OPTION_NONE,
        voidReason: VOID_REASON.Tie,
      });

      expect(await contract.claimableAmount(marketId, bettorA.address)).to.equal(
        ethers.utils.parseEther("1"),
      );
      await expect(contract.connect(bettorA).refund(marketId)).to.be.revertedWithCustomError(
        contract,
        "InvalidMarketState",
      );
    });
  });

  describe("claim and refund", function () {
    it("allows winners to claim", async function () {
      const fixture = await loadFixture(deployFixture);
      const { contract, bettorA } = fixture;
      const { marketId } = await createResolvedMarket(fixture, "winner-claim");

      expect(await contract.claimableAmount(marketId, bettorA.address)).to.equal(
        ethers.utils.parseEther("3"),
      );

      await expect(() => contract.connect(bettorA).claim(marketId)).to.changeEtherBalances(
        [contract, bettorA],
        [ethers.utils.parseEther("-3"), ethers.utils.parseEther("3")],
      );
    });

    it("returns zero claimable for losers and rejects loser claims", async function () {
      const fixture = await loadFixture(deployFixture);
      const { contract, bettorB } = fixture;
      const { marketId } = await createResolvedMarket(fixture, "loser-claim");

      expect(await contract.claimableAmount(marketId, bettorB.address)).to.equal(0);
      await expect(contract.connect(bettorB).claim(marketId)).to.be.revertedWithCustomError(
        contract,
        "NoClaimableAmount",
      );
    });

    it("rejects repeated claims", async function () {
      const fixture = await loadFixture(deployFixture);
      const { contract, bettorA } = fixture;
      const { marketId } = await createResolvedMarket(fixture, "repeat-claim");

      await contract.connect(bettorA).claim(marketId);

      await expect(contract.connect(bettorA).claim(marketId)).to.be.revertedWithCustomError(
        contract,
        "PositionAlreadyClaimed",
      );
    });

    it("allows refunds after cancel", async function () {
      const fixture = await loadFixture(deployFixture);
      const { contract, bettorA } = fixture;
      const { marketId } = await createCancelledMarket(fixture, "cancel-refund");

      expect(await contract.claimableAmount(marketId, bettorA.address)).to.equal(
        ethers.utils.parseEther("1"),
      );

      await expect(() => contract.connect(bettorA).refund(marketId)).to.changeEtherBalances(
        [contract, bettorA],
        [ethers.utils.parseEther("-1"), ethers.utils.parseEther("1")],
      );
    });

    it("rejects refunds outside Cancelled", async function () {
      const fixture = await loadFixture(deployFixture);
      const { contract, bettorA } = fixture;
      const { marketId } = await createResolvedMarket(fixture, "refund-state");

      await expect(contract.connect(bettorA).refund(marketId)).to.be.revertedWithCustomError(
        contract,
        "InvalidMarketState",
      );
    });

    it("rejects repeated refunds", async function () {
      const fixture = await loadFixture(deployFixture);
      const { contract, bettorA } = fixture;
      const { marketId } = await createCancelledMarket(fixture, "repeat-refund");

      await contract.connect(bettorA).refund(marketId);

      await expect(contract.connect(bettorA).refund(marketId)).to.be.revertedWithCustomError(
        contract,
        "PositionAlreadyClaimed",
      );
    });
  });

  describe("pause", function () {
    it("blocks key state-changing actions while paused", async function () {
      const fixture = await loadFixture(deployFixture);
      const { contract, pauser, operator, oracle, bettorA } = fixture;
      const { marketId, propositionId } = await createLiveMarket(fixture, "pause-state");

      await contract.connect(pauser).pause();

      await expect(
        contract
          .connect(operator)
          .createMarket(toId("paused-market"), toId("paused-proposition"), ethers.utils.parseEther("1")),
      ).to.be.revertedWithCustomError(contract, "EnforcedPause");
      await expect(contract.connect(operator).freezeMarket(marketId)).to.be.revertedWithCustomError(
        contract,
        "EnforcedPause",
      );
      await expect(
        contract
          .connect(bettorA)
          .placeBet(marketId, 0, { value: ethers.utils.parseEther("1") }),
      ).to.be.revertedWithCustomError(contract, "EnforcedPause");
      await expect(
        contract.connect(oracle).resolveMarket({
          marketId,
          propositionId,
          resultKind: RESULT_KIND.Void,
          winningOption: OPTION_NONE,
          voidReason: VOID_REASON.Tie,
        }),
      ).to.be.revertedWithCustomError(contract, "EnforcedPause");
    });

    it("blocks claim/refund while paused and resumes after unpause", async function () {
      const fixture = await loadFixture(deployFixture);
      const { contract, pauser, bettorA, operator, oracle } = fixture;
      const resolvedIds = await createResolvedMarket(fixture, "pause-claim");

      await contract.connect(pauser).pause();
      await expect(contract.connect(bettorA).claim(resolvedIds.marketId)).to.be.revertedWithCustomError(
        contract,
        "EnforcedPause",
      );

      await contract.connect(pauser).unpause();
      await expect(() => contract.connect(bettorA).claim(resolvedIds.marketId)).to.changeEtherBalances(
        [contract, bettorA],
        [ethers.utils.parseEther("-3"), ethers.utils.parseEther("3")],
      );

      const cancelledIds = await createLiveMarket(fixture, "pause-refund");
      await contract
        .connect(fixture.bettorB)
        .placeBet(cancelledIds.marketId, 1, { value: ethers.utils.parseEther("1") });
      await contract.connect(operator).freezeMarket(cancelledIds.marketId);
      await contract
        .connect(operator)
        .cancelMarket(cancelledIds.marketId, toId("paused-refund-reason"));

      await contract.connect(pauser).pause();
      await expect(
        contract.connect(fixture.bettorB).refund(cancelledIds.marketId),
      ).to.be.revertedWithCustomError(contract, "EnforcedPause");

      await contract.connect(pauser).unpause();
      await expect(() =>
        contract.connect(fixture.bettorB).refund(cancelledIds.marketId),
      ).to.changeEtherBalances(
        [contract, fixture.bettorB],
        [ethers.utils.parseEther("-1"), ethers.utils.parseEther("1")],
      );
    });
  });
});
