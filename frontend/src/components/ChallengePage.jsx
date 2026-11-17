import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FACTORY_ADDRESS, MAX_VOTES_PER_USER, RECIPE_NAME_MAX } from "../config";
import { useCookoff } from "../context";
import { explorerUrl, formatEth, getChallenge, getFactory, parseError, sameAddress, toRecipe, toSummary } from "../lib/eth";
import { useNow } from "../lib/hooks";
import { challengeStatus, formatDate, formatRemaining } from "../lib/status";
import { Chef } from "./Chef";

export function ChallengePage({ address }) {
  const { wallet, runTx, onEvent, busy } = useCookoff();
  const now = useNow();
  const account = wallet.account;

  const [summary, setSummary] = useState(null);
  const [recipes, setRecipes] = useState([]);
  const [mine, setMine] = useState({ used: 0, votedFor: new Set(), pending: 0n });
  const [error, setError] = useState(null);
  const [flash, setFlash] = useState({});
  const [recipeName, setRecipeName] = useState("");
  const loadSeq = useRef(0);

  // ------------------------------------------------------------------
  // Leitura do contrato Challenge
  // ------------------------------------------------------------------
  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    try {
      const factory = getFactory();
      const challenge = getChallenge(address);
      const isOurs = await factory.isChallenge(address);
      if (!isOurs) throw new Error("Este endereço não é um desafio criado pela CookoffFactory.");

      const [rawSummary, rawRecipes] = await Promise.all([challenge.getSummary(), challenge.getRecipes()]);
      const recs = rawRecipes.map(toRecipe);

      let personal = { used: 0, votedFor: new Set(), pending: 0n };
      if (account) {
        const [used, pending, ...voted] = await Promise.all([
          challenge.votesUsed(account),
          challenge.pendingWithdrawals(account),
          ...recs.map((r) => challenge.hasVotedFor(account, r.id)),
        ]);
        personal = {
          used: Number(used),
          pending,
          votedFor: new Set(recs.filter((_, i) => voted[i]).map((r) => r.id)),
        };
      }

      if (seq !== loadSeq.current) return;
      setSummary(toSummary(rawSummary));
      setRecipes(recs);
      setMine(personal);
      setError(null);
    } catch (err) {
      if (seq !== loadSeq.current) return;
      console.error(err);
      setError(err.message?.startsWith("Este endereço") ? err.message : parseError(err));
    }
  }, [address, account]);

  useEffect(() => {
    load();
  }, [load]);

  // ------------------------------------------------------------------
  // Reação aos eventos deste desafio: recarrega e destaca a receita
  // ------------------------------------------------------------------
  useEffect(
    () =>
      onEvent((ev) => {
        if (!sameAddress(ev.challenge, address)) return;
        load();
        if (ev.type === "VoteCast" || ev.type === "RecipeSubmitted") {
          const key = `${ev.recipeId}`;
          setFlash((f) => ({ ...f, [key]: ev.type }));
          setTimeout(() => setFlash((f) => {
            const next = { ...f };
            delete next[key];
            return next;
          }), 2200);
        }
      }),
    [onEvent, address, load]
  );

  const ranked = useMemo(
    () => [...recipes].sort((a, b) => b.votes - a.votes || a.id - b.id),
    [recipes]
  );

  if (error) {
    return (
      <section className="card empty-state">
        <div className="empty-emoji">🫕</div>
        <h2>Desafio não encontrado</h2>
        <p className="muted">{error}</p>
        <a className="btn btn-ghost" href="#/">Voltar aos desafios</a>
      </section>
    );
  }

  if (!summary) {
    return (
      <>
        <a className="back" href="#/">← Desafios</a>
        <div className="card skeleton tall" />
      </>
    );
  }

  const status = challengeStatus(summary, now);
  const isOpen = status.key === "open";
  const isCreator = sameAddress(summary.creator, account);
  const votesLeft = MAX_VOTES_PER_USER - mine.used;
  const maxVotes = Math.max(1, ...recipes.map((r) => r.votes));
  const winnerRecipe = summary.hasWinner ? recipes[summary.winningRecipeId] : null;
  const contractUrl = explorerUrl("address", address);

  // ------------------------------------------------------------------
  // Ações
  // ------------------------------------------------------------------
  const submitRecipe = async (e) => {
    e.preventDefault();
    const name = recipeName.trim();
    if (!name) return;
    const ok = await runTx("Enviar receita", (signer) => getChallenge(address, signer).submitRecipe(name));
    if (ok) setRecipeName("");
    load();
  };

  const vote = async (recipeId) => {
    await runTx("Votar", (signer) => getChallenge(address, signer).vote(recipeId));
    load();
  };

  const closeEarly = async () => {
    const msg = summary.totalVotes
      ? "Encerrar agora? A receita mais votada recebe a recompensa imediatamente."
      : "Encerrar agora? Sem votos, a recompensa volta para você.";
    if (!window.confirm(msg)) return;
    await runTx("Encerrar desafio", (signer) => getChallenge(address, signer).close());
    load();
  };

  // Finalização após o prazo é feita PELA FÁBRICA, que chama o contrato filho
  const finalize = async () => {
    await runTx("Finalizar desafio", (signer) => getFactory(signer).finalizeChallenge(summary.id));
    load();
  };

  const withdraw = async () => {
    await runTx("Sacar recompensa", (signer) => getChallenge(address, signer).withdraw());
    load();
  };

  return (
    <>
      <a className="back" href="#/">← Desafios</a>

      <section className={`card challenge-hero status-${status.key}`}>
        <div className="challenge-hero-main">
          <span className={`badge badge-${status.key}`}>
            {status.label}
            {summary.closedEarly && " antecipadamente"}
          </span>
          <h1>{summary.name}</h1>
          <div className="hero-meta">
            <span className="muted">Criado por</span> <Chef address={summary.creator} />
            <span className="muted">· {formatDate(summary.createdAt)}</span>
            {contractUrl && (
              <a className="muted small" href={contractUrl} target="_blank" rel="noreferrer">
                · ver contrato ↗
              </a>
            )}
          </div>
        </div>

        <div className="challenge-hero-side">
          <div className="prize">
            <span className="prize-label">Recompensa</span>
            <span className="prize-value">
              {formatEth(summary.reward)} <small>ETH</small>
            </span>
          </div>
          <div className="prize-time">
            {isOpen ? (
              <>
                <span className="countdown big">⏱ {formatRemaining(summary.deadline - now)}</span>
                <span className="muted small">encerra em {formatDate(summary.deadline)}</span>
              </>
            ) : (
              <span className="muted small">prazo: {formatDate(summary.deadline)}</span>
            )}
          </div>
        </div>
      </section>

      {/* Banner do resultado */}
      {summary.finalized && (
        <section className={`result ${summary.hasWinner ? "result-win" : "result-none"}`}>
          {summary.hasWinner ? (
            <>
              <div className="result-trophy">🏆</div>
              <div>
                <div className="eyebrow">Receita vencedora</div>
                <h2>{winnerRecipe?.name}</h2>
                <div>
                  <Chef address={summary.winner} /> levou <b>{formatEth(summary.reward)} ETH</b> com{" "}
                  {winnerRecipe?.votes} {winnerRecipe?.votes === 1 ? "voto" : "votos"}.
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="result-trophy">🍂</div>
              <div>
                <h2>Encerrado sem votos</h2>
                <div className="muted">A recompensa foi devolvida ao criador do desafio.</div>
              </div>
            </>
          )}
        </section>
      )}

      {/* Ações do criador / finalização / saque */}
      {(status.key === "expired" || (isCreator && !summary.finalized) || mine.pending > 0n) && (
        <section className="card actions-card">
          {status.key === "expired" && (
            <div className="action-row">
              <div>
                <b>O prazo terminou.</b>
                <div className="muted small">
                  Qualquer pessoa pode finalizar: a CookoffFactory chama o contrato do desafio e paga o vencedor.
                </div>
              </div>
              <button className="btn btn-primary" onClick={finalize} disabled={!!busy}>
                Finalizar e pagar
              </button>
            </div>
          )}
          {isCreator && isOpen && (
            <div className="action-row">
              <div>
                <b>Você é o criador deste desafio.</b>
                <div className="muted small">Pode encerrá-lo agora; a receita mais votada recebe a recompensa.</div>
              </div>
              <button className="btn btn-warn" onClick={closeEarly} disabled={!!busy}>
                Encerrar agora
              </button>
            </div>
          )}
          {mine.pending > 0n && (
            <div className="action-row">
              <div>
                <b>Você tem {formatEth(mine.pending)} ETH para sacar.</b>
                <div className="muted small">O envio automático falhou; saque manualmente.</div>
              </div>
              <button className="btn btn-primary" onClick={withdraw} disabled={!!busy}>
                Sacar
              </button>
            </div>
          )}
        </section>
      )}

      <div className="layout">
        <div className="main-col">
          {isOpen && (
            <form className="card recipe-form" onSubmit={submitRecipe}>
              <label className="field">
                <span className="field-label">Envie sua receita</span>
                <div className="input-group">
                  <input
                    value={recipeName}
                    onChange={(e) => setRecipeName(e.target.value)}
                    placeholder="Ex.: Torta de Mirtilo com Queijo de Cabra"
                    maxLength={RECIPE_NAME_MAX}
                  />
                  <button className="btn btn-primary" type="submit" disabled={!recipeName.trim() || !!busy}>
                    Enviar
                  </button>
                </div>
              </label>
            </form>
          )}

          <div className="section-head">
            <h2>
              Receitas <span className="count">{recipes.length}</span>
            </h2>
            {account && isOpen && (
              <div className="vote-meter" title="Cada pessoa tem 2 votos por desafio">
                <span className="muted small">Seus votos</span>
                {Array.from({ length: MAX_VOTES_PER_USER }, (_, i) => (
                  <span key={i} className={`pip ${i < votesLeft ? "full" : ""}`} />
                ))}
                <span className="small">
                  {votesLeft} {votesLeft === 1 ? "restante" : "restantes"}
                </span>
              </div>
            )}
          </div>

          {ranked.length === 0 ? (
            <div className="card empty-state">
              <div className="empty-emoji">🍳</div>
              <p>{isOpen ? "Nenhuma receita ainda. Seja o primeiro a cozinhar!" : "Nenhuma receita foi enviada."}</p>
            </div>
          ) : (
            <ol className="recipes">
              {ranked.map((r, index) => {
                const own = sameAddress(r.author, account);
                const voted = mine.votedFor.has(r.id);
                const isWinner = summary.hasWinner && summary.winningRecipeId === r.id;
                const leading = !summary.finalized && index === 0 && r.votes > 0;
                let label = "Votar";
                let disabled = !isOpen || !!busy;
                if (own) {
                  label = "Sua receita";
                  disabled = true;
                } else if (voted) {
                  label = "Votado ✓";
                  disabled = true;
                } else if (account && votesLeft <= 0) {
                  label = "Sem votos";
                  disabled = true;
                }
                return (
                  <li
                    key={r.id}
                    className={`recipe ${isWinner ? "winner" : ""} ${leading ? "leading" : ""} ${
                      flash[r.id] ? `flash-${flash[r.id]}` : ""
                    }`}
                  >
                    <span className="recipe-rank">{isWinner ? "🏆" : index + 1}</span>
                    <div className="recipe-body">
                      <div className="recipe-name">{r.name}</div>
                      <div className="recipe-meta">
                        <Chef address={r.author} size="sm" />
                        <span className="muted small">· {formatDate(r.submittedAt)}</span>
                      </div>
                      <div className="vote-bar">
                        <span style={{ width: `${(r.votes / maxVotes) * 100}%` }} />
                      </div>
                    </div>
                    <div className="recipe-votes">
                      <span className="votes-num">{r.votes}</span>
                      <span className="muted small">{r.votes === 1 ? "voto" : "votos"}</span>
                    </div>
                    {isOpen && (
                      <button
                        className={`btn btn-sm ${voted ? "btn-voted" : own ? "btn-ghost" : "btn-primary"}`}
                        onClick={() => vote(r.id)}
                        disabled={disabled}
                      >
                        {label}
                      </button>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        <aside className="side-col">
          <section className="card side-card rules">
            <h3>Regras</h3>
            <ul>
              <li>Qualquer pessoa pode enviar receitas, inclusive o criador.</li>
              <li>Cada carteira tem <b>2 votos</b> por desafio, em receitas diferentes.</li>
              <li>Não vale votar na própria receita.</li>
              <li>Vence a receita mais votada; no empate, a enviada primeiro.</li>
              <li>Sem votos, a recompensa volta ao criador.</li>
              <li>O criador pode encerrar a qualquer momento.</li>
            </ul>
          </section>
          <section className="card side-card">
            <h3>Contratos</h3>
            <dl className="kv">
              <dt>Desafio #{summary.id}</dt>
              <dd className="mono small">{address}</dd>
              <dt>Fábrica</dt>
              <dd className="mono small">{FACTORY_ADDRESS}</dd>
            </dl>
          </section>
        </aside>
      </div>
    </>
  );
}
