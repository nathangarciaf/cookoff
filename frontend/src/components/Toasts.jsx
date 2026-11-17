import { useCallback, useRef, useState } from "react";

export function useToasts() {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const push = useCallback(
    (message, kind = "info", onClick) => {
      const id = nextId.current++;
      setToasts((t) => [...t.slice(-4), { id, message, kind, onClick }]);
      setTimeout(() => dismiss(id), kind === "error" ? 9000 : kind === "win" ? 10000 : 6000);
    },
    [dismiss]
  );

  return { toasts, push, dismiss };
}

export function Toasts({ toasts, dismiss }) {
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast toast-${t.kind} ${t.onClick ? "clickable" : ""}`}
          onClick={() => {
            t.onClick?.();
            dismiss(t.id);
          }}
        >
          <span>{t.message}</span>
          <button
            className="toast-close"
            aria-label="Fechar"
            onClick={(e) => {
              e.stopPropagation();
              dismiss(t.id);
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
