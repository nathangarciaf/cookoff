import { explorerUrl, shortAddress } from "../lib/eth";

export function TxBanner({ busy }) {
  if (!busy) return null;
  const url = busy.hash ? explorerUrl("tx", busy.hash) : null;
  return (
    <div className="tx-banner" role="status">
      <span className="spinner" />
      <div>
        <b>{busy.label}</b>
        <div className="muted small">
          {busy.hash ? (
            <>
              Aguardando confirmação…{" "}
              {url ? (
                <a href={url} target="_blank" rel="noreferrer">
                  {shortAddress(busy.hash)}
                </a>
              ) : (
                <span className="mono">{shortAddress(busy.hash)}</span>
              )}
            </>
          ) : (
            "Confirme na sua carteira…"
          )}
        </div>
      </div>
    </div>
  );
}
