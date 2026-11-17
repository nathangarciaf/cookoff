import { challengeInterface, getFactory, getReadProvider } from "./eth";

/**
 * Captura, em tempo real, os eventos emitidos pelos contratos do COOKOFF:
 *
 *  - CookoffFactory.ChallengeCreated / ChallengeFinalized  → via contract.on()
 *  - Challenge.RecipeSubmitted / VoteCast / RewardPending  → via provider.on()
 *    com filtro por tópico (pega os eventos de TODOS os desafios de uma vez).
 *    Como qualquer contrato poderia emitir um evento com a mesma assinatura,
 *    só repassamos logs de endereços que a fábrica confirma (isChallenge).
 *
 * Retorna uma função para cancelar as inscrições.
 */
export function subscribeCookoffEvents(onEvent) {
  const provider = getReadProvider();
  const factory = getFactory();
  const seen = new Set();
  const verified = new Map(); // address -> Promise<boolean>

  const emit = (event) => {
    const key = `${event.txHash}-${event.logIndex}`;
    if (seen.has(key)) return;
    seen.add(key);
    onEvent({ ...event, receivedAt: Date.now() });
  };

  const meta = (log) => ({
    txHash: log.transactionHash,
    logIndex: log.index,
    blockNumber: log.blockNumber,
  });

  // ---- Eventos da fábrica -------------------------------------------------
  const onCreated = (id, challenge, creator, name, reward, deadline, payload) => {
    verified.set(challenge.toLowerCase(), Promise.resolve(true));
    emit({
      type: "ChallengeCreated",
      id: Number(id),
      challenge,
      creator,
      name,
      reward,
      deadline: Number(deadline),
      ...meta(payload.log),
    });
  };

  const onFinalized = (id, challenge, winner, reward, payload) => {
    emit({ type: "ChallengeFinalized", id: Number(id), challenge, winner, reward, ...meta(payload.log) });
  };

  factory.on("ChallengeCreated", onCreated);
  factory.on("ChallengeFinalized", onFinalized);

  // ---- Eventos dos contratos filhos (Challenge) ---------------------------
  const topics = ["RecipeSubmitted", "VoteCast", "RewardPending"].map(
    (name) => challengeInterface.getEvent(name).topicHash
  );
  const challengeFilter = { topics: [topics] };

  const isKnownChallenge = (address) => {
    const key = address.toLowerCase();
    if (!verified.has(key)) {
      verified.set(
        key,
        factory.isChallenge(address).catch(() => false)
      );
    }
    return verified.get(key);
  };

  const onChallengeLog = async (log) => {
    let parsed;
    try {
      parsed = challengeInterface.parseLog(log);
    } catch {
      return;
    }
    if (!parsed || !(await isKnownChallenge(log.address))) return;

    const base = { challenge: log.address, ...meta(log) };
    if (parsed.name === "RecipeSubmitted") {
      emit({
        type: "RecipeSubmitted",
        recipeId: Number(parsed.args.recipeId),
        author: parsed.args.author,
        name: parsed.args.name,
        ...base,
      });
    } else if (parsed.name === "VoteCast") {
      emit({
        type: "VoteCast",
        voter: parsed.args.voter,
        recipeId: Number(parsed.args.recipeId),
        votes: Number(parsed.args.newVoteCount),
        ...base,
      });
    } else if (parsed.name === "RewardPending") {
      emit({ type: "RewardPending", to: parsed.args.to, amount: parsed.args.amount, ...base });
    }
  };

  provider.on(challengeFilter, onChallengeLog);

  return () => {
    factory.off("ChallengeCreated", onCreated);
    factory.off("ChallengeFinalized", onFinalized);
    provider.off(challengeFilter, onChallengeLog);
  };
}
