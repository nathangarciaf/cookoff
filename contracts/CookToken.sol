// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title CookToken (COOK) — moeda interna do COOKOFF
/// @notice Token ERC-20 usado nas recompensas dos desafios, para que ninguém
///         precise arriscar ETH no jogo. Há duas formas de obter COOK:
///           1. claimWelcomeBonus(): bônus gratuito, uma vez por carteira,
///              resgatado ao entrar no sistema ("login");
///           2. buyTokens(): troca uma quantia pequena de ETH por muitos COOK
///              (1 ETH = 1.000.000 COOK → 0,001 ETH = 1.000 COOK).
///         Os tokens são criados (mint) na hora; não existe estoque prévio.
contract CookToken is ERC20, Ownable {
    uint256 public constant WELCOME_BONUS = 100 * 1e18; // 100 COOK
    uint256 public constant TOKENS_PER_ETH = 1_000_000; // 1 ETH -> 1.000.000 COOK

    mapping(address => bool) public hasClaimedBonus;

    event WelcomeBonusClaimed(address indexed user, uint256 amount);
    event TokensPurchased(address indexed buyer, uint256 ethPaid, uint256 tokensMinted);
    event EthWithdrawn(address indexed to, uint256 amount);

    modifier bonusNotClaimed() {
        require(!hasClaimedBonus[msg.sender], "Bonus de boas-vindas ja resgatado");
        _;
    }

    modifier withEth() {
        require(msg.value > 0, "Envie ETH para comprar COOK");
        _;
    }

    constructor() ERC20("CookCoin", "COOK") Ownable(msg.sender) {}

    /// @notice Bônus de boas-vindas: 100 COOK grátis, uma única vez por carteira.
    function claimWelcomeBonus() external bonusNotClaimed {
        hasClaimedBonus[msg.sender] = true;
        _mint(msg.sender, WELCOME_BONUS);
        emit WelcomeBonusClaimed(msg.sender, WELCOME_BONUS);
    }

    /// @notice Compra COOK com ETH à taxa fixa TOKENS_PER_ETH.
    function buyTokens() external payable withEth returns (uint256 amount) {
        amount = msg.value * TOKENS_PER_ETH; // ambos com 18 casas decimais
        _mint(msg.sender, amount);
        emit TokensPurchased(msg.sender, msg.value, amount);
    }

    /// @notice Quanto COOK um valor em ETH (wei) compra.
    function quote(uint256 weiAmount) external pure returns (uint256) {
        return weiAmount * TOKENS_PER_ETH;
    }

    /// @notice O dono do token retira o ETH arrecadado nas vendas.
    function withdrawEth(address payable to) external onlyOwner {
        uint256 amount = address(this).balance;
        require(amount > 0, "Sem ETH para retirar");
        (bool ok, ) = to.call{value: amount}("");
        require(ok, "Falha ao enviar ETH");
        emit EthWithdrawn(to, amount);
    }
}
