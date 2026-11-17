require("@nomicfoundation/hardhat-toolbox");
const { vars } = require("hardhat/config");

// Variáveis de configuração (nunca coloque chaves no código!):
//   npx hardhat vars set INFURA_API_KEY
//   npx hardhat vars set SEPOLIA_PRIVATE_KEY
//   npx hardhat vars set ETHERSCAN_API_KEY   (opcional, para verificar o contrato)
const INFURA_API_KEY = vars.get("INFURA_API_KEY", "");
const SEPOLIA_PRIVATE_KEY = vars.get("SEPOLIA_PRIVATE_KEY", "");
const ETHERSCAN_API_KEY = vars.get("ETHERSCAN_API_KEY", "");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.28",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    sepolia: {
      url: `https://sepolia.infura.io/v3/${INFURA_API_KEY}`,
      accounts: SEPOLIA_PRIVATE_KEY ? [SEPOLIA_PRIVATE_KEY] : [],
    },
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY,
  },
};
