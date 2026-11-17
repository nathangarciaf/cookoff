import { useCookoff } from "../context";
import { chefEmoji, chefHue, explorerUrl, sameAddress, shortAddress } from "../lib/eth";

/** Avatar + endereço curto de um participante. */
export function Chef({ address, size = "md", showYou = true }) {
  const { wallet } = useCookoff();
  const isMe = showYou && sameAddress(address, wallet.account);
  const url = explorerUrl("address", address);
  const label = (
    <>
      <span className="mono">{shortAddress(address)}</span>
      {isMe && <span className="you">você</span>}
    </>
  );
  return (
    <span className={`chef chef-${size}`}>
      <span className="avatar" style={{ "--hue": chefHue(address) }}>
        {chefEmoji(address)}
      </span>
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
          {label}
        </a>
      ) : (
        <span>{label}</span>
      )}
    </span>
  );
}
