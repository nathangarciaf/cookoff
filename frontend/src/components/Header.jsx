import { TARGET_CHAIN } from "../config";
import { useCookoff } from "../context";
import { chefEmoji, chefHue, shortAddress } from "../lib/eth";

export function Header() {
  const { wallet, toast } = useCookoff();

  const connect = async () => {
    try {
      await wallet.connect();
    } catch (err) {
      if (err?.code !== 4001) toast(err?.message || "Não foi possível conectar", "error");
    }
  };

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
            <button className="btn btn-primary" onClick={connect} disabled={wallet.connecting}>
              {wallet.connecting ? "Conectando…" : "Conectar carteira"}
            </button>
          ) : !wallet.isCorrectChain ? (
            <button className="btn btn-warn" onClick={() => wallet.switchNetwork().catch(() => {})}>
              Trocar para {TARGET_CHAIN.name}
            </button>
          ) : (
            <span className="account-pill">
              <span className="avatar" style={{ "--hue": chefHue(wallet.account) }}>
                {chefEmoji(wallet.account)}
              </span>
              <span className="mono">{shortAddress(wallet.account)}</span>
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
