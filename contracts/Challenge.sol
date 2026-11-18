// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @dev Interface mínima da fábrica, usada pelo desafio para avisá-la quando
///      for finalizado (o desafio "chama de volta" o contrato que o criou).
interface ICookoffFactory {
    function onChallengeFinalized(address winner, uint256 reward) external;
}

/// @title Challenge — um desafio culinário do COOKOFF
/// @notice Cada desafio é um contrato criado pela CookoffFactory. Ele guarda a
///         recompensa (em tokens COOK) proposta pelo criador, recebe receitas,
///         contabiliza votos e paga a recompensa à receita mais votada quando é
///         encerrado.
contract Challenge {
    using SafeERC20 for IERC20;

    // ------------------------------------------------------------------
    // Constantes
    // ------------------------------------------------------------------
    uint8 public constant MAX_VOTES_PER_USER = 2;
    uint256 public constant MAX_RECIPES = 100;
    uint256 public constant MAX_RECIPE_NAME_LENGTH = 120;

    // ------------------------------------------------------------------
    // Tipos
    // ------------------------------------------------------------------
    struct Recipe {
        uint256 id;
        address author;
        string name;
        uint256 votes;
        uint256 submittedAt;
    }

    struct Summary {
        uint256 id;
        address challenge;
        address creator;
        string name;
        uint256 reward;
        uint256 createdAt;
        uint256 deadline;
        bool finalized;
        bool closedEarly;
        bool hasWinner;
        address winner;
        uint256 winningRecipeId;
        uint256 recipeCount;
        uint256 totalVotes;
    }

    // ------------------------------------------------------------------
    // Estado
    // ------------------------------------------------------------------
    address public immutable factory;
    IERC20 public immutable rewardToken; // CookToken (COOK)
    address public immutable creator;
    uint256 public immutable challengeId;
    uint256 public immutable reward; // em COOK (18 casas decimais)
    uint256 public immutable createdAt;
    uint256 public immutable deadline;
    string public name;

    bool public finalized;
    bool public closedEarly;
    bool public hasWinner;
    address public winner;
    uint256 public winningRecipeId;
    uint256 public totalVotes;

    Recipe[] private recipes;
    mapping(address => uint8) public votesUsed;
    mapping(address => mapping(uint256 => bool)) public hasVotedFor;

    // ------------------------------------------------------------------
    // Eventos
    // ------------------------------------------------------------------
    event RecipeSubmitted(uint256 indexed recipeId, address indexed author, string name);
    event VoteCast(address indexed voter, uint256 indexed recipeId, uint256 newVoteCount, uint8 votesUsedByVoter);
    event ChallengeFinalized(
        address indexed winner,
        uint256 indexed winningRecipeId,
        bool hasWinner,
        uint256 reward,
        bool closedEarly
    );
    event RewardPaid(address indexed to, uint256 amount);

    // ------------------------------------------------------------------
    // Modifiers
    // ------------------------------------------------------------------
    modifier onlyCreator() {
        require(msg.sender == creator, "Apenas o criador do desafio");
        _;
    }

    modifier onlyOpen() {
        require(!finalized, "Desafio encerrado");
        require(block.timestamp < deadline, "Prazo do desafio expirou");
        _;
    }

    modifier notFinalized() {
        require(!finalized, "Desafio ja finalizado");
        _;
    }

    modifier onlyAfterDeadline() {
        require(block.timestamp >= deadline, "Desafio ainda em andamento");
        _;
    }

    modifier recipeExists(uint256 recipeId) {
        require(recipeId < recipes.length, "Receita inexistente");
        _;
    }

    modifier notOwnRecipe(uint256 recipeId) {
        require(recipes[recipeId].author != msg.sender, "Voce nao pode votar na propria receita");
        _;
    }

    modifier hasVotesLeft() {
        require(votesUsed[msg.sender] < MAX_VOTES_PER_USER, "Limite de 2 votos por desafio atingido");
        _;
    }

    modifier notVotedYet(uint256 recipeId) {
        require(!hasVotedFor[msg.sender][recipeId], "Voce ja votou nesta receita");
        _;
    }

    modifier validRecipeName(string calldata recipeName) {
        uint256 len = bytes(recipeName).length;
        require(len > 0, "Nome da receita obrigatorio");
        require(len <= MAX_RECIPE_NAME_LENGTH, "Nome da receita muito longo");
        _;
    }

    modifier hasRoomForRecipes() {
        require(recipes.length < MAX_RECIPES, "Limite de receitas atingido");
        _;
    }

    // ------------------------------------------------------------------
    // Construtor (chamado pela fábrica). Logo após criar o contrato, a fábrica
    // transfere `_reward` COOK do criador para cá.
    // ------------------------------------------------------------------
    constructor(
        uint256 _challengeId,
        string memory _name,
        address _creator,
        uint256 _deadline,
        IERC20 _rewardToken,
        uint256 _reward
    ) {
        require(_reward > 0, "Recompensa obrigatoria");
        require(_deadline > block.timestamp, "Prazo invalido");
        factory = msg.sender;
        challengeId = _challengeId;
        name = _name;
        creator = _creator;
        deadline = _deadline;
        createdAt = block.timestamp;
        rewardToken = _rewardToken;
        reward = _reward;
    }

    // ------------------------------------------------------------------
    // Ações
    // ------------------------------------------------------------------

    /// @notice Envia uma receita para o desafio.
    function submitRecipe(string calldata recipeName)
        external
        onlyOpen
        validRecipeName(recipeName)
        hasRoomForRecipes
        returns (uint256 recipeId)
    {
        recipeId = recipes.length;
        recipes.push(
            Recipe({
                id: recipeId,
                author: msg.sender,
                name: recipeName,
                votes: 0,
                submittedAt: block.timestamp
            })
        );
        emit RecipeSubmitted(recipeId, msg.sender, recipeName);
    }

    /// @notice Vota em uma receita. Cada carteira tem até 2 votos por desafio,
    ///         não pode votar na própria receita nem duas vezes na mesma.
    function vote(uint256 recipeId)
        external
        onlyOpen
        recipeExists(recipeId)
        notOwnRecipe(recipeId)
        hasVotesLeft
        notVotedYet(recipeId)
    {
        hasVotedFor[msg.sender][recipeId] = true;
        votesUsed[msg.sender] += 1;
        recipes[recipeId].votes += 1;
        totalVotes += 1;
        emit VoteCast(msg.sender, recipeId, recipes[recipeId].votes, votesUsed[msg.sender]);
    }

    /// @notice O criador pode encerrar o desafio a qualquer momento.
    function close() external onlyCreator notFinalized {
        _finalize(block.timestamp < deadline);
    }

    /// @notice Depois do prazo, qualquer pessoa (inclusive a fábrica) pode
    ///         finalizar o desafio e liberar a recompensa.
    function finalize() external notFinalized onlyAfterDeadline {
        _finalize(false);
    }

    // ------------------------------------------------------------------
    // Leitura
    // ------------------------------------------------------------------
    function isOpen() public view returns (bool) {
        return !finalized && block.timestamp < deadline;
    }

    function recipeCount() external view returns (uint256) {
        return recipes.length;
    }

    function getRecipe(uint256 recipeId) external view recipeExists(recipeId) returns (Recipe memory) {
        return recipes[recipeId];
    }

    function getRecipes() external view returns (Recipe[] memory) {
        return recipes;
    }

    function remainingVotes(address user) external view returns (uint8) {
        return MAX_VOTES_PER_USER - votesUsed[user];
    }

    function getSummary() external view returns (Summary memory) {
        return Summary({
            id: challengeId,
            challenge: address(this),
            creator: creator,
            name: name,
            reward: reward,
            createdAt: createdAt,
            deadline: deadline,
            finalized: finalized,
            closedEarly: closedEarly,
            hasWinner: hasWinner,
            winner: winner,
            winningRecipeId: winningRecipeId,
            recipeCount: recipes.length,
            totalVotes: totalVotes
        });
    }

    // ------------------------------------------------------------------
    // Internos
    // ------------------------------------------------------------------

    /// @dev Vence a receita com mais votos; em caso de empate, vence a que foi
    ///      enviada primeiro. Sem votos, a recompensa volta para o criador.
    function _finalize(bool early) private {
        finalized = true;
        closedEarly = early;

        uint256 bestVotes = 0;
        uint256 bestId = 0;
        for (uint256 i = 0; i < recipes.length; i++) {
            if (recipes[i].votes > bestVotes) {
                bestVotes = recipes[i].votes;
                bestId = i;
            }
        }

        address recipient;
        if (bestVotes > 0) {
            hasWinner = true;
            winner = recipes[bestId].author;
            winningRecipeId = bestId;
            recipient = winner;
        } else {
            recipient = creator;
        }

        emit ChallengeFinalized(winner, winningRecipeId, hasWinner, reward, early);

        // Avisa a fábrica (atualiza o ranking global)
        ICookoffFactory(factory).onChallengeFinalized(winner, hasWinner ? reward : 0);

        // Paga a recompensa em COOK (ou devolve ao criador). Interação externa
        // por último, depois de todo o estado atualizado.
        rewardToken.safeTransfer(recipient, reward);
        emit RewardPaid(recipient, reward);
    }
}
