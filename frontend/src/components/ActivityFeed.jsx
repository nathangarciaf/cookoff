import { useEffect, useState } from "react";
import { useCookoff } from "../context";
import { formatCook, formatEth, shortAddress } from "../lib/eth";
import { timeAgo } from "../lib/status";

const ZERO = "0x0000000000000000000000000000000000000000";

function describe(ev) {
  switch (ev.type) {
    case "ChallengeCreated":
      return { icon: "🆕", text: <>Novo desafio <b>{ev.name}</b> valendo {formatCook(ev.reward)} COOK</> };
    case "RecipeSubmitted":
      return { icon: "🍽️", text: <><b>{ev.name}</b> entrou em {ev.challengeName}</> };
    case "VoteCast":
      return { icon: "👍", text: <>{shortAddress(ev.voter)} votou em {ev.challengeName} ({ev.votes} votos)</> };
    case "ChallengeFinalized":
      return {
        icon: "🏁",
        text:
          ev.winner && ev.winner !== ZERO ? (
            <>{ev.challengeName} encerrado — {shortAddress(ev.winner)} levou {formatCook(ev.reward)} COOK</>
          ) : (
            <>{ev.challengeName} encerrado sem votos</>
          ),
      };
    case "WelcomeBonusClaimed":
      return { icon: "🎁", text: <>{shortAddress(ev.user)} entrou e ganhou {formatCook(ev.amount)} COOK</> };
    case "TokensPurchased":
      return {
        icon: "🪙",
        text: <>{shortAddress(ev.buyer)} comprou {formatCook(ev.amount)} COOK por {formatEth(ev.ethPaid)} ETH</>,
      };
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
                <a href={ev.challenge ? `#/desafio/${ev.challenge}` : "#/"} className="feed-text">
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
