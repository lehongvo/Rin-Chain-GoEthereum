/*
  Node.js script: continuously transfer ETH to random addresses on the local chain.
  Env vars:
    - RPC_URL (default: http://localhost:8545)
    - PRIVATE_KEY (hex, with or without 0x)
    - AMOUNT_ETH (default: 0.001)
    - INTERVAL_MS (default: 2000)
*/

require("dotenv").config();
const { ethers } = require("ethers");

const RPC_URL = process.env.RPC_URL || "http://localhost:8545";
const PRIVATE_KEY = (process.env.PRIVATE_KEY || "").trim();
const AMOUNT_ETH = process.env.AMOUNT_ETH || "0.001";
const INTERVAL_MS = parseInt(process.env.INTERVAL_MS || "2000", 10);

if (!PRIVATE_KEY) {
  console.error("Missing PRIVATE_KEY env var. Export your signer private key.");
  process.exit(1);
}

function randomAddress() {
  // Generate a random valid checksummed address
  return ethers.Wallet.createRandom().address;
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY.startsWith("0x") ? PRIVATE_KEY : `0x${PRIVATE_KEY}`, provider);

  console.log("RPC:", RPC_URL);
  console.log("From:", await wallet.getAddress());
  console.log("Amount:", AMOUNT_ETH, "ETH");
  console.log("Interval:", INTERVAL_MS, "ms");

  const amountWei = ethers.parseEther(AMOUNT_ETH);

  let running = true;
  process.on("SIGINT", () => { running = false; console.log("\nStopping..."); });

  while (running) {
    try {
      const to = randomAddress();
      const nonce = await provider.getTransactionCount(wallet.address);

      const tx = {
        to,
        value: amountWei,
        nonce,
      };

      // Optional: estimate gas and set gas limit with some headroom
      const gas = await provider.estimateGas({ ...tx, from: wallet.address });
      const feeData = await provider.getFeeData();

      const finalTx = {
        ...tx,
        gasLimit: gas + 50000n,
        maxFeePerGas: feeData.maxFeePerGas || 1n * 10n ** 9n,
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || 1n * 10n ** 9n,
      };

      const sent = await wallet.sendTransaction(finalTx);
      console.log(`[sent] to=${to} hash=${sent.hash}`);
      const rec = await sent.wait();
      console.log(`[mined] block=${rec.blockNumber} gasUsed=${rec.gasUsed}`);
    } catch (err) {
      console.error("[error]", err.shortMessage || err.message || err);
    }

    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


