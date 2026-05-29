const fs = require("node:fs");
const path = require("node:path");
const { ethers } = require("hardhat");
const {
  isAddress,
  loadEnvFile,
  normalizeAddress,
} = require("./_validation-common.cjs");

const ROOT_DIR = process.cwd();
const ENV_PATH = path.resolve(ROOT_DIR, ".env");

async function grantRoleIfNeeded(contract, roleName, account) {
  if (!account) {
    return;
  }

  const role = await contract[roleName]();
  const normalizedAccount = ethers.utils.getAddress(account);
  const alreadyGranted = await contract.hasRole(role, normalizedAccount);
  if (alreadyGranted) {
    console.log(`${roleName} already granted to ${normalizedAccount}`);
    return;
  }

  const tx = await contract.grantRole(role, normalizedAccount);
  console.log(`Granting ${roleName} to ${normalizedAccount}: ${tx.hash}`);
  await tx.wait();
}

async function main() {
  loadEnvFile(ENV_PATH, { override: true });

  const [deployer] = await ethers.getSigners();
  const admin = process.env.ARENA_VALIDATION_ADMIN_ADDRESS || deployer.address;
  if (!isAddress(admin)) {
    throw new Error("ARENA_VALIDATION_ADMIN_ADDRESS must be a valid EVM address");
  }

  console.log("Deploying ArenaValidationMarket with:", deployer.address);
  console.log("Admin:", normalizeAddress(admin));
  console.log("Deployer balance:", (await deployer.getBalance()).toString());

  const Factory = await ethers.getContractFactory("ArenaValidationMarket");
  const contract = await Factory.deploy(admin);
  await contract.deployed();

  console.log("ArenaValidationMarket deployed to:", contract.address);
  console.log("Deployment tx:", contract.deployTransaction.hash);

  await grantRoleIfNeeded(
    contract,
    "OPERATOR_ROLE",
    process.env.ARENA_VALIDATION_OPERATOR_ADDRESS,
  );
  await grantRoleIfNeeded(
    contract,
    "ORACLE_ROLE",
    process.env.ARENA_VALIDATION_ORACLE_ADDRESS,
  );
  await grantRoleIfNeeded(
    contract,
    "PAUSER_ROLE",
    process.env.ARENA_VALIDATION_PAUSER_ADDRESS,
  );

  const output = {
    network: await deployer.provider.getNetwork(),
    contractAddress: contract.address,
    deploymentTxHash: contract.deployTransaction.hash,
    deployerAddress: deployer.address,
    adminAddress: normalizeAddress(admin),
    operatorAddress: process.env.ARENA_VALIDATION_OPERATOR_ADDRESS || null,
    oracleAddress: process.env.ARENA_VALIDATION_ORACLE_ADDRESS || null,
    pauserAddress: process.env.ARENA_VALIDATION_PAUSER_ADDRESS || null,
    deployedAt: new Date().toISOString(),
  };

  const outputPath = path.resolve(
    process.cwd(),
    "deployment.validation.json",
  );
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log("Deployment info saved to:", outputPath);
  updateEnvFileContractAddress(contract.address);
  console.log("Next env update:");
  console.log(`ARENA_VALIDATION_CONTRACT_ADDRESS=${contract.address}`);
}

function updateEnvFileContractAddress(contractAddress) {
  if (!fs.existsSync(ENV_PATH)) {
    return;
  }

  const contents = fs.readFileSync(ENV_PATH, "utf8");
  const nextLine = `ARENA_VALIDATION_CONTRACT_ADDRESS=${contractAddress}`;
  const nextContents = contents.match(/^ARENA_VALIDATION_CONTRACT_ADDRESS=/m)
    ? contents.replace(
        /^ARENA_VALIDATION_CONTRACT_ADDRESS=.*$/m,
        nextLine,
      )
    : `${contents.replace(/\n*$/u, "\n")}${nextLine}\n`;

  fs.writeFileSync(ENV_PATH, nextContents);
  console.log("Updated .env validation contract address.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
