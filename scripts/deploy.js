// Implanta o CookToken (COOK) e a CookoffFactory, e exporta ABIs + endereços
// para o frontend.
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

  // 1. Token: a factory precisa do endereço dele no construtor
  const token = await ethers.deployContract("CookToken");
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  const tokenReceipt = await token.deploymentTransaction().wait();
  console.log("CookToken:       ", tokenAddress);

  // 2. Factory, apontando para o token
  const factory = await ethers.deployContract("CookoffFactory", [tokenAddress]);
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  await factory.deploymentTransaction().wait();
  console.log("CookoffFactory:  ", factoryAddress);
  console.log("Bloco inicial:   ", tokenReceipt.blockNumber);

  const { chainId } = await ethers.provider.getNetwork();
  exportFrontendFiles(Number(chainId), { CookToken: tokenAddress, CookoffFactory: factoryAddress }, tokenReceipt.blockNumber);

  if (network.name === "sepolia") {
    console.log(`\nEtherscan: https://sepolia.etherscan.io/address/${factoryAddress}`);
    console.log("Para verificar o código:");
    console.log(`  npx hardhat verify --network sepolia ${tokenAddress}`);
    console.log(`  npx hardhat verify --network sepolia ${factoryAddress} ${tokenAddress}`);
  }
}

function exportFrontendFiles(chainId, contracts, blockNumber) {
  fs.mkdirSync(FRONTEND_CONTRACTS_DIR, { recursive: true });

  for (const name of ["CookToken", "CookoffFactory", "Challenge"]) {
    const { abi } = hre.artifacts.readArtifactSync(name);
    fs.writeFileSync(path.join(FRONTEND_CONTRACTS_DIR, `${name}.json`), JSON.stringify({ abi }, null, 2) + "\n");
  }

  const addressesFile = path.join(FRONTEND_CONTRACTS_DIR, "addresses.json");
  const addresses = fs.existsSync(addressesFile) ? JSON.parse(fs.readFileSync(addressesFile, "utf8")) : {};
  addresses[String(chainId)] = { ...contracts, deployBlock: blockNumber };
  fs.writeFileSync(addressesFile, JSON.stringify(addresses, null, 2) + "\n");

  console.log("ABIs e endereço exportados para", path.relative(process.cwd(), FRONTEND_CONTRACTS_DIR));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
