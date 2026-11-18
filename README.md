# 🍳 COOKOFF

dApp de **desafios culinários** na rede de teste **Sepolia**. Qualquer pessoa pode criar um *Desafio* (ex.: “Desafio de Tortas Inusitadas”) oferecendo uma recompensa em **COOK**, o token do sistema; a comunidade envia receitas temáticas e vota. Quando o prazo acaba (ou o criador encerra), o contrato paga automaticamente a receita mais votada.

## O token COOK

As recompensas não usam ETH: usam o **CookToken (COOK)**, um ERC-20 próprio (OpenZeppelin). Os tokens são criados (*mint*) na hora:

- **Bônus de boas-vindas:** ao entrar no sistema pela primeira vez, a carteira recebe **100 COOK grátis** (`claimWelcomeBonus`, uma vez por carteira).
- **Compra:** pouco ETH vira muito COOK, à taxa fixa de **1 ETH = 1.000.000 COOK** (0,001 ETH = 1.000 COOK) via `buyTokens`.

Só o criador de um desafio gasta COOK. Enviar receitas e votar é livre (paga-se apenas o gas da transação, em ETH).

## Regras

- O nome do desafio **deve conter “Desafio”** (sem diferenciar maiúsculas/minúsculas), com 8–80 bytes.
- O criador define a **duração** (1 minuto a 30 dias) e a **recompensa** (> 0 COOK, custodiada no contrato do desafio).
- Criar um desafio são duas transações: `approve` (autoriza a fábrica a mover seus COOK) e `createChallenge`.
- Qualquer pessoa, inclusive o criador, pode enviar receitas (até 100 por desafio).
- Cada carteira tem **2 votos por desafio**, em receitas diferentes, e **não pode votar na própria receita**.
- O **criador pode encerrar a qualquer momento**; após o prazo, **qualquer pessoa** pode finalizar.
- Vence a receita com mais votos; no empate, a enviada primeiro. Sem votos, os COOK voltam ao criador.

## Como os requisitos do projeto são atendidos

| Requisito | Onde |
|---|---|
| dApp com interface para interagir com o contrato | `frontend/` (React + Vite + ethers v6), build estático servível via HTTP |
| Contratos na Sepolia | `npm run deploy:sepolia` (ver abaixo) |
| **Modifiers** | `CookoffFactory`: `validChallengeName`, `withReward`, `validDuration`, `canFundReward`, `challengeExists`, `onlyChallenge` · `Challenge`: `onlyCreator`, `onlyOpen`, `notFinalized`, `onlyAfterDeadline`, `recipeExists`, `notOwnRecipe`, `hasVotesLeft`, `notVotedYet`, `validRecipeName`, `hasRoomForRecipes` · `CookToken`: `bonusNotClaimed`, `withEth`, `onlyOwner` |
| **Eventos** capturados pela interface | Fábrica: `ChallengeCreated`, `ChallengeFinalized` · Desafio: `RecipeSubmitted`, `VoteCast`, `ChallengeFinalized`, `RewardPaid` · Token: `WelcomeBonusClaimed`, `TokensPurchased`, `Transfer`, `EthWithdrawn`. O frontend escuta em tempo real (`frontend/src/lib/events.js` e `App.jsx`) e reage com feed “Ao vivo”, notificações, atualização dos placares e do saldo de COOK, destaque animado da receita votada e confete quando você vence. |
| **Contract Factory** | `CookoffFactory.createChallenge()` implanta um novo `Challenge` com `new Challenge(...)` e transfere para ele a recompensa em COOK |
| Fábrica **chama** os contratos criados | `finalizeChallenge(id)` → `Challenge.finalize()`; `getChallengeSummary(id)` / `getAllSummaries()` → `Challenge.getSummary()`. E o filho chama de volta `onChallengeFinalized()` para atualizar o ranking (`winsOf`, `earningsOf`). |
| **Testes unitários** | `test/Cookoff.js` (Hardhat + Mocha/Chai, 34 testes) |

## Estrutura

```
contracts/
  CookToken.sol          token ERC-20 COOK (bônus de boas-vindas + compra com ETH)
  CookoffFactory.sol     contrato principal (factory + ranking)
  Challenge.sol          um desafio: receitas, votos, prêmio em COOK
test/Cookoff.js          testes unitários
scripts/deploy.js        implanta token + fábrica e exporta ABIs/endereços p/ o frontend
scripts/seed.js          dados de exemplo na rede local
frontend/                dApp (Vite + React + ethers v6)
  src/contracts/         ABIs + addresses.json (gerados pelo deploy)
```

## Rodando localmente

Requisitos: Node.js 20+ e MetaMask.

```bash
npm install
npm --prefix frontend install
npm test                 # testes dos contratos
```

Em um terminal, suba a rede local (ela mostra 20 contas de teste com 10.000 ETH cada):

```bash
npx hardhat node
```

Em outro, implante, popule e abra o frontend:

```bash
npm run deploy:local
npm run seed:local       # opcional: 11 desafios, 41 receitas, 55 votos de exemplo
npm run frontend
```

Abra http://localhost:5173. No MetaMask, adicione a rede `http://127.0.0.1:8545` (chainId 31337, o app oferece adicioná-la) e importe a chave privada de uma das contas exibidas pelo `npx hardhat node`. O seed usa as contas #0–#9; as #10–#19 ficam livres para você testar como usuário novo (e ganhar o bônus ao entrar).

> Toda vez que o `hardhat node` reinicia, a rede volta do zero: rode `deploy:local` (e o seed) de novo e, no MetaMask, use *Configurações → Avançado → Limpar dados da aba de atividades* para resetar o *nonce*.

## Implantando na Sepolia

1. Configure as variáveis do Hardhat (ficam fora do repositório):
   ```bash
   npx hardhat vars set INFURA_API_KEY
   npx hardhat vars set SEPOLIA_PRIVATE_KEY
   npx hardhat vars set ETHERSCAN_API_KEY      # opcional, para verificar
   ```
   Use uma carteira **só de testes** com SepoliaETH de um faucet.
2. Implante (grava os endereços em `frontend/src/contracts/addresses.json`):
   ```bash
   npm run deploy:sepolia
   ```
3. (Opcional) verifique o código no Etherscan (o script imprime os comandos prontos):
   ```bash
   npx hardhat verify --network sepolia <ENDERECO_DO_TOKEN>
   npx hardhat verify --network sepolia <ENDERECO_DA_FABRICA> <ENDERECO_DO_TOKEN>
   ```
4. Faça commit do `addresses.json` atualizado.

## Publicando o frontend

```bash
npm run frontend:build    # gera frontend/dist (site estático)
```

`frontend/dist` pode ser servido por qualquer servidor HTTP — por exemplo, numa máquina do Labgrad: `npx serve frontend/dist -l 8080` ou `cd frontend && npm run preview` — ou publicado em Vercel, Netlify ou GitHub Pages (o build usa caminhos relativos).

Variáveis opcionais do frontend (ver `frontend/.env.example`):

- `VITE_CHAIN_ID` — `11155111` (Sepolia) ou `31337` (local). Padrão: Sepolia, se houver endereço implantado lá; senão, local.
- `VITE_RPC_URL` — RPC usado para leitura e escuta de eventos. Padrão Sepolia: `https://ethereum-sepolia-rpc.publicnode.com`.

As variáveis precisam estar na mesma linha do comando (`VITE_CHAIN_ID=31337 npm run frontend`) ou num arquivo `frontend/.env`.

A leitura dos desafios e a captura de eventos funcionam mesmo sem carteira conectada; a carteira só é necessária para assinar transações.
