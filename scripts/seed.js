// Popula a rede LOCAL com desafios, receitas e votos de exemplo.
//   npx hardhat node            (terminal 1)
//   npm run deploy:local        (terminal 2)
//   npm run seed:local
//
// Usa as contas #0 a #9 do `hardhat node`. As contas #10 a #19 ficam "limpas"
// para você importar no MetaMask e testar como um usuário novo.

const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

// Apelidos das contas #0..#9 (apenas para o log ficar legível)
const CHEFS = ["Ana", "Bruno", "Carla", "Diego", "Elisa", "Fábio", "Gabi", "Hugo", "Iara", "João"];

const MIN = 1;
const HOUR = 60;
const DAY = 24 * HOUR;

// ---------------------------------------------------------------------------
// Cenário. Em cada desafio:
//   creator  → índice da conta que cria (e deposita a recompensa)
//   minutes  → duração
//   recipes  → [autor, nome]   (o índice no array é o recipeId no contrato)
//   votes    → [eleitor, recipeId]  (máx. 2 por eleitor, nunca na própria receita)
//   close    → true = o criador encerra o desafio no fim do seed
// ---------------------------------------------------------------------------
const CHALLENGES = [
  {
    creator: 0,
    name: "Desafio de Tortas Inusitadas",
    minutes: 3 * DAY,
    eth: "0.5",
    recipes: [
      [1, "Torta de Mirtilo com Queijo de Cabra"],
      [2, "Torta de Abóbora com Gorgonzola"],
      [0, "Torta de Chocolate com Pimenta Biquinho"],
      [4, "Torta de Limão Siciliano com Manjericão"],
      [6, "Torta de Banana com Bacon Caramelizado"],
      [8, "Torta de Pera com Vinho Tinto e Cardamomo"],
    ],
    votes: [[3, 0], [3, 1], [5, 0], [5, 3], [7, 0], [7, 4], [9, 3], [9, 5], [1, 3], [2, 0], [4, 0], [6, 5]],
  },
  {
    creator: 1,
    name: "Desafio das Sopas de Inverno",
    minutes: 12 * HOUR,
    eth: "0.2",
    recipes: [
      [2, "Caldo Verde com Chips de Couve"],
      [3, "Creme de Mandioquinha com Gengibre"],
      [1, "Sopa de Cebola Gratinada com Queijo Canastra"],
      [5, "Canja de Galinha com Limão e Hortelã"],
    ],
    votes: [[0, 1], [0, 3], [4, 1], [6, 0], [8, 2], [8, 1]],
  },
  {
    creator: 2,
    name: "Desafio do Prato com 5 Ingredientes",
    minutes: 2 * DAY,
    eth: "0.3",
    recipes: [
      [0, "Nhoque de Batata-Doce na Manteiga de Sálvia"],
      [4, "Risoto de Limão com Camarão"],
      [7, "Omelete Soufflé de Queijo e Ervas"],
      [9, "Frango Assado com Mel e Mostarda"],
      [2, "Macarrão Cacio e Pepe"],
    ],
    votes: [[1, 1], [3, 1], [3, 3], [5, 4], [6, 0], [8, 1]],
  },
  {
    creator: 3,
    name: "Desafio de Comida de Boteco Gourmet",
    minutes: 5 * DAY,
    eth: "1",
    recipes: [
      [5, "Bolinho de Feijoada com Couve Crocante"],
      [6, "Torresmo de Rolo com Goiabada Picante"],
      [0, "Pastel de Costela com Queijo Coalho"],
      [8, "Coxinha de Rabada com Agrião"],
      [1, "Dadinho de Tapioca com Geleia de Pimenta"],
      [9, "Croquete de Cupim com Maionese de Alho Negro"],
    ],
    votes: [[2, 0], [2, 3], [4, 1], [4, 3], [7, 3], [7, 5], [0, 3], [0, 1], [9, 0], [1, 2]],
  },
  {
    creator: 4,
    name: "Desafio das Sobremesas Sem Forno",
    minutes: 1 * DAY,
    eth: "0.15",
    recipes: [
      [6, "Pavê de Paçoca com Doce de Leite"],
      [7, "Cheesecake de Maracujá na Taça"],
      [3, "Mousse de Chocolate com Flor de Sal"],
    ],
    votes: [[0, 1], [5, 1], [5, 2]],
  },
  {
    // Sem receitas: mostra o estado vazio na interface
    creator: 5,
    name: "Desafio Drinks sem Álcool",
    minutes: 30 * MIN,
    eth: "0.1",
    recipes: [],
    votes: [],
  },
  {
    // Expira 2 minutos após o seed → fica "Aguardando finalização" e permite
    // demonstrar o botão "Finalizar e pagar" (factory.finalizeChallenge)
    creator: 6,
    name: "Desafio Relâmpago: Lanche em 10 Minutos",
    minutes: 2 * MIN,
    eth: "0.05",
    recipes: [
      [7, "Wrap de Frango com Pasta de Abacate"],
      [8, "Torrada de Ricota com Mel e Nozes"],
      [9, "Quesadilla de Feijão Preto"],
    ],
    votes: [[0, 0], [1, 0], [2, 1]],
  },
  {
    // Encerrado antecipadamente: Carla vence com 3 votos
    creator: 3,
    name: "Desafio do Pão Caseiro",
    minutes: 1 * HOUR,
    eth: "0.3",
    recipes: [
      [4, "Pão de Fermentação Natural com Azeitonas"],
      [2, "Focaccia de Alecrim e Tomate-Cereja"],
      [5, "Pão de Queijo Recheado com Linguiça"],
    ],
    votes: [[1, 1], [6, 1], [7, 0], [0, 2], [0, 1]],
    close: true,
  },
  {
    // Encerrado: Carla vence de novo → 2 vitórias no ranking
    creator: 9,
    name: "Desafio Vegano de Churrasco",
    minutes: 2 * DAY,
    eth: "0.4",
    recipes: [
      [2, "Picanha de Melancia Defumada"],
      [1, "Espetinho de Cogumelos com Chimichurri"],
      [8, "Linguiça de Grão-de-Bico com Páprica"],
    ],
    votes: [[0, 0], [3, 0], [3, 1], [4, 2], [5, 0]],
    close: true,
  },
  {
    // Encerrado com EMPATE (2 x 2): vence a receita enviada primeiro (Elisa)
    creator: 7,
    name: "Desafio de Marmitas Fit",
    minutes: 1 * DAY,
    eth: "0.2",
    recipes: [
      [4, "Escondidinho de Couve-Flor com Carne Moída"],
      [0, "Bowl de Quinoa com Salmão Grelhado"],
      [6, "Panqueca de Aveia com Frango e Espinafre"],
    ],
    votes: [[1, 1], [2, 0], [3, 1], [5, 0], [8, 2]],
    close: true,
  },
  {
    // Encerrado SEM VOTOS: a recompensa volta para o criador (Iara)
    creator: 8,
    name: "Desafio da Culinária Nordestina",
    minutes: 1 * DAY,
    eth: "0.25",
    recipes: [
      [9, "Baião de Dois com Queijo Coalho Grelhado"],
      [0, "Escondidinho de Carne de Sol"],
    ],
    votes: [],
    close: true,
  },
];

