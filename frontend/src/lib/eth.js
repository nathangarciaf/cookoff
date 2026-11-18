import { ethers } from "ethers";
import {
  CHALLENGE_ABI,
  FACTORY_ABI,
  FACTORY_ADDRESS,
  TARGET_CHAIN,
  TARGET_CHAIN_ID,
  TOKEN_ABI,
  TOKEN_ADDRESS,
} from "../config";

// --------------------------------------------------------------------------
// Providers e contratos
// --------------------------------------------------------------------------

let readProvider;

/**
 * Provider de leitura: consulta o estado dos contratos e captura eventos
 * (via polling de eth_getLogs) mesmo sem carteira conectada.
 */
export function getReadProvider() {
  if (!readProvider) {
    readProvider = new ethers.JsonRpcProvider(TARGET_CHAIN.rpcUrl, TARGET_CHAIN_ID, {
      staticNetwork: true,
      polling: true,
      pollingInterval: 4000,
    });
  }
  return readProvider;
}

export function getFactory(runner = getReadProvider()) {
  return new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, runner);
}

export function getChallenge(address, runner = getReadProvider()) {
  return new ethers.Contract(address, CHALLENGE_ABI, runner);
}

export function getToken(runner = getReadProvider()) {
  return new ethers.Contract(TOKEN_ADDRESS, TOKEN_ABI, runner);
}

export async function getSigner() {
  // cacheTimeout -1: o ethers reaproveita por 250 ms respostas de chamadas
  // idênticas (ex.: a simulação que falhou antes de um approve). Na escrita
  // queremos sempre o estado atual da cadeia.
  const provider = new ethers.BrowserProvider(window.ethereum, undefined, { cacheTimeout: -1 });
  return provider.getSigner();
}

export const factoryInterface = new ethers.Interface(FACTORY_ABI);
export const challengeInterface = new ethers.Interface(CHALLENGE_ABI);
export const tokenInterface = new ethers.Interface(TOKEN_ABI);

// --------------------------------------------------------------------------
// Conversões
// --------------------------------------------------------------------------

/** Converte o struct Challenge.Summary (Result do ethers) em objeto JS simples. */
export function toSummary(s) {
  return {
    id: Number(s.id),
    address: s.challenge,
    creator: s.creator,
    name: s.name,
    reward: s.reward,
    createdAt: Number(s.createdAt),
    deadline: Number(s.deadline),
    finalized: s.finalized,
    closedEarly: s.closedEarly,
    hasWinner: s.hasWinner,
    winner: s.winner,
    winningRecipeId: Number(s.winningRecipeId),
    recipeCount: Number(s.recipeCount),
    totalVotes: Number(s.totalVotes),
  };
}

export function toRecipe(r) {
  return {
    id: Number(r.id),
    author: r.author,
    name: r.name,
    votes: Number(r.votes),
    submittedAt: Number(r.submittedAt),
  };
}

// --------------------------------------------------------------------------
// Formatação
// --------------------------------------------------------------------------

export const sameAddress = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

export function shortAddress(addr) {
  if (!addr) return "";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function formatEth(wei, digits = 4) {
  const value = Number(ethers.formatEther(wei ?? 0n));
  return value.toLocaleString("pt-BR", { maximumFractionDigits: digits });
}

/** COOK também tem 18 casas decimais; mostramos no máximo 2. */
export function formatCook(units, digits = 2) {
  return formatEth(units, digits);
}

export function explorerUrl(kind, value) {
  if (!TARGET_CHAIN.explorer) return null;
  return `${TARGET_CHAIN.explorer}/${kind}/${value}`;
}

const CHEFS = ["🍅", "🥑", "🧀", "🥐", "🌶️", "🍋", "🥕", "🍄", "🧄", "🍆", "🥦", "🍓", "🥥", "🍯", "🫐", "🥨"];

/** Avatar determinístico a partir do endereço. */
export function chefEmoji(addr) {
  if (!addr) return "👩‍🍳";
  return CHEFS[parseInt(addr.slice(-2), 16) % CHEFS.length];
}

export function chefHue(addr) {
  if (!addr) return 20;
  return parseInt(addr.slice(2, 6), 16) % 360;
}

// --------------------------------------------------------------------------
// Erros
// --------------------------------------------------------------------------

export function isUserRejection(err) {
  return err?.code === "ACTION_REJECTED" || err?.code === 4001 || err?.info?.error?.code === 4001;
}

/** Extrai uma mensagem legível (de preferência a string do require) de um erro do ethers. */
export function parseError(err) {
  if (!err) return "Erro desconhecido";
  if (err.reason) return err.reason;
  if (err.revert?.args?.[0]) return String(err.revert.args[0]);

  const nested = [err.info?.error?.message, err.error?.message, err.data?.message, err.message]
    .filter(Boolean)
    .join(" ");
  const match = nested.match(/reverted with reason string '([^']+)'/) || nested.match(/execution reverted: ([^"]+)/);
  if (match) return match[1];

  if (err.code === "INSUFFICIENT_FUNDS") return "Saldo insuficiente para pagar a transação.";
  if (err.code === "NETWORK_ERROR") return "Falha de rede. Verifique sua conexão.";
  return err.shortMessage || err.message || "Erro desconhecido";
}
