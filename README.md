## RinChain: Private Go-Ethereum (Clique) + Blockscout

This repo runs a single-validator private chain (Clique PoA) with geth and a Blockscout explorer via Docker.

### Prerequisites
- Docker Desktop (or Docker Engine)
- bash, sed

### Quick Start
1) Create a signer account (writes keystore into `geth/data` and `.env`):

```bash
bash scripts/create_signer.sh
```

2) Build `geth/genesis.json` using the signer from `.env`:

```bash
bash scripts/build_genesis.sh
```

3) Start the stack:

```bash
docker compose up -d --build
```

4) Open Blockscout at:
- http://localhost:4000

5) JSON-RPC (geth):
- HTTP: http://localhost:8545
- WS:   ws://localhost:8546

### What gets created
- `geth/data/` — geth datadir with keystore and chain data
- `geth/genesis.json` — finalized genesis with your signer in Clique `extraData`
- `.env` — contains `CHAIN_ID`, `CLIQUE_SIGNER_ADDRESS`, and defaults for Blockscout
- `blockscout.env` — environment for Blockscout container

### Customization
- Change `CHAIN_ID` in `.env` before building `genesis.json`.
- Prefund additional accounts by adding them under `alloc` in `geth/genesis.template.json` and re-running step 2.

### Useful geth commands (inside the container)
Attach console:

```bash
docker exec -it rin-geth geth attach http://localhost:8545
```

Send test tx via curl:

```bash
curl -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
  http://localhost:8545
```

### Notes
- This setup runs a single miner with `--allow-insecure-unlock` for local development only. Do not use in production.
- Blockscout indexing may take a minute after first launch.


# Rin-Chain-GoEthereum
