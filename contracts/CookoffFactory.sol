// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./Challenge.sol";

/// @title CookoffFactory — contrato principal do COOKOFF
/// @notice Funciona como Contract Factory: cada chamada a createChallenge()
///         implanta um novo contrato Challenge, repassando a recompensa em ETH.
///         A fábrica também interage com os desafios criados (finalizeChallenge,
///         getChallengeSummary) e recebe deles a notificação de encerramento
///         para manter um ranking global de chefs.
contract CookoffFactory {
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

    modifier withReward() {
        require(msg.value > 0, "Informe uma recompensa em ETH");
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

    // ------------------------------------------------------------------
    // Factory
    // ------------------------------------------------------------------

    /// @notice Cria um novo desafio. O ETH enviado vira a recompensa do vencedor.
    /// @param challengeName nome do desafio (deve conter "Desafio")
    /// @param duration duração em segundos até o encerramento automático
    function createChallenge(string calldata challengeName, uint256 duration)
        external
        payable
        validChallengeName(challengeName)
        withReward
        validDuration(duration)
        returns (uint256 challengeId, address challengeAddress)
    {
        challengeId = challenges.length;
        uint256 deadline = block.timestamp + duration;

        Challenge challenge = new Challenge{value: msg.value}(
            challengeId,
            challengeName,
            msg.sender,
            deadline
        );
        challengeAddress = address(challenge);

        challenges.push(challenge);
        challengeIdPlusOne[challengeAddress] = challengeId + 1;
        challengesByCreator[msg.sender].push(challengeId);

        emit ChallengeCreated(challengeId, challengeAddress, msg.sender, challengeName, msg.value, deadline);
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