// Tentativas propositalmente inválidas: mostram os modifiers barrando cada regra
const RULE_DEMOS = [
  { label: "Ana vota na própria receita", run: (c) => c[0].contract.connect(c.s[0]).vote(2) },
  { label: "Diego tenta um 3º voto no mesmo desafio", run: (c) => c[0].contract.connect(c.s[3]).vote(3) },
  { label: "Bruno vota de novo na mesma receita", run: (c) => c[0].contract.connect(c.s[1]).vote(3) },
  { label: "Bruno tenta encerrar o desafio da Ana", run: (c) => c[0].contract.connect(c.s[1]).close() },
  { label: "Hugo vota num desafio já encerrado", run: (c) => c[7].contract.connect(c.s[7]).vote(0) },
  {
    label: "Fábio cria um desafio sem a palavra 'Desafio'",
    run: (c) => c.factory.connect(c.s[5]).createChallenge("Torneio de Bolos", 3600, { value: 1n }),
  },
  {
    label: "Gabi cria um desafio sem recompensa",
    run: (c) => c.factory.connect(c.s[6]).createChallenge("Desafio de Bolos", 3600),
  },
];

function revertReason(err) {
  // Ex.: "...reverted with reason string 'O nome deve conter a palavra 'Desafio''"
  // (regex gulosa: a mensagem do require pode conter aspas simples)
  const match = String(err?.message ?? "").match(/reverted with reason string '(.*)'/);
  return match ? match[1] : err?.reason || err?.shortMessage || err?.message;
}

