// Implanta a CookoffFactory e exporta ABI + endereço para o frontend.
//
//   npx hardhat node                     (em outro terminal, para rede local)
//   npm run deploy:local                 (rede localhost / 31337)
//   npm run deploy:sepolia               (rede de teste Sepolia)

const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

const FRONTEND_CONTRACTS_DIR = path.join(__dirname, "..", "frontend", "src", "contracts");

async function main() {
  const { ethers, network } = hre;

  if (network.name === "hardhat") {
    console.warn(
      "Atenção: a rede 'hardhat' é descartada ao fim do script. " +
        "Use '--network localhost' (com `npx hardhat node` rodando) ou '--network sepolia'."
    );
  }

  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error(
      "Nenhuma conta configurada. Rode `npx hardhat vars set SEPOLIA_PRIVATE_KEY` e `npx hardhat vars set INFURA_API_KEY`."
    );
  }
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Rede:            ", network.name);
  console.log("Conta deployer:  ", deployer.address);
  console.log("Saldo:           ", ethers.formatEther(balance), "ETH");

  const factory = await ethers.deployContract("CookoffFactory");
  await factory.waitForDeployment();
  const address = await factory.getAddress();
  const receipt = await factory.deploymentTransaction().wait();

  console.log("CookoffFactory:  ", address);
  console.log("Bloco:           ", receipt.blockNumber);

  const { chainId } = await ethers.provider.getNetwork();
  exportFrontendFiles(Number(chainId), address, receipt.blockNumber);

  if (network.name === "sepolia") {
    console.log(`\nEtherscan: https://sepolia.etherscan.io/address/${address}`);
    console.log(`Para verificar o código: npx hardhat verify --network sepolia ${address}`);
  }
}

function exportFrontendFiles(chainId, factoryAddress, blockNumber) {
  fs.mkdirSync(FRONTEND_CONTRACTS_DIR, { recursive: true });

  for (const name of ["CookoffFactory", "Challenge"]) {
    const { abi } = hre.artifacts.readArtifactSync(name);
    fs.writeFileSync(path.join(FRONTEND_CONTRACTS_DIR, `${name}.json`), JSON.stringify({ abi }, null, 2) + "\n");
  }

  const addressesFile = path.join(FRONTEND_CONTRACTS_DIR, "addresses.json");
  const addresses = fs.existsSync(addressesFile) ? JSON.parse(fs.readFileSync(addressesFile, "utf8")) : {};
  addresses[String(chainId)] = { CookoffFactory: factoryAddress, deployBlock: blockNumber };
  fs.writeFileSync(addressesFile, JSON.stringify(addresses, null, 2) + "\n");

  console.log("ABIs e endereço exportados para", path.relative(process.cwd(), FRONTEND_CONTRACTS_DIR));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
