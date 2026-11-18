import { useState } from "react";
import { ethers } from "ethers";
import { FACTORY_ADDRESS, MAX_DURATION_SECONDS, MIN_DURATION_SECONDS, NAME_MAX, NAME_MIN } from "../config";
import { useCookoff } from "../context";
import { factoryInterface, formatCook, getFactory, getToken, isUserRejection, parseError } from "../lib/eth";
import { goTo } from "../lib/hooks";

const UNITS = { min: 60, h: 3600, d: 86400 };
const IDEAS = [
  "Desafio de Tortas Inusitadas",
  "Desafio do Prato com 5 Ingredientes",
  "Desafio de Comida de Boteco Gourmet",
  "Desafio das Sobremesas Sem Forno",
];

export function CreateChallenge() {
  const { runTx, wallet, balance, toast } = useCookoff();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("3");
  const [unit, setUnit] = useState("d");
  const [reward, setReward] = useState("50");
  const [step, setStep] = useState(null);
  const [touched, setTouched] = useState(false);

  const trimmed = name.trim();
  const duration = Math.round(Number(amount) * UNITS[unit]);

  let rewardWei = null;
  try {
    rewardWei = reward ? ethers.parseEther(reward) : null;
  } catch {
    rewardWei = null;
  }

  const errors = {
    name: !trimmed
      ? "Dê um nome ao desafio."
      : !/desafio/i.test(trimmed)
        ? "O nome precisa conter a palavra “Desafio”."
        : new TextEncoder().encode(trimmed).length < NAME_MIN
          ? "Nome muito curto."
          : new TextEncoder().encode(trimmed).length > NAME_MAX
            ? `Máximo de ${NAME_MAX} bytes.`
            : null,
    duration:
      !Number.isFinite(duration) || duration < MIN_DURATION_SECONDS
        ? "Duração mínima: 1 minuto."
        : duration > MAX_DURATION_SECONDS
          ? "Duração máxima: 30 dias."
          : null,
    reward:
      !rewardWei || rewardWei <= 0n
        ? "Informe uma recompensa maior que zero."
        : balance.loaded && rewardWei > balance.cook
          ? `Você tem só ${formatCook(balance.cook)} COOK. Compre mais na Carteira COOK.`
          : null,
  };
  const valid = !errors.name && !errors.duration && !errors.reward;

  const submit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (!valid) return;

    let account = wallet.account;
    try {
      account = account ?? (await wallet.connect());
    } catch (err) {
      if (!isUserRejection(err)) toast(parseError(err), "error");
      return;
    }
    if (!account) return;

    // ERC-20: a fábrica só pode puxar os COOK da sua carteira se você autorizar
    // antes (approve). Se a autorização atual já cobre o valor, pulamos essa etapa.
    const allowance = await getToken().allowance(account, FACTORY_ADDRESS);
    if (allowance < rewardWei) {
      setStep(1);
      const approved = await runTx(`Autorizar ${formatCook(rewardWei)} COOK (1/2)`, (signer) =>
        getToken(signer).approve(FACTORY_ADDRESS, rewardWei)
      );
      if (!approved) return setStep(null);
    }

    setStep(2);
    const receipt = await runTx(allowance < rewardWei ? "Criar desafio (2/2)" : "Criar desafio", (signer) =>
      getFactory(signer).createChallenge(trimmed, duration, rewardWei)
    );
    setStep(null);
    if (!receipt) return;
    const created = receipt.logs
      .map((log) => {
        try {
          return factoryInterface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((ev) => ev?.name === "ChallengeCreated");
    setName("");
    setTouched(false);
    setOpen(false);
    if (created) goTo(`/desafio/${created.args.challenge}`);
  };

  if (!open) {
    return (
      <button className="create-cta" onClick={() => setOpen(true)}>
        <span className="create-cta-icon">＋</span>
        <span>
          <b>Criar um desafio</b>
          <span className="muted"> — defina o tema, o prazo e a recompensa</span>
        </span>
      </button>
    );
  }

  return (
    <form className="card create-form" onSubmit={submit} noValidate>
      <div className="card-head">
        <h3>Novo desafio</h3>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </div>

      <label className="field">
        <span className="field-label">Nome do desafio</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => setTouched(true)}
          placeholder="Desafio de Tortas Inusitadas"
          maxLength={NAME_MAX}
          autoFocus
        />
        {touched && errors.name ? (
          <span className="field-error">{errors.name}</span>
        ) : (
          <span className="field-hint">Obrigatório conter “Desafio”.</span>
        )}
      </label>
      <div className="chips">
        {IDEAS.map((idea) => (
          <button type="button" key={idea} className="chip" onClick={() => setName(idea)}>
            {idea}
          </button>
        ))}
      </div>

      <div className="form-row">
        <label className="field">
          <span className="field-label">Duração</span>
          <div className="input-group">
            <input
              type="number"
              min="1"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <select value={unit} onChange={(e) => setUnit(e.target.value)}>
              <option value="min">minutos</option>
              <option value="h">horas</option>
              <option value="d">dias</option>
            </select>
          </div>
          {touched && errors.duration && <span className="field-error">{errors.duration}</span>}
        </label>

        <label className="field">
          <span className="field-label">Recompensa para o vencedor</span>
          <div className="input-group">
            <input
              type="number"
              min="0"
              step="1"
              value={reward}
              onChange={(e) => setReward(e.target.value)}
            />
            <span className="input-suffix">COOK</span>
          </div>
          {touched && errors.reward ? (
            <span className="field-error">{errors.reward}</span>
          ) : (
            <span className="field-hint">
              {balance.loaded ? `Seu saldo: ${formatCook(balance.cook)} COOK` : "Pago em COOK, o token do COOKOFF."}
            </span>
          )}
        </label>
      </div>

      <p className="muted small">
        Serão duas confirmações na carteira: <b>autorizar</b> a fábrica a usar seus COOK (approve) e{" "}
        <b>criar</b> o desafio. Os COOK ficam guardados no contrato do desafio; se ninguém receber votos, voltam
        para você.
      </p>

      <button className="btn btn-primary btn-block" type="submit" disabled={(touched && !valid) || step !== null}>
        {step === 1
          ? "Autorizando COOK (1/2)…"
          : step === 2
            ? "Criando desafio…"
            : `Criar desafio com ${reward || "0"} COOK`}
      </button>
    </form>
  );
}
