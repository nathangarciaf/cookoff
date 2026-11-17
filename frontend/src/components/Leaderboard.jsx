import { useMemo } from "react";
import { useCookoff } from "../context";
import { formatEth } from "../lib/eth";
import { Chef } from "./Chef";

const MEDALS = ["🥇", "🥈", "🥉"];

export function Leaderboard() {
  const { summaries } = useCookoff();

  const ranking = useMemo(() => {
    const byChef = new Map();
    for (const s of summaries) {
      if (!s.hasWinner) continue;
      const key = s.winner.toLowerCase();
      const entry = byChef.get(key) ?? { address: s.winner, wins: 0, earned: 0n };
      entry.wins += 1;
      entry.earned += s.reward;
      byChef.set(key, entry);
    }
    return [...byChef.values()].sort((a, b) => b.wins - a.wins || (b.earned > a.earned ? 1 : -1)).slice(0, 8);
  }, [summaries]);

  return (
    <section className="card side-card">
      <h3>Ranking de chefs</h3>
      {ranking.length === 0 ? (
        <p className="muted small">Nenhum desafio premiado ainda.</p>
      ) : (
        <ol className="leaderboard">
          {ranking.map((r, i) => (
            <li key={r.address}>
              <span className="rank">{MEDALS[i] ?? i + 1}</span>
              <Chef address={r.address} size="sm" />
              <span className="grow" />
              <span className="lb-stat">
                <b>{r.wins}</b> {r.wins === 1 ? "vitória" : "vitórias"}
                <small>{formatEth(r.earned)} ETH</small>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
