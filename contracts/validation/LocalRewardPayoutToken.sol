// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract LocalRewardPayoutToken {
  mapping(address => uint256) public balanceOf;
  uint256 public totalSupply;

  event Transfer(address indexed from, address indexed to, uint256 value);

  constructor(address initialHolder, uint256 initialSupply) {
    require(initialHolder != address(0), "ERC20: initial holder is the zero address");
    require(initialSupply > 0, "ERC20: initial supply is zero");

    balanceOf[initialHolder] = initialSupply;
    totalSupply = initialSupply;
    emit Transfer(address(0), initialHolder, initialSupply);
  }

  function name() external pure returns (string memory) {
    return "USDC";
  }

  function symbol() external pure returns (string memory) {
    return "USDC";
  }

  function decimals() external pure returns (uint8) {
    return 18;
  }

  function transfer(address to, uint256 amount) external returns (bool) {
    address owner = msg.sender;
    uint256 currentBalance = balanceOf[owner];
    require(currentBalance >= amount, "ERC20: transfer amount exceeds balance");

    unchecked {
      balanceOf[owner] = currentBalance - amount;
    }

    balanceOf[to] += amount;
    emit Transfer(owner, to, amount);
    return true;
  }
}
