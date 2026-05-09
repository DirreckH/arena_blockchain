const { ethers } = require("hardhat");
const fs = require("fs");

async function main() {
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
    deploymentTime: new Date().toISOString()
  };
  
  fs.writeFileSync('deployment.json', JSON.stringify(deploymentInfo, null, 2));
  console.log("Deployment info saved to deployment.json");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });