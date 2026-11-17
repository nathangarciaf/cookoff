/** Estado de um desafio do ponto de vista da interface. */
export function challengeStatus(summary, now) {
  if (summary.finalized) return { key: "closed", label: "Encerrado" };
  if (now >= summary.deadline) return { key: "expired", label: "Aguardando finalização" };
  return { key: "open", label: "Aberto" };
}

export function formatRemaining(seconds) {
  if (seconds <= 0) return "prazo encerrado";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (d > 0) return `${d}d ${h}h ${m}min`;
  if (h > 0) return `${h}h ${m}min`;
  if (m > 0) return `${m}min ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

export function formatDate(ts) {
  return new Date(ts * 1000).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function timeAgo(ms) {
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 10) return "agora";
  if (s < 60) return `há ${s}s`;
  if (s < 3600) return `há ${Math.floor(s / 60)}min`;
  return `há ${Math.floor(s / 3600)}h`;
}
