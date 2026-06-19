const fs = require("node:fs");
const path = require("node:path");
const { ethers } = require("hardhat");

const {
  loadEnvFile,
} = require("./_validation-common.cjs");

const ROOT_DIR = process.cwd();
const ENV_PATH = path.resolve(
  ROOT_DIR,
  process.env.ARENA_DEPLOY_ENV_FILE || ".env",
);
const OUTPUT_PATH = path.resolve(
  ROOT_DIR,
  process.env.ARENA_DEPLOY_OUTPUT_PATH || "deployment.json",
);
const SHOULD_WRITE_ENV = process.env.ARENA_DEPLOY_WRITE_ENV !== "0";

async function main() {
  loadEnvFile(ENV_PATH, { override: true });
  const [deployer] = await ethers.getSigners();
  
  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await deployer.getBalance()).toString());

  // 部署Arena合约
  const Arena = await ethers.getContractFactory("Arena");
  
  // 设置平台费用：创建费用0.01 ETH，平台手续费2%
  const creationFee = ethers.utils.parseEther("0.01");
  const platformFee = 200; // 2% (200/10000)
  
  const arena = await Arena.deploy(creationFee, platformFee);
  
  console.log("Arena contract deployed to:", arena.address);
  console.log("Transaction hash:", arena.deployTransaction.hash);
  
  // 等待部署确认
  await arena.deployed();
  
  console.log("Contract deployed successfully!");
  
  // 保存部署信息
  const deploymentInfo = {
    contractAddress: arena.address,
    deployerAddress: deployer.address,
    creationFee: creationFee.toString(),
    platformFee: platformFee.toString(),
    network: await deployer.provider.getNetwork(),
    deployedAt: new Date().toISOString()
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(deploymentInfo, null, 2));
  console.log(`Deployment info saved to: ${OUTPUT_PATH}`);

  if (SHOULD_WRITE_ENV) {
    updateEnvFileContractAddress(arena.address);
    console.log(`ARENA_CONTRACT_ADDRESS=${arena.address}`);
  } else {
    console.log("Skipped env file contract-address rewrite for this deployment.");
    console.log(`ARENA_CONTRACT_ADDRESS=${arena.address}`);
  }
}

function updateEnvFileContractAddress(contractAddress) {
  if (!fs.existsSync(ENV_PATH)) {
    return;
  }

  const contents = fs.readFileSync(ENV_PATH, "utf8");
  const nextLine = `ARENA_CONTRACT_ADDRESS=${contractAddress}`;
  const nextContents = contents.match(/^ARENA_CONTRACT_ADDRESS=/m)
    ? contents.replace(/^ARENA_CONTRACT_ADDRESS=.*$/m, nextLine)
    : `${contents.replace(/\n*$/u, "\n")}${nextLine}\n`;

  fs.writeFileSync(ENV_PATH, nextContents);
  console.log("Updated .env legacy Arena contract address.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
