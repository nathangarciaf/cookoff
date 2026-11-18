import { useState } from "react";
import { ethers } from "ethers";
import { TOKENS_PER_ETH, WELCOME_BONUS } from "../config";
import { useCookoff } from "../context";
import { formatCook, formatEth, getToken } from "../lib/eth";

const PRESETS = ["0.001", "0.005", "0.01"];

/**
 * Carteira COOK: saldo, bônus de boas-vindas e compra de tokens com ETH.
 * Todo COOK é mintado pelo contrato CookToken na hora da transação.
 */
export function CookWallet() {
  const { wallet, login, balance, runTx, busy } = useCookoff();
  const [eth, setEth] = useState("0.001");

  let wei = null;
  try {
    wei = eth ? ethers.parseEther(eth) : null;
  } catch {
    wei = null;
  }
  const tokens = wei ? wei * BigInt(TOKENS_PER_ETH) : 0n;
  const validBuy = wei && wei > 0n;

  const claim = () =>
    runTx(`Bônus de boas-vindas (${WELCOME_BONUS} COOK)`, (signer) => getToken(signer).claimWelcomeBonus());

  const buy = (e) => {
    e.preventDefault();
    if (!validBuy) return;
    runTx(`Comprar ${formatCook(tokens)} COOK`, (signer) => getToken(signer).buyTokens({ value: wei }));
  };

  if (!wallet.account) {
    return (
      <section className="card side-card wallet-card">
        <h3>🪙 Carteira COOK</h3>
        <p className="muted small">
          As recompensas dos desafios são pagas em <b>COOK</b>, o token do COOKOFF. Entre com sua carteira e ganhe{" "}
          <b>{WELCOME_BONUS} COOK grátis</b> no primeiro acesso.
        </p>
        <button className="btn btn-primary btn-block" onClick={login} disabled={!wallet.hasWallet}>
          Entrar e ganhar {WELCOME_BONUS} COOK
        </button>
      </section>
    );
  }

  return (
    <section className="card side-card wallet-card">
      <h3>🪙 Carteira COOK</h3>
      <div className="wallet-balance">
        <span className="wallet-amount">{balance.loaded ? formatCook(balance.cook) : "…"}</span>
        <span className="muted">COOK</span>
      </div>
      <div className="muted small">{balance.loaded && `${formatEth(balance.eth)} ETH disponível para gas e compras`}</div>

      {balance.loaded && !balance.claimed && (
        <button className="btn btn-gold btn-block" onClick={claim} disabled={!!busy}>
          🎁 Resgatar {WELCOME_BONUS} COOK de boas-vindas
        </button>
      )}

      <form className="buy-form" onSubmit={buy}>
        <span className="field-label">Comprar COOK</span>
        <div className="chips">
          {PRESETS.map((p) => (
            <button type="button" key={p} className={`chip ${eth === p ? "chip-active" : ""}`} onClick={() => setEth(p)}>
              {p} ETH
            </button>
          ))}
        </div>
        <div className="input-group">
          <input type="number" min="0" step="0.001" value={eth} onChange={(e) => setEth(e.target.value)} />
          <span className="input-suffix">ETH</span>
        </div>
        <div className="buy-quote">
          = <b>{formatCook(tokens)}</b> COOK
        </div>
        <button className="btn btn-primary btn-block" type="submit" disabled={!validBuy || !!busy}>
          Comprar
        </button>
        <p className="muted small">Taxa fixa: 1 ETH = {TOKENS_PER_ETH.toLocaleString("pt-BR")} COOK.</p>
      </form>
    </section>
  );
}
