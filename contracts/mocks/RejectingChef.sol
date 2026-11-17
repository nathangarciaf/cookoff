// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../Challenge.sol";

/// @dev Contrato usado apenas nos testes: participa de um desafio mas rejeita
///      ETH até que `accept` seja ligado, para testar o fluxo de saque pendente.
contract RejectingChef {
    bool public accept;

    function setAccept(bool value) external {
        accept = value;
    }

    function submit(Challenge challenge, string calldata recipeName) external {
        challenge.submitRecipe(recipeName);
    }

    function withdrawFrom(Challenge challenge) external {
        challenge.withdraw();
    }

    receive() external payable {
        require(accept, "Nao aceito ETH");
    }
}
