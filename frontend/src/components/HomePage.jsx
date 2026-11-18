import { useMemo, useState } from "react";
import { useCookoff } from "../context";
import { formatCook, sameAddress } from "../lib/eth";
import { useNow } from "../lib/hooks";
import { challengeStatus } from "../lib/status";
import { CreateChallenge } from "./CreateChallenge";
import { ChallengeCard } from "./ChallengeCard";
import { Leaderboard } from "./Leaderboard";
import { ActivityFeed } from "./ActivityFeed";
import { CookWallet } from "./CookWallet";

const FILTERS = [
  { key: "open", label: "Abertos" },
  { key: "all", label: "Todos" },
  { key: "closed", label: "Encerrados" },
  { key: "mine", label: "Meus" },
];

export function HomePage() {
  const { summaries, loading, loadError, wallet } = useCookoff();
  const now = useNow();
  const [filter, setFilter] = useState("open");

  const stats = useMemo(() => {
    const open = summaries.filter((s) => challengeStatus(s, now).key === "open");
    const inPlay = summaries.filter((s) => !s.finalized).reduce((acc, s) => acc + s.reward, 0n);
    const paid = summaries.filter((s) => s.hasWinner).reduce((acc, s) => acc + s.reward, 0n);
    const recipes = summaries.reduce((acc, s) => acc + s.recipeCount, 0);
    return { total: summaries.length, open: open.length, inPlay, paid, recipes };
  }, [summaries, now]);

  const visible = useMemo(() => {
    const list = summaries.filter((s) => {
      const st = challengeStatus(s, now).key;
      if (filter === "open") return st !== "closed";
      if (filter === "closed") return st === "closed";
      if (filter === "mine") return sameAddress(s.creator, wallet.account);
      return true;
    });
    // abertos primeiro (prazo mais próximo), depois os mais recentes
    return list.sort((a, b) => {
      const sa = a.finalized ? 1 : 0;
      const sb = b.finalized ? 1 : 0;
      if (sa !== sb) return sa - sb;
      if (!a.finalized) return a.deadline - b.deadline;
      return b.id - a.id;
    });
  }, [summaries, filter, now, wallet.account]);

  return (
    <>
      <section className="hero">
        <div>
          <p className="eyebrow">Desafios culinários on-chain</p>
          <h1>
            Proponha um desafio.
            <br />
            <em>Que vença a melhor receita.</em>
          </h1>
          <p className="hero-sub">
            Crie um desafio com uma recompensa em COOK, o token do COOKOFF. A comunidade envia receitas temáticas e
            vota; quando o prazo acaba, o contrato paga automaticamente quem tiver mais votos.
          </p>
        </div>
        <div className="stats">
          <Stat value={stats.open} label="desafios abertos" />
          <Stat value={`${formatCook(stats.inPlay, 0)} 🪙`} label="COOK em recompensas no jogo" />
          <Stat value={stats.recipes} label="receitas enviadas" />
          <Stat value={`${formatCook(stats.paid, 0)} 🪙`} label="COOK já pagos aos chefs" />
        </div>
      </section>

      <div className="layout">
        <div className="main-col">
          <CreateChallenge />

          <div className="section-head">
            <h2>Desafios</h2>
            <div className="tabs" role="tablist">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  role="tab"
                  aria-selected={filter === f.key}
                  className={`tab ${filter === f.key ? "active" : ""}`}
                  onClick={() => setFilter(f.key)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {loadError && <div className="alert alert-error">Erro ao ler os contratos: {loadError}</div>}

          {loading ? (
            <div className="grid">
              {[0, 1, 2].map((i) => (
                <div key={i} className="card skeleton" />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <div className="card empty-state">
              <div className="empty-emoji">🥄</div>
              <p>
                {filter === "mine"
                  ? wallet.account
                    ? "Você ainda não criou nenhum desafio."
                    : "Conecte sua carteira para ver seus desafios."
                  : "Nenhum desafio por aqui ainda. Que tal criar o primeiro?"}
              </p>
            </div>
          ) : (
            <div className="grid">
              {visible.map((s) => (
                <ChallengeCard key={s.address} summary={s} now={now} />
              ))}
            </div>
          )}
        </div>

        <aside className="side-col">
          <CookWallet />
          <Leaderboard />
          <ActivityFeed />
        </aside>
      </div>
    </>
  );
}

function Stat({ value, label }) {
  return (
    <div className="stat">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
