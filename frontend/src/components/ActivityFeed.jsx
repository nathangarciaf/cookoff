import { useEffect, useState } from "react";
import { useCookoff } from "../context";
import { formatEth, shortAddress } from "../lib/eth";
import { timeAgo } from "../lib/status";

const ZERO = "0x0000000000000000000000000000000000000000";

function describe(ev) {
  switch (ev.type) {
    case "ChallengeCreated":
      return { icon: "🆕", text: <>Novo desafio <b>{ev.name}</b> valendo {formatEth(ev.reward)} ETH</> };
    case "RecipeSubmitted":
      return { icon: "🍽️", text: <><b>{ev.name}</b> entrou em {ev.challengeName}</> };
    case "VoteCast":
      return { icon: "👍", text: <>{shortAddress(ev.voter)} votou em {ev.challengeName} ({ev.votes} votos)</> };
    case "ChallengeFinalized":
      return {
        icon: "🏁",
        text:
          ev.winner && ev.winner !== ZERO ? (
            <>{ev.challengeName} encerrado — {shortAddress(ev.winner)} levou {formatEth(ev.reward)} ETH</>
          ) : (
            <>{ev.challengeName} encerrado sem votos</>
          ),
      };
    case "RewardPending":
      return { icon: "💰", text: <>Recompensa aguardando saque em {ev.challengeName}</> };
    default:
      return { icon: "•", text: ev.type };
  }
}

/** Lista ao vivo dos eventos capturados dos contratos. */
export function ActivityFeed() {
  const { feed } = useCookoff();
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((t) => t + 1), 15000);
    return () => clearInterval(id);
  }, []);

  return (
    <section className="card side-card">
      <h3>
        <span className="live-dot" /> Ao vivo
      </h3>
      {feed.length === 0 ? (
        <p className="muted small">Escutando eventos dos contratos… novas receitas, votos e desafios aparecem aqui.</p>
      ) : (
        <ul className="feed">
          {feed.map((ev) => {
            const { icon, text } = describe(ev);
            return (
              <li key={`${ev.txHash}-${ev.logIndex}`} className="feed-item">
                <span className="feed-icon">{icon}</span>
                <a href={`#/desafio/${ev.challenge}`} className="feed-text">
                  {text}
                  <small>{timeAgo(ev.receivedAt)}</small>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
