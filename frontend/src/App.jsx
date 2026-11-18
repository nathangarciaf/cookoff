import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CookoffContext } from "./context";
import { FACTORY_ADDRESS, TARGET_CHAIN, TARGET_CHAIN_ID, TOKEN_ADDRESS, WELCOME_BONUS } from "./config";
import {
  formatCook,
  getFactory,
  getReadProvider,
  getSigner,
  getToken,
  isUserRejection,
  parseError,
  sameAddress,
  shortAddress,
  toSummary,
} from "./lib/eth";
import { subscribeCookoffEvents } from "./lib/events";
import { useHashRoute, useWallet } from "./lib/hooks";
import { Header } from "./components/Header";
import { HomePage } from "./components/HomePage";
import { ChallengePage } from "./components/ChallengePage";
import { Toasts, useToasts } from "./components/Toasts";
import { Confetti } from "./components/Confetti";
import { TxBanner } from "./components/TxBanner";

const READY = !!FACTORY_ADDRESS && !!TOKEN_ADDRESS;
const EMPTY_BALANCE = { cook: 0n, eth: 0n, claimed: false, loaded: false };

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
  const [balance, setBalance] = useState(EMPTY_BALANCE);
  const accountRef = useRef(wallet.account);
  accountRef.current = wallet.account;

  // ------------------------------------------------------------------
  // Leitura do estado (factory.getAllSummaries chama cada Challenge)
  // ------------------------------------------------------------------
  const refresh = useCallback(async () => {
    if (!READY) return;
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

  // ------------------------------------------------------------------
  // Saldo da carteira conectada (COOK, ETH e se já resgatou o bônus)
  // ------------------------------------------------------------------
  const refreshBalance = useCallback(async () => {
    const account = accountRef.current;
    if (!READY || !account) return setBalance(EMPTY_BALANCE);
    try {
      const token = getToken();
      const [cook, eth, claimed] = await Promise.all([
        token.balanceOf(account),
        getReadProvider().getBalance(account),
        token.hasClaimedBonus(account),
      ]);
      if (sameAddress(account, accountRef.current)) setBalance({ cook, eth, claimed, loaded: true });
    } catch (err) {
      console.error(err);
    }
  }, []);

  // Recarrega quando a conta muda e escuta Transfer do COOK envolvendo a conta
  // (bônus, compra, depósito em desafio, prêmio recebido...)
  useEffect(() => {
    setBalance(EMPTY_BALANCE);
    refreshBalance();
    if (!READY || !wallet.account) return;
    const token = getToken();
    const incoming = token.filters.Transfer(null, wallet.account);
    const outgoing = token.filters.Transfer(wallet.account, null);
    // O polling pode entregar o mesmo log mais de uma vez quando vários blocos
    // saem entre duas consultas: agrupamos as notificações numa só releitura.
    let timer;
    const onTransfer = () => {
      clearTimeout(timer);
      timer = setTimeout(refreshBalance, 300);
    };
    token.on(incoming, onTransfer);
    token.on(outgoing, onTransfer);
    return () => {
      clearTimeout(timer);
      token.off(incoming, onTransfer);
      token.off(outgoing, onTransfer);
    };
  }, [wallet.account, refreshBalance]);

  const refreshTimer = useRef();
  const refreshSoon = useCallback(() => {
    clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(refresh, 300);
  }, [refresh]);

  // ------------------------------------------------------------------
  // Captura de eventos → feed ao vivo, toasts, celebração e refresh
  // ------------------------------------------------------------------
  const listeners = useRef(new Set());
  const summariesRef = useRef(summaries);
  summariesRef.current = summaries;

  const onEvent = useCallback((listener) => {
    listeners.current.add(listener);
    return () => listeners.current.delete(listener);
  }, []);

  useEffect(() => {
    if (!READY) return;
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
            toast(`🆕 Novo desafio: “${ev.name}” valendo ${formatCook(ev.reward)} COOK`, "info", () =>
              (window.location.hash = `/desafio/${ev.challenge}`)
            );
          }
          break;
        case "RecipeSubmitted":
          if (!sameAddress(ev.author, me)) toast(`🍽️ Nova receita em “${nameOf(ev.challenge)}”: ${ev.name}`, "info");
          break;
        case "ChallengeFinalized":
          if (sameAddress(ev.winner, me)) {
            toast(`🏆 Você venceu “${nameOf(ev.challenge)}” e recebeu ${formatCook(ev.reward)} COOK!`, "win");
            setCelebrate((c) => c + 1);
          } else if (ev.winner && ev.winner !== "0x0000000000000000000000000000000000000000") {
            toast(`🏁 “${nameOf(ev.challenge)}” encerrado — vitória de ${shortAddress(ev.winner)}`, "info");
          } else {
            toast(`🏁 “${nameOf(ev.challenge)}” encerrado sem votos`, "info");
          }
          break;
        case "WelcomeBonusClaimed":
        case "TokensPurchased":
          // só aparecem no feed; para a própria conta o runTx já avisa
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
        refreshBalance();
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
    [wallet, toast, refreshSoon, refreshBalance]
  );

  // ------------------------------------------------------------------
  // "Login": conecta a carteira e, no primeiro acesso, minta o bônus de
  // boas-vindas (claimWelcomeBonus) para o usuário já ter COOK.
  // ------------------------------------------------------------------
  const login = useCallback(async () => {
    try {
      const account = await wallet.connect();
      if (!account || !READY) return;
      const claimed = await getToken().hasClaimedBonus(account);
      if (!claimed) {
        toast(`🎁 Bem-vindo! Confirme na carteira para receber ${WELCOME_BONUS} COOK grátis.`, "info");
        await runTx(`Bônus de boas-vindas (${WELCOME_BONUS} COOK)`, (signer) => getToken(signer).claimWelcomeBonus());
      }
    } catch (err) {
      if (!isUserRejection(err)) toast(parseError(err), "error");
    }
  }, [wallet, runTx, toast]);

  const ctx = useMemo(
    () => ({
      wallet,
      login,
      balance,
      refreshBalance,
      summaries,
      loading,
      loadError,
      refresh,
      runTx,
      busy,
      onEvent,
      feed,
      toast,
    }),
    [wallet, login, balance, refreshBalance, summaries, loading, loadError, refresh, runTx, busy, onEvent, feed, toast]
  );

  return (
    <CookoffContext.Provider value={ctx}>
      <Header />
      <main className="shell">
        {!READY ? (
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
        CookToken e CookoffFactory ainda não foram implantados na rede <b>{TARGET_CHAIN.name}</b> (chainId{" "}
        {TARGET_CHAIN_ID}). Se você tinha um deploy antigo (sem token), implante de novo.
      </p>
      <pre className="code">
        {TARGET_CHAIN_ID === 31337
          ? "npx hardhat node\nnpm run deploy:local\nnpm run seed:local   # opcional"
          : "npm run deploy:sepolia"}
      </pre>
    </section>
  );
}
