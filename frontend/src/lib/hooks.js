import { useCallback, useEffect, useState } from "react";
import { TARGET_CHAIN, TARGET_CHAIN_ID } from "../config";

const hasWallet = () => typeof window !== "undefined" && !!window.ethereum;

/** Estado da carteira injetada (MetaMask etc.): conta, rede e ações. */
export function useWallet() {
  const [account, setAccount] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    if (!hasWallet()) return;
    const eth = window.ethereum;

    eth.request({ method: "eth_accounts" }).then((a) => setAccount(a[0] ?? null)).catch(() => {});
    eth.request({ method: "eth_chainId" }).then((c) => setChainId(Number(c))).catch(() => {});

    const onAccounts = (accounts) => setAccount(accounts[0] ?? null);
    const onChain = (id) => setChainId(Number(id));
    eth.on?.("accountsChanged", onAccounts);
    eth.on?.("chainChanged", onChain);
    return () => {
      eth.removeListener?.("accountsChanged", onAccounts);
      eth.removeListener?.("chainChanged", onChain);
    };
  }, []);

  const switchNetwork = useCallback(async () => {
    const hexId = "0x" + TARGET_CHAIN_ID.toString(16);
    try {
      await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexId }] });
    } catch (err) {
      // 4902 = rede desconhecida pela carteira → adiciona
      if (err?.code === 4902 || err?.data?.originalError?.code === 4902) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: hexId,
              chainName: TARGET_CHAIN.name,
              rpcUrls: [TARGET_CHAIN.rpcUrl],
              nativeCurrency: { name: TARGET_CHAIN.currency, symbol: "ETH", decimals: 18 },
              blockExplorerUrls: TARGET_CHAIN.explorer ? [TARGET_CHAIN.explorer] : undefined,
            },
          ],
        });
      } else {
        throw err;
      }
    }
  }, []);

  const connect = useCallback(async () => {
    if (!hasWallet()) return;
    setConnecting(true);
    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      setAccount(accounts[0] ?? null);
      const current = Number(await window.ethereum.request({ method: "eth_chainId" }));
      setChainId(current);
      if (current !== TARGET_CHAIN_ID) await switchNetwork();
      return accounts[0] ?? null;
    } finally {
      setConnecting(false);
    }
  }, [switchNetwork]);

  return {
    hasWallet: hasWallet(),
    account,
    chainId,
    connecting,
    isCorrectChain: chainId === TARGET_CHAIN_ID,
    connect,
    switchNetwork,
  };
}

/** Relógio compartilhado (segundos Unix), atualizado a cada segundo. */
export function useNow() {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** Roteamento mínimo por hash (#/ e #/desafio/0x...), ideal para hospedagem estática. */
export function useHashRoute() {
  const parse = () => {
    const hash = window.location.hash.replace(/^#/, "") || "/";
    const match = hash.match(/^\/desafio\/(0x[0-9a-fA-F]{40})/);
    return match ? { page: "challenge", address: match[1] } : { page: "home" };
  };
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const onChange = () => {
      setRoute(parse());
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

export const goTo = (path) => {
  window.location.hash = path;
};
