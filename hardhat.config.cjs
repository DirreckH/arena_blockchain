require("@nomicfoundation/hardhat-toolbox");

const validationDeployKey =
  process.env.ARENA_VALIDATION_DEPLOYER_PRIVATE_KEY || process.env.PRIVATE_KEY || "";
const validationRpcUrl = process.env.RPC_URL || process.env.SEPOLIA_URL || "";

module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    hardhat: {
      chainId: 1337
    },
    localhost: {
      url: "http://127.0.0.1:8545"
    },
    validation: {
      url: validationRpcUrl,
      accounts: validationDeployKey ? [validationDeployKey] : []
    },
    sepolia: {
      url: process.env.SEPOLIA_URL || "",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : []
    }
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  }
};
