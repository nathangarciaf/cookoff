import { useEffect, useState } from "react";

const PIECES = ["🏆", "🎉", "🍰", "🥇", "✨", "🍕", "🧁", "🎊"];

/** Chuva de emojis disparada quando o usuário conectado vence um desafio. */
export function Confetti({ trigger }) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (!trigger) return;
    setItems(
      Array.from({ length: 36 }, (_, i) => ({
        id: `${trigger}-${i}`,
        emoji: PIECES[i % PIECES.length],
        left: Math.random() * 100,
        delay: Math.random() * 0.8,
        duration: 2.4 + Math.random() * 1.6,
        size: 18 + Math.random() * 18,
      }))
    );
    const t = setTimeout(() => setItems([]), 5000);
    return () => clearTimeout(t);
  }, [trigger]);

  if (!items.length) return null;
  return (
    <div className="confetti" aria-hidden="true">
      {items.map((p) => (
        <span
          key={p.id}
          style={{
            left: `${p.left}%`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            fontSize: `${p.size}px`,
          }}
        >
          {p.emoji}
        </span>
      ))}
    </div>
  );
}
