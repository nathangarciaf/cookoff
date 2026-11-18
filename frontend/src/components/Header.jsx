import { TARGET_CHAIN } from "../config";
import { useCookoff } from "../context";
import { chefEmoji, chefHue, formatCook, shortAddress } from "../lib/eth";

export function Header() {
  const { wallet, login, balance } = useCookoff();

  return (
    <header className="header">
      <div className="header-inner">
        <a href="#/" className="brand">
          <span className="brand-mark">🍳</span>
          <span className="brand-name">COOKOFF</span>
        </a>

        <div className="header-actions">
          <span className={`net-pill ${wallet.account && !wallet.isCorrectChain ? "net-wrong" : ""}`}>
            <span className="dot" /> {TARGET_CHAIN.name}
          </span>

          {!wallet.hasWallet ? (
            <a className="btn btn-ghost" href="https://metamask.io/download/" target="_blank" rel="noreferrer">
              Instalar MetaMask
            </a>
          ) : !wallet.account ? (
            <button className="btn btn-primary" onClick={login} disabled={wallet.connecting}>
              {wallet.connecting ? "Conectando…" : "Entrar com carteira"}
            </button>
          ) : !wallet.isCorrectChain ? (
            <button className="btn btn-warn" onClick={() => wallet.switchNetwork().catch(() => {})}>
              Trocar para {TARGET_CHAIN.name}
            </button>
          ) : (
            <>
              <a className="cook-pill" href="#/" title="Seu saldo de COOK">
                🪙 <b>{balance.loaded ? formatCook(balance.cook) : "…"}</b> COOK
              </a>
              <span className="account-pill">
              <span className="avatar" style={{ "--hue": chefHue(wallet.account) }}>
                {chefEmoji(wallet.account)}
              </span>
              <span className="mono">{shortAddress(wallet.account)}</span>
              </span>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
