# 🍳 COOKOFF

dApp de **desafios culinários** na rede de teste **Sepolia**. Qualquer pessoa pode criar um *Desafio* (ex.: “Desafio de Tortas Inusitadas”) depositando uma recompensa em ETH; a comunidade envia receitas temáticas e vota. Quando o prazo acaba (ou o criador encerra), o contrato paga automaticamente a receita mais votada.

## Regras

- O nome do desafio **deve conter “Desafio”** (sem diferenciar maiúsculas/minúsculas), com 8–80 bytes.
- O criador define a **duração** (1 minuto a 30 dias) e a **recompensa** (> 0 ETH, custodiada no contrato do desafio).
- Qualquer pessoa, inclusive o criador, pode enviar receitas (até 100 por desafio).
- Cada carteira tem **2 votos por desafio**, em receitas diferentes, e **não pode votar na própria receita**.
- O **criador pode encerrar a qualquer momento**; após o prazo, **qualquer pessoa** pode finalizar.
- Vence a receita com mais votos; no empate, a enviada primeiro. Sem votos, a recompensa volta ao criador.
- Se o envio do prêmio falhar (ex.: vencedor é um contrato que rejeita ETH), o valor fica disponível em `withdraw()`.

## Como os requisitos do projeto são atendidos

| Requisito | Onde |
|---|---|
| dApp com interface para interagir com o contrato | `frontend/` (React + Vite + ethers v6), build estático servível via HTTP |
| Contratos na Sepolia | `npm run deploy:sepolia` (ver abaixo) |
| **Modifiers** | `CookoffFactory`: `validChallengeName`, `withReward`, `validDuration`, `challengeExists`, `onlyChallenge` · `Challenge`: `onlyCreator`, `onlyOpen`, `notFinalized`, `onlyAfterDeadline`, `recipeExists`, `notOwnRecipe`, `hasVotesLeft`, `notVotedYet`, `validRecipeName`, `hasRoomForRecipes` |
| **Eventos** capturados pela interface | Fábrica: `ChallengeCreated`, `ChallengeFinalized` · Desafio: `RecipeSubmitted`, `VoteCast`, `ChallengeFinalized`, `RewardPaid`, `RewardPending`, `Withdrawal`. O frontend escuta em tempo real (`frontend/src/lib/events.js`) e reage com feed “Ao vivo”, notificações, atualização dos placares, destaque animado da receita votada e confete quando você vence. |
| **Contract Factory** | `CookoffFactory.createChallenge()` implanta um novo `Challenge` com `new Challenge{value: ...}(...)` |
| Fábrica **chama** os contratos criados | `finalizeChallenge(id)` → `Challenge.finalize()`; `getChallengeSummary(id)` / `getAllSummaries()` → `Challenge.getSummary()`. E o filho chama de volta `onChallengeFinalized()` para atualizar o ranking (`winsOf`, `earningsOf`). |
| **Testes unitários** | `test/Cookoff.js` (Hardhat + Mocha/Chai, 27 testes) |

## Estrutura

```
contracts/
  CookoffFactory.sol     contrato principal (factory + ranking)
  Challenge.sol          um desafio: receitas, votos, prêmio
  mocks/RejectingChef.sol  auxiliar de teste (contrato que rejeita ETH)
test/Cookoff.js          testes unitários
scripts/deploy.js        implanta a fábrica e exporta ABI/endereço p/ o frontend
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

Em um terminal, suba a rede local:

```bash
npx hardhat node
```

Em outro, implante, popule e abra o frontend:

```bash
npm run deploy:local
npm run seed:local       # opcional: desafios/receitas de exemplo
VITE_CHAIN_ID=31337 
npm run frontend
```

Abra http://localhost:5173. No MetaMask, importe uma das chaves privadas exibidas pelo `npx hardhat node` (contas de teste da rede local) e use a rede `localhost:8545` (chainId 31337) — o app oferece adicioná-la.

> Se o MetaMask reclamar de *nonce* depois de reiniciar o `hardhat node`, use *Configurações → Avançado → Limpar dados da aba de atividades*.

## Implantando na Sepolia

1. Configure as variáveis do Hardhat (ficam fora do repositório):
   ```bash
   npx hardhat vars set INFURA_API_KEY
   npx hardhat vars set SEPOLIA_PRIVATE_KEY
   npx hardhat vars set ETHERSCAN_API_KEY      # opcional, para verificar
   ```
   Use uma carteira **só de testes** com SepoliaETH de um faucet.
2. Implante (grava o endereço em `frontend/src/contracts/addresses.json`):
   ```bash
   npm run deploy:sepolia
   ```
3. (Opcional) verifique o código no Etherscan:
   ```bash
   npx hardhat verify --network sepolia <ENDERECO_DA_FABRICA>
   ```
4. Faça commit do `addresses.json` atualizado.

## Publicando o frontend

```bash
npm run frontend:build    # gera frontend/dist (site estático)
```

`frontend/dist` pode ser servido por qualquer servidor HTTP — por exemplo, numa máquina do Labgrad: `npx serve frontend/dist -l 8080` ou `cd frontend && npm run preview` — ou publicado em Vercel, Netlify ou GitHub Pages (o build usa caminhos relativos).

Variáveis opcionais do frontend (ver `frontend/.env.example`):

- `VITE_CHAIN_ID` — `11155111` (Sepolia) ou `31337` (local). Padrão: Sepolia, se houver endereço implantado lá.
- `VITE_RPC_URL` — RPC usado para leitura e escuta de eventos. Padrão Sepolia: `https://ethereum-sepolia-rpc.publicnode.com`.

A leitura dos desafios e a captura de eventos funcionam mesmo sem carteira conectada; a carteira só é necessária para assinar transações.