async function main() {
  const { ethers, network } = hre;
  if (network.name !== "localhost") {
    throw new Error("O seed é só para a rede local: use --network localhost");
  }

  const addresses = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "frontend", "src", "contracts", "addresses.json"), "utf8")
  );
  const factoryAddress = addresses["31337"]?.CookoffFactory;
  if (!factoryAddress) throw new Error("Rode `npm run deploy:local` antes do seed.");

  const signers = (await ethers.getSigners()).slice(0, CHEFS.length);
  const factory = await ethers.getContractAt("CookoffFactory", factoryAddress);
  const send = async (txPromise) => (await txPromise).wait();

  console.log(`CookoffFactory em ${factoryAddress}\n`);

  const created = [];
  for (const ch of CHALLENGES) {
    // 1. Cria o desafio e descobre o endereço lendo o evento ChallengeCreated do recibo
    const receipt = await send(
      factory.connect(signers[ch.creator]).createChallenge(ch.name, ch.minutes * 60, {
        value: ethers.parseEther(ch.eth),
      })
    );
    const event = receipt.logs
      .map((log) => factory.interface.parseLog(log))
      .find((e) => e?.name === "ChallengeCreated");
    const contract = await ethers.getContractAt("Challenge", event.args.challenge);
    created.push({ ...ch, contract });
    console.log(`🆕 ${ch.name}  (${ch.eth} ETH, por ${CHEFS[ch.creator]})  -> ${event.args.challenge}`);

    // 2. Receitas
    for (const [author, recipeName] of ch.recipes) {
      await send(contract.connect(signers[author]).submitRecipe(recipeName));
    }
    // 3. Votos
    for (const [voter, recipeId] of ch.votes) {
      await send(contract.connect(signers[voter]).vote(recipeId));
    }
    console.log(`   ${ch.recipes.length} receitas, ${ch.votes.length} votos`);
  }

  // 4. Encerramentos (depois de tudo criado, para o log ficar organizado)
  console.log("\nEncerrando desafios:");
  for (const ch of created.filter((c) => c.close)) {
    await send(ch.contract.connect(signers[ch.creator]).close());
    const s = await ch.contract.getSummary();
    const result = s.hasWinner
      ? `vencedor ${CHEFS[ch.recipes[Number(s.winningRecipeId)][0]]} com “${ch.recipes[Number(s.winningRecipeId)][1]}”`
      : "sem votos — recompensa devolvida ao criador";
    console.log(`🏁 ${ch.name}: ${result}`);
  }

  // 5. Demonstração das regras (cada uma deve reverter)
  console.log("\nRegras sendo aplicadas pelos modifiers:");
  const ctx = Object.assign([...created], { s: signers, factory });
  for (const demo of RULE_DEMOS) {
    try {
      await send(demo.run(ctx));
      console.log(`⚠️  ${demo.label}: NÃO reverteu (inesperado)`);
    } catch (err) {
      console.log(`🚫 ${demo.label} → "${revertReason(err)}"`);
    }
  }

  // 6. Resumo final, lido pela própria fábrica (getAllSummaries chama cada Challenge)
  console.log("\nResumo (factory.getAllSummaries):");
  const summaries = await factory.getAllSummaries();
  console.table(
    summaries.map((s) => ({
      id: Number(s.id),
      desafio: s.name,
      recompensa: `${ethers.formatEther(s.reward)} ETH`,
      receitas: Number(s.recipeCount),
      votos: Number(s.totalVotes),
      estado: s.finalized ? (s.hasWinner ? "encerrado (premiado)" : "encerrado (sem votos)") : "aberto",
    }))
  );

  console.log("Ranking (factory.winsOf):");
  for (let i = 0; i < signers.length; i++) {
    const wins = await factory.winsOf(signers[i].address);
    if (wins > 0n) {
      const earned = await factory.earningsOf(signers[i].address);
      console.log(`🏆 ${CHEFS[i]} (#${i}): ${wins} vitória(s), ${ethers.formatEther(earned)} ETH`);
    }
  }

  console.log("\nSeed concluído. Contas #10 a #19 estão livres para importar no MetaMask.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
