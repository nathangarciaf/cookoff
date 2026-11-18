import addresses from "./contracts/addresses.json";
import FactoryArtifact from "./contracts/CookoffFactory.json";
import ChallengeArtifact from "./contracts/Challenge.json";
import TokenArtifact from "./contracts/CookToken.json";

export const CHAINS = {
  31337: {
    id: 31337,
    name: "Hardhat Local",
    rpcUrl: "http://127.0.0.1:8545",
    explorer: null,
    currency: "ETH",
  },
  11155111: {
    id: 11155111,
    name: "Sepolia",
    rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
    explorer: "https://sepolia.etherscan.io",
    currency: "SepoliaETH",
  },
};

function pickChainId() {
  const fromEnv = Number(import.meta.env.VITE_CHAIN_ID || 0);
  if (CHAINS[fromEnv]) return fromEnv;
  return addresses["11155111"] ? 11155111 : 31337;
}

export const TARGET_CHAIN_ID = pickChainId();
export const TARGET_CHAIN = {
  ...CHAINS[TARGET_CHAIN_ID],
  rpcUrl: import.meta.env.VITE_RPC_URL || CHAINS[TARGET_CHAIN_ID].rpcUrl,
};

export const FACTORY_ADDRESS = addresses[String(TARGET_CHAIN_ID)]?.CookoffFactory ?? null;
export const TOKEN_ADDRESS = addresses[String(TARGET_CHAIN_ID)]?.CookToken ?? null;
export const FACTORY_ABI = FactoryArtifact.abi;
export const CHALLENGE_ABI = ChallengeArtifact.abi;
export const TOKEN_ABI = TokenArtifact.abi;

// Espelham as constantes do CookToken.sol
export const TOKEN_SYMBOL = "COOK";
export const WELCOME_BONUS = 100;
export const TOKENS_PER_ETH = 1_000_000;

export const MAX_VOTES_PER_USER = 2;
export const MIN_DURATION_SECONDS = 60;
export const MAX_DURATION_SECONDS = 30 * 24 * 60 * 60;
export const NAME_MIN = 8;
export const NAME_MAX = 80;
export const RECIPE_NAME_MAX = 120;
