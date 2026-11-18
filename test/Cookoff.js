const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

const ONE_DAY = 24 * 60 * 60;
const COOK = (n) => ethers.parseEther(String(n)); // COOK tem 18 casas, como o ETH
const REWARD = COOK(50);

describe("COOKOFF", function () {
  // ------------------------------------------------------------------
  // Fixtures
  // ------------------------------------------------------------------
  async function deployFixture() {
    const [owner, alice, bob, carol, dave] = await ethers.getSigners();
    const token = await ethers.deployContract("CookToken");
    const factory = await ethers.deployContract("CookoffFactory", [await token.getAddress()]);
    await Promise.all([token.waitForDeployment(), factory.waitForDeployment()]);

    // Dá COOK a alguém e autoriza a fábrica a gastar (o que o frontend faz)
    async function fund(signer, amount = COOK(1000)) {
      await token.connect(signer).buyTokens({ value: amount / 1_000_000n });
      await token.connect(signer).approve(await factory.getAddress(), amount);
    }

    return { token, factory, owner, alice, bob, carol, dave, fund };
  }

  // Fixture com um desafio já criado pela alice
  async function challengeFixture() {
    const base = await deployFixture();
    const { factory, alice, fund } = base;
    await fund(alice);
    await factory.connect(alice).createChallenge("Desafio de Tortas Inusitadas", ONE_DAY, REWARD);
    const [address] = await factory.getChallenges();
    const challenge = await ethers.getContractAt("Challenge", address);
    return { ...base, challenge };
  }

  // ====================================================================
  describe("CookToken (COOK)", function () {
    it("é um ERC-20 chamado CookCoin (COOK) com 18 casas", async function () {
      const { token, owner } = await loadFixture(deployFixture);
      expect(await token.name()).to.equal("CookCoin");
      expect(await token.symbol()).to.equal("COOK");
      expect(await token.decimals()).to.equal(18);
      expect(await token.totalSupply()).to.equal(0); // nada existe até alguém mintar
      expect(await token.owner()).to.equal(owner.address);
    });

    it("dá 100 COOK de boas-vindas uma única vez (modifier bonusNotClaimed)", async function () {
      const { token, alice } = await loadFixture(deployFixture);
      await expect(token.connect(alice).claimWelcomeBonus())
        .to.emit(token, "WelcomeBonusClaimed")
        .withArgs(alice.address, COOK(100));
      expect(await token.balanceOf(alice.address)).to.equal(COOK(100));
      expect(await token.hasClaimedBonus(alice.address)).to.equal(true);

      await expect(token.connect(alice).claimWelcomeBonus()).to.be.revertedWith("Bonus de boas-vindas ja resgatado");
    });

    it("vende muitos COOK por pouco ETH (0,001 ETH = 1.000 COOK)", async function () {
      const { token, alice } = await loadFixture(deployFixture);
      const eth = ethers.parseEther("0.001");

      expect(await token.quote(eth)).to.equal(COOK(1000));
      const tx = token.connect(alice).buyTokens({ value: eth });
      await expect(tx).to.emit(token, "TokensPurchased").withArgs(alice.address, eth, COOK(1000));
      await expect(tx).to.changeTokenBalance(token, alice, COOK(1000));
      await expect(tx).to.changeEtherBalances([alice, token], [-eth, eth]);
    });

    it("exige ETH na compra (modifier withEth)", async function () {
      const { token, alice } = await loadFixture(deployFixture);
      await expect(token.connect(alice).buyTokens()).to.be.revertedWith("Envie ETH para comprar COOK");
    });

    it("só o dono retira o ETH arrecadado (onlyOwner do OpenZeppelin)", async function () {
      const { token, owner, alice } = await loadFixture(deployFixture);
      await expect(token.withdrawEth(owner.address)).to.be.revertedWith("Sem ETH para retirar");

      const eth = ethers.parseEther("0.5");
      await token.connect(alice).buyTokens({ value: eth });

      await expect(token.connect(alice).withdrawEth(alice.address))
        .to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount")
        .withArgs(alice.address);

      await expect(token.withdrawEth(owner.address)).to.changeEtherBalances([owner, token], [eth, -eth]);
    });
  });

  // ====================================================================
  describe("CookoffFactory (Contract Factory)", function () {
    it("usa o CookToken como moeda de recompensa", async function () {
      const { token, factory } = await loadFixture(deployFixture);
      expect(await factory.rewardToken()).to.equal(await token.getAddress());
    });

    it("cria um novo contrato Challenge e emite ChallengeCreated", async function () {
      const { factory, token, alice, fund } = await loadFixture(deployFixture);
      await fund(alice);

      await expect(factory.connect(alice).createChallenge("Desafio de Tortas Inusitadas", ONE_DAY, REWARD))
        .to.emit(factory, "ChallengeCreated")
        .withArgs(0, anyValue, alice.address, "Desafio de Tortas Inusitadas", REWARD, anyValue);

      expect(await factory.challengeCount()).to.equal(1);
      const [address] = await factory.getChallenges();
      expect(await factory.isChallenge(address)).to.equal(true);

      const challenge = await ethers.getContractAt("Challenge", address);
      expect(await challenge.factory()).to.equal(await factory.getAddress());
      expect(await challenge.creator()).to.equal(alice.address);
      expect(await challenge.name()).to.equal("Desafio de Tortas Inusitadas");
      expect(await challenge.reward()).to.equal(REWARD);
      expect(await challenge.rewardToken()).to.equal(await token.getAddress());
    });

    it("move os COOK do criador para o contrato do desafio (não para a fábrica)", async function () {
      const { factory, token, alice, fund } = await loadFixture(deployFixture);
      await fund(alice);
      const tx = await factory.connect(alice).createChallenge("Desafio Doce", ONE_DAY, REWARD);
      const [address] = await factory.getChallenges();

      await expect(tx).to.changeTokenBalances(token, [alice, address], [-REWARD, REWARD]);
      expect(await token.balanceOf(await factory.getAddress())).to.equal(0);
      expect(await ethers.provider.getBalance(address)).to.equal(0); // nenhum ETH envolvido
    });

    it("exige saldo e approve antes de criar (modifier canFundReward)", async function () {
      const { factory, token, alice } = await loadFixture(deployFixture);
      await expect(
        factory.connect(alice).createChallenge("Desafio de Sopas", ONE_DAY, REWARD)
      ).to.be.revertedWith("Saldo de COOK insuficiente");

      await token.connect(alice).claimWelcomeBonus(); // 100 COOK, mas sem approve
      await expect(
        factory.connect(alice).createChallenge("Desafio de Sopas", ONE_DAY, REWARD)
      ).to.be.revertedWith("Autorize a fabrica a usar seus COOK (approve)");

      await token.connect(alice).approve(await factory.getAddress(), REWARD);
      await expect(factory.connect(alice).createChallenge("Desafio de Sopas", ONE_DAY, REWARD)).to.not.be.reverted;
    });

    it("aceita 'desafio' sem diferenciar maiúsculas/minúsculas", async function () {
      const { factory, alice, fund } = await loadFixture(deployFixture);
      await fund(alice);
      await expect(factory.connect(alice).createChallenge("Mega DESAFIO vegano", ONE_DAY, REWARD)).to.not.be.reverted;
      await expect(factory.connect(alice).createChallenge("o desafio do bolo", ONE_DAY, REWARD)).to.not.be.reverted;
    });

    it("rejeita nomes sem a palavra 'Desafio' (modifier validChallengeName)", async function () {
      const { factory, alice, fund } = await loadFixture(deployFixture);
      await fund(alice);
      await expect(
        factory.connect(alice).createChallenge("Torneio de Tortas", ONE_DAY, REWARD)
      ).to.be.revertedWith("O nome deve conter a palavra 'Desafio'");
      await expect(
        factory.connect(alice).createChallenge("Desafi o de Tortas", ONE_DAY, REWARD)
      ).to.be.revertedWith("O nome deve conter a palavra 'Desafio'");
    });

    it("rejeita nomes curtos ou longos demais", async function () {
      const { factory, alice, fund } = await loadFixture(deployFixture);
      await fund(alice);
      await expect(factory.connect(alice).createChallenge("Desafio", ONE_DAY, REWARD)).to.be.revertedWith(
        "Nome do desafio muito curto"
      );
      await expect(
        factory.connect(alice).createChallenge("Desafio " + "x".repeat(80), ONE_DAY, REWARD)
      ).to.be.revertedWith("Nome do desafio muito longo");
    });

    it("exige recompensa (modifier withReward)", async function () {
      const { factory, alice, fund } = await loadFixture(deployFixture);
      await fund(alice);
      await expect(factory.connect(alice).createChallenge("Desafio de Sopas", ONE_DAY, 0)).to.be.revertedWith(
        "Informe uma recompensa em COOK"
      );
    });

    it("valida a duração (modifier validDuration)", async function () {
      const { factory, alice, fund } = await loadFixture(deployFixture);
      await fund(alice);
      await expect(factory.connect(alice).createChallenge("Desafio de Sopas", 30, REWARD)).to.be.revertedWith(
        "Duracao minima de 1 minuto"
      );
      await expect(
        factory.connect(alice).createChallenge("Desafio de Sopas", 31 * ONE_DAY, REWARD)
      ).to.be.revertedWith("Duracao maxima de 30 dias");
    });

    it("lista desafios por criador e retorna resumos lendo os contratos filhos", async function () {
      const { factory, alice, bob, fund } = await loadFixture(deployFixture);
      await fund(alice);
      await fund(bob);
      await factory.connect(alice).createChallenge("Desafio A de massas", ONE_DAY, REWARD);
      await factory.connect(bob).createChallenge("Desafio B de saladas", ONE_DAY, REWARD * 2n);
      await factory.connect(alice).createChallenge("Desafio C de drinks", ONE_DAY, REWARD);

      expect(await factory.getChallengesByCreator(alice.address)).to.deep.equal([0n, 2n]);
      expect(await factory.getChallengesByCreator(bob.address)).to.deep.equal([1n]);

      const summary = await factory.getChallengeSummary(1);
      expect(summary.name).to.equal("Desafio B de saladas");
      expect(summary.creator).to.equal(bob.address);
      expect(summary.reward).to.equal(REWARD * 2n);

      const all = await factory.getAllSummaries();
      expect(all.length).to.equal(3);
      expect(all.map((s) => s.id)).to.deep.equal([0n, 1n, 2n]);

      await expect(factory.getChallengeSummary(9)).to.be.revertedWith("Desafio inexistente");
    });

    it("só aceita o callback onChallengeFinalized vindo de desafios da fábrica", async function () {
      const { factory, alice } = await loadFixture(deployFixture);
      await expect(factory.connect(alice).onChallengeFinalized(alice.address, REWARD)).to.be.revertedWith(
        "Apenas desafios desta fabrica"
      );
    });

    it("finaliza um desafio chamando o contrato filho e atualiza o ranking", async function () {
      const { factory, token, challenge, alice, bob, carol } = await loadFixture(challengeFixture);
      await challenge.connect(bob).submitRecipe("Torta de Mirtilo com Queijo de Cabra");
      await challenge.connect(carol).vote(0);

      await expect(factory.finalizeChallenge(0)).to.be.revertedWith("Desafio ainda em andamento");

      await time.increase(ONE_DAY);

      const tx = factory.connect(carol).finalizeChallenge(0);
      await expect(tx)
        .to.emit(factory, "ChallengeFinalized")
        .withArgs(0, await challenge.getAddress(), bob.address, REWARD);
      await expect(tx).to.emit(challenge, "ChallengeFinalized").withArgs(bob.address, 0, true, REWARD, false);
      await expect(tx).to.changeTokenBalances(token, [bob, challenge], [REWARD, -REWARD]);

      expect(await factory.winsOf(bob.address)).to.equal(1);
      expect(await factory.earningsOf(bob.address)).to.equal(REWARD);
      expect(await factory.totalRewardsDistributed()).to.equal(REWARD);
      expect(await factory.winsOf(alice.address)).to.equal(0);

      await expect(factory.finalizeChallenge(0)).to.be.revertedWith("Desafio ja finalizado");
      await expect(factory.finalizeChallenge(5)).to.be.revertedWith("Desafio inexistente");
    });
  });

  // ====================================================================
  describe("Challenge — receitas", function () {
    it("permite enviar receitas (inclusive o criador) e emite RecipeSubmitted", async function () {
      const { challenge, alice, bob } = await loadFixture(challengeFixture);

      await expect(challenge.connect(bob).submitRecipe("Torta de Mirtilo com Queijo de Cabra"))
        .to.emit(challenge, "RecipeSubmitted")
        .withArgs(0, bob.address, "Torta de Mirtilo com Queijo de Cabra");
      await expect(challenge.connect(alice).submitRecipe("Torta de Banana com Bacon"))
        .to.emit(challenge, "RecipeSubmitted")
        .withArgs(1, alice.address, "Torta de Banana com Bacon");

      expect(await challenge.recipeCount()).to.equal(2);
      const recipes = await challenge.getRecipes();
      expect(recipes[0].author).to.equal(bob.address);
      expect(recipes[1].name).to.equal("Torta de Banana com Bacon");
      expect((await challenge.getRecipe(1)).author).to.equal(alice.address);
    });

    it("não exige COOK para participar (só o criador deposita)", async function () {
      const { token, challenge, bob, carol } = await loadFixture(challengeFixture);
      expect(await token.balanceOf(bob.address)).to.equal(0);
      await challenge.connect(bob).submitRecipe("Receita sem saldo");
      await expect(challenge.connect(carol).vote(0)).to.not.be.reverted;
    });

    it("valida o nome da receita (modifier validRecipeName)", async function () {
      const { challenge, bob } = await loadFixture(challengeFixture);
      await expect(challenge.connect(bob).submitRecipe("")).to.be.revertedWith("Nome da receita obrigatorio");
      await expect(challenge.connect(bob).submitRecipe("x".repeat(121))).to.be.revertedWith(
        "Nome da receita muito longo"
      );
    });

    it("não aceita receitas após o prazo (modifier onlyOpen)", async function () {
      const { challenge, bob } = await loadFixture(challengeFixture);
      await time.increase(ONE_DAY);
      await expect(challenge.connect(bob).submitRecipe("Torta atrasada")).to.be.revertedWith(
        "Prazo do desafio expirou"
      );
    });

    it("limita o número de receitas por desafio", async function () {
      const { challenge, bob } = await loadFixture(challengeFixture);
      const max = Number(await challenge.MAX_RECIPES());
      for (let i = 0; i < max; i++) {
        await challenge.connect(bob).submitRecipe(`Receita ${i}`);
      }
      await expect(challenge.connect(bob).submitRecipe("Uma a mais")).to.be.revertedWith(
        "Limite de receitas atingido"
      );
    });
  });

  // ====================================================================
  describe("Challenge — votação", function () {
    async function withRecipesFixture() {
      const base = await challengeFixture();
      const { challenge, alice, bob, carol } = base;
      await challenge.connect(bob).submitRecipe("Torta de Mirtilo com Queijo de Cabra"); // 0
      await challenge.connect(carol).submitRecipe("Torta de Abobora com Gorgonzola"); // 1
      await challenge.connect(alice).submitRecipe("Torta de Chocolate com Pimenta"); // 2
      return base;
    }

    it("registra o voto e emite VoteCast", async function () {
      const { challenge, dave } = await loadFixture(withRecipesFixture);
      await expect(challenge.connect(dave).vote(0)).to.emit(challenge, "VoteCast").withArgs(dave.address, 0, 1, 1);
      expect((await challenge.getRecipe(0)).votes).to.equal(1);
      expect(await challenge.totalVotes()).to.equal(1);
      expect(await challenge.votesUsed(dave.address)).to.equal(1);
      expect(await challenge.remainingVotes(dave.address)).to.equal(1);
      expect(await challenge.hasVotedFor(dave.address, 0)).to.equal(true);
    });

    it("não permite votar na própria receita (modifier notOwnRecipe)", async function () {
      const { challenge, bob } = await loadFixture(withRecipesFixture);
      await expect(challenge.connect(bob).vote(0)).to.be.revertedWith("Voce nao pode votar na propria receita");
    });

    it("permite no máximo 2 votos por desafio (modifier hasVotesLeft)", async function () {
      const { challenge, alice, bob, carol, dave } = await loadFixture(withRecipesFixture);
      await challenge.connect(dave).submitRecipe("Torta de Limao com Manjericao"); // 3
      await challenge.connect(bob).vote(1);
      await challenge.connect(bob).vote(2);
      await expect(challenge.connect(bob).vote(3)).to.be.revertedWith("Limite de 2 votos por desafio atingido");
      expect(await challenge.remainingVotes(bob.address)).to.equal(0);
      // outros usuários continuam podendo votar
      await expect(challenge.connect(alice).vote(3)).to.not.be.reverted;
      await expect(challenge.connect(carol).vote(3)).to.not.be.reverted;
    });

    it("não permite votar duas vezes na mesma receita (modifier notVotedYet)", async function () {
      const { challenge, dave } = await loadFixture(withRecipesFixture);
      await challenge.connect(dave).vote(0);
      await expect(challenge.connect(dave).vote(0)).to.be.revertedWith("Voce ja votou nesta receita");
    });

    it("rejeita voto em receita inexistente (modifier recipeExists)", async function () {
      const { challenge, dave } = await loadFixture(withRecipesFixture);
      await expect(challenge.connect(dave).vote(42)).to.be.revertedWith("Receita inexistente");
    });

    it("não aceita votos após o encerramento", async function () {
      const { challenge, alice, dave } = await loadFixture(withRecipesFixture);
      await challenge.connect(alice).close();
      await expect(challenge.connect(dave).vote(0)).to.be.revertedWith("Desafio encerrado");
    });
  });

  // ====================================================================
  describe("Challenge — encerramento e recompensa", function () {
    it("só o criador pode encerrar antes do prazo (modifier onlyCreator)", async function () {
      const { challenge, bob } = await loadFixture(challengeFixture);
      await expect(challenge.connect(bob).close()).to.be.revertedWith("Apenas o criador do desafio");
    });

    it("o criador encerra antecipadamente e o mais votado recebe os COOK", async function () {
      const { factory, token, challenge, alice, bob, carol, dave } = await loadFixture(challengeFixture);
      await challenge.connect(bob).submitRecipe("Torta de Mirtilo com Queijo de Cabra"); // 0
      await challenge.connect(carol).submitRecipe("Torta de Abobora com Gorgonzola"); // 1
      await challenge.connect(dave).vote(1);
      await challenge.connect(alice).vote(1);
      await challenge.connect(alice).vote(0);

      const tx = challenge.connect(alice).close();
      await expect(tx).to.emit(challenge, "ChallengeFinalized").withArgs(carol.address, 1, true, REWARD, true);
      await expect(tx).to.emit(challenge, "RewardPaid").withArgs(carol.address, REWARD);
      await expect(tx).to.emit(factory, "ChallengeFinalized");
      await expect(tx).to.changeTokenBalances(token, [carol, challenge], [REWARD, -REWARD]);

      expect(await challenge.finalized()).to.equal(true);
      expect(await challenge.closedEarly()).to.equal(true);
      expect(await challenge.isOpen()).to.equal(false);
      expect(await challenge.winner()).to.equal(carol.address);
      expect(await factory.winsOf(carol.address)).to.equal(1);

      await expect(challenge.connect(alice).close()).to.be.revertedWith("Desafio ja finalizado");
    });

    it("em caso de empate vence a receita enviada primeiro", async function () {
      const { challenge, alice, bob, carol, dave } = await loadFixture(challengeFixture);
      await challenge.connect(bob).submitRecipe("Receita do Bob"); // 0
      await challenge.connect(carol).submitRecipe("Receita da Carol"); // 1
      await challenge.connect(dave).vote(1);
      await challenge.connect(alice).vote(0);
      await time.increase(ONE_DAY);
      await challenge.connect(dave).finalize();
      expect(await challenge.winner()).to.equal(bob.address);
      expect(await challenge.winningRecipeId()).to.equal(0);
    });

    it("sem votos, os COOK voltam para o criador", async function () {
      const { factory, token, challenge, alice, bob } = await loadFixture(challengeFixture);
      await challenge.connect(bob).submitRecipe("Receita sem votos");
      await time.increase(ONE_DAY);
      const tx = challenge.connect(bob).finalize();
      await expect(tx).to.changeTokenBalance(token, alice, REWARD);
      await expect(tx)
        .to.emit(challenge, "ChallengeFinalized")
        .withArgs(ethers.ZeroAddress, 0, false, REWARD, false);
      expect(await challenge.hasWinner()).to.equal(false);
      expect(await factory.totalRewardsDistributed()).to.equal(0);
    });

    it("finalize() só funciona após o prazo (modifier onlyAfterDeadline)", async function () {
      const { challenge, bob } = await loadFixture(challengeFixture);
      await expect(challenge.connect(bob).finalize()).to.be.revertedWith("Desafio ainda em andamento");
    });

    it("getSummary reflete o estado do desafio", async function () {
      const { challenge, alice, bob, dave } = await loadFixture(challengeFixture);
      await challenge.connect(bob).submitRecipe("Torta de Mirtilo com Queijo de Cabra");
      await challenge.connect(dave).vote(0);
      let s = await challenge.getSummary();
      expect(s.recipeCount).to.equal(1);
      expect(s.totalVotes).to.equal(1);
      expect(s.finalized).to.equal(false);

      await challenge.connect(alice).close();
      s = await challenge.getSummary();
      expect(s.finalized).to.equal(true);
      expect(s.hasWinner).to.equal(true);
      expect(s.winner).to.equal(bob.address);
    });
  });
});
