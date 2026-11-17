import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CookoffContext } from "./context";
import { FACTORY_ADDRESS, TARGET_CHAIN, TARGET_CHAIN_ID } from "./config";
import { formatEth, getFactory, getSigner, isUserRejection, parseError, sameAddress, shortAddress, toSummary } from "./lib/eth";
import { subscribeCookoffEvents } from "./lib/events";
import { useHashRoute, useWallet } from "./lib/hooks";
import { Header } from "./components/Header";
import { HomePage } from "./components/HomePage";
import { ChallengePage } from "./components/ChallengePage";
import { Toasts, useToasts } from "./components/Toasts";
import { Confetti } from "./components/Confetti";
import { TxBanner } from "./components/TxBanner";

export default function App() {
  const wallet = useWallet();
  const route = useHashRoute();
  const { toasts, push: toast, dismiss } = useToasts();

  const [summaries, setSummaries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [feed, setFeed] = useState([]);
  const [busy, setBusy] = useState(null);
  const [celebrate, setCelebrate] = useState(0);

  // ------------------------------------------------------------------
  // Leitura do estado (factory.getAllSummaries chama cada Challenge)
  // ------------------------------------------------------------------
  const refresh = useCallback(async () => {
    if (!FACTORY_ADDRESS) return;
    try {
      const list = await getFactory().getAllSummaries();
      setSummaries(list.map(toSummary));
      setLoadError(null);
    } catch (err) {
      console.error(err);
      setLoadError(parseError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const refreshTimer = useRef();
  const refreshSoon = useCallback(() => {
    clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(refresh, 300);
  }, [refresh]);

  // ------------------------------------------------------------------
  // Captura de eventos → feed ao vivo, toasts, celebração e refresh
  // ------------------------------------------------------------------
  const listeners = useRef(new Set());
  const accountRef = useRef(wallet.account);
  const summariesRef = useRef(summaries);
  accountRef.current = wallet.account;
  summariesRef.current = summaries;

  const onEvent = useCallback((listener) => {
    listeners.current.add(listener);
    return () => listeners.current.delete(listener);
  }, []);

  useEffect(() => {
    if (!FACTORY_ADDRESS) return;
    const nameOf = (addr) => summariesRef.current.find((s) => sameAddress(s.address, addr))?.name ?? "um desafio";

    return subscribeCookoffEvents((ev) => {
      const me = accountRef.current;
      const item = { ...ev, challengeName: ev.type === "ChallengeCreated" ? ev.name : nameOf(ev.challenge) };
      // ordena pela posição na blockchain (bloco, índice do log), mais recente primeiro
      setFeed((f) =>
        [item, ...f].sort((a, b) => b.blockNumber - a.blockNumber || b.logIndex - a.logIndex).slice(0, 50)
      );
      listeners.current.forEach((l) => l(ev));
      refreshSoon();

      switch (ev.type) {
        case "ChallengeCreated":
          if (!sameAddress(ev.creator, me)) {
            toast(`🆕 Novo desafio: “${ev.name}” valendo ${formatEth(ev.reward)} ETH`, "info", () =>
              (window.location.hash = `/desafio/${ev.challenge}`)
            );
          }
          break;
        case "RecipeSubmitted":
          if (!sameAddress(ev.author, me)) toast(`🍽️ Nova receita em “${nameOf(ev.challenge)}”: ${ev.name}`, "info");
          break;
        case "ChallengeFinalized":
          if (sameAddress(ev.winner, me)) {
            toast(`🏆 Você venceu “${nameOf(ev.challenge)}” e recebeu ${formatEth(ev.reward)} ETH!`, "win");
            setCelebrate((c) => c + 1);
          } else if (ev.winner && ev.winner !== "0x0000000000000000000000000000000000000000") {
            toast(`🏁 “${nameOf(ev.challenge)}” encerrado — vitória de ${shortAddress(ev.winner)}`, "info");
          } else {
            toast(`🏁 “${nameOf(ev.challenge)}” encerrado sem votos`, "info");
          }
          break;
        case "RewardPending":
          if (sameAddress(ev.to, me)) toast("💰 Você tem uma recompensa aguardando saque.", "win");
          break;
        default:
      }
    });
  }, [refreshSoon, toast]);

  // ------------------------------------------------------------------
  // Envio de transações
  // ------------------------------------------------------------------
  const runTx = useCallback(
    async (label, send) => {
      if (!wallet.hasWallet) {
        toast("Instale uma carteira (ex.: MetaMask) para participar.", "error");
        return null;
      }
      try {
        if (!wallet.account) await wallet.connect();
        else if (!wallet.isCorrectChain) await wallet.switchNetwork();

        const signer = await getSigner();
        const { chainId } = await signer.provider.getNetwork();
        if (Number(chainId) !== TARGET_CHAIN_ID) {
          throw new Error(`Troque a carteira para a rede ${TARGET_CHAIN.name}.`);
        }

        setBusy({ label });
        const tx = await send(signer);
        setBusy({ label, hash: tx.hash });
        const receipt = await tx.wait();
        if (receipt.status !== 1) throw new Error("A transação falhou.");
        toast(`✅ ${label}: confirmado!`, "success");
        refreshSoon();
        return receipt;
      } catch (err) {
        if (!isUserRejection(err)) {
          console.error(err);
          toast(parseError(err), "error");
        }
        return null;
      } finally {
        setBusy(null);
      }
    },
    [wallet, toast, refreshSoon]
  );

  const ctx = useMemo(
    () => ({ wallet, summaries, loading, loadError, refresh, runTx, busy, onEvent, feed, toast }),
    [wallet, summaries, loading, loadError, refresh, runTx, busy, onEvent, feed, toast]
  );

  return (
    <CookoffContext.Provider value={ctx}>
      <Header />
      <main className="shell">
        {!FACTORY_ADDRESS ? (
          <NotDeployed />
        ) : route.page === "challenge" ? (
          <ChallengePage key={route.address} address={route.address} />
        ) : (
          <HomePage />
        )}
      </main>
      <footer className="footer">
        COOKOFF · contratos na rede {TARGET_CHAIN.name}
        {FACTORY_ADDRESS && (
          <>
            {" · "}
            <span className="mono">{shortAddress(FACTORY_ADDRESS)}</span>
          </>
        )}
      </footer>
      <TxBanner busy={busy} />
      <Toasts toasts={toasts} dismiss={dismiss} />
      <Confetti trigger={celebrate} />
    </CookoffContext.Provider>
  );
}

function NotDeployed() {
  return (
    <section className="card empty-state">
      <div className="empty-emoji">🧑‍🍳</div>
      <h2>A cozinha ainda não abriu</h2>
      <p>
        Nenhuma CookoffFactory implantada na rede <b>{TARGET_CHAIN.name}</b> (chainId {TARGET_CHAIN_ID}).
      </p>
      <pre className="code">
        {TARGET_CHAIN_ID === 31337
          ? "npx hardhat node\nnpm run deploy:local\nnpm run seed:local   # opcional"
          : "npm run deploy:sepolia"}
      </pre>
    </section>
  );
}
