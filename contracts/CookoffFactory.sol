// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./Challenge.sol";

/// @title CookoffFactory — contrato principal do COOKOFF
/// @notice Funciona como Contract Factory: cada chamada a createChallenge()
///         implanta um novo contrato Challenge e transfere para ele a recompensa
///         em tokens COOK (CookToken) do criador.
///         A fábrica também interage com os desafios criados (finalizeChallenge,
///         getChallengeSummary) e recebe deles a notificação de encerramento
///         para manter um ranking global de chefs.
contract CookoffFactory {
    using SafeERC20 for IERC20;

    // ------------------------------------------------------------------
    // Constantes
    // ------------------------------------------------------------------
    uint256 public constant MIN_DURATION = 1 minutes;
    uint256 public constant MAX_DURATION = 30 days;
    uint256 public constant MIN_NAME_LENGTH = 8; // "Desafio" + ao menos 1 caractere
    uint256 public constant MAX_NAME_LENGTH = 80;

    // ------------------------------------------------------------------
    // Estado
    // ------------------------------------------------------------------
    IERC20 public immutable rewardToken; // CookToken (COOK)
    Challenge[] public challenges;
    mapping(address => uint256) private challengeIdPlusOne; // 0 = não é um desafio desta fábrica
    mapping(address => uint256[]) private challengesByCreator;

    mapping(address => uint256) public winsOf;
    mapping(address => uint256) public earningsOf;
    uint256 public totalRewardsDistributed;

    // ------------------------------------------------------------------
    // Eventos
    // ------------------------------------------------------------------
    event ChallengeCreated(
        uint256 indexed challengeId,
        address indexed challenge,
        address indexed creator,
        string name,
        uint256 reward,
        uint256 deadline
    );
    event ChallengeFinalized(
        uint256 indexed challengeId,
        address indexed challenge,
        address indexed winner,
        uint256 reward
    );

    // ------------------------------------------------------------------
    // Modifiers
    // ------------------------------------------------------------------
    modifier validChallengeName(string calldata challengeName) {
        uint256 len = bytes(challengeName).length;
        require(len >= MIN_NAME_LENGTH, "Nome do desafio muito curto");
        require(len <= MAX_NAME_LENGTH, "Nome do desafio muito longo");
        require(_containsDesafio(bytes(challengeName)), "O nome deve conter a palavra 'Desafio'");
        _;
    }

    modifier withReward(uint256 reward) {
        require(reward > 0, "Informe uma recompensa em COOK");
        _;
    }

    /// @dev Confere saldo e autorização (approve) antes de tentar transferir,
    ///      para devolver uma mensagem clara em vez do erro genérico do ERC-20.
    modifier canFundReward(uint256 reward) {
        require(rewardToken.balanceOf(msg.sender) >= reward, "Saldo de COOK insuficiente");
        require(
            rewardToken.allowance(msg.sender, address(this)) >= reward,
            "Autorize a fabrica a usar seus COOK (approve)"
        );
        _;
    }

    modifier validDuration(uint256 duration) {
        require(duration >= MIN_DURATION, "Duracao minima de 1 minuto");
        require(duration <= MAX_DURATION, "Duracao maxima de 30 dias");
        _;
    }

    modifier challengeExists(uint256 challengeId) {
        require(challengeId < challenges.length, "Desafio inexistente");
        _;
    }

    /// @dev Só contratos Challenge implantados por esta fábrica podem chamar.
    modifier onlyChallenge() {
        require(challengeIdPlusOne[msg.sender] != 0, "Apenas desafios desta fabrica");
        _;
    }

    constructor(IERC20 _rewardToken) {
        rewardToken = _rewardToken;
    }

    // ------------------------------------------------------------------
    // Factory
    // ------------------------------------------------------------------

    /// @notice Cria um novo desafio. `reward` COOK saem da carteira do criador e
    ///         ficam guardados no contrato do desafio até o encerramento.
    ///         Antes, o criador precisa chamar rewardToken.approve(fabrica, reward).
    /// @param challengeName nome do desafio (deve conter "Desafio")
    /// @param duration duração em segundos até o encerramento automático
    /// @param reward recompensa em COOK (com 18 casas decimais)
    function createChallenge(string calldata challengeName, uint256 duration, uint256 reward)
        external
        validChallengeName(challengeName)
        withReward(reward)
        validDuration(duration)
        canFundReward(reward)
        returns (uint256 challengeId, address challengeAddress)
    {
        // O corpo fica numa função privada: os argumentos dos 4 modifiers também
        // ocupam a pilha da EVM (limite de 16 posições) e estourariam o limite
        // ("stack too deep") se toda a lógica ficasse aqui.
        return _createChallenge(challengeName, block.timestamp + duration, reward);
    }

    function _createChallenge(string calldata challengeName, uint256 deadline, uint256 reward)
        private
        returns (uint256 challengeId, address challengeAddress)
    {
        challengeId = challenges.length;

        Challenge challenge = new Challenge(challengeId, challengeName, msg.sender, deadline, rewardToken, reward);
        challengeAddress = address(challenge);

        challenges.push(challenge);
        challengeIdPlusOne[challengeAddress] = challengeId + 1;
        challengesByCreator[msg.sender].push(challengeId);

        // Move a recompensa: criador -> contrato do desafio (usa o approve)
        rewardToken.safeTransferFrom(msg.sender, challengeAddress, reward);

        emit ChallengeCreated(challengeId, challengeAddress, msg.sender, challengeName, reward, deadline);
    }

    // ------------------------------------------------------------------
    // Interação com os contratos criados
    // ------------------------------------------------------------------

    /// @notice Finaliza um desafio cujo prazo terminou (qualquer um pode chamar).
    ///         A fábrica chama Challenge.finalize() no contrato filho.
    function finalizeChallenge(uint256 challengeId) external challengeExists(challengeId) {
        challenges[challengeId].finalize();
    }

    /// @notice Lê o resumo de um desafio chamando o contrato filho.
    function getChallengeSummary(uint256 challengeId)
        external
        view
        challengeExists(challengeId)
        returns (Challenge.Summary memory)
    {
        return challenges[challengeId].getSummary();
    }

    /// @notice Resumo de todos os desafios (uma chamada a cada contrato filho).
    function getAllSummaries() external view returns (Challenge.Summary[] memory list) {
        list = new Challenge.Summary[](challenges.length);
        for (uint256 i = 0; i < challenges.length; i++) {
            list[i] = challenges[i].getSummary();
        }
    }

    /// @notice Callback chamado por um Challenge quando é finalizado.
    function onChallengeFinalized(address winner, uint256 reward) external onlyChallenge {
        uint256 challengeId = challengeIdPlusOne[msg.sender] - 1;
        if (winner != address(0)) {
            winsOf[winner] += 1;
            earningsOf[winner] += reward;
            totalRewardsDistributed += reward;
        }
        emit ChallengeFinalized(challengeId, msg.sender, winner, reward);
    }

    // ------------------------------------------------------------------
    // Leitura
    // ------------------------------------------------------------------
    function challengeCount() external view returns (uint256) {
        return challenges.length;
    }

    function getChallenges() external view returns (Challenge[] memory) {
        return challenges;
    }

    function getChallengesByCreator(address creator) external view returns (uint256[] memory) {
        return challengesByCreator[creator];
    }

    function isChallenge(address addr) external view returns (bool) {
        return challengeIdPlusOne[addr] != 0;
    }

    // ------------------------------------------------------------------
    // Internos
    // ------------------------------------------------------------------

    /// @dev Procura "desafio" no nome sem diferenciar maiúsculas/minúsculas (ASCII).
    function _containsDesafio(bytes memory str) private pure returns (bool) {
        bytes memory word = "desafio";
        if (str.length < word.length) return false;
        for (uint256 i = 0; i <= str.length - word.length; i++) {
            bool matchFound = true;
            for (uint256 j = 0; j < word.length; j++) {
                bytes1 c = str[i + j];
                if (c >= 0x41 && c <= 0x5A) c = bytes1(uint8(c) + 32); // A-Z -> a-z
                if (c != word[j]) {
                    matchFound = false;
                    break;
                }
            }
            if (matchFound) return true;
        }
        return false;
    }
}
