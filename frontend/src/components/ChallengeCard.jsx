import { formatEth } from "../lib/eth";
import { challengeStatus, formatRemaining } from "../lib/status";
import { Chef } from "./Chef";

export function ChallengeCard({ summary: s, now }) {
  const status = challengeStatus(s, now);
  return (
    <a className={`card challenge-card status-${status.key}`} href={`#/desafio/${s.address}`}>
      <div className="challenge-card-top">
        <span className={`badge badge-${status.key}`}>{status.label}</span>
        <span className="reward">
          {formatEth(s.reward)} <small>ETH</small>
        </span>
      </div>
      <h3 className="challenge-title">{s.name}</h3>
      <div className="challenge-meta">
        <Chef address={s.creator} size="sm" />
      </div>
      <div className="challenge-foot">
        <span>🍽️ {s.recipeCount} {s.recipeCount === 1 ? "receita" : "receitas"}</span>
        <span>👍 {s.totalVotes} {s.totalVotes === 1 ? "voto" : "votos"}</span>
        <span className="grow" />
        {status.key === "open" && <span className="countdown">⏱ {formatRemaining(s.deadline - now)}</span>}
        {status.key === "closed" && (s.hasWinner ? <span>🏆 premiado</span> : <span>sem vencedor</span>)}
      </div>
    </a>
  );
}
