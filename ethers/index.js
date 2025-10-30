/*
  Node.js script with 2 stages:
  1) Generate N private keys, transfer FUND_AMOUNT_ETH from main account to each (sequential).
  2) Using those N keys, run N parallel workers that continuously transfer WORKER_AMOUNT_ETH to random addresses.

  Env vars:
    - RPC_URL (default: http://localhost:8545)
    - PRIVATE_KEY (hex, with or without 0x)  // main funding account
    - NUM_KEYS (default: 20)
    - FUND_AMOUNT_ETH (default: 100)
    - WORKER_AMOUNT_ETH (default: 0.0001)
    - WORKER_INTERVAL_MS (default: 2000)
*/

require("dotenv").config();
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

const RPC_URL = process.env.RPC_URL || "http://localhost:8545";
const PRIVATE_KEY = (process.env.PRIVATE_KEY || "").trim();
const NUM_KEYS = parseInt(process.env.NUM_KEYS || "200", 10);
const FUND_AMOUNT_ETH = process.env.FUND_AMOUNT_ETH || "400";
const WORKER_AMOUNT_ETH = process.env.WORKER_AMOUNT_ETH || "0.0001";
const WORKER_INTERVAL_MS = parseInt(process.env.WORKER_INTERVAL_MS || "2000", 10);

if (!PRIVATE_KEY) {
  console.error("Missing PRIVATE_KEY env var. Export your signer private key.");
  process.exit(1);
}

function randomAddress() {
  return ethers.Wallet.createRandom().address;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function sendWithFees(wallet, txBase, provider, headroom = 50000n) {
  const gas = await provider.estimateGas({ ...txBase, from: wallet.address });
  const feeData = await provider.getFeeData();
  const maxFee = feeData.maxFeePerGas || 1n * 10n ** 9n;
  const maxPrio = feeData.maxPriorityFeePerGas || 1n * 10n ** 9n;
  const finalTx = {
    ...txBase,
    gasLimit: gas + headroom,
    maxFeePerGas: maxFee,
    maxPriorityFeePerGas: maxPrio,
  };
  const sent = await wallet.sendTransaction(finalTx);
  const rec = await sent.wait();
  return { sent, rec };
}

async function fundStage(provider, funderWallet, keys) {
  console.log(`Stage 1: funding ${keys.length} accounts with ${FUND_AMOUNT_ETH} ETH each...`);
  const amountWei = ethers.parseEther(FUND_AMOUNT_ETH);
  for (let i = 0; i < keys.length; i++) {
    const to = keys[i].address;
    try {
      const base = { to, value: amountWei };
      const { sent, rec } = await sendWithFees(funderWallet, base, provider);
      console.log(`[funded ${i + 1}/${keys.length}] to=${to} hash=${sent.hash} block=${rec.blockNumber}`);
    } catch (err) {
      console.error(`[fund-error ${i + 1}/${keys.length}] to=${to}`, err.shortMessage || err.message || err);
      throw err;
    }
  }
}

async function workerLoop(workerIdx, wallet, provider, amountWei) {
  console.log(`[worker ${workerIdx}] start from ${wallet.address}`);
  while (true) {
    try {
      const to = randomAddress();
      const base = { to, value: amountWei };
      const { sent, rec } = await sendWithFees(wallet, base, provider, 30000n);
      console.log(`[worker ${workerIdx}] sent=${sent.hash} to=${to} block=${rec.blockNumber}`);
    } catch (err) {
      console.error(`[worker ${workerIdx}] error`, err.shortMessage || err.message || err);
    }
    await sleep(WORKER_INTERVAL_MS);
  }
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const funder = new ethers.Wallet(PRIVATE_KEY.startsWith("0x") ? PRIVATE_KEY : `0x${PRIVATE_KEY}`, provider);

  console.log("RPC:", RPC_URL);
  console.log("Main account:", await funder.getAddress());
  console.log("NUM_KEYS:", NUM_KEYS);
  console.log("FUND_AMOUNT_ETH:", FUND_AMOUNT_ETH);
  console.log("WORKER_AMOUNT_ETH:", WORKER_AMOUNT_ETH);
  console.log("WORKER_INTERVAL_MS:", WORKER_INTERVAL_MS, "ms");

  // Stage 1: generate wallets and fund them
  const generated = Array.from({ length: NUM_KEYS }, () => ethers.Wallet.createRandom());
  const generatedInfo = generated.map((w, idx) => ({
    index: idx,
    address: w.address,
    privateKey: w.privateKey,
  }));

  // Persist keys for reference
  const outPath = path.resolve(__dirname, "generated-accounts.json");
  fs.writeFileSync(outPath, JSON.stringify(generatedInfo, null, 2));
  console.log(`Generated ${NUM_KEYS} accounts -> ${outPath}`);

  await fundStage(provider, funder, generated);

  // Stage 2: start workers in parallel
  console.log("Stage 2: starting workers...");
  const amountWei = ethers.parseEther(WORKER_AMOUNT_ETH);
  const workers = generated.map((w, idx) => new ethers.Wallet(w.privateKey, provider))
    .map((w, idx) => workerLoop(idx + 1, w, provider, amountWei));

  // run forever
  await Promise.all(workers);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});