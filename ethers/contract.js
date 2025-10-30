/*
  Deploy a minimal ERC20 (USDT-like) token.
  Env vars:
    - RPC_URL (default: http://localhost:8545)
    - PRIVATE_KEY (required)
    - TOKEN_NAME (default: Tether USD)
    - TOKEN_SYMBOL (default: USDT)
    - DECIMALS (default: 6)
    - INITIAL_SUPPLY (default: 100000000)  // whole tokens; will be scaled by 10^decimals
*/

require("dotenv").config();
const { ethers } = require("ethers");
const solc = require("solc");

const RPC_URL = process.env.RPC_URL || "http://localhost:8545";
const PRIVATE_KEY = (process.env.PRIVATE_KEY || "").trim();
const TOKEN_NAME = process.env.TOKEN_NAME || "Tether USD";
const TOKEN_SYMBOL = process.env.TOKEN_SYMBOL || "USDT";
const DECIMALS = parseInt(process.env.DECIMALS || "6", 10);
const INITIAL_SUPPLY = process.env.INITIAL_SUPPLY || "100000000"; // 100M

if (!PRIVATE_KEY) {
  console.error("Missing PRIVATE_KEY env var.");
  process.exit(1);
}

const SOLC_VERSION = process.env.SOLC_VERSION || "v0.8.20+commit.a1b79de6"; // Shanghai-capable

const source = `// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

contract USDTLike {
    string public name;
    string public symbol;
    uint8 public immutable decimals;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory _name, string memory _symbol, uint8 _decimals, uint256 initialSupply) {
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
        totalSupply = initialSupply;
        balanceOf[msg.sender] = initialSupply;
        emit Transfer(address(0), msg.sender, initialSupply);
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(to != address(0), "to=0");
        uint256 bal = balanceOf[from];
        require(bal >= amount, "insufficient");
        unchecked { balanceOf[from] = bal - amount; }
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "allowance");
        if (allowed != type(uint256).max) {
            unchecked { allowance[from][msg.sender] = allowed - amount; }
        }
        _transfer(from, to, amount);
        return true;
    }
}
`;

function compile(solcInstance) {
  const input = {
    language: "Solidity",
    sources: { "USDTLike.sol": { content: source } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "shanghai",
      outputSelection: { "*": { "*": ["abi", "evm.bytecode"] } }
    }
  };
  const output = JSON.parse(solcInstance.compile(JSON.stringify(input)));
  if (output.errors && output.errors.length) {
    for (const e of output.errors) console.error(e.formattedMessage || e.message || e);
  }
  const fileContracts = output.contracts && output.contracts["USDTLike.sol"];
  const contract = fileContracts && fileContracts["USDTLike"];
  if (!contract || !contract.evm || !contract.evm.bytecode || !contract.evm.bytecode.object) {
    console.error("Compilation failed:", output);
    process.exit(1);
  }
  return { abi: contract.abi, bytecode: "0x" + contract.evm.bytecode.object };
}

async function main() {
  const solcInstance = await new Promise((resolve, reject) => {
    solc.loadRemoteVersion(SOLC_VERSION, (err, solcSpecific) => {
      if (err) return reject(err);
      resolve(solcSpecific);
    });
  });
  const { abi, bytecode } = compile(solcInstance);
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY.startsWith("0x") ? PRIVATE_KEY : `0x${PRIVATE_KEY}`, provider);

  const initial = ethers.parseUnits(INITIAL_SUPPLY, DECIMALS);
  console.log("RPC:", RPC_URL);
  console.log("Deployer:", await wallet.getAddress());
  console.log("Token:", TOKEN_NAME, TOKEN_SYMBOL, `decimals=${DECIMALS}`, "initial:", INITIAL_SUPPLY);

  const factory = new ethers.ContractFactory(abi, bytecode, wallet);
  const unsigned = await factory.getDeployTransaction(TOKEN_NAME, TOKEN_SYMBOL, DECIMALS, initial);
  const feeData = await provider.getFeeData();
  const tx = {
    ...unsigned,
    gasLimit: unsigned.gasLimit ?? 6_000_000,
    maxFeePerGas: feeData.maxFeePerGas || 1n * 10n ** 9n,
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || 1n * 10n ** 9n,
  };
  const sent = await wallet.sendTransaction(tx);
  console.log("Deploy tx:", sent.hash);
  const rec = await sent.wait();
  const addr = ethers.getAddress(rec.contractAddress);
  console.log("Deployed at:", addr);
}

main().catch((e) => {
    for (const error of e) {
        console.error(e);
        process.exit(1);
    }
    process.exit(1);
});


