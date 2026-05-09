const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("Arena Contract", function () {
  async function deployArenaFixture() {
    const [owner, addr1, addr2] = await ethers.getSigners();
    
    const Arena = await ethers.getContractFactory("Arena");
    const arena = await Arena.deploy(
      ethers.utils.parseEther("0.01"), // 创建费用
      200 // 2% 平台手续费
    );
    await arena.deployed();

    return { arena, owner, addr1, addr2 };
  }

  describe("PK Creation", function () {
    it("Should create a new PK", async function () {
      const { arena, addr1 } = await loadFixture(deployArenaFixture);
      
      const title = "Test PK";
      const description = "This is a test PK";
      const options = ["Option A", "Option B"];
      const duration = 86400; // 24小时
      const minBetAmount = ethers.utils.parseEther("0.001");

      const tx = await arena.connect(addr1).createPK(
        title,
        description,
        options,
        duration,
        minBetAmount,
        { value: ethers.utils.parseEther("0.01") }
      );

      await tx.wait();
      
      // 验证PK被创建
      const pkCounter = await arena.pkCounter();
      expect(pkCounter).to.equal(1);

      // 验证PK详情
      const pk = await arena.getPK(1);
      expect(pk.title).to.equal(title);
      expect(pk.description).to.equal(description);
      expect(pk.options.length).to.equal(2);
      expect(pk.creator).to.equal(addr1.address);
      expect(pk.status).to.equal(0); // Active
    });

    it.skip("Should fail if creation fee is insufficient", async function () {
      const { arena, addr1 } = await loadFixture(deployArenaFixture);
      
      await expect(
        arena.connect(addr1).createPK(
          "Test PK",
          "Description",
          ["Option A", "Option B"],
          86400,
          ethers.utils.parseEther("0.001"),
          { value: ethers.utils.parseEther("0.005") } // 不足的创建费用
        )
      ).to.be.revertedWith("Insufficient creation fee");
    });

    it("Should fail with invalid parameters", async function () {
      const { arena, addr1 } = await loadFixture(deployArenaFixture);
      
      await expect(
        arena.connect(addr1).createPK(
          "", // 空标题
          "Description",
          ["Option A", "Option B"],
          86400,
          ethers.utils.parseEther("0.001"),
          { value: ethers.utils.parseEther("0.01") }
        )
      ).to.be.revertedWith("Title cannot be empty");

      await expect(
        arena.connect(addr1).createPK(
          "Test PK",
          "Description",
          ["Option A"], // 少于2个选项
          86400,
          ethers.utils.parseEther("0.001"),
          { value: ethers.utils.parseEther("0.01") }
        )
      ).to.be.revertedWith("At least 2 options required");
    });
  });

  describe("Bet Placement", function () {
    it("Should allow users to place bets", async function () {
      const { arena, addr1, addr2 } = await loadFixture(deployArenaFixture);
      
      // 先创建一个PK
      await arena.connect(addr1).createPK(
        "Test PK",
        "Description",
        ["Option A", "Option B"],
        86400,
        ethers.utils.parseEther("0.001"),
        { value: ethers.utils.parseEther("0.01") }
      );
      
      const betAmount = ethers.utils.parseEther("0.01");
      
      await arena.connect(addr2).placeBet(1, 0, { value: betAmount });
      
      // 验证下注记录
      const userBet = await arena.getUserBet(1, addr2.address);
      expect(userBet.amount).to.equal(betAmount);
      expect(userBet.optionIndex).to.equal(0);
      expect(userBet.claimed).to.be.false;

      // 验证PK数据更新
      const pk = await arena.getPK(1);
      expect(pk.totalPool).to.equal(betAmount);
    });

    it("Should fail if bet amount is too low", async function () {
      const { arena, addr1, addr2 } = await loadFixture(deployArenaFixture);
      
      // 先创建一个PK
      await arena.connect(addr1).createPK(
        "Test PK",
        "Description",
        ["Option A", "Option B"],
        86400,
        ethers.utils.parseEther("0.001"),
        { value: ethers.utils.parseEther("0.01") }
      );
      
      await expect(
        arena.connect(addr2).placeBet(1, 0, { value: ethers.utils.parseEther("0.0001") })
      ).to.be.revertedWith("Bet amount too low");
    });

    it("Should fail if user already bet", async function () {
      const { arena, addr1, addr2 } = await loadFixture(deployArenaFixture);
      
      // 先创建一个PK
      await arena.connect(addr1).createPK(
        "Test PK",
        "Description",
        ["Option A", "Option B"],
        86400,
        ethers.utils.parseEther("0.001"),
        { value: ethers.utils.parseEther("0.01") }
      );
      
      await arena.connect(addr2).placeBet(1, 0, { value: ethers.utils.parseEther("0.01") });
      
      await expect(
        arena.connect(addr2).placeBet(1, 1, { value: ethers.utils.parseEther("0.01") })
      ).to.be.revertedWith("Already bet");
    });
  });

  describe("PK Settlement", function () {
    it("Should allow creator to settle PK", async function () {
      const { arena, addr1, addr2 } = await loadFixture(deployArenaFixture);
      
      // 创建PK并下注
      await arena.connect(addr1).createPK(
        "Test PK",
        "Description",
        ["Option A", "Option B"],
        86400, // 24小时持续时间
        ethers.utils.parseEther("0.001"),
        { value: ethers.utils.parseEther("0.01") }
      );

      await arena.connect(addr2).placeBet(1, 0, { value: ethers.utils.parseEther("0.01") });
      
      // 等待PK结束
      await ethers.provider.send("evm_increaseTime", [86401]);
      await ethers.provider.send("evm_mine");

      await arena.connect(addr1).settlePK(1, 0);

      const pk = await arena.getPK(1);
      expect(pk.winningOption).to.equal(0);
      expect(pk.status).to.equal(1); // Settled
    });

    it("Should allow owner to settle PK", async function () {
      const { arena, owner, addr1, addr2 } = await loadFixture(deployArenaFixture);
      
      // 创建PK并下注
      await arena.connect(addr1).createPK(
        "Test PK",
        "Description",
        ["Option A", "Option B"],
        86400, // 24h
        ethers.utils.parseEther("0.001"),
        { value: ethers.utils.parseEther("0.01") }
      );

      await arena.connect(addr2).placeBet(1, 1, { value: ethers.utils.parseEther("0.02") });
      
      // 等待PK结束
      await ethers.provider.send("evm_increaseTime", [86401]);
      await ethers.provider.send("evm_mine");

      await arena.connect(owner).settlePK(1, 1);

      const pk = await arena.getPK(1);
      expect(pk.winningOption).to.equal(1);
      expect(pk.status).to.equal(1); // Settled
    });

    it("Should fail if PK is still active", async function () {
      const { arena, addr1, addr2 } = await loadFixture(deployArenaFixture);
      
      // 创建PK并下注
      await arena.connect(addr1).createPK(
        "Test PK",
        "Description",
        ["Option A", "Option B"],
        86400, // 24小时持续时间
        ethers.utils.parseEther("0.001"),
        { value: ethers.utils.parseEther("0.01") }
      );

      await arena.connect(addr2).placeBet(1, 0, { value: ethers.utils.parseEther("0.01") });
      
      await expect(
        arena.connect(addr1).settlePK(1, 0)
      ).to.be.revertedWith("PK not ended");
    });
  });

  describe("Reward Claiming", function () {
    it("Should allow winners to claim rewards", async function () {
      const { arena, addr1, addr2 } = await loadFixture(deployArenaFixture);
      
      // 创建PK、下注、结算
      await arena.connect(addr1).createPK(
        "Test PK",
        "Description",
        ["Option A", "Option B"],
        86400,
        ethers.utils.parseEther("0.001"),
        { value: ethers.utils.parseEther("0.01") }
      );

      await arena.connect(addr2).placeBet(1, 0, { value: ethers.utils.parseEther("0.01") });
      
      // 等待PK结束并结算
      await ethers.provider.send("evm_increaseTime", [86401]);
      await ethers.provider.send("evm_mine");
      await arena.connect(addr1).settlePK(1, 0);
      
      const initialBalance = await addr2.getBalance();
      
      await arena.connect(addr2).claimReward(1);

      const finalBalance = await addr2.getBalance();
      expect(finalBalance).to.be.gt(initialBalance);

      // 验证已领取
      const userBet = await arena.getUserBet(1, addr2.address);
      expect(userBet.claimed).to.be.true;
    });

    it("Should fail for non-winners", async function () {
      const { arena, owner, addr1, addr2 } = await loadFixture(deployArenaFixture);
      
      // 创建PK、下注、结算
      await arena.connect(addr1).createPK(
        "Test PK",
        "Description",
        ["Option A", "Option B"],
        86400,
        ethers.utils.parseEther("0.001"),
        { value: ethers.utils.parseEther("0.01") }
      );

      await arena.connect(addr2).placeBet(1, 0, { value: ethers.utils.parseEther("0.01") });
      
      // 等待PK结束并结算
      await ethers.provider.send("evm_increaseTime", [86401]);
      await ethers.provider.send("evm_mine");
      await arena.connect(addr1).settlePK(1, 0);
      
      await expect(
        arena.connect(owner).claimReward(1)
      ).to.be.revertedWith("No bet found");
    });

    it("Should fail if already claimed", async function () {
      const { arena, addr1, addr2 } = await loadFixture(deployArenaFixture);
      
      // 创建PK、下注、结算
      await arena.connect(addr1).createPK(
        "Test PK",
        "Description",
        ["Option A", "Option B"],
        86400,
        ethers.utils.parseEther("0.001"),
        { value: ethers.utils.parseEther("0.01") }
      );

      await arena.connect(addr2).placeBet(1, 0, { value: ethers.utils.parseEther("0.01") });
      
      // 等待PK结束并结算
      await ethers.provider.send("evm_increaseTime", [86401]);
      await ethers.provider.send("evm_mine");
      await arena.connect(addr1).settlePK(1, 0);
      
      await arena.connect(addr2).claimReward(1);
      
      await expect(
        arena.connect(addr2).claimReward(1)
      ).to.be.revertedWith("Reward already claimed");
    });
  });

  describe("Platform Fee Management", function () {
    it("Should allow owner to update platform fees", async function () {
      const { arena, owner } = await loadFixture(deployArenaFixture);
      
      const newCreationFee = ethers.utils.parseEther("0.02");
      const newPlatformFee = 300; // 3%

      await arena.connect(owner).updatePlatformFee(newCreationFee, newPlatformFee);

      const platformFee = await arena.platformFee();
      expect(platformFee.creationFee).to.equal(newCreationFee);
      expect(platformFee.platformFee).to.equal(newPlatformFee);
    });

    it("Should fail if non-owner tries to update fees", async function () {
      const { arena, addr1 } = await loadFixture(deployArenaFixture);
      
      await expect(
        arena.connect(addr1).updatePlatformFee(
          ethers.utils.parseEther("0.02"),
          300
        )
      ).to.be.revertedWithCustomError(arena, "OwnableUnauthorizedAccount")
       .withArgs(addr1.address);
    });

    it("Should fail if platform fee is too high", async function () {
      const { arena, owner } = await loadFixture(deployArenaFixture);
      
      await expect(
        arena.connect(owner).updatePlatformFee(
          ethers.utils.parseEther("0.01"),
          1500 // 15% - too high
        )
      ).to.be.revertedWith("Platform fee too high");
    });
  });

  describe("Emergency Functions", function () {
    it("Should allow owner to pause and unpause", async function () {
      const { arena, owner, addr1 } = await loadFixture(deployArenaFixture);
      
      await arena.connect(owner).pause();
      
      await expect(
        arena.connect(addr1).createPK(
          "Test PK",
          "Description",
          ["Option A", "Option B"],
          86400,
          ethers.utils.parseEther("0.001"),
          { value: ethers.utils.parseEther("0.01") }
        )
      ).to.be.revertedWithCustomError(arena, "EnforcedPause");

      await arena.connect(owner).unpause();
      
      // 现在应该可以创建PK
      await arena.connect(addr1).createPK(
        "Test PK",
        "Description",
        ["Option A", "Option B"],
        86400,
        ethers.utils.parseEther("0.001"),
        { value: ethers.utils.parseEther("0.01") }
      );
    });
  });
});